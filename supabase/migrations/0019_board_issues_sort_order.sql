-- Manual priority reordering on the Issue Board — up/down arrows on each
-- card (replacing the thumbnail there, per the redesign) let a dev move
-- an issue above/below its neighbor within the current tab. Backfilled
-- from created_at so existing lists keep their current (newest-first)
-- order until someone actually reorders something; new rows default the
-- same way. A swap between two adjacent issues is just two UPDATEs
-- exchanging their sort_order values — no renumbering of the whole list
-- needed.
alter table board_issues add column sort_order bigint;
update board_issues set sort_order = extract(epoch from created_at)::bigint;
alter table board_issues alter column sort_order set not null;
alter table board_issues alter column sort_order set default extract(epoch from now())::bigint;
