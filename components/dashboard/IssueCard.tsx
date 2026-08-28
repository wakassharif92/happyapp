"use client";

import { useState } from "react";
import type { Category, Issue, TabKey } from "@/lib/board/types";
import type { FeatureRequestKind } from "@/lib/types/database";
import { initials } from "@/lib/board/format";
import { formatRelativeTime } from "@/lib/board/relativeTime";
import { CategoryDropdown } from "./CategoryDropdown";
import { MoveToMenu } from "./MoveToMenu";
import { SeverityTag } from "./SeverityTag";
import { StatusBadge } from "./StatusBadge";
import { Thumbnail } from "./Thumbnail";
import { IconCopy, IconExpand } from "./icons";

export function IssueCard({
  issue,
  hasUnreadDevReply = false,
  onOpenDetail,
  onCategoryChange,
  onMove,
  onConvert,
  onCopyLink,
  onConvertToDev,
}: {
  issue: Issue;
  hasUnreadDevReply?: boolean;
  onOpenDetail: (id: string) => void;
  onCategoryChange: (id: string, category: Category) => void;
  onMove: (id: string, tab: TabKey) => void;
  onConvert?: (id: string, kind: FeatureRequestKind) => void;
  onCopyLink: (id: string) => void;
  onConvertToDev: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isComplaint = issue.tab === "user_complaints";
  const isAiFix = issue.tab === "ai_fix";

  return (
    <div
      onClick={() => onOpenDetail(issue.id)}
      className={`group flex cursor-pointer gap-3 rounded-xl border bg-[var(--db-surface)] p-3 transition-colors hover:border-[var(--db-border-strong)] sm:gap-4 sm:p-4 ${
        isComplaint ? "border-[var(--status-complaint-fg)]/30" : "border-[var(--db-border)]"
      }`}
    >
      <Thumbnail mediaType={issue.mediaType} color={issue.thumbnailColor} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--db-accent-soft)] text-[11px] font-semibold text-[var(--db-accent)]">
              {initials(issue.senderName)}
            </div>
            <span className="truncate text-sm font-medium text-[var(--db-fg-muted)]">
              {issue.senderName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasUnreadDevReply && (
              <span
                title="New reply from support agent"
                className="h-2 w-2 shrink-0 rounded-full bg-red-500"
              />
            )}
            <StatusBadge tab={issue.tab} />
            {isAiFix && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Verify needed
              </span>
            )}
            {isComplaint && issue.severity && <SeverityTag severity={issue.severity} />}
          </div>
        </div>

        <div>
          <p className="truncate text-sm font-semibold text-[var(--db-fg)]">{issue.title}</p>
          <p className="line-clamp-2 text-sm text-[var(--db-fg-muted)]">{issue.message}</p>
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CategoryDropdown
              value={issue.category}
              onChange={(cat) => onCategoryChange(issue.id, cat)}
              compact
            />
            <span
              className="text-xs text-[var(--db-fg-subtle)]"
              suppressHydrationWarning
            >
              {formatRelativeTime(issue.createdAt)}
            </span>
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {isComplaint && (
              <button
                type="button"
                onClick={() => onConvertToDev(issue.id)}
                className="mr-1 rounded-md border border-[var(--db-border)] px-2 py-1 text-xs font-medium text-[var(--db-fg-muted)] transition-colors hover:border-[var(--db-border-strong)] hover:text-[var(--db-fg)]"
              >
                Convert to Dev Issue
              </button>
            )}
            {isAiFix && (
              <>
                <button
                  type="button"
                  onClick={() => onMove(issue.id, "done")}
                  title="Verified — the fix actually works"
                  className="mr-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                >
                  Mark as Fixed
                </button>
                <button
                  type="button"
                  onClick={() => onMove(issue.id, "pending")}
                  title="Not actually fixed — add a note explaining why, then send back for another attempt"
                  className="mr-1 rounded-md border border-[var(--db-border)] px-2 py-1 text-xs font-medium text-[var(--db-fg-muted)] transition-colors hover:border-[var(--db-border-strong)] hover:text-[var(--db-fg)]"
                >
                  Send back to Vibe Coding
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                onCopyLink(issue.id);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              title="Copy PDF link"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--db-fg-subtle)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
            >
              <IconCopy className="h-4 w-4" />
            </button>
            <span
              className={`text-xs text-[var(--db-accent)] transition-opacity ${copied ? "opacity-100" : "opacity-0"}`}
            >
              {copied ? "Copied!" : ""}
            </span>
            <button
              type="button"
              onClick={() => onOpenDetail(issue.id)}
              title="Open detail"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--db-fg-subtle)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
            >
              <IconExpand className="h-4 w-4" />
            </button>
            <MoveToMenu
              currentTab={issue.tab}
              onMove={(tab) => onMove(issue.id, tab)}
              onConvert={onConvert ? (kind) => onConvert(issue.id, kind) : undefined}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  );
}
