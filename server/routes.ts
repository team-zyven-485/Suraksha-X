import crypto from 'crypto';
import { Router, type RequestHandler } from 'express';
import type { Store, IncidentDoc } from './store';
import { attachSession, checkAccessCode, issueToken, rateLimit, requireRole } from './security';
import { scenarios } from '../src/data/scenarios';
import { triageSOS } from '../src/shared/sosTriage';
import {
  SOS_DISASTER_TYPES,
  SOS_DISASTER_TYPE_LABELS,
  type SOSDisasterType,
  type SOSStatus,
} from '../src/types/sos';
import { initialRescueTeams } from '../src/data/rescueTeams';
import { getRoadAlternatives, getRoadRoute } from './routing';
import { generateSimParams } from './gemini';
import { SEVERITIES, severityFromPriority, validateParams, type Severity } from '../src/shared/hazardSim';
import { haversineKm, nearestZone } from '../src/shared/sosTriage';

const CITIZEN_TTL = 60 * 60 * 24 * 7; // 7 days — a phone may be offline for a while
const STAFF_TTL = 60 * 60 * 12; // 12 hours

// Forward-only moves the field team / admin may make.
const NEXT_STATUS: Partial<Record<SOSStatus, SOSStatus>> = {
  ASSIGNED: 'DISPATCHED',
  DISPATCHED: 'EN_ROUTE',
  EN_ROUTE: 'ARRIVED',
  ARRIVED: 'IN_PROGRESS',
  IN_PROGRESS: 'RESCUED',
  RESCUED: 'CLOSED',
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null;
const nowIso = () => new Date().toISOString();

// Crockford-style alphabet: no I, L, O, U — easy to read out over a radio.
const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function newIncidentId(): string {
  // 8 chars x 5 bits = 40 bits (~1.1 trillion ids). Collisions are still
  // possible in theory, so the insert below retries on a duplicate id.
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ID_ALPHABET[bytes[i] & 31];
  return `SOS-${out}`;
}

const OPEN_STATUSES: SOSStatus[] = ['REQUESTED', 'VERIFIED', 'ASSIGNED', 'DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];
const ADMIN_CLOSE_REASONS = ['FALSE_ALARM', 'DUPLICATE', 'OTHER'];

// Open-Meteo weather, cached so many dashboards don't hammer the free API.
const weatherCache = new Map<string, { at: number; body: unknown }>();
const WEATHER_TTL_MS = 10 * 60 * 1000;

export function createApiRouter(store: Store): Router {
  const r = Router();
  r.use(attachSession);

  r.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'SURAKSHA-X Disaster Intelligence API',
      database: store.kind,
      timestamp: nowIso(),
    });
  });

  // ---- auth -------------------------------------------------------------
  // Access-code guessing (admin/rescue) is limited tightly. Citizen sign-in has
  // no secret to guess, so it gets a much looser limit — many people share one
  // IP on a college/relief-camp network and must not be locked out together.
  const staffLoginLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    keyPrefix: 'login-staff:',
    message: 'Too many sign-in attempts. Wait a minute and try again.',
  });
  const citizenLoginLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    keyPrefix: 'login-citizen:',
    message: 'Too many requests. Please try again shortly.',
  });
  const loginLimiter: RequestHandler = (req, res, next) =>
    (req.body?.role === 'citizen' ? citizenLoginLimiter : staffLoginLimiter)(req, res, next);

  r.post('/auth/login', loginLimiter, (req, res) => {
    const { role, code, teamId, name, deviceId } = req.body ?? {};

    if (role === 'citizen') {
      // Citizens are anonymous by design (no account needed in an emergency),
      // but each device gets a stable id so its SOS history survives restarts
      // and a queued offline SOS lands on the same identity.
      const device = typeof deviceId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(deviceId) ? deviceId : null;
      const sub = `cit-${device ?? crypto.randomBytes(8).toString('hex')}`;
      const displayName = str(name, 60) ?? 'Citizen';
      const token = issueToken({ sub, role: 'citizen', name: displayName, teamId: null }, CITIZEN_TTL);
      return res.json({ token, user: { id: sub, name: displayName, role: 'citizen', teamId: null } });
    }

    if (role === 'admin' || role === 'rescue') {
      if (!checkAccessCode(role, code)) {
        return res.status(401).json({ error: 'Incorrect access code' });
      }
      if (role === 'admin') {
        const token = issueToken({ sub: 'admin-main', role: 'admin', name: 'Admin / Incident Commander', teamId: null }, STAFF_TTL);
        return res.json({ token, user: { id: 'admin-main', name: 'Admin / Incident Commander', role: 'admin', teamId: null } });
      }
      const team = initialRescueTeams.find((t) => t.id === teamId);
      if (!team) return res.status(400).json({ error: 'Choose a valid rescue team' });
      const token = issueToken({ sub: `team-${team.id}`, role: 'rescue', name: team.name, teamId: team.id }, STAFF_TTL);
      return res.json({ token, user: { id: `team-${team.id}`, name: team.name, role: 'rescue', teamId: team.id } });
    }

    return res.status(400).json({ error: 'Unknown role' });
  });

  r.get('/auth/me', requireRole(), (req, res) => {
    const s = req.session!;
    res.json({ user: { id: s.sub, name: s.name, role: s.role, teamId: s.teamId } });
  });

  // ---- teams ------------------------------------------------------------
  r.get('/teams', requireRole(), async (req, res, next) => {
    try {
      let teams = await store.listTeams();
      if (req.session!.role === 'citizen') {
        // A citizen may see where THEIR assigned team is — never the other teams.
        const open = await store.findOpenIncident(req.session!.sub);
        const visibleTeam = open?.assignedTeamId ?? null;
        teams = teams.map((t) => {
          if (t.id === visibleTeam) return t;
          const { location: _hidden, ...rest } = t;
          return rest as typeof t;
        });
      }
      res.json({ teams });
    } catch (e) {
      next(e);
    }
  });

  // A rescue team shares its live position (real GPS from the phone, or the
  // clearly flagged "demo drive"). A team can only update ITS OWN position.
  const lastTeamPing = new Map<string, number>();
  r.post('/teams/:id/location', requireRole('rescue'), async (req, res, next) => {
    try {
      const s = req.session!;
      if (s.teamId !== req.params.id) return res.status(403).json({ error: 'You can only update your own team' });

      if (req.body?.clear === true) {
        await store.updateTeam(req.params.id, { location: null });
        lastTeamPing.delete(req.params.id);
        return res.json({ ok: true, cleared: true });
      }

      const { lat, lng, accuracy, simulated } = req.body ?? {};
      if (!isNum(lat) || !isNum(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Valid coordinates are required' });
      }
      const now = Date.now();
      if (now - (lastTeamPing.get(req.params.id) ?? 0) < 1500) {
        return res.status(429).json({ error: 'Location updates are limited to one every 1.5 seconds' });
      }
      lastTeamPing.set(req.params.id, now);

      const ok = await store.updateTeam(req.params.id, {
        location: {
          lat,
          lng,
          accuracy: isNum(accuracy) && accuracy >= 0 && accuracy < 100_000 ? Math.round(accuracy) : null,
          updatedAt: nowIso(),
          simulated: simulated === true,
        },
      });
      if (!ok) return res.status(404).json({ error: 'Unknown team' });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---- real road routing (OSRM / OpenStreetMap) ---------------------------------
  const routeLimiter = rateLimit({ windowMs: 60_000, max: 40, keyPrefix: 'route:', message: 'Too many route requests. Please wait a moment.' });
  // Up to three alternative road routes, so the client can choose the one that best avoids a hazard.
  r.get('/route/alternatives', requireRole(), routeLimiter, async (req, res) => {
    const q = (k: string) => Number(req.query[k]);
    const [fromLat, fromLng, toLat, toLng] = [q('fromLat'), q('fromLng'), q('toLat'), q('toLng')];
    const ok = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    if (!ok(fromLat, fromLng) || !ok(toLat, toLng)) return res.status(400).json({ error: 'Valid coordinates are required' });
    try {
      const routes = await getRoadAlternatives({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
      if (routes.length === 0) return res.json({ available: false, reason: 'No road route found between these points' });
      res.json({ available: true, routes });
    } catch (err) {
      console.warn('[Routing] alternatives unavailable:', (err as Error).message);
      res.json({ available: false, reason: 'Routing service unavailable' });
    }
  });

  r.get('/route', requireRole(), routeLimiter, async (req, res) => {
    const q = (k: string) => Number(req.query[k]);
    const [fromLat, fromLng, toLat, toLng] = [q('fromLat'), q('fromLng'), q('toLat'), q('toLng')];
    const ok = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    if (!ok(fromLat, fromLng) || !ok(toLat, toLng)) return res.status(400).json({ error: 'Valid coordinates are required' });
    // Optional single via waypoint (used to try a detour around a hazard zone).
    const hasVia = req.query.viaLat !== undefined || req.query.viaLng !== undefined;
    const via = hasVia ? { lat: q('viaLat'), lng: q('viaLng') } : undefined;
    if (via && !ok(via.lat, via.lng)) return res.status(400).json({ error: 'Valid via coordinates are required' });
    try {
      const route = await getRoadRoute({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }, via);
      if (!route) return res.json({ available: false, reason: 'No road route found between these points' });
      res.json(route);
    } catch (err) {
      console.warn('[Routing] upstream unavailable:', (err as Error).message);
      res.json({ available: false, reason: 'Routing service unavailable' });
    }
  });

  // ---- SOS --------------------------------------------------------------
  const sosLimiter = rateLimit({ windowMs: 60_000, max: 12, keyPrefix: 'sos:', message: 'Too many SOS requests. If this is urgent, call 112.' });

  r.post('/sos', requireRole('citizen'), sosLimiter, async (req, res, next) => {
    try {
      const { scenarioId, coordinates, disasterType, isDemoLocation, clientRequestId } = req.body ?? {};
      const scenario = typeof scenarioId === 'string' ? scenarios[scenarioId] : undefined;
      if (!scenario) return res.status(400).json({ error: 'Unknown scenario' });
      if (
        !coordinates ||
        !isNum(coordinates.lat) || !isNum(coordinates.lng) ||
        coordinates.lat < -90 || coordinates.lat > 90 ||
        coordinates.lng < -180 || coordinates.lng > 180
      ) {
        return res.status(400).json({ error: 'Valid coordinates are required' });
      }
      if (!SOS_DISASTER_TYPES.includes(disasterType)) return res.status(400).json({ error: 'Unknown disaster type' });
      const reqId = clientRequestId === undefined ? null : str(clientRequestId, 64);
      if (clientRequestId !== undefined && !reqId) return res.status(400).json({ error: 'Invalid clientRequestId' });

      const citizen = req.session!;

      // Idempotency: the offline queue may re-send after a flaky connection.
      if (reqId) {
        const existing = await store.findIncidentByClientRequest(citizen.sub, reqId);
        if (existing) return res.status(200).json({ incident: existing, duplicate: true });
      }

      // The server — not the client — decides risk, priority and the
      // recommended team, so a tampered request cannot fake a P1 or hide a P3.
      const teams = await store.listTeams();
      const triage = triageSOS({
        zones: scenario.riskZones,
        teams,
        coordinates: { lat: coordinates.lat, lng: coordinates.lng },
        disasterType: disasterType as SOSDisasterType,
        fallbackRegion: scenario.meta.region,
      });

      const queuedOffline = req.body.viaOfflineQueue === true;
      const created = nowIso();
      const doc: IncidentDoc = {
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
        hazard: SOS_DISASTER_TYPE_LABELS[disasterType as SOSDisasterType],
        status: 'REQUESTED',
        communicationMode: queuedOffline ? 'Offline Queue (Store & Forward)' : 'Mobile Network',
        assignedTeamId: null,
        instructions: null,
        etaMin: null,
        createdAt: created,
        statusHistory: [{ status: 'REQUESTED', timestamp: created }],
        syncState: 'SYNCED',
        clientRequestId: reqId,
      };

      // The database enforces three uniqueness rules; tell them apart by the
      // violated key: id (retry with a new id), clientRequestId (this exact
      // request was already stored), or citizenId alone (already has an open SOS).
      for (let attempt = 0; ; attempt++) {
        try {
          await store.insertIncident(doc);
          return res.status(201).json({ incident: doc });
        } catch (e: any) {
          if (e?.code !== 11000) throw e;
          const key = Object.keys(e.keyPattern ?? {});
          if (key.includes('clientRequestId') && reqId) {
            const existing = await store.findIncidentByClientRequest(citizen.sub, reqId);
            if (existing) return res.status(200).json({ incident: existing, duplicate: true });
          }
          if (key.length === 1 && key[0] === 'citizenId') {
            const open = await store.findOpenIncident(citizen.sub);
            return res.status(409).json({ error: 'You already have an active SOS', incident: open });
          }
          if (key.includes('id') && attempt < 5) {
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

  r.get('/sos', requireRole(), async (req, res, next) => {
    try {
      const s = req.session!;
      // Citizens only ever see their own incidents. Rescue teams see all
      // incidents (shared situational awareness during an operation).
      const incidents = await store.listIncidents(s.role === 'citizen' ? { citizenId: s.sub } : undefined);
      res.json({ incidents });
    } catch (e) {
      next(e);
    }
  });

  r.post('/sos/:id/assign', requireRole('admin'), async (req, res, next) => {
    try {
      const { teamId, priority, requiredAction, notes } = req.body ?? {};
      const team = await store.getTeam(String(teamId));
      if (!team) return res.status(400).json({ error: 'Unknown team' });
      if (priority !== undefined && !['P1', 'P2', 'P3'].includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
      const action = str(requiredAction, 300) ?? 'Proceed to incident location and assess situation';
      const note = typeof notes === 'string' ? notes.slice(0, 600) : '';

      const incident = await store.getIncident(req.params.id);
      if (!incident) return res.status(404).json({ error: 'Incident not found' });

      // Reserve the team first (atomic: only if still AVAILABLE)…
      const reserved = await store.updateTeam(team.id, { status: 'ASSIGNED', activeIncidentId: incident.id }, ['AVAILABLE']);
      if (!reserved) return res.status(409).json({ error: 'That team is no longer available' });

      // …then attach it to the incident (atomic: only if still unassigned).
      const stamp = nowIso();
      const finalPriority = priority ?? incident.priority;
      const updated = await store.updateIncident(
        incident.id,
        { assignedTeamId: null, status: ['REQUESTED', 'VERIFIED'] },
        {
          assignedTeamId: team.id,
          etaMin: team.baseEtaMin,
          priority: finalPriority,
          status: 'ASSIGNED',
          instructions: {
            priority: finalPriority,
            requiredAction: action,
            notes: note,
            issuedBy: req.session!.name,
            issuedAt: stamp,
          },
        },
        { status: 'ASSIGNED', timestamp: stamp }
      );
      if (!updated) {
        // Someone else assigned it first — release the team we just reserved.
        await store.updateTeam(team.id, { status: 'AVAILABLE', activeIncidentId: null });
        return res.status(409).json({ error: 'This incident was already assigned' });
      }
      res.json({ incident: updated });
    } catch (e) {
      next(e);
    }
  });

  r.post('/sos/:id/status', requireRole('admin', 'rescue'), async (req, res, next) => {
    try {
      const s = req.session!;
      const incident = await store.getIncident(req.params.id);
      if (!incident) return res.status(404).json({ error: 'Incident not found' });

      // A rescue team may only touch incidents assigned to its own team.
      if (s.role === 'rescue' && incident.assignedTeamId !== s.teamId) {
        return res.status(403).json({ error: 'This incident is not assigned to your team' });
      }
      const next_ = NEXT_STATUS[incident.status];
      if (!next_ || req.body?.status !== next_) {
        return res.status(409).json({ error: `Invalid status change from ${incident.status}` });
      }

      const updated = await store.updateIncident(
        incident.id,
        { status: [incident.status], assignedTeamId: incident.assignedTeamId ?? null },
        { status: next_, isOpen: next_ !== 'RESCUED' && next_ !== 'CLOSED' },
        { status: next_, timestamp: nowIso() }
      );
      if (!updated) return res.status(409).json({ error: 'The incident changed — refresh and try again' });

      if (updated.assignedTeamId) {
        if (next_ === 'RESCUED' || next_ === 'CLOSED') {
          await store.updateTeam(updated.assignedTeamId, { status: 'AVAILABLE', activeIncidentId: null });
        } else if (next_ === 'DISPATCHED' || next_ === 'EN_ROUTE') {
          await store.updateTeam(updated.assignedTeamId, { status: 'DISPATCHED' });
        }
      }
      res.json({ incident: updated });
    } catch (e) {
      next(e);
    }
  });

  // Hazard scenario simulation for an incident: Gemini proposes bounded
  // parameters, our code validates them (rule-based defaults fill any gap or a
  // missing key). Cached per incident + severity so every viewer sees the same
  // sketch and Gemini quota is spent once.
  const simLimiter = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'sim:', message: 'Too many simulation requests. Please wait a moment.' });
  const simCache = new Map<string, { at: number; ttl: number; body: unknown }>();
  const simInflight = new Map<string, Promise<unknown>>();
  const SIM_TTL_MS = 60 * 60 * 1000;
  const SIM_FALLBACK_TTL_MS = 2 * 60 * 1000; // a failed Gemini attempt is retried soon
  const SIM_QUICK_WAIT_MS = 8000;

  r.post('/sos/:id/simulation', requireRole(), simLimiter, async (req, res, next) => {
    try {
      const s = req.session!;
      const incident = await store.getIncident(req.params.id);
      // Citizens can only simulate their own incident; staff can simulate any.
      if (!incident || (s.role === 'citizen' && incident.citizenId !== s.sub)) {
        return res.status(404).json({ error: 'Incident not found' });
      }
      const requested = req.body?.severity;
      const severity: Severity = SEVERITIES.includes(requested) ? requested : severityFromPriority(incident.priority);

      const key = `${incident.id}|${severity}`;
      const cached = simCache.get(key);
      if (cached && Date.now() - cached.at < cached.ttl) return res.json(cached.body);

      // Plain facts from the bundled sample scenario, only when the SOS is inside its coverage.
      const scenario = scenarios[incident.scenarioId];
      const context: string[] = [];
      if (scenario) {
        const zone = nearestZone(scenario.riskZones, incident.coordinates);
        if (zone && haversineKm(zone.coordinates, incident.coordinates) <= 100) {
          context.push(`Sample region: ${scenario.meta.region}, ${scenario.meta.state}`);
          context.push(`Nearest sample zone: ${zone.name} (${zone.district}), risk ${zone.riskLevel}`);
        }
      }
      context.push(`Reported hazard type: ${incident.hazard}`);

      const buildBody = (generated: { raw: unknown; model: string } | null) => ({
        params: validateParams(generated?.raw, incident.disasterType, severity, incident.coordinates),
        engine: generated ? 'gemini' : 'rule-based',
        model: generated?.model ?? null,
        generatedAt: nowIso(),
        disclaimer: 'Pure simulation. No real-time sensor, satellite, weather or terrain data was used.',
      });

      // Gemini can be slow or overloaded. Start (or join) the generation, give it a few
      // seconds, and otherwise answer at once with the rule-based sketch while Gemini
      // keeps working; the result is cached so the next request is upgraded.
      let job = simInflight.get(key);
      if (!job) {
        job = generateSimParams({ hazard: incident.disasterType, severity, origin: incident.coordinates, context })
          .then((generated) => {
            const body = buildBody(generated);
            if (simCache.size > 300) simCache.delete(simCache.keys().next().value as string);
            simCache.set(key, { at: Date.now(), ttl: generated ? SIM_TTL_MS : SIM_FALLBACK_TTL_MS, body });
            return body;
          })
          .finally(() => simInflight.delete(key));
        simInflight.set(key, job);
      }
      const quick = await Promise.race([job, new Promise<null>((resolve) => setTimeout(() => resolve(null), SIM_QUICK_WAIT_MS))]);
      if (quick) return res.json(quick);
      return res.json({ ...buildBody(null), upgrading: true });
    } catch (e) {
      next(e);
    }
  });

  // Close an incident without a rescue. A citizen may cancel their OWN SOS
  // before a team is assigned; an admin may close any open incident as a
  // false alarm / duplicate / other. Frees the assigned team, if any.
  r.post('/sos/:id/cancel', requireRole('citizen', 'admin'), async (req, res, next) => {
    try {
      const s = req.session!;
      const incident = await store.getIncident(req.params.id);
      if (!incident) return res.status(404).json({ error: 'Incident not found' });
      if (!incident.isOpen) return res.status(409).json({ error: 'This incident is already closed' });

      let reason: string;
      if (s.role === 'citizen') {
        if (incident.citizenId !== s.sub) return res.status(404).json({ error: 'Incident not found' });
        if (incident.assignedTeamId) {
          return res.status(409).json({ error: 'A rescue team is already assigned. Please contact Rescue Control.' });
        }
        reason = 'CANCELLED_BY_CITIZEN';
      } else {
        reason = String(req.body?.reason ?? '');
        if (!ADMIN_CLOSE_REASONS.includes(reason)) return res.status(400).json({ error: 'Invalid close reason' });
      }

      const updated = await store.updateIncident(
        incident.id,
        { status: OPEN_STATUSES, assignedTeamId: incident.assignedTeamId ?? null },
        { status: 'CLOSED', isOpen: false, closeReason: reason },
        { status: 'CLOSED', timestamp: nowIso() }
      );
      if (!updated) return res.status(409).json({ error: 'The incident changed — refresh and try again' });

      if (updated.assignedTeamId) {
        const team = await store.getTeam(updated.assignedTeamId);
        if (team?.activeIncidentId === updated.id) {
          await store.updateTeam(team.id, { status: 'AVAILABLE', activeIncidentId: null });
        }
      }
      res.json({ incident: updated });
    } catch (e) {
      next(e);
    }
  });

  // ---- admin records ------------------------------------------------------
  r.post('/plans', requireRole('admin'), async (req, res, next) => {
    try {
      const plan = req.body;
      if (!plan || !str(plan.id, 64) || JSON.stringify(plan).length > 200_000) {
        return res.status(400).json({ error: 'Invalid plan' });
      }
      await store.savePlan(plan);
      res.status(201).json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.post('/cap-broadcasts', requireRole('admin'), async (req, res, next) => {
    try {
      const doc = req.body;
      if (!doc || !str(doc.identifier, 200) || JSON.stringify(doc).length > 100_000) {
        return res.status(400).json({ error: 'Invalid broadcast' });
      }
      await store.saveCapBroadcast(doc);
      res.status(201).json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---- weather (Open-Meteo: free, no API key) -------------------------------
  r.get('/weather', async (req, res) => {
    const scenario = scenarios[String(req.query.scenarioId)] ?? scenarios['flood-assam'];
    const zone = scenario.riskZones[0];
    const lat = zone.coordinates.lat;
    const lng = zone.coordinates.lng;
    const key = scenario.meta.id;

    const cached = weatherCache.get(key);
    if (cached && Date.now() - cached.at < WEATHER_TTL_MS) return res.json(cached.body);

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code` +
        `&daily=precipitation_sum,precipitation_probability_max&forecast_days=3&timezone=auto`;
      const upstream = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!upstream.ok) throw new Error(`Open-Meteo ${upstream.status}`);
      const data: any = await upstream.json();
      const body = {
        available: true,
        source: 'Open-Meteo',
        region: scenario.meta.region,
        state: scenario.meta.state,
        observedAt: data.current?.time ?? null,
        temperatureC: data.current?.temperature_2m ?? null,
        humidityPct: data.current?.relative_humidity_2m ?? null,
        precipitationMm: data.current?.precipitation ?? null,
        windKmh: data.current?.wind_speed_10m ?? null,
        weatherCode: data.current?.weather_code ?? null,
        forecast: (data.daily?.time ?? []).map((d: string, i: number) => ({
          date: d,
          rainMm: data.daily.precipitation_sum?.[i] ?? null,
          rainChancePct: data.daily.precipitation_probability_max?.[i] ?? null,
        })),
      };
      weatherCache.set(key, { at: Date.now(), body });
      res.json(body);
    } catch (err) {
      console.warn('[Weather] upstream unavailable:', (err as Error).message);
      // Honest degradation: say it's unavailable instead of inventing numbers.
      res.json({ available: false, source: 'Open-Meteo', region: scenario.meta.region, state: scenario.meta.state });
    }
  });

  // ---- NASA EONET: live open natural events worldwide (no API key needed) ----
  const EONET_TTL_MS = 15 * 60 * 1000;
  let eonetCache: { at: number; body: unknown } | null = null;

  const centroid = (geom: any): [number, number] | null => {
    // EONET coordinates are [lng, lat]; polygons are rings of such points.
    if (geom?.type === 'Point' && Array.isArray(geom.coordinates)) return [geom.coordinates[1], geom.coordinates[0]];
    if (geom?.type === 'Polygon' && Array.isArray(geom.coordinates?.[0]) && geom.coordinates[0].length > 0) {
      const ring: number[][] = geom.coordinates[0];
      const lat = ring.reduce((n, c) => n + c[1], 0) / ring.length;
      const lng = ring.reduce((n, c) => n + c[0], 0) / ring.length;
      return [lat, lng];
    }
    return null;
  };

  r.get('/events', async (_req, res) => {
    if (eonetCache && Date.now() - eonetCache.at < EONET_TTL_MS) return res.json(eonetCache.body);
    try {
      const upstream = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200&days=30', {
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) throw new Error(`EONET ${upstream.status}`);
      const data: any = await upstream.json();
      const events = (data.events ?? [])
        .map((e: any) => {
          const geoms: any[] = e.geometry ?? [];
          const latest = geoms[geoms.length - 1];
          const point = centroid(latest);
          if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
          return {
            id: String(e.id),
            title: String(e.title ?? 'Untitled event'),
            categoryId: String(e.categories?.[0]?.id ?? 'other'),
            category: String(e.categories?.[0]?.title ?? 'Other'),
            lat: point[0],
            lng: point[1],
            date: latest?.date ?? null,
            link: typeof e.link === 'string' && e.link.startsWith('https://') ? e.link : null,
          };
        })
        .filter(Boolean);
      const body = { available: true, source: 'NASA EONET', fetchedAt: nowIso(), events };
      eonetCache = { at: Date.now(), body };
      res.json(body);
    } catch (err) {
      console.warn('[EONET] upstream unavailable:', (err as Error).message);
      // Serve slightly stale data rather than nothing, if we have it.
      if (eonetCache) return res.json({ ...(eonetCache.body as object), stale: true });
      res.json({ available: false, source: 'NASA EONET', events: [] });
    }
  });

  return r;
}
