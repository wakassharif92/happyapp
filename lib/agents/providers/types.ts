import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { TokenUsage } from "@/lib/agents/pricing";

// The canonical internal message/tool format is still Anthropic's shape
// (Tool, MessageParam) — every tool definition, call site, and the
// cost-tracking feature all speak this already. A model response, however,
// can't always be represented as a *real* Anthropic.ContentBlock: that type
// now requires provider-specific fields (e.g. ToolUseBlock.caller,
// Usage.service_tier) that don't semantically exist for DeepSeek/Qwen. So
// responses are normalized down to this minimal shape instead — a strict
// subset of Anthropic.ContentBlock's own field names, which is why casting
// it back into Anthropic.MessageParam["content"] for the next turn (see
// runAgentLoop) is safe.
export type NormalizedTextBlock = { type: "text"; text: string };
export type NormalizedToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};
export type NormalizedContentBlock = NormalizedTextBlock | NormalizedToolUseBlock;

export type ProviderRequest = {
  model: string;
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  maxTokens: number;
};

export type ProviderResponse = {
  content: NormalizedContentBlock[];
  usage: TokenUsage;
};

// REQ-105: the provider adapter interface. One implementation per backend
// (Anthropic Messages API, OpenAI-compatible for DeepSeek/Qwen) — agent code
// never imports a provider SDK directly, only lib/agents/claude.ts's
// runAgentLoop, via lib/agents/providers/adapter.ts's callModel().
export interface ModelProvider {
  create(req: ProviderRequest): Promise<ProviderResponse>;
}
