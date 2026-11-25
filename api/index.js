// api-src/handler.ts
import "dotenv/config";

// server/app.ts
import express from "express";
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";

// server/store.ts
import dns from "dns";
import { MongoClient } from "mongodb";

// src/data/rescueTeams.ts
var initialRescueTeams = [
  {
    id: "team-alpha",
    name: "Rescue Unit Alpha",
    specialization: "Flood & Water Rescue",
    handles: ["FLOOD", "CYCLONE", "TSUNAMI"],
    status: "AVAILABLE",
    baseDistanceKm: 4.2,
    baseEtaMin: 12,
    activeIncidentId: null
  },
  {
    id: "team-bravo",
    name: "Rescue Unit Bravo",
    specialization: "Structural Collapse & Extraction",
    handles: ["EARTHQUAKE", "FIRE"],
    status: "AVAILABLE",
    baseDistanceKm: 6.8,
    baseEtaMin: 18,
    activeIncidentId: null
  },
  {
    id: "team-charlie",
    name: "Rescue Unit Charlie",
    specialization: "High-Angle & Terrain Rescue",
    handles: ["LANDSLIDE", "OTHER"],
    status: "AVAILABLE",
    baseDistanceKm: 8.1,
    baseEtaMin: 24,
    activeIncidentId: null
  },
  {
    id: "team-delta",
    name: "Rescue Unit Delta",
    specialization: "Medical First Response",
    handles: ["FIRE", "EARTHQUAKE", "FLOOD", "CYCLONE", "LANDSLIDE", "TSUNAMI", "OTHER"],
    status: "AVAILABLE",
    baseDistanceKm: 5.5,
    baseEtaMin: 15,
    activeIncidentId: null
  }
];

// server/store.ts
function duplicateKeyError(keyPattern) {
  return Object.assign(new Error("E11000 duplicate key error"), { code: 11e3, keyPattern });
}
var clone = (v) => structuredClone(v);
var MemoryStore = class {
  constructor() {
    this.kind = "memory";
    this.incidents = [];
    this.teams = clone(initialRescueTeams);
    this.plans = /* @__PURE__ */ new Map();
    this.caps = /* @__PURE__ */ new Map();
  }
  async init() {
  }
  async close() {
  }
  async listIncidents(filter) {
    const rows = filter?.citizenId ? this.incidents.filter((i) => i.citizenId === filter.citizenId) : this.incidents;
    return clone([...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500));
  }
  async getIncident(id) {
    const found = this.incidents.find((i) => i.id === id);
    return found ? clone(found) : null;
  }
  async findIncidentByClientRequest(citizenId, clientRequestId) {
    const found = this.incidents.find((i) => i.citizenId === citizenId && i.clientRequestId === clientRequestId);
    return found ? clone(found) : null;
  }
  async insertIncident(doc) {
    if (this.incidents.some((i) => i.id === doc.id)) throw duplicateKeyError({ id: 1 });
    if (doc.clientRequestId && this.incidents.some((i) => i.citizenId === doc.citizenId && i.clientRequestId === doc.clientRequestId)) {
      throw duplicateKeyError({ citizenId: 1, clientRequestId: 1 });
    }
    if (doc.isOpen && this.incidents.some((i) => i.citizenId === doc.citizenId && i.isOpen)) {
      throw duplicateKeyError({ citizenId: 1 });
    }
    this.incidents.push(clone(doc));
  }
  async findOpenIncident(citizenId) {
    const found = this.incidents.find((i) => i.citizenId === citizenId && i.isOpen);
    return found ? clone(found) : null;
  }
  async updateIncident(id, guard, set, history) {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) return null;
    if (guard.status && !guard.status.includes(inc.status)) return null;
    if (guard.assignedTeamId !== void 0 && (inc.assignedTeamId ?? null) !== guard.assignedTeamId) return null;
    Object.assign(inc, clone(set));
    inc.statusHistory.push(history);
    return clone(inc);
  }
  async listTeams() {
    return clone(this.teams);
  }
  async getTeam(id) {
    const t = this.teams.find((x) => x.id === id);
    return t ? clone(t) : null;
  }
  async updateTeam(id, set, onlyIfStatus) {
    const t = this.teams.find((x) => x.id === id);
    if (!t) return false;
    if (onlyIfStatus && !onlyIfStatus.includes(t.status)) return false;
    Object.assign(t, set);
    return true;
  }
  async savePlan(plan) {
    this.plans.set(plan.id, clone(plan));
  }
  async saveCapBroadcast(doc) {
    this.caps.set(doc.identifier, clone(doc));
  }
};
var MongoStore = class {
  constructor(uri, dbName) {
    this.uri = uri;
    this.dbName = dbName;
    this.kind = "mongodb";
    this.noId = { projection: { _id: 0 } };
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 8e3, appName: "suraksha-x", maxPoolSize: process.env.VERCEL ? 3 : 10 });
  }
  async init() {
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.incidents = this.db.collection("sos_incidents");
    this.teams = this.db.collection("rescue_teams");
    this.plans = this.db.collection("relocation_plans");
    this.caps = this.db.collection("cap_broadcasts");
    await this.incidents.createIndex({ id: 1 }, { unique: true });
    await this.incidents.createIndex({ citizenId: 1, createdAt: -1 });
    await this.incidents.createIndex(
      { citizenId: 1, clientRequestId: 1 },
      { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } }
    );
    await this.incidents.createIndex(
      { citizenId: 1 },
      { unique: true, partialFilterExpression: { isOpen: true }, name: "one_open_sos_per_citizen" }
    );
    await this.teams.createIndex({ id: 1 }, { unique: true });
    await this.plans.createIndex({ id: 1 }, { unique: true });
    await this.caps.createIndex({ identifier: 1 }, { unique: true });
    for (const team of initialRescueTeams) {
      await this.teams.updateOne({ id: team.id }, { $setOnInsert: team }, { upsert: true });
    }
  }
  async close() {
    await this.client.close();
  }
  async listIncidents(filter) {
    return await this.incidents.find(filter?.citizenId ? { citizenId: filter.citizenId } : {}, this.noId).sort({ createdAt: -1 }).limit(500).toArray();
  }
  async getIncident(id) {
    return await this.incidents.findOne({ id }, this.noId);
  }
  async findIncidentByClientRequest(citizenId, clientRequestId) {
    return await this.incidents.findOne({ citizenId, clientRequestId }, this.noId);
  }
  async insertIncident(doc) {
    await this.incidents.insertOne({ ...doc });
  }
  async findOpenIncident(citizenId) {
    return await this.incidents.findOne({ citizenId, isOpen: true }, this.noId);
  }
  async updateIncident(id, guard, set, history) {
    const filter = { id };
    if (guard.status) filter.status = { $in: guard.status };
    if (guard.assignedTeamId !== void 0) filter.assignedTeamId = guard.assignedTeamId;
    const res = await this.incidents.findOneAndUpdate(
      filter,
      { $set: set, $push: { statusHistory: history } },
      { returnDocument: "after", projection: { _id: 0 } }
    );
    return res ?? null;
  }
  async listTeams() {
    return await this.teams.find({}, this.noId).toArray();
  }
  async getTeam(id) {
    return await this.teams.findOne({ id }, this.noId);
  }
  async updateTeam(id, set, onlyIfStatus) {
    const filter = { id };
    if (onlyIfStatus) filter.status = { $in: onlyIfStatus };
    const res = await this.teams.updateOne(filter, { $set: set });
    return res.matchedCount > 0;
  }
  async savePlan(plan) {
    await this.plans.replaceOne({ id: plan.id }, { ...plan, savedAt: (/* @__PURE__ */ new Date()).toISOString() }, { upsert: true });
  }
  async saveCapBroadcast(doc) {
    await this.caps.replaceOne({ identifier: doc.identifier }, { ...doc, savedAt: (/* @__PURE__ */ new Date()).toISOString() }, { upsert: true });
  }
};
async function ensureSrvResolvable(uri) {
  const m = uri.match(/^mongodb\+srv:\/\/(?:[^@]*@)?([^/?]+)/);
  if (!m) return;
  const host = `_mongodb._tcp.${m[1]}`;
  const ok = await new Promise((resolve) => dns.resolveSrv(host, (err) => resolve(!err)));
  if (ok) return;
  console.warn("[DB] System DNS could not resolve the Atlas SRV record; retrying through public DNS (8.8.8.8, 1.1.1.1).");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}
async function createStore() {
  const uri = process.env.MONGODB_URI?.trim();
  const serverless = !!process.env.VERCEL;
  if (!uri && serverless) {
    throw new Error("MONGODB_URI is required on Vercel: serverless instances cannot share in-memory data.");
  }
  if (!uri) {
    console.warn("[DB] MONGODB_URI is not set \u2014 using the in-memory store. Data is lost when the server restarts.");
    return new MemoryStore();
  }
  await ensureSrvResolvable(uri);
  const store = new MongoStore(uri, process.env.MONGODB_DB?.trim() || "suraksha_x");
  try {
    await store.init();
    console.log("[DB] Connected to MongoDB.");
    return store;
  } catch (err) {
    if (serverless) throw err;
    console.error(`[DB] Could not connect to MongoDB (${err?.message || err}). Falling back to the in-memory store.`);
    return new MemoryStore();
  }
}

// server/gemini.ts
import { GoogleGenAI } from "@google/genai";

// src/shared/sosTriage.ts
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function nearestZone(zones, coords) {
  if (zones.length === 0) return null;
  return [...zones].sort(
    (a, b) => haversineKm(a.coordinates, coords) - haversineKm(b.coordinates, coords)
  )[0];
}
function priorityFromRiskLevel(riskLevel) {
  if (riskLevel === "CRITICAL") return "P1";
  if (riskLevel === "HIGH") return "P2";
  return "P3";
}
var IMPACT_RADIUS_KM = {
  FLOOD: 15,
  CYCLONE: 18,
  TSUNAMI: 15,
  EARTHQUAKE: 10,
  LANDSLIDE: 8,
  FIRE: 12,
  OTHER: 10
};
function findAffectedZones(zones, coords, disasterType) {
  const radius = IMPACT_RADIUS_KM[disasterType];
  return zones.map((z) => ({ zone: z, distanceKm: haversineKm(z.coordinates, coords) })).filter((entry) => entry.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5).map((entry) => ({
    zoneId: entry.zone.id,
    zoneName: entry.zone.name,
    distanceKm: Math.round(entry.distanceKm * 10) / 10,
    riskLevel: entry.zone.riskLevel
  }));
}
function recommendTeam(teams, disasterType) {
  const candidates = teams.filter((t) => t.handles.includes(disasterType));
  const pool = candidates.length > 0 ? candidates : teams;
  const available = pool.filter((t) => t.status === "AVAILABLE");
  const finalPool = available.length > 0 ? available : pool;
  if (finalPool.length === 0) return null;
  return [...finalPool].sort((a, b) => a.baseDistanceKm - b.baseDistanceKm)[0];
}
function vulnerabilityTagsFor(zone) {
  if (!zone) return [];
  const tags = [];
  if (zone.vulnerabilityBreakdown.elderly > 0) tags.push("Elderly Present");
  if (zone.vulnerabilityBreakdown.children > 0) tags.push("Children Present");
  if (zone.vulnerabilityBreakdown.pwd > 0) tags.push("Persons with Disabilities");
  if (zone.vulnerabilityBreakdown.highDensityHouseholds > 0) tags.push("High-Density Household");
  return tags;
}
var MAX_ZONE_DISTANCE_KM = 100;
function triageSOS(input) {
  const nearest = nearestZone(input.zones, input.coordinates);
  const outside = !!nearest && haversineKm(nearest.coordinates, input.coordinates) > MAX_ZONE_DISTANCE_KM;
  const zone = outside ? null : nearest;
  const unmapped = `Outside monitored zones (${input.coordinates.lat.toFixed(3)}, ${input.coordinates.lng.toFixed(3)})`;
  const recommended = recommendTeam(input.teams, input.disasterType);
  return {
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? (outside ? unmapped : input.fallbackRegion),
    location: zone?.name ?? (outside ? unmapped : input.fallbackRegion),
    riskScore: zone?.riskScore ?? 50,
    vulnerabilityTags: vulnerabilityTagsFor(zone),
    affectedZones: findAffectedZones(input.zones, input.coordinates, input.disasterType),
    recommendedTeamId: recommended?.id ?? null,
    priority: zone ? priorityFromRiskLevel(zone.riskLevel) : "P2"
  };
}

// src/shared/hazardSim.ts
var SEVERITIES = ["LOW", "MODERATE", "SEVERE", "EXTREME"];
var ALLOWED_EMOJI = [
  "\u{1F30A}",
  "\u{1F4A7}",
  "\u26F0\uFE0F",
  "\u{1FAA8}",
  "\u{1F3DA}\uFE0F",
  "\u{1F6A7}",
  "\u{1F300}",
  "\u{1F4A8}",
  "\u{1F525}",
  "\u{1F333}",
  "\u26A0\uFE0F",
  "\u{1F309}",
  "\u26A1",
  "\u{1F691}",
  "\u{1F3E5}",
  "\u{1F4CD}",
  "\u{1F30B}",
  "\u{1F3E0}",
  "\u{1F6D6}"
];
var SPECS = {
  FLOOD: {
    shape: "ellipse",
    anchor: 0.35,
    color: "#2563eb",
    length: [3, 6, 10, 16],
    width: [1.5, 3, 5, 8],
    peakHours: [3, 6, 10, 14],
    intensity: { label: "Water depth near the source", unit: "m", values: [0.4, 1, 2, 3.5] },
    levelLabels: { severe: "Deep, fast water", moderate: "Flooded area", watch: "Possible spread" }
  },
  LANDSLIDE: {
    shape: "teardrop",
    anchor: 0,
    color: "#92400e",
    length: [0.4, 0.9, 1.8, 3],
    width: [0.2, 0.45, 0.9, 1.5],
    peakHours: [0.1, 0.2, 0.3, 0.5],
    intensity: { label: "Debris depth", unit: "m", values: [0.5, 1.5, 3, 6] },
    levelLabels: { severe: "Debris core", moderate: "Runout path", watch: "Possible runout reach" }
  },
  TSUNAMI: {
    shape: "band",
    anchor: 0,
    color: "#0891b2",
    length: [0.8, 2, 4, 7],
    width: [3, 6, 10, 16],
    peakHours: [0.5, 0.8, 1.2, 2],
    intensity: { label: "Wave height at the coast", unit: "m", values: [1, 3, 6, 10] },
    levelLabels: { severe: "Strongest inundation", moderate: "Inundated area", watch: "Possible inundation limit" }
  },
  CYCLONE: {
    shape: "rings",
    anchor: 0,
    color: "#7c3aed",
    length: [40, 80, 130, 200],
    width: [40, 80, 130, 200],
    peakHours: [6, 10, 14, 18],
    intensity: { label: "Peak wind speed", unit: "km/h", values: [90, 120, 160, 210] },
    levelLabels: { severe: "Destructive winds", moderate: "Damaging winds", watch: "Gale-force winds possible" }
  },
  EARTHQUAKE: {
    shape: "rings",
    anchor: 0,
    color: "#dc2626",
    length: [8, 20, 40, 80],
    width: [8, 20, 40, 80],
    peakHours: [0, 0, 0, 0],
    intensity: { label: "Magnitude", unit: "Mw", values: [5, 6, 6.8, 7.6] },
    levelLabels: { severe: "Strongest shaking", moderate: "Strong shaking", watch: "Felt strongly" }
  },
  FIRE: {
    shape: "egg",
    anchor: 0.3,
    color: "#ea580c",
    length: [1.5, 4, 8, 14],
    width: [0.8, 2, 4, 6],
    peakHours: [1, 2, 4, 6],
    intensity: { label: "Wind speed", unit: "km/h", values: [10, 25, 40, 55] },
    levelLabels: { severe: "Active burning", moderate: "Likely burned area", watch: "Possible spread" }
  },
  OTHER: {
    shape: "circle",
    anchor: 0,
    color: "#6b7280",
    length: [1, 2, 4, 8],
    width: [1, 2, 4, 8],
    peakHours: [1, 1, 1, 1],
    intensity: { label: "Impact radius", unit: "km", values: [1, 2, 4, 8] },
    levelLabels: { severe: "Core area", moderate: "Affected area", watch: "Possible spread" }
  }
};
var hazardSpec = (h) => SPECS[h];
var sevIdx = (s) => SEVERITIES.indexOf(s);
var clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
var mod360 = (n) => (n % 360 + 360) % 360;
function allowedRanges(hazard, severity) {
  const s = SPECS[hazard];
  const i = sevIdx(severity);
  const r = (v) => [Math.round(v * 0.6 * 100) / 100, Math.round(v * 1.6 * 100) / 100];
  return {
    lengthKm: r(s.length[i]),
    widthKm: r(s.width[i]),
    peakAfterHours: s.peakHours[i] === 0 ? [0, 0] : r(s.peakHours[i]),
    intensity: r(s.intensity.values[i])
  };
}
function stableBearing(o) {
  const x = Math.sin(o.lat * 12.9898 + o.lng * 78.233) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 360);
}
var DEFAULT_TEXT = {
  FLOOD: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} flood: water spreads about ${p.lengthKm} km in the assumed flow direction, around ${p.intensity.value} m deep near its source, and keeps rising for roughly ${p.peakAfterHours} h.`,
    considerations: ["Check whether low-lying shelters and road links fall inside the footprint", "Pre-position boats / high-clearance vehicles on the upstream side", "Plan evacuation routes that run across, not along, the assumed flow"],
    assumptions: ["Flow direction is assumed (no terrain data)", "Depth and extent are typical values for this severity, not measurements"]
  },
  LANDSLIDE: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} landslide: debris runs about ${p.lengthKm} km downslope in the assumed slope direction, up to ${p.intensity.value} m deep in the core.`,
    considerations: ["Treat the whole runout path as unsafe until a geotechnical check", "Watch for secondary slides and blocked access roads", "Approach from the side, never from below the slope"],
    assumptions: ["Slope direction is assumed (no terrain data)", "Runout length is typical for this severity, not modelled"]
  },
  TSUNAMI: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} tsunami: waves of about ${p.intensity.value} m push roughly ${p.lengthKm} km inland across a ${p.widthKm} km stretch of coast, with the first wave in about ${Math.round(p.peakAfterHours * 60)} min.`,
    considerations: ["Move people to high ground well beyond the assumed inundation limit", "Expect several waves; do not release the area after the first", "Keep rescue staging points outside the footprint"],
    assumptions: ["Inland direction is assumed (no coastline data)", "Inundation depth is typical for this severity, not modelled"]
  },
  CYCLONE: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} cyclone: damaging winds reach about ${p.lengthKm} km from the centre, peaking near ${p.intensity.value} km/h, over roughly ${p.peakAfterHours} h.`,
    considerations: ["Shelter in sturdy buildings away from the coast and flood-prone land", "Expect power and telecom outages across the whole footprint", "Plan for storm surge on low coastal strips"],
    assumptions: ["Track and centre position are assumed", "Wind field is symmetric rings, a simplification"]
  },
  EARTHQUAKE: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} earthquake (about Mw ${p.intensity.value}) with the epicentre assumed at the SOS location: strongest shaking within ~${Math.round(p.lengthKm * 0.5)} km, felt up to ~${p.lengthKm} km.`,
    considerations: ["Prioritise collapsed or damaged buildings in the strongest ring", "Inspect bridges and roads before sending heavy vehicles", "Expect aftershocks; keep teams out of weakened structures"],
    assumptions: ["Epicentre is assumed at the SOS point", "Shaking falls off as simple rings; soil and fault geometry are ignored"]
  },
  FIRE: {
    narrative: (p) => `Illustrative ${p.severity.toLowerCase()} fire: driven by about ${p.intensity.value} km/h wind it spreads roughly ${p.lengthKm} km downwind, over ${p.peakAfterHours} h.`,
    considerations: ["Keep evacuation routes upwind and crosswind of the fire", "Watch for wind shifts that change the spread direction", "Stage water sources and crews on the upwind flank"],
    assumptions: ["Wind direction is assumed (no weather data)", "Spread is a smooth wind-driven shape, not a fuel model"]
  },
  OTHER: {
    narrative: (p) => `Illustrative incident area of about ${p.lengthKm} km radius around the reported location.`,
    considerations: ["Confirm the nature of the incident with the reporting citizen", "Treat the area as unverified until a team arrives"],
    assumptions: ["Radius is a generic placeholder for this severity"]
  }
};
function defaultMarkers(h, b, L) {
  const m = (emoji, label, bearingDeg, frac) => ({
    emoji,
    label,
    bearingDeg: mod360(bearingDeg),
    distanceKm: Math.round(L * frac * 100) / 100
  });
  switch (h) {
    case "FLOOD":
      return [m("\u{1F30A}", "Water rising (assumed source)", b + 180, 0.3), m("\u{1F3DA}\uFE0F", "Low-lying homes likely flooded", b, 0.45), m("\u{1F6A7}", "Roads likely cut", b + 35, 0.7)];
    case "LANDSLIDE":
      return [m("\u26F0\uFE0F", "Assumed slope failure", b + 180, 0.3), m("\u{1FAA8}", "Debris runout", b, 0.8), m("\u{1F6A7}", "Access road likely blocked", b + 30, 0.5)];
    case "TSUNAMI":
      return [m("\u{1F30A}", "Wave front from the sea (assumed)", b + 180, 0.35), m("\u{1F3DA}\uFE0F", "Coastal structures at risk", b, 0.4), m("\u26A0\uFE0F", "Assumed inundation limit", b, 0.95)];
    case "CYCLONE":
      return [m("\u{1F300}", "Cyclone centre (assumed)", b + 180, 0.5), m("\u{1F4A8}", "Damaging winds", b, 0.55), m("\u{1F30A}", "Storm-surge risk on the coast", b + 90, 0.45)];
    case "EARTHQUAKE":
      return [m("\u{1F3DA}\uFE0F", "Damaged buildings likely", 45, 0.25), m("\u{1F6A7}", "Road / bridge damage possible", 160, 0.5), m("\u26A0\uFE0F", "Aftershock caution", 280, 0.75)];
    case "FIRE":
      return [m("\u{1F525}", "Assumed ignition point", b + 180, 0.2), m("\u{1F4A8}", "Wind-driven spread", b, 0.6), m("\u{1F333}", "Dry vegetation / fuel", b + 40, 0.45)];
    default:
      return [m("\u26A0\uFE0F", "Incident area", 0, 0.3)];
  }
}
function defaultParams(hazard, severity, origin) {
  const s = SPECS[hazard];
  const i = sevIdx(severity);
  const bearingDeg = stableBearing(origin);
  const base = {
    hazard,
    severity,
    headline: `${hazard.charAt(0)}${hazard.slice(1).toLowerCase()} \u2014 ${severity.toLowerCase()} scenario`,
    narrative: "",
    assumptions: DEFAULT_TEXT[hazard].assumptions,
    considerations: DEFAULT_TEXT[hazard].considerations,
    bearingDeg,
    lengthKm: s.length[i],
    widthKm: s.width[i],
    peakAfterHours: s.peakHours[i],
    intensity: { label: s.intensity.label, value: s.intensity.values[i], unit: s.intensity.unit },
    markers: defaultMarkers(hazard, bearingDeg, s.length[i])
  };
  base.narrative = DEFAULT_TEXT[hazard].narrative(base);
  return base;
}
var cleanText = (v, max) => {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f<>`]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 0 ? t.slice(0, max) : null;
};
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
var cleanList = (v, maxItems, maxLen) => {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => cleanText(x, maxLen)).filter((x) => !!x).slice(0, maxItems);
  return out.length ? out : null;
};
function validateParams(raw, hazard, severity, origin) {
  const d = defaultParams(hazard, severity, origin);
  if (!raw || typeof raw !== "object") return d;
  const r = raw;
  const rng = allowedRanges(hazard, severity);
  const lengthKm = num(r.lengthKm) !== null ? clamp(r.lengthKm, ...rng.lengthKm) : d.lengthKm;
  const widthKm = num(r.widthKm) !== null ? clamp(r.widthKm, ...rng.widthKm) : d.widthKm;
  const peak = num(r.peakAfterHours) !== null ? clamp(r.peakAfterHours, ...rng.peakAfterHours) : d.peakAfterHours;
  const intensityValue = num(r.intensity?.value ?? r.intensityValue) !== null ? clamp(r.intensity?.value ?? r.intensityValue, ...rng.intensity) : d.intensity.value;
  const bearingDeg = num(r.bearingDeg) !== null ? Math.round(mod360(r.bearingDeg)) : d.bearingDeg;
  let markers = d.markers;
  if (Array.isArray(r.markers)) {
    const parsed = [];
    for (const m of r.markers.slice(0, 6)) {
      const label = cleanText(m?.label, 44);
      const dist = num(m?.distanceKm);
      const brg = num(m?.bearingDeg);
      if (!label || dist === null || brg === null) continue;
      parsed.push({
        emoji: ALLOWED_EMOJI.includes(m?.emoji) ? m.emoji : "\u{1F4CD}",
        label,
        bearingDeg: Math.round(mod360(brg)),
        distanceKm: Math.round(clamp(dist, 0.05, lengthKm * 1.2) * 100) / 100
      });
    }
    if (parsed.length > 0) markers = parsed;
  }
  const out = {
    ...d,
    headline: cleanText(r.headline, 90) ?? d.headline,
    assumptions: cleanList(r.assumptions, 4, 140) ?? d.assumptions,
    considerations: cleanList(r.considerations, 4, 140) ?? d.considerations,
    bearingDeg,
    lengthKm: Math.round(lengthKm * 100) / 100,
    widthKm: Math.round(widthKm * 100) / 100,
    peakAfterHours: Math.round(peak * 100) / 100,
    intensity: { ...d.intensity, value: Math.round(intensityValue * 10) / 10 },
    markers
  };
  out.narrative = cleanText(r.narrative, 320) ?? DEFAULT_TEXT[hazard].narrative(out);
  return out;
}
function severityFromPriority(priority) {
  return priority === "P1" ? "SEVERE" : priority === "P2" ? "MODERATE" : "LOW";
}

// server/gemini.ts
var GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite"
];
var deadModels = /* @__PURE__ */ new Set();
var cooldownUntil = /* @__PURE__ */ new Map();
var COOLDOWN_OVERLOAD_MS = 9e4;
var COOLDOWN_QUOTA_MS = 10 * 6e4;
var modelAvailable = (m) => !deadModels.has(m) && (cooldownUntil.get(m) ?? 0) < Date.now();
function noteModelFailure(model, message) {
  if (/"code":\s*404|NOT_FOUND/.test(message)) deadModels.add(model);
  else if (/429|RESOURCE_EXHAUSTED/.test(message)) cooldownUntil.set(model, Date.now() + COOLDOWN_QUOTA_MS);
  else cooldownUntil.set(model, Date.now() + COOLDOWN_OVERLOAD_MS);
}
var PER_MODEL_TIMEOUT_MS = 2e4;
var HEDGE_MS = 3500;
var TOTAL_BUDGET_MS = 28e3;
function geminiConfigured() {
  const k = process.env.GEMINI_API_KEY?.trim();
  return !!k && k !== "MY_GEMINI_API_KEY";
}
var client = null;
function getClient() {
  if (!geminiConfigured()) return null;
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.trim() });
  return client;
}
var withTimeout = (p, ms) => {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error("timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
};
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(text.slice(start, end + 1));
}
var SYSTEM = `You are the parameter generator for a disaster-response TRAINING SIMULATOR.
This is a pure simulation: there is no real-time sensor, satellite, weather or terrain data, and you must not claim certainty or describe it as a forecast.
You do NOT draw maps or output coordinates. You only choose a few bounded numeric parameters and short texts; software draws the footprint from them.
Reply with ONE JSON object and nothing else.`;
function buildPrompt(req) {
  const spec = hazardSpec(req.hazard);
  const r = allowedRanges(req.hazard, req.severity);
  return `Hazard: ${req.hazard}
Severity to simulate: ${req.severity}
Location (for general context only): ${req.origin.lat.toFixed(4)}, ${req.origin.lng.toFixed(4)}
Known sample context:
${req.context.length ? req.context.map((c) => `- ${c}`).join("\n") : "- none"}

Return JSON with exactly these keys:
{
  "headline": string (max 80 chars, plain),
  "narrative": string (2 sentences, max 300 chars, say it is illustrative),
  "bearingDeg": number 0-359 (clockwise from north: direction of ${req.hazard === "FLOOD" ? "water flow" : req.hazard === "LANDSLIDE" ? "downslope movement" : req.hazard === "TSUNAMI" ? "inland push" : req.hazard === "FIRE" ? "wind-driven spread" : req.hazard === "CYCLONE" ? "cyclone track" : "principal spread"}),
  "lengthKm": number between ${r.lengthKm[0]} and ${r.lengthKm[1]},
  "widthKm": number between ${r.widthKm[0]} and ${r.widthKm[1]},
  "peakAfterHours": number between ${r.peakAfterHours[0]} and ${r.peakAfterHours[1]},
  "intensity": { "value": number between ${r.intensity[0]} and ${r.intensity[1]} }   // ${spec.intensity.label} (${spec.intensity.unit})
  "assumptions": string[] (2-3 short items stating what is assumed because no real data exists),
  "considerations": string[] (3-4 short suggestions staff should VERIFY, phrased as considerations, not orders),
  "markers": [ { "emoji": one of ${ALLOWED_EMOJI.join(" ")}, "label": string (max 40 chars, start with "Possible" or "Assumed" where uncertain), "bearingDeg": number, "distanceKm": number between 0.1 and ${r.lengthKm[1]} } ]   // 3 to 5 markers of plausible impacts or features
}
Keep every value physically plausible for this hazard and severity.
If this hazard is implausible at this kind of location (for example a tsunami far from any coast), say so plainly in the first assumption instead of pretending otherwise.`;
}
async function generateSimParams(req) {
  const ai = getClient();
  if (!ai) return null;
  const order = GEMINI_MODELS.filter(modelAvailable);
  if (order.length === 0) return null;
  const prompt = buildPrompt(req);
  return new Promise((resolve) => {
    let done = false;
    let next = 0;
    let running = 0;
    let hedgeTimer = null;
    const inflight = /* @__PURE__ */ new Map();
    const finish = (result) => {
      if (done) return;
      done = true;
      if (result) {
        const winnerRank = order.indexOf(result.model);
        for (const [model, rank] of inflight) if (rank < winnerRank) noteModelFailure(model, "timeout (lost the race)");
      }
      if (hedgeTimer) clearTimeout(hedgeTimer);
      clearTimeout(budgetTimer);
      resolve(result);
    };
    const budgetTimer = setTimeout(() => finish(null), TOTAL_BUDGET_MS);
    const startNext = () => {
      if (done) return;
      if (hedgeTimer) clearTimeout(hedgeTimer);
      if (next >= order.length) {
        if (running === 0) finish(null);
        return;
      }
      const model = order[next++];
      running++;
      inflight.set(model, next - 1);
      hedgeTimer = setTimeout(startNext, HEDGE_MS);
      withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { systemInstruction: SYSTEM, temperature: 0.4, maxOutputTokens: 4096, responseMimeType: "application/json" }
        }),
        PER_MODEL_TIMEOUT_MS
      ).then((response) => {
        const raw = extractJson(response.text ?? "");
        inflight.delete(model);
        finish({ raw, model });
      }).catch((err) => {
        const msg = String(err?.message ?? err);
        inflight.delete(model);
        noteModelFailure(model, msg);
        console.warn(`[Sim] ${model} failed: ${msg.slice(0, 100)}`);
        running--;
        startNext();
      });
    };
    startNext();
  });
}

// server/routes.ts
import crypto2 from "crypto";
import { Router } from "express";

// server/security.ts
import crypto from "crypto";
var isProd = process.env.NODE_ENV === "production";
var secret = process.env.SESSION_SECRET?.trim() || "";
if (!secret) {
  secret = crypto.randomBytes(32).toString("hex");
  console.warn("[SECURITY] SESSION_SECRET is not set \u2014 using a random one. Everyone is signed out on every restart.");
}
if (isProd && secret.length < 32) {
  console.warn("[SECURITY] SESSION_SECRET should be at least 32 characters in production.");
}
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
function sign(payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}
function issueToken(claims, ttlSeconds) {
  const body = { ...claims, exp: Math.floor(Date.now() / 1e3) + ttlSeconds };
  const payload = b64url(JSON.stringify(body));
  return `${payload}.${sign(payload)}`;
}
function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1e3) return null;
    return claims;
  } catch {
    return null;
  }
}
function loadCode(envName, label) {
  const configured = process.env[envName]?.trim();
  if (configured) return configured;
  const generated = crypto.randomBytes(4).toString("hex").toUpperCase();
  console.warn(`[SECURITY] ${envName} is not set. Temporary ${label} access code for this run: ${generated}`);
  return generated;
}
var accessCodes = {
  admin: loadCode("ADMIN_ACCESS_CODE", "Admin"),
  rescue: loadCode("RESCUE_ACCESS_CODE", "Rescue Team")
};
function checkAccessCode(role, supplied) {
  if (typeof supplied !== "string" || supplied.length === 0 || supplied.length > 128) return false;
  const h = (s) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(supplied.trim()), h(accessCodes[role]));
}
function attachSession(req, _res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : void 0;
  req.session = verifyToken(token) ?? void 0;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session) return res.status(401).json({ error: "Sign in required" });
    if (roles.length > 0 && !roles.includes(req.session.role)) {
      return res.status(403).json({ error: "Your role is not allowed to do this" });
    }
    next();
  };
}
function rateLimit(opts) {
  const hits = /* @__PURE__ */ new Map();
  const sweep = setInterval(() => {
    const cutoff = Date.now() - opts.windowMs;
    for (const [key, stamps] of hits) {
      const live = stamps.filter((t) => t > cutoff);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
  }, Math.max(opts.windowMs, 3e4));
  sweep.unref();
  return (req, res, next) => {
    const key = `${opts.keyPrefix ?? ""}${req.ip || req.socket.remoteAddress || "unknown"}`;
    const now = Date.now();
    const live = (hits.get(key) || []).filter((t) => now - t < opts.windowMs);
    if (live.length >= opts.max) {
      hits.set(key, live);
      res.setHeader("Retry-After", String(Math.ceil(opts.windowMs / 1e3)));
      return res.status(429).json({ error: opts.message ?? "Too many requests \u2014 please slow down." });
    }
    live.push(now);
    hits.set(key, live);
    next();
  };
}
function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  res.removeHeader("X-Powered-By");
  next();
}

// src/data/scenarios/flood.ts
var floodScenario = {
  meta: {
    id: "flood-assam",
    name: "River Basin Flood \u2014 Assam",
    disasterType: "FLOOD",
    category: "Cat-4",
    region: "River Basin District",
    state: "Assam",
    riverBasinOrFault: "Alakananda-Brahmaputra Tributary Basin",
    lastUpdated: "19:32:14 UTC+5:30",
    criticalZonesCount: 4,
    totalHazardZones: 12,
    totalReliefCentres: 18,
    totalPopulationAtRisk: 18420,
    totalVulnerablePopulation: 5280,
    availableShelterCapacity: 12640,
    totalShelterCapacity: 21500,
    totalShelterOccupancy: 8860,
    hazardIcon: "Waves",
    hazardColor: "red"
  },
  riskZones: [
    {
      id: "zone-village-a",
      name: "Village A (North Bank)",
      code: "RZ-01-A",
      district: "River Basin District",
      riverBasin: "Alakananda-Brahmaputra Tributary Basin",
      riskScore: 94,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 2400,
      vulnerablePopulation: 680,
      exposureLevel: "Very High",
      floodDepthEstMeters: 3.4,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE RELOCATION",
      coordinates: { lat: 26.185, lng: 91.735 },
      polygon: [
        [26.195, 91.72],
        [26.198, 91.745],
        [26.175, 91.752],
        [26.172, 91.725]
      ],
      vulnerabilityBreakdown: {
        elderly: 240,
        children: 290,
        pwd: 75,
        highDensityHouseholds: 75,
        accessibilityScore: 71,
        shelterAvailabilityScore: 64,
        hazardExposureScore: 95,
        populationExposureScore: 82
      },
      reasoning: "Priority increased due to high flood exposure (estimated +3.4m surge in 4 hours), concentration of 680 vulnerable residents, and critical embankment breach risks.",
      lastAssessed: "19:32:14 UTC+5:30"
    },
    {
      id: "zone-village-b",
      name: "Village B (Lower Estuary)",
      code: "RZ-02-B",
      district: "River Basin District",
      riverBasin: "Alakananda-Brahmaputra Tributary Basin",
      riskScore: 87,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 3100,
      vulnerablePopulation: 890,
      exposureLevel: "Very High",
      floodDepthEstMeters: 2.8,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE RELOCATION",
      coordinates: { lat: 26.16, lng: 91.71 },
      polygon: [
        [26.17, 91.695],
        [26.172, 91.72],
        [26.15, 91.725],
        [26.148, 91.7]
      ],
      vulnerabilityBreakdown: {
        elderly: 310,
        children: 410,
        pwd: 95,
        highDensityHouseholds: 75,
        accessibilityScore: 62,
        shelterAvailabilityScore: 58,
        hazardExposureScore: 88,
        populationExposureScore: 86
      },
      reasoning: "Estuary backflow triggered by upstream reservoir discharge. Secondary evacuation route access limited.",
      lastAssessed: "19:30:00 UTC+5:30"
    },
    {
      id: "zone-village-c",
      name: "Village C (East Polder)",
      code: "RZ-03-C",
      district: "River Basin District",
      riverBasin: "Alakananda-Brahmaputra Tributary Basin",
      riskScore: 71,
      riskLevel: "HIGH",
      priority: "P2",
      population: 1850,
      vulnerablePopulation: 420,
      exposureLevel: "High",
      floodDepthEstMeters: 1.7,
      waterLevelTrend: "RISING_SLOW",
      recommendedAction: "PRE-EMPTIVE EVACUATION",
      coordinates: { lat: 26.21, lng: 91.765 },
      polygon: [
        [26.22, 91.75],
        [26.222, 91.78],
        [26.2, 91.785],
        [26.198, 91.755]
      ],
      vulnerabilityBreakdown: {
        elderly: 150,
        children: 190,
        pwd: 40,
        highDensityHouseholds: 40,
        accessibilityScore: 78,
        shelterAvailabilityScore: 72,
        hazardExposureScore: 74,
        populationExposureScore: 68
      },
      reasoning: "Polder seepage detected. Embankment stable for next 6-8 hours, but waterlogged lowlands require vulnerable groups relocation.",
      lastAssessed: "19:28:40 UTC+5:30"
    },
    {
      id: "zone-village-d",
      name: "Village D (South Meander)",
      code: "RZ-04-D",
      district: "River Basin District",
      riverBasin: "Alakananda-Brahmaputra Tributary Basin",
      riskScore: 56,
      riskLevel: "MODERATE",
      priority: "P3",
      population: 2950,
      vulnerablePopulation: 580,
      exposureLevel: "Moderate",
      floodDepthEstMeters: 0.9,
      waterLevelTrend: "STABLE",
      recommendedAction: "ACTIVE MONITORING & ADVISORY",
      coordinates: { lat: 26.135, lng: 91.745 },
      polygon: [
        [26.145, 91.73],
        [26.148, 91.76],
        [26.125, 91.762],
        [26.122, 91.732]
      ],
      vulnerabilityBreakdown: {
        elderly: 210,
        children: 260,
        pwd: 60,
        highDensityHouseholds: 50,
        accessibilityScore: 85,
        shelterAvailabilityScore: 80,
        hazardExposureScore: 54,
        populationExposureScore: 58
      },
      reasoning: "Moderate surface runoff. Natural drainage active. Standby teams deployed at key culverts.",
      lastAssessed: "19:25:10 UTC+5:30"
    },
    {
      id: "zone-village-e",
      name: "Village E (Ridge Settlement)",
      code: "RZ-05-E",
      district: "River Basin District",
      riverBasin: "Alakananda-Brahmaputra Tributary Basin",
      riskScore: 32,
      riskLevel: "SAFE",
      priority: "P4",
      population: 4120,
      vulnerablePopulation: 710,
      exposureLevel: "Low",
      floodDepthEstMeters: 0.1,
      waterLevelTrend: "RECEDING",
      recommendedAction: "LOCAL SHELTERING & LOGISTICS HUB",
      coordinates: { lat: 26.19, lng: 91.8 },
      polygon: [
        [26.2, 91.785],
        [26.205, 91.815],
        [26.18, 91.82],
        [26.175, 91.79]
      ],
      vulnerabilityBreakdown: {
        elderly: 280,
        children: 320,
        pwd: 50,
        highDensityHouseholds: 60,
        accessibilityScore: 94,
        shelterAvailabilityScore: 92,
        hazardExposureScore: 28,
        populationExposureScore: 35
      },
      reasoning: "Elevated terrain with full arterial connectivity. Designated safe staging zone for outbound supply convoys.",
      lastAssessed: "19:20:00 UTC+5:30"
    },
    {
      id: "zone-village-f",
      name: "Village F (Canal Sector)",
      code: "RZ-06-F",
      district: "River Basin District",
      riverBasin: "Alakananda-Brahmaputra Tributary Basin",
      riskScore: 82,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 4e3,
      vulnerablePopulation: 2e3,
      exposureLevel: "Very High",
      floodDepthEstMeters: 2.6,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE RELOCATION",
      coordinates: { lat: 26.165, lng: 91.77 },
      polygon: [
        [26.175, 91.755],
        [26.178, 91.785],
        [26.155, 91.79],
        [26.15, 91.76]
      ],
      vulnerabilityBreakdown: {
        elderly: 720,
        children: 940,
        pwd: 210,
        highDensityHouseholds: 130,
        accessibilityScore: 59,
        shelterAvailabilityScore: 61,
        hazardExposureScore: 84,
        populationExposureScore: 80
      },
      reasoning: "Canal overflow imminent within 2 hours. High concentration of pediatric and geriatric residents in low-lying quadrants.",
      lastAssessed: "19:31:00 UTC+5:30"
    }
  ],
  reliefCentres: [
    {
      id: "shelter-03",
      name: "Relief Centre #03 (Govt Higher Secondary Complex)",
      code: "RC-03",
      location: "North Hill Sector, River Basin District",
      coordinates: { lat: 26.215, lng: 91.705 },
      capacity: 2500,
      occupancy: 1820,
      available: 680,
      status: "AVAILABLE",
      distanceKm: 4.2,
      travelTimeMin: 18,
      elevationMeters: 48,
      safetyScore: 96,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 7,
        cleanWaterLiters: 45e3,
        backupPower: true,
        sanitationBlocks: 32,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Major R. Sharma",
        designation: "Sector Incident Commander (NDRF)",
        phone: "+91 98765-43210",
        channel: "VHF Ch-08 (Emergency Net)"
      }
    },
    {
      id: "shelter-01",
      name: "Relief Centre #01 (District Sports Stadium)",
      code: "RC-01",
      location: "Central Ridge, River Basin District",
      coordinates: { lat: 26.17, lng: 91.81 },
      capacity: 3800,
      occupancy: 3450,
      available: 350,
      status: "NEAR_CAPACITY",
      distanceKm: 8.4,
      travelTimeMin: 34,
      elevationMeters: 42,
      safetyScore: 91,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 5,
        cleanWaterLiters: 6e4,
        backupPower: true,
        sanitationBlocks: 45,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Dr. Ananya Sen",
        designation: "District Relief Officer",
        phone: "+91 98765-43211",
        channel: "VHF Ch-04"
      }
    },
    {
      id: "shelter-02",
      name: "Relief Centre #02 (Community Polytechnic Institute)",
      code: "RC-02",
      location: "West Plateau Sector, River Basin District",
      coordinates: { lat: 26.23, lng: 91.745 },
      capacity: 1800,
      occupancy: 1650,
      available: 150,
      status: "NEAR_CAPACITY",
      distanceKm: 6.1,
      travelTimeMin: 26,
      elevationMeters: 55,
      safetyScore: 89,
      facilities: {
        medicalUnit: false,
        foodRationsDays: 4,
        cleanWaterLiters: 22e3,
        backupPower: true,
        sanitationBlocks: 18,
        wheelchairAccessible: false
      },
      contactOfficer: {
        name: "K. V. Raman",
        designation: "Shelter Manager",
        phone: "+91 98765-43212",
        channel: "VHF Ch-06"
      }
    },
    {
      id: "shelter-04",
      name: "Relief Centre #04 (Agricultural University Auditorium)",
      code: "RC-04",
      location: "South Uplands, River Basin District",
      coordinates: { lat: 26.12, lng: 91.79 },
      capacity: 2200,
      occupancy: 950,
      available: 1250,
      status: "AVAILABLE",
      distanceKm: 11.5,
      travelTimeMin: 45,
      elevationMeters: 62,
      safetyScore: 94,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 10,
        cleanWaterLiters: 5e4,
        backupPower: true,
        sanitationBlocks: 28,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Sunita Das",
        designation: "Assistant Commissioner (Disaster Mgmt)",
        phone: "+91 98765-43213",
        channel: "VHF Ch-02"
      }
    },
    {
      id: "shelter-05",
      name: "Relief Centre #05 (Old Municipal Hall)",
      code: "RC-05",
      location: "Lowland Peripheral Sector",
      coordinates: { lat: 26.155, lng: 91.685 },
      capacity: 1200,
      occupancy: 1200,
      available: 0,
      status: "FULL",
      distanceKm: 5.7,
      travelTimeMin: 28,
      elevationMeters: 22,
      safetyScore: 68,
      facilities: {
        medicalUnit: false,
        foodRationsDays: 2,
        cleanWaterLiters: 1e4,
        backupPower: false,
        sanitationBlocks: 12,
        wheelchairAccessible: false
      },
      contactOfficer: {
        name: "T. Barman",
        designation: "Zonal Warden",
        phone: "+91 98765-43214",
        channel: "VHF Ch-01"
      }
    },
    {
      id: "shelter-06",
      name: "Relief Centre #06 (Industrial Training Hub)",
      code: "RC-06",
      location: "North-East Bypass",
      coordinates: { lat: 26.24, lng: 91.795 },
      capacity: 3e3,
      occupancy: 1100,
      available: 1900,
      status: "AVAILABLE",
      distanceKm: 12.8,
      travelTimeMin: 52,
      elevationMeters: 51,
      safetyScore: 92,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 8,
        cleanWaterLiters: 55e3,
        backupPower: true,
        sanitationBlocks: 36,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Col. P. Nair (Retd.)",
        designation: "Logistics Coordinator",
        phone: "+91 98765-43215",
        channel: "VHF Ch-09"
      }
    }
  ],
  blockedRoads: [
    {
      id: "block-01",
      name: "NH-12 River Causeway Bridge",
      reason: "Active 1.8m flash water surge & structural scour alarm",
      coordinates: [
        [26.188, 91.718],
        [26.192, 91.714]
      ],
      severity: "SUBMERGED_UNSAFE",
      reportedAt: "19:15:00 UTC+5:30"
    },
    {
      id: "block-02",
      name: "Sector 4 Canal Underpass",
      reason: "Total silt blockage and submerged power lines",
      coordinates: [
        [26.17, 91.738],
        [26.173, 91.745]
      ],
      severity: "TOTAL_BLOCKAGE",
      reportedAt: "19:05:00 UTC+5:30"
    },
    {
      id: "block-03",
      name: "South Estuary Low Road",
      reason: "Embankment soil sliding across 250m section",
      coordinates: [
        [26.152, 91.712],
        [26.155, 91.722]
      ],
      severity: "LANDSLIDE_RISK",
      reportedAt: "18:50:00 UTC+5:30"
    }
  ],
  evacuationRoutes: [
    {
      id: "route-village-a-rc03-primary",
      originId: "zone-village-a",
      originName: "Village A (North Bank)",
      destinationId: "shelter-03",
      destinationName: "Relief Centre #03 (Govt Higher Secondary Complex)",
      distanceKm: 4.2,
      estimatedTimeMin: 18,
      safetyScore: 95,
      safetyLevel: "HIGH",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 14.5,
      isRecommended: true,
      coordinates: [
        [26.185, 91.735],
        [26.19, 91.732],
        [26.198, 91.728],
        [26.205, 91.72],
        [26.21, 91.712],
        [26.215, 91.705]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Muster at Village A North Community Ground & embark high-clearance transit convoys.",
          distance: "0.4 km",
          roadCondition: "CLEAR"
        },
        {
          step: 2,
          instruction: "Turn northwest onto Route B Elevated Bypass to avoid low-lying culverts.",
          distance: "1.2 km",
          roadCondition: "CLEAR"
        },
        {
          step: 3,
          instruction: "Cross Junction C via the reinforced concrete flyover (Traffic Control Post Alpha deployed).",
          distance: "1.4 km",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Ascend North Hill Ridge access spur directly to Relief Centre #03 Reception Bay.",
          distance: "1.2 km",
          roadCondition: "CLEAR"
        }
      ]
    },
    {
      id: "route-village-a-rc03-alt1",
      originId: "zone-village-a",
      originName: "Village A (North Bank)",
      destinationId: "shelter-03",
      destinationName: "Relief Centre #03 (Govt Higher Secondary Complex)",
      distanceKm: 5.8,
      estimatedTimeMin: 29,
      safetyScore: 74,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 0,
      elevationClearanceMeters: 6.2,
      isRecommended: false,
      coordinates: [
        [26.185, 91.735],
        [26.18, 91.745],
        [26.195, 91.76],
        [26.215, 91.74],
        [26.222, 91.718],
        [26.215, 91.705]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Exit Village A via Eastern Bund Road.",
          distance: "0.8 km",
          roadCondition: "WATERLOGGED_PASSABLE"
        },
        {
          step: 2,
          instruction: "Follow East Meander Loop toward High Canal Road.",
          distance: "2.3 km",
          roadCondition: "CONGESTED"
        },
        {
          step: 3,
          instruction: "Turn west onto Plateau Link Highway.",
          distance: "1.9 km",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Arrive at Relief Centre #03 North Entrance.",
          distance: "0.8 km",
          roadCondition: "CLEAR"
        }
      ]
    },
    {
      id: "route-village-a-rc01-alt2",
      originId: "zone-village-a",
      originName: "Village A (North Bank)",
      destinationId: "shelter-01",
      destinationName: "Relief Centre #01 (District Sports Stadium)",
      distanceKm: 8.4,
      estimatedTimeMin: 38,
      safetyScore: 68,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 2,
      elevationClearanceMeters: 4.8,
      isRecommended: false,
      coordinates: [
        [26.185, 91.735],
        [26.18, 91.76],
        [26.175, 91.785],
        [26.17, 91.81]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Proceed south-east across Sector 2 bypass.",
          distance: "2.1 km",
          roadCondition: "WATERLOGGED_PASSABLE"
        },
        {
          step: 2,
          instruction: "Merge onto Central District Trunk Road.",
          distance: "4.8 km",
          roadCondition: "CONGESTED"
        },
        {
          step: 3,
          instruction: "Enter Stadium gate 4 staging area.",
          distance: "1.5 km",
          roadCondition: "CLEAR"
        }
      ]
    }
  ],
  roadNetworks: [
    {
      id: "road-nh-12-corridor",
      name: "NH-12 National Highway Trunk Corridor",
      type: "HIGHWAY",
      status: "CAUTION",
      speedLimitKmh: 60,
      lanes: 4,
      elevationMeters: 22,
      coordinates: [
        [26.14, 91.68],
        [26.155, 91.7],
        [26.175, 91.72],
        [26.195, 91.745],
        [26.22, 91.77],
        [26.24, 91.8]
      ]
    },
    {
      id: "road-elevated-bypass-b",
      name: "Route B North Elevated Flood Bypass",
      type: "ELEVATED",
      status: "CLEAR",
      speedLimitKmh: 50,
      lanes: 2,
      elevationMeters: 38,
      coordinates: [
        [26.185, 91.735],
        [26.198, 91.728],
        [26.205, 91.72],
        [26.215, 91.705]
      ]
    },
    {
      id: "road-central-arterial",
      name: "Central District Spine Arterial",
      type: "ARTERIAL",
      status: "CLEAR",
      speedLimitKmh: 45,
      lanes: 4,
      elevationMeters: 28,
      coordinates: [
        [26.13, 91.74],
        [26.15, 91.75],
        [26.175, 91.765],
        [26.19, 91.78],
        [26.21, 91.8]
      ]
    },
    {
      id: "road-west-bund-connector",
      name: "West Estuary Ring Connector",
      type: "SECONDARY",
      status: "CAUTION",
      speedLimitKmh: 40,
      lanes: 2,
      elevationMeters: 16,
      coordinates: [
        [26.145, 91.69],
        [26.16, 91.705],
        [26.178, 91.715],
        [26.19, 91.71]
      ]
    },
    {
      id: "road-east-polder-link",
      name: "East Polder - Sports Complex Link Road",
      type: "SECONDARY",
      status: "CLEAR",
      speedLimitKmh: 40,
      lanes: 2,
      elevationMeters: 24,
      coordinates: [
        [26.21, 91.765],
        [26.195, 91.785],
        [26.18, 91.81],
        [26.17, 91.82]
      ]
    },
    {
      id: "road-hill-crest-access",
      name: "North Hill Crest Emergency Access Spur",
      type: "ELEVATED",
      status: "CLEAR",
      speedLimitKmh: 35,
      lanes: 2,
      elevationMeters: 48,
      coordinates: [
        [26.205, 91.72],
        [26.21, 91.712],
        [26.218, 91.702],
        [26.225, 91.695]
      ]
    }
  ],
  alerts: [
    {
      id: "alt-01",
      title: "CRITICAL: Embankment Breach Alert \u2014 Village A",
      message: "Water inflow rate surged to 420 m\xB3/s at River Basin Sector 1. Immediate relocation of 680 vulnerable residents advised.",
      severity: "CRITICAL",
      timestamp: "19:32:14",
      zoneId: "zone-village-a",
      read: false
    },
    {
      id: "alt-02",
      title: "ROAD CLOSURE: NH-12 Causeway Bridge Submerged",
      message: "Water level +1.8m over bridge deck. Route blocked. Automatic rerouting via Route B / Junction C active.",
      severity: "WARNING",
      timestamp: "19:15:00",
      read: false
    },
    {
      id: "alt-03",
      title: "SHELTER UPDATE: Relief Centre #03 Prepared",
      message: "Medical post established, 45,000L clean water on site, 680 beds reserved for P1 Village A priority transfer.",
      severity: "INFO",
      timestamp: "19:10:22",
      read: true
    },
    {
      id: "alt-04",
      title: "WEATHER TELEMETRY: Heavy Inflow Forecast",
      message: "Doppler radar indicates additional 85mm precipitation upstream within the next 3 hours.",
      severity: "WARNING",
      timestamp: "18:55:00",
      read: true
    }
  ],
  demographics: {
    totalPopulationAtRisk: 18420,
    totalVulnerablePopulation: 5280,
    activeHazardZonesCount: 12,
    criticalZonesCount: 4,
    reliefCentresCount: 18,
    availableShelterCapacity: 12640,
    totalShelterCapacity: 21500,
    totalShelterOccupancy: 8860,
    vulnerabilityDistribution: [
      { category: "Elderly (>65 yrs)", count: 1870, percentage: 35.4 },
      { category: "Children (<12 yrs)", count: 2110, percentage: 40 },
      { category: "Persons with Disabilities", count: 530, percentage: 10 },
      { category: "High-Density / Inaccessible Households", count: 770, percentage: 14.6 }
    ]
  },
  analytics: {
    riskDistributionData: [
      { name: "Critical (P1)", zones: 4, population: 9500, vulnerable: 3570, color: "#ef4444" },
      { name: "High Risk (P2)", zones: 3, population: 4300, vulnerable: 980, color: "#f97316" },
      { name: "Moderate (P3)", zones: 3, population: 3120, vulnerable: 580, color: "#eab308" },
      { name: "Safe / Low (P4)", zones: 2, population: 1500, vulnerable: 150, color: "#22c55e" }
    ],
    riskTrendData: [
      { time: "14:00", avgRiskScore: 42, floodLevelMeters: 1.1, evacuatedCount: 0 },
      { time: "15:00", avgRiskScore: 48, floodLevelMeters: 1.4, evacuatedCount: 150 },
      { time: "16:00", avgRiskScore: 59, floodLevelMeters: 1.9, evacuatedCount: 620 },
      { time: "17:00", avgRiskScore: 73, floodLevelMeters: 2.5, evacuatedCount: 1840 },
      { time: "18:00", avgRiskScore: 84, floodLevelMeters: 3.1, evacuatedCount: 3200 },
      { time: "19:00", avgRiskScore: 91, floodLevelMeters: 3.4, evacuatedCount: 4680 },
      { time: "19:30 (Current)", avgRiskScore: 94, floodLevelMeters: 3.4, evacuatedCount: 5280 }
    ],
    zoneComparisonData: [
      { zone: "Village A", riskScore: 94, popExposure: 82, hazardScore: 95, accessScore: 71, vulnerable: 680 },
      { zone: "Village B", riskScore: 87, popExposure: 86, hazardScore: 88, accessScore: 62, vulnerable: 890 },
      { zone: "Village F", riskScore: 82, popExposure: 80, hazardScore: 84, accessScore: 59, vulnerable: 2e3 },
      { zone: "Village C", riskScore: 71, popExposure: 68, hazardScore: 74, accessScore: 78, vulnerable: 420 },
      { zone: "Village D", riskScore: 56, popExposure: 58, hazardScore: 54, accessScore: 85, vulnerable: 580 },
      { zone: "Village E", riskScore: 32, popExposure: 35, hazardScore: 28, accessScore: 94, vulnerable: 710 }
    ],
    shelterUtilizationData: [
      { name: "RC #03 (North Hill)", capacity: 2500, occupancy: 1820, available: 680, occupancyRate: 72.8, status: "AVAILABLE" },
      { name: "RC #01 (Sports Stadium)", capacity: 3800, occupancy: 3450, available: 350, occupancyRate: 90.8, status: "NEAR_CAPACITY" },
      { name: "RC #02 (Polytechnic)", capacity: 1800, occupancy: 1650, available: 150, occupancyRate: 91.6, status: "NEAR_CAPACITY" },
      { name: "RC #04 (Univ Auditorium)", capacity: 2200, occupancy: 950, available: 1250, occupancyRate: 43.1, status: "AVAILABLE" },
      { name: "RC #05 (Municipal Hall)", capacity: 1200, occupancy: 1200, available: 0, occupancyRate: 100, status: "FULL" },
      { name: "RC #06 (Industrial Hub)", capacity: 3e3, occupancy: 1100, available: 1900, occupancyRate: 36.6, status: "AVAILABLE" }
    ],
    evacuationProgressData: [
      { segment: "Village A Priority (P1)", target: 680, evacuated: 510, inTransit: 170, remaining: 0 },
      { segment: "Village B Priority (P1)", target: 890, evacuated: 480, inTransit: 220, remaining: 190 },
      { segment: "Village F Sector (P1)", target: 2e3, evacuated: 920, inTransit: 340, remaining: 740 },
      { segment: "Village C Polder (P2)", target: 420, evacuated: 310, inTransit: 60, remaining: 50 }
    ]
  }
};

// src/data/scenarios/earthquake.ts
var earthquakeScenario = {
  meta: {
    id: "earthquake-gujarat",
    name: "Seismic Event \u2014 Gujarat Kutch",
    disasterType: "EARTHQUAKE",
    category: "Mw 7.7",
    region: "Kutch District",
    state: "Gujarat",
    riverBasinOrFault: "Kutch Mainland Fault Zone",
    lastUpdated: "06:48:22 UTC+5:30",
    criticalZonesCount: 3,
    totalHazardZones: 10,
    totalReliefCentres: 15,
    totalPopulationAtRisk: 15e3,
    totalVulnerablePopulation: 4200,
    availableShelterCapacity: 5600,
    totalShelterCapacity: 18e3,
    totalShelterOccupancy: 12400,
    hazardIcon: "Mountain",
    hazardColor: "orange"
  },
  riskZones: [
    {
      id: "zone-ward-a",
      name: "Ward A (Old Town Bhuj)",
      code: "EQ-01-A",
      district: "Kutch District",
      riverBasin: "Kutch Mainland Fault Zone",
      riskScore: 96,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 3800,
      vulnerablePopulation: 1120,
      exposureLevel: "Extreme",
      floodDepthEstMeters: 0,
      waterLevelTrend: "STABLE",
      recommendedAction: "IMMEDIATE SEARCH & RESCUE",
      coordinates: { lat: 23.242, lng: 69.669 },
      polygon: [
        [23.25, 69.655],
        [23.255, 69.68],
        [23.235, 69.685],
        [23.23, 69.66]
      ],
      vulnerabilityBreakdown: {
        elderly: 380,
        children: 490,
        pwd: 120,
        highDensityHouseholds: 130,
        accessibilityScore: 28,
        shelterAvailabilityScore: 45,
        hazardExposureScore: 98,
        populationExposureScore: 92
      },
      reasoning: "Old Town Bhuj contains dense unreinforced masonry structures dating pre-1950. Seismic intensity IX on MMI scale. Multiple structural collapses reported; 1120 vulnerable residents require immediate extraction.",
      lastAssessed: "06:45:00 UTC+5:30"
    },
    {
      id: "zone-ward-b",
      name: "Ward B (Anjar Township)",
      code: "EQ-02-B",
      district: "Kutch District",
      riverBasin: "Kutch Mainland Fault Zone",
      riskScore: 91,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 3200,
      vulnerablePopulation: 940,
      exposureLevel: "Extreme",
      floodDepthEstMeters: 0,
      waterLevelTrend: "STABLE",
      recommendedAction: "IMMEDIATE SEARCH & RESCUE",
      coordinates: { lat: 23.264, lng: 70.027 },
      polygon: [
        [23.272, 70.012],
        [23.278, 70.04],
        [23.256, 70.045],
        [23.25, 70.018]
      ],
      vulnerabilityBreakdown: {
        elderly: 310,
        children: 420,
        pwd: 105,
        highDensityHouseholds: 105,
        accessibilityScore: 32,
        shelterAvailabilityScore: 50,
        hazardExposureScore: 94,
        populationExposureScore: 88
      },
      reasoning: "Anjar Township suffered near-total destruction of older residential blocks. Proximity to epicentre results in MMI intensity VIII-IX. Rescue teams deployed to collapsed market area.",
      lastAssessed: "06:42:00 UTC+5:30"
    },
    {
      id: "zone-ward-c",
      name: "Ward C (Rapar Block)",
      code: "EQ-03-C",
      district: "Kutch District",
      riverBasin: "Kutch Mainland Fault Zone",
      riskScore: 84,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 2600,
      vulnerablePopulation: 720,
      exposureLevel: "Very High",
      floodDepthEstMeters: 0,
      waterLevelTrend: "STABLE",
      recommendedAction: "STRUCTURAL ASSESSMENT & EVACUATION",
      coordinates: { lat: 23.573, lng: 70.111 },
      polygon: [
        [23.582, 70.095],
        [23.588, 70.125],
        [23.565, 70.13],
        [23.56, 70.1]
      ],
      vulnerabilityBreakdown: {
        elderly: 240,
        children: 310,
        pwd: 85,
        highDensityHouseholds: 85,
        accessibilityScore: 45,
        shelterAvailabilityScore: 55,
        hazardExposureScore: 85,
        populationExposureScore: 78
      },
      reasoning: "Rapar Block experienced significant ground cracking and partial building collapses. Rural mud-brick housing stock highly vulnerable. Access roads partially obstructed by debris.",
      lastAssessed: "06:38:00 UTC+5:30"
    },
    {
      id: "zone-ward-d",
      name: "Ward D (Mundra Port Zone)",
      code: "EQ-04-D",
      district: "Kutch District",
      riverBasin: "Kutch Mainland Fault Zone",
      riskScore: 68,
      riskLevel: "HIGH",
      priority: "P2",
      population: 2200,
      vulnerablePopulation: 580,
      exposureLevel: "High",
      floodDepthEstMeters: 0,
      waterLevelTrend: "STABLE",
      recommendedAction: "EVACUATION FROM DAMAGED STRUCTURES",
      coordinates: { lat: 22.839, lng: 69.725 },
      polygon: [
        [22.848, 69.71],
        [22.852, 69.738],
        [22.83, 69.742],
        [22.826, 69.715]
      ],
      vulnerabilityBreakdown: {
        elderly: 190,
        children: 250,
        pwd: 70,
        highDensityHouseholds: 70,
        accessibilityScore: 58,
        shelterAvailabilityScore: 62,
        hazardExposureScore: 70,
        populationExposureScore: 65
      },
      reasoning: "Port infrastructure sustained moderate damage. Industrial storage facilities at risk of secondary hazards (chemical spill, fire). Workers in temporary housing require relocation.",
      lastAssessed: "06:35:00 UTC+5:30"
    },
    {
      id: "zone-ward-e",
      name: "Ward E (Gandhidham Industrial)",
      code: "EQ-05-E",
      district: "Kutch District",
      riverBasin: "Kutch Mainland Fault Zone",
      riskScore: 55,
      riskLevel: "MODERATE",
      priority: "P3",
      population: 1800,
      vulnerablePopulation: 480,
      exposureLevel: "Moderate",
      floodDepthEstMeters: 0,
      waterLevelTrend: "STABLE",
      recommendedAction: "SHELTER IN PLACE \u2014 AWAIT STRUCTURAL CLEARANCE",
      coordinates: { lat: 23.075, lng: 70.133 },
      polygon: [
        [23.084, 70.118],
        [23.088, 70.148],
        [23.066, 70.152],
        [23.062, 70.122]
      ],
      vulnerabilityBreakdown: {
        elderly: 160,
        children: 200,
        pwd: 60,
        highDensityHouseholds: 60,
        accessibilityScore: 65,
        shelterAvailabilityScore: 70,
        hazardExposureScore: 58,
        populationExposureScore: 55
      },
      reasoning: "Modern industrial structures performed better under seismic load. Damage concentrated in older residential periphery. Utility disruptions (water, gas) require monitoring.",
      lastAssessed: "06:32:00 UTC+5:30"
    },
    {
      id: "zone-ward-f",
      name: "Ward F (Nakhatrana Taluka)",
      code: "EQ-06-F",
      district: "Kutch District",
      riverBasin: "Kutch Mainland Fault Zone",
      riskScore: 42,
      riskLevel: "MODERATE",
      priority: "P3",
      population: 1400,
      vulnerablePopulation: 360,
      exposureLevel: "Low",
      floodDepthEstMeters: 0,
      waterLevelTrend: "STABLE",
      recommendedAction: "MONITOR & ASSESS \u2014 NO IMMEDIATE EVACUATION",
      coordinates: { lat: 23.345, lng: 69.27 },
      polygon: [
        [23.354, 69.255],
        [23.358, 69.285],
        [23.336, 69.29],
        [23.332, 69.26]
      ],
      vulnerabilityBreakdown: {
        elderly: 120,
        children: 155,
        pwd: 45,
        highDensityHouseholds: 40,
        accessibilityScore: 72,
        shelterAvailabilityScore: 78,
        hazardExposureScore: 44,
        populationExposureScore: 42
      },
      reasoning: "Nakhatrana lies further from the epicentre with lower MMI intensity (VI). Predominantly single-storey structures with moderate damage. Local resources adequate for initial response.",
      lastAssessed: "06:28:00 UTC+5:30"
    }
  ],
  reliefCentres: [
    {
      id: "shelter-eq-01",
      name: "Relief Centre #01 (Bhuj Jubilee Ground)",
      code: "RC-EQ-01",
      location: "Jubilee Circle, Bhuj, Kutch District",
      coordinates: { lat: 23.252, lng: 69.672 },
      capacity: 4e3,
      occupancy: 3200,
      available: 800,
      status: "NEAR_CAPACITY",
      distanceKm: 1.2,
      travelTimeMin: 8,
      elevationMeters: 110,
      safetyScore: 88,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 5,
        cleanWaterLiters: 5e4,
        backupPower: true,
        sanitationBlocks: 40,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Collector D.K. Patel",
        designation: "District Disaster Management Officer",
        phone: "+91 94265-10001",
        channel: "VHF Ch-03 (Kutch Emergency Net)"
      }
    },
    {
      id: "shelter-eq-02",
      name: "Relief Centre #02 (Anjar Community Hall)",
      code: "RC-EQ-02",
      location: "Main Road, Anjar, Kutch District",
      coordinates: { lat: 23.27, lng: 70.035 },
      capacity: 2800,
      occupancy: 2100,
      available: 700,
      status: "AVAILABLE",
      distanceKm: 2.5,
      travelTimeMin: 14,
      elevationMeters: 95,
      safetyScore: 85,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 4,
        cleanWaterLiters: 35e3,
        backupPower: true,
        sanitationBlocks: 28,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "SDM Priya Mehta",
        designation: "Sub-Divisional Magistrate, Anjar",
        phone: "+91 94265-10002",
        channel: "VHF Ch-05"
      }
    },
    {
      id: "shelter-eq-03",
      name: "Relief Centre #03 (Rapar High School Campus)",
      code: "RC-EQ-03",
      location: "Station Road, Rapar, Kutch District",
      coordinates: { lat: 23.58, lng: 70.118 },
      capacity: 2200,
      occupancy: 1500,
      available: 700,
      status: "AVAILABLE",
      distanceKm: 3.8,
      travelTimeMin: 20,
      elevationMeters: 80,
      safetyScore: 82,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 6,
        cleanWaterLiters: 28e3,
        backupPower: false,
        sanitationBlocks: 22,
        wheelchairAccessible: false
      },
      contactOfficer: {
        name: "BDO Karan Joshi",
        designation: "Block Development Officer, Rapar",
        phone: "+91 94265-10003",
        channel: "VHF Ch-07"
      }
    },
    {
      id: "shelter-eq-04",
      name: "Relief Centre #04 (Mundra Civic Centre)",
      code: "RC-EQ-04",
      location: "Port Road, Mundra, Kutch District",
      coordinates: { lat: 22.845, lng: 69.73 },
      capacity: 3200,
      occupancy: 2400,
      available: 800,
      status: "AVAILABLE",
      distanceKm: 5.1,
      travelTimeMin: 25,
      elevationMeters: 15,
      safetyScore: 79,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 4,
        cleanWaterLiters: 4e4,
        backupPower: true,
        sanitationBlocks: 30,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Capt. Vijay Rathod",
        designation: "Port Emergency Coordinator",
        phone: "+91 94265-10004",
        channel: "VHF Ch-09"
      }
    },
    {
      id: "shelter-eq-05",
      name: "Relief Centre #05 (Gandhidham Railway Colony Hall)",
      code: "RC-EQ-05",
      location: "Sector 12, Gandhidham, Kutch District",
      coordinates: { lat: 23.08, lng: 70.14 },
      capacity: 3e3,
      occupancy: 1800,
      available: 1200,
      status: "AVAILABLE",
      distanceKm: 6.3,
      travelTimeMin: 28,
      elevationMeters: 55,
      safetyScore: 90,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 7,
        cleanWaterLiters: 55e3,
        backupPower: true,
        sanitationBlocks: 35,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Dr. Neha Solanki",
        designation: "Railway Medical Officer",
        phone: "+91 94265-10005",
        channel: "VHF Ch-06"
      }
    },
    {
      id: "shelter-eq-06",
      name: "Relief Centre #06 (Nakhatrana Panchayat Grounds)",
      code: "RC-EQ-06",
      location: "Taluka Road, Nakhatrana, Kutch District",
      coordinates: { lat: 23.35, lng: 69.275 },
      capacity: 2800,
      occupancy: 1400,
      available: 1400,
      status: "AVAILABLE",
      distanceKm: 7.5,
      travelTimeMin: 35,
      elevationMeters: 70,
      safetyScore: 84,
      facilities: {
        medicalUnit: false,
        foodRationsDays: 5,
        cleanWaterLiters: 22e3,
        backupPower: false,
        sanitationBlocks: 18,
        wheelchairAccessible: false
      },
      contactOfficer: {
        name: "Talati A.M. Bhatt",
        designation: "Taluka Emergency Officer",
        phone: "+91 94265-10006",
        channel: "VHF Ch-11"
      }
    }
  ],
  evacuationRoutes: [
    {
      id: "evac-eq-01",
      originId: "zone-ward-a",
      originName: "Ward A (Old Town Bhuj)",
      destinationId: "shelter-eq-01",
      destinationName: "Relief Centre #01 (Bhuj Jubilee Ground)",
      distanceKm: 1.8,
      estimatedTimeMin: 12,
      safetyScore: 72,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 110,
      coordinates: [
        [23.242, 69.669],
        [23.245, 69.67],
        [23.248, 69.671],
        [23.252, 69.672]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Exit via open ground corridor behind Ward A market. Avoid all multi-storey structures.",
          distance: "400m",
          roadCondition: "CONGESTED"
        },
        {
          step: 2,
          instruction: "Proceed north along cleared section of Station Road. Watch for overhead debris from damaged facades.",
          distance: "600m",
          roadCondition: "CLEAR"
        },
        {
          step: 3,
          instruction: "Turn east at Collector Office junction. Follow NDRF guide markers to Jubilee Ground entrance.",
          distance: "500m",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Enter Jubilee Ground through Gate 2 (wheelchair-accessible ramp). Report to triage station.",
          distance: "300m",
          roadCondition: "CLEAR"
        }
      ],
      isRecommended: true
    },
    {
      id: "evac-eq-02",
      originId: "zone-ward-b",
      originName: "Ward B (Anjar Township)",
      destinationId: "shelter-eq-02",
      destinationName: "Relief Centre #02 (Anjar Community Hall)",
      distanceKm: 3.2,
      estimatedTimeMin: 22,
      safetyScore: 65,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 95,
      coordinates: [
        [23.264, 70.027],
        [23.266, 70.03],
        [23.268, 70.032],
        [23.27, 70.035]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Assemble at Anjar Bus Stand open lot. Avoid narrow lanes with collapsed boundary walls.",
          distance: "800m",
          roadCondition: "CONGESTED"
        },
        {
          step: 2,
          instruction: "Follow Main Road westward. Debris cleared by SDRF bulldozer unit. Stay on road centre.",
          distance: "1.2km",
          roadCondition: "CLEAR"
        },
        {
          step: 3,
          instruction: "Cross railway overpass (structurally assessed SAFE by PWD). Do not stop on bridge deck.",
          distance: "700m",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Turn right into Community Hall compound. Medical triage at south entrance.",
          distance: "500m",
          roadCondition: "CLEAR"
        }
      ],
      isRecommended: false
    },
    {
      id: "evac-eq-03",
      originId: "zone-ward-c",
      originName: "Ward C (Rapar Block)",
      destinationId: "shelter-eq-03",
      destinationName: "Relief Centre #03 (Rapar High School Campus)",
      distanceKm: 4.5,
      estimatedTimeMin: 30,
      safetyScore: 70,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 80,
      coordinates: [
        [23.573, 70.111],
        [23.575, 70.113],
        [23.578, 70.115],
        [23.58, 70.118]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Move to open agricultural field east of Rapar village. Do not re-enter damaged mud-brick houses.",
          distance: "600m",
          roadCondition: "CLEAR"
        },
        {
          step: 2,
          instruction: "Proceed along Rapar-Bhachau highway shoulder. Ground fissures reported; follow flagged safe path.",
          distance: "2.0km",
          roadCondition: "CONGESTED"
        },
        {
          step: 3,
          instruction: "Turn south at Rapar Chowk. Avoid leaning electricity poles on the eastern side of the road.",
          distance: "1.2km",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Enter High School Campus via main gate. Registration desk in the playground area.",
          distance: "700m",
          roadCondition: "CLEAR"
        }
      ],
      isRecommended: false
    }
  ],
  blockedRoads: [
    {
      id: "block-eq-01",
      name: "Old Town Inner Road (Bhuj)",
      reason: "Structural collapse of multi-storey residential building. Rubble blocking both lanes. Heavy rescue machinery required.",
      coordinates: [
        [23.244, 69.665],
        [23.246, 69.67]
      ],
      severity: "TOTAL_BLOCKAGE",
      reportedAt: "06:15:00 UTC+5:30"
    },
    {
      id: "block-eq-02",
      name: "Anjar Market Road",
      reason: "Debris field from collapsed commercial structures. Partial clearance underway by SDRF unit. Single-lane passage expected by 10:00 UTC+5:30.",
      coordinates: [
        [23.262, 70.022],
        [23.265, 70.028]
      ],
      severity: "TOTAL_BLOCKAGE",
      reportedAt: "06:22:00 UTC+5:30"
    },
    {
      id: "block-eq-03",
      name: "Surajbari Bridge (NH-8A)",
      reason: "Bridge under structural assessment after visible cracking in pier columns. Vehicular traffic suspended pending PWD clearance.",
      coordinates: [
        [23.11, 70.202],
        [23.115, 70.21]
      ],
      severity: "LANDSLIDE_RISK",
      reportedAt: "06:30:00 UTC+5:30"
    }
  ],
  roadNetworks: [
    {
      id: "road-eq-01",
      name: "NH-8A (Bhuj - Ahmedabad Highway)",
      type: "HIGHWAY",
      status: "CAUTION",
      coordinates: [
        [23.242, 69.669],
        [23.2, 69.8],
        [23.15, 70]
      ],
      speedLimitKmh: 40,
      lanes: 4,
      elevationMeters: 90
    },
    {
      id: "road-eq-02",
      name: "SH-42 (Bhuj - Mundra Road)",
      type: "ARTERIAL",
      status: "CAUTION",
      coordinates: [
        [23.242, 69.669],
        [23.1, 69.7],
        [22.839, 69.725]
      ],
      speedLimitKmh: 30,
      lanes: 2,
      elevationMeters: 60
    },
    {
      id: "road-eq-03",
      name: "Bhuj Inner Ring Road",
      type: "ARTERIAL",
      status: "RESTRICTED",
      coordinates: [
        [23.235, 69.66],
        [23.248, 69.655],
        [23.255, 69.67],
        [23.248, 69.685],
        [23.235, 69.68]
      ],
      speedLimitKmh: 20,
      lanes: 2,
      elevationMeters: 105
    },
    {
      id: "road-eq-04",
      name: "Gandhidham - Anjar Link Road",
      type: "SECONDARY",
      status: "CLEAR",
      coordinates: [
        [23.075, 70.133],
        [23.15, 70.08],
        [23.264, 70.027]
      ],
      speedLimitKmh: 50,
      lanes: 2,
      elevationMeters: 75
    },
    {
      id: "road-eq-05",
      name: "Rapar - Bhachau State Road",
      type: "SECONDARY",
      status: "CAUTION",
      coordinates: [
        [23.573, 70.111],
        [23.5, 70.15],
        [23.42, 70.2]
      ],
      speedLimitKmh: 35,
      lanes: 2,
      elevationMeters: 70
    },
    {
      id: "road-eq-06",
      name: "Nakhatrana - Bhuj District Road",
      type: "LOCAL",
      status: "CLEAR",
      coordinates: [
        [23.345, 69.27],
        [23.31, 69.4],
        [23.26, 69.58],
        [23.242, 69.669]
      ],
      speedLimitKmh: 45,
      lanes: 2,
      elevationMeters: 85
    }
  ],
  alerts: [
    {
      id: "alert-eq-01",
      title: "Aftershock Warning \u2014 Mw 5.2 Expected",
      message: "India Meteorological Department (IMD) seismology division warns of possible aftershock Mw 5.0\u20135.5 within 6 hours of mainshock. All rescue teams advised to maintain safe egress routes. Occupants in structurally compromised buildings must evacuate immediately.",
      severity: "CRITICAL",
      timestamp: "06:50:00 UTC+5:30",
      zoneId: "zone-ward-a",
      read: false
    },
    {
      id: "alert-eq-02",
      title: "Structural Collapse \u2014 Anjar Market Sector",
      message: "Three-storey commercial complex on Anjar Market Road has pancake-collapsed. NDRF Team 06 deployed with canine unit and acoustic sensors. Estimated 40\u201360 persons trapped. Blood bank and trauma unit on standby at Anjar Community Hall.",
      severity: "CRITICAL",
      timestamp: "06:35:00 UTC+5:30",
      zoneId: "zone-ward-b",
      read: false
    },
    {
      id: "alert-eq-03",
      title: "Gas Pipeline Rupture \u2014 Gandhidham Industrial",
      message: "GAIL pipeline feeding Gandhidham industrial sector reported pressure drop indicating possible rupture. Isolation valve closed remotely. 500m exclusion zone enforced around Ward E perimeter. Fire tenders pre-positioned.",
      severity: "WARNING",
      timestamp: "06:40:00 UTC+5:30",
      zoneId: "zone-ward-e",
      read: false
    },
    {
      id: "alert-eq-04",
      title: "NDRF & Army Deployment \u2014 Column En Route",
      message: "NDRF Battalions 06 and 12 (Gandhinagar) plus Indian Army 11 Infantry Division column dispatched from Bhuj Cantonment. ETA at forward staging area: 08:30 UTC+5:30. Helicopter reconnaissance by IAF Mi-17 underway over Kutch Mainland Fault trace.",
      severity: "INFO",
      timestamp: "06:48:00 UTC+5:30",
      read: false
    }
  ],
  demographics: {
    totalPopulationAtRisk: 15e3,
    totalVulnerablePopulation: 4200,
    activeHazardZonesCount: 10,
    criticalZonesCount: 3,
    reliefCentresCount: 15,
    availableShelterCapacity: 5600,
    totalShelterCapacity: 18e3,
    totalShelterOccupancy: 12400,
    vulnerabilityDistribution: [
      { category: "Elderly (60+)", count: 1400, percentage: 33.3 },
      { category: "Children (0-14)", count: 1825, percentage: 43.5 },
      { category: "Persons with Disabilities", count: 485, percentage: 11.5 },
      { category: "High-Density Households", count: 490, percentage: 11.7 }
    ]
  },
  analytics: {
    riskDistributionData: [
      { name: "Extreme (MMI IX)", zones: 2, population: 7e3, vulnerable: 2060, color: "#dc2626" },
      { name: "Very High (MMI VIII)", zones: 1, population: 2600, vulnerable: 720, color: "#ea580c" },
      { name: "High (MMI VII)", zones: 1, population: 2200, vulnerable: 580, color: "#f59e0b" },
      { name: "Moderate (MMI VI)", zones: 2, population: 3200, vulnerable: 840, color: "#16a34a" }
    ],
    riskTrendData: [
      { time: "06:00", avgRiskScore: 45, floodLevelMeters: 7.7, evacuatedCount: 0 },
      { time: "06:10", avgRiskScore: 82, floodLevelMeters: 5.2, evacuatedCount: 200 },
      { time: "06:20", avgRiskScore: 88, floodLevelMeters: 4.8, evacuatedCount: 1200 },
      { time: "06:30", avgRiskScore: 91, floodLevelMeters: 3.5, evacuatedCount: 3400 },
      { time: "06:40", avgRiskScore: 85, floodLevelMeters: 2.9, evacuatedCount: 5800 },
      { time: "06:50", avgRiskScore: 78, floodLevelMeters: 5.1, evacuatedCount: 8200 }
    ],
    zoneComparisonData: [
      { zone: "Ward A", riskScore: 96, popExposure: 92, hazardScore: 98, accessScore: 28, vulnerable: 1120 },
      { zone: "Ward B", riskScore: 91, popExposure: 88, hazardScore: 94, accessScore: 32, vulnerable: 940 },
      { zone: "Ward C", riskScore: 84, popExposure: 78, hazardScore: 85, accessScore: 45, vulnerable: 720 },
      { zone: "Ward D", riskScore: 68, popExposure: 65, hazardScore: 70, accessScore: 58, vulnerable: 580 },
      { zone: "Ward E", riskScore: 55, popExposure: 55, hazardScore: 58, accessScore: 65, vulnerable: 480 },
      { zone: "Ward F", riskScore: 42, popExposure: 42, hazardScore: 44, accessScore: 72, vulnerable: 360 }
    ],
    shelterUtilizationData: [
      { name: "Bhuj Jubilee Ground", capacity: 4e3, occupancy: 3200, available: 800, occupancyRate: 80, status: "NEAR_CAPACITY" },
      { name: "Anjar Community Hall", capacity: 2800, occupancy: 2100, available: 700, occupancyRate: 75, status: "AVAILABLE" },
      { name: "Rapar High School", capacity: 2200, occupancy: 1500, available: 700, occupancyRate: 68, status: "AVAILABLE" },
      { name: "Mundra Civic Centre", capacity: 3200, occupancy: 2400, available: 800, occupancyRate: 75, status: "AVAILABLE" },
      { name: "Gandhidham Railway Hall", capacity: 3e3, occupancy: 1800, available: 1200, occupancyRate: 60, status: "AVAILABLE" },
      { name: "Nakhatrana Panchayat", capacity: 2800, occupancy: 1400, available: 1400, occupancyRate: 50, status: "AVAILABLE" }
    ],
    evacuationProgressData: [
      { segment: "Ward A \u2192 Jubilee Ground", target: 3800, evacuated: 2600, inTransit: 450, remaining: 750 },
      { segment: "Ward B \u2192 Anjar Hall", target: 3200, evacuated: 2100, inTransit: 380, remaining: 720 },
      { segment: "Ward C \u2192 Rapar School", target: 2600, evacuated: 1500, inTransit: 320, remaining: 780 },
      { segment: "Ward D \u2192 Mundra Centre", target: 2200, evacuated: 1200, inTransit: 280, remaining: 720 },
      { segment: "Ward E \u2192 Gandhidham Hall", target: 1800, evacuated: 800, inTransit: 200, remaining: 800 }
    ]
  }
};

// src/data/scenarios/cyclone.ts
var cycloneScenario = {
  meta: {
    id: "cyclone-odisha",
    name: "Super Cyclone \u2014 Odisha Coast",
    disasterType: "CYCLONE",
    category: "Cat-5 Super",
    region: "Puri-Ganjam Coastal Belt",
    state: "Odisha",
    riverBasinOrFault: "Bay of Bengal Cyclogenesis Zone",
    lastUpdated: "04:15:30 UTC+5:30",
    criticalZonesCount: 3,
    totalHazardZones: 11,
    totalReliefCentres: 16,
    totalPopulationAtRisk: 22400,
    totalVulnerablePopulation: 6820,
    availableShelterCapacity: 8600,
    totalShelterCapacity: 25e3,
    totalShelterOccupancy: 16400,
    hazardIcon: "Wind",
    hazardColor: "purple"
  },
  riskZones: [
    {
      id: "rz-cyc-01",
      name: "Sector A (Puri Beach Front)",
      code: "CYC-A",
      district: "Puri",
      riverBasin: "Bay of Bengal Coast",
      riskScore: 97,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 5200,
      vulnerablePopulation: 1650,
      exposureLevel: "Extreme",
      floodDepthEstMeters: 4.8,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE COASTAL EVACUATION \u2014 Cat-5 storm surge imminent. All residents must move to inland cyclone shelters immediately.",
      coordinates: { lat: 19.798, lng: 85.8245 },
      polygon: [
        [19.805, 85.81],
        [19.805, 85.84],
        [19.79, 85.84],
        [19.79, 85.81]
      ],
      vulnerabilityBreakdown: {
        elderly: 410,
        children: 720,
        pwd: 120,
        highDensityHouseholds: 400,
        accessibilityScore: 25,
        shelterAvailabilityScore: 40,
        hazardExposureScore: 98,
        populationExposureScore: 92
      },
      reasoning: "Puri Beach Front faces direct landfall trajectory. Extremely low elevation (<3m ASL) with dense tourist and residential infrastructure. Storm surge of 4\u20135m expected. Immediate full evacuation required.",
      lastAssessed: "2024-10-24T03:45:00Z"
    },
    {
      id: "rz-cyc-02",
      name: "Sector B (Konark Coastal Strip)",
      code: "CYC-B",
      district: "Puri",
      riverBasin: "Bay of Bengal Coast",
      riskScore: 92,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 3800,
      vulnerablePopulation: 1180,
      exposureLevel: "Extreme",
      floodDepthEstMeters: 4.2,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE COASTAL EVACUATION \u2014 Storm surge 4m+ forecast. Heritage zone and settlements must evacuate to NH-316 corridor shelters.",
      coordinates: { lat: 19.887, lng: 86.095 },
      polygon: [
        [19.9, 86.08],
        [19.9, 86.11],
        [19.874, 86.11],
        [19.874, 86.08]
      ],
      vulnerabilityBreakdown: {
        elderly: 290,
        children: 510,
        pwd: 85,
        highDensityHouseholds: 295,
        accessibilityScore: 30,
        shelterAvailabilityScore: 35,
        hazardExposureScore: 95,
        populationExposureScore: 88
      },
      reasoning: "Konark coastal strip is low-lying with limited road egress. Large fishing community with kutcha structures highly vulnerable to Cat-5 winds (>250 km/h). Storm surge inundation expected up to 2 km inland.",
      lastAssessed: "2024-10-24T03:50:00Z"
    },
    {
      id: "rz-cyc-03",
      name: "Sector C (Chilika Lake Shore)",
      code: "CYC-C",
      district: "Puri",
      riverBasin: "Chilika Lagoon Basin",
      riskScore: 88,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 4100,
      vulnerablePopulation: 1350,
      exposureLevel: "Very High",
      floodDepthEstMeters: 3.5,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "MOVE TO CYCLONE SHELTERS \u2014 Chilika water level rising rapidly due to storm surge backflow. Lakeshore settlements at severe flood risk.",
      coordinates: { lat: 19.725, lng: 85.42 },
      polygon: [
        [19.74, 85.405],
        [19.74, 85.435],
        [19.71, 85.435],
        [19.71, 85.405]
      ],
      vulnerabilityBreakdown: {
        elderly: 380,
        children: 560,
        pwd: 95,
        highDensityHouseholds: 315,
        accessibilityScore: 28,
        shelterAvailabilityScore: 45,
        hazardExposureScore: 90,
        populationExposureScore: 85
      },
      reasoning: "Chilika Lake shore communities face dual threat: direct wind damage and storm surge backflow through the lagoon mouth. Fishing hamlets on islands and narrow spits are cut off during high winds.",
      lastAssessed: "2024-10-24T03:55:00Z"
    },
    {
      id: "rz-cyc-04",
      name: "Sector D (Brahmagiri Block)",
      code: "CYC-D",
      district: "Puri",
      riverBasin: "Daya River Basin",
      riskScore: 74,
      riskLevel: "HIGH",
      priority: "P2",
      population: 3600,
      vulnerablePopulation: 1020,
      exposureLevel: "High",
      floodDepthEstMeters: 2.4,
      waterLevelTrend: "RISING_SLOW",
      recommendedAction: "STORM SURGE WARNING \u2014 Prepare for evacuation. Secure loose objects, board up windows, stock emergency supplies. Move to shelters if water approaches.",
      coordinates: { lat: 19.81, lng: 85.63 },
      polygon: [
        [19.825, 85.615],
        [19.825, 85.645],
        [19.795, 85.645],
        [19.795, 85.615]
      ],
      vulnerabilityBreakdown: {
        elderly: 250,
        children: 430,
        pwd: 70,
        highDensityHouseholds: 270,
        accessibilityScore: 45,
        shelterAvailabilityScore: 55,
        hazardExposureScore: 78,
        populationExposureScore: 72
      },
      reasoning: "Brahmagiri Block is 8\u201312 km inland but low-lying terrain along the Daya River makes it susceptible to combined storm surge and river flooding. Partially sheltered from direct wind by tree cover.",
      lastAssessed: "2024-10-24T04:00:00Z"
    },
    {
      id: "rz-cyc-05",
      name: "Sector E (Ganjam Harbor Zone)",
      code: "CYC-E",
      district: "Ganjam",
      riverBasin: "Bay of Bengal Coast",
      riskScore: 82,
      riskLevel: "HIGH",
      priority: "P2",
      population: 3200,
      vulnerablePopulation: 940,
      exposureLevel: "Very High",
      floodDepthEstMeters: 3.8,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE COASTAL EVACUATION \u2014 Harbor infrastructure at extreme risk. Fishing vessels must be secured or moved upstream. All harbor personnel evacuate inland.",
      coordinates: { lat: 19.355, lng: 85.07 },
      polygon: [
        [19.37, 85.055],
        [19.37, 85.085],
        [19.34, 85.085],
        [19.34, 85.055]
      ],
      vulnerabilityBreakdown: {
        elderly: 220,
        children: 380,
        pwd: 65,
        highDensityHouseholds: 275,
        accessibilityScore: 35,
        shelterAvailabilityScore: 50,
        hazardExposureScore: 85,
        populationExposureScore: 80
      },
      reasoning: "Ganjam Harbor is directly exposed to storm surge. Dense fishing community with temporary structures. Harbor walls may breach under Cat-5 wave action. Limited inland road capacity for rapid evacuation.",
      lastAssessed: "2024-10-24T04:05:00Z"
    },
    {
      id: "rz-cyc-06",
      name: "Sector F (Satapada Peninsula)",
      code: "CYC-F",
      district: "Puri",
      riverBasin: "Chilika Lagoon Basin",
      riskScore: 79,
      riskLevel: "HIGH",
      priority: "P2",
      population: 2500,
      vulnerablePopulation: 680,
      exposureLevel: "Very High",
      floodDepthEstMeters: 3.2,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "MOVE TO CYCLONE SHELTERS \u2014 Peninsula may become isolated during storm. Pre-emptive evacuation to mainland shelters via Satapada Road before conditions deteriorate.",
      coordinates: { lat: 19.67, lng: 85.45 },
      polygon: [
        [19.685, 85.435],
        [19.685, 85.465],
        [19.655, 85.465],
        [19.655, 85.435]
      ],
      vulnerabilityBreakdown: {
        elderly: 160,
        children: 280,
        pwd: 55,
        highDensityHouseholds: 185,
        accessibilityScore: 20,
        shelterAvailabilityScore: 30,
        hazardExposureScore: 88,
        populationExposureScore: 76
      },
      reasoning: "Satapada Peninsula is a narrow spit between Chilika Lake and the Bay of Bengal. Extremely vulnerable to isolation during cyclone. Single road access may be cut off by storm surge flooding.",
      lastAssessed: "2024-10-24T04:10:00Z"
    }
  ],
  reliefCentres: [
    {
      id: "rc-cyc-01",
      name: "Puri Multipurpose Cyclone Shelter",
      code: "PMCS",
      location: "Penthakata, Puri Town",
      coordinates: { lat: 19.812, lng: 85.831 },
      capacity: 5e3,
      occupancy: 3800,
      available: 1200,
      status: "NEAR_CAPACITY",
      distanceKm: 1.8,
      travelTimeMin: 8,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 5,
        cleanWaterLiters: 25e3,
        backupPower: true,
        sanitationBlocks: 12,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Shri Rajendra Sahoo",
        designation: "District Emergency Officer",
        phone: "+91-6752-223456",
        channel: "VHF Channel 8"
      },
      elevationMeters: 12,
      safetyScore: 92
    },
    {
      id: "rc-cyc-02",
      name: "Konark Community Cyclone Bunker",
      code: "KCCB",
      location: "Chandrabhaga Road, Konark",
      coordinates: { lat: 19.894, lng: 86.087 },
      capacity: 3500,
      occupancy: 2600,
      available: 900,
      status: "NEAR_CAPACITY",
      distanceKm: 3.2,
      travelTimeMin: 15,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 4,
        cleanWaterLiters: 18e3,
        backupPower: true,
        sanitationBlocks: 8,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Smt. Anita Panda",
        designation: "Block Development Officer",
        phone: "+91-6758-236789",
        channel: "VHF Channel 12"
      },
      elevationMeters: 15,
      safetyScore: 88
    },
    {
      id: "rc-cyc-03",
      name: "Brahmagiri District School Shelter",
      code: "BDSS",
      location: "NH-316, Brahmagiri",
      coordinates: { lat: 19.815, lng: 85.638 },
      capacity: 4500,
      occupancy: 3200,
      available: 1300,
      status: "AVAILABLE",
      distanceKm: 5,
      travelTimeMin: 22,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 6,
        cleanWaterLiters: 22e3,
        backupPower: true,
        sanitationBlocks: 10,
        wheelchairAccessible: false
      },
      contactOfficer: {
        name: "Shri Pradeep Mohanty",
        designation: "Shelter-in-Charge",
        phone: "+91-6752-245678",
        channel: "VHF Channel 6"
      },
      elevationMeters: 22,
      safetyScore: 90
    },
    {
      id: "rc-cyc-04",
      name: "Chilika ODRAF Staging Centre",
      code: "COSC",
      location: "Balugaon-Rambha Road, Chilika",
      coordinates: { lat: 19.73, lng: 85.425 },
      capacity: 4e3,
      occupancy: 2800,
      available: 1200,
      status: "AVAILABLE",
      distanceKm: 4.5,
      travelTimeMin: 18,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 5,
        cleanWaterLiters: 2e4,
        backupPower: true,
        sanitationBlocks: 9,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Shri Bikash Das",
        designation: "ODRAF Commander",
        phone: "+91-6756-256789",
        channel: "VHF Channel 10"
      },
      elevationMeters: 18,
      safetyScore: 91
    },
    {
      id: "rc-cyc-05",
      name: "Ganjam Zilla Parishad Cyclone Shelter",
      code: "GZCS",
      location: "Chhatrapur, Ganjam",
      coordinates: { lat: 19.362, lng: 85.075 },
      capacity: 4500,
      occupancy: 2400,
      available: 2100,
      status: "AVAILABLE",
      distanceKm: 6,
      travelTimeMin: 25,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 5,
        cleanWaterLiters: 21e3,
        backupPower: true,
        sanitationBlocks: 10,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Smt. Laxmipriya Nayak",
        designation: "Additional Collector (Disaster)",
        phone: "+91-6811-267890",
        channel: "VHF Channel 14"
      },
      elevationMeters: 25,
      safetyScore: 93
    },
    {
      id: "rc-cyc-06",
      name: "Satapada Elevated Relief Camp",
      code: "SERC",
      location: "Satapada Main Road, Satapada",
      coordinates: { lat: 19.675, lng: 85.455 },
      capacity: 3500,
      occupancy: 1600,
      available: 1900,
      status: "AVAILABLE",
      distanceKm: 2,
      travelTimeMin: 10,
      facilities: {
        medicalUnit: false,
        foodRationsDays: 3,
        cleanWaterLiters: 12e3,
        backupPower: false,
        sanitationBlocks: 5,
        wheelchairAccessible: false
      },
      contactOfficer: {
        name: "Shri Gagan Behera",
        designation: "Gram Panchayat Sarpanch",
        phone: "+91-6758-278901",
        channel: "VHF Channel 9"
      },
      elevationMeters: 10,
      safetyScore: 72
    }
  ],
  evacuationRoutes: [
    {
      id: "er-cyc-01",
      originId: "rz-cyc-01",
      originName: "Sector A (Puri Beach Front)",
      destinationId: "rc-cyc-01",
      destinationName: "Puri Multipurpose Cyclone Shelter",
      distanceKm: 1.8,
      estimatedTimeMin: 8,
      safetyScore: 78,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 9,
      coordinates: [
        [19.798, 85.8245],
        [19.7995, 85.826],
        [19.802, 85.827],
        [19.806, 85.8285],
        [19.809, 85.83],
        [19.812, 85.831]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Move inland from beach front via Grand Road (Bada Danda). Avoid the seafront promenade.",
          distance: "0.5 km",
          roadCondition: "WATERLOGGED_PASSABLE"
        },
        {
          step: 2,
          instruction: "Turn north on Hospital Road. Stay away from low-lying drains and open areas.",
          distance: "0.6 km",
          roadCondition: "CLEAR"
        },
        {
          step: 3,
          instruction: "Continue to Penthakata cyclone shelter via elevated approach road. Follow ODRAF marshals.",
          distance: "0.7 km",
          roadCondition: "CLEAR"
        }
      ],
      isRecommended: true
    },
    {
      id: "er-cyc-02",
      originId: "rz-cyc-02",
      originName: "Sector B (Konark Coastal Strip)",
      destinationId: "rc-cyc-03",
      destinationName: "Brahmagiri District School Shelter",
      distanceKm: 18.5,
      estimatedTimeMin: 40,
      safetyScore: 70,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 18,
      coordinates: [
        [19.887, 86.095],
        [19.885, 86.07],
        [19.88, 86.04],
        [19.86, 85.95],
        [19.84, 85.85],
        [19.83, 85.75],
        [19.82, 85.68],
        [19.815, 85.638]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Head west on Konark-Puri Marine Drive. Do NOT use coastal road \u2014 storm surge risk.",
          distance: "3.0 km",
          roadCondition: "WATERLOGGED_PASSABLE"
        },
        {
          step: 2,
          instruction: "Merge onto NH-316 elevated corridor heading northwest toward Brahmagiri. Use the inland bypass.",
          distance: "10.0 km",
          roadCondition: "CLEAR"
        },
        {
          step: 3,
          instruction: "Exit NH-316 at Brahmagiri junction. Follow signage to District School Cyclone Shelter.",
          distance: "3.5 km",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Arrive at Brahmagiri District School Shelter. Report to registration desk with ID.",
          distance: "2.0 km",
          roadCondition: "CLEAR"
        }
      ],
      isRecommended: false
    },
    {
      id: "er-cyc-03",
      originId: "rz-cyc-05",
      originName: "Sector E (Ganjam Harbor Zone)",
      destinationId: "rc-cyc-05",
      destinationName: "Ganjam Zilla Parishad Cyclone Shelter",
      distanceKm: 6,
      estimatedTimeMin: 25,
      safetyScore: 75,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 20,
      coordinates: [
        [19.355, 85.07],
        [19.356, 85.072],
        [19.358, 85.074],
        [19.36, 85.0745],
        [19.362, 85.075]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Exit harbor area via Main Harbor Road heading inland. Avoid waterfront storage areas \u2014 flying debris hazard.",
          distance: "1.5 km",
          roadCondition: "CONGESTED"
        },
        {
          step: 2,
          instruction: "Turn north on Chhatrapur-Berhampur Road (SH-15). Use elevated sections where available.",
          distance: "3.0 km",
          roadCondition: "WATERLOGGED_PASSABLE"
        },
        {
          step: 3,
          instruction: "Reach Chhatrapur town. Follow cyclone shelter signage to Zilla Parishad building.",
          distance: "1.5 km",
          roadCondition: "CLEAR"
        }
      ],
      isRecommended: false
    }
  ],
  blockedRoads: [
    {
      id: "br-cyc-01",
      name: "Puri Marine Drive (Swargadwar \u2013 Penthakata Stretch)",
      reason: "Storm surge flooding \u2014 2.5m seawater inundation across 1.2 km coastal road section. Road submerged and impassable.",
      coordinates: [
        [19.795, 85.82],
        [19.796, 85.825],
        [19.797, 85.83],
        [19.798, 85.835]
      ],
      severity: "SUBMERGED_UNSAFE",
      reportedAt: "2024-10-24T03:30:00Z"
    },
    {
      id: "br-cyc-02",
      name: "Konark-Puri Coastal Highway (km 12-14)",
      reason: "Uprooted casuarina trees and electricity poles blocking both lanes. High-tension power lines down across road.",
      coordinates: [
        [19.85, 85.96],
        [19.852, 85.97],
        [19.854, 85.98]
      ],
      severity: "TOTAL_BLOCKAGE",
      reportedAt: "2024-10-24T02:45:00Z"
    },
    {
      id: "br-cyc-03",
      name: "Ganjam Harbor Access Road",
      reason: "Power line collapse and transformer explosion. Debris field with electrocution risk. Area cordoned by fire services.",
      coordinates: [
        [19.35, 85.065],
        [19.352, 85.067],
        [19.354, 85.069]
      ],
      severity: "TOTAL_BLOCKAGE",
      reportedAt: "2024-10-24T03:15:00Z"
    }
  ],
  roadNetworks: [
    {
      id: "rn-cyc-01",
      name: "NH-316 (Puri \u2013 Bhubaneswar Highway)",
      type: "HIGHWAY",
      status: "CAUTION",
      coordinates: [
        [19.81, 85.83],
        [19.85, 85.78],
        [19.9, 85.72],
        [19.95, 85.65],
        [20, 85.58]
      ],
      speedLimitKmh: 60,
      lanes: 4,
      elevationMeters: 15
    },
    {
      id: "rn-cyc-02",
      name: "Puri Marine Drive",
      type: "ARTERIAL",
      status: "RESTRICTED",
      coordinates: [
        [19.79, 85.81],
        [19.793, 85.82],
        [19.796, 85.83],
        [19.799, 85.84]
      ],
      speedLimitKmh: 0,
      lanes: 2,
      elevationMeters: 3
    },
    {
      id: "rn-cyc-03",
      name: "Konark-Puri Coastal Road",
      type: "ARTERIAL",
      status: "RESTRICTED",
      coordinates: [
        [19.8, 85.84],
        [19.83, 85.9],
        [19.86, 85.96],
        [19.887, 86.095]
      ],
      speedLimitKmh: 0,
      lanes: 2,
      elevationMeters: 5
    },
    {
      id: "rn-cyc-04",
      name: "SH-15 (Chhatrapur \u2013 Berhampur Road)",
      type: "ARTERIAL",
      status: "CAUTION",
      coordinates: [
        [19.355, 85.07],
        [19.38, 85.09],
        [19.41, 85.11],
        [19.45, 85.14]
      ],
      speedLimitKmh: 40,
      lanes: 2,
      elevationMeters: 12
    },
    {
      id: "rn-cyc-05",
      name: "Satapada \u2013 Balugaon Road",
      type: "SECONDARY",
      status: "CAUTION",
      coordinates: [
        [19.67, 85.45],
        [19.69, 85.43],
        [19.71, 85.41],
        [19.73, 85.4]
      ],
      speedLimitKmh: 30,
      lanes: 2,
      elevationMeters: 8
    },
    {
      id: "rn-cyc-06",
      name: "Brahmagiri \u2013 Puri Inland Road",
      type: "SECONDARY",
      status: "CLEAR",
      coordinates: [
        [19.815, 85.638],
        [19.813, 85.68],
        [19.811, 85.73],
        [19.81, 85.78]
      ],
      speedLimitKmh: 50,
      lanes: 2,
      elevationMeters: 20
    }
  ],
  alerts: [
    {
      id: "al-cyc-01",
      title: "IMD Red Warning \u2014 Super Cyclone Landfall Imminent",
      message: "India Meteorological Department has issued a RED WARNING for Puri-Ganjam coast. Super Cyclone (Cat-5, sustained winds 260 km/h, gusts 310 km/h) expected to make landfall between Puri and Konark within 6\u20138 hours. Storm surge of 4\u20136 meters forecast for low-lying coastal areas. All residents within 5 km of coastline must evacuate immediately to designated cyclone shelters.",
      severity: "CRITICAL",
      timestamp: "2024-10-24T03:00:00Z",
      read: false
    },
    {
      id: "al-cyc-02",
      title: "Storm Surge Advisory \u2014 Chilika Lagoon Backflow",
      message: "INCOIS storm surge model predicts 3\u20134 meter surge penetration through Chilika lagoon mouth. All lakeshore settlements including Satapada, Rambha, and Balugaon low-lying areas face severe inundation risk. Fishing boats must not venture into the lagoon. Evacuate to elevated shelters above 15 meters ASL.",
      severity: "CRITICAL",
      timestamp: "2024-10-24T03:15:00Z",
      zoneId: "rz-cyc-03",
      read: false
    },
    {
      id: "al-cyc-03",
      title: "Wind Speed Escalation Warning \u2014 Puri District",
      message: "Sustained wind speeds along the Puri coast have crossed 180 km/h and are escalating rapidly. Expected to reach 260 km/h at landfall. Kutcha and semi-pucca structures will not withstand these forces. All outdoor movement must cease. Shelter in reinforced concrete structures or designated cyclone bunkers only. Flying debris is a lethal hazard.",
      severity: "WARNING",
      timestamp: "2024-10-24T03:30:00Z",
      zoneId: "rz-cyc-01",
      read: false
    },
    {
      id: "al-cyc-04",
      title: "Fishermen Warning \u2014 Bay of Bengal",
      message: "All fishing operations in the Bay of Bengal west-central and adjoining areas MUST cease immediately. Sea condition: phenomenal (wave height 12\u201314 meters). Fishermen who are already at sea must seek nearest port shelter. Do not attempt to return to home port if distance exceeds 50 nautical miles. Ganjam, Puri, and Jagatsinghpur harbors are CLOSED until further notice.",
      severity: "WARNING",
      timestamp: "2024-10-24T02:30:00Z",
      read: false
    }
  ],
  demographics: {
    totalPopulationAtRisk: 22400,
    totalVulnerablePopulation: 6820,
    activeHazardZonesCount: 6,
    criticalZonesCount: 3,
    reliefCentresCount: 6,
    availableShelterCapacity: 8600,
    totalShelterCapacity: 25e3,
    totalShelterOccupancy: 16400,
    vulnerabilityDistribution: [
      { category: "Elderly (60+)", count: 1710, percentage: 25.1 },
      { category: "Children (<14)", count: 2880, percentage: 42.2 },
      { category: "Persons with Disabilities", count: 490, percentage: 7.2 },
      { category: "Pregnant/Lactating Women", count: 620, percentage: 9.1 },
      { category: "Chronic Illness", count: 540, percentage: 7.9 },
      { category: "Other Vulnerable", count: 580, percentage: 8.5 }
    ]
  },
  analytics: {
    riskDistributionData: [
      { name: "Critical", zones: 3, population: 13100, vulnerable: 4180, color: "#dc2626" },
      { name: "High", zones: 3, population: 9300, vulnerable: 2640, color: "#f97316" },
      { name: "Moderate", zones: 0, population: 0, vulnerable: 0, color: "#eab308" },
      { name: "Safe", zones: 0, population: 0, vulnerable: 0, color: "#22c55e" }
    ],
    riskTrendData: [
      { time: "22:00", avgRiskScore: 52, floodLevelMeters: 0.8, evacuatedCount: 0 },
      { time: "23:00", avgRiskScore: 58, floodLevelMeters: 1.2, evacuatedCount: 1200 },
      { time: "00:00", avgRiskScore: 65, floodLevelMeters: 1.8, evacuatedCount: 3500 },
      { time: "01:00", avgRiskScore: 72, floodLevelMeters: 2.4, evacuatedCount: 6800 },
      { time: "02:00", avgRiskScore: 80, floodLevelMeters: 3.1, evacuatedCount: 10200 },
      { time: "03:00", avgRiskScore: 88, floodLevelMeters: 3.8, evacuatedCount: 13500 },
      { time: "04:00", avgRiskScore: 93, floodLevelMeters: 4.5, evacuatedCount: 16400 }
    ],
    zoneComparisonData: [
      { zone: "Puri Beach", riskScore: 97, popExposure: 5200, hazardScore: 98, accessScore: 25, vulnerable: 1650 },
      { zone: "Konark Strip", riskScore: 92, popExposure: 3800, hazardScore: 95, accessScore: 30, vulnerable: 1180 },
      { zone: "Chilika Shore", riskScore: 88, popExposure: 4100, hazardScore: 90, accessScore: 28, vulnerable: 1350 },
      { zone: "Brahmagiri", riskScore: 74, popExposure: 3600, hazardScore: 78, accessScore: 45, vulnerable: 1020 },
      { zone: "Ganjam Harbor", riskScore: 82, popExposure: 3200, hazardScore: 85, accessScore: 35, vulnerable: 940 },
      { zone: "Satapada", riskScore: 79, popExposure: 2500, hazardScore: 88, accessScore: 20, vulnerable: 680 }
    ],
    shelterUtilizationData: [
      { name: "Puri MCS", capacity: 5e3, occupancy: 3800, available: 1200, occupancyRate: 76, status: "NEAR_CAPACITY" },
      { name: "Konark CCB", capacity: 3500, occupancy: 2600, available: 900, occupancyRate: 74, status: "NEAR_CAPACITY" },
      { name: "Brahmagiri DSS", capacity: 4500, occupancy: 3200, available: 1300, occupancyRate: 71, status: "AVAILABLE" },
      { name: "Chilika ODRAF", capacity: 4e3, occupancy: 2800, available: 1200, occupancyRate: 70, status: "AVAILABLE" },
      { name: "Ganjam ZP", capacity: 4500, occupancy: 2400, available: 2100, occupancyRate: 53, status: "AVAILABLE" },
      { name: "Satapada ERC", capacity: 3500, occupancy: 1600, available: 1900, occupancyRate: 46, status: "AVAILABLE" }
    ],
    evacuationProgressData: [
      { segment: "Puri Beach Front", target: 5200, evacuated: 3900, inTransit: 650, remaining: 650 },
      { segment: "Konark Coastal", target: 3800, evacuated: 2700, inTransit: 500, remaining: 600 },
      { segment: "Chilika Shore", target: 4100, evacuated: 3100, inTransit: 400, remaining: 600 },
      { segment: "Brahmagiri Block", target: 3600, evacuated: 2500, inTransit: 450, remaining: 650 },
      { segment: "Ganjam Harbor", target: 3200, evacuated: 2200, inTransit: 400, remaining: 600 },
      { segment: "Satapada Peninsula", target: 2500, evacuated: 2e3, inTransit: 200, remaining: 300 }
    ]
  }
};

// src/data/scenarios/landslide.ts
var landslideScenario = {
  meta: {
    id: "landslide-uttarakhand",
    name: "Himalayan Landslide \u2014 Uttarakhand",
    disasterType: "LANDSLIDE",
    category: "Severe Multi-Point",
    region: "Chamoli-Joshimath Corridor",
    state: "Uttarakhand",
    riverBasinOrFault: "Main Central Thrust Zone",
    lastUpdated: "11:22:45 UTC+5:30",
    criticalZonesCount: 2,
    totalHazardZones: 8,
    totalReliefCentres: 12,
    totalPopulationAtRisk: 8500,
    totalVulnerablePopulation: 2400,
    availableShelterCapacity: 3820,
    totalShelterCapacity: 1e4,
    totalShelterOccupancy: 6180,
    hazardIcon: "Landmark",
    hazardColor: "amber"
  },
  riskZones: [
    {
      id: "zone-joshimath-township",
      name: "Zone A (Joshimath Township)",
      code: "LS-01-A",
      district: "Chamoli",
      riverBasin: "Main Central Thrust Zone",
      riskScore: 96,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 2200,
      vulnerablePopulation: 620,
      exposureLevel: "Extreme",
      floodDepthEstMeters: 3.8,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE EVACUATION FROM SUBSIDENCE ZONE",
      coordinates: { lat: 30.555, lng: 79.565 },
      polygon: [
        [30.56, 79.555],
        [30.562, 79.575],
        [30.548, 79.578],
        [30.546, 79.558]
      ],
      vulnerabilityBreakdown: {
        elderly: 195,
        children: 260,
        pwd: 68,
        highDensityHouseholds: 97,
        accessibilityScore: 38,
        shelterAvailabilityScore: 52,
        hazardExposureScore: 97,
        populationExposureScore: 88
      },
      reasoning: "Active ground subsidence of 5.4 cm/day detected via InSAR. Multiple structural cracks in residential buildings. 620 vulnerable residents in immediate danger. NDMA has classified this as a sinking zone requiring mandatory evacuation.",
      lastAssessed: "11:18:30 UTC+5:30"
    },
    {
      id: "zone-marwari-basti",
      name: "Zone B (Marwari Basti Slope)",
      code: "LS-02-B",
      district: "Chamoli",
      riverBasin: "Main Central Thrust Zone",
      riskScore: 91,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 1800,
      vulnerablePopulation: 510,
      exposureLevel: "Very High",
      floodDepthEstMeters: 2.6,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE EVACUATION \u2014 SLOPE FAILURE IMMINENT",
      coordinates: { lat: 30.548, lng: 79.57 },
      polygon: [
        [30.553, 79.563],
        [30.555, 79.578],
        [30.543, 79.58],
        [30.541, 79.565]
      ],
      vulnerabilityBreakdown: {
        elderly: 170,
        children: 215,
        pwd: 55,
        highDensityHouseholds: 70,
        accessibilityScore: 32,
        shelterAvailabilityScore: 48,
        hazardExposureScore: 92,
        populationExposureScore: 85
      },
      reasoning: "Steep gradient slope (35\xB0+) with saturated overburden soil. Retaining walls cracked. Debris flow channel identified directly above settlement. Historical landslide scars visible on slope.",
      lastAssessed: "11:15:00 UTC+5:30"
    },
    {
      id: "zone-auli-ridge",
      name: "Zone C (Auli Ridge Settlement)",
      code: "LS-03-C",
      district: "Chamoli",
      riverBasin: "Main Central Thrust Zone",
      riskScore: 74,
      riskLevel: "HIGH",
      priority: "P2",
      population: 950,
      vulnerablePopulation: 280,
      exposureLevel: "High",
      floodDepthEstMeters: 1.4,
      waterLevelTrend: "RISING_SLOW",
      recommendedAction: "SLOPE MONITORING \u2014 PREPARE FOR EVACUATION",
      coordinates: { lat: 30.53, lng: 79.575 },
      polygon: [
        [30.535, 79.568],
        [30.537, 79.582],
        [30.525, 79.585],
        [30.523, 79.57]
      ],
      vulnerabilityBreakdown: {
        elderly: 90,
        children: 120,
        pwd: 32,
        highDensityHouseholds: 38,
        accessibilityScore: 55,
        shelterAvailabilityScore: 62,
        hazardExposureScore: 76,
        populationExposureScore: 70
      },
      reasoning: "Ridge settlement showing tension cracks in ground. Snow-melt seepage increasing pore-water pressure. Tourism infrastructure at risk. Monitoring stations report 1.2 cm/day lateral movement.",
      lastAssessed: "11:10:45 UTC+5:30"
    },
    {
      id: "zone-tapovan-valley",
      name: "Zone D (Tapovan Valley)",
      code: "LS-04-D",
      district: "Chamoli",
      riverBasin: "Main Central Thrust Zone",
      riskScore: 68,
      riskLevel: "HIGH",
      priority: "P2",
      population: 1350,
      vulnerablePopulation: 390,
      exposureLevel: "High",
      floodDepthEstMeters: 1.8,
      waterLevelTrend: "RISING_SLOW",
      recommendedAction: "STRUCTURAL ASSESSMENT \u2014 DEBRIS FLOW MONITORING",
      coordinates: { lat: 30.48, lng: 79.61 },
      polygon: [
        [30.488, 79.6],
        [30.49, 79.62],
        [30.472, 79.622],
        [30.47, 79.602]
      ],
      vulnerabilityBreakdown: {
        elderly: 125,
        children: 165,
        pwd: 42,
        highDensityHouseholds: 58,
        accessibilityScore: 48,
        shelterAvailabilityScore: 55,
        hazardExposureScore: 72,
        populationExposureScore: 65
      },
      reasoning: "Valley floor settlement vulnerable to debris flows from upstream Rishi Ganga gorge. 2021 flash flood scars still visible. NTPC project site proximity increases runoff channeling risk.",
      lastAssessed: "11:05:20 UTC+5:30"
    },
    {
      id: "zone-pipalkoti",
      name: "Zone E (Pipalkoti Block)",
      code: "LS-05-E",
      district: "Chamoli",
      riverBasin: "Main Central Thrust Zone",
      riskScore: 52,
      riskLevel: "MODERATE",
      priority: "P3",
      population: 1200,
      vulnerablePopulation: 340,
      exposureLevel: "Moderate",
      floodDepthEstMeters: 0.8,
      waterLevelTrend: "STABLE",
      recommendedAction: "STANDBY \u2014 MONITOR ROAD CONDITIONS AND SLOPE STABILITY",
      coordinates: { lat: 30.425, lng: 79.435 },
      polygon: [
        [30.432, 79.425],
        [30.434, 79.445],
        [30.418, 79.448],
        [30.416, 79.428]
      ],
      vulnerabilityBreakdown: {
        elderly: 110,
        children: 145,
        pwd: 38,
        highDensityHouseholds: 47,
        accessibilityScore: 68,
        shelterAvailabilityScore: 72,
        hazardExposureScore: 54,
        populationExposureScore: 52
      },
      reasoning: "Moderately stable terrain but road-cut slopes show weathering. Serves as transit hub \u2014 road blockage upstream could strand evacuees. Pre-positioned as staging area.",
      lastAssessed: "10:55:00 UTC+5:30"
    },
    {
      id: "zone-karnaprayag",
      name: "Zone F (Karnaprayag Junction)",
      code: "LS-06-F",
      district: "Chamoli",
      riverBasin: "Main Central Thrust Zone",
      riskScore: 38,
      riskLevel: "MODERATE",
      priority: "P3",
      population: 1e3,
      vulnerablePopulation: 260,
      exposureLevel: "Moderate",
      floodDepthEstMeters: 0.5,
      waterLevelTrend: "STABLE",
      recommendedAction: "MONITOR \u2014 CONFLUENCE WATER LEVEL WATCH",
      coordinates: { lat: 30.26, lng: 79.45 },
      polygon: [
        [30.268, 79.44],
        [30.27, 79.46],
        [30.252, 79.462],
        [30.25, 79.442]
      ],
      vulnerabilityBreakdown: {
        elderly: 82,
        children: 110,
        pwd: 28,
        highDensityHouseholds: 40,
        accessibilityScore: 75,
        shelterAvailabilityScore: 80,
        hazardExposureScore: 40,
        populationExposureScore: 42
      },
      reasoning: "Alaknanda-Pindar confluence town. Relatively stable geology but river levels rising from upstream debris dam concerns. Key logistics hub for relief operations.",
      lastAssessed: "10:45:00 UTC+5:30"
    }
  ],
  reliefCentres: [
    {
      id: "shelter-ls-01",
      name: "Relief Centre #01 (Army Base Camp \u2014 Joshimath)",
      code: "RC-LS-01",
      location: "Upper Joshimath Cantonment, Chamoli",
      coordinates: { lat: 30.565, lng: 79.555 },
      capacity: 2e3,
      occupancy: 1480,
      available: 520,
      status: "AVAILABLE",
      distanceKm: 1.8,
      travelTimeMin: 12,
      elevationMeters: 1980,
      safetyScore: 94,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 14,
        cleanWaterLiters: 32e3,
        backupPower: true,
        sanitationBlocks: 18,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Col. Vikram Singh Rawat",
        designation: "Sector Commander, Indian Army",
        phone: "+91 94120-55001",
        channel: "VHF Ch-03 (Army Emergency Net)"
      }
    },
    {
      id: "shelter-ls-02",
      name: "Relief Centre #02 (Govt Inter College \u2014 Pipalkoti)",
      code: "RC-LS-02",
      location: "Pipalkoti Main Road, Chamoli",
      coordinates: { lat: 30.428, lng: 79.432 },
      capacity: 1500,
      occupancy: 1120,
      available: 380,
      status: "AVAILABLE",
      distanceKm: 5.6,
      travelTimeMin: 35,
      elevationMeters: 1340,
      safetyScore: 88,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 7,
        cleanWaterLiters: 18e3,
        backupPower: true,
        sanitationBlocks: 12,
        wheelchairAccessible: false
      },
      contactOfficer: {
        name: "Dr. Kavita Bisht",
        designation: "Block Medical Officer",
        phone: "+91 94120-55002",
        channel: "VHF Ch-06"
      }
    },
    {
      id: "shelter-ls-03",
      name: "Relief Centre #03 (ITBP 14th Bn HQ \u2014 Joshimath)",
      code: "RC-LS-03",
      location: "ITBP Campus, Upper Joshimath, Chamoli",
      coordinates: { lat: 30.558, lng: 79.548 },
      capacity: 1800,
      occupancy: 1650,
      available: 150,
      status: "NEAR_CAPACITY",
      distanceKm: 2.1,
      travelTimeMin: 14,
      elevationMeters: 2050,
      safetyScore: 96,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 21,
        cleanWaterLiters: 4e4,
        backupPower: true,
        sanitationBlocks: 22,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Commandant A.K. Negi",
        designation: "ITBP 14th Battalion Commander",
        phone: "+91 94120-55003",
        channel: "VHF Ch-02 (ITBP Ops)"
      }
    },
    {
      id: "shelter-ls-04",
      name: "Relief Centre #04 (Govt Primary School \u2014 Auli)",
      code: "RC-LS-04",
      location: "Auli Village Road, Chamoli",
      coordinates: { lat: 30.532, lng: 79.58 },
      capacity: 800,
      occupancy: 620,
      available: 180,
      status: "AVAILABLE",
      distanceKm: 3.4,
      travelTimeMin: 22,
      elevationMeters: 2520,
      safetyScore: 91,
      facilities: {
        medicalUnit: false,
        foodRationsDays: 5,
        cleanWaterLiters: 8e3,
        backupPower: false,
        sanitationBlocks: 6,
        wheelchairAccessible: false
      },
      contactOfficer: {
        name: "Shri Dinesh Negi",
        designation: "Gram Pradhan, Auli",
        phone: "+91 94120-55004",
        channel: "VHF Ch-08"
      }
    },
    {
      id: "shelter-ls-05",
      name: "Relief Centre #05 (Community Hall \u2014 Karnaprayag)",
      code: "RC-LS-05",
      location: "Karnaprayag Market Road, Chamoli",
      coordinates: { lat: 30.262, lng: 79.448 },
      capacity: 2200,
      occupancy: 810,
      available: 1390,
      status: "AVAILABLE",
      distanceKm: 35,
      travelTimeMin: 90,
      elevationMeters: 1450,
      safetyScore: 92,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 10,
        cleanWaterLiters: 25e3,
        backupPower: true,
        sanitationBlocks: 16,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Smt. Pushpa Devi",
        designation: "Sub-Divisional Magistrate, Karnaprayag",
        phone: "+91 94120-55005",
        channel: "VHF Ch-04"
      }
    },
    {
      id: "shelter-ls-06",
      name: "Relief Centre #06 (SDRF Forward Base \u2014 Helang)",
      code: "RC-LS-06",
      location: "Helang Bypass, NH-7 Corridor, Chamoli",
      coordinates: { lat: 30.51, lng: 79.54 },
      capacity: 1700,
      occupancy: 500,
      available: 1200,
      status: "AVAILABLE",
      distanceKm: 6.2,
      travelTimeMin: 28,
      elevationMeters: 1720,
      safetyScore: 90,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 12,
        cleanWaterLiters: 22e3,
        backupPower: true,
        sanitationBlocks: 14,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Inspector Rajesh Bhatt",
        designation: "SDRF Team Leader",
        phone: "+91 94120-55006",
        channel: "VHF Ch-05 (SDRF Ops)"
      }
    }
  ],
  evacuationRoutes: [
    {
      id: "route-joshimath-army-primary",
      originId: "zone-joshimath-township",
      originName: "Zone A (Joshimath Township)",
      destinationId: "shelter-ls-01",
      destinationName: "Relief Centre #01 (Army Base Camp \u2014 Joshimath)",
      distanceKm: 1.8,
      estimatedTimeMin: 12,
      safetyScore: 92,
      safetyLevel: "HIGH",
      blockedRoadsCount: 0,
      elevationClearanceMeters: 45,
      isRecommended: true,
      coordinates: [
        [30.555, 79.565],
        [30.558, 79.562],
        [30.56, 79.558],
        [30.563, 79.556],
        [30.565, 79.555]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Assemble at Joshimath Nagar Panchayat Ground. Board army high-clearance trucks heading uphill.",
          distance: "0.3 km",
          roadCondition: "CLEAR"
        },
        {
          step: 2,
          instruction: "Proceed northwest on Upper Mall Road, avoiding subsidence-cracked section near Hotel Kamet. Army personnel directing traffic.",
          distance: "0.6 km",
          roadCondition: "CONGESTED"
        },
        {
          step: 3,
          instruction: "Turn left at Narsingh Temple junction onto Army Cantonment Access Road. Road cleared by BRO (Border Roads Organization).",
          distance: "0.5 km",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Enter Army Base Camp reception area through Gate 2. Registration and medical triage at entry point.",
          distance: "0.4 km",
          roadCondition: "CLEAR"
        }
      ]
    },
    {
      id: "route-marwari-itbp-primary",
      originId: "zone-marwari-basti",
      originName: "Zone B (Marwari Basti Slope)",
      destinationId: "shelter-ls-03",
      destinationName: "Relief Centre #03 (ITBP 14th Bn HQ \u2014 Joshimath)",
      distanceKm: 2.1,
      estimatedTimeMin: 18,
      safetyScore: 78,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 30,
      isRecommended: true,
      coordinates: [
        [30.548, 79.57],
        [30.55, 79.565],
        [30.552, 79.558],
        [30.555, 79.552],
        [30.558, 79.548]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Evacuate uphill from Marwari Basti via stone-stepped footpath to Upper Bazaar Road. NDRF team assisting elderly and disabled.",
          distance: "0.4 km",
          roadCondition: "CONGESTED"
        },
        {
          step: 2,
          instruction: "Follow army-cleared corridor along ridge path. Avoid cliff-side road section (marked with red flags \u2014 active rockfall zone).",
          distance: "0.8 km",
          roadCondition: "WATERLOGGED_PASSABLE"
        },
        {
          step: 3,
          instruction: "Cross temporary Bailey bridge installed by BRO over nala breach. Single-file crossing, load limit 2 tonnes.",
          distance: "0.5 km",
          roadCondition: "CONGESTED"
        },
        {
          step: 4,
          instruction: "Ascend to ITBP campus via helang connector trail. Helicopter evacuation point at ITBP helipad for critical medical cases.",
          distance: "0.4 km",
          roadCondition: "CLEAR"
        }
      ]
    },
    {
      id: "route-tapovan-helang-alt",
      originId: "zone-tapovan-valley",
      originName: "Zone D (Tapovan Valley)",
      destinationId: "shelter-ls-06",
      destinationName: "Relief Centre #06 (SDRF Forward Base \u2014 Helang)",
      distanceKm: 6.2,
      estimatedTimeMin: 35,
      safetyScore: 65,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 18,
      isRecommended: false,
      coordinates: [
        [30.48, 79.61],
        [30.485, 79.598],
        [30.492, 79.58],
        [30.5, 79.56],
        [30.508, 79.545],
        [30.51, 79.54]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Evacuate from Tapovan settlement via NH-7 service road heading west. Avoid riverbed path \u2014 debris flow risk.",
          distance: "1.4 km",
          roadCondition: "WATERLOGGED_PASSABLE"
        },
        {
          step: 2,
          instruction: "Pass through BRO-cleared rockfall section at Reni village. Single-lane traffic controlled by army signals.",
          distance: "2.0 km",
          roadCondition: "CONGESTED"
        },
        {
          step: 3,
          instruction: "Ascend switchback road to Helang Bypass. Helicopter evacuation point available at Km 14 marker for stranded groups.",
          distance: "1.8 km",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Arrive at SDRF Forward Base, Helang. Triage, registration, and onward transport to Pipalkoti or Karnaprayag shelters.",
          distance: "1.0 km",
          roadCondition: "CLEAR"
        }
      ]
    }
  ],
  blockedRoads: [
    {
      id: "block-ls-01",
      name: "NH-7 Joshimath-Marwari Basti Link Road",
      reason: "Road buried under 8m debris from hillside collapse. BRO earth-movers deployed but clearance estimated 48+ hours.",
      coordinates: [
        [30.552, 79.568],
        [30.548, 79.572]
      ],
      severity: "TOTAL_BLOCKAGE",
      reportedAt: "09:45:00 UTC+5:30"
    },
    {
      id: "block-ls-02",
      name: "Vishnuprayag-Tapovan Bridge (Dhauliganga Crossing)",
      reason: "Bridge structurally compromised \u2014 pier foundation exposed by river erosion and upstream debris impact. Load rating reduced to zero.",
      coordinates: [
        [30.475, 79.615],
        [30.478, 79.612]
      ],
      severity: "SUBMERGED_UNSAFE",
      reportedAt: "10:15:00 UTC+5:30"
    },
    {
      id: "block-ls-03",
      name: "NH-7 Helang-Reni Section (Km 12\u201314)",
      reason: "Active rockfall zone \u2014 boulders (2\u20135m diameter) blocking both lanes. Unstable cliff face overhead. BRO controlled blasting scheduled.",
      coordinates: [
        [30.498, 79.555],
        [30.502, 79.55]
      ],
      severity: "LANDSLIDE_RISK",
      reportedAt: "10:30:00 UTC+5:30"
    }
  ],
  roadNetworks: [
    {
      id: "road-nh7-joshimath-corridor",
      name: "NH-7 Joshimath \u2014 Badrinath Corridor",
      type: "HIGHWAY",
      status: "RESTRICTED",
      speedLimitKmh: 30,
      lanes: 2,
      elevationMeters: 1890,
      coordinates: [
        [30.555, 79.565],
        [30.54, 79.58],
        [30.51, 79.6],
        [30.48, 79.61],
        [30.46, 79.63]
      ]
    },
    {
      id: "road-nh7-pipalkoti-link",
      name: "NH-7 Pipalkoti \u2014 Joshimath Trunk Road",
      type: "HIGHWAY",
      status: "CAUTION",
      speedLimitKmh: 40,
      lanes: 2,
      elevationMeters: 1550,
      coordinates: [
        [30.425, 79.435],
        [30.45, 79.465],
        [30.48, 79.5],
        [30.51, 79.54],
        [30.555, 79.565]
      ]
    },
    {
      id: "road-army-cantonment-access",
      name: "Army Cantonment Access Road (BRO-maintained)",
      type: "ELEVATED",
      status: "CLEAR",
      speedLimitKmh: 25,
      lanes: 2,
      elevationMeters: 2020,
      coordinates: [
        [30.558, 79.562],
        [30.562, 79.558],
        [30.565, 79.555]
      ]
    },
    {
      id: "road-auli-ridge-road",
      name: "Joshimath \u2014 Auli Ropeway Service Road",
      type: "SECONDARY",
      status: "CAUTION",
      speedLimitKmh: 20,
      lanes: 1,
      elevationMeters: 2350,
      coordinates: [
        [30.555, 79.565],
        [30.545, 79.572],
        [30.535, 79.578],
        [30.53, 79.58]
      ]
    },
    {
      id: "road-helang-bypass",
      name: "Helang Emergency Bypass (BRO Temporary)",
      type: "SECONDARY",
      status: "CLEAR",
      speedLimitKmh: 30,
      lanes: 1,
      elevationMeters: 1740,
      coordinates: [
        [30.51, 79.54],
        [30.515, 79.535],
        [30.52, 79.528],
        [30.525, 79.52]
      ]
    },
    {
      id: "road-karnaprayag-connector",
      name: "Karnaprayag \u2014 Chamoli District Road",
      type: "ARTERIAL",
      status: "CLEAR",
      speedLimitKmh: 45,
      lanes: 2,
      elevationMeters: 1460,
      coordinates: [
        [30.26, 79.45],
        [30.3, 79.445],
        [30.35, 79.44],
        [30.4, 79.435],
        [30.425, 79.435]
      ]
    }
  ],
  alerts: [
    {
      id: "alt-ls-01",
      title: "CRITICAL: NDMA Subsidence Alert \u2014 Joshimath Township",
      message: "Ground subsidence rate accelerated to 5.4 cm/day in Joshimath Ward 8-10. Multiple buildings showing structural failure. Mandatory evacuation order issued for 2,200 residents in Zone A.",
      severity: "CRITICAL",
      timestamp: "11:22:45",
      zoneId: "zone-joshimath-township",
      read: false
    },
    {
      id: "alt-ls-02",
      title: "ROAD CLOSURE: NH-7 Joshimath-Marwari Link Buried",
      message: "Hillside collapse has buried 200m section of NH-7 link road under 8m of debris. BRO earth-movers on site. Estimated clearance: 48+ hours. All traffic rerouted via Army Cantonment Access Road.",
      severity: "WARNING",
      timestamp: "10:40:00",
      read: false
    },
    {
      id: "alt-ls-03",
      title: "WARNING: Glacial Lake Outburst Flood (GLOF) Risk \u2014 Rishi Ganga",
      message: "WIHG satellite imagery shows moraine dam deformation at Rishi Ganga glacial lake (4,150m ASL). Potential GLOF could send debris flow through Tapovan Valley within 6\u201312 hours. SDRF teams pre-positioned.",
      severity: "WARNING",
      timestamp: "10:15:00",
      zoneId: "zone-tapovan-valley",
      read: false
    },
    {
      id: "alt-ls-04",
      title: "ITBP RESCUE: Helicopter Deployment for Marwari Basti",
      message: "ITBP 14th Battalion has deployed 2x ALH Dhruv helicopters for aerial evacuation of stranded elderly and disabled residents from Marwari Basti slope. Helipad at ITBP HQ operational. 4 sorties planned.",
      severity: "INFO",
      timestamp: "09:50:00",
      zoneId: "zone-marwari-basti",
      read: true
    }
  ],
  demographics: {
    totalPopulationAtRisk: 8500,
    totalVulnerablePopulation: 2400,
    activeHazardZonesCount: 8,
    criticalZonesCount: 2,
    reliefCentresCount: 12,
    availableShelterCapacity: 3820,
    totalShelterCapacity: 1e4,
    totalShelterOccupancy: 6180,
    vulnerabilityDistribution: [
      { category: "Elderly (>65 yrs)", count: 772, percentage: 32.2 },
      { category: "Children (<12 yrs)", count: 1015, percentage: 42.3 },
      { category: "Persons with Disabilities", count: 263, percentage: 11 },
      { category: "High-Density / Inaccessible Households", count: 350, percentage: 14.5 }
    ]
  },
  analytics: {
    riskDistributionData: [
      { name: "Critical (P1)", zones: 2, population: 4e3, vulnerable: 1130, color: "#ef4444" },
      { name: "High Risk (P2)", zones: 2, population: 2300, vulnerable: 670, color: "#f97316" },
      { name: "Moderate (P3)", zones: 2, population: 2200, vulnerable: 600, color: "#eab308" }
    ],
    riskTrendData: [
      { time: "06:00", avgRiskScore: 35, floodLevelMeters: 0.3, evacuatedCount: 0 },
      { time: "07:00", avgRiskScore: 42, floodLevelMeters: 0.6, evacuatedCount: 80 },
      { time: "08:00", avgRiskScore: 55, floodLevelMeters: 1.2, evacuatedCount: 320 },
      { time: "09:00", avgRiskScore: 68, floodLevelMeters: 1.8, evacuatedCount: 890 },
      { time: "10:00", avgRiskScore: 79, floodLevelMeters: 2.5, evacuatedCount: 1650 },
      { time: "11:00", avgRiskScore: 89, floodLevelMeters: 3.2, evacuatedCount: 2480 },
      { time: "11:22 (Current)", avgRiskScore: 94, floodLevelMeters: 3.8, evacuatedCount: 2950 }
    ],
    zoneComparisonData: [
      { zone: "Joshimath Township", riskScore: 96, popExposure: 88, hazardScore: 97, accessScore: 38, vulnerable: 620 },
      { zone: "Marwari Basti", riskScore: 91, popExposure: 85, hazardScore: 92, accessScore: 32, vulnerable: 510 },
      { zone: "Auli Ridge", riskScore: 74, popExposure: 70, hazardScore: 76, accessScore: 55, vulnerable: 280 },
      { zone: "Tapovan Valley", riskScore: 68, popExposure: 65, hazardScore: 72, accessScore: 48, vulnerable: 390 },
      { zone: "Pipalkoti Block", riskScore: 52, popExposure: 52, hazardScore: 54, accessScore: 68, vulnerable: 340 },
      { zone: "Karnaprayag Junction", riskScore: 38, popExposure: 42, hazardScore: 40, accessScore: 75, vulnerable: 260 }
    ],
    shelterUtilizationData: [
      { name: "Army Base (Joshimath)", capacity: 2e3, occupancy: 1480, available: 520, occupancyRate: 74, status: "AVAILABLE" },
      { name: "GIC Pipalkoti", capacity: 1500, occupancy: 1120, available: 380, occupancyRate: 74.7, status: "AVAILABLE" },
      { name: "ITBP 14th Bn HQ", capacity: 1800, occupancy: 1650, available: 150, occupancyRate: 91.7, status: "NEAR_CAPACITY" },
      { name: "GPS Auli", capacity: 800, occupancy: 620, available: 180, occupancyRate: 77.5, status: "AVAILABLE" },
      { name: "Community Hall Karnaprayag", capacity: 2200, occupancy: 810, available: 1390, occupancyRate: 36.8, status: "AVAILABLE" },
      { name: "SDRF Base Helang", capacity: 1700, occupancy: 500, available: 1200, occupancyRate: 29.4, status: "AVAILABLE" }
    ],
    evacuationProgressData: [
      { segment: "Joshimath Township (P1)", target: 620, evacuated: 410, inTransit: 130, remaining: 80 },
      { segment: "Marwari Basti (P1)", target: 510, evacuated: 280, inTransit: 120, remaining: 110 },
      { segment: "Auli Ridge (P2)", target: 280, evacuated: 180, inTransit: 50, remaining: 50 },
      { segment: "Tapovan Valley (P2)", target: 390, evacuated: 150, inTransit: 80, remaining: 160 }
    ]
  }
};

// src/data/scenarios/tsunami.ts
var tsunamiScenario = {
  meta: {
    id: "tsunami-tamilnadu",
    name: "Tsunami Alert \u2014 Tamil Nadu Coast",
    disasterType: "TSUNAMI",
    category: "Wave Height 8-12m",
    region: "Chennai-Kanchipuram Coastal Zone",
    state: "Tamil Nadu",
    riverBasinOrFault: "Andaman-Sumatra Subduction Zone",
    lastUpdated: "02:45:10 UTC+5:30",
    criticalZonesCount: 3,
    totalHazardZones: 9,
    totalReliefCentres: 14,
    totalPopulationAtRisk: 28400,
    totalVulnerablePopulation: 7520,
    availableShelterCapacity: 12600,
    totalShelterCapacity: 30200,
    totalShelterOccupancy: 17600,
    hazardIcon: "Tsunami",
    hazardColor: "cyan"
  },
  riskZones: [
    {
      id: "tz-a",
      name: "Zone A (Marina Beach Corridor)",
      code: "TZ-A",
      district: "Chennai",
      riverBasin: "Adyar Estuary",
      riskScore: 96,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 8200,
      vulnerablePopulation: 2350,
      exposureLevel: "Extreme",
      floodDepthEstMeters: 11.5,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE INLAND EVACUATION \u2014 Move at least 2 km inland or to structures above 15 m elevation",
      coordinates: { lat: 13.0524, lng: 80.2824 },
      polygon: [
        [13.07, 80.28],
        [13.07, 80.29],
        [13.04, 80.29],
        [13.04, 80.28]
      ],
      vulnerabilityBreakdown: {
        elderly: 680,
        children: 1020,
        pwd: 190,
        highDensityHouseholds: 2150,
        accessibilityScore: 35,
        shelterAvailabilityScore: 50,
        hazardExposureScore: 98,
        populationExposureScore: 92
      },
      reasoning: "Marina Beach is a flat, low-elevation coastal strip with no natural barriers. Densely populated fishing hamlets and tourist infrastructure face direct wave impact. First wave arrival estimated within 90 minutes of earthquake trigger.",
      lastAssessed: "2024-09-02T02:30:00+05:30"
    },
    {
      id: "tz-b",
      name: "Zone B (Mahabalipuram Heritage Zone)",
      code: "TZ-B",
      district: "Kanchipuram",
      riverBasin: "Palar River Basin",
      riskScore: 93,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 4100,
      vulnerablePopulation: 1280,
      exposureLevel: "Extreme",
      floodDepthEstMeters: 9.8,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE INLAND EVACUATION \u2014 Evacuate heritage site visitors and fishing village residents to NH-49 elevated corridor",
      coordinates: { lat: 12.6172, lng: 80.1927 },
      polygon: [
        [12.63, 80.18],
        [12.63, 80.2],
        [12.6, 80.2],
        [12.6, 80.18]
      ],
      vulnerabilityBreakdown: {
        elderly: 310,
        children: 540,
        pwd: 85,
        highDensityHouseholds: 920,
        accessibilityScore: 28,
        shelterAvailabilityScore: 38,
        hazardExposureScore: 96,
        populationExposureScore: 85
      },
      reasoning: "Mahabalipuram sits on a flat rocky shore with minimal inland buffer. The 2004 tsunami demonstrated severe impact here. Fishing hamlets and tourist areas have limited vertical evacuation options.",
      lastAssessed: "2024-09-02T02:32:00+05:30"
    },
    {
      id: "tz-c",
      name: "Zone C (Kovalam Fishing Village)",
      code: "TZ-C",
      district: "Kanchipuram",
      riverBasin: "Kovalam Creek",
      riskScore: 91,
      riskLevel: "CRITICAL",
      priority: "P1",
      population: 2800,
      vulnerablePopulation: 920,
      exposureLevel: "Extreme",
      floodDepthEstMeters: 8.5,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "IMMEDIATE INLAND EVACUATION \u2014 Move to elevated tsunami shelter at Kovalam Junction; abandon all watercraft",
      coordinates: { lat: 12.7892, lng: 80.2518 },
      polygon: [
        [12.8, 80.24],
        [12.8, 80.26],
        [12.78, 80.26],
        [12.78, 80.24]
      ],
      vulnerabilityBreakdown: {
        elderly: 240,
        children: 410,
        pwd: 65,
        highDensityHouseholds: 680,
        accessibilityScore: 32,
        shelterAvailabilityScore: 42,
        hazardExposureScore: 94,
        populationExposureScore: 80
      },
      reasoning: "Traditional fishing village with kutcha structures directly on the shore. No seawall protection. Population has limited awareness of vertical evacuation. Single access road prone to congestion.",
      lastAssessed: "2024-09-02T02:34:00+05:30"
    },
    {
      id: "tz-d",
      name: "Zone D (Thiruvanmiyur Coastal Ward)",
      code: "TZ-D",
      district: "Chennai",
      riverBasin: "Adyar River Mouth",
      riskScore: 82,
      riskLevel: "HIGH",
      priority: "P2",
      population: 5600,
      vulnerablePopulation: 1340,
      exposureLevel: "Very High",
      floodDepthEstMeters: 5.2,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "MOVE TO HIGH GROUND \u2014 Evacuate ground and first-floor residents to buildings above 4 storeys; avoid Adyar river bridges",
      coordinates: { lat: 12.983, lng: 80.264 },
      polygon: [
        [12.99, 80.26],
        [12.99, 80.27],
        [12.97, 80.27],
        [12.97, 80.26]
      ],
      vulnerabilityBreakdown: {
        elderly: 410,
        children: 520,
        pwd: 110,
        highDensityHouseholds: 1480,
        accessibilityScore: 52,
        shelterAvailabilityScore: 60,
        hazardExposureScore: 78,
        populationExposureScore: 75
      },
      reasoning: "Mixed residential and commercial zone 300-800 m from shoreline. Multi-storey apartments offer some vertical evacuation potential. Adyar river estuary amplifies wave intrusion inland.",
      lastAssessed: "2024-09-02T02:36:00+05:30"
    },
    {
      id: "tz-e",
      name: "Zone E (Neelankarai Residential Belt)",
      code: "TZ-E",
      district: "Chennai",
      riverBasin: "Buckingham Canal",
      riskScore: 74,
      riskLevel: "HIGH",
      priority: "P2",
      population: 4300,
      vulnerablePopulation: 980,
      exposureLevel: "High",
      floodDepthEstMeters: 3.8,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "TSUNAMI SHELTER ACTIVATION \u2014 Open designated shelters; relocate ground-floor residents to upper storeys or inland assembly points",
      coordinates: { lat: 12.945, lng: 80.255 },
      polygon: [
        [12.96, 80.25],
        [12.96, 80.26],
        [12.93, 80.26],
        [12.93, 80.25]
      ],
      vulnerabilityBreakdown: {
        elderly: 280,
        children: 380,
        pwd: 75,
        highDensityHouseholds: 1100,
        accessibilityScore: 58,
        shelterAvailabilityScore: 65,
        hazardExposureScore: 70,
        populationExposureScore: 68
      },
      reasoning: "Residential belt with a mix of independent houses and apartment complexes. Buckingham Canal acts as a conduit for wave intrusion. Moderate elevation gain 500 m inland provides relative safety.",
      lastAssessed: "2024-09-02T02:38:00+05:30"
    },
    {
      id: "tz-f",
      name: "Zone F (ECR Commercial Strip)",
      code: "TZ-F",
      district: "Kanchipuram",
      riverBasin: "Muttukadu Backwaters",
      riskScore: 68,
      riskLevel: "MODERATE",
      priority: "P3",
      population: 3400,
      vulnerablePopulation: 650,
      exposureLevel: "High",
      floodDepthEstMeters: 2.4,
      waterLevelTrend: "RISING_RAPID",
      recommendedAction: "PRECAUTIONARY EVACUATION \u2014 Clear beach-facing commercial establishments; secure hazardous materials in warehouses",
      coordinates: { lat: 12.855, lng: 80.243 },
      polygon: [
        [12.87, 80.23],
        [12.87, 80.25],
        [12.84, 80.25],
        [12.84, 80.23]
      ],
      vulnerabilityBreakdown: {
        elderly: 150,
        children: 230,
        pwd: 45,
        highDensityHouseholds: 720,
        accessibilityScore: 65,
        shelterAvailabilityScore: 70,
        hazardExposureScore: 62,
        populationExposureScore: 55
      },
      reasoning: "ECR strip has commercial resorts and restaurants set back 100-300 m from shore. Muttukadu backwaters may channel wave energy. Concrete structures offer some protection but ground floors will be inundated.",
      lastAssessed: "2024-09-02T02:40:00+05:30"
    }
  ],
  reliefCentres: [
    {
      id: "rc-iitm",
      name: "IIT Madras Campus Shelter",
      code: "RC-IITM",
      location: "IIT Madras, Guindy, Chennai",
      coordinates: { lat: 12.9916, lng: 80.2336 },
      capacity: 6500,
      occupancy: 3800,
      available: 2700,
      status: "AVAILABLE",
      distanceKm: 4.2,
      travelTimeMin: 18,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 7,
        cleanWaterLiters: 45e3,
        backupPower: true,
        sanitationBlocks: 24,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Dr. R. Venkatesh",
        designation: "Emergency Coordinator",
        phone: "+91-44-2257-8001",
        channel: "VHF Channel 9"
      },
      elevationMeters: 18,
      safetyScore: 95
    },
    {
      id: "rc-anna",
      name: "Anna University Convention Centre",
      code: "RC-ANNA",
      location: "Anna University, Guindy, Chennai",
      coordinates: { lat: 13.0108, lng: 80.2354 },
      capacity: 5200,
      occupancy: 3400,
      available: 1800,
      status: "AVAILABLE",
      distanceKm: 3.8,
      travelTimeMin: 15,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 5,
        cleanWaterLiters: 35e3,
        backupPower: true,
        sanitationBlocks: 18,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Prof. S. Lakshmi",
        designation: "Shelter Commandant",
        phone: "+91-44-2235-6200",
        channel: "VHF Channel 9"
      },
      elevationMeters: 16,
      safetyScore: 92
    },
    {
      id: "rc-rajiv",
      name: "Rajiv Gandhi Government Hospital Wing",
      code: "RC-RGH",
      location: "Park Town, Chennai",
      coordinates: { lat: 13.085, lng: 80.274 },
      capacity: 4800,
      occupancy: 3200,
      available: 1600,
      status: "AVAILABLE",
      distanceKm: 2.5,
      travelTimeMin: 12,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 4,
        cleanWaterLiters: 28e3,
        backupPower: true,
        sanitationBlocks: 16,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Dr. K. Priya",
        designation: "Medical Director",
        phone: "+91-44-2530-5000",
        channel: "VHF Channel 12"
      },
      elevationMeters: 12,
      safetyScore: 88
    },
    {
      id: "rc-guindy",
      name: "Guindy Industrial Estate Community Hall",
      code: "RC-GIE",
      location: "Guindy Industrial Estate, Chennai",
      coordinates: { lat: 13.0074, lng: 80.212 },
      capacity: 5800,
      occupancy: 4100,
      available: 1700,
      status: "NEAR_CAPACITY",
      distanceKm: 5.6,
      travelTimeMin: 22,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 6,
        cleanWaterLiters: 4e4,
        backupPower: true,
        sanitationBlocks: 20,
        wheelchairAccessible: false
      },
      contactOfficer: {
        name: "Mr. A. Suresh",
        designation: "Site Manager",
        phone: "+91-44-2250-1100",
        channel: "VHF Channel 9"
      },
      elevationMeters: 22,
      safetyScore: 90
    },
    {
      id: "rc-chengalpattu",
      name: "Chengalpattu Government School Complex",
      code: "RC-CGP",
      location: "Chengalpattu Town, Kanchipuram",
      coordinates: { lat: 12.6919, lng: 80 },
      capacity: 4200,
      occupancy: 1800,
      available: 2400,
      status: "AVAILABLE",
      distanceKm: 18,
      travelTimeMin: 45,
      facilities: {
        medicalUnit: true,
        foodRationsDays: 5,
        cleanWaterLiters: 3e4,
        backupPower: false,
        sanitationBlocks: 14,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Mrs. P. Meenakshi",
        designation: "Block Development Officer",
        phone: "+91-44-2742-2300",
        channel: "VHF Channel 14"
      },
      elevationMeters: 35,
      safetyScore: 93
    },
    {
      id: "rc-tambaram",
      name: "Tambaram Railway Station Relief Camp",
      code: "RC-TBM",
      location: "Tambaram, Chennai",
      coordinates: { lat: 12.9249, lng: 80.1178 },
      capacity: 3700,
      occupancy: 1300,
      available: 2400,
      status: "AVAILABLE",
      distanceKm: 12.5,
      travelTimeMin: 35,
      facilities: {
        medicalUnit: false,
        foodRationsDays: 3,
        cleanWaterLiters: 2e4,
        backupPower: true,
        sanitationBlocks: 10,
        wheelchairAccessible: true
      },
      contactOfficer: {
        name: "Mr. D. Karthik",
        designation: "Station Master / Relief Coordinator",
        phone: "+91-44-2239-0500",
        channel: "VHF Channel 14"
      },
      elevationMeters: 28,
      safetyScore: 91
    }
  ],
  evacuationRoutes: [
    {
      id: "er-marina-iitm",
      originId: "tz-a",
      originName: "Marina Beach Corridor",
      destinationId: "rc-iitm",
      destinationName: "IIT Madras Campus Shelter",
      distanceKm: 5.8,
      estimatedTimeMin: 25,
      safetyScore: 78,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 14,
      coordinates: [
        [13.052, 80.282],
        [13.048, 80.275],
        [13.04, 80.268],
        [13.03, 80.258],
        [13.018, 80.248],
        [13.005, 80.24],
        [12.992, 80.234]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Head west on Kamarajar Salai perpendicular to the coast \u2014 move AWAY from the sea immediately",
          distance: "0.8 km",
          roadCondition: "CONGESTED"
        },
        {
          step: 2,
          instruction: "Turn south on Anna Salai via Wallajah Road flyover \u2014 use elevated flyover, DO NOT take underpass",
          distance: "1.5 km",
          roadCondition: "CLEAR"
        },
        {
          step: 3,
          instruction: "Continue on Sardar Patel Road past Guindy \u2014 maintain inland trajectory, minimum 2 km from shoreline",
          distance: "2.0 km",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Enter IIT Madras campus via Gate 1 on Sardar Patel Road \u2014 follow shelter signage to Open Air Theatre grounds",
          distance: "1.5 km",
          roadCondition: "CLEAR"
        }
      ],
      isRecommended: true
    },
    {
      id: "er-thiruvanmiyur-anna",
      originId: "tz-d",
      originName: "Thiruvanmiyur Coastal Ward",
      destinationId: "rc-anna",
      destinationName: "Anna University Convention Centre",
      distanceKm: 4.2,
      estimatedTimeMin: 18,
      safetyScore: 82,
      safetyLevel: "HIGH",
      blockedRoadsCount: 0,
      elevationClearanceMeters: 12,
      coordinates: [
        [12.983, 80.264],
        [12.988, 80.258],
        [12.995, 80.25],
        [13.002, 80.244],
        [13.008, 80.238],
        [13.011, 80.235]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Head west on Lattice Bridge Road perpendicular to the coast \u2014 avoid LB Road underpass near Adyar river",
          distance: "1.0 km",
          roadCondition: "WATERLOGGED_PASSABLE"
        },
        {
          step: 2,
          instruction: "Turn north on Kasturba Nagar Main Road \u2014 road is elevated, safe passage confirmed",
          distance: "1.2 km",
          roadCondition: "CLEAR"
        },
        {
          step: 3,
          instruction: "Continue on Kotturpuram Bridge Road \u2014 bridge provides elevated crossing over Adyar river flood zone",
          distance: "1.0 km",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Enter Anna University campus from Kotturpuram gate \u2014 proceed to Convention Centre assembly point",
          distance: "1.0 km",
          roadCondition: "CLEAR"
        }
      ],
      isRecommended: false
    },
    {
      id: "er-mahabalipuram-chengalpattu",
      originId: "tz-b",
      originName: "Mahabalipuram Heritage Zone",
      destinationId: "rc-chengalpattu",
      destinationName: "Chengalpattu Government School Complex",
      distanceKm: 22.5,
      estimatedTimeMin: 55,
      safetyScore: 72,
      safetyLevel: "MODERATE",
      blockedRoadsCount: 1,
      elevationClearanceMeters: 30,
      coordinates: [
        [12.617, 80.193],
        [12.63, 80.175],
        [12.65, 80.14],
        [12.67, 80.08],
        [12.685, 80.03],
        [12.692, 80]
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: "Head west on Mahabalipuram-Chengalpattu Road (SH-49B) \u2014 move inland immediately, do not wait for second wave",
          distance: "3.5 km",
          roadCondition: "CONGESTED"
        },
        {
          step: 2,
          instruction: "Continue west past Saluvankuppam \u2014 terrain rises above 10 m elevation here, but do not stop",
          distance: "6.0 km",
          roadCondition: "CLEAR"
        },
        {
          step: 3,
          instruction: "Join NH-45 northbound towards Chengalpattu via Madurantakam bypass \u2014 highway is at 25 m+ elevation",
          distance: "8.0 km",
          roadCondition: "CLEAR"
        },
        {
          step: 4,
          instruction: "Enter Chengalpattu town and proceed to Government School Complex on GST Road \u2014 follow tsunami shelter signage",
          distance: "5.0 km",
          roadCondition: "CLEAR"
        }
      ],
      isRecommended: false
    }
  ],
  blockedRoads: [
    {
      id: "br-ecr-south",
      name: "East Coast Road (Neelankarai \u2013 Kovalam)",
      reason: "Coastal road fully submerged by tsunami wave surge; seawater inundation 0.5\u20131.2 m on road surface; debris from beachside structures blocking both lanes",
      coordinates: [
        [12.94, 80.255],
        [12.9, 80.25],
        [12.85, 80.243]
      ],
      severity: "SUBMERGED_UNSAFE",
      reportedAt: "2024-09-02T02:20:00+05:30"
    },
    {
      id: "br-lb-underpass",
      name: "LB Road \u2013 Adyar River Underpass",
      reason: "Underpass flooded by combined tsunami surge and Adyar river backup; water depth exceeds 3 m; structural integrity uncertain",
      coordinates: [
        [12.988, 80.258],
        [12.986, 80.255]
      ],
      severity: "TOTAL_BLOCKAGE",
      reportedAt: "2024-09-02T02:25:00+05:30"
    },
    {
      id: "br-marina-kamarajar",
      name: "Kamarajar Salai (Marina Beach Road)",
      reason: "Retreating wave has deposited fishing boats, sand, and structural debris across 4-lane road; power lines down across northbound carriageway",
      coordinates: [
        [13.06, 80.285],
        [13.05, 80.283],
        [13.04, 80.282]
      ],
      severity: "TOTAL_BLOCKAGE",
      reportedAt: "2024-09-02T02:35:00+05:30"
    }
  ],
  roadNetworks: [
    {
      id: "rn-ecr",
      name: "East Coast Road (ECR)",
      type: "HIGHWAY",
      status: "RESTRICTED",
      coordinates: [
        [13.02, 80.275],
        [12.95, 80.255],
        [12.85, 80.243],
        [12.75, 80.22],
        [12.62, 80.193]
      ],
      speedLimitKmh: 20,
      lanes: 4,
      elevationMeters: 3
    },
    {
      id: "rn-omr",
      name: "Old Mahabalipuram Road (OMR / IT Expressway)",
      type: "ARTERIAL",
      status: "CAUTION",
      coordinates: [
        [13.01, 80.245],
        [12.96, 80.235],
        [12.9, 80.225],
        [12.83, 80.215]
      ],
      speedLimitKmh: 40,
      lanes: 6,
      elevationMeters: 8
    },
    {
      id: "rn-gst",
      name: "GST Road (NH-45)",
      type: "HIGHWAY",
      status: "CLEAR",
      coordinates: [
        [13.07, 80.25],
        [13.02, 80.225],
        [12.95, 80.18],
        [12.85, 80.1],
        [12.69, 80]
      ],
      speedLimitKmh: 80,
      lanes: 6,
      elevationMeters: 20
    },
    {
      id: "rn-irr",
      name: "Inner Ring Road",
      type: "ELEVATED",
      status: "CLEAR",
      coordinates: [
        [13.05, 80.245],
        [13.02, 80.225],
        [13, 80.21],
        [12.98, 80.2]
      ],
      speedLimitKmh: 60,
      lanes: 4,
      elevationMeters: 15
    },
    {
      id: "rn-sardar-patel",
      name: "Sardar Patel Road",
      type: "ARTERIAL",
      status: "CLEAR",
      coordinates: [
        [13.02, 80.25],
        [13.01, 80.245],
        [13, 80.24],
        [12.99, 80.234]
      ],
      speedLimitKmh: 50,
      lanes: 4,
      elevationMeters: 14
    },
    {
      id: "rn-anna-salai",
      name: "Anna Salai (Mount Road)",
      type: "ARTERIAL",
      status: "CAUTION",
      coordinates: [
        [13.06, 80.27],
        [13.04, 80.258],
        [13.02, 80.245],
        [13, 80.23]
      ],
      speedLimitKmh: 40,
      lanes: 6,
      elevationMeters: 10
    }
  ],
  alerts: [
    {
      id: "alert-incois",
      title: "INCOIS Tsunami Warning \u2014 RED Alert",
      message: "Indian National Centre for Ocean Information Services (INCOIS) has issued a RED tsunami warning for Tamil Nadu coast. Mw 8.7 earthquake detected on the Andaman-Sumatra Subduction Zone at 01:58 UTC+5:30. Estimated wave arrival at Chennai coast: 03:30 UTC+5:30. Expected wave height: 8\u201312 m. All coastal residents within 2 km of shoreline or below 15 m elevation must evacuate immediately.",
      severity: "CRITICAL",
      timestamp: "2024-09-02T02:05:00+05:30",
      read: false
    },
    {
      id: "alert-seismic",
      title: "Seismic Trigger Notification \u2014 Andaman Islands",
      message: "IMD Seismology Division confirms Mw 8.7 shallow thrust earthquake at depth 22 km, epicentre 3.3\xB0N 95.8\xB0E (Simeulue Island, Sumatra). Severe rupture along 400 km of subduction zone. Aftershocks Mw 6.2\u20137.1 expected. Tsunami generation confirmed by DART buoy network and PTWC.",
      severity: "CRITICAL",
      timestamp: "2024-09-02T02:00:00+05:30",
      read: false
    },
    {
      id: "alert-siren",
      title: "Coastal Evacuation Sirens Activated",
      message: "All 47 tsunami warning sirens along the Chennai\u2013Kanchipuram coast have been activated. Public address system broadcasting in Tamil, English, and Hindi. Coastal police deploying door-to-door alerts in fishing hamlets. Beach areas sealed by police. Do NOT return to coastal areas until official all-clear from INCOIS.",
      severity: "WARNING",
      timestamp: "2024-09-02T02:15:00+05:30",
      read: false
    },
    {
      id: "alert-navy",
      title: "Indian Navy \u2014 Eastern Naval Command Rescue Deployment",
      message: "INS Adyar and 3 fast interceptor craft deployed from Chennai naval base for post-impact search and rescue. 2 Sea King helicopters on standby at INS Rajali, Arakkonam. NDRF 4th Battalion (Arakkonam) mobilized with 8 rescue teams. Navy divers staged at Royapuram harbour.",
      severity: "INFO",
      timestamp: "2024-09-02T02:30:00+05:30",
      read: false
    }
  ],
  demographics: {
    totalPopulationAtRisk: 28400,
    totalVulnerablePopulation: 7520,
    activeHazardZonesCount: 9,
    criticalZonesCount: 3,
    reliefCentresCount: 14,
    availableShelterCapacity: 12600,
    totalShelterCapacity: 30200,
    totalShelterOccupancy: 17600,
    vulnerabilityDistribution: [
      { category: "Elderly (60+)", count: 2070, percentage: 27.5 },
      { category: "Children (0\u201314)", count: 3100, percentage: 41.2 },
      { category: "Persons with Disabilities", count: 570, percentage: 7.6 },
      { category: "Pregnant / Lactating Women", count: 480, percentage: 6.4 },
      { category: "Economically Weaker Sections", count: 1300, percentage: 17.3 }
    ]
  },
  analytics: {
    riskDistributionData: [
      { name: "Critical", zones: 3, population: 15100, vulnerable: 4550, color: "#dc2626" },
      { name: "High", zones: 2, population: 9900, vulnerable: 2320, color: "#f97316" },
      { name: "Moderate", zones: 1, population: 3400, vulnerable: 650, color: "#eab308" }
    ],
    riskTrendData: [
      { time: "01:58", avgRiskScore: 45, floodLevelMeters: 0, evacuatedCount: 0 },
      { time: "02:05", avgRiskScore: 72, floodLevelMeters: 0.2, evacuatedCount: 120 },
      { time: "02:15", avgRiskScore: 80, floodLevelMeters: 0.5, evacuatedCount: 1450 },
      { time: "02:25", avgRiskScore: 85, floodLevelMeters: 0.8, evacuatedCount: 4200 },
      { time: "02:35", avgRiskScore: 88, floodLevelMeters: 1.2, evacuatedCount: 8600 },
      { time: "02:45", avgRiskScore: 91, floodLevelMeters: 1.5, evacuatedCount: 12400 },
      { time: "03:00 (est.)", avgRiskScore: 94, floodLevelMeters: 3, evacuatedCount: 16800 },
      { time: "03:15 (est.)", avgRiskScore: 98, floodLevelMeters: 8.5, evacuatedCount: 19500 },
      { time: "03:30 (est.)", avgRiskScore: 100, floodLevelMeters: 11.5, evacuatedCount: 21e3 }
    ],
    zoneComparisonData: [
      { zone: "Marina Beach", riskScore: 96, popExposure: 82, hazardScore: 98, accessScore: 35, vulnerable: 2350 },
      { zone: "Mahabalipuram", riskScore: 93, popExposure: 78, hazardScore: 96, accessScore: 28, vulnerable: 1280 },
      { zone: "Kovalam", riskScore: 91, popExposure: 72, hazardScore: 94, accessScore: 32, vulnerable: 920 },
      { zone: "Thiruvanmiyur", riskScore: 82, popExposure: 65, hazardScore: 78, accessScore: 52, vulnerable: 1340 },
      { zone: "Neelankarai", riskScore: 74, popExposure: 58, hazardScore: 70, accessScore: 58, vulnerable: 980 },
      { zone: "ECR Strip", riskScore: 68, popExposure: 48, hazardScore: 62, accessScore: 65, vulnerable: 650 }
    ],
    shelterUtilizationData: [
      { name: "IIT Madras", capacity: 6500, occupancy: 3800, available: 2700, occupancyRate: 58.5, status: "AVAILABLE" },
      { name: "Anna University", capacity: 5200, occupancy: 3400, available: 1800, occupancyRate: 65.4, status: "AVAILABLE" },
      { name: "Rajiv Gandhi Hospital", capacity: 4800, occupancy: 3200, available: 1600, occupancyRate: 66.7, status: "AVAILABLE" },
      { name: "Guindy Industrial", capacity: 5800, occupancy: 4100, available: 1700, occupancyRate: 70.7, status: "NEAR_CAPACITY" },
      { name: "Chengalpattu School", capacity: 4200, occupancy: 1800, available: 2400, occupancyRate: 42.9, status: "AVAILABLE" },
      { name: "Tambaram Railway", capacity: 3700, occupancy: 1300, available: 2400, occupancyRate: 35.1, status: "AVAILABLE" }
    ],
    evacuationProgressData: [
      { segment: "Marina Beach Corridor", target: 8200, evacuated: 4100, inTransit: 1800, remaining: 2300 },
      { segment: "Mahabalipuram Heritage", target: 4100, evacuated: 1600, inTransit: 900, remaining: 1600 },
      { segment: "Kovalam Fishing Village", target: 2800, evacuated: 1200, inTransit: 600, remaining: 1e3 },
      { segment: "Thiruvanmiyur Coastal", target: 5600, evacuated: 2800, inTransit: 1200, remaining: 1600 },
      { segment: "Neelankarai Residential", target: 4300, evacuated: 1800, inTransit: 800, remaining: 1700 },
      { segment: "ECR Commercial Strip", target: 3400, evacuated: 900, inTransit: 500, remaining: 2e3 }
    ]
  }
};

// src/data/scenarios/index.ts
var scenarios = {
  "flood-assam": floodScenario,
  "earthquake-gujarat": earthquakeScenario,
  "cyclone-odisha": cycloneScenario,
  "landslide-uttarakhand": landslideScenario,
  "tsunami-tamilnadu": tsunamiScenario
};
var scenarioList = Object.values(scenarios).map((s) => s.meta);

// src/types/sos.ts
var SOS_DISASTER_TYPES = [
  "FLOOD",
  "EARTHQUAKE",
  "CYCLONE",
  "LANDSLIDE",
  "TSUNAMI",
  "FIRE",
  "OTHER"
];
var SOS_DISASTER_TYPE_LABELS = {
  FLOOD: "Flood",
  EARTHQUAKE: "Earthquake",
  CYCLONE: "Cyclone",
  LANDSLIDE: "Landslide",
  TSUNAMI: "Tsunami",
  FIRE: "Fire",
  OTHER: "Other Emergency"
};

// server/routing.ts
var OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
var TTL_MS = 30 * 60 * 1e3;
var MAX_CACHE = 400;
var MAX_POINTS = 600;
var cache = /* @__PURE__ */ new Map();
var round = (n) => n.toFixed(4);
function modifierText(mod) {
  switch (mod) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "slight left":
      return "slightly left";
    case "slight right":
      return "slightly right";
    case "sharp left":
      return "sharp left";
    case "sharp right":
      return "sharp right";
    case "uturn":
      return "around (U-turn)";
    case "straight":
      return "straight";
    default:
      return "";
  }
}
function describeStep(step) {
  const m = step?.maneuver ?? {};
  const name = step?.name ? String(step.name) : "";
  const onto = name ? ` onto ${name}` : "";
  const dir = modifierText(m.modifier);
  switch (m.type) {
    case "depart":
      return name ? `Start on ${name}` : "Start your journey";
    case "arrive":
      return m.modifier === "left" || m.modifier === "right" ? `Arrive at your destination, on the ${m.modifier}` : "Arrive at your destination";
    case "turn":
      return dir === "straight" ? `Continue straight${onto}` : `Turn ${dir}${onto}`;
    case "end of road":
      return `At the end of the road, turn ${dir || "ahead"}${onto}`;
    case "fork":
      return `Keep ${dir || "ahead"} at the fork${onto}`;
    case "merge":
      return `Merge ${dir || ""}${onto}`.replace("  ", " ");
    case "on ramp":
      return `Take the ramp${onto}`;
    case "off ramp":
      return `Take the exit${onto}`;
    case "roundabout":
    case "rotary":
      return m.exit ? `At the roundabout, take exit ${m.exit}${onto}` : `Enter the roundabout${onto}`;
    case "exit roundabout":
    case "exit rotary":
      return `Exit the roundabout${onto}`;
    case "new name":
    case "continue":
      return `Continue${dir && dir !== "straight" ? " " + dir : ""}${onto}`;
    default:
      return `Continue${onto}`;
  }
}
function decimate(points, max) {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % stride === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
function parseRoute(r) {
  const coords = (r?.geometry?.coordinates ?? []).map((c) => [c[1], c[0]]);
  if (coords.length < 2) return null;
  const legs = r.legs ?? [];
  const steps = legs.flatMap(
    (leg, i) => (leg.steps ?? []).filter((s) => !(i > 0 && s.maneuver?.type === "depart") && !(i < legs.length - 1 && s.maneuver?.type === "arrive"))
  ).map((s) => ({
    instruction: describeStep(s),
    distanceM: Math.round(Number(s.distance) || 0),
    name: s.name ? String(s.name) : ""
  }));
  return {
    available: true,
    source: "OSRM (OpenStreetMap)",
    distanceKm: Math.round(Number(r.distance) / 1e3 * 10) / 10,
    durationMin: Math.max(1, Math.round(Number(r.duration) / 60)),
    coordinates: decimate(coords, MAX_POINTS),
    steps
  };
}
var altCache = /* @__PURE__ */ new Map();
async function fetchOsrm(from, to, alternatives, via) {
  const waypoints = via ? `${from.lng},${from.lat};${via.lng},${via.lat};${to.lng},${to.lat}` : `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${waypoints}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives > 0 ? alternatives : "false"}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(1e4), headers: { "User-Agent": "suraksha-x/1.0 (disaster response demo)" } });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== "Ok" || !Array.isArray(data.routes)) return [];
  return data.routes.map(parseRoute).filter((r) => r !== null);
}
async function getRoadRoute(from, to, via) {
  const key = `${round(from.lat)},${round(from.lng)}>${round(to.lat)},${round(to.lng)}${via ? `|via${round(via.lat)},${round(via.lng)}` : ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.route;
  const route = (await fetchOsrm(from, to, 0, via))[0] ?? null;
  if (!route) return null;
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), route });
  return route;
}
async function getRoadAlternatives(from, to) {
  const key = `${round(from.lat)},${round(from.lng)}>${round(to.lat)},${round(to.lng)}|alt`;
  const hit = altCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.routes;
  const routes = (await fetchOsrm(from, to, 3)).slice(0, 3);
  if (routes.length === 0) return [];
  if (altCache.size >= MAX_CACHE) altCache.delete(altCache.keys().next().value);
  altCache.set(key, { at: Date.now(), routes });
  return routes;
}

// server/routes.ts
var CITIZEN_TTL = 60 * 60 * 24 * 7;
var STAFF_TTL = 60 * 60 * 12;
var NEXT_STATUS = {
  ASSIGNED: "DISPATCHED",
  DISPATCHED: "EN_ROUTE",
  EN_ROUTE: "ARRIVED",
  ARRIVED: "IN_PROGRESS",
  IN_PROGRESS: "RESCUED",
  RESCUED: "CLOSED"
};
var isNum = (v) => typeof v === "number" && Number.isFinite(v);
var str = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
var ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function newIncidentId() {
  const bytes = crypto2.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ID_ALPHABET[bytes[i] & 31];
  return `SOS-${out}`;
}
var OPEN_STATUSES = ["REQUESTED", "VERIFIED", "ASSIGNED", "DISPATCHED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];
var ADMIN_CLOSE_REASONS = ["FALSE_ALARM", "DUPLICATE", "OTHER"];
var weatherCache = /* @__PURE__ */ new Map();
var WEATHER_TTL_MS = 10 * 60 * 1e3;
function createApiRouter(store) {
  const r = Router();
  r.use(attachSession);
  r.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "SURAKSHA-X Disaster Intelligence API",
      database: store.kind,
      timestamp: nowIso()
    });
  });
  const staffLoginLimiter = rateLimit({
    windowMs: 6e4,
    max: 10,
    keyPrefix: "login-staff:",
    message: "Too many sign-in attempts. Wait a minute and try again."
  });
  const citizenLoginLimiter = rateLimit({
    windowMs: 6e4,
    max: 120,
    keyPrefix: "login-citizen:",
    message: "Too many requests. Please try again shortly."
  });
  const loginLimiter = (req, res, next) => (req.body?.role === "citizen" ? citizenLoginLimiter : staffLoginLimiter)(req, res, next);
  r.post("/auth/login", loginLimiter, (req, res) => {
    const { role, code, teamId, name, deviceId } = req.body ?? {};
    if (role === "citizen") {
      const device = typeof deviceId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(deviceId) ? deviceId : null;
      const sub = `cit-${device ?? crypto2.randomBytes(8).toString("hex")}`;
      const displayName = str(name, 60) ?? "Citizen";
      const token = issueToken({ sub, role: "citizen", name: displayName, teamId: null }, CITIZEN_TTL);
      return res.json({ token, user: { id: sub, name: displayName, role: "citizen", teamId: null } });
    }
    if (role === "admin" || role === "rescue") {
      if (!checkAccessCode(role, code)) {
        return res.status(401).json({ error: "Incorrect access code" });
      }
      if (role === "admin") {
        const token2 = issueToken({ sub: "admin-main", role: "admin", name: "Admin / Incident Commander", teamId: null }, STAFF_TTL);
        return res.json({ token: token2, user: { id: "admin-main", name: "Admin / Incident Commander", role: "admin", teamId: null } });
      }
      const team = initialRescueTeams.find((t) => t.id === teamId);
      if (!team) return res.status(400).json({ error: "Choose a valid rescue team" });
      const token = issueToken({ sub: `team-${team.id}`, role: "rescue", name: team.name, teamId: team.id }, STAFF_TTL);
      return res.json({ token, user: { id: `team-${team.id}`, name: team.name, role: "rescue", teamId: team.id } });
    }
    return res.status(400).json({ error: "Unknown role" });
  });
  r.get("/auth/me", requireRole(), (req, res) => {
    const s = req.session;
    res.json({ user: { id: s.sub, name: s.name, role: s.role, teamId: s.teamId } });
  });
  r.get("/teams", requireRole(), async (req, res, next) => {
    try {
      let teams = await store.listTeams();
      if (req.session.role === "citizen") {
        const open = await store.findOpenIncident(req.session.sub);
        const visibleTeam = open?.assignedTeamId ?? null;
        teams = teams.map((t) => {
          if (t.id === visibleTeam) return t;
          const { location: _hidden, ...rest } = t;
          return rest;
        });
      }
      res.json({ teams });
    } catch (e) {
      next(e);
    }
  });
  const lastTeamPing = /* @__PURE__ */ new Map();
  r.post("/teams/:id/location", requireRole("rescue"), async (req, res, next) => {
    try {
      const s = req.session;
      if (s.teamId !== req.params.id) return res.status(403).json({ error: "You can only update your own team" });
      if (req.body?.clear === true) {
        await store.updateTeam(req.params.id, { location: null });
        lastTeamPing.delete(req.params.id);
        return res.json({ ok: true, cleared: true });
      }
      const { lat, lng, accuracy, simulated } = req.body ?? {};
      if (!isNum(lat) || !isNum(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: "Valid coordinates are required" });
      }
      const now = Date.now();
      if (now - (lastTeamPing.get(req.params.id) ?? 0) < 1500) {
        return res.status(429).json({ error: "Location updates are limited to one every 1.5 seconds" });
      }
      lastTeamPing.set(req.params.id, now);
      const ok = await store.updateTeam(req.params.id, {
        location: {
          lat,
          lng,
          accuracy: isNum(accuracy) && accuracy >= 0 && accuracy < 1e5 ? Math.round(accuracy) : null,
          updatedAt: nowIso(),
          simulated: simulated === true
        }
      });
      if (!ok) return res.status(404).json({ error: "Unknown team" });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  const routeLimiter = rateLimit({ windowMs: 6e4, max: 40, keyPrefix: "route:", message: "Too many route requests. Please wait a moment." });
  r.get("/route/alternatives", requireRole(), routeLimiter, async (req, res) => {
    const q = (k) => Number(req.query[k]);
    const [fromLat, fromLng, toLat, toLng] = [q("fromLat"), q("fromLng"), q("toLat"), q("toLng")];
    const ok = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    if (!ok(fromLat, fromLng) || !ok(toLat, toLng)) return res.status(400).json({ error: "Valid coordinates are required" });
    try {
      const routes = await getRoadAlternatives({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
      if (routes.length === 0) return res.json({ available: false, reason: "No road route found between these points" });
      res.json({ available: true, routes });
    } catch (err) {
      console.warn("[Routing] alternatives unavailable:", err.message);
      res.json({ available: false, reason: "Routing service unavailable" });
    }
  });
  r.get("/route", requireRole(), routeLimiter, async (req, res) => {
    const q = (k) => Number(req.query[k]);
    const [fromLat, fromLng, toLat, toLng] = [q("fromLat"), q("fromLng"), q("toLat"), q("toLng")];
    const ok = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    if (!ok(fromLat, fromLng) || !ok(toLat, toLng)) return res.status(400).json({ error: "Valid coordinates are required" });
    const hasVia = req.query.viaLat !== void 0 || req.query.viaLng !== void 0;
    const via = hasVia ? { lat: q("viaLat"), lng: q("viaLng") } : void 0;
    if (via && !ok(via.lat, via.lng)) return res.status(400).json({ error: "Valid via coordinates are required" });
    try {
      const route = await getRoadRoute({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }, via);
      if (!route) return res.json({ available: false, reason: "No road route found between these points" });
      res.json(route);
    } catch (err) {
      console.warn("[Routing] upstream unavailable:", err.message);
      res.json({ available: false, reason: "Routing service unavailable" });
    }
  });
  const sosLimiter = rateLimit({ windowMs: 6e4, max: 12, keyPrefix: "sos:", message: "Too many SOS requests. If this is urgent, call 112." });
  r.post("/sos", requireRole("citizen"), sosLimiter, async (req, res, next) => {
    try {
      const { scenarioId, coordinates, disasterType, isDemoLocation, clientRequestId } = req.body ?? {};
      const scenario = typeof scenarioId === "string" ? scenarios[scenarioId] : void 0;
      if (!scenario) return res.status(400).json({ error: "Unknown scenario" });
      if (!coordinates || !isNum(coordinates.lat) || !isNum(coordinates.lng) || coordinates.lat < -90 || coordinates.lat > 90 || coordinates.lng < -180 || coordinates.lng > 180) {
        return res.status(400).json({ error: "Valid coordinates are required" });
      }
      if (!SOS_DISASTER_TYPES.includes(disasterType)) return res.status(400).json({ error: "Unknown disaster type" });
      const reqId = clientRequestId === void 0 ? null : str(clientRequestId, 64);
      if (clientRequestId !== void 0 && !reqId) return res.status(400).json({ error: "Invalid clientRequestId" });
      const citizen = req.session;
      if (reqId) {
        const existing = await store.findIncidentByClientRequest(citizen.sub, reqId);
        if (existing) return res.status(200).json({ incident: existing, duplicate: true });
      }
      const teams = await store.listTeams();
      const triage = triageSOS({
        zones: scenario.riskZones,
        teams,
        coordinates: { lat: coordinates.lat, lng: coordinates.lng },
        disasterType,
        fallbackRegion: scenario.meta.region
      });
      const queuedOffline = req.body.viaOfflineQueue === true;
      const created = nowIso();
      const doc = {
        id: newIncidentId(),
        isOpen: true,
        closeReason: null,
        citizenId: citizen.sub,
        citizenName: citizen.name,
        scenarioId: scenario.meta.id,
        ...triage,
        coordinates: { lat: coordinates.lat, lng: coordinates.lng },
        isDemoLocation: isDemoLocation === true,
        disasterType,
        hazard: SOS_DISASTER_TYPE_LABELS[disasterType],
        status: "REQUESTED",
        communicationMode: queuedOffline ? "Offline Queue (Store & Forward)" : "Mobile Network",
        assignedTeamId: null,
        instructions: null,
        etaMin: null,
        createdAt: created,
        statusHistory: [{ status: "REQUESTED", timestamp: created }],
        syncState: "SYNCED",
        clientRequestId: reqId
      };
      for (let attempt = 0; ; attempt++) {
        try {
          await store.insertIncident(doc);
          return res.status(201).json({ incident: doc });
        } catch (e) {
          if (e?.code !== 11e3) throw e;
          const key = Object.keys(e.keyPattern ?? {});
          if (key.includes("clientRequestId") && reqId) {
            const existing = await store.findIncidentByClientRequest(citizen.sub, reqId);
            if (existing) return res.status(200).json({ incident: existing, duplicate: true });
          }
          if (key.length === 1 && key[0] === "citizenId") {
            const open = await store.findOpenIncident(citizen.sub);
            return res.status(409).json({ error: "You already have an active SOS", incident: open });
          }
          if (key.includes("id") && attempt < 5) {
            doc.id = newIncidentId();
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      next(e);
    }
  });
  r.get("/sos", requireRole(), async (req, res, next) => {
    try {
      const s = req.session;
      const incidents = await store.listIncidents(s.role === "citizen" ? { citizenId: s.sub } : void 0);
      res.json({ incidents });
    } catch (e) {
      next(e);
    }
  });
  r.post("/sos/:id/assign", requireRole("admin"), async (req, res, next) => {
    try {
      const { teamId, priority, requiredAction, notes } = req.body ?? {};
      const team = await store.getTeam(String(teamId));
      if (!team) return res.status(400).json({ error: "Unknown team" });
      if (priority !== void 0 && !["P1", "P2", "P3"].includes(priority)) return res.status(400).json({ error: "Invalid priority" });
      const action = str(requiredAction, 300) ?? "Proceed to incident location and assess situation";
      const note = typeof notes === "string" ? notes.slice(0, 600) : "";
      const incident = await store.getIncident(req.params.id);
      if (!incident) return res.status(404).json({ error: "Incident not found" });
      const reserved = await store.updateTeam(team.id, { status: "ASSIGNED", activeIncidentId: incident.id }, ["AVAILABLE"]);
      if (!reserved) return res.status(409).json({ error: "That team is no longer available" });
      const stamp = nowIso();
      const finalPriority = priority ?? incident.priority;
      const updated = await store.updateIncident(
        incident.id,
        { assignedTeamId: null, status: ["REQUESTED", "VERIFIED"] },
        {
          assignedTeamId: team.id,
          etaMin: team.baseEtaMin,
          priority: finalPriority,
          status: "ASSIGNED",
          instructions: {
            priority: finalPriority,
            requiredAction: action,
            notes: note,
            issuedBy: req.session.name,
            issuedAt: stamp
          }
        },
        { status: "ASSIGNED", timestamp: stamp }
      );
      if (!updated) {
        await store.updateTeam(team.id, { status: "AVAILABLE", activeIncidentId: null });
        return res.status(409).json({ error: "This incident was already assigned" });
      }
      res.json({ incident: updated });
    } catch (e) {
      next(e);
    }
  });
  r.post("/sos/:id/status", requireRole("admin", "rescue"), async (req, res, next) => {
    try {
      const s = req.session;
      const incident = await store.getIncident(req.params.id);
      if (!incident) return res.status(404).json({ error: "Incident not found" });
      if (s.role === "rescue" && incident.assignedTeamId !== s.teamId) {
        return res.status(403).json({ error: "This incident is not assigned to your team" });
      }
      const next_ = NEXT_STATUS[incident.status];
      if (!next_ || req.body?.status !== next_) {
        return res.status(409).json({ error: `Invalid status change from ${incident.status}` });
      }
      const updated = await store.updateIncident(
        incident.id,
        { status: [incident.status], assignedTeamId: incident.assignedTeamId ?? null },
        { status: next_, isOpen: next_ !== "RESCUED" && next_ !== "CLOSED" },
        { status: next_, timestamp: nowIso() }
      );
      if (!updated) return res.status(409).json({ error: "The incident changed \u2014 refresh and try again" });
      if (updated.assignedTeamId) {
        if (next_ === "RESCUED" || next_ === "CLOSED") {
          await store.updateTeam(updated.assignedTeamId, { status: "AVAILABLE", activeIncidentId: null });
        } else if (next_ === "DISPATCHED" || next_ === "EN_ROUTE") {
          await store.updateTeam(updated.assignedTeamId, { status: "DISPATCHED" });
        }
      }
      res.json({ incident: updated });
    } catch (e) {
      next(e);
    }
  });
  const simLimiter = rateLimit({ windowMs: 6e4, max: 10, keyPrefix: "sim:", message: "Too many simulation requests. Please wait a moment." });
  const simCache = /* @__PURE__ */ new Map();
  const simInflight = /* @__PURE__ */ new Map();
  const SIM_TTL_MS = 60 * 60 * 1e3;
  const SIM_FALLBACK_TTL_MS = 2 * 60 * 1e3;
  const SIM_QUICK_WAIT_MS = 8e3;
  r.post("/sos/:id/simulation", requireRole(), simLimiter, async (req, res, next) => {
    try {
      const s = req.session;
      const incident = await store.getIncident(req.params.id);
      if (!incident || s.role === "citizen" && incident.citizenId !== s.sub) {
        return res.status(404).json({ error: "Incident not found" });
      }
      const requested = req.body?.severity;
      const severity = SEVERITIES.includes(requested) ? requested : severityFromPriority(incident.priority);
      const key = `${incident.id}|${severity}`;
      const cached = simCache.get(key);
      if (cached && Date.now() - cached.at < cached.ttl) return res.json(cached.body);
      const scenario = scenarios[incident.scenarioId];
      const context = [];
      if (scenario) {
        const zone = nearestZone(scenario.riskZones, incident.coordinates);
        if (zone && haversineKm(zone.coordinates, incident.coordinates) <= 100) {
          context.push(`Sample region: ${scenario.meta.region}, ${scenario.meta.state}`);
          context.push(`Nearest sample zone: ${zone.name} (${zone.district}), risk ${zone.riskLevel}`);
        }
      }
      context.push(`Reported hazard type: ${incident.hazard}`);
      const buildBody = (generated) => ({
        params: validateParams(generated?.raw, incident.disasterType, severity, incident.coordinates),
        engine: generated ? "gemini" : "rule-based",
        model: generated?.model ?? null,
        generatedAt: nowIso(),
        disclaimer: "Pure simulation. No real-time sensor, satellite, weather or terrain data was used."
      });
      let job = simInflight.get(key);
      if (!job) {
        job = generateSimParams({ hazard: incident.disasterType, severity, origin: incident.coordinates, context }).then((generated) => {
          const body = buildBody(generated);
          if (simCache.size > 300) simCache.delete(simCache.keys().next().value);
          simCache.set(key, { at: Date.now(), ttl: generated ? SIM_TTL_MS : SIM_FALLBACK_TTL_MS, body });
          return body;
        }).finally(() => simInflight.delete(key));
        simInflight.set(key, job);
        if (process.env.VERCEL) {
          import("@vercel/functions").then(({ waitUntil }) => waitUntil(job)).catch(() => {
          });
        }
      }
      const quick = await Promise.race([job, new Promise((resolve) => setTimeout(() => resolve(null), SIM_QUICK_WAIT_MS))]);
      if (quick) return res.json(quick);
      return res.json({ ...buildBody(null), upgrading: true });
    } catch (e) {
      next(e);
    }
  });
  r.post("/sos/:id/cancel", requireRole("citizen", "admin"), async (req, res, next) => {
    try {
      const s = req.session;
      const incident = await store.getIncident(req.params.id);
      if (!incident) return res.status(404).json({ error: "Incident not found" });
      if (!incident.isOpen) return res.status(409).json({ error: "This incident is already closed" });
      let reason;
      if (s.role === "citizen") {
        if (incident.citizenId !== s.sub) return res.status(404).json({ error: "Incident not found" });
        if (incident.assignedTeamId) {
          return res.status(409).json({ error: "A rescue team is already assigned. Please contact Rescue Control." });
        }
        reason = "CANCELLED_BY_CITIZEN";
      } else {
        reason = String(req.body?.reason ?? "");
        if (!ADMIN_CLOSE_REASONS.includes(reason)) return res.status(400).json({ error: "Invalid close reason" });
      }
      const updated = await store.updateIncident(
        incident.id,
        { status: OPEN_STATUSES, assignedTeamId: incident.assignedTeamId ?? null },
        { status: "CLOSED", isOpen: false, closeReason: reason },
        { status: "CLOSED", timestamp: nowIso() }
      );
      if (!updated) return res.status(409).json({ error: "The incident changed \u2014 refresh and try again" });
      if (updated.assignedTeamId) {
        const team = await store.getTeam(updated.assignedTeamId);
        if (team?.activeIncidentId === updated.id) {
          await store.updateTeam(team.id, { status: "AVAILABLE", activeIncidentId: null });
        }
      }
      res.json({ incident: updated });
    } catch (e) {
      next(e);
    }
  });
  r.post("/plans", requireRole("admin"), async (req, res, next) => {
    try {
      const plan = req.body;
      if (!plan || !str(plan.id, 64) || JSON.stringify(plan).length > 2e5) {
        return res.status(400).json({ error: "Invalid plan" });
      }
      await store.savePlan(plan);
      res.status(201).json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  r.post("/cap-broadcasts", requireRole("admin"), async (req, res, next) => {
    try {
      const doc = req.body;
      if (!doc || !str(doc.identifier, 200) || JSON.stringify(doc).length > 1e5) {
        return res.status(400).json({ error: "Invalid broadcast" });
      }
      await store.saveCapBroadcast(doc);
      res.status(201).json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  r.get("/weather", async (req, res) => {
    const scenario = scenarios[String(req.query.scenarioId)] ?? scenarios["flood-assam"];
    const zone = scenario.riskZones[0];
    const lat = zone.coordinates.lat;
    const lng = zone.coordinates.lng;
    const key = scenario.meta.id;
    const cached = weatherCache.get(key);
    if (cached && Date.now() - cached.at < WEATHER_TTL_MS) return res.json(cached.body);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&daily=precipitation_sum,precipitation_probability_max&forecast_days=3&timezone=auto`;
      const upstream = await fetch(url, { signal: AbortSignal.timeout(6e3) });
      if (!upstream.ok) throw new Error(`Open-Meteo ${upstream.status}`);
      const data = await upstream.json();
      const body = {
        available: true,
        source: "Open-Meteo",
        region: scenario.meta.region,
        state: scenario.meta.state,
        observedAt: data.current?.time ?? null,
        temperatureC: data.current?.temperature_2m ?? null,
        humidityPct: data.current?.relative_humidity_2m ?? null,
        precipitationMm: data.current?.precipitation ?? null,
        windKmh: data.current?.wind_speed_10m ?? null,
        weatherCode: data.current?.weather_code ?? null,
        forecast: (data.daily?.time ?? []).map((d, i) => ({
          date: d,
          rainMm: data.daily.precipitation_sum?.[i] ?? null,
          rainChancePct: data.daily.precipitation_probability_max?.[i] ?? null
        }))
      };
      weatherCache.set(key, { at: Date.now(), body });
      res.json(body);
    } catch (err) {
      console.warn("[Weather] upstream unavailable:", err.message);
      res.json({ available: false, source: "Open-Meteo", region: scenario.meta.region, state: scenario.meta.state });
    }
  });
  const EONET_TTL_MS = 15 * 60 * 1e3;
  let eonetCache = null;
  const centroid = (geom) => {
    if (geom?.type === "Point" && Array.isArray(geom.coordinates)) return [geom.coordinates[1], geom.coordinates[0]];
    if (geom?.type === "Polygon" && Array.isArray(geom.coordinates?.[0]) && geom.coordinates[0].length > 0) {
      const ring = geom.coordinates[0];
      const lat = ring.reduce((n, c) => n + c[1], 0) / ring.length;
      const lng = ring.reduce((n, c) => n + c[0], 0) / ring.length;
      return [lat, lng];
    }
    return null;
  };
  r.get("/events", async (_req, res) => {
    if (eonetCache && Date.now() - eonetCache.at < EONET_TTL_MS) return res.json(eonetCache.body);
    try {
      const upstream = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200&days=30", {
        signal: AbortSignal.timeout(8e3)
      });
      if (!upstream.ok) throw new Error(`EONET ${upstream.status}`);
      const data = await upstream.json();
      const events = (data.events ?? []).map((e) => {
        const geoms = e.geometry ?? [];
        const latest = geoms[geoms.length - 1];
        const point = centroid(latest);
        if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
        return {
          id: String(e.id),
          title: String(e.title ?? "Untitled event"),
          categoryId: String(e.categories?.[0]?.id ?? "other"),
          category: String(e.categories?.[0]?.title ?? "Other"),
          lat: point[0],
          lng: point[1],
          date: latest?.date ?? null,
          link: typeof e.link === "string" && e.link.startsWith("https://") ? e.link : null
        };
      }).filter(Boolean);
      const body = { available: true, source: "NASA EONET", fetchedAt: nowIso(), events };
      eonetCache = { at: Date.now(), body };
      res.json(body);
    } catch (err) {
      console.warn("[EONET] upstream unavailable:", err.message);
      if (eonetCache) return res.json({ ...eonetCache.body, stale: true });
      res.json({ available: false, source: "NASA EONET", events: [] });
    }
  });
  return r;
}

// server/app.ts
async function buildApp() {
  const app = express();
  const store = await createStore();
  if (process.env.TRUST_PROXY || process.env.VERCEL) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: "300kb" }));
  app.use("/api", createApiRouter(store));
  const CHAT_RATE_LIMIT_WINDOW_MS = 6e4;
  const CHAT_RATE_LIMIT_MAX_REQUESTS = 20;
  const chatRequestLog = /* @__PURE__ */ new Map();
  const isChatRateLimited = (ip) => {
    const now = Date.now();
    const timestamps = (chatRequestLog.get(ip) || []).filter(
      (t) => now - t < CHAT_RATE_LIMIT_WINDOW_MS
    );
    if (timestamps.length >= CHAT_RATE_LIMIT_MAX_REQUESTS) {
      chatRequestLog.set(ip, timestamps);
      return true;
    }
    timestamps.push(now);
    chatRequestLog.set(ip, timestamps);
    return false;
  };
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
      return null;
    }
    return new GoogleGenAI2({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  };
  app.post("/api/chat", attachSession, requireRole("admin", "rescue"), async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (isChatRateLimited(clientIp)) {
        return res.status(429).json({ error: "Too many requests \u2014 please slow down." });
      }
      const { context, conversationHistory } = req.body ?? {};
      const message = req.body?.message;
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }
      if (message.length > 2e3) {
        return res.status(400).json({ error: "Message is too long (2000 characters max)" });
      }
      const client2 = getGeminiClient();
      const scenario = context?.scenarioMeta;
      const zone = context?.selectedZone;
      const shelter = context?.selectedShelter;
      const route = context?.selectedRoute;
      const blockedRoadsList = Array.isArray(context?.blockedRoadsDetail) ? context.blockedRoadsDetail : [];
      const systemPrompt = `You are SURAKSHA-X AI Assistant, an elite disaster intelligence and relocation decision-support AI copilot for a multi-hazard relocation system.

You assist Admin, incident commanders, NDRF response teams, and civil administrators in making real-time, life-saving evacuation decisions.

CURRENT LIVE SITUATION & TELEMETRY CONTEXT:
- Active Disaster Scenario: ${scenario?.name || "Unknown Scenario"} (${scenario?.disasterType || ""} \u2014 ${scenario?.category || ""}) in ${scenario?.region || "the affected region"}, ${scenario?.state || ""}
- Active Selected Zone: ${zone?.name || "No zone selected"} (Risk Score: ${zone?.riskScore ?? "\u2014"}/100, Priority: ${zone?.priority || "\u2014"}, Population: ${zone?.population ?? "\u2014"}, Vulnerable Population: ${zone?.vulnerablePopulation ?? "\u2014"}, Hazard Intensity: +${zone?.floodDepthEstMeters ?? "\u2014"}m)
- Active Target Shelter: ${shelter?.name || "No shelter assigned"} (Available Capacity: ${shelter?.available ?? "\u2014"} beds, Elevation: +${shelter?.elevationMeters ?? "\u2014"}m MSL, Safety Score: ${shelter?.safetyScore ?? "\u2014"}/100)
- Active Recommended Evacuation Route: ${route?.destinationName || "No route selected"} (${route?.distanceKm ?? "\u2014"} km, ${route?.estimatedTimeMin ?? "\u2014"} min ETA, Safety Score: ${route?.safetyScore ?? "\u2014"}/100)
- Known Hazard Obstructions: ${blockedRoadsList.length > 0 ? blockedRoadsList.map((b, i) => `${i + 1}. ${b.name} (${b.severity})`).join("; ") : "None reported"}
- Monitored Region: ${scenario?.riverBasinOrFault || scenario?.region || "active hazard zone"} (Alert tier per active scenario)

RESPONSE GUIDELINES:
1. Provide precise, actionable tactical disaster intelligence. Be professional, clear, and structured.
2. Structure answers with bold section headers, bulleted action items, and safety scores.
3. If the user asks for a relocation plan, evacuation order, route advice, or vulnerability breakdown, provide a clear operational recommendation.
4. When relevant or requested to generate an order, include an official "OPERATIONAL RELOCATION DIRECTIVE" block with Order ID, Target Zone, Evacuation Route, Destination Shelter, and Priority Groups so the user can easily print the order.`;
      if (client2) {
        const candidateModels = GEMINI_MODELS.filter(modelAvailable);
        const contents = [];
        if (conversationHistory && Array.isArray(conversationHistory)) {
          for (const turn of conversationHistory.slice(-6)) {
            contents.push({
              role: turn.role === "assistant" ? "model" : "user",
              parts: [{ text: String(turn?.content ?? "").slice(0, 2e3) }]
            });
          }
        }
        contents.push({
          role: "user",
          parts: [
            {
              text: `[SYSTEM TELEMETRY CONTEXT: Scenario: ${scenario?.name || "Unknown"}, Active Zone: ${zone?.name || "None"}, Risk: ${zone?.riskScore ?? "\u2014"}, Vulnerable Pop: ${zone?.vulnerablePopulation ?? "\u2014"}, Target Shelter: ${shelter?.name || "None"}, Available Beds: ${shelter?.available ?? "\u2014"}]

User Question: ${message}`
            }
          ]
        });
        for (const modelName of candidateModels) {
          try {
            const response = await withTimeout(client2.models.generateContent({
              model: modelName,
              contents,
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.3,
                maxOutputTokens: 2048
              }
            }), 12e3);
            const replyText = response.text || "Operational response received from SURAKSHA-X intelligence core.";
            return res.json({
              reply: replyText,
              model: modelName,
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            });
          } catch (geminiError) {
            const errorMsg = geminiError?.message || String(geminiError);
            const isDemandOrRateLimit = errorMsg.includes("503") || errorMsg.includes("429") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("RESOURCE_EXHAUSTED");
            noteModelFailure(modelName, errorMsg);
            console.warn(`[Gemini API Warning - ${modelName} failed]: ${errorMsg.slice(0, 120)}... trying next model in cascade.`);
            if (isDemandOrRateLimit) {
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
          }
        }
      }
      const query = message.toLowerCase();
      let fallbackReply = "";
      const riskZonesSummary = Array.isArray(context?.riskZonesSummary) ? context.riskZonesSummary : [];
      const reliefCentresSummary = Array.isArray(context?.reliefCentresSummary) ? context.reliefCentresSummary : [];
      const demo = context?.demographics;
      if (query.includes("order") || query.includes("directive") || query.includes("evacuate") || query.includes("plan")) {
        const zoneName = zone?.name || scenario?.region || "the active zone";
        const shelterName = shelter?.name || "the nearest available relief centre";
        const vulnPop = zone?.vulnerablePopulation ?? 0;
        const routeName = route?.destinationName || "the primary corridor";
        fallbackReply = `### \u{1F4CB} OFFICIAL DISASTER RELOCATION DIRECTIVE
**Incident Command Protocol #PLAN-${Date.now().toString().slice(-6)}**
**DRAFT \u2014 pending Admin authorization**

- **Scenario:** ${scenario?.name || "Active Disaster Scenario"} (${scenario?.category || ""})
- **Target Zone:** ${zoneName} (${zone?.priority || "P1"} \u2014 Risk Score ${zone?.riskScore ?? "\u2014"}/100)
- **Target Relief Facility:** ${shelterName} (Verified ${shelter?.available ?? "\u2014"} beds available, +${shelter?.elevationMeters ?? "\u2014"}m MSL)
- **Primary Transit Corridor:** ${routeName} (${route?.distanceKm ?? "\u2014"} km \u2022 ${route?.estimatedTimeMin ?? "\u2014"} min ETA \u2022 ${route?.safetyScore ?? "\u2014"}% Safety)
- **Priority Evacuation Groups:**
  1. Pediatric & Geriatric residents (${vulnPop} individuals)
  2. Mobility-impaired & persons with disabilities
  3. High-exposure households
- **Immediate Tactical Action:**
  - Mobilize high-clearance Civil Defense transit convoys
  - Deploy traffic marshals along the recommended corridor
  - Bypass all known blocked or unsafe roads

*Click the **Print Order** button below to generate an official physical dispatch manifest.*`;
      } else if (query.includes("route") || query.includes("road") || query.includes("blocked") || query.includes("traffic")) {
        const obstructionsList = blockedRoadsList.length > 0 ? blockedRoadsList.map((b, i) => `${i + 1}. \u26D4 **${b.name}:** ${b.reason || b.severity}. **UNSAFE FOR TRANSIT.**`).join("\n") : "No blocked roads currently reported for this scenario.";
        fallbackReply = `### \u{1F6E3}\uFE0F REAL-TIME ROUTE & ROAD NETWORK INTELLIGENCE

**Current Obstructions:**
${obstructionsList}

**Recommended Safe Corridor:**
- \u2705 **${route?.destinationName || "Primary Corridor"} (RECOMMENDED):** ${route?.distanceKm ?? "\u2014"} km distance, ${route?.estimatedTimeMin ?? "\u2014"} min ETA, Safety Score ${route?.safetyScore ?? "\u2014"}/100.`;
      } else if (query.includes("shelter") || query.includes("relief") || query.includes("capacity") || query.includes("bed")) {
        const shelterLines = reliefCentresSummary.length > 0 ? reliefCentresSummary.map((s) => {
          const dot = s.status === "AVAILABLE" ? "\u{1F7E2}" : s.status === "NEAR_CAPACITY" ? "\u{1F7E1}" : "\u{1F534}";
          return `- ${dot} **${s.code} (${s.name}):** ${s.available} available beds (Capacity: ${s.capacity.toLocaleString()} | Occupancy: ${s.occupancy.toLocaleString()}).`;
        }).join("\n") : "No relief centre data available for this scenario.";
        fallbackReply = `### \u{1F3E5} RELIEF CENTRE NETWORK CAPACITY STATUS

${shelterLines}`;
      } else if (query.includes("vulnerab") || query.includes("people") || query.includes("elderly") || query.includes("children")) {
        const topZones = [...riskZonesSummary].sort((a, b) => (b.vulnerablePopulation || 0) - (a.vulnerablePopulation || 0)).slice(0, 3);
        const vulnBreakdown = Array.isArray(demo?.vulnerabilityDistribution) ? demo.vulnerabilityDistribution.map((v) => `  - ${v.category}: **${v.count.toLocaleString()} (${v.percentage}%)**`).join("\n") : "";
        fallbackReply = `### \u{1F465} DEMOGRAPHIC & VULNERABILITY HOTSPOT ANALYSIS

**High-Risk Population Summary across ${scenario?.region || "the affected region"}:**
- Total Citizens at Hazard Risk: **${demo?.totalPopulationAtRisk?.toLocaleString() ?? "\u2014"}**
- Total Prioritized Vulnerable: **${demo?.totalVulnerablePopulation?.toLocaleString() ?? "\u2014"}**
${vulnBreakdown}

**Highest Vulnerability Sectors:**
${topZones.map((z, i) => `${i + 1}. **${z.name}:** ${z.vulnerablePopulation ?? "\u2014"} vulnerable residents (Risk Score ${z.score})`).join("\n") || "No zone data available."}`;
      } else {
        fallbackReply = `### \u{1F310} SURAKSHA-X TACTICAL COMMAND INTELLIGENCE

Active monitoring in progress for **${scenario?.riverBasinOrFault || scenario?.region || "the active hazard zone"}**.

- **Active Monitored Zone:** ${zone?.name || "No zone selected"} (${zone?.riskScore ?? "\u2014"} Risk, Priority ${zone?.priority || "\u2014"})
- **Hazard Intensity Estimate:** +${zone?.floodDepthEstMeters ?? "\u2014"} meters
- **Priority Directive:** Immediate phased relocation to **${shelter?.name || "the recommended shelter"}** via **${route?.destinationName || "the primary corridor"}**
- **Road Network Status:** ${blockedRoadsList.length} known obstruction(s) reported; recommended corridor clear and secured.

*You can ask for route safety scores, generate official evacuation orders, check shelter beds, or inspect vulnerability indices.*`;
      }
      return res.json({
        reply: fallbackReply,
        model: "suraksha-tactical-engine (fallback)",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      console.error("[Chat API Internal Error]:", err);
      return res.status(500).json({ error: "Internal server error processing disaster intelligence request" });
    }
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  app.use("/api", (err, _req, res, _next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request too large" });
    if (err instanceof SyntaxError) return res.status(400).json({ error: "Invalid JSON" });
    console.error("[API Error]:", err);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

// api-src/handler.ts
var appPromise = null;
async function handler(req, res) {
  try {
    appPromise ??= buildApp();
    const app = await appPromise;
    app(req, res);
  } catch (err) {
    appPromise = null;
    console.error("[Vercel] startup failed:", err?.message ?? err);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Service unavailable: the API could not start (check MONGODB_URI and other environment variables)." }));
  }
}
export {
  handler as default
};
