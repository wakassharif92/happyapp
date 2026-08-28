"use client";

import { useState } from "react";
import { IconClose } from "@/components/dashboard/icons";

// Section 16 follow-up: the agent's half of the internal side-channel with
// devs — kept as its own small modal, distinct from the main chat
// composer, so there's never a "which mode am I in" mistake that could
// leak an internal reply to the customer or vice versa.
export function ReplyToDevsModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Reply to devs</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          This is internal — the customer will never see it.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Your reply…"
            className="input"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            className="btn-primary mt-1"
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
