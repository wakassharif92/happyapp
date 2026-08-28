import type { TabKey } from "@/lib/board/types";
import { TAB_LABELS } from "@/lib/board/types";
import { IconInbox, IconMegaphone } from "./icons";

export function EmptyState({ tab }: { tab: TabKey }) {
  const isComplaint = tab === "user_complaints";

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--db-border)] py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--db-surface-2)] text-[var(--db-fg-subtle)]">
        {isComplaint ? <IconMegaphone className="h-5 w-5" /> : <IconInbox className="h-5 w-5" />}
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--db-fg)]">
          {isComplaint ? "No complaints yet — nice!" : `Nothing in ${TAB_LABELS[tab]}`}
        </p>
        <p className="mt-1 text-sm text-[var(--db-fg-muted)]">
          {isComplaint
            ? "End-user reports will show up here as they come in."
            : "Issues will appear here once they land in this stage."}
        </p>
      </div>
    </div>
  );
}
