-- "Send case to devs" ticketing on top of the existing support chat
-- (Section 14). A ticket is just a board_issues row (tab='user_complaints',
-- source_channel='User Complaint') tagged with a ticket number and a link
-- back to the conversation it came from — no separate tickets table, so
-- the existing dev-side board (move/comment/activity) already works on it
-- unmodified. Dev questions and open/close status entries ride in the
-- SAME support_messages timeline as the customer/agent chat, gated by
-- visible_to_customer so they show up inline in the agent's chat view but
-- can never reach the customer — enforced at the RLS layer, not just the UI.

-- Ticket numbering. Every board_issues row technically consumes a value
-- from this sequence via the column default (harmless — only rows with
-- support_conversation_id set are ever labeled "Ticket #N" in the UI), which
-- keeps numbering atomic without a separate RPC/grant setup.
create sequence board_issues_ticket_number_seq;
alter table board_issues add column ticket_number bigint;
alter table board_issues alter column ticket_number set default nextval('board_issues_ticket_number_seq');
alter sequence board_issues_ticket_number_seq owned by board_issues.ticket_number;

alter table board_issues add column support_conversation_id uuid references support_conversations(id) on delete set null;

-- When a dev last opened this ticket's conversation modal — a separate
-- read-cursor from support_conversations.last_read_at (the AGENT's cursor
-- for the same conversation), since agent and dev are independent viewers
-- of the same support_messages stream. Drives the unread dot on the
-- ticket's "View Conversation" affordance when the agent has replied
-- internally since a dev last looked.
alter table board_issues add column dev_last_read_at timestamptz;

-- Lets the customer's own client know whether their conversation currently
-- has a ticket in flight, without needing is_staff() access to board_issues
-- — drives the "marked resolved / start a new issue" banner client-side.
alter table support_conversations add column has_open_ticket boolean not null default false;

alter table support_messages add column visible_to_customer boolean not null default true;

alter table support_messages drop constraint support_messages_sender_type_check;
alter table support_messages add constraint support_messages_sender_type_check
  check (sender_type in ('customer', 'agent', 'dev', 'system'));

-- The customer must never receive a dev-authored or internal-status
-- message, even if a future UI bug forgets to filter — enforced here, not
-- just by which rows the client chooses to fetch.
drop policy if exists customer_select_own_messages on support_messages;
create policy customer_select_own_messages on support_messages for select
  using (customer_auth_uid = auth.uid() and visible_to_customer = true);

-- board_issues, support_conversations, and support_messages are already in
-- the supabase_realtime publication (migrations 0008, 0010) — no new
-- tables added here, so nothing further needed for Realtime delivery of
-- ticket_number/support_conversation_id/has_open_ticket changes.
