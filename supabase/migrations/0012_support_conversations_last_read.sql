-- Unread indicator for the Support nav link — a conversation counts as
-- unread when its latest customer message is newer than
-- last_read_at (or last_read_at is null and a customer message exists).
-- Updated by the agent's SupportInboxClient.tsx whenever a conversation
-- is opened, or a new message arrives while it's already open.

alter table support_conversations add column last_read_at timestamptz;

-- Image attachments in the support chat — same private-bucket + signed-URL
-- convention as every other media field in this app (media_url stores the
-- object path, never a public URL).
alter table support_messages add column media_url text;
alter table support_messages add column media_type text not null default 'none'
  check (media_type in ('image', 'none'));
