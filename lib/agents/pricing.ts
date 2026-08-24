import "server-only";

// $ per million tokens. Cache write/read are derived from the input price
// per Anthropic's standard multipliers (1.25x for a 5-minute cache write,
// 0.1x for a cache read) since this app doesn't set cache_control anywhere
// yet — kept here so cost tracking stays correct if that changes.
type ModelPricing = { input: number; output: number };

// claude-sonnet-5 has an introductory rate through 2026-08-31; after that
// the standard rate applies. Both are listed so cost tracking stays
// accurate across the cutover without a code change.
const SONNET_5_INTRO_CUTOFF = new Date("2026-09-01T00:00:00Z");
const SONNET_5_INTRO: ModelPricing = { input: 2.0, output: 10.0 };
const SONNET_5_STANDARD: ModelPricing = { input: 3.0, output: 15.0 };

function sonnet5Pricing(): ModelPricing {
  return Date.now() < SONNET_5_INTRO_CUTOFF.getTime() ? SONNET_5_INTRO : SONNET_5_STANDARD;
}

const STATIC_PRICING: Record<string, ModelPricing> = {
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  // Verified live against DeepSeek's docs (api-docs.deepseek.com/quick_start/pricing).
  // Cache-hit input rates aren't listed — this app doesn't set cache_control
  // on DeepSeek/Qwen requests, so cache_creation/cache_read stay 0 for them.
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "deepseek-v4-pro": { input: 0.435, output: 0.87 },
  // UNVERIFIED — Alibaba's DashScope pricing pages are JS-rendered and
  // couldn't be fetched. Confirm against the DashScope console/docs and
  // correct this rate once known (see lib/agents/modelRouting.ts).
  "qwen3-coder-plus": { input: 1.0, output: 5.0 },
};

function pricingForModel(model: string): ModelPricing {
  if (model === "claude-sonnet-5") return sonnet5Pricing();
  return STATIC_PRICING[model] ?? SONNET_5_STANDARD;
}

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = pricingForModel(model);
  const cacheWritePerToken = (pricing.input * 1.25) / 1_000_000;
  const cacheReadPerToken = (pricing.input * 0.1) / 1_000_000;
  const inputPerToken = pricing.input / 1_000_000;
  const outputPerToken = pricing.output / 1_000_000;

  const cost =
    usage.input_tokens * inputPerToken +
    usage.output_tokens * outputPerToken +
    (usage.cache_creation_input_tokens ?? 0) * cacheWritePerToken +
    (usage.cache_read_input_tokens ?? 0) * cacheReadPerToken;

  return Math.round(cost * 1_000_000) / 1_000_000;
}
