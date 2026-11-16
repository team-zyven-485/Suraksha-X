/**
 * Real road routing via the public OSRM demo server (OpenStreetMap data, no key).
 *
 * Fair-use notes: the demo server is shared, so results are cached and the
 * endpoint is rate limited. OSRM knows roads and typical speeds only — it does
 * NOT know about floods, landslides or blocked roads. The UI says so.
 */
export interface RoadRoute {
  available: true;
  source: string;
  distanceKm: number;
  durationMin: number;
  /** [lat, lng] pairs (decimated to a few hundred points). */
  coordinates: [number, number][];
  steps: { instruction: string; distanceM: number; name: string }[];
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
const TTL_MS = 30 * 60 * 1000;
const MAX_CACHE = 400;
const MAX_POINTS = 600;

const cache = new Map<string, { at: number; route: RoadRoute }>();

const round = (n: number) => n.toFixed(4); // ~11 m: close-by requests share a cache entry

function modifierText(mod?: string): string {
  switch (mod) {
    case 'left': return 'left';
    case 'right': return 'right';
    case 'slight left': return 'slightly left';
    case 'slight right': return 'slightly right';
    case 'sharp left': return 'sharp left';
    case 'sharp right': return 'sharp right';
    case 'uturn': return 'around (U-turn)';
    case 'straight': return 'straight';
    default: return '';
  }
}

/** Turns an OSRM step into a plain-English instruction. */
export function describeStep(step: any): string {
  const m = step?.maneuver ?? {};
  const name: string = step?.name ? String(step.name) : '';
  const onto = name ? ` onto ${name}` : '';
  const dir = modifierText(m.modifier);
  switch (m.type) {
    case 'depart':
      return name ? `Start on ${name}` : 'Start your journey';
    case 'arrive':
      return m.modifier === 'left' || m.modifier === 'right'
        ? `Arrive at your destination, on the ${m.modifier}`
        : 'Arrive at your destination';
    case 'turn':
      return dir === 'straight' ? `Continue straight${onto}` : `Turn ${dir}${onto}`;
    case 'end of road':
      return `At the end of the road, turn ${dir || 'ahead'}${onto}`;
    case 'fork':
      return `Keep ${dir || 'ahead'} at the fork${onto}`;
    case 'merge':
      return `Merge ${dir || ''}${onto}`.replace('  ', ' ');
    case 'on ramp':
      return `Take the ramp${onto}`;
    case 'off ramp':
      return `Take the exit${onto}`;
    case 'roundabout':
    case 'rotary':
      return m.exit ? `At the roundabout, take exit ${m.exit}${onto}` : `Enter the roundabout${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Exit the roundabout${onto}`;
    case 'new name':
    case 'continue':
      return `Continue${dir && dir !== 'straight' ? ' ' + dir : ''}${onto}`;
    default:
      return `Continue${onto}`;
  }
}

function decimate(points: [number, number][], max: number): [number, number][] {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % stride === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export async function getRoadRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<RoadRoute | null> {
  const key = `${round(from.lat)},${round(from.lng)}>${round(to.lat)},${round(to.lng)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.route;

  const url =
    `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson&steps=true&alternatives=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'suraksha-x/1.0 (disaster response demo)' } });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data: any = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) return null; // e.g. NoRoute (islands, no road link)

  const r = data.routes[0];
  const coords: [number, number][] = (r.geometry?.coordinates ?? []).map((c: number[]) => [c[1], c[0]]);
  if (coords.length < 2) return null;

  const steps = (r.legs ?? [])
    .flatMap((leg: any) => leg.steps ?? [])
    .map((s: any) => ({
      instruction: describeStep(s),
      distanceM: Math.round(Number(s.distance) || 0),
      name: s.name ? String(s.name) : '',
    }));

  const route: RoadRoute = {
    available: true,
    source: 'OSRM (OpenStreetMap)',
    distanceKm: Math.round((Number(r.distance) / 1000) * 10) / 10,
    durationMin: Math.max(1, Math.round(Number(r.duration) / 60)),
    coordinates: decimate(coords, MAX_POINTS),
    steps,
  };

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string); // drop the oldest
  cache.set(key, { at: Date.now(), route });
  return route;
}
