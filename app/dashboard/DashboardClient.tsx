"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./theme.css";
import type { BoardView, Category, Issue, Project, TabKey } from "@/lib/board/types";
import { TAB_ORDER, isTabKey } from "@/lib/board/types";
import { colorForId } from "@/lib/board/format";
import { createClient } from "@/lib/supabase/client";
import type { BoardIssue, FeatureRequestKind, SupportMessage } from "@/lib/types/database";
import { FEATURE_REQUEST_KIND_LABELS } from "@/lib/types/database";
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
  deleteIssue,
  getIssueExtraMedia,
  getIssueThread,
  moveIssue,
  reorderIssues,
  updateIssueCategory,
} from "./actions";

const FEATURE_KIND_TO_VIEW: Record<FeatureRequestKind, BoardView> = {
  feature: "features",
  suggestion: "suggestions",
  later_on: "later_on",
};
const VIEW_TO_FEATURE_KIND: Partial<Record<BoardView, FeatureRequestKind>> = {
  features: "feature",
  suggestions: "suggestion",
  later_on: "later_on",
};

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
    extraMediaUrls: [],
    thumbnailColor: colorForId(row.id),
    createdAt: row.created_at,
    comments: [],
    activity: [],
    ticketNumber: row.ticket_number,
    supportConversationId: row.support_conversation_id,
    devLastReadAt: row.dev_last_read_at,
    sortOrder: row.sort_order,
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
  // Sidebar counts for the non-board_issues tabs (Features/Suggestions/
  // Later On/Notes) — those panels fetch their own lists independently
  // and only when their tab is actually mounted, so this component has
  // no other visibility into their counts; see the effect below.
  const [extraCounts, setExtraCounts] = useState<Partial<Record<BoardView, number>>>({});

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
        async (payload) => {
          const row = payload.new as BoardIssue;
          // media_url on a fresh Realtime row is still the raw private
          // Storage path (whatever the inserting side wrote), not a
          // signed URL — app/dashboard/page.tsx resolves that for the
          // initial page load, but a row that arrives live never goes
          // through that path, so it rendered as a broken image until a
          // manual refresh. Resolve it here the same way.
          let resolvedRow = row;
          if (row.media_url) {
            const { data } = await supabase.storage
              .from("whatsapp-media")
              .createSignedUrl(row.media_url, 60 * 60);
            if (data?.signedUrl) resolvedRow = { ...row, media_url: data.signedUrl };
          }
          setIssues((prev) =>
            prev.some((i) => i.id === resolvedRow.id) ? prev : [toUiIssue(resolvedRow), ...prev]
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

  // Features/Suggestions/Later On (project-scoped) and Notes
  // (company-wide) counts for the sidebar badges — fetched independently
  // of whichever panel is actually mounted, since only the currently
  // active tab's panel loads its own list. Realtime is treated as a
  // plain "something changed, refetch" signal rather than computed
  // deltas — a DELETE payload doesn't reliably carry the old row's
  // project_id/kind without REPLICA IDENTITY FULL on these tables, and
  // these are low-frequency actions where one extra count query is
  // cheaper than that schema change.
  useEffect(() => {
    if (!currentProjectId) return;
    let cancelled = false;
    const supabase = createClient();

    async function loadExtraCounts() {
      const [{ count: featureCount }, { count: suggestionCount }, { count: laterOnCount }, { count: notesCount }] =
        await Promise.all([
          supabase
            .from("feature_requests")
            .select("*", { count: "exact", head: true })
            .eq("project_id", currentProjectId)
            .eq("kind", "feature"),
          supabase
            .from("feature_requests")
            .select("*", { count: "exact", head: true })
            .eq("project_id", currentProjectId)
            .eq("kind", "suggestion"),
          supabase
            .from("feature_requests")
            .select("*", { count: "exact", head: true })
            .eq("project_id", currentProjectId)
            .eq("kind", "later_on"),
          supabase.from("notes").select("*", { count: "exact", head: true }),
        ]);
      if (cancelled) return;
      setExtraCounts({
        features: featureCount ?? 0,
        suggestions: suggestionCount ?? 0,
        later_on: laterOnCount ?? 0,
        notes: notesCount ?? 0,
      });
    }

    loadExtraCounts();

    const channel = supabase
      .channel(`sidebar-extra-counts-${currentProjectId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_requests" }, () => {
        if (!cancelled) loadExtraCounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, () => {
        if (!cancelled) loadExtraCounts();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentProjectId]);

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
      .sort(
        (a, b) =>
          b.sortOrder - a.sortOrder ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [projectIssues, activeView, search]);

  const selectedIssue = issues.find((i) => i.id === selectedIssueId) ?? null;

  // Comments/activity/extra images are lazy-loaded per issue (not fetched
  // for the whole board up front) — only the currently open detail panel
  // needs them.
  useEffect(() => {
    if (!selectedIssueId || loadedThreads.has(selectedIssueId)) return;
    let cancelled = false;
    Promise.all([getIssueThread(selectedIssueId), getIssueExtraMedia(selectedIssueId)]).then(
      ([{ comments, activity }, extraMediaUrls]) => {
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
                  extraMediaUrls,
                }
              : i
          )
        );
        setLoadedThreads((prev) => new Set(prev).add(selectedIssueId));
      }
    );
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

  // Swaps the issue's sort_order with its neighbor within the CURRENTLY
  // VISIBLE (filtered/sorted) list — not the whole project — so "move up"
  // always means "swap with whatever's directly above it on screen right
  // now," matching what the arrow buttons visually promise.
  function handleReorder(id: string, direction: "up" | "down") {
    const idx = visibleIssues.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= visibleIssues.length) return;
    const a = visibleIssues[idx];
    const b = visibleIssues[swapIdx];
    updateIssueLocal(a.id, (i) => ({ ...i, sortOrder: b.sortOrder }));
    updateIssueLocal(b.id, (i) => ({ ...i, sortOrder: a.sortOrder }));
    reorderIssues(a.id, b.sortOrder, b.id, a.sortOrder);
  }

  function handleCopyLink(id: string) {
    const url = `https://qa-agent.internal/issues/${id}/pdf`;
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  function handleDeleteIssue(id: string) {
    setIssues((prev) => prev.filter((i) => i.id !== id));
    if (selectedIssueId === id) setSelectedIssueId(null);
    deleteIssue(id);
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

  // Appends a local placeholder issue immediately — NewIssueModal.tsx no
  // longer waits for this to resolve before letting the dev move on to
  // the next issue ("Add Another"), and the list shouldn't sit empty in
  // the meantime either. Reconciled with the real row (real id,
  // sort_order, and a signed media URL) once createIssue resolves;
  // rolled back on failure. IssueCard has no thumbnail to worry about
  // showing prematurely — only the detail panel renders media, and by
  // the time anyone could open it the real row has normally already
  // landed.
  async function handleCreateIssue(input: NewIssueInput) {
    if (!currentProjectId) return;
    const tempId = `local-${crypto.randomUUID()}`;
    const tab: TabKey = input.sourceChannel === "User Complaint" ? "user_complaints" : "pending";
    const optimisticIssue: Issue = {
      id: tempId,
      projectId: currentProjectId,
      tab,
      title: input.title,
      message: input.message,
      senderName: "You",
      sourceChannel: input.sourceChannel,
      category: input.category,
      severity: input.severity,
      mediaType: input.mediaType,
      mediaUrl: null,
      extraMediaUrls: [],
      thumbnailColor: colorForId(tempId),
      createdAt: new Date().toISOString(),
      comments: [],
      activity: [],
      ticketNumber: null,
      supportConversationId: null,
      devLastReadAt: null,
      sortOrder: Date.now(),
    };
    setIssues((prev) => [optimisticIssue, ...prev]);
    setActiveView(tab);
    try {
      const created = await createIssue({
        projectId: currentProjectId,
        title: input.title,
        message: input.message,
        category: input.category,
        sourceChannel: input.sourceChannel,
        severity: input.severity,
        mediaType: input.mediaType,
        mediaPaths: input.mediaPaths,
      });
      let mediaUrl = created.media_url;
      if (mediaUrl) {
        const supabase = createClient();
        const { data } = await supabase.storage
          .from("whatsapp-media")
          .createSignedUrl(mediaUrl, 60 * 60);
        if (data?.signedUrl) mediaUrl = data.signedUrl;
      }
      setIssues((prev) =>
        prev.map((i) => (i.id === tempId ? { ...toUiIssue(created), mediaUrl } : i))
      );
    } catch {
      setIssues((prev) => prev.filter((i) => i.id !== tempId));
    }
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
    setActiveView(FEATURE_KIND_TO_VIEW[addFeatureKind]);
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
          text: `Converted to ${FEATURE_REQUEST_KIND_LABELS[kind]}`,
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
        counts={{ ...counts, ...extraCounts }}
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
                  visibleIssues.map((issue, index) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      hasUnreadDevReply={unreadDevReplyIds.has(issue.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < visibleIssues.length - 1}
                      displayNumber={index + 1}
                      onOpenDetail={setSelectedIssueId}
                      onCategoryChange={handleCategoryChange}
                      onMove={handleMove}
                      onConvert={handleConvert}
                      onReorder={handleReorder}
                      onCopyLink={handleCopyLink}
                      onConvertToDev={handleConvertToDev}
                      onDelete={handleDeleteIssue}
                    />
                  ))
                )}
              </div>
            ) : VIEW_TO_FEATURE_KIND[activeView] ? (
              <FeaturesPanel
                projectId={currentProjectId}
                kind={VIEW_TO_FEATURE_KIND[activeView]!}
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
        onDelete={handleDeleteIssue}
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
