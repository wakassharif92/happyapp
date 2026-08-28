import Link from "next/link";
import type { BoardView, Project } from "@/lib/board/types";
import { VIEW_LABELS, VIEW_ORDER } from "@/lib/board/types";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { SupportNavLink } from "./SupportNavLink";
import {
  IconArchive,
  IconCalendar,
  IconCheckCircle,
  IconCircle,
  IconClock,
  IconCode,
  IconFile,
  IconFolder,
  IconLightbulb,
  IconLink,
  IconMegaphone,
  IconNote,
  IconSparkles,
  IconStar,
  IconUsers,
} from "./icons";

const VIEW_ICONS: Record<BoardView, (props: { className?: string }) => React.ReactElement> = {
  pending: IconCircle,
  in_progress: IconClock,
  ai_fix: IconSparkles,
  done: IconCheckCircle,
  closed: IconArchive,
  user_complaints: IconMegaphone,
  features: IconLightbulb,
  suggestions: IconStar,
  notes: IconNote,
  personal_tasks: IconCalendar,
  vibe_coding: IconCode,
};

export function Sidebar({
  projects,
  currentProjectId,
  onProjectChange,
  activeView,
  onViewChange,
  counts,
}: {
  projects: Project[];
  currentProjectId: string;
  onProjectChange: (projectId: string) => void;
  activeView: BoardView;
  onViewChange: (view: BoardView) => void;
  counts: Partial<Record<BoardView, number>>;
}) {
  return (
    <aside className="flex w-16 shrink-0 flex-col gap-5 border-r border-[var(--db-border)] bg-[var(--db-surface)] p-3 lg:w-64 lg:p-4">
      <div className="flex items-center gap-2.5 px-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--db-accent)] text-sm font-bold text-[var(--db-accent-fg)] shadow-sm shadow-[var(--db-accent)]/30">
          H
        </div>
        <span className="hidden truncate text-sm font-semibold tracking-tight text-[var(--db-fg)] lg:inline">
          HappyApp
        </span>
      </div>

      <div className="hidden lg:block">
        <ProjectSwitcher
          projects={projects}
          currentProjectId={currentProjectId}
          onChange={onProjectChange}
        />
      </div>

      <nav className="flex flex-col gap-0.5">
        {VIEW_ORDER.map((view) => {
          const Icon = VIEW_ICONS[view];
          const active = view === activeView;
          const count = counts[view];
          return (
            <button
              key={view}
              type="button"
              onClick={() => onViewChange(view)}
              title={VIEW_LABELS[view]}
              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:justify-start ${
                active
                  ? "bg-[var(--db-accent-soft)] text-[var(--db-accent)]"
                  : "text-[var(--db-fg-muted)] hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{VIEW_LABELS[view]}</span>
              </span>
              {count !== undefined && (
                <span
                  className={`hidden rounded-full px-1.5 py-0.5 text-xs tabular-nums lg:inline ${
                    active
                      ? "bg-[var(--db-accent)] text-[var(--db-accent-fg)]"
                      : "bg-[var(--db-surface-2)] text-[var(--db-fg-subtle)]"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-[var(--db-border)] pt-3">
        <SupportNavLink projectId={currentProjectId} />
        <Link
          href={`/projects/${currentProjectId}/documents`}
          title="Documents"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--db-fg-muted)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
        >
          <IconFile className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">Documents</span>
        </Link>
        <Link
          href="/team"
          title="Team Members"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--db-fg-muted)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
        >
          <IconUsers className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">Team Members</span>
        </Link>
        <Link
          href={`/projects/${currentProjectId}/links`}
          title="Links"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--db-fg-muted)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
        >
          <IconLink className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">Links</span>
        </Link>
        <Link
          href="/projects"
          title="All Projects"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--db-fg-muted)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
        >
          <IconFolder className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">All Projects</span>
        </Link>
      </div>
    </aside>
  );
}
