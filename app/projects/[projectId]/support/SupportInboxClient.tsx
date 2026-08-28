"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupportConversation, SupportMessage } from "@/lib/types/database";
import { ChatWindow } from "@/components/support/ChatWindow";

export function SupportInboxClient({
  projectId,
  initialConversations,
  agentName,
}: {
  projectId: string;
  initialConversations: SupportConversation[];
  agentName: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null
  );
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  // Reset messages when the selected conversation changes — computed
  // during render (React's documented pattern for "adjusting state on
  // prop change") rather than in an effect, matching ActivityFeed.tsx.
  const [trackedSelectedId, setTrackedSelectedId] = useState(selectedId);
  if (selectedId !== trackedSelectedId) {
    setTrackedSelectedId(selectedId);
    setMessages([]);
  }

  // New conversations (a customer messaging for the first time) appear in
  // the list live, same Realtime pattern as DashboardClient.tsx.
  useEffect(() => {
    const supabase = createClient();
    // No server-side `filter:` — matches DashboardClient.tsx's proven
    // pattern; see the messages effect below for why filter: was dropped.
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
      .then(({ data }) => {
        if (!cancelled) setMessages(data ?? []);
      });

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
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  async function handleSend(text: string) {
    if (!selectedId) return;
    const conversation = conversations.find((c) => c.id === selectedId);
    if (!conversation) return;
    const supabase = createClient();
    await supabase.from("support_messages").insert({
      conversation_id: selectedId,
      customer_auth_uid: conversation.customer_auth_uid,
      sender_type: "agent",
      sender_name: agentName,
      body: text,
    });
  }

  return (
    <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200">
        {conversations.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No conversations yet.</p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`block w-full border-b border-slate-100 p-3 text-left transition-colors hover:bg-slate-50 ${
                c.id === selectedId ? "bg-indigo-50" : ""
              }`}
            >
              <p className="truncate text-sm font-medium text-slate-900">{c.customer_email}</p>
              <p className="text-xs text-slate-400">
                {c.status} · {new Date(c.updated_at).toLocaleDateString()}
              </p>
            </button>
          ))
        )}
      </aside>

      <div className="flex-1">
        {selectedId ? (
          <ChatWindow messages={messages} currentSenderType="agent" onSend={handleSend} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
