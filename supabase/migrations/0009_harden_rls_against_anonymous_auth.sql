-- Prerequisite for the customer support chat (Section 14, REQ-134+):
-- anonymous Supabase Auth sessions (used to give each customer browser a
-- real, RLS-scopable identity) still satisfy `auth.uid() is not null` —
-- the exact check every existing "authenticated_all" policy in this app
-- uses. Without this migration, enabling anonymous sign-ins would let any
-- visitor to the public support-chat link read and write every table
-- below: all projects' issues, Slack tokens, and settings.
--
-- MUST be applied and verified BEFORE "Allow anonymous sign-ins" is
-- turned on in Supabase Dashboard -> Authentication -> Settings.

create or replace function is_staff() returns boolean as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$ language sql stable;

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'modules', 'test_cases', 'test_runs', 'issues',
    'programming_agent_runs', 'agent_events', 'agent_api_calls',
    'team_reports', 'board_issues', 'board_issue_comments',
    'board_issue_activity', 'slack_connections'
  ]
  loop
    execute format('drop policy if exists "authenticated_all" on %I', t);
    execute format(
      'create policy "authenticated_all" on %I for all using (is_staff()) with check (is_staff())',
      t
    );
  end loop;
end $$;

drop policy if exists "authenticated_read_evidence" on storage.objects;
create policy "authenticated_read_evidence" on storage.objects
  for select using (bucket_id = 'evidence' and is_staff());

drop policy if exists "authenticated_write_evidence" on storage.objects;
create policy "authenticated_write_evidence" on storage.objects
  for insert with check (bucket_id = 'evidence' and is_staff());

drop policy if exists "authenticated_read_whatsapp_media" on storage.objects;
create policy "authenticated_read_whatsapp_media" on storage.objects
  for select using (bucket_id = 'whatsapp-media' and is_staff());

drop policy if exists "authenticated_write_whatsapp_media" on storage.objects;
create policy "authenticated_write_whatsapp_media" on storage.objects
  for insert with check (bucket_id = 'whatsapp-media' and is_staff());
