-- ============================================================================
-- Give rescue-team members full situational awareness across the operation:
-- - See the status of ALL rescue teams (already public-read, unaffected).
-- - Read ALL SOS incidents system-wide (an emergency/orders log), not just
--   the ones assigned or AI-recommended to their own team.
--
-- Write access is intentionally NOT widened: a rescue user can still only
-- UPDATE incidents assigned to their own team (existing
-- "sos_incidents: rescue update assigned" policy is unchanged).
-- ============================================================================

create policy "sos_incidents: rescue read all" on sos_incidents
  for select using (public.current_user_role() = 'rescue');
