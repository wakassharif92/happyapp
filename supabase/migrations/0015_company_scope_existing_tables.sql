-- Company-scopes every existing table. Per the lesson learned twice
-- already in this codebase (0011: a `conversation_id in (select ...)`
-- policy silently broke Realtime delivery despite reporting "SUBSCRIBED")
-- every table gets its own DENORMALIZED company_id column rather than
-- joining through project_id at query time — one consistent shape
-- everywhere, not "some tables join, some don't."
--
-- Requires 0014 (companies, company_members, current_user_company_id()).
-- This is a live production database with real data: the backfill below
-- creates ONE company for everything that already exists and makes every
-- current non-anonymous auth.users row an admin/owner of it, so nobody
-- currently using the app loses access. Apply this, then verify the
-- existing account can still see all its existing projects/issues/tickets
-- BEFORE any UI work lands on top of it (same discipline as 0009's
-- anonymous-auth rollout).

alter table projects add column company_id uuid references companies(id);
alter table modules add column company_id uuid references companies(id);
alter table test_cases add column company_id uuid references companies(id);
alter table test_runs add column company_id uuid references companies(id);
alter table issues add column company_id uuid references companies(id);
alter table programming_agent_runs add column company_id uuid references companies(id);
alter table agent_events add column company_id uuid references companies(id);
alter table agent_api_calls add column company_id uuid references companies(id);
-- Nullable, permanently — see the team_reports policy below for why.
alter table team_reports add column company_id uuid references companies(id);
alter table board_issues add column company_id uuid references companies(id);
alter table board_issue_comments add column company_id uuid references companies(id);
alter table board_issue_activity add column company_id uuid references companies(id);
alter table slack_connections add column company_id uuid references companies(id);
alter table support_conversations add column company_id uuid references companies(id);
alter table support_messages add column company_id uuid references companies(id);

do $$
declare
  new_company_id uuid;
begin
  insert into companies (name) values ('My Company') returning id into new_company_id;

  update projects set company_id = new_company_id;
  update modules set company_id = new_company_id;
  update test_cases set company_id = new_company_id;
  update test_runs set company_id = new_company_id;
  update issues set company_id = new_company_id;
  update programming_agent_runs set company_id = new_company_id;
  update agent_events set company_id = new_company_id;
  update agent_api_calls set company_id = new_company_id;
  update team_reports set company_id = new_company_id;
  update board_issues set company_id = new_company_id;
  update board_issue_comments set company_id = new_company_id;
  update board_issue_activity set company_id = new_company_id;
  update slack_connections set company_id = new_company_id;
  update support_conversations set company_id = new_company_id;
  update support_messages set company_id = new_company_id;

  -- Every current real (non-anonymous) account becomes an admin/owner of
  -- the backfilled company — matches today's actual access model exactly
  -- (any authenticated staff user already sees everything).
  insert into company_members (company_id, user_id, name, role, is_admin, invite_status, activated_at)
  select
    new_company_id,
    id,
    coalesce(nullif(raw_user_meta_data->>'full_name', ''), split_part(email, '@', 1), 'Team member'),
    'Owner',
    true,
    'active',
    now()
  from auth.users
  where coalesce(is_anonymous, false) = false;
end $$;

alter table projects alter column company_id set not null;
alter table modules alter column company_id set not null;
alter table test_cases alter column company_id set not null;
alter table test_runs alter column company_id set not null;
alter table issues alter column company_id set not null;
alter table programming_agent_runs alter column company_id set not null;
alter table agent_events alter column company_id set not null;
alter table agent_api_calls alter column company_id set not null;
alter table board_issues alter column company_id set not null;
alter table board_issue_comments alter column company_id set not null;
alter table board_issue_activity alter column company_id set not null;
alter table slack_connections alter column company_id set not null;
alter table support_conversations alter column company_id set not null;
alter table support_messages alter column company_id set not null;

create index projects_company_id_idx on projects(company_id);
create index board_issues_company_id_idx on board_issues(company_id);
create index support_conversations_company_id_idx on support_conversations(company_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'modules', 'test_cases', 'test_runs', 'issues',
    'programming_agent_runs', 'agent_events', 'agent_api_calls',
    'board_issues', 'board_issue_comments', 'board_issue_activity',
    'slack_connections'
  ]
  loop
    execute format('drop policy if exists "authenticated_all" on %I', t);
    execute format(
      'create policy "authenticated_all" on %I for all using (is_staff() and company_id = current_user_company_id()) with check (is_staff() and company_id = current_user_company_id())',
      t
    );
  end loop;
end $$;

-- team_reports: company_id stays nullable — a public web submission whose
-- project name didn't match an existing project (see 0005's
-- other_project_name) has nowhere to derive a company from at write time.
-- Unmatched reports stay visible to any staff member (same as today) until
-- a dev promotes one to a real project by hand; matched ones are scoped
-- normally.
drop policy if exists "authenticated_all" on team_reports;
create policy "authenticated_all" on team_reports for all
  using (is_staff() and (company_id is null or company_id = current_user_company_id()))
  with check (is_staff() and (company_id is null or company_id = current_user_company_id()));

-- support_conversations / support_messages: only the staff_all policy is
-- rewritten. The customer-facing policies (customer_select_own,
-- customer_insert_own_messages, etc.) are untouched — a customer is
-- already scoped to their own conversation via customer_auth_uid, so
-- cross-company leakage isn't possible for them regardless.
drop policy if exists staff_all on support_conversations;
create policy staff_all on support_conversations for all
  using (is_staff() and company_id = current_user_company_id())
  with check (is_staff() and company_id = current_user_company_id());

drop policy if exists staff_all on support_messages;
create policy staff_all on support_messages for all
  using (is_staff() and company_id = current_user_company_id())
  with check (is_staff() and company_id = current_user_company_id());

-- NOT covered by this migration (documented, deliberate trade-off): the
-- `evidence`/`whatsapp-media` Storage bucket policies stay plain
-- is_staff() (not company-scoped) — object paths are
-- crypto.randomUUID()-based and not enumerable, and the vast majority of
-- reads already go through admin-generated signed URLs (which bypass RLS
-- entirely), so the realistic exposure is a staff member of one company
-- guessing another company's random UUID file path via a direct
-- authenticated Storage call. Narrow enough to accept for now; revisit by
-- namespacing object paths under company_id if this ever needs closing.
