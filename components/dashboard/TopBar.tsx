import { useState } from "react";
import type { Project } from "@/lib/board/types";
import { signOut } from "@/app/login/actions";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { IconMoon, IconPlus, IconSearch, IconSun } from "./icons";

export type AddKind = "issue" | "feature" | "suggestion";

export function TopBar({
  projects,
  currentProjectId,
  onProjectChange,
  search,
  onSearchChange,
  theme,
  onToggleTheme,
  onAdd,
  userInitial,
}: {
  projects: Project[];
  currentProjectId: string;
  onProjectChange: (projectId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onAdd: (kind: AddKind) => void;
  userInitial: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  return (
    <header className="flex flex-col gap-3 border-b border-[var(--db-border)] bg-[var(--db-surface)] p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <div className="lg:hidden">
        <ProjectSwitcher
          projects={projects}
          currentProjectId={currentProjectId}
          onChange={onProjectChange}
        />
      </div>

      <div className="relative flex-1">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--db-fg-subtle)]" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search issues, senders, messages…"
          className="w-full rounded-lg border border-[var(--db-border)] bg-[var(--db-bg)] py-2 pl-9 pr-3 text-sm text-[var(--db-fg)] outline-none transition-all placeholder:text-[var(--db-fg-subtle)] hover:border-[var(--db-border-strong)] focus:border-[var(--db-accent)] focus:ring-2 focus:ring-[var(--db-accent)]/15"
        />
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--db-border)] text-[var(--db-fg-muted)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
        >
          {theme === "light" ? <IconMoon /> : <IconSun />}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setAddMenuOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--db-accent)] px-3 py-2 text-sm font-medium text-[var(--db-accent-fg)] shadow-sm transition-all duration-150 hover:bg-[var(--db-accent-hover)] hover:shadow-md active:scale-[0.98]"
          >
            <IconPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span>
          </button>

          {addMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAddMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-[var(--db-border)] bg-[var(--db-surface)] shadow-lg">
                {(
                  [
                    ["issue", "Issue"],
                    ["feature", "Feature"],
                    ["suggestion", "Suggestion"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      onAdd(kind);
                      setAddMenuOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--db-accent-soft)] text-sm font-semibold text-[var(--db-accent)] transition-colors hover:brightness-95"
          >
            {userInitial}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-[var(--db-border)] bg-[var(--db-surface)] shadow-lg">
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="block w-full px-3 py-2 text-left text-sm text-[var(--db-fg)] transition-colors hover:bg-[var(--db-surface-hover)]"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
