// Hand-written types matching qa-agent-spec.md Section 3 (REQ-000..REQ-006)
//
// NOTE: these are `type` aliases, not `interface`s, deliberately. With
// interfaces here, @supabase/postgrest-js's column-string type inference
// (e.g. `.select("id")`) silently collapses to `never` for this
// dependency combination — narrow-select results type-check fine with
// `type` aliases.

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
