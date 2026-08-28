import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentEventType, AgentRunType, Database } from "@/lib/types/database";

// REQ-006/REQ-070: append-only log every agent step writes to, so the
// dashboard's live activity feed and the audit trail both read from one place.
export async function logEvent(
  supabase: SupabaseClient<Database>,
  companyId: string,
  runType: AgentRunType,
  runId: string,
  eventText: string,
  eventType: AgentEventType = "info"
): Promise<void> {
  await supabase.from("agent_events").insert({
    company_id: companyId,
    run_type: runType,
    run_id: runId,
    event_text: eventText,
    event_type: eventType,
  });
}
