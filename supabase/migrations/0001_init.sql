-- QA Agent — initial schema (qa-agent-spec.md Section 3)
-- REQ-000..REQ-006

create extension if not exists "pgcrypto";

-- REQ-000: projects
create table if not exists projects (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  description           text,
  app_type              text not null check (app_type in ('mobile', 'web')),
  platform              text,
  framework             text,
  codebase_path         text,
  requirements_doc_ref  text,
  automation_target     text,
  created_at            timestamptz not null default now()
);

-- REQ-001: modules
create table if not exists modules (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  name            text not null,
  description     text,
  requirement_ref text,
  created_at      timestamptz not null default now()
);
create index if not exists modules_project_id_idx on modules(project_id);

-- REQ-002: test_cases
create table if not exists test_cases (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references modules(id) on delete cascade,
  title         text not null,
  scenario      text not null,
  priority      text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status        text not null default 'not_run' check (status in ('not_run', 'running', 'pass', 'fail')),
  last_run_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists test_cases_module_id_idx on test_cases(module_id);
create index if not exists test_cases_status_idx on test_cases(status);

-- REQ-003: test_runs
create table if not exists test_runs (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references modules(id) on delete cascade,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  status        text not null default 'running' check (status in ('running', 'completed', 'failed')),
  total_cases   int not null default 0,
  passed_count  int not null default 0,
  failed_count  int not null default 0
);
create index if not exists test_runs_module_id_idx on test_runs(module_id);

-- REQ-004: issues (the central table)
create table if not exists issues (
  id                     uuid primary key default gen_random_uuid(),
  source                 text not null check (source in ('automated', 'manual')),
  module_id              uuid not null references modules(id) on delete cascade,
  test_case_id           uuid references test_cases(id) on delete set null,
  reported_by            uuid references auth.users(id) on delete set null,
  title                  text not null,
  description            text,
  reproduction_steps     jsonb not null default '[]'::jsonb,
  evidence_urls          text[] not null default '{}',
  tag                    text check (tag in ('bug', 'not_a_bug', 'approval', 'fixed', 'verified')),
  tag_reasoning          text,
  severity               text check (severity in ('high', 'medium', 'low')),
  status                 text not null default 'new' check (status in ('new', 'investigating', 'triaged', 'fixing', 'fixed', 'verified', 'closed')),
  assigned_agent_run_id  uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists issues_module_id_idx on issues(module_id);
create index if not exists issues_tag_idx on issues(tag);
create index if not exists issues_status_idx on issues(status);
create index if not exists issues_source_idx on issues(source);

-- REQ-005: programming_agent_runs
create table if not exists programming_agent_runs (
  id            uuid primary key default gen_random_uuid(),
  issue_ids     uuid[] not null default '{}',
  status        text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  summary       text
);

alter table issues
  add constraint issues_assigned_agent_run_id_fkey
  foreign key (assigned_agent_run_id) references programming_agent_runs(id) on delete set null;

-- REQ-006: agent_events (append-only activity log)
create table if not exists agent_events (
  id            uuid primary key default gen_random_uuid(),
  run_type      text not null check (run_type in ('test_run', 'issue_triage', 'fix_run')),
  run_id        uuid not null,
  event_text    text not null,
  event_type    text not null check (event_type in ('info', 'pass', 'fail', 'bug_found', 'fix_applied', 'error')),
  created_at    timestamptz not null default now()
);
create index if not exists agent_events_run_id_idx on agent_events(run_id);
create index if not exists agent_events_created_at_idx on agent_events(created_at);

-- updated_at trigger for issues
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists issues_set_updated_at on issues;
create trigger issues_set_updated_at
  before update on issues
  for each row execute function set_updated_at();

-- Row Level Security — single-team use, any authenticated user may read/write everything
alter table projects enable row level security;
alter table modules enable row level security;
alter table test_cases enable row level security;
alter table test_runs enable row level security;
alter table issues enable row level security;
alter table programming_agent_runs enable row level security;
alter table agent_events enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'modules', 'test_cases', 'test_runs', 'issues', 'programming_agent_runs', 'agent_events']
  loop
    execute format('drop policy if exists "authenticated_all" on %I', t);
    execute format(
      'create policy "authenticated_all" on %I for all using (auth.uid() is not null) with check (auth.uid() is not null)',
      t
    );
  end loop;
end $$;

-- Realtime: agent_events needs to stream to the dashboard live activity feed (REQ-070)
alter publication supabase_realtime add table agent_events;
alter publication supabase_realtime add table test_runs;
alter publication supabase_realtime add table issues;

-- Storage: private bucket for issue evidence screenshots, accessed via signed URLs
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

drop policy if exists "authenticated_read_evidence" on storage.objects;
create policy "authenticated_read_evidence" on storage.objects
  for select using (bucket_id = 'evidence' and auth.uid() is not null);

drop policy if exists "authenticated_write_evidence" on storage.objects;
create policy "authenticated_write_evidence" on storage.objects
  for insert with check (bucket_id = 'evidence' and auth.uid() is not null);
