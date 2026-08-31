-- Adds a third feature_requests `kind`: 'later_on' — items the dev wants
-- to track but explicitly not act on right now (distinct from 'feature'/
-- 'suggestion', which are ideas rather than deferred work). Reuses the
-- same table/RLS/status machinery as Features/Suggestions (0017) rather
-- than a new table, consistent with this app's "one entity, filter by
-- kind" convention.

alter table feature_requests drop constraint feature_requests_kind_check;
alter table feature_requests
  add constraint feature_requests_kind_check
  check (kind in ('feature', 'suggestion', 'later_on'));
