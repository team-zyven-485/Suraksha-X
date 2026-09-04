import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  SOSIncident,
  SOSStatus,
  SOSCoordinates,
  RescueTeam,
  RescuePriority,
  SOSDisasterType,
  AffectedZoneFlag,
  SOSInstructions,
  SOS_DISASTER_TYPE_LABELS,
} from '../types/sos';
import { initialRescueTeams } from '../data/rescueTeams';
import { useDisaster } from './DisasterContext';
import { useAuth } from './AuthContext';
import { RiskZone } from '../types';
import { getSupabaseClient } from '../lib/supabaseClient';

interface CreateSOSInput {
  coordinates: SOSCoordinates;
  isDemoLocation: boolean;
  citizenId: string;
  citizenName: string;
  disasterType: SOSDisasterType;
}

interface AssignTeamOptions {
  priority?: RescuePriority;
  requiredAction: string;
  notes: string;
  issuedBy: string;
}

interface SOSContextType {
  incidents: SOSIncident[];
  rescueTeams: RescueTeam[];
  createSOS: (input: CreateSOSInput) => Promise<SOSIncident | null>;
  assignTeam: (incidentId: string, teamId: string, instructions: AssignTeamOptions) => Promise<void>;
  dispatchTeam: (incidentId: string) => Promise<void>;
  advanceStatus: (incidentId: string, status: SOSStatus) => Promise<void>;
  getIncidentsForCitizen: (citizenId: string) => SOSIncident[];
  getIncidentsForTeam: (teamId: string) => SOSIncident[];
  getIncomingAlertsForTeam: (teamId: string) => SOSIncident[];
  getIncidentById: (id: string) => SOSIncident | undefined;
  getTeamById: (id: string) => RescueTeam | undefined;
}

const SOSContext = createContext<SOSContextType | undefined>(undefined);

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearestZone(zones: RiskZone[], coords: SOSCoordinates): RiskZone | null {
  if (zones.length === 0) return null;
  return [...zones].sort(
    (a, b) => haversineKm(a.coordinates, coords) - haversineKm(b.coordinates, coords)
  )[0];
}

function priorityFromRiskLevel(riskLevel: RiskZone['riskLevel']): RescuePriority {
  if (riskLevel === 'CRITICAL') return 'P1';
  if (riskLevel === 'HIGH') return 'P2';
  return 'P3';
}

// Heuristic "AI analysis" spread radius per disaster type — simulated impact
// modeling, not a real prediction model. Wider for fast-spreading hazards
// (flood/cyclone/tsunami), tighter for localized ones (landslide/earthquake).
const IMPACT_RADIUS_KM: Record<SOSDisasterType, number> = {
  FLOOD: 15,
  CYCLONE: 18,
  TSUNAMI: 15,
  EARTHQUAKE: 10,
  LANDSLIDE: 8,
  FIRE: 12,
  OTHER: 10,
};

function findAffectedZones(
  zones: RiskZone[],
  coords: SOSCoordinates,
  disasterType: SOSDisasterType
): AffectedZoneFlag[] {
  const radius = IMPACT_RADIUS_KM[disasterType];
  return zones
    .map((z) => ({ zone: z, distanceKm: haversineKm(z.coordinates, coords) }))
    .filter((entry) => entry.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5)
    .map((entry) => ({
      zoneId: entry.zone.id,
      zoneName: entry.zone.name,
      distanceKm: Math.round(entry.distanceKm * 10) / 10,
      riskLevel: entry.zone.riskLevel,
    }));
}

// AI-style team recommendation: best specialization match, preferring
// available teams, closest distance as tiebreaker.
function recommendTeam(teams: RescueTeam[], disasterType: SOSDisasterType): RescueTeam | null {
  const candidates = teams.filter((t) => t.handles.includes(disasterType));
  const pool = candidates.length > 0 ? candidates : teams;
  const available = pool.filter((t) => t.status === 'AVAILABLE');
  const finalPool = available.length > 0 ? available : pool;
  if (finalPool.length === 0) return null;
  return [...finalPool].sort((a, b) => a.baseDistanceKm - b.baseDistanceKm)[0];
}

const stamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ---------------------------------------------------------------------------
// Supabase row <-> app-model mappers
// ---------------------------------------------------------------------------
function mapIncidentRow(r: any): SOSIncident {
  return {
    id: r.id,
    citizenId: r.citizen_id,
    citizenName: r.citizen_name,
    scenarioId: r.scenario_id,
    zoneId: r.zone_id,
    zoneName: r.zone_name,
    location: r.location,
    coordinates: { lat: r.lat, lng: r.lng },
    isDemoLocation: r.is_demo_location,
    disasterType: r.disaster_type,
    hazard: r.hazard,
    riskScore: r.risk_score,
    vulnerabilityTags: r.vulnerability_tags || [],
    affectedZones: r.affected_zones || [],
    recommendedTeamId: r.recommended_team_id,
    priority: r.priority,
    status: r.status,
    communicationMode: r.communication_mode,
    assignedTeamId: r.assigned_team_id,
    instructions: r.instructions,
    etaMin: r.eta_min,
    timestamp: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    statusHistory: r.status_history || [],
  };
}

function mapTeamRow(r: any): RescueTeam {
  return {
    id: r.id,
    name: r.name,
    specialization: r.specialization,
    handles: r.handles || [],
    status: r.status,
    baseDistanceKm: Number(r.base_distance_km),
    baseEtaMin: r.base_eta_min,
    activeIncidentId: r.active_incident_id,
  };
}

export const SOSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { scenarioMeta, riskZones } = useDisaster();
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<SOSIncident[]>([]);
  const [rescueTeams, setRescueTeams] = useState<RescueTeam[]>(initialRescueTeams);
  const supabase = getSupabaseClient();

  // ---- Supabase-backed data: initial fetch + Realtime subscription ----
  // Re-runs whenever the logged-in identity changes (login/logout/role
  // switch) — RLS scopes what each session can see, so a stale fetch/channel
  // from a previous session (or from before any login) must be torn down and
  // replaced, not left running indefinitely.
  useEffect(() => {
    if (!supabase || !user) {
      setIncidents([]);
      return;
    }

    let cancelled = false;

    const fetchAll = async () => {
      const [{ data: incidentRows, error: incidentError }, { data: teamRows, error: teamError }] = await Promise.all([
        supabase.from('sos_incidents').select('*').order('created_at', { ascending: false }),
        supabase.from('rescue_teams').select('*'),
      ]);
      if (cancelled) return;
      if (incidentError) console.warn('[SOS] Failed to fetch incidents:', incidentError.message);
      if (teamError) console.warn('[SOS] Failed to fetch rescue teams:', teamError.message);
      if (incidentRows) setIncidents(incidentRows.map(mapIncidentRow));
      if (teamRows && teamRows.length > 0) setRescueTeams(teamRows.map(mapTeamRow));
    };
    fetchAll();

    const channel = supabase
      .channel(`sos-realtime-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_incidents' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rescue_teams' }, () => fetchAll())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!supabase, user?.id]);

  const pushHistory = (incident: SOSIncident, status: SOSStatus): SOSIncident => ({
    ...incident,
    status,
    statusHistory: [...incident.statusHistory, { status, timestamp: stamp() }],
  });

  // ---------------------------------------------------------------------
  // createSOS
  // ---------------------------------------------------------------------
  const createSOS = useCallback(
    async (input: CreateSOSInput): Promise<SOSIncident | null> => {
      const zone = nearestZone(riskZones, input.coordinates);
      const vulnerabilityTags: string[] = [];
      if (zone) {
        if (zone.vulnerabilityBreakdown.elderly > 0) vulnerabilityTags.push('Elderly Present');
        if (zone.vulnerabilityBreakdown.children > 0) vulnerabilityTags.push('Children Present');
        if (zone.vulnerabilityBreakdown.pwd > 0) vulnerabilityTags.push('Persons with Disabilities');
        if (zone.vulnerabilityBreakdown.highDensityHouseholds > 0) vulnerabilityTags.push('High-Density Household');
      }

      const affectedZones = findAffectedZones(riskZones, input.coordinates, input.disasterType);
      const recommended = recommendTeam(rescueTeams, input.disasterType);

      const incident: SOSIncident = {
        id: `SOS-${Date.now().toString().slice(-5)}`,
        citizenId: input.citizenId,
        citizenName: input.citizenName,
        scenarioId: scenarioMeta.id,
        zoneId: zone?.id ?? null,
        zoneName: zone?.name ?? scenarioMeta.region,
        location: zone?.name ?? scenarioMeta.region,
        coordinates: input.coordinates,
        isDemoLocation: input.isDemoLocation,
        disasterType: input.disasterType,
        hazard: SOS_DISASTER_TYPE_LABELS[input.disasterType],
        riskScore: zone?.riskScore ?? 50,
        vulnerabilityTags,
        affectedZones,
        recommendedTeamId: recommended?.id ?? null,
        priority: zone ? priorityFromRiskLevel(zone.riskLevel) : 'P2',
        status: 'REQUESTED',
        communicationMode: 'Mobile Network',
        assignedTeamId: null,
        instructions: null,
        etaMin: null,
        timestamp: stamp(),
        statusHistory: [{ status: 'REQUESTED', timestamp: stamp() }],
      };

      if (supabase) {
        try {
          const { error } = await supabase.from('sos_incidents').insert({
            id: incident.id,
            citizen_id: incident.citizenId,
            citizen_name: incident.citizenName,
            scenario_id: incident.scenarioId,
            zone_id: incident.zoneId,
            zone_name: incident.zoneName,
            location: incident.location,
            lat: incident.coordinates.lat,
            lng: incident.coordinates.lng,
            is_demo_location: incident.isDemoLocation,
            disaster_type: incident.disasterType,
            hazard: incident.hazard,
            risk_score: incident.riskScore,
            vulnerability_tags: incident.vulnerabilityTags,
            affected_zones: incident.affectedZones,
            recommended_team_id: incident.recommendedTeamId,
            priority: incident.priority,
            status: incident.status,
            communication_mode: incident.communicationMode,
            status_history: incident.statusHistory,
          });
          if (error) {
            console.warn('[SOS] Supabase insert failed, using local state only:', error.message);
          }
        } catch (err) {
          // Genuinely unreachable backend (not just an RLS/validation error,
          // which Supabase-js reports via `error` above) — still fall back to
          // local state so the citizen isn't blocked, but the caller can
          // still detect and surface a real failure once we can't do even that.
          console.warn('[SOS] Supabase insert threw unexpectedly, using local state only:', err);
        }
        // Realtime subscription will refresh `incidents`; also apply
        // optimistically so the citizen sees it immediately.
        setIncidents((prev) => [incident, ...prev]);
        return incident;
      }

      // No Supabase configured — pure local/in-memory behavior.
      setIncidents((prev) => [incident, ...prev]);
      return incident;
    },
    [riskZones, rescueTeams, scenarioMeta, supabase]
  );

  // ---------------------------------------------------------------------
  // assignTeam
  // ---------------------------------------------------------------------
  const assignTeam = useCallback(
    async (incidentId: string, teamId: string, options: AssignTeamOptions) => {
      const current = incidents.find((i) => i.id === incidentId);
      const team = rescueTeams.find((t) => t.id === teamId);
      const instructions: SOSInstructions = {
        priority: options.priority ?? current?.priority ?? 'P2',
        requiredAction: options.requiredAction,
        notes: options.notes,
        issuedBy: options.issuedBy,
        issuedAt: stamp(),
      };
      const newHistory = current ? [...current.statusHistory, { status: 'ASSIGNED' as SOSStatus, timestamp: stamp() }] : [];

      if (supabase) {
        const [incidentResult, teamResult] = await Promise.all([
          supabase
            .from('sos_incidents')
            .update({
              assigned_team_id: teamId,
              eta_min: team?.baseEtaMin ?? null,
              priority: instructions.priority,
              instructions,
              status: 'ASSIGNED',
              status_history: newHistory,
            })
            .eq('id', incidentId),
          supabase.from('rescue_teams').update({ status: 'ASSIGNED', active_incident_id: incidentId }).eq('id', teamId),
        ]);
        if (incidentResult.error) console.warn('[SOS] assignTeam: incident update failed:', incidentResult.error.message);
        if (teamResult.error) console.warn('[SOS] assignTeam: team update failed:', teamResult.error.message);
        return;
      }

      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incidentId
            ? pushHistory({ ...inc, assignedTeamId: teamId, etaMin: team?.baseEtaMin ?? null, priority: instructions.priority, instructions }, 'ASSIGNED')
            : inc
        )
      );
      setRescueTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, status: 'ASSIGNED', activeIncidentId: incidentId } : t)));
    },
    [incidents, rescueTeams, supabase]
  );

  // ---------------------------------------------------------------------
  // dispatchTeam
  // ---------------------------------------------------------------------
  const dispatchTeam = useCallback(
    async (incidentId: string) => {
      const current = incidents.find((i) => i.id === incidentId);
      const newHistory = current ? [...current.statusHistory, { status: 'DISPATCHED' as SOSStatus, timestamp: stamp() }] : [];

      if (supabase) {
        const { error } = await supabase.from('sos_incidents').update({ status: 'DISPATCHED', status_history: newHistory }).eq('id', incidentId);
        if (error) console.warn('[SOS] dispatchTeam: incident update failed:', error.message);
        if (current?.assignedTeamId) {
          const { error: teamError } = await supabase.from('rescue_teams').update({ status: 'DISPATCHED' }).eq('id', current.assignedTeamId);
          if (teamError) console.warn('[SOS] dispatchTeam: team update failed:', teamError.message);
        }
        return;
      }

      setIncidents((prev) => prev.map((inc) => (inc.id === incidentId ? pushHistory(inc, 'DISPATCHED') : inc)));
      if (current?.assignedTeamId) {
        setRescueTeams((prev) => prev.map((t) => (t.id === current.assignedTeamId ? { ...t, status: 'DISPATCHED' } : t)));
      }
    },
    [incidents, supabase]
  );

  // ---------------------------------------------------------------------
  // advanceStatus
  // ---------------------------------------------------------------------
  const advanceStatus = useCallback(
    async (incidentId: string, status: SOSStatus) => {
      const current = incidents.find((i) => i.id === incidentId);
      const newHistory = current ? [...current.statusHistory, { status, timestamp: stamp() }] : [];
      const freeTeam = status === 'RESCUED' || status === 'CLOSED';
      const dispatchingTeam = status === 'DISPATCHED' || status === 'EN_ROUTE';

      if (supabase) {
        const { error } = await supabase.from('sos_incidents').update({ status, status_history: newHistory }).eq('id', incidentId);
        if (error) console.warn('[SOS] advanceStatus: incident update failed:', error.message);
        if (current?.assignedTeamId) {
          if (freeTeam) {
            const { error: teamError } = await supabase.from('rescue_teams').update({ status: 'AVAILABLE', active_incident_id: null }).eq('id', current.assignedTeamId);
            if (teamError) console.warn('[SOS] advanceStatus: team free-up failed:', teamError.message);
          } else if (dispatchingTeam) {
            const { error: teamError } = await supabase.from('rescue_teams').update({ status: 'DISPATCHED' }).eq('id', current.assignedTeamId);
            if (teamError) console.warn('[SOS] advanceStatus: team dispatch update failed:', teamError.message);
          }
        }
        return;
      }

      setIncidents((prev) => prev.map((inc) => (inc.id === incidentId ? pushHistory(inc, status) : inc)));
      if (current?.assignedTeamId) {
        if (freeTeam) {
          setRescueTeams((prev) => prev.map((t) => (t.id === current.assignedTeamId ? { ...t, status: 'AVAILABLE', activeIncidentId: null } : t)));
        } else if (dispatchingTeam) {
          setRescueTeams((prev) => prev.map((t) => (t.id === current.assignedTeamId ? { ...t, status: 'DISPATCHED' } : t)));
        }
      }
    },
    [incidents, supabase]
  );

  const getIncidentsForCitizen = (citizenId: string) => incidents.filter((i) => i.citizenId === citizenId);
  const getIncidentsForTeam = (teamId: string) => incidents.filter((i) => i.assignedTeamId === teamId);
  const getIncomingAlertsForTeam = (teamId: string) =>
    incidents.filter(
      (i) => i.recommendedTeamId === teamId && i.assignedTeamId === null && i.status === 'REQUESTED'
    );
  const getIncidentById = (id: string) => incidents.find((i) => i.id === id);
  const getTeamById = (id: string) => rescueTeams.find((t) => t.id === id);

  return (
    <SOSContext.Provider
      value={{
        incidents,
        rescueTeams,
        createSOS,
        assignTeam,
        dispatchTeam,
        advanceStatus,
        getIncidentsForCitizen,
        getIncidentsForTeam,
        getIncomingAlertsForTeam,
        getIncidentById,
        getTeamById,
      }}
    >
      {children}
    </SOSContext.Provider>
  );
};

export const useSOS = () => {
  const context = useContext(SOSContext);
  if (!context) {
    throw new Error('useSOS must be used within an SOSProvider');
  }
  return context;
};
