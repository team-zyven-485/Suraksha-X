/**
 * SOS triage rules — pure functions with no browser or Node dependencies, so
 * the exact same logic runs in two places:
 *
 *  - on the server (authoritative: the API never trusts a client-supplied
 *    risk score, priority, or recommended team), and
 *  - in the browser (so an SOS raised while offline can still show the
 *    citizen an immediate local assessment before it has been transmitted).
 *
 * This is rule-based scoring over the scenario's hazard-zone data — distance,
 * zone risk level, and team specialization — not a trained ML model.
 */
import type { RiskZone } from '../types';
import type {
  AffectedZoneFlag,
  RescuePriority,
  RescueTeam,
  SOSCoordinates,
  SOSDisasterType,
} from '../types/sos';

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nearestZone(zones: RiskZone[], coords: SOSCoordinates): RiskZone | null {
  if (zones.length === 0) return null;
  return [...zones].sort(
    (a, b) => haversineKm(a.coordinates, coords) - haversineKm(b.coordinates, coords)
  )[0];
}

export function priorityFromRiskLevel(riskLevel: RiskZone['riskLevel']): RescuePriority {
  if (riskLevel === 'CRITICAL') return 'P1';
  if (riskLevel === 'HIGH') return 'P2';
  return 'P3';
}

// Spread radius per disaster type used to flag neighbouring zones. Wider for
// fast-spreading hazards (flood/cyclone/tsunami), tighter for localized ones
// (landslide/earthquake). A heuristic, not a prediction model.
export const IMPACT_RADIUS_KM: Record<SOSDisasterType, number> = {
  FLOOD: 15,
  CYCLONE: 18,
  TSUNAMI: 15,
  EARTHQUAKE: 10,
  LANDSLIDE: 8,
  FIRE: 12,
  OTHER: 10,
};

export function findAffectedZones(
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

// Best specialization match, preferring available teams, closest base
// distance as the tiebreaker.
export function recommendTeam(teams: RescueTeam[], disasterType: SOSDisasterType): RescueTeam | null {
  const candidates = teams.filter((t) => t.handles.includes(disasterType));
  const pool = candidates.length > 0 ? candidates : teams;
  const available = pool.filter((t) => t.status === 'AVAILABLE');
  const finalPool = available.length > 0 ? available : pool;
  if (finalPool.length === 0) return null;
  return [...finalPool].sort((a, b) => a.baseDistanceKm - b.baseDistanceKm)[0];
}

export function vulnerabilityTagsFor(zone: RiskZone | null): string[] {
  if (!zone) return [];
  const tags: string[] = [];
  if (zone.vulnerabilityBreakdown.elderly > 0) tags.push('Elderly Present');
  if (zone.vulnerabilityBreakdown.children > 0) tags.push('Children Present');
  if (zone.vulnerabilityBreakdown.pwd > 0) tags.push('Persons with Disabilities');
  if (zone.vulnerabilityBreakdown.highDensityHouseholds > 0) tags.push('High-Density Household');
  return tags;
}

export interface SOSTriageResult {
  zoneId: string | null;
  zoneName: string;
  location: string;
  riskScore: number;
  vulnerabilityTags: string[];
  affectedZones: AffectedZoneFlag[];
  recommendedTeamId: string | null;
  priority: RescuePriority;
}

export function triageSOS(input: {
  zones: RiskZone[];
  teams: RescueTeam[];
  coordinates: SOSCoordinates;
  disasterType: SOSDisasterType;
  /** Shown as the location when no hazard zone is known for the scenario. */
  fallbackRegion: string;
}): SOSTriageResult {
  const zone = nearestZone(input.zones, input.coordinates);
  const recommended = recommendTeam(input.teams, input.disasterType);
  return {
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? input.fallbackRegion,
    location: zone?.name ?? input.fallbackRegion,
    riskScore: zone?.riskScore ?? 50,
    vulnerabilityTags: vulnerabilityTagsFor(zone),
    affectedZones: findAffectedZones(input.zones, input.coordinates, input.disasterType),
    recommendedTeamId: recommended?.id ?? null,
    priority: zone ? priorityFromRiskLevel(zone.riskLevel) : 'P2',
  };
}

/** Forward-only lifecycle of an SOS incident. */
export const SOS_STATUS_ORDER = [
  'REQUESTED',
  'VERIFIED',
  'ASSIGNED',
  'DISPATCHED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'RESCUED',
  'CLOSED',
] as const;
