"use client";

import { useState, useTransition } from "react";
import { updateCategory } from "./actions";
import type { TeamReportCategory } from "@/lib/types/database";

export function CategorySelect({
  reportId,
  category,
}: {
  reportId: string;
  category: TeamReportCategory | null;
}) {
  const [value, setValue] = useState<TeamReportCategory | "">(category ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = (e.target.value || null) as TeamReportCategory | null;
        setValue(next ?? "");
        startTransition(() => {
          updateCategory(reportId, next);
        });
      }}
      className="input w-36 py-1.5 text-sm"
    >
      <option value="">— none —</option>
      <option value="frontend">Frontend</option>
      <option value="backend">Backend</option>
      <option value="any">Any</option>
    </select>
  );
}
