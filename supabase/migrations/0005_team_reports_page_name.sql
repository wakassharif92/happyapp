-- Extends the team report web form (REQ-116/117): a free-text "page/screen
-- name" field, and a fallback for when the reporter's project isn't in the
-- dropdown yet. The latter is a plain text note, not a real `projects` row —
-- the public form has no session, so letting it write directly into
-- `projects` would mean anyone with the link could create real projects
-- anonymously. A dev promotes it to a real project by hand if warranted.

alter table team_reports
  add column page_name text,
  add column other_project_name text;
