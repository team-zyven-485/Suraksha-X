/**
 * Hazard scenario simulation — a PURE SIMULATION, not a forecast.
 *
 * Design: an LLM (Gemini) is good at reasoning about a scenario but unreliable
 * at producing exact map coordinates, and unsafe to trust with geometry. So the
 * model only proposes a small set of bounded PARAMETERS (direction, extent,
 * intensity, a few emoji markers, a short narrative). Everything here — range
 * clamping, text sanitising, and the actual polygons — is deterministic code
 * that runs identically on the server and in the browser. With no Gemini key,
 * or offline, `defaultParams` produces the same kind of sketch by rule.
 *
 * No real-time sensor, weather, terrain or satellite data is used anywhere.
 */
import type { SOSDisasterType } from '../types/sos';
import { haversineKm } from './sosTriage';

export type Severity = 'LOW' | 'MODERATE' | 'SEVERE' | 'EXTREME';
export const SEVERITIES: Severity[] = ['LOW', 'MODERATE', 'SEVERE', 'EXTREME'];
export type LatLngT = { lat: number; lng: number };

export interface SimMarker {
  emoji: string;
  label: string;
  bearingDeg: number;
  distanceKm: number;
}

export interface HazardSimParams {
  hazard: SOSDisasterType;
  severity: Severity;
  headline: string;
  narrative: string;
  assumptions: string[];
  /** Suggestions for staff to verify — never shown to citizens as instructions. */
  considerations: string[];
  /** Direction (degrees clockwise from north) of flow / slope / inland push / wind / track. */
  bearingDeg: number;
  lengthKm: number;
  widthKm: number;
  /** Hours until the footprint reaches full extent (drives the time slider). */
  peakAfterHours: number;
  intensity: { label: string; value: number; unit: string };
  markers: SimMarker[];
}

/** Only these emoji may appear on the map (also keeps the divIcon HTML trivially safe). */
export const ALLOWED_EMOJI = [
  '🌊', '💧', '⛰️', '🪨', '🏚️', '🚧', '🌀', '💨', '🔥', '🌳', '⚠️', '🌉', '⚡', '🚑', '🏥', '📍', '🌋', '🏠', '🛖',
];

type Shape = 'ellipse' | 'teardrop' | 'band' | 'rings' | 'egg' | 'circle';
interface Spec {
  shape: Shape;
  length: [number, number, number, number]; // km, by severity
  width: [number, number, number, number];
  peakHours: [number, number, number, number];
  intensity: { label: string; unit: string; values: [number, number, number, number] };
  color: string;
  levelLabels: { severe: string; moderate: string; watch: string };
  anchor: number; // how far the footprint centre sits ahead of the SOS point, as a fraction of its length
}

const SPECS: Record<SOSDisasterType, Spec> = {
  FLOOD: {
    shape: 'ellipse', anchor: 0.35, color: '#2563eb',
    length: [3, 6, 10, 16], width: [1.5, 3, 5, 8], peakHours: [3, 6, 10, 14],
    intensity: { label: 'Water depth near the source', unit: 'm', values: [0.4, 1.0, 2.0, 3.5] },
    levelLabels: { severe: 'Deep, fast water', moderate: 'Flooded area', watch: 'Possible spread' },
  },
  LANDSLIDE: {
    shape: 'teardrop', anchor: 0, color: '#92400e',
    length: [0.4, 0.9, 1.8, 3], width: [0.2, 0.45, 0.9, 1.5], peakHours: [0.1, 0.2, 0.3, 0.5],
    intensity: { label: 'Debris depth', unit: 'm', values: [0.5, 1.5, 3, 6] },
    levelLabels: { severe: 'Debris core', moderate: 'Runout path', watch: 'Possible runout reach' },
  },
  TSUNAMI: {
    shape: 'band', anchor: 0, color: '#0891b2',
    length: [0.8, 2, 4, 7], width: [3, 6, 10, 16], peakHours: [0.5, 0.8, 1.2, 2],
    intensity: { label: 'Wave height at the coast', unit: 'm', values: [1, 3, 6, 10] },
    levelLabels: { severe: 'Strongest inundation', moderate: 'Inundated area', watch: 'Possible inundation limit' },
  },
  CYCLONE: {
    shape: 'rings', anchor: 0, color: '#7c3aed',
    length: [40, 80, 130, 200], width: [40, 80, 130, 200], peakHours: [6, 10, 14, 18],
    intensity: { label: 'Peak wind speed', unit: 'km/h', values: [90, 120, 160, 210] },
    levelLabels: { severe: 'Destructive winds', moderate: 'Damaging winds', watch: 'Gale-force winds possible' },
  },
  EARTHQUAKE: {
    shape: 'rings', anchor: 0, color: '#dc2626',
    length: [8, 20, 40, 80], width: [8, 20, 40, 80], peakHours: [0, 0, 0, 0],
    intensity: { label: 'Magnitude', unit: 'Mw', values: [5.0, 6.0, 6.8, 7.6] },
    levelLabels: { severe: 'Strongest shaking', moderate: 'Strong shaking', watch: 'Felt strongly' },
  },
  FIRE: {
    shape: 'egg', anchor: 0.3, color: '#ea580c',
    length: [1.5, 4, 8, 14], width: [0.8, 2, 4, 6], peakHours: [1, 2, 4, 6],
    intensity: { label: 'Wind speed', unit: 'km/h', values: [10, 25, 40, 55] },
    levelLabels: { severe: 'Active burning', moderate: 'Likely burned area', watch: 'Possible spread' },
  },
  OTHER: {
    shape: 'circle', anchor: 0, color: '#6b7280',
    length: [1, 2, 4, 8], width: [1, 2, 4, 8], peakHours: [1, 1, 1, 1],
    intensity: { label: 'Impact radius', unit: 'km', values: [1, 2, 4, 8] },
    levelLabels: { severe: 'Core area', moderate: 'Affected area', watch: 'Possible spread' },
  },
};

export const hazardSpec = (h: SOSDisasterType) => SPECS[h];
const sevIdx = (s: Severity) => SEVERITIES.indexOf(s);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const mod360 = (n: number) => ((n % 360) + 360) % 360;

/** Ranges Gemini is asked to stay inside (and that validation enforces). */
export function allowedRanges(hazard: SOSDisasterType, severity: Severity) {
  const s = SPECS[hazard];
  const i = sevIdx(severity);
  const r = (v: number): [number, number] => [Math.round(v * 0.6 * 100) / 100, Math.round(v * 1.6 * 100) / 100];
  return {
    lengthKm: r(s.length[i]),
    widthKm: r(s.width[i]),
    peakAfterHours: s.peakHours[i] === 0 ? ([0, 0] as [number, number]) : r(s.peakHours[i]),
    intensity: r(s.intensity.values[i]),
  };
}

/** A stable pseudo-random bearing from the location, so the same place always sketches the same way. */
function stableBearing(o: LatLngT): number {
  const x = Math.sin(o.lat * 12.9898 + o.lng * 78.233) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 360);
}

const DEFAULT_TEXT: Record<SOSDisasterType, { narrative: (p: HazardSimParams) => string; considerations: string[]; assumptions: string[] }> = {
  FLOOD: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} flood: water spreads about ${p.lengthKm} km in the assumed flow direction, around ${p.intensity.value} m deep near its source, and keeps rising for roughly ${p.peakAfterHours} h.`,
    considerations: ['Check whether low-lying shelters and road links fall inside the footprint', 'Pre-position boats / high-clearance vehicles on the upstream side', 'Plan evacuation routes that run across, not along, the assumed flow'],
    assumptions: ['Flow direction is assumed (no terrain data)', 'Depth and extent are typical values for this severity, not measurements'],
  },
  LANDSLIDE: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} landslide: debris runs about ${p.lengthKm} km downslope in the assumed slope direction, up to ${p.intensity.value} m deep in the core.`,
    considerations: ['Treat the whole runout path as unsafe until a geotechnical check', 'Watch for secondary slides and blocked access roads', 'Approach from the side, never from below the slope'],
    assumptions: ['Slope direction is assumed (no terrain data)', 'Runout length is typical for this severity, not modelled'],
  },
  TSUNAMI: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} tsunami: waves of about ${p.intensity.value} m push roughly ${p.lengthKm} km inland across a ${p.widthKm} km stretch of coast, with the first wave in about ${Math.round(p.peakAfterHours * 60)} min.`,
    considerations: ['Move people to high ground well beyond the assumed inundation limit', 'Expect several waves; do not release the area after the first', 'Keep rescue staging points outside the footprint'],
    assumptions: ['Inland direction is assumed (no coastline data)', 'Inundation depth is typical for this severity, not modelled'],
  },
  CYCLONE: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} cyclone: damaging winds reach about ${p.lengthKm} km from the centre, peaking near ${p.intensity.value} km/h, over roughly ${p.peakAfterHours} h.`,
    considerations: ['Shelter in sturdy buildings away from the coast and flood-prone land', 'Expect power and telecom outages across the whole footprint', 'Plan for storm surge on low coastal strips'],
    assumptions: ['Track and centre position are assumed', 'Wind field is symmetric rings, a simplification'],
  },
  EARTHQUAKE: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} earthquake (about Mw ${p.intensity.value}) with the epicentre assumed at the SOS location: strongest shaking within ~${Math.round(p.lengthKm * 0.5)} km, felt up to ~${p.lengthKm} km.`,
    considerations: ['Prioritise collapsed or damaged buildings in the strongest ring', 'Inspect bridges and roads before sending heavy vehicles', 'Expect aftershocks; keep teams out of weakened structures'],
    assumptions: ['Epicentre is assumed at the SOS point', 'Shaking falls off as simple rings; soil and fault geometry are ignored'],
  },
  FIRE: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} fire: driven by about ${p.intensity.value} km/h wind it spreads roughly ${p.lengthKm} km downwind, over ${p.peakAfterHours} h.`,
    considerations: ['Keep evacuation routes upwind and crosswind of the fire', 'Watch for wind shifts that change the spread direction', 'Stage water sources and crews on the upwind flank'],
    assumptions: ['Wind direction is assumed (no weather data)', 'Spread is a smooth wind-driven shape, not a fuel model'],
  },
  OTHER: {
    narrative: (p) => `Illustrative incident area of about ${p.lengthKm} km radius around the reported location.`,
    considerations: ['Confirm the nature of the incident with the reporting citizen', 'Treat the area as unverified until a team arrives'],
    assumptions: ['Radius is a generic placeholder for this severity'],
  },
};

function defaultMarkers(h: SOSDisasterType, b: number, L: number): SimMarker[] {
  const m = (emoji: string, label: string, bearingDeg: number, frac: number): SimMarker => ({
    emoji, label, bearingDeg: mod360(bearingDeg), distanceKm: Math.round(L * frac * 100) / 100,
  });
  switch (h) {
    case 'FLOOD': return [m('🌊', 'Water rising (assumed source)', b + 180, 0.3), m('🏚️', 'Low-lying homes likely flooded', b, 0.45), m('🚧', 'Roads likely cut', b + 35, 0.7)];
    case 'LANDSLIDE': return [m('⛰️', 'Assumed slope failure', b + 180, 0.3), m('🪨', 'Debris runout', b, 0.8), m('🚧', 'Access road likely blocked', b + 30, 0.5)];
    case 'TSUNAMI': return [m('🌊', 'Wave front from the sea (assumed)', b + 180, 0.35), m('🏚️', 'Coastal structures at risk', b, 0.4), m('⚠️', 'Assumed inundation limit', b, 0.95)];
    case 'CYCLONE': return [m('🌀', 'Cyclone centre (assumed)', b + 180, 0.5), m('💨', 'Damaging winds', b, 0.55), m('🌊', 'Storm-surge risk on the coast', b + 90, 0.45)];
    case 'EARTHQUAKE': return [m('🏚️', 'Damaged buildings likely', 45, 0.25), m('🚧', 'Road / bridge damage possible', 160, 0.5), m('⚠️', 'Aftershock caution', 280, 0.75)];
    case 'FIRE': return [m('🔥', 'Assumed ignition point', b + 180, 0.2), m('💨', 'Wind-driven spread', b, 0.6), m('🌳', 'Dry vegetation / fuel', b + 40, 0.45)];
    default: return [m('⚠️', 'Incident area', 0, 0.3)];
  }
}

/** The rule-based simulation parameters (used when Gemini is unavailable, and as the base for validation). */
export function defaultParams(hazard: SOSDisasterType, severity: Severity, origin: LatLngT): HazardSimParams {
  const s = SPECS[hazard];
  const i = sevIdx(severity);
  const bearingDeg = stableBearing(origin);
  const base: HazardSimParams = {
    hazard,
    severity,
    headline: `${hazard.charAt(0)}${hazard.slice(1).toLowerCase()} — ${severity.toLowerCase()} scenario`,
    narrative: '',
    assumptions: DEFAULT_TEXT[hazard].assumptions,
    considerations: DEFAULT_TEXT[hazard].considerations,
    bearingDeg,
    lengthKm: s.length[i],
    widthKm: s.width[i],
    peakAfterHours: s.peakHours[i],
    intensity: { label: s.intensity.label, value: s.intensity.values[i], unit: s.intensity.unit },
    markers: defaultMarkers(hazard, bearingDeg, s.length[i]),
  };
  base.narrative = DEFAULT_TEXT[hazard].narrative(base);
  return base;
}

// ---------------------------------------------------------------------------
// Validation of model output
// ---------------------------------------------------------------------------
const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t.slice(0, max) : null;
};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cleanList = (v: unknown, maxItems: number, maxLen: number): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => cleanText(x, maxLen)).filter((x): x is string => !!x).slice(0, maxItems);
  return out.length ? out : null;
};

/**
 * Merge untrusted model output over the rule-based defaults. Every field is
 * type-checked and clamped; anything missing or invalid keeps its default.
 * The severity is dictated by the caller, never by the model.
 */
export function validateParams(raw: unknown, hazard: SOSDisasterType, severity: Severity, origin: LatLngT): HazardSimParams {
  const d = defaultParams(hazard, severity, origin);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, any>;
  const rng = allowedRanges(hazard, severity);

  const lengthKm = num(r.lengthKm) !== null ? clamp(r.lengthKm, ...rng.lengthKm) : d.lengthKm;
  const widthKm = num(r.widthKm) !== null ? clamp(r.widthKm, ...rng.widthKm) : d.widthKm;
  const peak = num(r.peakAfterHours) !== null ? clamp(r.peakAfterHours, ...rng.peakAfterHours) : d.peakAfterHours;
  const intensityValue = num(r.intensity?.value ?? r.intensityValue) !== null ? clamp(r.intensity?.value ?? r.intensityValue, ...rng.intensity) : d.intensity.value;
  const bearingDeg = num(r.bearingDeg) !== null ? Math.round(mod360(r.bearingDeg)) : d.bearingDeg;

  let markers = d.markers;
  if (Array.isArray(r.markers)) {
    const parsed: SimMarker[] = [];
    for (const m of r.markers.slice(0, 6)) {
      const label = cleanText(m?.label, 44);
      const dist = num(m?.distanceKm);
      const brg = num(m?.bearingDeg);
      if (!label || dist === null || brg === null) continue;
      parsed.push({
        emoji: ALLOWED_EMOJI.includes(m?.emoji) ? m.emoji : '📍',
        label,
        bearingDeg: Math.round(mod360(brg)),
        distanceKm: Math.round(clamp(dist, 0.05, lengthKm * 1.2) * 100) / 100,
      });
    }
    if (parsed.length > 0) markers = parsed;
  }

  const out: HazardSimParams = {
    ...d,
    headline: cleanText(r.headline, 90) ?? d.headline,
    assumptions: cleanList(r.assumptions, 4, 140) ?? d.assumptions,
    considerations: cleanList(r.considerations, 4, 140) ?? d.considerations,
    bearingDeg,
    lengthKm: Math.round(lengthKm * 100) / 100,
    widthKm: Math.round(widthKm * 100) / 100,
    peakAfterHours: Math.round(peak * 100) / 100,
    intensity: { ...d.intensity, value: Math.round(intensityValue * 10) / 10 },
    markers,
  };
  out.narrative = cleanText(r.narrative, 320) ?? DEFAULT_TEXT[hazard].narrative(out);
  return out;
}

// ---------------------------------------------------------------------------
// Geometry (deterministic)
// ---------------------------------------------------------------------------
const KM_PER_DEG = 111.32;

/** Position `u` km along the bearing and `v` km to its right of `origin`. */
function place(origin: LatLngT, bearingDeg: number, u: number, v: number): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  const east = u * Math.sin(b) + v * Math.cos(b);
  const north = u * Math.cos(b) - v * Math.sin(b);
  return [origin.lat + north / KM_PER_DEG, origin.lng + east / (KM_PER_DEG * Math.cos((origin.lat * Math.PI) / 180))];
}

const N = 48;

function ellipse(o: LatLngT, b: number, L: number, W: number, centre: number, skew = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * 2 * Math.PI;
    const u = centre + (L / 2) * Math.cos(th) * (1 + skew * Math.cos(th));
    const v = (W / 2) * Math.sin(th);
    pts.push(place(o, b, u, v));
  }
  return pts;
}

function teardrop(o: LatLngT, b: number, L: number, W: number): [number, number][] {
  const width = (t: number) => ((W / 2) * Math.sqrt(t) * (1 - t * t)) / 0.507;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    left.push(place(o, b, t * L, -width(t)));
    right.push(place(o, b, t * L, width(t)));
  }
  return [...left, ...right.reverse()];
}

function band(o: LatLngT, b: number, L: number, W: number): [number, number][] {
  const start = -0.1 * L;
  const half = (u: number) => (W / 2) * (1 - 0.3 * ((u - start) / (L - start)));
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const u = start + ((L - start) * i) / 16;
    left.push(place(o, b, u, -half(u)));
    right.push(place(o, b, u, half(u)));
  }
  return [...left, ...right.reverse()];
}

function circle(o: LatLngT, R: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * 2 * Math.PI;
    pts.push(place(o, 0, R * Math.cos(th), R * Math.sin(th)));
  }
  return pts;
}

export type Level = 'severe' | 'moderate' | 'watch';
export interface SimLayer {
  id: Level;
  label: string;
  color: string;
  fillOpacity: number;
  polygon: [number, number][];
}
export interface SimPlacedMarker {
  emoji: string;
  label: string;
  lat: number;
  lng: number;
}
export interface BuiltSimulation {
  layers: SimLayer[]; // outermost first, so inner zones draw on top
  markers: SimPlacedMarker[];
  /** 0..1 — how far the footprint has grown at this point of the timeline. */
  growth: number;
}

const LEVEL_SCALE: { id: Level; k: number; opacity: number }[] = [
  { id: 'watch', k: 1.15, opacity: 0.14 },
  { id: 'moderate', k: 0.8, opacity: 0.28 },
  { id: 'severe', k: 0.5, opacity: 0.45 },
];

/** `t` is the timeline position 0..1 (1 = full extent). Earthquakes are instantaneous. */
export function buildSimulation(p: HazardSimParams, origin: LatLngT, t = 1): BuiltSimulation {
  const spec = SPECS[p.hazard];
  const growth = p.hazard === 'EARTHQUAKE' ? 1 : clamp(t, 0.12, 1);
  const layers: SimLayer[] = LEVEL_SCALE.map(({ id, k, opacity }) => {
    const L = p.lengthKm * k * growth;
    const W = p.widthKm * k * growth;
    let polygon: [number, number][];
    switch (spec.shape) {
      case 'ellipse': polygon = ellipse(origin, p.bearingDeg, L, W, spec.anchor * L); break;
      case 'egg': polygon = ellipse(origin, p.bearingDeg, L, W, spec.anchor * L, 0.25); break;
      case 'teardrop': polygon = teardrop(origin, p.bearingDeg, L, W); break;
      case 'band': polygon = band(origin, p.bearingDeg, L, W); break;
      default: polygon = circle(origin, L); // rings / circle: L is the radius
    }
    return { id, label: spec.levelLabels[id], color: spec.color, fillOpacity: opacity, polygon };
  });
  const markers = p.markers.map((m) => {
    const [lat, lng] = place(origin, m.bearingDeg, m.distanceKm * growth, 0);
    return { emoji: m.emoji, label: m.label, lat, lng };
  });
  return { layers, markers, growth };
}

export function pointInPolygon(lat: number, lng: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Most severe level whose polygon contains the point, or null if it is outside the footprint. */
export function levelAt(sim: BuiltSimulation, lat: number, lng: number): Level | null {
  for (const id of ['severe', 'moderate', 'watch'] as Level[]) {
    const layer = sim.layers.find((l) => l.id === id)!;
    if (pointInPolygon(lat, lng, layer.polygon)) return id;
  }
  return null;
}

export interface ExposureSummary {
  zones: { id: string; name: string; population: number; level: Level }[];
  populationInFootprint: number;
  sheltersAtRisk: { id: string; name: string; code: string; level: Level }[];
  sheltersOutside: { id: string; name: string; code: string; distanceKm: number; available: number }[];
}

/** Which of the (sample) zones and shelters would fall inside the simulated footprint. */
export function assessExposure(
  sim: BuiltSimulation,
  origin: LatLngT,
  zones: { id: string; name: string; population: number; coordinates: LatLngT }[],
  shelters: { id: string; name: string; code: string; available: number; coordinates: LatLngT }[]
): ExposureSummary {
  const zonesIn = zones
    .map((z) => ({ z, level: levelAt(sim, z.coordinates.lat, z.coordinates.lng) }))
    .filter((x): x is { z: (typeof zones)[number]; level: Level } => x.level !== null)
    .map(({ z, level }) => ({ id: z.id, name: z.name, population: z.population, level }));
  const sheltersIn = shelters
    .map((s) => ({ s, level: levelAt(sim, s.coordinates.lat, s.coordinates.lng) }))
    .filter((x): x is { s: (typeof shelters)[number]; level: Level } => x.level !== null)
    .map(({ s, level }) => ({ id: s.id, name: s.name, code: s.code, level }));
  const atRiskIds = new Set(sheltersIn.map((s) => s.id));
  const outside = shelters
    .filter((s) => !atRiskIds.has(s.id) && s.available > 0)
    .map((s) => ({ id: s.id, name: s.name, code: s.code, available: s.available, distanceKm: Math.round(haversineKm(origin, s.coordinates) * 10) / 10 }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);
  return {
    zones: zonesIn,
    populationInFootprint: zonesIn.reduce((n, z) => n + z.population, 0),
    sheltersAtRisk: sheltersIn,
    sheltersOutside: outside,
  };
}

export function severityFromPriority(priority: 'P1' | 'P2' | 'P3'): Severity {
  return priority === 'P1' ? 'SEVERE' : priority === 'P2' ? 'MODERATE' : 'LOW';
}
