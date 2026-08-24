import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop } from "@/lib/agents/claude";
import { qaAgentPreamble } from "./systemPrompt";
import {
  combineTools,
  automationActionTool,
  getDomTool,
  createIssueTool,
  logEventTool,
  type QaAgentContext,
} from "./tools";
import { createBridgeSession, closeBridgeSession, BridgeUnavailableError } from "@/lib/bridge/client";
import { logEvent } from "@/lib/agents/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStopRequested, clearStop } from "@/lib/agents/runRegistry";
import { recordApiUsage } from "@/lib/agents/usageTracking";
import type { Module, Project, TestCase, TestRunStatus } from "@/lib/types/database";

const recordTestResultTool: Anthropic.Tool = {
  name: "record_test_result",
  description:
    "Finish this test case by reporting the verdict. If status is 'fail', you must have already called create_issue for it.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["pass", "fail"] },
      notes: { type: "string" },
    },
    required: ["status"],
  },
};

type Supabase = ReturnType<typeof createAdminClient>;

async function runOneTestCase(
  supabase: Supabase,
  project: Project,
  module: Module,
  run: { id: string },
  bridgeSessionId: string,
  testCase: TestCase
): Promise<"pass" | "fail"> {
  await supabase
    .from("test_cases")
    .update({ status: "running" })
    .eq("id", testCase.id);
  await logEvent(
    supabase,
    "test_run",
    run.id,
    `Running "${testCase.title}": ${testCase.scenario.slice(0, 80)}${testCase.scenario.length > 80 ? "…" : ""}`,
    "info"
  );

  const ctx: QaAgentContext = {
    supabase,
    project,
    module,
    runType: "test_run",
    runId: run.id,
    bridgeSessionId,
    testCaseId: testCase.id,
  };

  const { tools, executors } = combineTools([
    automationActionTool(ctx),
    getDomTool(ctx),
    createIssueTool(ctx),
    logEventTool(ctx),
  ]);

  const result = await runAgentLoop({
    task: "test_run",
    systemPrompt: qaAgentPreamble(project),
    tools: [...tools, recordTestResultTool],
    toolExecutors: { ...executors, record_test_result: async () => "ok" },
    finishTools: ["record_test_result"],
    initialMessages: [
      {
        role: "user",
        content: `Execute this test case against the running app, step by step, using automation_action. After each meaningful step, use get_dom_or_accessibility_tree to observe the result. Compare the final state against the expected outcome described in the scenario.

Title: ${testCase.title}
Scenario: ${testCase.scenario}

If it fails, call create_issue first (tag 'bug' if you're confident it's a real failure, 'approval' if you have low confidence — e.g. it could be flakiness/timing rather than a real bug). Then call record_test_result.`,
      },
    ],
    onUsage: (usage, model) =>
      recordApiUsage(supabase, {
        projectId: project.id,
        operation: "test_run",
        runId: run.id,
        model,
        usage,
      }),
  });

  let status: "pass" | "fail";
  let note: string;

  if (result.status === "max_turns_exceeded") {
    status = "fail";
    note = "max-turn safety limit hit before the agent reported a result";
    await logEvent(supabase, "test_run", run.id, `"${testCase.title}": ${note}`, "error");
  } else if (result.finishToolName === "record_test_result") {
    const reported = result.result as { status?: unknown; notes?: unknown };
    if (reported.status === "pass" || reported.status === "fail") {
      status = reported.status;
      note = typeof reported.notes === "string" ? reported.notes : "";
    } else {
      status = "fail";
      note = `agent reported an invalid status (got ${JSON.stringify(reported)})`;
    }
  } else {
    status = "fail";
    note = "agent ended without reporting a result";
  }

  await supabase
    .from("test_cases")
    .update({ status, last_run_at: new Date().toISOString() })
    .eq("id", testCase.id);
  await logEvent(
    supabase,
    "test_run",
    run.id,
    `"${testCase.title}": ${status}${note ? ` — ${note}` : ""}`,
    status
  );

  return status;
}

// REQ-013: "QA It" — runs the module's test suite end to end, one test case
// at a time, writing every step to agent_events (REQ-070) and checking
// REQ-014's stop flag between cases so a stop finishes the current case
// gracefully rather than killing it mid-step.
export async function runTestSuite(
  project: Project,
  module: Module,
  run: { id: string },
  cases: TestCase[]
): Promise<void> {
  const supabase = createAdminClient();
  let bridgeSessionId: string;

  try {
    bridgeSessionId = await createBridgeSession(project);
  } catch (err) {
    const message =
      err instanceof BridgeUnavailableError ? err.message : `Failed to start automation session: ${String(err)}`;
    await logEvent(supabase, "test_run", run.id, message, "error");
    await supabase
      .from("test_runs")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("id", run.id);
    return;
  }

  let passed = 0;
  let failed = 0;
  let stopped = false;

  for (const testCase of cases) {
    if (isStopRequested(run.id)) {
      stopped = true;
      await logEvent(supabase, "test_run", run.id, "Stop requested — halting after current progress.", "info");
      break;
    }
    const status = await runOneTestCase(supabase, project, module, run, bridgeSessionId, testCase);
    if (status === "pass") passed++;
    else failed++;
  }

  await closeBridgeSession(project, bridgeSessionId).catch(() => {});
  clearStop(run.id);

  const finalStatus: TestRunStatus = stopped ? "failed" : "completed";
  await supabase
    .from("test_runs")
    .update({
      status: finalStatus,
      passed_count: passed,
      failed_count: failed,
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  await logEvent(
    supabase,
    "test_run",
    run.id,
    `Run ${finalStatus}: ${passed} passed, ${failed} failed.`,
    "info"
  );
}
