// Hand-written types matching qa-agent-spec.md Section 3 (REQ-000..REQ-006)
//
// NOTE: these are `type` aliases, not `interface`s, deliberately. With
// interfaces here, @supabase/postgrest-js's column-string type inference
// (e.g. `.select("id")`) silently collapses to `never` for this
// dependency combination — narrow-select results type-check fine with
// `type` aliases.

import type {
  Category,
  MediaType,
  Severity as BoardSeverity,
  SourceChannel,
  TabKey,
} from "@/lib/board/types";

export type AppType = "mobile" | "web";
export type Priority = "high" | "medium" | "low";
export type TestCaseStatus = "not_run" | "running" | "pass" | "fail";
export type TestRunStatus = "running" | "completed" | "failed";
export type IssueSource = "automated" | "manual";
export type IssueTag = "bug" | "not_a_bug" | "approval" | "fixed" | "verified";
export type Severity = "high" | "medium" | "low";
export type IssueStatus =
  | "new"
  | "investigating"
  | "triaged"
  | "fixing"
  | "fixed"
  | "verified"
  | "closed";
export type ProgrammingAgentRunStatus = "running" | "completed" | "failed";
export type AgentRunType = "test_run" | "issue_triage" | "fix_run";
export type AgentEventType =
  | "info"
  | "pass"
  | "fail"
  | "bug_found"
  | "fix_applied"
  | "error";
export type AgentOperation =
  | "module_sync"
  | "test_case_generation"
  | "test_run"
  | "issue_triage"
  | "fix_run"
  | "verify_fix";
export type TeamReportCategory = "frontend" | "backend" | "any";
export type ReportSource = "whatsapp" | "web";

export type Project = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  app_type: AppType;
  platform: string | null;
  framework: string | null;
  codebase_path: string | null;
  requirements_doc_ref: string | null;
  automation_target: string | null;
  created_at: string;
};

export type Module = {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  description: string | null;
  requirement_ref: string | null;
  created_at: string;
};

export type TestCase = {
  id: string;
  company_id: string;
  module_id: string;
  title: string;
  scenario: string;
  priority: Priority;
  status: TestCaseStatus;
  last_run_at: string | null;
  created_at: string;
};

export type TestRun = {
  id: string;
  company_id: string;
  module_id: string;
  started_at: string;
  completed_at: string | null;
  status: TestRunStatus;
  total_cases: number;
  passed_count: number;
  failed_count: number;
};

export type Issue = {
  id: string;
  company_id: string;
  source: IssueSource;
  module_id: string;
  test_case_id: string | null;
  reported_by: string | null;
  title: string;
  description: string | null;
  reproduction_steps: string[];
  evidence_urls: string[];
  tag: IssueTag | null;
  tag_reasoning: string | null;
  severity: Severity | null;
  status: IssueStatus;
  assigned_agent_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProgrammingAgentRun = {
  id: string;
  company_id: string;
  issue_ids: string[];
  status: ProgrammingAgentRunStatus;
  started_at: string;
  completed_at: string | null;
  summary: string | null;
};

export type AgentEvent = {
  id: string;
  company_id: string;
  run_type: AgentRunType;
  run_id: string;
  event_text: string;
  event_type: AgentEventType;
  created_at: string;
};

export type AgentApiCall = {
  id: string;
  company_id: string;
  project_id: string;
  operation: AgentOperation;
  run_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  created_at: string;
};

export type TeamReport = {
  id: string;
  // Nullable, permanently — an unmatched public web submission (no
  // project selected/matched) has nowhere to derive a company from at
  // write time. See migration 0015.
  company_id: string | null;
  source: ReportSource;
  wa_message_id: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  project_id: string | null;
  other_project_name: string | null;
  page_name: string | null;
  message_text: string | null;
  image_path: string | null;
  category: TeamReportCategory | null;
  received_at: string;
};

export type BoardIssue = {
  id: string;
  company_id: string;
  project_id: string;
  tab: TabKey;
  title: string;
  message: string;
  sender_name: string;
  source_channel: SourceChannel;
  category: Category;
  severity: BoardSeverity | null;
  media_url: string | null;
  media_type: MediaType;
  slack_channel_id: string | null;
  slack_message_ts: string | null;
  // Set only for tickets sent from the Support Chat's "Send case to devs"
  // (Section 16) — ticket_number is display-only (sequence-backed default,
  // consumed by every board_issues row but only ever shown for these).
  ticket_number: number | null;
  support_conversation_id: string | null;
  // Independent from support_conversations.last_read_at (the agent's own
  // read-cursor for the same conversation) — devs are a separate viewer.
  dev_last_read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BoardIssueComment = {
  id: string;
  company_id: string;
  issue_id: string;
  author: string;
  text: string;
  created_at: string;
};

export type BoardIssueActivity = {
  id: string;
  company_id: string;
  issue_id: string;
  text: string;
  actor: string;
  created_at: string;
};

export type SlackConnectionStatus = "pending_channel" | "connected" | "disconnected";

export type SlackConnection = {
  id: string;
  company_id: string;
  project_id: string;
  team_id: string;
  team_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
  access_token: string;
  bot_user_id: string | null;
  status: SlackConnectionStatus;
  connected_by: string | null;
  created_at: string;
};

export type SupportConversationStatus = "open" | "closed";
export type SupportSenderType = "customer" | "agent" | "dev" | "system";

export type SupportConversation = {
  id: string;
  company_id: string;
  project_id: string;
  customer_email: string;
  customer_auth_uid: string;
  status: SupportConversationStatus;
  // Bumped whenever an agent opens/views this conversation — a
  // conversation is "unread" when its latest customer message postdates
  // this (or this is null and a customer message exists).
  last_read_at: string | null;
  // Mirrors whether the most recent "Send case to devs" ticket for this
  // conversation is still open — lets the customer's own client (which
  // can't read board_issues, staff-only) drive the "marked resolved /
  // start a new issue" banner (Section 16).
  has_open_ticket: boolean;
  created_at: string;
  updated_at: string;
};

export type SupportMessageMediaType = "image" | "none";

export type SupportMessage = {
  id: string;
  company_id: string;
  conversation_id: string;
  // Always the conversation's customer_auth_uid, regardless of sender —
  // lets the customer's simple `customer_auth_uid = auth.uid()` RLS
  // policy see agent replies too, without a subquery (see migration 0011).
  customer_auth_uid: string;
  sender_type: SupportSenderType;
  sender_name: string;
  body: string;
  media_url: string | null;
  media_type: SupportMessageMediaType;
  // false for dev questions and internal ticket-status entries (Section
  // 16) — enforced by RLS (migration 0013), not just this flag, so the
  // customer's own query can never return one of these rows regardless.
  visible_to_customer: boolean;
  created_at: string;
};

export type Document = {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  url: string;
  created_by: string;
  created_at: string;
};

export type FeatureRequestKind = "feature" | "suggestion";
export type FeatureRequestStatus = "pending" | "in_progress" | "done";

export type FeatureRequest = {
  id: string;
  company_id: string;
  project_id: string;
  kind: FeatureRequestKind;
  title: string;
  description: string | null;
  status: FeatureRequestStatus;
  created_by: string;
  source_issue_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  company_id: string;
  user_id: string;
  project_id: string | null;
  text: string;
  created_at: string;
  updated_at: string;
};

export type PersonalTaskStatus = "pending" | "in_progress" | "done";

export type PersonalTask = {
  id: string;
  company_id: string;
  user_id: string;
  project_id: string | null;
  task_date: string;
  title: string;
  status: PersonalTaskStatus;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  created_at: string;
};

export type CompanyInviteStatus = "pending" | "active" | "revoked";

export type CompanyMember = {
  id: string;
  company_id: string;
  user_id: string | null;
  name: string;
  role: string;
  is_admin: boolean;
  invite_token: string | null;
  invite_status: CompanyInviteStatus;
  invite_expires_at: string | null;
  created_at: string;
  activated_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Company;
        Insert: Partial<Company> & Pick<Company, "name">;
        Update: Partial<Omit<Company, "id">>;
        Relationships: [];
      };
      company_members: {
        Row: CompanyMember;
        Insert: Partial<CompanyMember> & Pick<CompanyMember, "company_id" | "name" | "role">;
        Update: Partial<Omit<CompanyMember, "id">>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: Partial<Project> & Pick<Project, "company_id" | "name" | "app_type">;
        Update: Partial<Omit<Project, "id">>;
        Relationships: [];
      };
      modules: {
        Row: Module;
        Insert: Partial<Module> & Pick<Module, "company_id" | "project_id" | "name">;
        Update: Partial<Omit<Module, "id">>;
        Relationships: [];
      };
      test_cases: {
        Row: TestCase;
        Insert: Partial<TestCase> &
          Pick<TestCase, "company_id" | "module_id" | "title" | "scenario">;
        Update: Partial<Omit<TestCase, "id">>;
        Relationships: [];
      };
      test_runs: {
        Row: TestRun;
        Insert: Partial<TestRun> & Pick<TestRun, "company_id" | "module_id">;
        Update: Partial<Omit<TestRun, "id">>;
        Relationships: [];
      };
      issues: {
        Row: Issue;
        Insert: Partial<Issue> &
          Pick<Issue, "company_id" | "source" | "module_id" | "title">;
        Update: Partial<Omit<Issue, "id">>;
        Relationships: [];
      };
      programming_agent_runs: {
        Row: ProgrammingAgentRun;
        Insert: Partial<ProgrammingAgentRun> & Pick<ProgrammingAgentRun, "company_id">;
        Update: Partial<Omit<ProgrammingAgentRun, "id">>;
        Relationships: [];
      };
      agent_events: {
        Row: AgentEvent;
        Insert: Partial<AgentEvent> &
          Pick<AgentEvent, "company_id" | "run_type" | "run_id" | "event_text" | "event_type">;
        Update: Partial<Omit<AgentEvent, "id">>;
        Relationships: [];
      };
      agent_api_calls: {
        Row: AgentApiCall;
        Insert: Partial<AgentApiCall> &
          Pick<AgentApiCall, "company_id" | "project_id" | "operation" | "model">;
        Update: Partial<Omit<AgentApiCall, "id">>;
        Relationships: [];
      };
      team_reports: {
        Row: TeamReport;
        Insert: Partial<TeamReport> & Pick<TeamReport, "source">;
        Update: Partial<Omit<TeamReport, "id">>;
        Relationships: [];
      };
      board_issues: {
        Row: BoardIssue;
        Insert: Partial<BoardIssue> &
          Pick<BoardIssue, "company_id" | "project_id" | "title" | "message">;
        Update: Partial<Omit<BoardIssue, "id">>;
        Relationships: [];
      };
      board_issue_comments: {
        Row: BoardIssueComment;
        Insert: Partial<BoardIssueComment> &
          Pick<BoardIssueComment, "company_id" | "issue_id" | "author" | "text">;
        Update: Partial<Omit<BoardIssueComment, "id">>;
        Relationships: [];
      };
      board_issue_activity: {
        Row: BoardIssueActivity;
        Insert: Partial<BoardIssueActivity> &
          Pick<BoardIssueActivity, "company_id" | "issue_id" | "text" | "actor">;
        Update: Partial<Omit<BoardIssueActivity, "id">>;
        Relationships: [];
      };
      slack_connections: {
        Row: SlackConnection;
        Insert: Partial<SlackConnection> &
          Pick<SlackConnection, "company_id" | "project_id" | "team_id">;
        Update: Partial<Omit<SlackConnection, "id">>;
        Relationships: [];
      };
      support_conversations: {
        Row: SupportConversation;
        Insert: Partial<SupportConversation> &
          Pick<
            SupportConversation,
            "company_id" | "project_id" | "customer_email" | "customer_auth_uid"
          >;
        Update: Partial<Omit<SupportConversation, "id">>;
        Relationships: [];
      };
      support_messages: {
        Row: SupportMessage;
        Insert: Partial<SupportMessage> &
          Pick<
            SupportMessage,
            "company_id" | "conversation_id" | "customer_auth_uid" | "sender_type" | "sender_name" | "body"
          >;
        Update: Partial<Omit<SupportMessage, "id">>;
        Relationships: [];
      };
      documents: {
        Row: Document;
        Insert: Partial<Document> &
          Pick<Document, "company_id" | "project_id" | "name" | "url" | "created_by">;
        Update: Partial<Omit<Document, "id">>;
        Relationships: [];
      };
      feature_requests: {
        Row: FeatureRequest;
        Insert: Partial<FeatureRequest> &
          Pick<FeatureRequest, "company_id" | "project_id" | "kind" | "title" | "created_by">;
        Update: Partial<Omit<FeatureRequest, "id">>;
        Relationships: [];
      };
      notes: {
        Row: Note;
        Insert: Partial<Note> & Pick<Note, "company_id" | "user_id" | "text">;
        Update: Partial<Omit<Note, "id">>;
        Relationships: [];
      };
      personal_tasks: {
        Row: PersonalTask;
        Insert: Partial<PersonalTask> &
          Pick<PersonalTask, "company_id" | "user_id" | "task_date" | "title">;
        Update: Partial<Omit<PersonalTask, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
