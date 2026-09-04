-- ============================================================================
-- Fix: "infinite recursion detected in policy for relation profiles"
--
-- Root cause: several policies (including one ON profiles itself) check the
-- current user's role via `exists (select 1 from profiles p where p.id =
-- auth.uid() and p.role = 'admin')`. When that subquery runs, Postgres
-- re-evaluates profiles' own RLS policies to decide if the row is visible —
-- including the very policy doing the checking — which recurses forever.
--
-- Fix: read the role/team through a SECURITY DEFINER function, which runs
-- with the function owner's privileges and so bypasses RLS on its internal
-- lookup, breaking the recursion. All admin/rescue-role policies are
-- recreated to use these helpers instead of a direct profiles subquery.
-- ============================================================================

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.current_user_team_id()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select team_id from profiles where id = auth.uid();
$$;

grant execute on function public.current_user_role() to authenticated, anon;
grant execute on function public.current_user_team_id() to authenticated, anon;

-- ---- profiles ----
drop policy if exists "profiles: admin reads all" on profiles;
create policy "profiles: admin reads all" on profiles
  for select using (public.current_user_role() = 'admin');

-- ---- rescue_teams ----
drop policy if exists "rescue_teams: admin write" on rescue_teams;
create policy "rescue_teams: admin write" on rescue_teams
  for all using (public.current_user_role() = 'admin');

-- ---- sos_incidents ----
drop policy if exists "sos_incidents: admin read all" on sos_incidents;
create policy "sos_incidents: admin read all" on sos_incidents
  for select using (public.current_user_role() = 'admin');

drop policy if exists "sos_incidents: admin write all" on sos_incidents;
create policy "sos_incidents: admin write all" on sos_incidents
  for update using (public.current_user_role() = 'admin');

drop policy if exists "sos_incidents: rescue read assigned or incoming" on sos_incidents;
create policy "sos_incidents: rescue read assigned or incoming" on sos_incidents
  for select using (
    public.current_user_role() = 'rescue'
    and (
      public.current_user_team_id() = sos_incidents.assigned_team_id
      or public.current_user_team_id() = sos_incidents.recommended_team_id
    )
  );

drop policy if exists "sos_incidents: rescue update assigned" on sos_incidents;
create policy "sos_incidents: rescue update assigned" on sos_incidents
  for update using (
    public.current_user_role() = 'rescue'
    and public.current_user_team_id() = sos_incidents.assigned_team_id
  );

-- Citizen policies also referenced a profiles subquery for the insert check —
-- switch to the same recursion-safe helper for consistency.
drop policy if exists "sos_incidents: citizen create own" on sos_incidents;
create policy "sos_incidents: citizen create own" on sos_incidents
  for insert with check (
    citizen_id = auth.uid()
    and public.current_user_role() = 'citizen'
  );

-- ---- relocation_plans / cap_broadcasts ----
drop policy if exists "relocation_plans: admin write" on relocation_plans;
create policy "relocation_plans: admin write" on relocation_plans
  for all using (public.current_user_role() = 'admin');

drop policy if exists "cap_broadcasts: admin write" on cap_broadcasts;
create policy "cap_broadcasts: admin write" on cap_broadcasts
  for all using (public.current_user_role() = 'admin');
