import type { TabKey } from "@/lib/board/types";
import { TAB_LABELS } from "@/lib/board/types";

const STATUS_STYLES: Record<TabKey, string> = {
  pending: "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]",
  in_progress: "bg-[var(--status-inprogress-bg)] text-[var(--status-inprogress-fg)]",
  ai_fix: "bg-[var(--status-aifix-bg)] text-[var(--status-aifix-fg)]",
  done: "bg-[var(--status-done-bg)] text-[var(--status-done-fg)]",
  closed: "bg-[var(--status-closed-bg)] text-[var(--status-closed-fg)]",
  user_complaints: "bg-[var(--status-complaint-bg)] text-[var(--status-complaint-fg)]",
};

export function StatusBadge({ tab }: { tab: TabKey }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[tab]}`}
    >
      {TAB_LABELS[tab]}
    </span>
  );
}
