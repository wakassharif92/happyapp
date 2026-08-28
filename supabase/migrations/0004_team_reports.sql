-- REQ-116/117: broadens the WhatsApp-only inbox into a shared "team
-- reports" inbox — the web form is a second intake channel into the same
-- table, since Meta's Business API setup proved too heavy a barrier for
-- routine reporting (see qa-agent-spec.md Section 11).

alter table whatsapp_reports rename to team_reports;

alter table team_reports
  add column source text not null default 'whatsapp' check (source in ('whatsapp', 'web')),
  add column project_id uuid references projects(id) on delete set null;

-- wa_message_id/sender_phone are WhatsApp-only; web submissions have
-- neither. A unique column still allows multiple NULLs in Postgres, so
-- relaxing these is safe.
alter table team_reports alter column wa_message_id drop not null;
alter table team_reports alter column sender_phone drop not null;

create index if not exists team_reports_project_id_idx on team_reports(project_id);

-- Storage bucket/RLS policy names still say "whatsapp_media" — left as-is;
-- renaming a Storage bucket means migrating existing objects for a purely
-- cosmetic gain. It now holds images from both channels.
