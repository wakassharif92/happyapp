-- Real-time customer support chat (per-project public link, opened from
-- the client's own mobile app with the customer's logged-in email passed
-- along) + a "Team Report" source_channel value for the new project-scoped
-- internal team report link. Requires migration 0009 (is_staff()) to
-- already be applied, and "Allow anonymous sign-ins" to already be
-- enabled in Supabase Dashboard -> Authentication -> Sign In / Providers
-- -> User Signups. Do not apply this before both of those are done and
-- verified.

create table support_conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- Asserted by the host mobile app's own login, not independently
  -- re-verified here — acceptable for a first-party app integration.
  customer_email text not null,
  -- Whichever anonymous session currently "owns" this conversation for
  -- RLS purposes — re-pointed to a new session on each visit by
  -- claimConversation() (app/support/[projectId]/actions.ts), keyed by
  -- customer_email, so the same customer on a new device/reinstall keeps
  -- their full message history under one conversation_id.
  customer_auth_uid uuid not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, customer_email)
);

create table support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references support_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'agent')),
  -- Customer messages: the customer's email. Agent messages: the staff
  -- member's name/email. Just a display label, not an RLS boundary.
  sender_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index support_messages_conversation_idx on support_messages(conversation_id, created_at);

alter table support_conversations enable row level security;
alter table support_messages enable row level security;

create policy staff_all on support_conversations for all using (is_staff()) with check (is_staff());
create policy staff_all on support_messages for all using (is_staff()) with check (is_staff());

create policy customer_select_own on support_conversations for select
  using (auth.uid() = customer_auth_uid);
create policy customer_insert_own on support_conversations for insert
  with check (auth.uid() = customer_auth_uid);

create policy customer_select_own_messages on support_messages for select
  using (conversation_id in (select id from support_conversations where customer_auth_uid = auth.uid()));
create policy customer_insert_own_messages on support_messages for insert
  with check (sender_type = 'customer'
    and conversation_id in (select id from support_conversations where customer_auth_uid = auth.uid()));

-- REQUIRED — same gotcha hit twice already with board_issues: silently
-- no-op without this, no error, Realtime just delivers nothing. Verify
-- with: select tablename from pg_publication_tables where pubname =
-- 'supabase_realtime'; before assuming this took effect.
alter publication supabase_realtime add table support_conversations;
alter publication supabase_realtime add table support_messages;

-- Distinguishes the new public team-report-link submissions from
-- staff-created "Manual" issues, same traceability role 'Slack' plays.
alter table board_issues drop constraint board_issues_source_channel_check;
alter table board_issues add constraint board_issues_source_channel_check
  check (source_channel in ('Slack', 'QA', 'Manual', 'User Complaint', 'Team Report'));
