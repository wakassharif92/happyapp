// REQ-073: "as plain numbers/progress bars, not just a status string."
export function ProgressBar({
  passed,
  failed,
  total,
}: {
  passed: number;
  failed: number;
  total: number;
}) {
  if (total === 0) return null;
  const passedPct = Math.min(100, (passed / total) * 100);
  const failedPct = Math.min(100 - passedPct, (failed / total) * 100);

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      role="progressbar"
      aria-valuenow={passed}
      aria-valuemax={total}
    >
      <div className="flex h-full">
        <div className="bg-emerald-500" style={{ width: `${passedPct}%` }} />
        <div className="bg-red-500" style={{ width: `${failedPct}%` }} />
      </div>
    </div>
  );
}
