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
};

export type Project = {
  id: string;
  name: string;
};

export const TAB_ORDER: TabKey[] = [
  "in_progress",
  "ai_fix",
  "pending",
  "done",
  "closed",
  "user_complaints",
];

export const TAB_LABELS: Record<TabKey, string> = {
  in_progress: "In Progress",
  ai_fix: "AI Fix",
  pending: "Pending",
  done: "Done",
  closed: "Closed",
  user_complaints: "User Complaints",
};

export const CATEGORIES: Category[] = [
  "Frontend",
  "Backend",
  "Design",
  "Requirements",
  "Other",
];

export const SEVERITIES: Severity[] = ["Low", "Medium", "High"];
