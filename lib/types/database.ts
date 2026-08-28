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
  project_id: string;
  name: string;
  description: string | null;
  requirement_ref: string | null;
  created_at: string;
};

export type TestCase = {
  id: string;
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
  issue_ids: string[];
  status: ProgrammingAgentRunStatus;
  started_at: string;
  completed_at: string | null;
  summary: string | null;
};

export type AgentEvent = {
  id: string;
  run_type: AgentRunType;
  run_id: string;
  event_text: string;
  event_type: AgentEventType;
  created_at: string;
};

export type AgentApiCall = {
  id: string;
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
  created_at: string;
  updated_at: string;
};

export type BoardIssueComment = {
  id: string;
  issue_id: string;
  author: string;
  text: string;
  created_at: string;
};

export type BoardIssueActivity = {
  id: string;
  issue_id: string;
  text: string;
  actor: string;
  created_at: string;
};

export type SlackConnectionStatus = "pending_channel" | "connected" | "disconnected";

export type SlackConnection = {
  id: string;
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
export type SupportSenderType = "customer" | "agent";

export type SupportConversation = {
  id: string;
  project_id: string;
  customer_email: string;
  customer_auth_uid: string;
  status: SupportConversationStatus;
  created_at: string;
  updated_at: string;
};

export type SupportMessage = {
  id: string;
  conversation_id: string;
  // Always the conversation's customer_auth_uid, regardless of sender —
  // lets the customer's simple `customer_auth_uid = auth.uid()` RLS
  // policy see agent replies too, without a subquery (see migration 0011).
  customer_auth_uid: string;
  sender_type: SupportSenderType;
  sender_name: string;
  body: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Partial<Project> & Pick<Project, "name" | "app_type">;
        Update: Partial<Omit<Project, "id">>;
        Relationships: [];
      };
      modules: {
        Row: Module;
        Insert: Partial<Module> & Pick<Module, "project_id" | "name">;
        Update: Partial<Omit<Module, "id">>;
        Relationships: [];
      };
      test_cases: {
        Row: TestCase;
        Insert: Partial<TestCase> &
          Pick<TestCase, "module_id" | "title" | "scenario">;
        Update: Partial<Omit<TestCase, "id">>;
        Relationships: [];
      };
      test_runs: {
        Row: TestRun;
        Insert: Partial<TestRun> & Pick<TestRun, "module_id">;
        Update: Partial<Omit<TestRun, "id">>;
        Relationships: [];
      };
      issues: {
        Row: Issue;
        Insert: Partial<Issue> & Pick<Issue, "source" | "module_id" | "title">;
        Update: Partial<Omit<Issue, "id">>;
        Relationships: [];
      };
      programming_agent_runs: {
        Row: ProgrammingAgentRun;
        Insert: Partial<ProgrammingAgentRun>;
        Update: Partial<Omit<ProgrammingAgentRun, "id">>;
        Relationships: [];
      };
      agent_events: {
        Row: AgentEvent;
        Insert: Partial<AgentEvent> &
          Pick<AgentEvent, "run_type" | "run_id" | "event_text" | "event_type">;
        Update: Partial<Omit<AgentEvent, "id">>;
        Relationships: [];
      };
      agent_api_calls: {
        Row: AgentApiCall;
        Insert: Partial<AgentApiCall> &
          Pick<AgentApiCall, "project_id" | "operation" | "model">;
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
        Insert: Partial<BoardIssue> & Pick<BoardIssue, "project_id" | "title" | "message">;
        Update: Partial<Omit<BoardIssue, "id">>;
        Relationships: [];
      };
      board_issue_comments: {
        Row: BoardIssueComment;
        Insert: Partial<BoardIssueComment> &
          Pick<BoardIssueComment, "issue_id" | "author" | "text">;
        Update: Partial<Omit<BoardIssueComment, "id">>;
        Relationships: [];
      };
      board_issue_activity: {
        Row: BoardIssueActivity;
        Insert: Partial<BoardIssueActivity> &
          Pick<BoardIssueActivity, "issue_id" | "text" | "actor">;
        Update: Partial<Omit<BoardIssueActivity, "id">>;
        Relationships: [];
      };
      slack_connections: {
        Row: SlackConnection;
        Insert: Partial<SlackConnection> & Pick<SlackConnection, "project_id" | "team_id">;
        Update: Partial<Omit<SlackConnection, "id">>;
        Relationships: [];
      };
      support_conversations: {
        Row: SupportConversation;
        Insert: Partial<SupportConversation> &
          Pick<SupportConversation, "project_id" | "customer_email" | "customer_auth_uid">;
        Update: Partial<Omit<SupportConversation, "id">>;
        Relationships: [];
      };
      support_messages: {
        Row: SupportMessage;
        Insert: Partial<SupportMessage> &
          Pick<
            SupportMessage,
            "conversation_id" | "customer_auth_uid" | "sender_type" | "sender_name" | "body"
          >;
        Update: Partial<Omit<SupportMessage, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
