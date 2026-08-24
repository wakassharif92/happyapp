import "server-only";

// REQ-104/REQ-106: task -> model routing table, as config rather than code.
// Override any single task via MODEL_ROUTING_<TASK>=provider:model (e.g.
// MODEL_ROUTING_FIX_RUN=deepseek:deepseek-v4-pro) — no code change needed to
// swap a task's model/provider.
export type Task =
  | "module_sync"
  | "test_case_generation"
  | "test_run"
  | "issue_triage"
  | "fix_run";

export type ProviderName = "anthropic" | "deepseek" | "qwen";

export type RoutingEntry = {
  provider: ProviderName;
  model: string;
  fallback?: { provider: ProviderName; model: string };
};

const DEFAULTS: Record<Task, RoutingEntry> = {
  // REQ-010 isn't in REQ-104's table — treated like test case generation
  // (one-shot structured extraction, human reviews/edits the result).
  module_sync: { provider: "deepseek", model: "deepseek-v4-flash" },
  test_case_generation: { provider: "deepseek", model: "deepseek-v4-flash" },
  test_run: { provider: "deepseek", model: "deepseek-v4-pro" },
  issue_triage: { provider: "anthropic", model: "claude-sonnet-5" },
  fix_run: {
    provider: "qwen",
    // Best-effort default — DashScope's docs are JS-rendered and couldn't
    // be verified. Confirm the exact model id (and region: this assumes
    // the international endpoint) against your DashScope console, then
    // correct via MODEL_ROUTING_FIX_RUN and QWEN_BASE_URL if needed.
    model: "qwen3-coder-plus",
    fallback: { provider: "deepseek", model: "deepseek-v4-pro" },
  },
};

function parseOverride(raw: string | undefined): { provider: ProviderName; model: string } | null {
  if (!raw) return null;
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex === -1) {
    console.error(`[modelRouting] ignoring malformed override "${raw}" — expected "provider:model"`);
    return null;
  }
  const provider = raw.slice(0, separatorIndex);
  const model = raw.slice(separatorIndex + 1);
  if (!model || (provider !== "anthropic" && provider !== "deepseek" && provider !== "qwen")) {
    console.error(`[modelRouting] ignoring malformed override "${raw}" — expected "provider:model"`);
    return null;
  }
  return { provider, model };
}

function buildRouting(): Record<Task, RoutingEntry> {
  const routing = { ...DEFAULTS };
  for (const task of Object.keys(DEFAULTS) as Task[]) {
    const override = parseOverride(process.env[`MODEL_ROUTING_${task.toUpperCase()}`]);
    if (override) {
      routing[task] = { ...override, fallback: DEFAULTS[task].fallback };
    }
  }
  return routing;
}

export const MODEL_ROUTING: Record<Task, RoutingEntry> = buildRouting();
