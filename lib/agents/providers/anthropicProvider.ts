import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ModelProvider, NormalizedContentBlock, ProviderRequest, ProviderResponse } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const anthropicProvider: ModelProvider = {
  async create(req: ProviderRequest): Promise<ProviderResponse> {
    const response = await client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      tools: req.tools,
      messages: req.messages,
    });

    const content: NormalizedContentBlock[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
      }
    }

    return {
      content,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? undefined,
        cache_read_input_tokens: response.usage.cache_read_input_tokens ?? undefined,
      },
    };
  },
};
