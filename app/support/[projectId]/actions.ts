"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/company";
import type { Severity } from "@/lib/board/types";
import type { SupportMessage } from "@/lib/types/database";

export type ClaimConversationResult =
  | { ok: true; conversationId: string; companyId: string; hasOpenTicket: boolean }
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

  // The customer's own session is anonymous, not staff — it has no
  // company context of its own, so company_id is resolved from the
  // project they're chatting about instead (admin client: an anonymous
  // session can't read `projects` under the company-scoped RLS added in
  // migration 0015).
  const { data: project } = await admin
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single();
  if (!project) {
    return { ok: false, error: "Project not found" };
  }

  const { data, error } = await admin
    .from("support_conversations")
    .upsert(
      {
        company_id: project.company_id,
        project_id: projectId,
        customer_email: email,
        customer_auth_uid: user.id,
      },
      { onConflict: "project_id,customer_email" }
    )
    .select("id, has_open_ticket")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to start conversation" };
  }

  return {
    ok: true,
    conversationId: data.id,
    companyId: project.company_id,
    hasOpenTicket: data.has_open_ticket,
  };
}

// Chat image attachments always go through the server (admin client) —
// shared by both the customer (app/support/[projectId]/SupportChatClient.tsx)
// and agent (app/projects/[projectId]/support/SupportInboxClient.tsx)
// sides. An anonymous customer session can't upload directly to Storage
// (the "evidence"/"whatsapp-media" bucket policies require is_staff(),
// same reasoning as every other Storage policy hardened in migration
// 0009), so this can't be a direct browser upload the way staff-side
// uploads elsewhere in this app sometimes are.
export async function uploadSupportImage(
  formData: FormData
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No image provided" };

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `support-${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from("whatsapp-media")
    .upload(path, file, { contentType: file.type });
  if (error) return { ok: false, error: error.message };

  return { ok: true, path };
}

// Same reasoning as above — an anonymous customer can't call
// `createSignedUrl` on their own client either, so resolving a stored
// media path to a viewable URL goes through the server for both sides too
// (keeps one code path rather than two).
export async function resolveSupportMediaUrl(path: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage.from("whatsapp-media").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

// Section 16: "Send case to devs" — the agent escalates the current
// conversation to the Issue Board. A ticket is just a board_issues row
// (tab='user_complaints', source_channel='User Complaint') tagged with a
// ticket_number and support_conversation_id — no separate tickets table,
// so the existing board (move/comment/activity) already works on it. Uses
// the session-aware client (not the admin client) so RLS's `staff_all`
// check is what actually authorizes this, matching app/dashboard/actions.ts.
export type CreateTicketResult =
  | { ok: true; boardIssueId: string; ticketNumber: number }
  | { ok: false; error: string };

export async function createSupportTicket(input: {
  projectId: string;
  conversationId: string;
  reporterName: string;
  description: string;
  severity: Severity;
}): Promise<CreateTicketResult> {
  const supabase = await createClient();
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Not signed in" };

  const { data: conversation } = await supabase
    .from("support_conversations")
    .select("customer_auth_uid")
    .eq("id", input.conversationId)
    .single();
  if (!conversation) return { ok: false, error: "Conversation not found" };

  const title =
    input.description.length > 60 ? input.description.slice(0, 60) + "…" : input.description;

  const { data: issue, error } = await supabase
    .from("board_issues")
    .insert({
      company_id: member.companyId,
      project_id: input.projectId,
      tab: "user_complaints",
      title,
      message: input.description,
      sender_name: input.reporterName,
      source_channel: "User Complaint",
      category: "Other",
      severity: input.severity,
      media_type: "none",
      support_conversation_id: input.conversationId,
    })
    .select("id, ticket_number")
    .single();
  if (error || !issue || issue.ticket_number == null) {
    return { ok: false, error: error?.message ?? "Failed to create ticket" };
  }

  await supabase.from("board_issue_activity").insert({
    company_id: member.companyId,
    issue_id: issue.id,
    text: `Reported via Customer Support — Ticket #${issue.ticket_number}`,
    actor: member.name,
  });

  // Internal-only status entry — the customer never sees "sent to devs",
  // only whether their issue is currently open or resolved (see the
  // resolved-notice message in closeSupportTicket below).
  await supabase.from("support_messages").insert({
    company_id: member.companyId,
    conversation_id: input.conversationId,
    customer_auth_uid: conversation.customer_auth_uid,
    sender_type: "system",
    sender_name: "System",
    body: `Sent to devs — Ticket #${issue.ticket_number}`,
    visible_to_customer: false,
  });

  await supabase
    .from("support_conversations")
    .update({ has_open_ticket: true })
    .eq("id", input.conversationId);

  return { ok: true, boardIssueId: issue.id, ticketNumber: issue.ticket_number };
}

// The customer-support agent (not a dev) closes the ticket once resolved —
// this is what makes the *next* complaint from the same customer open with
// a fresh ticket number, since createSupportTicket above always inserts a
// new board_issues row rather than reusing one.
export async function closeSupportTicket(input: {
  boardIssueId: string;
  conversationId: string;
  ticketNumber: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Not signed in" };

  const { data: conversation } = await supabase
    .from("support_conversations")
    .select("customer_auth_uid")
    .eq("id", input.conversationId)
    .single();
  if (!conversation) return { ok: false, error: "Conversation not found" };

  await supabase.from("board_issues").update({ tab: "closed" }).eq("id", input.boardIssueId);
  await supabase.from("board_issue_activity").insert({
    company_id: member.companyId,
    issue_id: input.boardIssueId,
    text: "Closed via Customer Support",
    actor: member.name,
  });

  // Customer-visible on purpose (unlike every other system/dev message in
  // this table) — this is what tells the customer's own chat their issue
  // was resolved and lets it show the "start a new issue" affordance.
  await supabase.from("support_messages").insert({
    company_id: member.companyId,
    conversation_id: input.conversationId,
    customer_auth_uid: conversation.customer_auth_uid,
    sender_type: "system",
    sender_name: "System",
    body: `Ticket #${input.ticketNumber} marked resolved.`,
    visible_to_customer: true,
  });

  await supabase
    .from("support_conversations")
    .update({ has_open_ticket: false })
    .eq("id", input.conversationId);

  return { ok: true };
}

// A dev asking the customer-support agent a question from the Issue
// Board's ticket view (Section 16) — lands in the same message timeline
// the agent already reads, but is invisible to the customer (RLS-enforced,
// migration 0013). The agent relays the answer to the customer themselves
// by typing a normal customer-facing reply — this app never auto-forwards it.
export async function askDevQuestion(input: {
  conversationId: string;
  question: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Not signed in" };

  const { data: conversation } = await supabase
    .from("support_conversations")
    .select("customer_auth_uid")
    .eq("id", input.conversationId)
    .single();
  if (!conversation) return { ok: false, error: "Conversation not found" };

  const { error } = await supabase.from("support_messages").insert({
    company_id: member.companyId,
    conversation_id: input.conversationId,
    customer_auth_uid: conversation.customer_auth_uid,
    sender_type: "dev",
    sender_name: member.name,
    body: input.question,
    visible_to_customer: false,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// The other half of the internal side-channel: the agent replying to a
// dev's question. Still sender_type='agent' (it's the agent talking, same
// as their customer-facing replies) — visible_to_customer=false is what
// keeps it out of the customer's view, same enforcement as askDevQuestion.
export async function replyToDevs(input: {
  conversationId: string;
  text: string;
}): Promise<{ ok: true; message: SupportMessage } | { ok: false; error: string }> {
  const supabase = await createClient();
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Not signed in" };

  const { data: conversation } = await supabase
    .from("support_conversations")
    .select("customer_auth_uid")
    .eq("id", input.conversationId)
    .single();
  if (!conversation) return { ok: false, error: "Conversation not found" };

  const { data, error } = await supabase
    .from("support_messages")
    .insert({
      company_id: member.companyId,
      conversation_id: input.conversationId,
      customer_auth_uid: conversation.customer_auth_uid,
      sender_type: "agent",
      sender_name: member.name,
      body: input.text,
      visible_to_customer: false,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to send reply" };
  return { ok: true, message: data };
}

// Called when a dev opens a ticket's conversation modal — an independent
// read-cursor from the agent's own (support_conversations.last_read_at),
// since they're separate viewers of the same message stream. Drives the
// unread dot on "View Conversation" (Issue Board) clearing.
export async function markTicketReadByDev(
  boardIssueId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("board_issues")
    .update({ dev_last_read_at: new Date().toISOString() })
    .eq("id", boardIssueId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
