"use client";

import { useState } from "react";
import type { Project } from "@/lib/board/types";
import { IconChevronDown } from "./icons";

export function ProjectSwitcher({
  projects,
  currentProjectId,
  onChange,
}: {
  projects: Project[];
  currentProjectId: string;
  onChange: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = projects.find((p) => p.id === currentProjectId) ?? projects[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--db-border)] bg-[var(--db-surface)] px-3 py-2 text-left text-sm font-medium text-[var(--db-fg)] transition-colors hover:border-[var(--db-border-strong)]"
      >
        <span className="truncate">{current?.name ?? "Select project"}</span>
        <IconChevronDown className="h-4 w-4 shrink-0 text-[var(--db-fg-muted)]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-[var(--db-border)] bg-[var(--db-surface)] shadow-lg">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={`block w-full truncate px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--db-surface-hover)] ${
                  p.id === currentProjectId
                    ? "font-medium text-[var(--db-accent)]"
                    : "text-[var(--db-fg)]"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
