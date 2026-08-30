// UI-facing types for the multi-project QA/Issue Tracking dashboard
// (app/dashboard) — backed by real Supabase tables (board_issues et al,
// see lib/types/database.ts) since Section 12/13 of qa-agent-spec.md.

export type TabKey =
  | "in_progress"
  | "ai_fix"
  | "pending"
  | "done"
  | "closed"
  | "user_complaints";

export type Category = "Frontend" | "Backend" | "Design" | "Requirements" | "Other";
export type Severity = "Low" | "Medium" | "High";
export type SourceChannel = "Slack" | "QA" | "Manual" | "User Complaint" | "Team Report";
export type MediaType = "image" | "video" | "none";

export type Comment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

export type ActivityEntry = {
  id: string;
  text: string;
  actor: string;
  createdAt: string;
};

export type Issue = {
  id: string;
  projectId: string;
  tab: TabKey;
  title: string;
  message: string;
  senderName: string;
  sourceChannel: SourceChannel;
  category: Category;
  severity?: Severity;
  mediaType: MediaType;
  mediaUrl: string | null;
  thumbnailColor: string;
  createdAt: string;
  comments: Comment[];
  activity: ActivityEntry[];
  // Set only for tickets sent from the Support Chat's "Send case to devs"
  // (Section 16) — lets the detail panel show a link back to the customer
  // conversation this issue came from.
  ticketNumber: number | null;
  supportConversationId: string | null;
  devLastReadAt: string | null;
  sortOrder: number;
};

export type Project = {
  id: string;
  name: string;
};

// Lifecycle order: a complaint comes in, gets triaged into Pending, moves
// to In Progress, optionally goes through AI Fix, then lands on Done or
// Closed. Drives Sidebar.tsx/TabNav.tsx's display order and every
// "move to…"/status-filter dropdown that iterates this (MoveToMenu.tsx,
// VibeCodingPanel.tsx) — was previously in an arbitrary order.
export const TAB_ORDER: TabKey[] = [
  "user_complaints",
  "pending",
  "in_progress",
  "ai_fix",
  "done",
  "closed",
];

export const TAB_LABELS: Record<TabKey, string> = {
  in_progress: "In Progress",
  ai_fix: "AI Fix",
  pending: "Pending",
  done: "Done",
  closed: "Closed",
  user_complaints: "User Complaints",
};

// Extra sidebar/tab-bar destinations that aren't board_issues-backed —
// Features/Suggestions are their own table (feature_requests, filtered by
// kind); Notes/Personal Tasks are private per-member. Rendered alongside
// the board tabs in the same nav (Sidebar.tsx, TabNav.tsx) since the user
// explicitly described all four as "tabs," even though the underlying
// data source differs — DashboardClient.tsx branches on which kind of
// view is active to decide what to render in the main content area.
export type ExtraView = "features" | "suggestions" | "notes" | "personal_tasks" | "vibe_coding";
export type BoardView = TabKey | ExtraView;

// Vibe Coding first — the tool most tightly coupled to the AI Fix loop
// directly above it — then ideation (Features/Suggestions), then the
// most personal/least shared-workflow items last (Notes/Personal Tasks).
export const EXTRA_VIEW_ORDER: ExtraView[] = [
  "vibe_coding",
  "features",
  "suggestions",
  "notes",
  "personal_tasks",
];

export const VIEW_ORDER: BoardView[] = [...TAB_ORDER, ...EXTRA_VIEW_ORDER];

export const VIEW_LABELS: Record<BoardView, string> = {
  ...TAB_LABELS,
  features: "Features",
  suggestions: "Suggestions",
  notes: "Notes",
  personal_tasks: "Personal Tasks",
  vibe_coding: "For Vibe Coding",
};

export function isTabKey(view: BoardView): view is TabKey {
  return (TAB_ORDER as string[]).includes(view);
}

export const CATEGORIES: Category[] = [
  "Frontend",
  "Backend",
  "Design",
  "Requirements",
  "Other",
];

export const SEVERITIES: Severity[] = ["Low", "Medium", "High"];
