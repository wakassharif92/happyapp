"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupportMessage } from "@/lib/types/database";
import { ChatWindow, type ChatMessage } from "@/components/support/ChatWindow";
import { claimConversation, resolveSupportMediaUrl, uploadSupportImage } from "./actions";

type LoadState = "connecting" | "ready" | "error";

async function toChatMessage(row: SupportMessage): Promise<ChatMessage> {
  if (!row.media_url) return row;
  const mediaSignedUrl = await resolveSupportMediaUrl(row.media_url);
  return { ...row, mediaSignedUrl };
}

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
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [customerAuthUid, setCustomerAuthUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOpenTicket, setHasOpenTicket] = useState(false);
  const [resolvedBannerDismissed, setResolvedBannerDismissed] = useState(false);

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
      setHasOpenTicket(result.hasOpenTicket);
      setCompanyId(result.companyId);

      const { data: existing } = await supabase
        .from("support_messages")
        .select("*")
        .eq("conversation_id", result.conversationId)
        .order("created_at", { ascending: true });

      const resolved = await Promise.all((existing ?? []).map(toChatMessage));
      if (cancelled) return;
      setMessages(resolved);
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
            toChatMessage(row).then((msg) => {
              setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            });
          }
        )
        .subscribe();

      // Keeps the "marked resolved / start a new issue" banner live when
      // the agent closes (or a new ticket reopens) this conversation while
      // the customer already has the page open.
      const conversationChannel = supabase
        .channel(`support_conversations-customer-${result.conversationId}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "support_conversations" },
          (payload) => {
            const row = payload.new as { id: string; has_open_ticket: boolean };
            if (row.id !== result.conversationId) return;
            setHasOpenTicket(row.has_open_ticket);
            if (row.has_open_ticket) setResolvedBannerDismissed(false);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(conversationChannel);
      };
    }

    const cleanupPromise = setup();
    return () => {
      cancelled = true;
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [projectId, email]);

  async function handleSend(text: string, image?: File) {
    if (!conversationId || !customerAuthUid || !companyId) return;
    setResolvedBannerDismissed(true);
    const supabase = createClient();

    let mediaUrl: string | null = null;
    let mediaType: "image" | "none" = "none";
    // A local object URL for the sender's own instant preview — no need
    // to wait for a signed-URL round-trip to see the image you just sent.
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

    // Optimistic: append from the insert's own returned row rather than
    // waiting on the Realtime echo-back — the sender should never have to
    // wait for their own message to round-trip through Realtime, and the
    // dedup-by-id in the subscription handler above skips it if the echo
    // does arrive later anyway.
    const { data } = await supabase
      .from("support_messages")
      .insert({
        company_id: companyId,
        conversation_id: conversationId,
        customer_auth_uid: customerAuthUid,
        sender_type: "customer",
        sender_name: email,
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

  // The only customer-visible 'system' message this app ever creates is
  // closeSupportTicket's "marked resolved" notice — so any such message
  // present, combined with no ticket currently open, means the customer's
  // last issue was resolved and they haven't started a new one yet.
  const showResolvedBanner =
    !hasOpenTicket && !resolvedBannerDismissed && messages.some((m) => m.sender_type === "system");

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
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3.5 shadow-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
          {projectName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{projectName} Support</p>
          <p className="truncate text-xs text-slate-500">{email}</p>
        </div>
      </div>
      {state === "connecting" ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Connecting…
        </div>
      ) : (
        <>
          {showResolvedBanner && (
            <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-2.5">
              <p className="text-sm text-emerald-800">
                ✅ Your issue was marked resolved. Have something else?
              </p>
              <button
                type="button"
                onClick={() => setResolvedBannerDismissed(true)}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
              >
                Start New Issue
              </button>
            </div>
          )}
          <ChatWindow messages={messages} currentSenderType="customer" onSend={handleSend} />
        </>
      )}
    </div>
  );
}
