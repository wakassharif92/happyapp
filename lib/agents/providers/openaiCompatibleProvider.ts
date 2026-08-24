import "server-only";
import OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  ModelProvider,
  NormalizedContentBlock,
  ProviderRequest,
  ProviderResponse,
} from "./types";

// REQ-105: shared backend for DeepSeek and Qwen — both expose an
// OpenAI-compatible chat completions endpoint, so one implementation
// (parameterized by apiKey/baseURL) covers both. Translates Anthropic's
// Tool/MessageParam shape (the app's canonical internal format) into OpenAI
// request shape, and OpenAI's response back into NormalizedContentBlock[].

function toOpenAITools(tools: Anthropic.Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as Record<string, unknown>,
    },
  }));
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        c && typeof c === "object" && "text" in c
          ? String((c as { text: unknown }).text)
          : JSON.stringify(c)
      )
      .join("\n");
  }
  return JSON.stringify(content);
}

function toOpenAIMessages(
  system: string,
  messages: Anthropic.MessageParam[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }];

  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        out.push({ role: "user", content: msg.content });
        continue;
      }
      // Every user-role array-content message the loop produces is a batch
      // of tool_result blocks (see runAgentLoop) — one Anthropic turn can
      // bundle several, OpenAI wants one `role: "tool"` message each.
      const blocks = msg.content as unknown as Array<Record<string, unknown>>;
      const toolResults = blocks.filter((b) => b.type === "tool_result");
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          out.push({
            role: "tool",
            tool_call_id: String(tr.tool_use_id),
            content: toolResultText(tr.content),
          });
        }
        continue;
      }
      const textBlocks = blocks.filter((b) => b.type === "text");
      out.push({
        role: "user",
        content: textBlocks.map((b) => String(b.text)).join("\n"),
      });
    } else {
      // Assistant turn content is our own NormalizedContentBlock[] from a
      // prior provider call, cast into this slot the same way
      // runAgentLoop already casts it going in.
      const blocks = (msg.content as unknown as NormalizedContentBlock[]) ?? [];
      const text = blocks
        .filter((b): b is Extract<NormalizedContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const toolCalls = blocks.filter(
        (b): b is Extract<NormalizedContentBlock, { type: "tool_use" }> => b.type === "tool_use"
      );
      out.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0
          ? {
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.input) },
              })),
            }
          : {}),
      });
    }
  }
  return out;
}

export function createOpenAICompatibleProvider(config: {
  apiKey: string;
  baseURL: string;
}): ModelProvider {
  const client = new OpenAI({ apiKey: config.apiKey || "unset", baseURL: config.baseURL });

  return {
    async create(req: ProviderRequest): Promise<ProviderResponse> {
      const response = await client.chat.completions.create({
        model: req.model,
        max_tokens: req.maxTokens,
        messages: toOpenAIMessages(req.system, req.messages),
        tools: req.tools.length > 0 ? toOpenAITools(req.tools) : undefined,
      });

      const message = response.choices[0]?.message;
      if (!message) throw new Error(`${config.baseURL}: empty response (no choices)`);

      const content: NormalizedContentBlock[] = [];
      if (message.content) content.push({ type: "text", text: message.content });
      for (const call of message.tool_calls ?? []) {
        if (call.type !== "function") continue;
        let input: unknown;
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          throw new Error(
            `Model returned unparseable tool arguments for "${call.function.name}": ${call.function.arguments.slice(0, 200)}`
          );
        }
        content.push({ type: "tool_use", id: call.id, name: call.function.name, input });
      }

      return {
        content,
        usage: {
          input_tokens: response.usage?.prompt_tokens ?? 0,
          output_tokens: response.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}
