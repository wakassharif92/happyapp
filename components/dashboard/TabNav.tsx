import type { TabKey } from "@/lib/board/types";
import { TAB_LABELS, TAB_ORDER } from "@/lib/board/types";

export function TabNav({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  counts: Record<TabKey, number>;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {TAB_ORDER.map((tab) => {
        const active = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
              active
                ? "bg-[var(--db-accent)] text-[var(--db-accent-fg)] shadow-sm shadow-[var(--db-accent)]/30"
                : "bg-[var(--db-surface)] text-[var(--db-fg-muted)] hover:border-[var(--db-border-strong)] hover:text-[var(--db-fg)] border border-[var(--db-border)]"
            }`}
          >
            {TAB_LABELS[tab]}
            <span
              className={`rounded-full px-1.5 text-xs tabular-nums ${
                active ? "bg-white/20" : "bg-[var(--db-surface-2)] text-[var(--db-fg-subtle)]"
              }`}
            >
              {counts[tab]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
