import Link from "next/link";
import type { Project, TabKey } from "@/lib/board/types";
import { TAB_LABELS, TAB_ORDER } from "@/lib/board/types";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { SupportNavLink } from "./SupportNavLink";
import {
  IconArchive,
  IconCheckCircle,
  IconCircle,
  IconClock,
  IconFolder,
  IconLink,
  IconMegaphone,
  IconSparkles,
  IconUsers,
} from "./icons";

const TAB_ICONS: Record<TabKey, (props: { className?: string }) => React.ReactElement> = {
  pending: IconCircle,
  in_progress: IconClock,
  ai_fix: IconSparkles,
  done: IconCheckCircle,
  closed: IconArchive,
  user_complaints: IconMegaphone,
};

export function Sidebar({
  projects,
  currentProjectId,
  onProjectChange,
  activeTab,
  onTabChange,
  counts,
}: {
  projects: Project[];
  currentProjectId: string;
  onProjectChange: (projectId: string) => void;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  counts: Record<TabKey, number>;
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
        {TAB_ORDER.map((tab) => {
          const Icon = TAB_ICONS[tab];
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              title={TAB_LABELS[tab]}
              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:justify-start ${
                active
                  ? "bg-[var(--db-accent-soft)] text-[var(--db-accent)]"
                  : "text-[var(--db-fg-muted)] hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{TAB_LABELS[tab]}</span>
              </span>
              <span
                className={`hidden rounded-full px-1.5 py-0.5 text-xs tabular-nums lg:inline ${
                  active
                    ? "bg-[var(--db-accent)] text-[var(--db-accent-fg)]"
                    : "bg-[var(--db-surface-2)] text-[var(--db-fg-subtle)]"
                }`}
              >
                {counts[tab]}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-[var(--db-border)] pt-3">
        <SupportNavLink projectId={currentProjectId} />
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
