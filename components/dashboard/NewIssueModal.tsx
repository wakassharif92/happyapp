"use client";

import { useState } from "react";
import type { Category, MediaType, Severity, SourceChannel } from "@/lib/board/types";
import { CATEGORIES, SEVERITIES } from "@/lib/board/types";
import { IconClose } from "./icons";

export type NewIssueInput = {
  title: string;
  message: string;
  category: Category;
  sourceChannel: SourceChannel;
  severity?: Severity;
  mediaType: MediaType;
};

const SOURCE_CHANNELS: SourceChannel[] = ["Slack", "QA", "Manual", "User Complaint"];

export function NewIssueModal({
  open,
  onClose,
  projectName,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  onCreate: (input: NewIssueInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category>("Frontend");
  const [sourceChannel, setSourceChannel] = useState<SourceChannel>("Manual");
  const [severity, setSeverity] = useState<Severity>("Medium");
  const [mediaType, setMediaType] = useState<MediaType>("none");

  if (!open) return null;

  const isComplaint = sourceChannel === "User Complaint";

  function reset() {
    setTitle("");
    setMessage("");
    setCategory("Frontend");
    setSourceChannel("Manual");
    setSeverity("Medium");
    setMediaType("none");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    onCreate({
      title: title.trim(),
      message: message.trim(),
      category,
      sourceChannel,
      severity: isComplaint ? severity : undefined,
      mediaType,
    });
    reset();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--db-overlay)] p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--db-border)] bg-[var(--db-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--db-border)] p-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--db-fg)]">New Issue</h2>
            <p className="text-xs text-[var(--db-fg-subtle)]">in {projectName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--db-fg-subtle)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--db-fg-muted)]">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Short summary of the issue"
              className="rounded-lg border border-[var(--db-border)] bg-[var(--db-bg)] px-3 py-2 text-sm text-[var(--db-fg)] outline-none placeholder:text-[var(--db-fg-subtle)] focus:border-[var(--db-accent)]"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--db-fg-muted)]">Description</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={4}
              placeholder="What happened? Steps to reproduce, if you can…"
              className="rounded-lg border border-[var(--db-border)] bg-[var(--db-bg)] px-3 py-2 text-sm text-[var(--db-fg)] outline-none placeholder:text-[var(--db-fg-subtle)] focus:border-[var(--db-accent)]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--db-fg-muted)]">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="rounded-lg border border-[var(--db-border)] bg-[var(--db-bg)] px-3 py-2 text-sm text-[var(--db-fg)] outline-none focus:border-[var(--db-accent)]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--db-fg-muted)]">Source</span>
              <select
                value={sourceChannel}
                onChange={(e) => setSourceChannel(e.target.value as SourceChannel)}
                className="rounded-lg border border-[var(--db-border)] bg-[var(--db-bg)] px-3 py-2 text-sm text-[var(--db-fg)] outline-none focus:border-[var(--db-accent)]"
              >
                {SOURCE_CHANNELS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {isComplaint && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--db-fg-muted)]">Severity</span>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="rounded-lg border border-[var(--db-border)] bg-[var(--db-bg)] px-3 py-2 text-sm text-[var(--db-fg)] outline-none focus:border-[var(--db-accent)]"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--db-fg-muted)]">Attachment</span>
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as MediaType)}
                className="rounded-lg border border-[var(--db-border)] bg-[var(--db-bg)] px-3 py-2 text-sm text-[var(--db-fg)] outline-none focus:border-[var(--db-accent)]"
              >
                <option value="none">None</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </label>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--db-border)] px-4 py-2 text-sm font-medium text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--db-accent)] px-4 py-2 text-sm font-medium text-[var(--db-accent-fg)] shadow-sm transition-colors hover:bg-[var(--db-accent-hover)]"
            >
              Create Issue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
