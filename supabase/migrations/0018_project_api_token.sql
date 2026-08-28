-- Lets an external AI coding tool (Claude Code, Codex, etc.) report back
-- when it's attempted a fix, without needing a full user session — the
-- dev working "For Vibe Coding" (Section 17) gets a project-scoped token
-- + a ready-made curl command to hand their AI tool alongside the
-- description PDF (kept separate from the PDF itself, which stays
-- description-only per the original ask). The token can only ever move an
-- issue to the ai_fix tab and leave a comment — it can't close/delete
-- anything, can't touch other projects, and is scoped to one project.

alter table projects add column api_token uuid not null default gen_random_uuid();
create unique index projects_api_token_idx on projects(api_token);
