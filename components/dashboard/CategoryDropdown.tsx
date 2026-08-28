import type { Category } from "@/lib/board/types";
import { CATEGORIES } from "@/lib/board/types";
import { IconChevronDown } from "./icons";

export function CategoryDropdown({
  value,
  onChange,
  compact = false,
}: {
  value: Category;
  onChange: (category: Category) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative inline-flex items-center rounded-md border border-[var(--db-border)] bg-[var(--db-surface)] text-[var(--db-fg-muted)] transition-colors hover:border-[var(--db-border-strong)] ${
        compact ? "text-xs" : "text-sm"
      }`}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Category)}
        onClick={(e) => e.stopPropagation()}
        className={`appearance-none bg-transparent py-1 pl-2 pr-6 outline-none ${compact ? "text-xs" : "text-sm"}`}
      >
        {CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>
      <IconChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3" />
    </div>
  );
}
