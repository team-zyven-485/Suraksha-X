import type { EvacuationRoute } from '../types';
import { haversineKm } from '../shared/sosTriage';
import { api } from './api';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoadRouteData {
  available: true;
  source: string;
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][];
  steps: { instruction: string; distanceM: number; name: string }[];
}

/** Real road route (OpenStreetMap via our server), or null if unavailable / offline. */
export async function fetchRoadRoute(from: LatLng, to: LatLng): Promise<RoadRouteData | null> {
  try {
    const q = new URLSearchParams({
      fromLat: String(from.lat),
      fromLng: String(from.lng),
      toLat: String(to.lat),
      toLng: String(to.lng),
    });
    const data = await api<RoadRouteData | { available: false }>(`/route?${q}`, { signal: AbortSignal.timeout(12_000) });
    return data.available ? data : null;
  } catch {
    return null;
  }
}

const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(1, Math.round(m / 10) * 10)} m`);

/** Build the app's route shape from a real road route. */
export function roadRouteToEvacuationRoute(base: EvacuationRoute, road: RoadRouteData): EvacuationRoute {
  return {
    ...base,
    id: `road-${base.destinationId}`,
    distanceKm: road.distanceKm,
    estimatedTimeMin: road.durationMin,
    coordinates: road.coordinates,
    turnByTurn: road.steps.map((s, i) => ({
      step: i + 1,
      instruction: s.instruction,
      distance: fmtDistance(s.distanceM),
      // OpenStreetMap has no flood/blockage information, so say "unknown" rather than "clear".
      roadCondition: 'UNKNOWN' as const,
    })),
  };
}

/** Replace a straight-line "direct-" estimate with a real road route when one can be fetched. */
export async function upgradeToRoadRoute(route: EvacuationRoute): Promise<EvacuationRoute> {
  if (!route.id.startsWith('direct-') || route.coordinates.length < 2) return route;
  const first = route.coordinates[0];
  const last = route.coordinates[route.coordinates.length - 1];
  const road = await fetchRoadRoute({ lat: first[0], lng: first[1] }, { lat: last[0], lng: last[1] });
  return road ? roadRouteToEvacuationRoute(route, road) : route;
}

// ---------------------------------------------------------------------------
// Polyline geometry
// ---------------------------------------------------------------------------
export function cumulativeKm(coords: [number, number][]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineKm({ lat: coords[i - 1][0], lng: coords[i - 1][1] }, { lat: coords[i][0], lng: coords[i][1] }));
  }
  return cum;
}

/** Where `pos` is along the route: distance still to go, and how far off the line it is. */
export function progressAlong(coords: [number, number][], cum: number[], pos: LatLng) {
  let best = 0;
  let bestKm = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineKm(pos, { lat: coords[i][0], lng: coords[i][1] });
    if (d < bestKm) {
      bestKm = d;
      best = i;
    }
  }
  const total = cum[cum.length - 1];
  const spacingKm = total / Math.max(1, coords.length - 1);
  return {
    remainingKm: Math.max(0, total - cum[best]) + bestKm,
    // The route is decimated, so allow roughly one vertex-gap before calling it "off route".
    offRoute: bestKm > Math.max(0.4, spacingKm),
  };
}

/** The point `km` along the route (clamped to its ends). */
export function pointAtKm(coords: [number, number][], cum: number[], km: number): LatLng {
  const total = cum[cum.length - 1];
  const d = Math.min(Math.max(km, 0), total);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / segLen;
  return {
    lat: coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
    lng: coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
  };
}

/** A point `km` away from `origin` along a compass bearing (degrees). */
export function offsetPoint(origin: LatLng, km: number, bearingDeg: number): LatLng {
  const R = 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const dr = km / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}
