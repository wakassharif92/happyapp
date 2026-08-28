"use client";

import { useEffect, useRef, useState } from "react";
import type { SupportMessage } from "@/lib/types/database";

// Shared presentational chat UI for both sides of the support conversation
// (Section 14) — the customer's public chat page and the agent's
// authenticated inbox. Which side "owns" a given message (and so gets the
// right-aligned bubble) is purely `sender_type === currentSenderType`.
export function ChatWindow({
  messages,
  currentSenderType,
  onSend,
  disabled = false,
}: {
  messages: SupportMessage[];
  currentSenderType: "customer" | "agent";
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function submit() {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">No messages yet — say hello.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => {
              const isOwn = m.sender_type === currentSenderType;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      isOwn
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="mt-0.5 px-1 text-xs text-slate-400">
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

      <div className="flex gap-2 border-t border-slate-200 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Type a message…"
          disabled={disabled}
          className="input"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !draft.trim()}
          className="btn-primary"
        >
          Send
        </button>
      </div>
    </div>
  );
}
