"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupportMessage } from "@/lib/types/database";
import { ChatWindow } from "@/components/support/ChatWindow";
import { claimConversation } from "./actions";

type LoadState = "connecting" | "ready" | "error";

export function SupportChatClient({
  projectId,
  projectName,
  email,
}: {
  projectId: string;
  projectName: string;
  email: string;
}) {
  const [state, setState] = useState<LoadState>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [customerAuthUid, setCustomerAuthUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function setup() {
      // Get (or create) this browser's anonymous identity — invisible to
      // the customer, just needed so RLS can scope their conversation.
      let {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) {
          if (!cancelled) {
            setErrorMessage(signInError.message);
            setState("error");
          }
          return;
        }
        session = signInData.session;
      }
      if (!cancelled) setCustomerAuthUid(session?.user.id ?? null);

      const result = await claimConversation(projectId, email);
      if (!result.ok) {
        if (!cancelled) {
          setErrorMessage(result.error);
          setState("error");
        }
        return;
      }
      if (cancelled) return;

      const { data: existing } = await supabase
        .from("support_messages")
        .select("*")
        .eq("conversation_id", result.conversationId)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      setMessages(existing ?? []);
      setConversationId(result.conversationId);
      setState("ready");

      // No server-side `filter:` — matches DashboardClient.tsx's proven
      // pattern (a `filter:` on this exact table/column shape reported
      // "SUBSCRIBED" but silently never delivered events, despite
      // RLS/publication both independently confirmed correct via raw
      // non-React clients — see SupportInboxClient.tsx). Subscribe to
      // every INSERT, filter client-side.
      const channel = supabase
        .channel(`support_messages-${result.conversationId}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "support_messages" },
          (payload) => {
            const row = payload.new as SupportMessage;
            if (row.conversation_id !== result.conversationId) return;
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    const cleanupPromise = setup();
    return () => {
      cancelled = true;
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [projectId, email]);

  async function handleSend(text: string) {
    if (!conversationId || !customerAuthUid) return;
    const supabase = createClient();
    await supabase.from("support_messages").insert({
      conversation_id: conversationId,
      customer_auth_uid: customerAuthUid,
      sender_type: "customer",
      sender_name: email,
      body: text,
    });
  }

  if (state === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm font-medium text-slate-900">Couldn&apos;t start the chat</p>
        <p className="text-sm text-slate-500">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-900">{projectName} Support</p>
        <p className="text-xs text-slate-500">{email}</p>
      </div>
      {state === "connecting" ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Connecting…
        </div>
      ) : (
        <ChatWindow messages={messages} currentSenderType="customer" onSend={handleSend} />
      )}
    </div>
  );
}
