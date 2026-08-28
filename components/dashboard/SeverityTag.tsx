import type { Severity } from "@/lib/board/types";

const SEVERITY_STYLES: Record<Severity, string> = {
  Low: "bg-[var(--severity-low-bg)] text-[var(--severity-low-fg)]",
  Medium: "bg-[var(--severity-medium-bg)] text-[var(--severity-medium-fg)]",
  High: "bg-[var(--severity-high-bg)] text-[var(--severity-high-fg)]",
};

export function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_STYLES[severity]}`}
    >
      {severity} severity
    </span>
  );
}
