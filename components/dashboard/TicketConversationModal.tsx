"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupportMessage } from "@/lib/types/database";
import { ChatWindow, type ChatMessage } from "@/components/support/ChatWindow";
import { askDevQuestion, resolveSupportMediaUrl } from "@/app/support/[projectId]/actions";
import { IconClose } from "./icons";

async function toChatMessage(row: SupportMessage): Promise<ChatMessage> {
  if (!row.media_url) return row;
  const mediaSignedUrl = await resolveSupportMediaUrl(row.media_url);
  return { ...row, mediaSignedUrl };
}

// Section 16: opened from the Issue Board's IssueDetailPanel for a ticket
// (a board_issues row with support_conversation_id set). A dev sees the
// full customer <-> agent chat (staff RLS grants unrestricted read, same
// as SupportInboxClient) plus any prior dev questions, and can ask a new
// one — which lands in the same support_messages timeline but stays
// invisible to the customer (visible_to_customer=false, RLS-enforced).
export function TicketConversationModal({
  open,
  conversationId,
  ticketNumber,
  onClose,
}: {
  open: boolean;
  conversationId: string;
  ticketNumber: number;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Reset during render (not in the effect below) when a different
  // conversation opens — matches SupportInboxClient.tsx's trackedSelectedId
  // pattern, avoiding a synchronous setState-in-effect lint error.
  if (open && loadedFor !== conversationId) {
    setLoadedFor(conversationId);
    setMessages([]);
    setLoading(true);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("support_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .then(async ({ data }) => {
        const resolved = await Promise.all((data ?? []).map(toChatMessage));
        if (!cancelled) {
          setMessages(resolved);
          setLoading(false);
        }
      });

    // No server-side `filter:` — see SupportInboxClient.tsx for why.
    const channel = supabase
      .channel(`support_messages-dev-${conversationId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const row = payload.new as SupportMessage;
          if (row.conversation_id !== conversationId) return;
          toChatMessage(row).then((msg) => {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [open, conversationId]);

  async function handleAsk(text: string) {
    await askDevQuestion({ conversationId, question: text });
    // No optimistic append needed — sender_type='dev' means the same
    // Realtime path already used for this conversation delivers it back;
    // unlike the customer/agent send paths, there's no attachment upload
    // racing the subscription here, so the echo-back has been reliable.
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Ticket #{ticketNumber} · Customer Conversation
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Loading…
          </div>
        ) : (
          <ChatWindow
            messages={messages}
            currentSenderType="dev"
            onSend={handleAsk}
            allowImages={false}
            composerPlaceholder="Ask the support agent a question…"
          />
        )}
      </div>
    </div>
  );
}
