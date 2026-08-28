import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop } from "@/lib/agents/claude";
import { qaAgentPreamble } from "./systemPrompt";
import {
  combineTools,
  automationActionTool,
  getDomTool,
  getRequirementTextTool,
  searchCodebaseTool,
  updateIssueTagTool,
  logEventTool,
  type QaAgentContext,
} from "./tools";
import { createBridgeSession, closeBridgeSession, BridgeUnavailableError } from "@/lib/bridge/client";
import { logEvent } from "@/lib/agents/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordApiUsage } from "@/lib/agents/usageTracking";
import type { Issue, Module, Project } from "@/lib/types/database";

const recordTriageResultTool: Anthropic.Tool = {
  name: "record_triage_result",
  description: "Finish triage. You must have already called update_issue_tag before this.",
  input_schema: {
    type: "object",
    properties: { summary: { type: "string" } },
  },
};

// REQ-050: reproduce (if possible) -> cross-reference the requirements doc
// -> optionally read code -> classify into exactly one of bug / not_a_bug /
// approval, with reasoning logged at every step.
export async function triageIssue(
  project: Project,
  module: Module,
  issue: Issue
): Promise<void> {
  const supabase = createAdminClient();
  await logEvent(
    supabase,
    project.company_id,
    "issue_triage", issue.id, `Starting triage: ${issue.title}`, "info");

  let bridgeSessionId: string | undefined;
  try {
    bridgeSessionId = await createBridgeSession(project);
  } catch (err) {
    const message = err instanceof BridgeUnavailableError ? err.message : String(err);
    await logEvent(
    supabase,
    project.company_id,
    "issue_triage",
      issue.id,
      `Automation bridge unavailable, proceeding with doc/code review only: ${message}`,
      "info"
    );
  }

  const ctx: QaAgentContext = {
    supabase,
    project,
    module,
    runType: "issue_triage",
    runId: issue.id,
    bridgeSessionId,
  };

  const toolEntries = [
    getRequirementTextTool(ctx),
    searchCodebaseTool(ctx),
    updateIssueTagTool(ctx),
    logEventTool(ctx),
  ];
  if (bridgeSessionId) {
    toolEntries.push(automationActionTool(ctx), getDomTool(ctx));
  }
  const { tools, executors } = combineTools(toolEntries);

  const result = await runAgentLoop({
    task: "issue_triage",
    systemPrompt: qaAgentPreamble(project),
    tools: [...tools, recordTriageResultTool],
    toolExecutors: { ...executors, record_triage_result: async () => "ok" },
    finishTools: ["record_triage_result"],
    initialMessages: [
      {
        role: "user",
        content: `Triage this reported issue.

Issue ID: ${issue.id}
Title: ${issue.title}
Description: ${issue.description ?? "(none)"}
Reproduction steps provided: ${
          issue.reproduction_steps.length
            ? issue.reproduction_steps.join("; ")
            : "(none provided — infer reasonable steps from the description and module context)"
        }

Steps:
1. ${bridgeSessionId ? "Attempt to reproduce via automation_action, following the reproduction steps or your best inference." : "Automation bridge is unavailable — rely on the requirements doc and code; if you can't confirm reproduction, that alone can justify tagging 'approval'."}
2. Use get_requirement_text to check what the module's requirements doc says about this behavior.
3. If the doc doesn't resolve it, use search_codebase.
4. Call update_issue_tag with issue_id EXACTLY "${issue.id}" (copy it verbatim — do not use the title) and tag set to EXACTLY one of: 'bug' (reproducible, contradicts the documented/expected behavior), 'not_a_bug' (reproducible but matches documented behavior — you MUST cite which requirement justifies this in tag_reasoning), or 'approval' (not reproducible, OR the requirements doc is silent/ambiguous on expected behavior). Issues tagged 'approval' require a human decision and must never be treated as a confirmed bug.
5. Call record_triage_result when done.`,
      },
    ],
    onUsage: (usage, model) =>
      recordApiUsage(supabase, {
        companyId: project.company_id,
        projectId: project.id,
        operation: "issue_triage",
        runId: issue.id,
        model,
        usage,
      }),
  });

  if (bridgeSessionId) {
    await closeBridgeSession(project, bridgeSessionId).catch(() => {});
  }

  if (result.status === "max_turns_exceeded") {
    await logEvent(
    supabase,
    project.company_id,
    "issue_triage",
      issue.id,
      "Triage hit the max-turn safety limit without a verdict.",
      "error"
    );
    await supabase
      .from("issues")
      .update({
        status: "triaged",
        tag: "approval",
        tag_reasoning: "Triage agent hit its turn limit before reaching a verdict — needs human review.",
      })
      .eq("id", issue.id);
    return;
  }

  const { data: refreshed } = await supabase.from("issues").select("tag").eq("id", issue.id).single();
  if (!refreshed?.tag) {
    await supabase
      .from("issues")
      .update({
        status: "triaged",
        tag: "approval",
        tag_reasoning: "Agent did not produce a clear classification — needs human review.",
      })
      .eq("id", issue.id);
  }

  await logEvent(
    supabase,
    project.company_id,
    "issue_triage", issue.id, "Triage complete.", "info");
}
