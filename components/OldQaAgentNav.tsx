"use client";

import { useState } from "react";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";

// Collapses the original QA Agent nav (module sync, automated testing,
// triage, fix pipeline, settings) out of the way while a new section is
// being built alongside it — kept, not deleted, just tucked behind a toggle.
export function OldQaAgentNav({
  projectId,
  notReadyBanner,
}: {
  projectId: string;
  notReadyBanner?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-700"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-sm font-semibold text-slate-600">
          Q
        </span>
        <span>Old QA Agent</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-3">
          <Link
            href="/projects"
            className="px-3 text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            ← All projects
          </Link>
          <NavLinks projectId={projectId} />
          {notReadyBanner}
        </div>
      )}
    </div>
  );
}
