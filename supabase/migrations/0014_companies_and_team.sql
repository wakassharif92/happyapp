-- Multi-tenancy foundation (qa-agent-spec.md, new section — see
-- PROGRESS.md for the full rationale). Every project/issue/ticket becomes
-- private to the company that owns it, replacing the flat "any
-- authenticated staff user sees everything" model that has existed since
-- 0001_init.sql.
--
-- One merged table for members AND invites — matches this app's existing
-- preference for reusing one entity over a parallel table (support tickets
-- reuse board_issues rather than a new tickets table, see 0013). An invite
-- IS a not-yet-claimed member row: user_id is null until the invite link
-- is opened and Google Sign-In completes.

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- Null until the invite is claimed (Google Sign-In completes) — from
  -- that point on, the Google identity is the real credential, not the
  -- invite link/token, which only ever gated the FIRST sign-in.
  user_id uuid references auth.users(id) on delete set null,
  -- Display name — admin-entered at invite time, or self-entered by the
  -- company creator during onboarding. This is what now shows up wherever
  -- board_issue_activity/comments/support_messages previously fell back
  -- to a raw email address.
  name text not null,
  -- Freeform job-role label ("Developer", "QA Lead") — display only, not
  -- a permission dimension. is_admin (below) is the actual permission gate.
  role text not null,
  is_admin boolean not null default false,
  -- Null for the company creator (no invite needed — they ARE the
  -- company). Set for every invited member.
  invite_token text unique,
  invite_status text not null default 'pending'
    check (invite_status in ('pending', 'active', 'revoked')),
  -- Null = no expiry set yet. Admin sets/renews this; "Expire now" sets it
  -- to now(), "Renew" sets it to a new future date — same token, same URL.
  invite_expires_at timestamptz,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

-- A user can only be a member of a company once. Partial (not table-wide)
-- since user_id is null for every still-pending invite, and Postgres
-- treats NULLs as distinct in a unique index — several pending invites
-- with user_id null must coexist.
create unique index company_members_company_user_idx
  on company_members(company_id, user_id) where user_id is not null;

create index company_members_company_id_idx on company_members(company_id);

-- The single lookup every company-scoped RLS policy in 0015 is built on —
-- a plain indexed equality lookup (company_members.user_id = auth.uid()),
-- not a correlated subquery against the table being filtered, which is
-- the exact shape that broke Realtime delivery in 0011. This one is safe:
-- it's a stable function call, structurally identical to is_staff().
create or replace function current_user_company_id() returns uuid as $$
  select company_id from company_members
  where user_id = auth.uid() and invite_status = 'active'
  limit 1;
$$ language sql stable;

alter table companies enable row level security;
alter table company_members enable row level security;

create policy member_read_own_company on companies for select
  using (id = current_user_company_id());

-- Any active member of a company can read its member list (so a regular
-- member can see the team roster, not just admins) — only mutation
-- (invite/expire/renew/edit) is admin-gated.
create policy member_read_company_roster on company_members for select
  using (company_id = current_user_company_id());

create policy admin_manage_members on company_members for insert
  with check (
    company_id = current_user_company_id()
    and exists (
      select 1 from company_members m
      where m.user_id = auth.uid() and m.company_id = company_members.company_id
        and m.is_admin and m.invite_status = 'active'
    )
  );

create policy admin_update_members on company_members for update
  using (
    company_id = current_user_company_id()
    and exists (
      select 1 from company_members m
      where m.user_id = auth.uid() and m.company_id = company_members.company_id
        and m.is_admin and m.invite_status = 'active'
    )
  );

-- Invite-claim itself (setting user_id/invite_status on a pending row)
-- happens server-side via the admin client in app/auth/callback/route.ts
-- — the claiming visitor has no session yet at that point (they haven't
-- signed in), so RLS on this table is irrelevant to that specific write.
