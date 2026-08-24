import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { callModel } from "./providers/adapter";
import type { Task } from "./modelRouting";
import type { NormalizedContentBlock } from "./providers/types";
import type { TokenUsage } from "./pricing";

// REQ-100: both agents are a loop over tool use — send context + tools,
// execute whatever the model calls, feed results back, repeat until the
// model signals completion or REQ-103's max-turns safety limit is hit. This
// one runner backs every QA Agent and Programming Agent flow; each flow
// supplies its own system prompt, tool set (REQ-101/102), and task (REQ-104,
// which model/provider actually answers it — see providers/adapter.ts),
// which is how "QA Agent never fixes code, Programming Agent never decides
// bug-ness" is enforced — neither is ever handed the other's tools.

const DEFAULT_MAX_TURNS = 25;

export type ToolResultContent =
  | string
  | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;

export type ToolExecutor = (input: unknown) => Promise<ToolResultContent>;

export type AgentLoopOptions = {
  task: Task;
  systemPrompt: string;
  tools: Anthropic.Tool[];
  toolExecutors: Record<string, ToolExecutor>;
  initialMessages: Anthropic.MessageParam[];
  maxTurns?: number;
  // Tool names that end the loop: once called, the loop stops and returns
  // that call's input as `result`. Used for flows that need a structured
  // final answer (e.g. "submit_test_cases") rather than freeform text.
  finishTools?: string[];
  // Fires after every model call (i.e. once per turn) with that turn's
  // token usage and which model actually answered it (REQ-104's fix_run
  // fallback means this can differ from the routing table's primary), so
  // callers can log cost without this generic loop runner knowing anything
  // about Supabase or pricing. Must never throw.
  onUsage?: (usage: TokenUsage, model: string) => void | Promise<void>;
};

export type AgentLoopResult =
  | {
      status: "completed";
      finishToolName?: string;
      result?: unknown;
      messages: Anthropic.MessageParam[];
    }
  | { status: "max_turns_exceeded"; messages: Anthropic.MessageParam[] };

export async function runAgentLoop(
  opts: AgentLoopOptions
): Promise<AgentLoopResult> {
  const {
    task,
    systemPrompt,
    tools,
    toolExecutors,
    maxTurns = DEFAULT_MAX_TURNS,
    finishTools = [],
  } = opts;
  const messages: Anthropic.MessageParam[] = [...opts.initialMessages];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await callModel(task, {
      system: systemPrompt,
      tools,
      messages,
      maxTokens: 4096,
    });

    if (opts.onUsage) {
      try {
        await opts.onUsage(response.usage, response.model);
      } catch (err) {
        console.error("[runAgentLoop] onUsage callback failed:", err);
      }
    }

    messages.push({
      role: "assistant",
      content: response.content as unknown as Anthropic.MessageParam["content"],
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Extract<NormalizedContentBlock, { type: "tool_use" }> =>
        block.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      return { status: "completed", messages };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let finish: { name: string; input: unknown } | undefined;

    for (const block of toolUseBlocks) {
      const executor = toolExecutors[block.name];
      let content: ToolResultContent;
      let isError = false;
      try {
        content = executor
          ? await executor(block.input)
          : `Error: unknown tool "${block.name}"`;
      } catch (err) {
        content = `Error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content,
        ...(isError ? { is_error: true } : {}),
      });

      if (!finish && finishTools.includes(block.name)) {
        finish = { name: block.name, input: block.input };
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (finish) {
      return {
        status: "completed",
        finishToolName: finish.name,
        result: finish.input,
        messages,
      };
    }
  }

  return { status: "max_turns_exceeded", messages };
}
