-- New "Releases" sidebar tab — a log of backend PRs and frontend
-- builds, filterable by Backend/Frontend and, for Frontend, Web/Mobile
-- and (for Mobile) iOS/Android. Entries come from two places: a human
-- filling in the "Add Release" form in the panel, or an external AI
-- coding tool (Claude Code, Codex, etc.) calling POST
-- /api/releases/[projectId] with the project's api_token — same
-- "server calling in with a shared secret" pattern as the existing
-- Vibe Coding AI-Fix callback (0018).
create table releases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  category text not null check (category in ('backend', 'frontend')),
  platform text check (platform in ('web', 'mobile')),
  os text check (os in ('ios', 'android')),
  title text not null,
  description text,
  link text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  -- Enforces the exact dropdown hierarchy the UI presents: backend has
  -- neither platform nor os; frontend+web has no os; frontend+mobile
  -- requires an os. Keeps a bad combination from ever reaching the
  -- table even via the API route, not just the form.
  constraint releases_category_platform_check check (
    (category = 'backend' and platform is null and os is null)
    or (category = 'frontend' and platform = 'web' and os is null)
    or (category = 'frontend' and platform = 'mobile' and os in ('ios', 'android'))
  )
);
create index releases_project_id_idx on releases(project_id);

alter table releases enable row level security;
create policy staff_all_releases on releases for all
  using (is_staff() and company_id = current_user_company_id())
  with check (is_staff() and company_id = current_user_company_id());
