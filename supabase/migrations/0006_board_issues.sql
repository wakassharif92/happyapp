-- Real backend for the Issue Board (previously /dashboard was 100% mock
-- data — see qa-agent-spec.md Section 12). Deliberately a NEW set of
-- tables, not an extension of the legacy `issues` table: that table is
-- keyed off `module_id` and belongs to the automated-testing/triage
-- pipeline (Section 4-6), with a status enum (new/investigating/triaged/
-- fixing/fixed/verified/closed) that has no "Pending" concept at all. The
-- Board's tab model (in_progress/ai_fix/pending/done/closed/
-- user_complaints) is a different shape serving a different flow, so it
-- gets its own tables.

create table board_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  tab text not null default 'pending'
    check (tab in ('in_progress', 'ai_fix', 'pending', 'done', 'closed', 'user_complaints')),
  title text not null,
  message text not null,
  sender_name text not null default 'Unknown',
  source_channel text not null default 'Manual'
    check (source_channel in ('Slack', 'QA', 'Manual', 'User Complaint')),
  category text not null default 'Other'
    check (category in ('Frontend', 'Backend', 'Design', 'Requirements', 'Other')),
  severity text check (severity in ('Low', 'Medium', 'High')),
  media_url text,
  media_type text not null default 'none' check (media_type in ('image', 'video', 'none')),
  -- Slack traceability/dedup (REQ-126 in qa-agent-spec.md Section 13) — null
  -- for every non-Slack source.
  slack_channel_id text,
  slack_message_ts text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedupe: Slack retries webhook deliveries on any non-200/slow response: a
-- (channel, message ts) pair can only ever back one issue. Partial index
-- (not a table-wide unique constraint) since every other source has both
-- columns null and null != null in Postgres uniqueness, but being explicit
-- here is clearer than relying on that.
create unique index board_issues_slack_dedup_idx
  on board_issues(slack_channel_id, slack_message_ts)
  where slack_message_ts is not null;

create index board_issues_project_tab_idx on board_issues(project_id, tab);

create table board_issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references board_issues(id) on delete cascade,
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index board_issue_comments_issue_id_idx on board_issue_comments(issue_id);

create table board_issue_activity (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references board_issues(id) on delete cascade,
  text text not null,
  actor text not null,
  created_at timestamptz not null default now()
);

create index board_issue_activity_issue_id_idx on board_issue_activity(issue_id);

alter table board_issues enable row level security;
alter table board_issue_comments enable row level security;
alter table board_issue_activity enable row level security;

-- Same "any authenticated user" policy shape used by every other table in
-- this app (projects, modules, issues, etc.) — this is an internal tool,
-- not multi-tenant, so per-row ownership checks aren't part of the model.
create policy authenticated_all on board_issues
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy authenticated_all on board_issue_comments
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy authenticated_all on board_issue_activity
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Service-role only (the Slack events webhook has no user session, same
-- reasoning as the WhatsApp webhook in 0003_whatsapp_reports.sql) needs to
-- insert here too — the service role bypasses RLS entirely, so no
-- additional policy is needed for that path.
