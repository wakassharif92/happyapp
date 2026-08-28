import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchCodebase } from "@/lib/agents/codebase";
import { logEvent } from "@/lib/agents/events";
import { isAllowedCommand } from "./commands";
import type { AgentRunType, Database, Project } from "@/lib/types/database";
import type { ToolExecutor } from "@/lib/agents/claude";

const execFileAsync = promisify(execFile);

// REQ-102: read_file, write_file, run_command (restricted to configured
// build/lint/test commands + git), log_event. Explicitly no automation-
// bridge tools. search_codebase is also included, read-only, so the agent
// can "search further" beyond the context bundle's best-effort file list
// (REQ-061) — it has no write/execute reach beyond that.
export type ProgrammingAgentContext = {
  supabase: SupabaseClient<Database>;
  project: Project;
  runType: AgentRunType;
  runId: string;
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

function resolveWithinCodebase(codebasePath: string, relPath: string): string {
  const root = path.resolve(codebasePath);
  const resolved = path.resolve(root, relPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path "${relPath}" is outside the project's codebase_path.`);
  }
  return resolved;
}

export function readFileTool(ctx: ProgrammingAgentContext): ToolEntry {
  return {
    tool: {
      name: "read_file",
      description: "Read a file's contents (path relative to the project's codebase_path).",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    execute: async (input) => {
      const { path: relPath } = input as { path: string };
      if (!ctx.project.codebase_path) return "Error: project has no codebase_path configured.";
      const full = resolveWithinCodebase(ctx.project.codebase_path, relPath);
      try {
        return await readFile(full, "utf8");
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

export function writeFileTool(ctx: ProgrammingAgentContext): ToolEntry {
  return {
    tool: {
      name: "write_file",
      description: "Overwrite a file's contents (path relative to the project's codebase_path).",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
    execute: async (input) => {
      const { path: relPath, content } = input as { path: string; content: string };
      if (!ctx.project.codebase_path) return "Error: project has no codebase_path configured.";
      const full = resolveWithinCodebase(ctx.project.codebase_path, relPath);
      try {
        await writeFile(full, content, "utf8");
        return "ok";
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

export function runCommandTool(ctx: ProgrammingAgentContext): ToolEntry {
  return {
    tool: {
      name: "run_command",
      description:
        "Run a build/lint/test command, or a git command (status/diff/add/commit/log). Restricted to an allowlist — arbitrary shell commands are rejected.",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string", description: "e.g. 'npm', 'flutter', 'git'" },
          args: { type: "array", items: { type: "string" } },
        },
        required: ["command", "args"],
      },
    },
    execute: async (input) => {
      const { command, args } = input as { command: string; args: string[] };
      if (!isAllowedCommand(command, args)) {
        return `Error: command "${command} ${args.join(" ")}" is not in the allowlist.`;
      }
      if (!ctx.project.codebase_path) return "Error: project has no codebase_path configured.";
      try {
        const { stdout, stderr } = await execFileAsync(command, args, {
          cwd: ctx.project.codebase_path,
          maxBuffer: 2 * 1024 * 1024,
        });
        return `stdout:\n${stdout}\nstderr:\n${stderr}`.slice(0, 8000);
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return `Command failed.\nstdout:\n${e.stdout ?? ""}\nstderr:\n${e.stderr ?? e.message ?? String(err)}`.slice(
          0,
          8000
        );
      }
    },
  };
}

export function searchCodebaseTool(ctx: ProgrammingAgentContext): ToolEntry {
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

export function logEventTool(ctx: ProgrammingAgentContext): ToolEntry {
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
      await logEvent(
        ctx.supabase,
        ctx.project.company_id,
        ctx.runType,
        ctx.runId,
        text,
        (event_type as Parameters<typeof logEvent>[5]) ?? "info"
      );
      return "ok";
    },
  };
}
