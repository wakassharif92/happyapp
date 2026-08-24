import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop } from "@/lib/agents/claude";
import { programmingAgentPreamble } from "./systemPrompt";
import {
  combineTools,
  readFileTool,
  writeFileTool,
  runCommandTool,
  searchCodebaseTool,
  logEventTool,
  type ProgrammingAgentContext,
} from "./tools";
import { buildContextBundle } from "@/lib/agents/contextBundle";
import { FRAMEWORK_COMMANDS } from "./commands";
import { logEvent } from "@/lib/agents/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordApiUsage } from "@/lib/agents/usageTracking";
import { verifyFix } from "@/lib/agents/qa-agent/verifyFix";
import type { Issue, Module, Project, ProgrammingAgentRun } from "@/lib/types/database";

const recordFixResultTool: Anthropic.Tool = {
  name: "record_fix_result",
  description: "Finish this issue: summarize the change you made and whether you committed it.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      committed: { type: "boolean" },
    },
    required: ["summary"],
  },
};

type Supabase = ReturnType<typeof createAdminClient>;

async function fixOneIssue(
  supabase: Supabase,
  project: Project,
  module: Module,
  run: ProgrammingAgentRun,
  issue: Issue
): Promise<{ summary: string; completed: boolean }> {
  await logEvent(supabase, "fix_run", run.id, `Starting fix for "${issue.title}"`, "info");

  const bundle = await buildContextBundle(supabase, project, module, issue);
  const ctx: ProgrammingAgentContext = { supabase, project, runType: "fix_run", runId: run.id };
  const { tools, executors } = combineTools([
    readFileTool(ctx),
    writeFileTool(ctx),
    runCommandTool(ctx),
    searchCodebaseTool(ctx),
    logEventTool(ctx),
  ]);

  const suggestedCommands = FRAMEWORK_COMMANDS[project.framework ?? ""] ?? [];
  const commandsHint = suggestedCommands.length
    ? suggestedCommands.map((c) => `${c.command} ${c.args.join(" ")}`).join(", ")
    : "no framework-specific commands configured — check package.json (or equivalent) yourself for the right lint/build/test scripts";

  const result = await runAgentLoop({
    task: "fix_run",
    systemPrompt: programmingAgentPreamble(project),
    tools: [...tools, recordFixResultTool],
    toolExecutors: { ...executors, record_fix_result: async () => "ok" },
    finishTools: ["record_fix_result"],
    initialMessages: [
      {
        role: "user",
        content: `Fix this confirmed bug.

${JSON.stringify(bundle, null, 2)}

Read the relevant file(s) (search_codebase if the guessed relevant_files list above isn't enough), make the minimal correct change, then verify it via run_command. Suggested commands for this project's framework (${project.framework ?? "unknown"}): ${commandsHint}. Then commit with "git" via run_command using a message referencing the issue, e.g. fix: resolve <short description> [${issue.id.slice(0, 8)}]. Then call record_fix_result.`,
      },
    ],
    onUsage: (usage, model) =>
      recordApiUsage(supabase, {
        projectId: project.id,
        operation: "fix_run",
        runId: run.id,
        model,
        usage,
      }),
  });

  if (result.status === "max_turns_exceeded") {
    const summary = "Hit the max-turn safety limit before finishing — left unfixed for manual follow-up.";
    await logEvent(supabase, "fix_run", run.id, `"${issue.title}": ${summary}`, "error");
    return { summary, completed: false };
  }

  let summary: string;
  if (result.finishToolName === "record_fix_result") {
    const reported = result.result as { summary?: unknown };
    summary =
      typeof reported.summary === "string"
        ? reported.summary
        : `Agent reported an invalid result (got ${JSON.stringify(reported)}).`;
  } else {
    summary = "Agent ended without reporting a result.";
  }

  await logEvent(supabase, "fix_run", run.id, `"${issue.title}": ${summary}`, "fix_applied");
  return { summary, completed: true };
}

// REQ-060/061/062: fix batch — one isolated agent invocation per issue (no
// shared conversation history between issues), sequential to avoid
// concurrent writes to the same codebase. REQ-063's re-verification runs
// automatically afterward for whichever issues actually got fixed.
export async function runFix(
  project: Project,
  run: ProgrammingAgentRun,
  issuesWithModules: { issue: Issue; module: Module }[]
): Promise<void> {
  const supabase = createAdminClient();
  const summaryLines: string[] = [];
  const toVerify: { issue: Issue; module: Module }[] = [];

  for (const { issue, module } of issuesWithModules) {
    try {
      const { summary, completed } = await fixOneIssue(supabase, project, module, run, issue);
      summaryLines.push(`- ${issue.title}: ${summary}`);
      if (completed) {
        await supabase.from("issues").update({ status: "fixed" }).eq("id", issue.id);
        toVerify.push({ issue, module });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summaryLines.push(`- ${issue.title}: FAILED — ${message}`);
      await logEvent(supabase, "fix_run", run.id, `"${issue.title}" failed: ${message}`, "error");
    }
  }

  await supabase
    .from("programming_agent_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      summary: summaryLines.join("\n"),
    })
    .eq("id", run.id);

  for (const { issue, module } of toVerify) {
    try {
      await verifyFix(project, module, { ...issue, status: "fixed", assigned_agent_run_id: run.id });
    } catch (err) {
      await logEvent(
        supabase,
        "fix_run",
        run.id,
        `Re-verification of "${issue.title}" errored: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
    }
  }
}
