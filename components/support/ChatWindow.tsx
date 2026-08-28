"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SupportMessage } from "@/lib/types/database";
import { IconClose, IconImage } from "@/components/dashboard/icons";

export type ChatMessage = SupportMessage & { mediaSignedUrl?: string | null };

// Shared presentational chat UI for all three participants in a support
// conversation (Section 14/16): the customer's public chat page, the
// agent's authenticated inbox, and a dev's read-mostly ticket view. Which
// side "owns" a given message (and so gets the right-aligned bubble) is
// purely `sender_type === currentSenderType`. 'system'/'dev' messages
// (ticket status, dev questions) never reach the customer at all — RLS
// filters them out of the query before they get here — but render
// distinctly for staff viewers. `media_url` on a message is a private
// Storage path — callers resolve it to `mediaSignedUrl` before handing
// messages here (this component never touches Supabase Storage directly).
export function ChatWindow({
  messages,
  currentSenderType,
  onSend,
  disabled = false,
  allowImages = true,
  composerPlaceholder = "Type a message…",
}: {
  messages: ChatMessage[];
  currentSenderType: "customer" | "agent" | "dev";
  onSend: (text: string, image?: File) => void;
  disabled?: boolean;
  allowImages?: boolean;
  composerPlaceholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!lightboxUrl) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxUrl(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxUrl]);

  // Derived purely from pendingImage — a plain computed value (useMemo),
  // not synced state, so there's no setState-in-effect involved. The
  // effect below only exists for the browser-API cleanup (revoking the
  // object URL), which is legitimate "sync with an external system".
  const pendingPreviewUrl = useMemo(
    () => (pendingImage ? URL.createObjectURL(pendingImage) : null),
    [pendingImage]
  );
  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  function submit() {
    const text = draft.trim();
    if ((!text && !pendingImage) || disabled) return;
    onSend(text, pendingImage ?? undefined);
    setDraft("");
    setPendingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">No messages yet — say hello.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              if (m.sender_type === "system") {
                return (
                  <div key={m.id} className="flex justify-center">
                    <span className="rounded-full bg-slate-200/70 px-3 py-1 text-xs font-medium text-slate-500">
                      {m.body}
                      {!m.visible_to_customer && (
                        <span className="ml-1.5 text-slate-400">· internal</span>
                      )}
                    </span>
                  </div>
                );
              }

              const isOwn = m.sender_type === currentSenderType;
              const isDev = m.sender_type === "dev";
              // An agent's own internal reply to devs looks identical to a
              // normal customer-facing reply (same sender_type='agent')
              // unless flagged — this label is what stops an agent from
              // mistaking one for the other in their own chat history.
              const isInternal = !m.visible_to_customer;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
                >
                  {isInternal && (
                    <span className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                      {isDev ? "Dev question" : "To devs"} · internal
                    </span>
                  )}
                  <div
                    className={`max-w-[80%] overflow-hidden rounded-2xl text-sm shadow-sm ${
                      isInternal
                        ? "border border-amber-200 bg-amber-50 text-amber-900"
                        : isOwn
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-200 bg-white text-slate-900"
                    } ${m.mediaSignedUrl ? "p-1.5" : "px-3.5 py-2.5"}`}
                  >
                    {m.mediaSignedUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(m.mediaSignedUrl!)}
                        className="block w-full cursor-zoom-in"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.mediaSignedUrl}
                          alt="Attachment"
                          className="max-h-64 w-full rounded-xl object-cover"
                        />
                      </button>
                    )}
                    {m.body && (
                      <p className={m.mediaSignedUrl ? "px-2 pb-1 pt-2" : ""}>{m.body}</p>
                    )}
                  </div>
                  <span className="mt-1 px-1 text-xs text-slate-400">
                    {isOwn ? "" : `${m.sender_name} · `}
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 bg-white p-3">
        {pendingPreviewUrl && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingPreviewUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
            <span className="flex-1 truncate text-xs text-slate-500">{pendingImage?.name}</span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
            >
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          {allowImages && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setPendingImage(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                title="Attach an image"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
              >
                <IconImage className="h-4 w-4" />
              </button>
            </>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={composerPlaceholder}
            disabled={disabled}
            className="input"
          />
          <button
            type="button"
            onClick={submit}
            disabled={disabled || (!draft.trim() && !pendingImage)}
            className="btn-primary shrink-0"
          >
            Send
          </button>
        </div>
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            title="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <IconClose className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Attachment, full size"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
