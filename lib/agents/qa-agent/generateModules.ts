import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop } from "@/lib/agents/claude";
import { readRequirementsDoc } from "@/lib/agents/requirements";
import { qaAgentPreamble } from "./systemPrompt";
import { createAdminClient } from "@/lib/supabase/admin";
import { coerceArrayField } from "@/lib/agents/parseAgentResult";
import { recordApiUsage } from "@/lib/agents/usageTracking";
import type { Project } from "@/lib/types/database";

const MAX_DOC_CHARS = 20000;

const submitModulesTool: Anthropic.Tool = {
  name: "submit_modules",
  description: "Submit the final structured list of modules extracted from the requirements doc.",
  input_schema: {
    type: "object",
    properties: {
      modules: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            requirement_ref: {
              type: "string",
              description: "Section id/heading in the source doc, e.g. '4.2' or 'Login Flow'.",
            },
          },
          required: ["name"],
        },
      },
    },
    required: ["modules"],
  },
};

// REQ-010: one-time/on-demand admin action — send the requirements doc to
// Claude, get back a structured module list, save it before showing the user.
export async function generateModules(
  project: Project
): Promise<{ inserted: number; skipped: number }> {
  const supabase = createAdminClient();
  const docText = await readRequirementsDoc(supabase, project.requirements_doc_ref);

  const result = await runAgentLoop({
    task: "module_sync",
    systemPrompt: qaAgentPreamble(project),
    tools: [submitModulesTool],
    toolExecutors: {
      submit_modules: async () => "ok", // the loop captures the input directly via finishTools
    },
    finishTools: ["submit_modules"],
    initialMessages: [
      {
        role: "user",
        content: `Here is the requirements doc for this project. Extract the distinct testable feature areas (modules) — each a coherent chunk of functionality a human QA tester would test as one unit. Call submit_modules when done.\n\n---\n${docText.slice(0, MAX_DOC_CHARS)}\n---`,
      },
    ],
    onUsage: (usage, model) =>
      recordApiUsage(supabase, {
        projectId: project.id,
        operation: "module_sync",
        model,
        usage,
      }),
  });

  if (result.status === "max_turns_exceeded") {
    throw new Error("Module sync exceeded the max-turn safety limit.");
  }
  if (!result.result) {
    throw new Error("Agent did not submit a module list.");
  }

  const rawResult = result.result as { modules?: unknown };
  const modules = coerceArrayField<{
    name: string;
    description?: string;
    requirement_ref?: string;
  }>(rawResult.modules, "modules");

  const { data: existing } = await supabase
    .from("modules")
    .select("name")
    .eq("project_id", project.id);
  const existingNames = new Set((existing ?? []).map((m) => m.name.toLowerCase()));

  const toInsert = modules.filter((m) => !existingNames.has(m.name.toLowerCase()));

  if (toInsert.length > 0) {
    await supabase.from("modules").insert(
      toInsert.map((m) => ({
        project_id: project.id,
        name: m.name,
        description: m.description ?? null,
        requirement_ref: m.requirement_ref ?? null,
      }))
    );
  }

  return { inserted: toInsert.length, skipped: modules.length - toInsert.length };
}
