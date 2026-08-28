-- REQ-110–115: a second, informal issue-intake channel — team members
-- message a WhatsApp Business number directly, messages land here for a
-- human to skim and categorize by hand. Deliberately not wired into
-- `issues`/triage, and deliberately project-agnostic (see qa-agent-spec.md
-- Section 11).

create table if not exists whatsapp_reports (
  id             uuid primary key default gen_random_uuid(),
  wa_message_id  text unique not null,
  sender_name    text,
  sender_phone   text not null,
  message_text   text,
  image_path     text,
  category       text check (category in ('frontend', 'backend', 'any')),
  received_at    timestamptz not null default now()
);
create index if not exists whatsapp_reports_received_at_idx on whatsapp_reports(received_at);

alter table whatsapp_reports enable row level security;
drop policy if exists "authenticated_all" on whatsapp_reports;
create policy "authenticated_all" on whatsapp_reports
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Storage: private bucket for images sent via WhatsApp, accessed via signed
-- URLs — same pattern as the existing `evidence` bucket (0001_init.sql).
insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

drop policy if exists "authenticated_read_whatsapp_media" on storage.objects;
create policy "authenticated_read_whatsapp_media" on storage.objects
  for select using (bucket_id = 'whatsapp-media' and auth.uid() is not null);

drop policy if exists "authenticated_write_whatsapp_media" on storage.objects;
create policy "authenticated_write_whatsapp_media" on storage.objects
  for insert with check (bucket_id = 'whatsapp-media' and auth.uid() is not null);
