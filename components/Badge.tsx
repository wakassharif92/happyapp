const COLORS: Record<string, string> = {
  // tags
  bug: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  not_a_bug: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  approval:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  fixed:
    "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  verified:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  // statuses
  new: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  investigating:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  triaged: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  fixing: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
  // report sources (REQ-112)
  whatsapp: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  web: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
};

export function Badge({ value }: { value: string | null }) {
  if (!value) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs text-slate-400">
        untriaged
      </span>
    );
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs capitalize ${
        COLORS[value] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800"
      }`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}
