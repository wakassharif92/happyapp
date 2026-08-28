"use client";

import { useState } from "react";
import type { TabKey } from "@/lib/board/types";
import { TAB_LABELS, TAB_ORDER } from "@/lib/board/types";
import { IconMove } from "./icons";

export function MoveToMenu({
  currentTab,
  onMove,
  compact = false,
}: {
  currentTab: TabKey;
  onMove: (tab: TabKey) => void;
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
          </div>
        </>
      )}
    </div>
  );
}
