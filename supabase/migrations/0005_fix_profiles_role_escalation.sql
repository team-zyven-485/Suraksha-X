-- ============================================================================
-- Fix: privilege escalation via self-service profiles.role / team_id writes
--
-- Root cause: "profiles: insert own" and "profiles: update own" only checked
-- auth.uid() = id, with no WITH CHECK constraining the `role`/`team_id`
-- columns. The frontend's role-select screen upserts { id, role, team_id }
-- straight from the client (see AuthContext.tsx), so any anonymous visitor
-- could self-assign role='admin' (or role='rescue' + any team_id) and
-- inherit every admin/rescue grant elsewhere in this schema: read all
-- profiles, write rescue_teams, read/update all sos_incidents (real
-- emergency records), and write relocation_plans / cap_broadcasts (forge
-- public emergency broadcasts).
--
-- Fix: self-service insert/update may only ever set role='citizen' with
-- team_id null. Admin/rescue profiles must be provisioned out-of-band
-- (directly via the service-role key), never through a client-writable
-- column. The frontend's existing mock-session fallback in AuthContext.tsx
-- already catches the resulting upsert rejection gracefully, so the
-- "Continue as Admin" / "Continue as Rescue" demo buttons keep working —
-- they just drop to the local-only mock session instead of a real
-- Supabase-backed one, exactly as they already do when Supabase isn't
-- configured at all.
-- ============================================================================

drop policy if exists "profiles: insert own" on profiles;
create policy "profiles: insert own" on profiles
  for insert with check (
    auth.uid() = id and role = 'citizen' and team_id is null
  );

drop policy if exists "profiles: update own" on profiles;
create policy "profiles: update own" on profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id and role = 'citizen' and team_id is null
  );
