-- Fixes a real bug found live during verification: support_messages'
-- customer-facing SELECT policy used a subquery against
-- support_conversations ("conversation_id in (select id from
-- support_conversations where customer_auth_uid = auth.uid())"). The
-- channel reported "SUBSCRIBED" correctly, but Realtime never delivered
-- INSERT events through it — reproduced with React Strict Mode disabled,
-- production build, unique channel names, and the sibling
-- support_conversations subscription (whose policy has NO subquery and
-- works reliably) fully disabled, ruling out every other explanation.
-- Supabase Realtime's postgres_changes authorization is documented as
-- unreliable with cross-table-subquery RLS policies. Fix: denormalize
-- customer_auth_uid directly onto support_messages so its customer policy
-- becomes a simple equality check, matching every other policy in this
-- app that Realtime already delivers correctly for.

alter table support_messages add column customer_auth_uid uuid;

update support_messages m
set customer_auth_uid = c.customer_auth_uid
from support_conversations c
where m.conversation_id = c.id;

alter table support_messages alter column customer_auth_uid set not null;

drop policy if exists customer_select_own_messages on support_messages;
drop policy if exists customer_insert_own_messages on support_messages;

create policy customer_select_own_messages on support_messages for select
  using (customer_auth_uid = auth.uid());
create policy customer_insert_own_messages on support_messages for insert
  with check (sender_type = 'customer' and customer_auth_uid = auth.uid());
