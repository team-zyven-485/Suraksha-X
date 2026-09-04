-- ============================================================================
-- SURAKSHA-X — Initial Supabase schema
-- Disaster scenario data, relief/routing intelligence, SOS system, satellite
-- intelligence, and role-based profiles backing Supabase Auth.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES — one row per Supabase Auth user, carries the app role.
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('citizen', 'admin', 'rescue')),
  name text not null,
  team_id text, -- for role='rescue': links to rescue_teams.id (e.g. 'team-alpha')
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. SCENARIOS — the 5 demo disaster scenarios (flood/earthquake/cyclone/…).
-- ----------------------------------------------------------------------------
create table if not exists scenarios (
  id text primary key,
  name text not null,
  disaster_type text not null,
  category text not null,
  region text not null,
  state text not null,
  river_basin_or_fault text not null,
  last_updated text not null,
  critical_zones_count int not null default 0,
  total_hazard_zones int not null default 0,
  total_relief_centres int not null default 0,
  total_population_at_risk int not null default 0,
  total_vulnerable_population int not null default 0,
  available_shelter_capacity int not null default 0,
  total_shelter_capacity int not null default 0,
  total_shelter_occupancy int not null default 0,
  hazard_icon text not null,
  hazard_color text not null
);

-- ----------------------------------------------------------------------------
-- 3. RISK ZONES
-- ----------------------------------------------------------------------------
create table if not exists risk_zones (
  id text primary key,
  scenario_id text not null references scenarios(id) on delete cascade,
  name text not null,
  code text not null,
  district text not null,
  river_basin text not null,
  risk_score int not null,
  risk_level text not null check (risk_level in ('CRITICAL', 'HIGH', 'MODERATE', 'SAFE')),
  priority text not null check (priority in ('P1', 'P2', 'P3', 'P4')),
  population int not null default 0,
  vulnerable_population int not null default 0,
  exposure_level text not null,
  flood_depth_est_meters numeric not null default 0,
  water_level_trend text not null,
  recommended_action text not null,
  lat double precision not null,
  lng double precision not null,
  polygon jsonb not null,
  vulnerability_breakdown jsonb not null,
  reasoning text not null,
  last_assessed text not null
);
create index if not exists idx_risk_zones_scenario on risk_zones(scenario_id);

-- ----------------------------------------------------------------------------
-- 4. RELIEF CENTRES
-- ----------------------------------------------------------------------------
create table if not exists relief_centres (
  id text primary key,
  scenario_id text not null references scenarios(id) on delete cascade,
  name text not null,
  code text not null,
  location text not null,
  lat double precision not null,
  lng double precision not null,
  capacity int not null default 0,
  occupancy int not null default 0,
  available int not null default 0,
  status text not null check (status in ('AVAILABLE', 'NEAR_CAPACITY', 'FULL', 'UNAVAILABLE')),
  distance_km numeric,
  travel_time_min int,
  facilities jsonb not null,
  contact_officer jsonb not null,
  elevation_meters numeric not null default 0,
  safety_score int not null default 0
);
create index if not exists idx_relief_centres_scenario on relief_centres(scenario_id);

-- ----------------------------------------------------------------------------
-- 5. EVACUATION ROUTES
-- ----------------------------------------------------------------------------
create table if not exists evacuation_routes (
  id text primary key,
  scenario_id text not null references scenarios(id) on delete cascade,
  origin_id text not null,
  origin_name text not null,
  destination_id text not null,
  destination_name text not null,
  distance_km numeric not null,
  estimated_time_min int not null,
  safety_score int not null,
  safety_level text not null check (safety_level in ('HIGH', 'MODERATE', 'LOW')),
  blocked_roads_count int not null default 0,
  elevation_clearance_meters numeric not null default 0,
  coordinates jsonb not null,
  turn_by_turn jsonb not null,
  is_recommended boolean not null default false
);
create index if not exists idx_evacuation_routes_scenario on evacuation_routes(scenario_id);

-- ----------------------------------------------------------------------------
-- 6. BLOCKED ROADS
-- ----------------------------------------------------------------------------
create table if not exists blocked_roads (
  id text primary key,
  scenario_id text not null references scenarios(id) on delete cascade,
  name text not null,
  reason text not null,
  coordinates jsonb not null,
  severity text not null check (severity in ('TOTAL_BLOCKAGE', 'SUBMERGED_UNSAFE', 'LANDSLIDE_RISK')),
  reported_at text not null
);
create index if not exists idx_blocked_roads_scenario on blocked_roads(scenario_id);

-- ----------------------------------------------------------------------------
-- 7. ROAD NETWORKS
-- ----------------------------------------------------------------------------
create table if not exists road_networks (
  id text primary key,
  scenario_id text not null references scenarios(id) on delete cascade,
  name text not null,
  type text not null check (type in ('HIGHWAY', 'ARTERIAL', 'ELEVATED', 'SECONDARY', 'LOCAL')),
  status text not null check (status in ('CLEAR', 'CAUTION', 'RESTRICTED')),
  coordinates jsonb not null,
  speed_limit_kmh int not null default 0,
  lanes int not null default 1,
  elevation_meters numeric not null default 0
);
create index if not exists idx_road_networks_scenario on road_networks(scenario_id);

-- ----------------------------------------------------------------------------
-- 8. ALERTS
-- ----------------------------------------------------------------------------
create table if not exists alerts (
  id text primary key,
  scenario_id text not null references scenarios(id) on delete cascade,
  title text not null,
  message text not null,
  severity text not null check (severity in ('CRITICAL', 'WARNING', 'INFO')),
  timestamp text not null,
  zone_id text,
  read boolean not null default false
);
create index if not exists idx_alerts_scenario on alerts(scenario_id);

-- ----------------------------------------------------------------------------
-- 9. DEMOGRAPHICS (one row per scenario)
-- ----------------------------------------------------------------------------
create table if not exists demographics (
  scenario_id text primary key references scenarios(id) on delete cascade,
  total_population_at_risk int not null default 0,
  total_vulnerable_population int not null default 0,
  active_hazard_zones_count int not null default 0,
  critical_zones_count int not null default 0,
  relief_centres_count int not null default 0,
  available_shelter_capacity int not null default 0,
  total_shelter_capacity int not null default 0,
  total_shelter_occupancy int not null default 0,
  vulnerability_distribution jsonb not null
);

-- ----------------------------------------------------------------------------
-- 10. ANALYTICS SNAPSHOTS (one row per scenario — chart datasets)
-- ----------------------------------------------------------------------------
create table if not exists analytics_snapshots (
  scenario_id text primary key references scenarios(id) on delete cascade,
  risk_distribution jsonb not null,
  risk_trend jsonb not null,
  zone_comparison jsonb not null,
  shelter_utilization jsonb not null,
  evacuation_progress jsonb not null
);

-- ----------------------------------------------------------------------------
-- 11. RESCUE TEAMS
-- ----------------------------------------------------------------------------
create table if not exists rescue_teams (
  id text primary key,
  name text not null,
  specialization text not null,
  handles jsonb not null default '[]'::jsonb,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'ASSIGNED', 'DISPATCHED', 'BUSY')),
  base_distance_km numeric not null default 0,
  base_eta_min int not null default 0,
  active_incident_id text
);

-- ----------------------------------------------------------------------------
-- 12. SOS INCIDENTS
-- ----------------------------------------------------------------------------
create table if not exists sos_incidents (
  id text primary key,
  citizen_id uuid not null references profiles(id) on delete cascade,
  citizen_name text not null,
  scenario_id text not null references scenarios(id),
  zone_id text,
  zone_name text not null,
  location text not null,
  lat double precision not null,
  lng double precision not null,
  is_demo_location boolean not null default false,
  disaster_type text not null,
  hazard text not null,
  risk_score int not null default 0,
  vulnerability_tags jsonb not null default '[]'::jsonb,
  affected_zones jsonb not null default '[]'::jsonb,
  recommended_team_id text references rescue_teams(id),
  priority text not null check (priority in ('P1', 'P2', 'P3')),
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED','VERIFIED','ASSIGNED','DISPATCHED','EN_ROUTE','ARRIVED','IN_PROGRESS','RESCUED','CLOSED')),
  communication_mode text not null default 'Mobile Network',
  assigned_team_id text references rescue_teams(id),
  instructions jsonb,
  eta_min int,
  created_at timestamptz not null default now(),
  status_history jsonb not null default '[]'::jsonb
);
create index if not exists idx_sos_incidents_citizen on sos_incidents(citizen_id);
create index if not exists idx_sos_incidents_team on sos_incidents(assigned_team_id);
create index if not exists idx_sos_incidents_status on sos_incidents(status);

-- ----------------------------------------------------------------------------
-- 13. RELOCATION PLANS (already referenced by the existing frontend persistence helper)
-- ----------------------------------------------------------------------------
create table if not exists relocation_plans (
  id text primary key,
  zone_id text not null,
  zone_name text not null,
  total_population int not null default 0,
  vulnerable_population int not null default 0,
  shelter_id text not null,
  shelter_name text not null,
  route_id text not null,
  route_name text not null,
  status text not null,
  checklist jsonb not null default '[]'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 14. CAP BROADCASTS (already referenced by the existing frontend persistence helper)
-- ----------------------------------------------------------------------------
create table if not exists cap_broadcasts (
  identifier text primary key,
  sender text not null,
  sent_at text not null,
  status text not null,
  message_type text not null,
  headline text not null,
  description text not null,
  area_desc text not null,
  channels jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 15. SATELLITE HAZARD EXTENTS (written by the FastAPI backend, service-role only)
-- ----------------------------------------------------------------------------
create table if not exists satellite_hazard_extents (
  id bigint generated always as identity primary key,
  scenario_id text references scenarios(id),
  source text not null default 'Sentinel-1',
  product text not null default 'Sentinel-1 GRD',
  observation_time text,
  processed_at timestamptz not null default now(),
  aoi jsonb not null,
  hazard_type text not null default 'flood',
  status text not null,
  data_mode text not null check (data_mode in ('CONNECTED', 'DEMO', 'UNAVAILABLE')),
  detection_method text not null,
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  affected_area_km2 numeric not null default 0,
  geojson jsonb,
  message text
);
create index if not exists idx_satellite_extents_scenario on satellite_hazard_extents(scenario_id, processed_at desc);

-- ----------------------------------------------------------------------------
-- 16. ROAD IMPACTS (satellite-derived road risk, written by the backend)
-- ----------------------------------------------------------------------------
create table if not exists road_impacts (
  id bigint generated always as identity primary key,
  scenario_id text references scenarios(id),
  hazard_extent_id bigint references satellite_hazard_extents(id) on delete cascade,
  road_id text not null,
  road_name text not null,
  status text not null check (status in ('SAFE', 'AT_RISK', 'BLOCKED')),
  risk_score int not null default 0,
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  hazard_source text not null default 'Sentinel-1',
  data_mode text not null check (data_mode in ('CONNECTED', 'DEMO', 'UNAVAILABLE')),
  updated_at timestamptz not null default now(),
  reason text not null
);
create index if not exists idx_road_impacts_scenario on road_impacts(scenario_id, updated_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table profiles enable row level security;
alter table scenarios enable row level security;
alter table risk_zones enable row level security;
alter table relief_centres enable row level security;
alter table evacuation_routes enable row level security;
alter table blocked_roads enable row level security;
alter table road_networks enable row level security;
alter table alerts enable row level security;
alter table demographics enable row level security;
alter table analytics_snapshots enable row level security;
alter table rescue_teams enable row level security;
alter table sos_incidents enable row level security;
alter table relocation_plans enable row level security;
alter table cap_broadcasts enable row level security;
alter table satellite_hazard_extents enable row level security;
alter table road_impacts enable row level security;

-- ---- profiles: users manage their own row; admins can read all ----
create policy "profiles: read own" on profiles
  for select using (auth.uid() = id);
create policy "profiles: admin reads all" on profiles
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "profiles: insert own" on profiles
  for insert with check (auth.uid() = id);
create policy "profiles: update own" on profiles
  for update using (auth.uid() = id);

-- ---- reference/scenario data: public read, writes are service-role only ----
create policy "scenarios: public read" on scenarios for select using (true);
create policy "risk_zones: public read" on risk_zones for select using (true);
create policy "relief_centres: public read" on relief_centres for select using (true);
create policy "evacuation_routes: public read" on evacuation_routes for select using (true);
create policy "blocked_roads: public read" on blocked_roads for select using (true);
create policy "road_networks: public read" on road_networks for select using (true);
create policy "alerts: public read" on alerts for select using (true);
create policy "demographics: public read" on demographics for select using (true);
create policy "analytics_snapshots: public read" on analytics_snapshots for select using (true);
create policy "satellite_hazard_extents: public read" on satellite_hazard_extents for select using (true);
create policy "road_impacts: public read" on road_impacts for select using (true);
-- No insert/update/delete policies on the above for anon/authenticated —
-- only the service-role key (used by the FastAPI backend / seed scripts) can
-- write, since service_role bypasses RLS entirely.

-- ---- rescue_teams: public read; only admins may write ----
create policy "rescue_teams: public read" on rescue_teams for select using (true);
create policy "rescue_teams: admin write" on rescue_teams
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---- sos_incidents ----
-- Citizens: create their own incidents and read their own.
create policy "sos_incidents: citizen create own" on sos_incidents
  for insert with check (
    citizen_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'citizen')
  );
create policy "sos_incidents: citizen read own" on sos_incidents
  for select using (citizen_id = auth.uid());
-- Admins: full read/write access (assign teams, send instructions, etc).
create policy "sos_incidents: admin read all" on sos_incidents
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "sos_incidents: admin write all" on sos_incidents
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
-- Rescue team members: read/update incidents assigned to their team, and read
-- incoming (unassigned, AI-recommended) alerts for their team.
create policy "sos_incidents: rescue read assigned or incoming" on sos_incidents
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'rescue'
        and (p.team_id = sos_incidents.assigned_team_id or p.team_id = sos_incidents.recommended_team_id)
    )
  );
create policy "sos_incidents: rescue update assigned" on sos_incidents
  for update using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'rescue' and p.team_id = sos_incidents.assigned_team_id
    )
  );

-- ---- relocation_plans / cap_broadcasts: authenticated read, admin write ----
create policy "relocation_plans: authenticated read" on relocation_plans
  for select using (auth.role() = 'authenticated');
create policy "relocation_plans: admin write" on relocation_plans
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "cap_broadcasts: authenticated read" on cap_broadcasts
  for select using (auth.role() = 'authenticated');
create policy "cap_broadcasts: admin write" on cap_broadcasts
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================================
-- REALTIME — expose SOS/status tables to Supabase Realtime for live updates
-- across Citizen / Admin / Rescue Team dashboards.
-- ============================================================================
alter publication supabase_realtime add table sos_incidents;
alter publication supabase_realtime add table rescue_teams;
