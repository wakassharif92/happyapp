"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BoardIssue, SupportConversation, SupportMessage } from "@/lib/types/database";
import type { Severity, TabKey } from "@/lib/board/types";
import { ChatWindow, type ChatMessage } from "@/components/support/ChatWindow";
import { SendToDevsModal } from "@/components/support/SendToDevsModal";
import { ReplyToDevsModal } from "@/components/support/ReplyToDevsModal";
import { IconTicket } from "@/components/dashboard/icons";
import {
  closeSupportTicket,
  createSupportTicket,
  replyToDevs,
  resolveSupportMediaUrl,
  uploadSupportImage,
} from "@/app/support/[projectId]/actions";

type LatestInfo = { createdAt: string; senderType: SupportMessage["sender_type"] };
type ActiveTicket = { boardIssueId: string; ticketNumber: number; tab: TabKey };

// A dev's reply counts toward the unread dot the same way a customer's
// does — an agent-authored internal reply doesn't (the agent already sent
// it, so it's not "new" to them).
function isUnread(conversation: SupportConversation, latest: LatestInfo | undefined): boolean {
  if (!latest || (latest.senderType !== "customer" && latest.senderType !== "dev")) return false;
  if (!conversation.last_read_at) return true;
  return new Date(latest.createdAt) > new Date(conversation.last_read_at);
}

async function toChatMessage(row: SupportMessage): Promise<ChatMessage> {
  if (!row.media_url) return row;
  const mediaSignedUrl = await resolveSupportMediaUrl(row.media_url);
  return { ...row, mediaSignedUrl };
}

export function SupportInboxClient({
  projectId,
  companyId,
  initialConversations,
  agentName,
}: {
  projectId: string;
  companyId: string;
  initialConversations: SupportConversation[];
  agentName: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [latestByConversation, setLatestByConversation] = useState<Map<string, LatestInfo>>(
    new Map()
  );
  const [activeTicket, setActiveTicket] = useState<ActiveTicket | null>(null);
  const [sendToDevsOpen, setSendToDevsOpen] = useState(false);
  const [replyToDevsOpen, setReplyToDevsOpen] = useState(false);
  // Reset messages when the selected conversation changes — computed
  // during render (React's documented pattern for "adjusting state on
  // prop change") rather than in an effect, matching ActivityFeed.tsx.
  const [trackedSelectedId, setTrackedSelectedId] = useState(selectedId);
  if (selectedId !== trackedSelectedId) {
    setTrackedSelectedId(selectedId);
    setMessages([]);
    setActiveTicket(null);
  }

  function markRead(conversationId: string) {
    const supabase = createClient();
    const now = new Date().toISOString();
    // setState happens in the .then() callback, not synchronously here —
    // this function is also called directly from an effect body (below),
    // and this codebase's lint rule flags synchronous setState in an
    // effect (see IntegrationsClient.tsx for the same pattern elsewhere).
    supabase
      .from("support_conversations")
      .update({ last_read_at: now })
      .eq("id", conversationId)
      .then(() => {
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, last_read_at: now } : c))
        );
      });
  }

  // Latest message per conversation, for the unread dots — fetched once
  // for every conversation currently in the list, refreshed live below.
  useEffect(() => {
    if (conversations.length === 0) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("support_messages")
      .select("conversation_id, sender_type, created_at")
      .in(
        "conversation_id",
        conversations.map((c) => c.id)
      )
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = new Map<string, LatestInfo>();
        for (const row of data) {
          map.set(row.conversation_id, { createdAt: row.created_at, senderType: row.sender_type });
        }
        setLatestByConversation(map);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length]);

  // New conversations (a customer messaging for the first time) appear in
  // the list live, and every new message updates that conversation's
  // unread dot — same Realtime pattern as DashboardClient.tsx (no
  // server-side `filter:`, see the messages effect below for why).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`support_conversations-${projectId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_conversations" },
        (payload) => {
          const row = payload.new as SupportConversation;
          if (row.project_id !== projectId) return;
          setConversations((prev) =>
            prev.some((c) => c.id === row.id) ? prev : [row, ...prev]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const row = payload.new as SupportMessage;
          setLatestByConversation((prev) => {
            const next = new Map(prev);
            next.set(row.conversation_id, { createdAt: row.created_at, senderType: row.sender_type });
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("support_messages")
      .select("*")
      .eq("conversation_id", selectedId)
      .order("created_at", { ascending: true })
      .then(async ({ data }) => {
        const resolved = await Promise.all((data ?? []).map(toChatMessage));
        if (!cancelled) setMessages(resolved);
      });

    markRead(selectedId);

    // No server-side `filter:` — matches DashboardClient.tsx's proven
    // pattern (found live: a `filter:` param on this exact table/column
    // shape reported "SUBSCRIBED" but silently never delivered events,
    // despite RLS/publication both independently confirmed correct via
    // raw non-React clients). Subscribe to every INSERT, filter client-side.
    const channel = supabase
      .channel(`support_messages-agent-${selectedId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const row = payload.new as SupportMessage;
          if (row.conversation_id !== selectedId) return;
          toChatMessage(row).then((msg) => {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          });
          if (row.sender_type === "customer" || row.sender_type === "dev") markRead(selectedId);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  // Section 16: the currently open ticket (if any) for the selected
  // conversation — "open" here means the latest board_issues row linked to
  // it hasn't been moved to 'closed'. Kept live so a dev moving/closing the
  // ticket from the Issue Board updates the agent's chat header too.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("board_issues")
      .select("id, ticket_number, tab")
      .eq("support_conversation_id", selectedId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const row = data?.[0];
        if (row && row.tab !== "closed" && row.ticket_number != null) {
          setActiveTicket({ boardIssueId: row.id, ticketNumber: row.ticket_number, tab: row.tab });
        } else {
          setActiveTicket(null);
        }
      });

    // No server-side `filter:` — same reasoning as every other
    // subscription in this file.
    const channel = supabase
      .channel(`board_issues-ticket-${selectedId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "board_issues" },
        (payload) => {
          const row = payload.new as BoardIssue;
          if (row.support_conversation_id !== selectedId || row.ticket_number == null) return;
          if (row.tab !== "closed") {
            setActiveTicket({ boardIssueId: row.id, ticketNumber: row.ticket_number, tab: row.tab });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "board_issues" },
        (payload) => {
          const row = payload.new as BoardIssue;
          if (row.support_conversation_id !== selectedId || row.ticket_number == null) return;
          setActiveTicket((prev) => {
            if (row.tab === "closed") {
              return prev?.boardIssueId === row.id ? null : prev;
            }
            return { boardIssueId: row.id, ticketNumber: row.ticket_number!, tab: row.tab };
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  async function handleSendToDevs(input: {
    reporterName: string;
    description: string;
    severity: Severity;
  }) {
    if (!selectedId) return;
    const result = await createSupportTicket({
      projectId,
      conversationId: selectedId,
      reporterName: input.reporterName,
      description: input.description,
      severity: input.severity,
    });
    if (!result.ok) throw new Error(result.error);
    setActiveTicket({ boardIssueId: result.boardIssueId, ticketNumber: result.ticketNumber, tab: "user_complaints" });
    setSendToDevsOpen(false);
  }

  async function handleCloseTicket() {
    if (!selectedId || !activeTicket) return;
    const result = await closeSupportTicket({
      boardIssueId: activeTicket.boardIssueId,
      conversationId: selectedId,
      ticketNumber: activeTicket.ticketNumber,
    });
    if (result.ok) setActiveTicket(null);
  }

  async function handleReplyToDevs(text: string) {
    if (!selectedId) return;
    const result = await replyToDevs({ conversationId: selectedId, text });
    if (!result.ok) throw new Error(result.error);
    // Optimistic append, matching the main send path — no attachment
    // upload racing the subscription here, but consistent is simpler.
    setMessages((prev) =>
      prev.some((m) => m.id === result.message.id) ? prev : [...prev, result.message]
    );
    setReplyToDevsOpen(false);
  }

  async function handleSend(text: string, image?: File) {
    if (!selectedId) return;
    const conversation = conversations.find((c) => c.id === selectedId);
    if (!conversation) return;
    const supabase = createClient();

    let mediaUrl: string | null = null;
    let mediaType: "image" | "none" = "none";
    // Local object URL for the agent's own instant preview — same
    // reasoning as SupportChatClient.tsx: don't wait on Realtime
    // echo-back (or a signed-URL round-trip) to see the message just sent.
    let localPreviewUrl: string | undefined;
    if (image) {
      const formData = new FormData();
      formData.set("image", image);
      const result = await uploadSupportImage(formData);
      if (result.ok) {
        mediaUrl = result.path;
        mediaType = "image";
        localPreviewUrl = URL.createObjectURL(image);
      }
    }

    const { data } = await supabase
      .from("support_messages")
      .insert({
        company_id: companyId,
        conversation_id: selectedId,
        customer_auth_uid: conversation.customer_auth_uid,
        sender_type: "agent",
        sender_name: agentName,
        body: text,
        media_url: mediaUrl,
        media_type: mediaType,
      })
      .select("*")
      .single();

    if (data) {
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, { ...data, mediaSignedUrl: localPreviewUrl }]
      );
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/50">
        {conversations.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No conversations yet.</p>
        ) : (
          conversations.map((c) => {
            const unread = isUnread(c, latestByConversation.get(c.id));
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full items-start gap-2.5 border-b border-slate-100 p-3.5 text-left transition-colors hover:bg-white ${
                  c.id === selectedId ? "bg-white shadow-[inset_2px_0_0_0_theme(colors.indigo.600)]" : ""
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                  {c.customer_email.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}
                  >
                    {c.customer_email}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(c.updated_at).toLocaleDateString()}
                  </p>
                </div>
                {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
              </button>
            );
          })
        )}
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        {selectedId ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
              {activeTicket ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <IconTicket className="h-4 w-4 text-slate-400" />
                  Ticket #{activeTicket.ticketNumber}
                  <span className="text-slate-400">· {activeTicket.tab.replace("_", " ")}</span>
                </span>
              ) : (
                <span className="text-sm text-slate-400">No open ticket</span>
              )}
              {activeTicket ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReplyToDevsOpen(true)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Reply to devs
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseTicket}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Close ticket
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSendToDevsOpen(true)}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  Send case to devs
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <ChatWindow messages={messages} currentSenderType="agent" onSend={handleSend} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Select a conversation
          </div>
        )}
      </div>

      <SendToDevsModal
        open={sendToDevsOpen}
        customerEmail={conversations.find((c) => c.id === selectedId)?.customer_email ?? ""}
        onClose={() => setSendToDevsOpen(false)}
        onSubmit={handleSendToDevs}
      />

      <ReplyToDevsModal
        open={replyToDevsOpen}
        onClose={() => setReplyToDevsOpen(false)}
        onSubmit={handleReplyToDevs}
      />
    </div>
  );
}
