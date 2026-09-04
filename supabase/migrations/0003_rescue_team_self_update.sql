-- ============================================================================
-- Fix: rescue team members have no write access to rescue_teams at all
-- (the only existing write policy is "admin write"), so when a rescue user
-- advances an incident to RESCUED/CLOSED/DISPATCHED/EN_ROUTE, the companion
-- update that frees/marks their own team's row in `rescue_teams` silently
-- fails RLS — the team stays stuck as DISPATCHED with a stale
-- active_incident_id even after the incident is resolved.
--
-- Fix: allow a rescue-role user to update (only) the row matching their own
-- profile.team_id.
-- ============================================================================

create policy "rescue_teams: rescue self update" on rescue_teams
  for update using (
    public.current_user_role() = 'rescue'
    and public.current_user_team_id() = rescue_teams.id
  );

-- One-off repair for any team rows already left stuck by the bug above:
-- clear active_incident_id / reset to AVAILABLE for teams whose linked
-- incident is already RESCUED or CLOSED.
update rescue_teams t
set status = 'AVAILABLE', active_incident_id = null
where t.active_incident_id is not null
  and exists (
    select 1 from sos_incidents i
    where i.id = t.active_incident_id
      and i.status in ('RESCUED', 'CLOSED')
  );
