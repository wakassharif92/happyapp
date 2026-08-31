"use client";

import { useState } from "react";
import type { FeatureRequestKind } from "@/lib/types/database";
import { IconClose } from "./icons";

const NOUN: Record<FeatureRequestKind, string> = {
  feature: "feature",
  suggestion: "suggestion",
  later_on: "later on item",
};

// Opened from TopBar's "Add" popup (Issue/Feature/Suggestion/Later On)
// regardless of which tab is currently active — matches
// SendToDevsModal.tsx's established convention.
export function AddFeatureModal({
  open,
  kind,
  onClose,
  onSubmit,
}: {
  open: boolean;
  kind: FeatureRequestKind;
  onClose: () => void;
  onSubmit: (input: { title: string; description: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const noun = NOUN[kind];

  async function handleSubmit() {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), description: description.trim() });
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to add ${noun}`);
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
          <h2 className="text-base font-semibold text-slate-900 capitalize">Add {noun}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="input"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Details (optional)"
            className="input"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="btn-primary mt-1"
          >
            {submitting ? "Adding…" : `Add ${noun}`}
          </button>
        </div>
      </div>
    </div>
  );
}
