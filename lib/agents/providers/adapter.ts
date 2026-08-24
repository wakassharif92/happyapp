import "server-only";
import { MODEL_ROUTING, type ProviderName, type Task } from "@/lib/agents/modelRouting";
import { anthropicProvider } from "./anthropicProvider";
import { createOpenAICompatibleProvider } from "./openaiCompatibleProvider";
import type { ModelProvider, ProviderRequest, ProviderResponse } from "./types";

// REQ-105: the one place agent code calls a model through. Never call a
// provider SDK directly from lib/agents/qa-agent or lib/agents/programming-agent —
// go through callModel(), which resolves REQ-106's routing config and,
// for tasks with a configured fallback (currently only fix_run), retries
// once against the fallback provider if the primary call throws.

const providerCache = new Map<ProviderName, ModelProvider>();

function getProvider(provider: ProviderName): ModelProvider {
  if (provider === "anthropic") return anthropicProvider;
  const cached = providerCache.get(provider);
  if (cached) return cached;
  const created =
    provider === "deepseek"
      ? createOpenAICompatibleProvider({
          apiKey: process.env.DEEPSEEK_API_KEY ?? "",
          baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
        })
      : createOpenAICompatibleProvider({
          apiKey: process.env.QWEN_API_KEY ?? "",
          baseURL:
            process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        });
  providerCache.set(provider, created);
  return created;
}

export async function callModel(
  task: Task,
  req: Omit<ProviderRequest, "model">
): Promise<ProviderResponse & { model: string }> {
  const routing = MODEL_ROUTING[task];
  try {
    const result = await getProvider(routing.provider).create({ ...req, model: routing.model });
    return { ...result, model: routing.model };
  } catch (err) {
    if (!routing.fallback) throw err;
    console.error(
      `[modelRouting] "${routing.provider}:${routing.model}" failed for task "${task}", retrying with fallback "${routing.fallback.provider}:${routing.fallback.model}":`,
      err instanceof Error ? err.message : err
    );
    const result = await getProvider(routing.fallback.provider).create({
      ...req,
      model: routing.fallback.model,
    });
    return { ...result, model: routing.fallback.model };
  }
}
