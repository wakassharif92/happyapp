import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentOperation, Database } from "@/lib/types/database";
import { calculateCost, type TokenUsage } from "./pricing";

// Logs one row per Claude API call so the dashboard can show cost broken
// down by operation (module sync, test case generation, automated testing,
// triage, fix it, fix verification). Passed into runAgentLoop's onUsage
// hook, which fires once per turn — so a single "QA It" run against several
// test cases produces several rows here, correctly summing to its real cost.
export async function recordApiUsage(
  supabase: SupabaseClient<Database>,
  params: {
    companyId: string;
    projectId: string;
    operation: AgentOperation;
    runId?: string | null;
    model: string;
    usage: TokenUsage;
  }
): Promise<void> {
  const costUsd = calculateCost(params.model, params.usage);
  const { error } = await supabase.from("agent_api_calls").insert({
    company_id: params.companyId,
    project_id: params.projectId,
    operation: params.operation,
    run_id: params.runId ?? null,
    model: params.model,
    input_tokens: params.usage.input_tokens,
    output_tokens: params.usage.output_tokens,
    cache_creation_tokens: params.usage.cache_creation_input_tokens ?? 0,
    cache_read_tokens: params.usage.cache_read_input_tokens ?? 0,
    cost_usd: costUsd,
  });
  // Cost logging must never break an agent run — swallow and warn instead.
  if (error) {
    console.error("[usageTracking] failed to record agent_api_calls row:", error.message);
  }
}
