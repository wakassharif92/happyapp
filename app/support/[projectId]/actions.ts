"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ClaimConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

// Section 14: resolves (or creates) the support_conversations row for
// this (project, customer_email) pair, and re-points its
// customer_auth_uid at the CURRENT anonymous session — so the same
// customer opening the link again later (possibly from a different
// device/reinstall, a fresh anonymous session each time) keeps their full
// message history under one conversation_id, while RLS
// (auth.uid() = customer_auth_uid) stays correct for whichever session is
// active right now. The current session's uid comes from the
// session-aware server client (cookie-derived), not a client-supplied
// value, so it can't be spoofed independently of the email trust
// assumption already documented in the migration.
export async function claimConversation(
  projectId: string,
  email: string
): Promise<ClaimConversationResult> {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return { ok: false, error: "No active session — the chat couldn't identify this visitor." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_conversations")
    .upsert(
      {
        project_id: projectId,
        customer_email: email,
        customer_auth_uid: user.id,
      },
      { onConflict: "project_id,customer_email" }
    )
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to start conversation" };
  }

  return { ok: true, conversationId: data.id };
}
