"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./theme.css";
import type { BoardView, Category, Issue, Project, TabKey } from "@/lib/board/types";
import { TAB_ORDER, isTabKey } from "@/lib/board/types";
import { colorForId } from "@/lib/board/format";
import { createClient } from "@/lib/supabase/client";
import type { BoardIssue, FeatureRequestKind, SupportMessage } from "@/lib/types/database";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar, type AddKind } from "@/components/dashboard/TopBar";
import { IssueCard } from "@/components/dashboard/IssueCard";
import { IssueDetailPanel } from "@/components/dashboard/IssueDetailPanel";
import { TicketConversationModal } from "@/components/dashboard/TicketConversationModal";
import { NewIssueModal, type NewIssueInput } from "@/components/dashboard/NewIssueModal";
import { AddFeatureModal } from "@/components/dashboard/AddFeatureModal";
import { FeaturesPanel } from "@/components/dashboard/FeaturesPanel";
import { NotesPanel } from "@/components/dashboard/NotesPanel";
import { PersonalTasksPanel } from "@/components/dashboard/PersonalTasksPanel";
import { VibeCodingPanel } from "@/components/dashboard/VibeCodingPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { markTicketReadByDev } from "@/app/support/[projectId]/actions";
import { signOut } from "@/app/login/actions";
import { createFeatureRequest, convertIssueToFeatureRequest } from "./featuresActions";
import {
  addComment,
  createIssue,
  getIssueThread,
  moveIssue,
  updateIssueCategory,
} from "./actions";

function toUiIssue(row: BoardIssue): Issue {
  return {
    id: row.id,
    projectId: row.project_id,
    tab: row.tab,
    title: row.title,
    message: row.message,
    senderName: row.sender_name,
    sourceChannel: row.source_channel,
    category: row.category,
    severity: row.severity ?? undefined,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    thumbnailColor: colorForId(row.id),
    createdAt: row.created_at,
    comments: [],
    activity: [],
    ticketNumber: row.ticket_number,
    supportConversationId: row.support_conversation_id,
    devLastReadAt: row.dev_last_read_at,
  };
}

export function DashboardClient({
  initialProjects,
  initialIssues,
}: {
  initialProjects: Project[];
  initialIssues: BoardIssue[];
}) {
  const [issues, setIssues] = useState<Issue[]>(() => initialIssues.map(toUiIssue));
  const [loadedThreads, setLoadedThreads] = useState<Set<string>>(new Set());
  const [currentProjectId, setCurrentProjectId] = useState(initialProjects[0]?.id ?? "");
  const [activeView, setActiveView] = useState<BoardView>("pending");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [newIssueOpen, setNewIssueOpen] = useState(false);
  const [addFeatureKind, setAddFeatureKind] = useState<FeatureRequestKind | null>(null);
  const [ticketConversation, setTicketConversation] = useState<{
    conversationId: string;
    ticketNumber: number;
  } | null>(null);
  // Latest internal (visible_to_customer=false) agent reply per
  // conversation — drives the unread dot on "View Conversation", a
  // separate read-cursor (board_issues.dev_last_read_at) from the agent's
  // own (support_conversations.last_read_at) for the same messages.
  const [latestAgentReplyByConversation, setLatestAgentReplyByConversation] = useState<
    Map<string, string>
  >(new Map());

  const currentProject = initialProjects.find((p) => p.id === currentProjectId) ?? null;

  // Live updates: a Slack message landing in a connected channel inserts
  // a board_issues row server-side (app/api/slack/events/route.ts) — this
  // is what makes it show up in an already-open Pending tab without a
  // manual refresh, same Realtime pattern as components/ActivityFeed.tsx.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("board_issues-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "board_issues" },
        (payload) => {
          const row = payload.new as BoardIssue;
          setIssues((prev) =>
            prev.some((i) => i.id === row.id) ? prev : [toUiIssue(row), ...prev]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const ticketConversationIds = useMemo(
    () =>
      Array.from(
        new Set(issues.map((i) => i.supportConversationId).filter((id): id is string => !!id))
      ),
    [issues]
  );

  // Batch-fetch, then keep live via Realtime — same shape as
  // SupportInboxClient.tsx's latestByConversation, just scoped to
  // internal agent replies (visible_to_customer=false) across every
  // ticket currently loaded on the board.
  useEffect(() => {
    if (ticketConversationIds.length === 0) return;
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("support_messages")
      .select("conversation_id, created_at")
      .in("conversation_id", ticketConversationIds)
      .eq("sender_type", "agent")
      .eq("visible_to_customer", false)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = new Map<string, string>();
        for (const row of data) map.set(row.conversation_id, row.created_at);
        setLatestAgentReplyByConversation(map);
      });

    // No server-side `filter:` — same reasoning as every other
    // postgres_changes subscription in this app (see SupportInboxClient.tsx).
    const channel = supabase
      .channel(`board-dev-unread-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const row = payload.new as SupportMessage;
          if (row.sender_type !== "agent" || row.visible_to_customer) return;
          setLatestAgentReplyByConversation((prev) => {
            const next = new Map(prev);
            next.set(row.conversation_id, row.created_at);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [ticketConversationIds]);

  const unreadDevReplyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const issue of issues) {
      if (!issue.supportConversationId) continue;
      const latest = latestAgentReplyByConversation.get(issue.supportConversationId);
      if (!latest) continue;
      if (!issue.devLastReadAt || new Date(latest) > new Date(issue.devLastReadAt)) {
        ids.add(issue.id);
      }
    }
    return ids;
  }, [issues, latestAgentReplyByConversation]);

  const projectIssues = useMemo(
    () => issues.filter((i) => i.projectId === currentProjectId),
    [issues, currentProjectId]
  );

  const counts = useMemo(() => {
    const result = {} as Record<TabKey, number>;
    for (const tab of TAB_ORDER) {
      result[tab] = projectIssues.filter((i) => i.tab === tab).length;
    }
    return result;
  }, [projectIssues]);

  const visibleIssues = useMemo(() => {
    if (!isTabKey(activeView)) return [];
    const q = search.trim().toLowerCase();
    return projectIssues
      .filter((i) => i.tab === activeView)
      .filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          i.message.toLowerCase().includes(q) ||
          i.senderName.toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [projectIssues, activeView, search]);

  const selectedIssue = issues.find((i) => i.id === selectedIssueId) ?? null;

  // Comments/activity are lazy-loaded per issue (not fetched for the whole
  // board up front) — only the currently open detail panel needs them.
  useEffect(() => {
    if (!selectedIssueId || loadedThreads.has(selectedIssueId)) return;
    let cancelled = false;
    getIssueThread(selectedIssueId).then(({ comments, activity }) => {
      if (cancelled) return;
      setIssues((prev) =>
        prev.map((i) =>
          i.id === selectedIssueId
            ? {
                ...i,
                comments: comments.map((c) => ({
                  id: c.id,
                  author: c.author,
                  text: c.text,
                  createdAt: c.created_at,
                })),
                activity: activity.map((a) => ({
                  id: a.id,
                  text: a.text,
                  actor: a.actor,
                  createdAt: a.created_at,
                })),
              }
            : i
        )
      );
      setLoadedThreads((prev) => new Set(prev).add(selectedIssueId));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedIssueId, loadedThreads]);

  function updateIssueLocal(id: string, updater: (issue: Issue) => Issue) {
    setIssues((prev) => prev.map((i) => (i.id === id ? updater(i) : i)));
  }

  function handleCategoryChange(id: string, category: Category) {
    updateIssueLocal(id, (i) => ({ ...i, category }));
    updateIssueCategory(id, category);
  }

  function handleMove(id: string, tab: TabKey) {
    updateIssueLocal(id, (i) => ({
      ...i,
      tab,
      activity: [
        ...i.activity,
        {
          id: `local-${Date.now()}`,
          text: `Moved to ${tab.replace("_", " ")}`,
          actor: "You",
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    moveIssue(id, tab);
  }

  function handleConvertToDev(id: string) {
    handleMove(id, "pending");
  }

  function handleCopyLink(id: string) {
    const url = `https://qa-agent.internal/issues/${id}/pdf`;
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  async function handleAddComment(id: string, text: string) {
    const optimisticId = `local-${Date.now()}`;
    updateIssueLocal(id, (i) => ({
      ...i,
      comments: [
        ...i.comments,
        { id: optimisticId, author: "You", text, createdAt: new Date().toISOString() },
      ],
    }));
    const saved = await addComment(id, text);
    if (saved) {
      updateIssueLocal(id, (i) => ({
        ...i,
        comments: i.comments.map((c) =>
          c.id === optimisticId
            ? { id: saved.id, author: saved.author, text: saved.text, createdAt: saved.created_at }
            : c
        ),
      }));
    }
  }

  async function handleCreateIssue(input: NewIssueInput) {
    if (!currentProjectId) return;
    const created = await createIssue({
      projectId: currentProjectId,
      title: input.title,
      message: input.message,
      category: input.category,
      sourceChannel: input.sourceChannel,
      severity: input.severity,
      mediaType: input.mediaType,
    });
    setIssues((prev) => [toUiIssue(created), ...prev]);
    setActiveView(created.tab);
    setNewIssueOpen(false);
  }

  function handleAdd(kind: AddKind) {
    if (kind === "issue") {
      setNewIssueOpen(true);
    } else {
      setAddFeatureKind(kind);
    }
  }

  async function handleSubmitFeature(input: { title: string; description: string }) {
    if (!currentProjectId || !addFeatureKind) return;
    await createFeatureRequest({
      projectId: currentProjectId,
      kind: addFeatureKind,
      title: input.title,
      description: input.description,
    });
    setActiveView(addFeatureKind === "feature" ? "features" : "suggestions");
    setAddFeatureKind(null);
  }

  // Dev-side "Move to Feature/Suggestion" (MoveToMenu.tsx's onConvert) —
  // creates the feature_requests row and moves the original issue to
  // 'closed' server-side; mirrored locally the same way handleMove does,
  // since this component doesn't subscribe to board_issues UPDATEs live.
  async function handleConvert(issueId: string, kind: FeatureRequestKind) {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue || !currentProjectId) return;
    updateIssueLocal(issueId, (i) => ({
      ...i,
      tab: "closed",
      activity: [
        ...i.activity,
        {
          id: `local-${Date.now()}`,
          text: `Converted to ${kind === "feature" ? "Feature" : "Suggestion"}`,
          actor: "You",
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    await convertIssueToFeatureRequest({
      issueId,
      projectId: currentProjectId,
      kind,
      title: issue.title,
      description: issue.message,
    });
  }

  if (!currentProject) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-sm text-slate-500">
        <p>
          No projects yet — create one from{" "}
          <Link href="/projects/new" className="font-medium text-indigo-600 underline">
            Add Project
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => signOut()}
          className="text-slate-400 underline underline-offset-2 hover:text-slate-600"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div
      className="qa-board flex h-screen overflow-hidden bg-[var(--db-bg)] text-[var(--db-fg)]"
      data-theme={theme}
    >
      <Sidebar
        projects={initialProjects}
        currentProjectId={currentProjectId}
        onProjectChange={setCurrentProjectId}
        activeView={activeView}
        onViewChange={setActiveView}
        counts={counts}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          projects={initialProjects}
          currentProjectId={currentProjectId}
          onProjectChange={setCurrentProjectId}
          search={search}
          onSearchChange={setSearch}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          onAdd={handleAdd}
          userInitial="Y"
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div>
            {isTabKey(activeView) ? (
              <div className="flex flex-col gap-3">
                {visibleIssues.length === 0 ? (
                  <EmptyState tab={activeView} />
                ) : (
                  visibleIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      hasUnreadDevReply={unreadDevReplyIds.has(issue.id)}
                      onOpenDetail={setSelectedIssueId}
                      onCategoryChange={handleCategoryChange}
                      onMove={handleMove}
                      onConvert={handleConvert}
                      onCopyLink={handleCopyLink}
                      onConvertToDev={handleConvertToDev}
                    />
                  ))
                )}
              </div>
            ) : activeView === "features" || activeView === "suggestions" ? (
              <FeaturesPanel
                projectId={currentProjectId}
                kind={activeView === "features" ? "feature" : "suggestion"}
              />
            ) : activeView === "notes" ? (
              <NotesPanel projects={initialProjects} />
            ) : activeView === "personal_tasks" ? (
              <PersonalTasksPanel projects={initialProjects} />
            ) : (
              <VibeCodingPanel projectId={currentProjectId} issues={projectIssues} />
            )}
          </div>
        </main>
      </div>

      <IssueDetailPanel
        issue={selectedIssue}
        projectName={currentProject.name}
        hasUnreadDevReply={selectedIssue ? unreadDevReplyIds.has(selectedIssue.id) : false}
        onClose={() => setSelectedIssueId(null)}
        onCategoryChange={handleCategoryChange}
        onMove={handleMove}
        onCopyLink={handleCopyLink}
        onAddComment={handleAddComment}
        onConvertToDev={handleConvertToDev}
        onViewTicketConversation={(conversationId, ticketNumber) => {
          setTicketConversation({ conversationId, ticketNumber });
          if (selectedIssue) {
            const now = new Date().toISOString();
            updateIssueLocal(selectedIssue.id, (i) => ({ ...i, devLastReadAt: now }));
            markTicketReadByDev(selectedIssue.id);
          }
        }}
      />

      <TicketConversationModal
        open={ticketConversation !== null}
        conversationId={ticketConversation?.conversationId ?? ""}
        ticketNumber={ticketConversation?.ticketNumber ?? 0}
        onClose={() => setTicketConversation(null)}
      />

      <NewIssueModal
        open={newIssueOpen}
        onClose={() => setNewIssueOpen(false)}
        projectName={currentProject.name}
        onCreate={handleCreateIssue}
      />

      <AddFeatureModal
        open={addFeatureKind !== null}
        kind={addFeatureKind ?? "feature"}
        onClose={() => setAddFeatureKind(null)}
        onSubmit={handleSubmitFeature}
      />
    </div>
  );
}
