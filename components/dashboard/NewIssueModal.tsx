"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, MediaType, Severity, SourceChannel } from "@/lib/board/types";
import { CATEGORIES, SEVERITIES } from "@/lib/board/types";
import { IconClose, IconPaperclip } from "./icons";

export type NewIssueInput = {
  title: string;
  message: string;
  category: Category;
  sourceChannel: SourceChannel;
  severity?: Severity;
  mediaType: MediaType;
  // Already-uploaded whatsapp-media Storage paths, in the order picked —
  // the first becomes board_issues.media_url (the "primary" image every
  // other code path already expects); any beyond that go into the new
  // board_issue_media table (migration 0022). Never raw Files — the
  // upload happens here, before onCreate is even called, so the parent
  // never has to deal with browser File objects.
  mediaPaths: string[];
};

type PickedImage = { file: File; previewUrl: string };

const SOURCE_CHANNELS: SourceChannel[] = ["Slack", "QA", "Manual", "User Complaint"];

// Opened from TopBar's "Add" popup. Two ways to submit — "Create Issue"
// (submits and closes, the original behavior) and "Add Another" (submits
// but keeps the sheet open with title/description/images cleared, so a
// dev triaging a batch of issues doesn't have to reopen this each time).
// Neither waits for the actual board_issues insert to finish before
// clearing the form — only the image upload (a real network step this
// component owns) is awaited; onCreate is fired and handled optimistically
// by the caller (DashboardClient.tsx), which is what makes "Add Another"
// feel instant rather than waiting out a full round trip each time.
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
  const [images, setImages] = useState<PickedImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const isComplaint = sourceChannel === "User Complaint";

  function clearImages() {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
  }

  function reset() {
    setTitle("");
    setMessage("");
    setCategory("Frontend");
    setSourceChannel("Manual");
    setSeverity("Medium");
    clearImages();
  }

  // "Add Another" keeps Category/Source/Severity as-is (convenient when
  // triaging a batch of similar issues) — only the per-issue fields
  // clear.
  function resetForNextEntry() {
    setTitle("");
    setMessage("");
    clearImages();
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function uploadImages(): Promise<string[]> {
    if (images.length === 0) return [];
    const supabase = createClient();
    return Promise.all(
      images.map(async ({ file }) => {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `issue-${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("whatsapp-media")
          .upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        return path;
      })
    );
  }

  async function submit(keepOpen: boolean) {
    if (!title.trim() || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const mediaPaths = await uploadImages();
      onCreate({
        title: title.trim(),
        message: message.trim(),
        category,
        sourceChannel,
        severity: isComplaint ? severity : undefined,
        mediaType: mediaPaths.length > 0 ? "image" : "none",
        mediaPaths,
      });
      if (keepOpen) {
        resetForNextEntry();
      } else {
        reset();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload images");
    } finally {
      setSubmitting(false);
    }
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
          className="flex flex-col gap-3 p-4"
        >
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

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium text-[var(--db-fg-muted)]">
              Screenshots (optional)
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="hidden"
              id="new-issue-images"
            />
            <div className="flex flex-wrap gap-2">
              {images.map((img, index) => (
                <div key={img.previewUrl} className="group relative h-16 w-16 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.previewUrl}
                    alt=""
                    className="h-full w-full rounded-lg border border-[var(--db-border)] object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    title="Remove"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm"
                  >
                    <IconClose className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--db-border)] text-[var(--db-fg-subtle)] transition-colors hover:border-[var(--db-border-strong)] hover:text-[var(--db-fg-muted)]"
              >
                <IconPaperclip className="h-4 w-4" />
                <span className="text-[10px] font-medium">Add</span>
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--db-border)] px-4 py-2 text-sm font-medium text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || !title.trim() || !message.trim()}
              onClick={() => submit(true)}
              className="rounded-lg border border-[var(--db-border-strong)] px-4 py-2 text-sm font-medium text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)] disabled:opacity-50"
            >
              Add Another
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !message.trim()}
              className="rounded-lg bg-[var(--db-accent)] px-4 py-2 text-sm font-medium text-[var(--db-accent-fg)] shadow-sm transition-colors hover:bg-[var(--db-accent-hover)] disabled:opacity-50"
            >
              {submitting ? "Uploading…" : "Create Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
