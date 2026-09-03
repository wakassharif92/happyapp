"use client";

import { useState } from "react";
import type { TabKey } from "@/lib/board/types";
import { TAB_LABELS, TAB_ORDER } from "@/lib/board/types";
import type { FeatureRequestKind } from "@/lib/types/database";
import { IconMove } from "./icons";

export function MoveToMenu({
  currentTab,
  onMove,
  onConvert,
  onDelete,
  compact = false,
}: {
  currentTab: TabKey;
  onMove: (tab: TabKey) => void;
  // Dev-side "send this issue to Feature/Suggestion" — a separate action
  // from onMove since it inserts into feature_requests rather than
  // updating board_issues.tab (app/dashboard/featuresActions.ts's
  // convertIssueToFeatureRequest). Optional so MoveToMenu still works
  // anywhere it's used without this wired up.
  onConvert?: (kind: FeatureRequestKind) => void;
  // Permanent delete — optional for the same reason as onConvert.
  onDelete?: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Move to…"
        className={`flex items-center justify-center rounded-md text-[var(--db-fg-subtle)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)] ${
          compact ? "h-7 w-7" : "h-8 w-8"
        }`}
      >
        <IconMove className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--db-border)] bg-[var(--db-surface)] py-1 shadow-lg">
            {TAB_ORDER.filter((t) => t !== currentTab).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  onMove(tab);
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
              >
                Move to {TAB_LABELS[tab]}
              </button>
            ))}
            {onConvert && (
              <>
                <div className="my-1 border-t border-[var(--db-border)]" />
                <button
                  type="button"
                  onClick={() => {
                    onConvert("feature");
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
                >
                  Move to Feature
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConvert("suggestion");
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
                >
                  Move to Suggestion
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConvert("later_on");
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
                >
                  Move to Later On
                </button>
              </>
            )}
            {onDelete && (
              <>
                <div className="my-1 border-t border-[var(--db-border)]" />
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  Delete Issue
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
