-- Manual priority reordering for Personal Tasks — up/down arrows let a
-- member move a task above/below its neighbor within the same day, same
-- mechanism as board_issues.sort_order (migration 0019): a swap between
-- two adjacent tasks is just two UPDATEs exchanging their sort_order
-- values, no renumbering of the whole list needed.
--
-- Ascending order here (lower sort_order = higher up the list), unlike
-- board_issues' descending convention — a day's task list reads
-- top-to-bottom as "in the order added" by default, with newly added
-- tasks appended at the bottom, matching a simple to-do list rather than
-- a reverse-chronological feed.
alter table personal_tasks add column sort_order bigint;
update personal_tasks set sort_order = extract(epoch from created_at)::bigint;
alter table personal_tasks alter column sort_order set not null;
alter table personal_tasks alter column sort_order set default extract(epoch from now())::bigint;
