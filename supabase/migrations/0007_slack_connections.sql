-- Per-project Slack workspace connections (qa-agent-spec.md Section 13,
-- REQ-126). One connection per project — connecting a new workspace
-- replaces the old one via upsert on project_id, rather than allowing
-- several simultaneous connections per project (matches "each project can
-- connect its own Slack workspace/channel independently", singular).

create table slack_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  team_id text not null,
  team_name text,
  -- Null until the channel-picker step (POST /api/slack/select-channel)
  -- completes — OAuth alone only establishes the workspace connection.
  channel_id text,
  channel_name text,
  -- AES-256-GCM ciphertext (lib/slack/tokenCrypto.ts), never plaintext.
  -- Supabase Vault (pgsodium) was considered but skipped: this project has
  -- no linked Supabase CLI / direct Postgres access this session (see
  -- PROGRESS.md's "Known non-obvious things"), so enabling and managing a
  -- Vault-backed column isn't reliably scriptable here — app-level
  -- encryption with a key in an env var achieves the same "never
  -- plaintext at rest" property without needing extension access.
  access_token text not null,
  bot_user_id text,
  status text not null default 'pending_channel'
    check (status in ('pending_channel', 'connected', 'disconnected')),
  connected_by text,
  created_at timestamptz not null default now()
);

-- The events webhook's first lookup on every incoming message: "does this
-- (team, channel) map to a project?" — see REQ-129.
create index slack_connections_team_channel_idx on slack_connections(team_id, channel_id);

alter table slack_connections enable row level security;

create policy authenticated_all on slack_connections
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- The OAuth callback and the events webhook both run with no user
-- session (Slack calling in, not a logged-in browser) and use the
-- service-role client, which bypasses RLS — same pattern as the
-- WhatsApp webhook and the team-report public form.
