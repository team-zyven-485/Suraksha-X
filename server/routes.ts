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

function newIncidentId(): string {
  // 30 bits of randomness, readable: SOS-7K3Q9A. (Date-based ids collide.)
  return `SOS-${crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
}

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
  r.get('/teams', requireRole(), async (_req, res, next) => {
    try {
      res.json({ teams: await store.listTeams() });
    } catch (e) {
      next(e);
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

      try {
        await store.insertIncident(doc);
      } catch (e: any) {
        // Lost a race against a duplicate send of the same clientRequestId.
        if (e?.code === 11000 && reqId) {
          const existing = await store.findIncidentByClientRequest(citizen.sub, reqId);
          if (existing) return res.status(200).json({ incident: existing, duplicate: true });
        }
        throw e;
      }
      res.status(201).json({ incident: doc });
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
        { status: next_ },
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

  return r;
}
