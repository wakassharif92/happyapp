import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop } from "@/lib/agents/claude";
import { qaAgentPreamble } from "./systemPrompt";
import {
  combineTools,
  automationActionTool,
  getDomTool,
  logEventTool,
  type QaAgentContext,
} from "./tools";
import { createBridgeSession, closeBridgeSession, BridgeUnavailableError } from "@/lib/bridge/client";
import { logEvent } from "@/lib/agents/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordApiUsage } from "@/lib/agents/usageTracking";
import type { Issue, Module, Project } from "@/lib/types/database";

const recordVerifyResultTool: Anthropic.Tool = {
  name: "record_verify_result",
  description: "Report whether the original issue is now resolved.",
  input_schema: {
    type: "object",
    properties: {
      resolved: { type: "boolean" },
      notes: { type: "string" },
    },
    required: ["resolved"],
  },
};

// REQ-063: after a fix, re-run the original reproduction (or the original
// failing test case, if source = 'automated') and update status
// accordingly. Never silently loops — a failed re-verification reverts to
// 'triaged' with a note, surfaced on the issue detail page.
export async function verifyFix(project: Project, module: Module, issue: Issue): Promise<void> {
  const supabase = createAdminClient();
  const runId = issue.assigned_agent_run_id;
  if (!runId) throw new Error("Issue has no assigned_agent_run_id to log re-verification against.");

  await logEvent(
    supabase,
    project.company_id,
    "fix_run", runId, `Re-verifying "${issue.title}"…`, "info");

  let testCaseScenario: string | null = null;
  if (issue.test_case_id) {
    const { data: testCase } = await supabase
      .from("test_cases")
      .select("*")
      .eq("id", issue.test_case_id)
      .maybeSingle();
    if (testCase) testCaseScenario = testCase.scenario;
  }

  let bridgeSessionId: string;
  try {
    bridgeSessionId = await createBridgeSession(project);
  } catch (err) {
    const message = err instanceof BridgeUnavailableError ? err.message : String(err);
    await logEvent(
    supabase,
    project.company_id,
    "fix_run", runId, `Cannot re-verify — bridge unavailable: ${message}`, "error");
    return;
  }

  const ctx: QaAgentContext = {
    supabase,
    project,
    module,
    runType: "fix_run",
    runId,
    bridgeSessionId,
  };
  const { tools, executors } = combineTools([
    automationActionTool(ctx),
    getDomTool(ctx),
    logEventTool(ctx),
  ]);

  const steps = testCaseScenario ?? (issue.reproduction_steps.length ? issue.reproduction_steps.join("; ") : issue.description ?? issue.title);

  // REQ-104: "same model as the original test case/issue" — no new
  // judgment is being made, just re-running an existing check, so reuse
  // whichever task originally handled it rather than a dedicated routing
  // entry.
  const result = await runAgentLoop({
    task: issue.source === "automated" ? "test_run" : "issue_triage",
    systemPrompt: qaAgentPreamble(project),
    tools: [...tools, recordVerifyResultTool],
    toolExecutors: { ...executors, record_verify_result: async () => "ok" },
    finishTools: ["record_verify_result"],
    initialMessages: [
      {
        role: "user",
        content: `A fix was just applied for this issue. Re-run the original reproduction/scenario to check whether it's now resolved.

Issue: ${issue.title}
${issue.description ?? ""}
${testCaseScenario ? "Original test case scenario" : "Steps"}: ${steps}

Use automation_action / get_dom_or_accessibility_tree to check. Call record_verify_result when done.`,
      },
    ],
    onUsage: (usage, model) =>
      recordApiUsage(supabase, {
        companyId: project.company_id,
        projectId: project.id,
        operation: "verify_fix",
        runId,
        model,
        usage,
      }),
  });

  await closeBridgeSession(project, bridgeSessionId).catch(() => {});

  let resolved = false;
  let notes = "Re-verification agent did not report a clear result.";
  if (result.status === "max_turns_exceeded") {
    notes = "Re-verification hit the max-turn safety limit.";
  } else if (result.finishToolName === "record_verify_result") {
    const reported = result.result as { resolved?: unknown; notes?: unknown };
    if (typeof reported.resolved === "boolean") {
      resolved = reported.resolved;
      notes = typeof reported.notes === "string" ? reported.notes : "";
    } else {
      notes = `Agent reported an invalid result (got ${JSON.stringify(reported)}).`;
    }
  }

  if (resolved) {
    await supabase.from("issues").update({ status: "verified" }).eq("id", issue.id);
    if (issue.test_case_id) {
      await supabase
        .from("test_cases")
        .update({ status: "pass", last_run_at: new Date().toISOString() })
        .eq("id", issue.test_case_id);
    }
    await logEvent(
    supabase,
    project.company_id,
    "fix_run", runId, `"${issue.title}": verified fixed.`, "pass");
  } else {
    const { data: current } = await supabase
      .from("issues")
      .select("tag_reasoning")
      .eq("id", issue.id)
      .single();
    const appended = `${current?.tag_reasoning ?? ""}\n\n[Re-verification ${new Date().toISOString()}]: fix did not resolve the issue.${notes ? ` ${notes}` : ""}`;
    await supabase
      .from("issues")
      .update({ status: "triaged", tag: "bug", tag_reasoning: appended })
      .eq("id", issue.id);
    if (issue.test_case_id) {
      await supabase
        .from("test_cases")
        .update({ status: "fail", last_run_at: new Date().toISOString() })
        .eq("id", issue.test_case_id);
    }
    await logEvent(
    supabase,
    project.company_id,
    "fix_run", runId, `"${issue.title}": still failing after fix — reverted to triaged.`, "fail");
  }
}
