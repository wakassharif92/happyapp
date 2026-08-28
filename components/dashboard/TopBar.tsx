import type { Project } from "@/lib/board/types";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { IconMoon, IconPlus, IconSearch, IconSun } from "./icons";

export function TopBar({
  projects,
  currentProjectId,
  onProjectChange,
  search,
  onSearchChange,
  theme,
  onToggleTheme,
  onNewIssue,
  userInitial,
}: {
  projects: Project[];
  currentProjectId: string;
  onProjectChange: (projectId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onNewIssue: () => void;
  userInitial: string;
}) {
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
          className="w-full rounded-lg border border-[var(--db-border)] bg-[var(--db-bg)] py-2 pl-9 pr-3 text-sm text-[var(--db-fg)] outline-none transition-colors placeholder:text-[var(--db-fg-subtle)] focus:border-[var(--db-accent)]"
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

        <button
          type="button"
          onClick={onNewIssue}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--db-accent)] px-3 py-2 text-sm font-medium text-[var(--db-accent-fg)] shadow-sm transition-colors hover:bg-[var(--db-accent-hover)]"
        >
          <IconPlus className="h-4 w-4" />
          <span className="hidden sm:inline">New Issue</span>
        </button>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--db-accent-soft)] text-sm font-semibold text-[var(--db-accent)]">
          {userInitial}
        </div>
      </div>
    </header>
  );
}
