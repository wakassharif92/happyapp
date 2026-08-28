-- Adds four new per-sidebar surfaces, all company-scoped like everything
-- since migration 0015: Documents (admin-managed reference links),
-- Features + Suggestions (two separate tabs, backed by one shared table
-- distinguished by `kind` — identical shape, avoids duplicating RLS/
-- indexes/columns for what's otherwise the exact same entity twice), and
-- Notes + Personal Tasks (private per-member — the first tables in this
-- app scoped to an individual member rather than shared company-wide).

-- Documents: per-project, admin-add-only, read by any active company
-- member. Deliberately just {name, url} — "only a link can be added,
-- either Google Drive or from anywhere else."
create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  url text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index documents_project_id_idx on documents(project_id);

alter table documents enable row level security;
create policy staff_read_documents on documents for select
  using (is_staff() and company_id = current_user_company_id());
-- Same "is an active admin of this company" check as company_members'
-- admin_manage_members/admin_update_members policies (migration 0014).
create policy admin_write_documents on documents for insert
  with check (
    company_id = current_user_company_id()
    and exists (
      select 1 from company_members m
      where m.user_id = auth.uid() and m.company_id = documents.company_id
        and m.is_admin and m.invite_status = 'active'
    )
  );
create policy admin_delete_documents on documents for delete
  using (
    company_id = current_user_company_id()
    and exists (
      select 1 from company_members m
      where m.user_id = auth.uid() and m.company_id = documents.company_id
        and m.is_admin and m.invite_status = 'active'
    )
  );

-- Features + Suggestions: per-project, any active company member can add
-- and update (open, collaborative idea tracking — not admin-gated like
-- Documents). Two tabs in the UI, filtered by `kind` — same table because
-- the shape is identical (title/description/status), avoiding duplicating
-- every policy/index/column twice for what's otherwise one entity.
create table feature_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in ('feature', 'suggestion')),
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  created_by text not null,
  -- Set when a dev converts an existing board_issues row here (see the
  -- new "Move to Feature/Suggestion" option) — lets the card show where
  -- it came from; null for anything added directly on the Features/
  -- Suggestions tab itself.
  source_issue_id uuid references board_issues(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feature_requests_project_kind_idx on feature_requests(project_id, kind);

alter table feature_requests enable row level security;
create policy staff_all_feature_requests on feature_requests for all
  using (is_staff() and company_id = current_user_company_id())
  with check (is_staff() and company_id = current_user_company_id());

-- Notes: private per-member. company_id kept for indexing/consistency,
-- but the real access boundary is user_id = auth.uid() — not is_staff()
-- company-wide sharing like every other table so far. project_id is
-- nullable (a note can optionally be tagged to a project, filterable via
-- a dropdown in the UI) rather than a hard scope.
create table notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_id_idx on notes(user_id);

alter table notes enable row level security;
create policy own_notes on notes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Personal Tasks: same private-per-member shape as Notes, plus a
-- task_date for the day-wise view (Yesterday/Today/Tomorrow shortcuts +
-- a date picker, per the UI ask).
create table personal_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  task_date date not null,
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index personal_tasks_user_date_idx on personal_tasks(user_id, task_date);

alter table personal_tasks enable row level security;
create policy own_personal_tasks on personal_tasks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
