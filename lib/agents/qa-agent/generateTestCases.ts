import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop } from "@/lib/agents/claude";
import { readRequirementsDoc, extractRequirementSection } from "@/lib/agents/requirements";
import { qaAgentPreamble } from "./systemPrompt";
import { combineTools, searchCodebaseTool, type QaAgentContext } from "./tools";
import { createAdminClient } from "@/lib/supabase/admin";
import { coerceArrayField } from "@/lib/agents/parseAgentResult";
import { recordApiUsage } from "@/lib/agents/usageTracking";
import type { Module, Project } from "@/lib/types/database";

const submitTestCasesTool: Anthropic.Tool = {
  name: "submit_test_cases",
  description: "Submit the final structured list of test cases for this module.",
  input_schema: {
    type: "object",
    properties: {
      test_cases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            scenario: {
              type: "string",
              description: "Plain-language steps the agent will follow when running this test.",
            },
            priority: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["title", "scenario", "priority"],
        },
      },
    },
    required: ["test_cases"],
  },
};

// REQ-012: covers both happy-path and edge cases. Saved before being shown
// to the user, who can then edit/delete via plain CRUD (no AI needed there).
export async function generateTestCases(
  project: Project,
  module: Module
): Promise<{ inserted: number }> {
  const supabase = createAdminClient();
  const docText = await readRequirementsDoc(supabase, project.requirements_doc_ref);
  const requirementText = extractRequirementSection(docText, module.requirement_ref);

  const ctx: QaAgentContext = { supabase, project, module };
  const { tools, executors } = combineTools([searchCodebaseTool(ctx)]);

  const result = await runAgentLoop({
    task: "test_case_generation",
    systemPrompt: qaAgentPreamble(project),
    tools: [...tools, submitTestCasesTool],
    toolExecutors: { ...executors, submit_test_cases: async () => "ok" },
    finishTools: ["submit_test_cases"],
    initialMessages: [
      {
        role: "user",
        content: `Module: "${module.name}"${module.description ? ` — ${module.description}` : ""}

Relevant requirement text:
---
${requirementText}
---

Generate test cases covering both happy-path and edge cases. Use search_codebase if you need to see how this feature is implemented before writing scenarios. Call submit_test_cases when done.`,
      },
    ],
    onUsage: (usage, model) =>
      recordApiUsage(supabase, {
        projectId: project.id,
        operation: "test_case_generation",
        runId: module.id,
        model,
        usage,
      }),
  });

  if (result.status === "max_turns_exceeded") {
    throw new Error("Test case generation exceeded the max-turn safety limit.");
  }
  if (!result.result) {
    throw new Error("Agent did not submit test cases.");
  }

  const rawResult = result.result as { test_cases?: unknown };
  const test_cases = coerceArrayField<{
    title: string;
    scenario: string;
    priority: "high" | "medium" | "low";
  }>(rawResult.test_cases, "test_cases");

  if (test_cases.length > 0) {
    await supabase.from("test_cases").insert(
      test_cases.map((tc) => ({
        module_id: module.id,
        title: tc.title,
        scenario: tc.scenario,
        priority: tc.priority,
        status: "not_run" as const,
      }))
    );
  }

  return { inserted: test_cases.length };
}
