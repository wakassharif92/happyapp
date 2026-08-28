import type { BoardView } from "@/lib/board/types";
import { VIEW_LABELS, VIEW_ORDER } from "@/lib/board/types";

export function TabNav({
  activeView,
  onViewChange,
  counts,
}: {
  activeView: BoardView;
  onViewChange: (view: BoardView) => void;
  counts: Partial<Record<BoardView, number>>;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {VIEW_ORDER.map((view) => {
        const active = view === activeView;
        const count = counts[view];
        return (
          <button
            key={view}
            type="button"
            onClick={() => onViewChange(view)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
              active
                ? "bg-[var(--db-accent)] text-[var(--db-accent-fg)] shadow-sm shadow-[var(--db-accent)]/30"
                : "bg-[var(--db-surface)] text-[var(--db-fg-muted)] hover:border-[var(--db-border-strong)] hover:text-[var(--db-fg)] border border-[var(--db-border)]"
            }`}
          >
            {VIEW_LABELS[view]}
            {count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  active ? "bg-white/20" : "bg-[var(--db-surface-2)] text-[var(--db-fg-subtle)]"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
