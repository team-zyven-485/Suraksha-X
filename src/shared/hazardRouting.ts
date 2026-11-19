/**
 * Hazard-aware route choice.
 *
 * Given several road routes (from OpenStreetMap) and a simulated hazard
 * footprint, measure how far each route runs through each zone and pick the
 * one that best balances travel time against exposure. Pure, deterministic
 * code: no AI involved in the choice. The footprint is a SIMULATION, so the
 * result is a planning aid, not a safety guarantee.
 */
import { BuiltSimulation, Level, levelAt } from './hazardSim';
import { haversineKm } from './sosTriage';

export interface RouteExposure {
  kmSevere: number;
  kmModerate: number;
  kmWatch: number;
  /** Total distance inside any zone. */
  kmInside: number;
  kmTotal: number;
}

/**
 * "Minutes of detour I would accept to avoid one km inside this zone."
 * Severe is treated as nearly impassable; the watch zone is only a mild nudge.
 */
export const HAZARD_PENALTY_MIN_PER_KM: Record<Level, number> = {
  severe: 25,
  moderate: 8,
  watch: 1.5,
};

const SAMPLE_STEP_KM = 0.1;

type LL = { lat: number; lng: number };

function bearingDeg(a: LL, b: LL): number {
  const f1 = (a.lat * Math.PI) / 180;
  const f2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function destination(o: LL, km: number, bearing: number): LL {
  const R = 6371;
  const br = (bearing * Math.PI) / 180;
  const f1 = (o.lat * Math.PI) / 180;
  const l1 = (o.lng * Math.PI) / 180;
  const d = km / R;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return { lat: (f2 * 180) / Math.PI, lng: (l2 * 180) / Math.PI };
}

/**
 * Waypoints for trying detours around a footprint. OpenStreetMap routing
 * often returns just one route, so we propose our own candidates: points on a
 * ring just outside the footprint, on the sides of the approach direction,
 * keeping only those that do not make the trip absurdly longer. The caller
 * routes from -> via -> to for each, then scores every candidate.
 */
export function suggestVias(from: LL, to: LL, sim: BuiltSimulation, max = 3): LL[] {
  const ring = sim.layers.find((l) => l.id === 'watch')!.polygon;
  const centre = {
    lat: ring.reduce((n, p) => n + p[0], 0) / ring.length,
    lng: ring.reduce((n, p) => n + p[1], 0) / ring.length,
  };
  const radius = Math.max(...ring.map((p) => haversineKm(centre, { lat: p[0], lng: p[1] })));
  const ringKm = radius * 1.12 + 0.3;
  const approach = bearingDeg(centre, from); // the side the team comes from
  const direct = haversineKm(from, to);

  return [-90, -45, 45, 90]
    .map((delta) => destination(centre, ringKm, (approach + delta + 360) % 360))
    .map((via) => ({ via, length: haversineKm(from, via) + haversineKm(via, to) }))
    .filter((c) => c.length <= 2.2 * direct + 4) // never propose an absurd detour
    .sort((a, b) => a.length - b.length)
    .slice(0, max)
    .map((c) => c.via);
}


/** Distance a route spends inside each zone, measured by sampling every ~100 m. */
export function routeExposure(coords: [number, number][], sim: BuiltSimulation): RouteExposure {
  const km: Record<Level, number> = { severe: 0, moderate: 0, watch: 0 };
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = { lat: coords[i - 1][0], lng: coords[i - 1][1] };
    const b = { lat: coords[i][0], lng: coords[i][1] };
    const d = haversineKm(a, b);
    if (d === 0) continue;
    total += d;
    const n = Math.max(1, Math.ceil(d / SAMPLE_STEP_KM));
    for (let s = 0; s < n; s++) {
      const f = (s + 0.5) / n; // midpoint of each sub-step
      const level = levelAt(sim, a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f);
      if (level) km[level] += d / n;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    kmSevere: round(km.severe),
    kmModerate: round(km.moderate),
    kmWatch: round(km.watch),
    kmInside: round(km.severe + km.moderate + km.watch),
    kmTotal: round(total),
  };
}

/** Lower is better: travel minutes plus the exposure penalty. */
export function routeScore(durationMin: number, e: RouteExposure): number {
  return (
    durationMin +
    e.kmSevere * HAZARD_PENALTY_MIN_PER_KM.severe +
    e.kmModerate * HAZARD_PENALTY_MIN_PER_KM.moderate +
    e.kmWatch * HAZARD_PENALTY_MIN_PER_KM.watch
  );
}

/** A short fingerprint of a footprint, so callers can tell when it changed. */
export function simSignature(sim: BuiltSimulation | null | undefined): string {
  if (!sim) return '';
  return sim.layers.map((l) => `${l.polygon.length}:${l.polygon[0][0].toFixed(4)},${l.polygon[0][1].toFixed(4)}:${l.polygon[Math.floor(l.polygon.length / 2)][1].toFixed(4)}`).join('|');
}

export interface RouteChoice<T> {
  entries: { route: T; exposure: RouteExposure; score: number }[];
  /** Index of the route with the best score (the one to use). */
  chosenIndex: number;
  /** Index of the plain fastest route. */
  fastestIndex: number;
  /** True when the hazard made us pick something other than the fastest route. */
  avoided: boolean;
  /** Extra minutes the chosen route takes compared with the fastest. */
  extraMinutes: number;
  /** Kilometres inside ANY zone saved compared with the fastest (can be 0 even when avoided: see severeKmSaved). */
  kmInsideSaved: number;
  /** Kilometres in the MOST SEVERE zone saved compared with the fastest. */
  severeKmSaved: number;
}

export function pickRoute<T extends { coordinates: [number, number][]; durationMin: number }>(
  routes: T[],
  sim: BuiltSimulation
): RouteChoice<T> {
  const entries = routes.map((route) => {
    const exposure = routeExposure(route.coordinates, sim);
    return { route, exposure, score: routeScore(route.durationMin, exposure) };
  });
  let chosenIndex = 0;
  let fastestIndex = 0;
  entries.forEach((e, i) => {
    // Ties keep the earlier (OSRM-preferred) route.
    if (e.score < entries[chosenIndex].score - 1e-9) chosenIndex = i;
    if (e.route.durationMin < entries[fastestIndex].route.durationMin) fastestIndex = i;
  });
  const chosen = entries[chosenIndex];
  const fastest = entries[fastestIndex];
  return {
    entries,
    chosenIndex,
    fastestIndex,
    avoided: chosenIndex !== fastestIndex,
    extraMinutes: Math.max(0, chosen.route.durationMin - fastest.route.durationMin),
    kmInsideSaved: Math.max(0, Math.round((fastest.exposure.kmInside - chosen.exposure.kmInside) * 100) / 100),
    severeKmSaved: Math.max(0, Math.round((fastest.exposure.kmSevere - chosen.exposure.kmSevere) * 100) / 100),
  };
}
