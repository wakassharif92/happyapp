-- Fixes a real bug found live during verification: `current_user_company_id()`
-- (0014) queries `company_members` to resolve the caller's company —  but
-- `company_members`'s own RLS policies (member_read_company_roster,
-- admin_manage_members, admin_update_members) call
-- `current_user_company_id()` to evaluate THEIR using/with-check clause.
-- Every select against company_members (including the one inside the
-- function itself) re-triggers policy evaluation, which calls the function
-- again — infinite recursion, surfaced as Postgres error 54001 "stack
-- depth limit exceeded" on literally any query touching a company-scoped
-- table (since every rewritten policy in 0015 calls this function too).
--
-- Fix: SECURITY DEFINER makes the function run as its owner (the migration
-- role, which bypasses RLS on tables it owns) rather than the calling
-- user — so its own internal lookup against company_members skips RLS
-- entirely instead of re-triggering policy evaluation. `set search_path`
-- is required alongside SECURITY DEFINER as a security hardening measure
-- (prevents a search_path-based function-shadowing attack against a
-- definer-rights function).

create or replace function current_user_company_id() returns uuid
language sql stable security definer
set search_path = public
as $$
  select company_id from company_members
  where user_id = auth.uid() and invite_status = 'active'
  limit 1;
$$;
