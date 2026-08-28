-- Supabase Realtime only broadcasts postgres_changes for tables explicitly
-- added to the supabase_realtime publication — new tables aren't included
-- by default. Without this, DashboardClient.tsx's subscription (mirroring
-- ActivityFeed.tsx's established REQ-070 pattern) silently receives
-- nothing, and a Slack-created issue never appears in an already-open
-- Pending tab until the page is manually reloaded. Found live during
-- verification: a direct insert did not appear in an open /dashboard tab
-- until this was added.
alter publication supabase_realtime add table board_issues;