-- Extra images on a manually-created issue (New Issue modal,
-- DashboardClient.tsx) beyond the first — board_issues.media_url/
-- media_type stay exactly as they already are (the single "primary"
-- image every other code path expects: the Realtime signed-URL
-- resolution, IssueCard's camera badge, Vibe Coding's PDF export), this
-- table only ever holds the 2nd, 3rd, ... images when a dev attaches
-- more than one at creation time. Every other issue source (WhatsApp,
-- Slack, Team Report, Support ticket conversion) only ever produces one
-- image and never touches this table.
create table board_issue_media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  issue_id uuid not null references board_issues(id) on delete cascade,
  media_url text not null,
  created_at timestamptz not null default now()
);
create index board_issue_media_issue_id_idx on board_issue_media(issue_id);

alter table board_issue_media enable row level security;
create policy staff_all_board_issue_media on board_issue_media for all
  using (is_staff() and company_id = current_user_company_id())
  with check (is_staff() and company_id = current_user_company_id());
