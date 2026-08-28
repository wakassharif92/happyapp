import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBridgeSession, performAction, getDom } from "@/lib/bridge/client";
import type { ActionType } from "@/lib/bridge/types";
import { readRequirementsDoc, extractRequirementSection } from "@/lib/agents/requirements";
import { searchCodebase } from "@/lib/agents/codebase";
import { logEvent } from "@/lib/agents/events";
import type {
  AgentRunType,
  Database,
  IssueTag,
  Module,
  Project,
  Severity,
} from "@/lib/types/database";
import type { ToolExecutor } from "@/lib/agents/claude";

// REQ-101: the QA Agent's tool set. Every flow (module sync, test case
// generation, test execution, triage, re-verification) composes whichever
// of these it needs from this one shared implementation, via `ctx`.
export type QaAgentContext = {
  supabase: SupabaseClient<Database>;
  project: Project;
  module: Module;
  // Not every flow logs to agent_events (module sync / test case generation
  // aren't a `run_type` the schema knows about) — only required when using
  // logEventTool, createIssueTool, or automation tools.
  runType?: AgentRunType;
  runId?: string;
  bridgeSessionId?: string;
  testCaseId?: string;
};

export type ToolEntry = { tool: Anthropic.Tool; execute: ToolExecutor };

export function combineTools(entries: ToolEntry[]): {
  tools: Anthropic.Tool[];
  executors: Record<string, ToolExecutor>;
} {
  return {
    tools: entries.map((e) => e.tool),
    executors: Object.fromEntries(entries.map((e) => [e.tool.name, e.execute])),
  };
}

function requireRun(ctx: QaAgentContext): { runType: AgentRunType; runId: string } {
  if (!ctx.runType || !ctx.runId) {
    throw new Error("This tool requires an active run context (runType/runId).");
  }
  return { runType: ctx.runType, runId: ctx.runId };
}

export async function ensureBridgeSession(ctx: QaAgentContext): Promise<string> {
  if (ctx.bridgeSessionId) return ctx.bridgeSessionId;
  ctx.bridgeSessionId = await createBridgeSession(ctx.project);
  return ctx.bridgeSessionId;
}

export function automationActionTool(ctx: QaAgentContext): ToolEntry {
  return {
    tool: {
      name: "automation_action",
      description:
        "Drive the app under test: navigate, click/tap, type text, press a key, scroll/swipe, or wait. Routed to the project's mobile (Appium) or web (Playwright) bridge automatically.",
      input_schema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["navigate", "click", "tap", "type", "press", "scroll", "swipe", "wait"],
          },
          params: {
            type: "object",
            description:
              "navigate: {url}. click/tap: {selector}. type: {selector, text, clear?}. press: {selector?, key}. scroll/swipe: {selector?, direction?, amount?}. wait: {ms?, selector?}.",
          },
        },
        required: ["type"],
      },
    },
    execute: async (input) => {
      const { type, params } = input as { type: ActionType; params?: Record<string, unknown> };
      const sessionId = await ensureBridgeSession(ctx);
      const result = await performAction(ctx.project, sessionId, type, params);
      return JSON.stringify(result);
    },
  };
}

export function getDomTool(ctx: QaAgentContext): ToolEntry {
  return {
    tool: {
      name: "get_dom_or_accessibility_tree",
      description:
        "Get the current page's DOM/accessibility tree as structured text — the primary way to observe app state (REQ-101/104: this system is text-only, no screenshots).",
      input_schema: { type: "object", properties: {} },
    },
    execute: async () => {
      const sessionId = await ensureBridgeSession(ctx);
      const dom = await getDom(ctx.project, sessionId);
      return JSON.stringify(dom);
    },
  };
}

export function getRequirementTextTool(ctx: QaAgentContext): ToolEntry {
  return {
    tool: {
      name: "get_requirement_text",
      description: "Get the requirements doc text relevant to a module.",
      input_schema: {
        type: "object",
        properties: {
          module_id: { type: "string", description: "Defaults to the current module." },
        },
      },
    },
    execute: async (input) => {
      const { module_id } = (input ?? {}) as { module_id?: string };
      let mod = ctx.module;
      if (module_id && module_id !== ctx.module.id) {
        const { data } = await ctx.supabase
          .from("modules")
          .select("*")
          .eq("id", module_id)
          .maybeSingle();
        if (!data) return `Error: no module ${module_id}`;
        mod = data;
      }
      const docText = await readRequirementsDoc(ctx.supabase, ctx.project.requirements_doc_ref);
      return extractRequirementSection(docText, mod.requirement_ref);
    },
  };
}

export function searchCodebaseTool(ctx: QaAgentContext): ToolEntry {
  return {
    tool: {
      name: "search_codebase",
      description: "Read-only search of the project's codebase for a string/pattern (grep).",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    execute: async (input) => {
      const { query } = input as { query: string };
      return searchCodebase(ctx.project.codebase_path ?? "", query);
    },
  };
}

export function createIssueTool(ctx: QaAgentContext): ToolEntry {
  return {
    tool: {
      name: "create_issue",
      description:
        "Record a bug found during automated testing. Since automated failures are presumed real, tag it 'bug' unless you have low confidence it's a genuine failure (flakiness/timing) — in that case tag it 'approval' and explain why in tag_reasoning (REQ-051).",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          reproduction_steps: { type: "array", items: { type: "string" } },
          tag: { type: "string", enum: ["bug", "approval"] },
          tag_reasoning: {
            type: "string",
            description: "At minimum a one-line explanation, even for confident bugs.",
          },
          severity: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["title", "tag", "tag_reasoning"],
      },
    },
    execute: async (input) => {
      const body = input as {
        title: string;
        description?: string;
        reproduction_steps?: string[];
        tag: IssueTag;
        tag_reasoning: string;
        severity?: Severity;
      };
      const { data, error } = await ctx.supabase
        .from("issues")
        .insert({
          company_id: ctx.project.company_id,
          source: "automated",
          module_id: ctx.module.id,
          test_case_id: ctx.testCaseId ?? null,
          title: body.title,
          description: body.description ?? null,
          reproduction_steps: body.reproduction_steps ?? [],
          tag: body.tag,
          tag_reasoning: body.tag_reasoning,
          severity: body.severity ?? null,
          status: "triaged",
        })
        .select("id")
        .single();
      if (error) return `Error: ${error.message}`;
      const { runType, runId } = requireRun(ctx);
      await logEvent(ctx.supabase, ctx.project.company_id, runType, runId, `Bug found: ${body.title}`, "bug_found");
      return JSON.stringify({ issue_id: data.id });
    },
  };
}

export function updateIssueTagTool(ctx: QaAgentContext): ToolEntry {
  return {
    tool: {
      name: "update_issue_tag",
      description:
        "Classify or reclassify an issue: 'bug' (reproducible, contradicts spec), 'not_a_bug' (reproducible but matches documented behavior — cite the requirement in tag_reasoning), or 'approval' (not reproducible, or the spec is silent/ambiguous — never forwarded to the Programming Agent automatically).",
      input_schema: {
        type: "object",
        properties: {
          issue_id: { type: "string" },
          tag: { type: "string", enum: ["bug", "not_a_bug", "approval"] },
          tag_reasoning: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["issue_id", "tag", "tag_reasoning"],
      },
    },
    execute: async (input) => {
      const body = input as {
        issue_id: string;
        tag: IssueTag;
        tag_reasoning: string;
        severity?: Severity;
      };
      // During a triage run we already know exactly which issue is being
      // triaged (ctx.runId) — use that rather than trusting the model to
      // copy the UUID verbatim, since a hallucinated id fails silently
      // (and wastes turns) rather than erroring loudly upstream.
      const targetId =
        ctx.runType === "issue_triage" && ctx.runId ? ctx.runId : body.issue_id;
      const { error } = await ctx.supabase
        .from("issues")
        .update({
          tag: body.tag,
          tag_reasoning: body.tag_reasoning,
          severity: body.severity ?? null,
          status: "triaged",
        })
        .eq("id", targetId);
      if (error) return `Error: ${error.message}`;
      return "ok";
    },
  };
}

export function logEventTool(ctx: QaAgentContext): ToolEntry {
  return {
    tool: {
      name: "log_event",
      description: "Narrate what you're doing right now for the live activity feed.",
      input_schema: {
        type: "object",
        properties: {
          text: { type: "string" },
          event_type: {
            type: "string",
            enum: ["info", "pass", "fail", "bug_found", "fix_applied", "error"],
          },
        },
        required: ["text"],
      },
    },
    execute: async (input) => {
      const { text, event_type } = input as { text: string; event_type?: string };
      const { runType, runId } = requireRun(ctx);
      await logEvent(
        ctx.supabase,
        ctx.project.company_id,
        runType,
        runId,
        text,
        (event_type as Parameters<typeof logEvent>[5]) ?? "info"
      );
      return "ok";
    },
  };
}
