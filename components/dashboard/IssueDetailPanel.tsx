"use client";

import { useEffect, useState } from "react";
import type { Category, Issue, TabKey } from "@/lib/board/types";
import { TAB_LABELS, TAB_ORDER } from "@/lib/board/types";
import { initials } from "@/lib/board/format";
import { formatRelativeTime } from "@/lib/board/relativeTime";
import { CategoryDropdown } from "./CategoryDropdown";
import { SeverityTag } from "./SeverityTag";
import { StatusBadge } from "./StatusBadge";
import { Thumbnail } from "./Thumbnail";
import { IconChevronDown, IconClose, IconCopy, IconTicket } from "./icons";

export function IssueDetailPanel({
  issue,
  projectName,
  hasUnreadDevReply = false,
  onClose,
  onCategoryChange,
  onMove,
  onCopyLink,
  onAddComment,
  onConvertToDev,
  onViewTicketConversation,
}: {
  issue: Issue | null;
  projectName: string;
  hasUnreadDevReply?: boolean;
  onClose: () => void;
  onCategoryChange: (id: string, category: Category) => void;
  onMove: (id: string, tab: TabKey) => void;
  onCopyLink: (id: string) => void;
  onAddComment: (id: string, text: string) => void;
  onConvertToDev: (id: string) => void;
  onViewTicketConversation: (conversationId: string, ticketNumber: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  // Which image is open full-screen — the primary Thumbnail or any of
  // issue.extraMediaUrls — rather than a plain boolean, since there can
  // now be more than one image to zoom into.
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxUrl) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxUrl(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxUrl]);

  if (!issue) return null;
  const isComplaint = issue.tab === "user_complaints";

  function submitComment() {
    if (!issue || !draft.trim()) return;
    onAddComment(issue.id, draft.trim());
    setDraft("");
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-[var(--db-overlay)]" onClick={onClose} />
      <div className="fixed right-0 top-0 z-40 flex h-full w-full flex-col overflow-y-auto border-l border-[var(--db-border)] bg-[var(--db-surface)] shadow-2xl sm:w-[480px]">
        <div className="flex items-center justify-between border-b border-[var(--db-border)] p-4">
          <div className="flex items-center gap-2">
            <StatusBadge tab={issue.tab} />
            {isComplaint && issue.severity && <SeverityTag severity={issue.severity} />}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--db-fg-subtle)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-2">
            {issue.mediaType === "image" && issue.mediaUrl ? (
              <button
                type="button"
                onClick={() => setLightboxUrl(issue.mediaUrl)}
                className="cursor-zoom-in text-left"
              >
                <Thumbnail
                  mediaType={issue.mediaType}
                  color={issue.thumbnailColor}
                  mediaUrl={issue.mediaUrl}
                  size="lg"
                />
              </button>
            ) : (
              <Thumbnail
                mediaType={issue.mediaType}
                color={issue.thumbnailColor}
                mediaUrl={issue.mediaUrl}
                size="lg"
              />
            )}

            {issue.extraMediaUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {issue.extraMediaUrls.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setLightboxUrl(url)}
                    className="cursor-zoom-in"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="Additional attachment"
                      className="h-16 w-16 rounded-lg border border-[var(--db-border)] object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[var(--db-fg)]">{issue.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--db-fg-muted)]">
              {issue.message}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--db-border)] p-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--db-fg-subtle)]">Sender</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-[var(--db-fg)]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--db-accent-soft)] text-[10px] font-semibold text-[var(--db-accent)]">
                  {initials(issue.senderName)}
                </span>
                {issue.senderName}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--db-fg-subtle)]">Source</dt>
              <dd className="mt-0.5 font-medium text-[var(--db-fg)]">{issue.sourceChannel}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--db-fg-subtle)]">Project</dt>
              <dd className="mt-0.5 font-medium text-[var(--db-fg)]">{projectName}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--db-fg-subtle)]">Reported</dt>
              <dd className="mt-0.5 font-medium text-[var(--db-fg)]" suppressHydrationWarning>
                {formatRelativeTime(issue.createdAt)}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[var(--db-fg-subtle)]">Category</span>
              <CategoryDropdown
                value={issue.category}
                onChange={(cat) => onCategoryChange(issue.id, cat)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[var(--db-fg-subtle)]">Status</span>
              <div className="relative inline-flex items-center rounded-md border border-[var(--db-border)] bg-[var(--db-surface)] text-sm text-[var(--db-fg)] transition-colors hover:border-[var(--db-border-strong)]">
                <select
                  value={issue.tab}
                  onChange={(e) => onMove(issue.id, e.target.value as TabKey)}
                  className="appearance-none bg-transparent py-1.5 pl-2 pr-6 text-sm outline-none"
                >
                  {TAB_ORDER.map((tab) => (
                    <option key={tab} value={tab}>
                      {TAB_LABELS[tab]}
                    </option>
                  ))}
                </select>
                <IconChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3" />
              </div>
            </div>
          </div>

          {isComplaint && (
            <button
              type="button"
              onClick={() => onConvertToDev(issue.id)}
              className="rounded-lg border border-[var(--db-border-strong)] px-4 py-2 text-sm font-medium text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
            >
              Convert to Dev Issue
            </button>
          )}

          {issue.supportConversationId && issue.ticketNumber != null && (
            <button
              type="button"
              onClick={() =>
                onViewTicketConversation(issue.supportConversationId!, issue.ticketNumber!)
              }
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--db-border-strong)] px-4 py-2 text-sm font-medium text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
            >
              <IconTicket className="h-4 w-4" />
              View Conversation · Ticket #{issue.ticketNumber}
              {hasUnreadDevReply && <span className="h-2 w-2 rounded-full bg-red-500" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onCopyLink(issue.id);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--db-accent)] px-4 py-2 text-sm font-medium text-[var(--db-accent-fg)] shadow-sm transition-colors hover:bg-[var(--db-accent-hover)]"
          >
            <IconCopy className="h-4 w-4" />
            {copied ? "Copied!" : "Copy Public PDF Link"}
          </button>

          <div>
            <h3 className="text-sm font-semibold text-[var(--db-fg)]">Notes</h3>
            <div className="mt-2 flex flex-col gap-3">
              {issue.comments.length === 0 && (
                <p className="text-sm text-[var(--db-fg-subtle)]">No notes yet.</p>
              )}
              {issue.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-[var(--db-surface-2)] p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--db-fg)]">{c.author}</span>
                    <span className="text-xs text-[var(--db-fg-subtle)]" suppressHydrationWarning>
                      {formatRelativeTime(c.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--db-fg-muted)]">{c.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitComment()}
                placeholder="Leave an internal note…"
                className="flex-1 rounded-lg border border-[var(--db-border)] bg-[var(--db-bg)] px-3 py-2 text-sm text-[var(--db-fg)] outline-none placeholder:text-[var(--db-fg-subtle)] focus:border-[var(--db-accent)]"
              />
              <button
                type="button"
                onClick={submitComment}
                className="rounded-lg border border-[var(--db-border)] px-3 py-2 text-sm font-medium text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
              >
                Post
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--db-fg)]">Activity</h3>
            <ul className="mt-2 flex flex-col gap-2 border-l border-[var(--db-border)] pl-3">
              {issue.activity.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-medium text-[var(--db-fg)]">{a.actor}</span>{" "}
                  <span className="text-[var(--db-fg-muted)]">{a.text.toLowerCase()}</span>{" "}
                  <span className="text-xs text-[var(--db-fg-subtle)]" suppressHydrationWarning>
                    · {formatRelativeTime(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
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
            alt={issue.title}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
