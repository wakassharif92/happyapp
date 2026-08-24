-- Cost tracking: one row per Claude API call (per agent-loop turn), so the
-- dashboard can show how much each category of agent activity is costing.

create table if not exists agent_api_calls (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  operation             text not null check (operation in (
    'module_sync', 'test_case_generation', 'test_run', 'issue_triage', 'fix_run', 'verify_fix'
  )),
  run_id                uuid,
  model                 text not null,
  input_tokens          int not null default 0,
  output_tokens         int not null default 0,
  cache_creation_tokens int not null default 0,
  cache_read_tokens     int not null default 0,
  cost_usd              numeric(10,6) not null default 0,
  created_at            timestamptz not null default now()
);
create index if not exists agent_api_calls_project_id_idx on agent_api_calls(project_id);
create index if not exists agent_api_calls_operation_idx on agent_api_calls(operation);
create index if not exists agent_api_calls_created_at_idx on agent_api_calls(created_at);

alter table agent_api_calls enable row level security;
drop policy if exists "authenticated_all" on agent_api_calls;
create policy "authenticated_all" on agent_api_calls
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
