/**
 * End-to-end API check against a RUNNING server (npm run dev / npm start).
 *
 *   ADMIN_ACCESS_CODE=... RESCUE_ACCESS_CODE=... npm run test:api
 *
 * The codes are read from .env automatically if the env vars are not set.
 * Creates real SOS incidents on whatever database the server is using — point
 * it at a throwaway database, not production.
 */
import fs from 'node:fs';

const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

function loadEnvFile() {
  try {
    for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  } catch {}
}
loadEnvFile();
const ADMIN_CODE = process.env.ADMIN_ACCESS_CODE;
const RESCUE_CODE = process.env.RESCUE_ACCESS_CODE;

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const RUN = Date.now().toString(36); // fresh citizens every run, so reruns against a real DB never collide

const sos = (extra = {}) => ({
  scenarioId: 'flood-assam',
  coordinates: { lat: 26.185, lng: 91.735 },
  disasterType: 'FLOOD',
  isDemoLocation: true,
  ...extra,
});

console.log(`API smoke test against ${BASE}`);

const health = await call('GET', '/health');
check('health responds', health.status === 200 && health.json?.status === 'ok');
console.log(`       database: ${health.json?.database}`);

// ---- authentication
console.log('auth');
check('admin login without a code is rejected', (await call('POST', '/auth/login', { body: { role: 'admin' } })).status === 401);
check('admin login with a wrong code is rejected', (await call('POST', '/auth/login', { body: { role: 'admin', code: 'wrong' } })).status === 401);
check('rescue login with a wrong code is rejected', (await call('POST', '/auth/login', { body: { role: 'rescue', code: 'wrong', teamId: 'team-alpha' } })).status === 401);
check('unknown role is rejected', (await call('POST', '/auth/login', { body: { role: 'root' } })).status === 400);

const admin = await call('POST', '/auth/login', { body: { role: 'admin', code: ADMIN_CODE } });
check('admin login with the right code works', admin.status === 200 && !!admin.json?.token, `(status ${admin.status}; are ADMIN_ACCESS_CODE/.env set?)`);
const rescue = await call('POST', '/auth/login', { body: { role: 'rescue', code: RESCUE_CODE, teamId: 'team-alpha' } });
check('rescue login with the right code works', rescue.status === 200 && !!rescue.json?.token);
const citizenA = await call('POST', '/auth/login', { body: { role: 'citizen', deviceId: `smoke-a-${RUN}-aaaa` } });
const citizenB = await call('POST', '/auth/login', { body: { role: 'citizen', deviceId: `smoke-b-${RUN}-bbbb` } });
check('citizen login works without a code', citizenA.status === 200 && !!citizenA.json?.token);
check('citizen identity is stable per device', (await call('POST', '/auth/login', { body: { role: 'citizen', deviceId: `smoke-a-${RUN}-aaaa` } })).json?.user?.id === citizenA.json?.user?.id);
const tokA = citizenA.json?.token, tokB = citizenB.json?.token, tokAdmin = admin.json?.token, tokRescue = rescue.json?.token;

const tampered = tokA ? tokA.slice(0, -3) + (tokA.endsWith('aaa') ? 'bbb' : 'aaa') : 'x';
check('a tampered token is rejected', (await call('GET', '/auth/me', { token: tampered })).status === 401);
check('no token is rejected', (await call('GET', '/sos')).status === 401);
check('a citizen cannot promote themselves by editing the token payload', await (async () => {
  const [, sig] = tokA.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'x', role: 'admin', name: 'x', teamId: null, exp: 9999999999 })).toString('base64url');
  return (await call('GET', '/auth/me', { token: `${forged}.${sig}` })).status === 401;
})());

// ---- SOS creation
console.log('sos');
check('admin cannot raise a citizen SOS', (await call('POST', '/sos', { token: tokAdmin, body: sos() })).status === 403);
check('invalid coordinates rejected', (await call('POST', '/sos', { token: tokA, body: sos({ coordinates: { lat: 999, lng: 0 } }) })).status === 400);
check('unknown disaster type rejected', (await call('POST', '/sos', { token: tokA, body: sos({ disasterType: 'ALIENS' }) })).status === 400);

const reqId = 'smoke-req-' + Date.now();
// Client tries to cheat: claims P3 / risk 1 / a different citizen. Server must ignore it.
const created = await call('POST', '/sos', { token: tokA, body: sos({ clientRequestId: reqId, priority: 'P3', riskScore: 1, citizenId: 'someone-else' }) });
check('citizen can raise an SOS', created.status === 201 && !!created.json?.incident?.id);
const inc = created.json?.incident;
check('server computes risk score itself', inc && inc.riskScore > 1);
check('SOS is owned by the authenticated citizen, not the request body', inc?.citizenId === citizenA.json?.user?.id);
const again = await call('POST', '/sos', { token: tokA, body: sos({ clientRequestId: reqId }) });
check('re-sending the same clientRequestId does not duplicate', again.status === 200 && again.json?.duplicate === true && again.json?.incident?.id === inc?.id);
const second_ = await call('POST', '/sos', { token: tokA, body: sos({ clientRequestId: 'smoke-second-' + RUN }) });
check('a citizen cannot open a second SOS while one is active (409, returns the active one)', second_.status === 409 && second_.json?.incident?.id === inc?.id);
check('SOS ids are long enough to avoid collisions', /^SOS-[0-9A-Z]{8}$/.test(inc?.id ?? ''));

// ---- visibility
console.log('visibility');
check('citizen sees their own SOS', (await call('GET', '/sos', { token: tokA })).json?.incidents?.some((i) => i.id === inc?.id));
check("a different citizen cannot see someone else's SOS", !(await call('GET', '/sos', { token: tokB })).json?.incidents?.some((i) => i.id === inc?.id));
check('admin sees the SOS', (await call('GET', '/sos', { token: tokAdmin })).json?.incidents?.some((i) => i.id === inc?.id));

// ---- authorization on actions
console.log('authorization');
const assignBody = { teamId: 'team-alpha', priority: 'P1', requiredAction: 'Evacuate victim', notes: 'smoke test' };
check('citizen cannot assign a team', (await call('POST', `/sos/${inc.id}/assign`, { token: tokA, body: assignBody })).status === 403);
check('rescue cannot assign a team', (await call('POST', `/sos/${inc.id}/assign`, { token: tokRescue, body: assignBody })).status === 403);
check('rescue cannot move an unassigned incident', (await call('POST', `/sos/${inc.id}/status`, { token: tokRescue, body: { status: 'DISPATCHED' } })).status === 403);
check('citizen cannot save a relocation plan', (await call('POST', '/plans', { token: tokA, body: { id: 'PLAN-X' } })).status === 403);
check('citizen cannot log a CAP broadcast', (await call('POST', '/cap-broadcasts', { token: tokA, body: { identifier: 'CAP-X' } })).status === 403);
check('chat requires a signed-in staff user', (await call('POST', '/chat', { body: { message: 'hi' } })).status === 401);

// ---- lifecycle
console.log('lifecycle');
const assigned = await call('POST', `/sos/${inc.id}/assign`, { token: tokAdmin, body: assignBody });
check('admin can assign a team', assigned.status === 200 && assigned.json?.incident?.status === 'ASSIGNED');
const second = await call('POST', `/sos/${inc.id}/assign`, { token: tokAdmin, body: { ...assignBody, teamId: 'team-delta' } });
check('an already-assigned incident cannot be assigned again', second.status === 409);

const incB = (await call('POST', '/sos', { token: tokB, body: sos({ clientRequestId: 'smoke-b-' + Date.now() }) })).json?.incident;
const clash = await call('POST', `/sos/${incB.id}/assign`, { token: tokAdmin, body: assignBody });
check('a busy team cannot be assigned a second incident', clash.status === 409);

check('status cannot skip steps', (await call('POST', `/sos/${inc.id}/status`, { token: tokAdmin, body: { status: 'RESCUED' } })).status === 409);
const wrongTeam = (await call('POST', '/auth/login', { body: { role: 'rescue', code: RESCUE_CODE, teamId: 'team-bravo' } })).json?.token;
check("another team cannot touch this team's incident", (await call('POST', `/sos/${inc.id}/status`, { token: wrongTeam, body: { status: 'DISPATCHED' } })).status === 403);

// ---- live team location
console.log('live tracking');
const here = { lat: 26.17, lng: 91.74, accuracy: 12 };
check('a team can share its own live location', (await call('POST', '/teams/team-alpha/location', { token: tokRescue, body: here })).status === 200);
check('a team cannot update another team', (await call('POST', '/teams/team-alpha/location', { token: wrongTeam, body: here })).status === 403);
check('a citizen cannot post team locations', (await call('POST', '/teams/team-alpha/location', { token: tokA, body: here })).status === 403);
check('an admin cannot post team locations', (await call('POST', '/teams/team-alpha/location', { token: tokAdmin, body: here })).status === 403);
check('invalid coordinates are rejected', (await call('POST', '/teams/team-alpha/location', { token: tokRescue, body: { lat: 500, lng: 0 } })).status === 400);
check('updates are throttled', (await call('POST', '/teams/team-alpha/location', { token: tokRescue, body: here })).status === 429);
const adminTeams = (await call('GET', '/teams', { token: tokAdmin })).json?.teams ?? [];
check('admin sees the live location (and the flag that says it is real GPS)', adminTeams.find((t) => t.id === 'team-alpha')?.location?.lat === 26.17 && adminTeams.find((t) => t.id === 'team-alpha')?.location?.simulated === false);
const teamsForA = (await call('GET', '/teams', { token: tokA })).json?.teams ?? [];
check('the citizen the team is assigned to can see it', teamsForA.find((t) => t.id === 'team-alpha')?.location?.lat === 26.17);
const teamsForB = (await call('GET', '/teams', { token: tokB })).json?.teams ?? [];
check('a different citizen cannot see any team location', teamsForB.every((t) => t.location === undefined));
await new Promise((r) => setTimeout(r, 1600));
check('a team can stop sharing (location cleared)', (await call('POST', '/teams/team-alpha/location', { token: tokRescue, body: { clear: true } })).status === 200 && !((await call('GET', '/teams', { token: tokAdmin })).json?.teams ?? []).find((t) => t.id === 'team-alpha')?.location);

console.log('hazard simulation');
const simA = await call('POST', `/sos/${inc.id}/simulation`, { token: tokA, body: {} });
check('the citizen can request a simulation for their own SOS', simA.status === 200 && !!simA.json?.params && ['gemini', 'rule-based'].includes(simA.json?.engine));
console.log(`       engine: ${simA.json?.engine}${simA.json?.model ? ` (${simA.json.model})` : ''}`);
check('the simulation is validated: right hazard, bounded extent, allowed fields only', simA.json?.params?.hazard === 'FLOOD' && simA.json.params.lengthKm > 0 && simA.json.params.lengthKm <= 20 && simA.json.params.markers.length <= 6 && typeof simA.json.params.narrative === 'string');
check('severity defaults from the incident priority', ['SEVERE', 'MODERATE', 'LOW'].includes(simA.json?.params?.severity));
check("another citizen cannot simulate someone else's incident", (await call('POST', `/sos/${inc.id}/simulation`, { token: tokB, body: {} })).status === 404);
check('admin can simulate any incident and choose a severity', (await call('POST', `/sos/${inc.id}/simulation`, { token: tokAdmin, body: { severity: 'EXTREME' } })).json?.params?.severity === 'EXTREME');
check('an invalid severity is ignored, not trusted', ['SEVERE', 'MODERATE', 'LOW'].includes((await call('POST', `/sos/${inc.id}/simulation`, { token: tokAdmin, body: { severity: 'APOCALYPSE' } })).json?.params?.severity));
check('simulation requires sign-in', (await call('POST', `/sos/${inc.id}/simulation`, { body: {} })).status === 401);
check('unknown incident is a 404', (await call('POST', '/sos/SOS-NOPE0000/simulation', { token: tokAdmin, body: {} })).status === 404);

console.log('routing');
check('routing requires sign-in', (await call('GET', '/route?fromLat=26.14&fromLng=91.73&toLat=26.18&toLng=91.73')).status === 401);
check('routing rejects bad coordinates', (await call('GET', '/route?fromLat=abc&fromLng=91.73&toLat=26.18&toLng=91.73', { token: tokA })).status === 400);
check('alternatives require sign-in', (await call('GET', '/route/alternatives?fromLat=26.14&fromLng=91.73&toLat=26.18&toLng=91.73')).status === 401);
check('alternatives reject bad coordinates', (await call('GET', '/route/alternatives?fromLat=x&fromLng=91.73&toLat=26.18&toLng=91.73', { token: tokA })).status === 400);
const alts = await call('GET', '/route/alternatives?fromLat=26.1445&fromLng=91.7362&toLat=26.185&toLng=91.735', { token: tokA });
check('alternatives answer (1-3 road routes, or an honest "unavailable")', alts.status === 200 && (alts.json?.available === false || (Array.isArray(alts.json?.routes) && alts.json.routes.length >= 1 && alts.json.routes.length <= 3 && alts.json.routes.every((r) => r.coordinates.length > 1))));
check('a via waypoint must be valid', (await call('GET', '/route?fromLat=26.14&fromLng=91.73&toLat=26.18&toLng=91.73&viaLat=999&viaLng=0', { token: tokA })).status === 400);
const viaRoute = await call('GET', '/route?fromLat=26.1445&fromLng=91.7362&toLat=26.185&toLng=91.735&viaLat=26.17&viaLng=91.77', { token: tokA });
check('a route via a waypoint answers, and the waypoint is not announced as the destination', viaRoute.status === 200 && (viaRoute.json?.available === false || viaRoute.json.steps.filter((st) => st.instruction.startsWith('Arrive')).length === 1));
const road = await call('GET', '/route?fromLat=26.1445&fromLng=91.7362&toLat=26.185&toLng=91.735', { token: tokA });
check('routing answers (a real road route, or an honest "unavailable")', road.status === 200 && typeof road.json?.available === 'boolean');
console.log(`       road route available: ${road.json?.available}${road.json?.available ? ` (${road.json.distanceKm} km, ${road.json.durationMin} min, ${road.json.steps.length} steps)` : ''}`);

for (const next of ['DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'RESCUED']) {
  const r = await call('POST', `/sos/${inc.id}/status`, { token: tokRescue, body: { status: next } });
  check(`assigned team advances to ${next}`, r.status === 200 && r.json?.incident?.status === next);
}
const teams = (await call('GET', '/teams', { token: tokAdmin })).json?.teams ?? [];
check('team is freed once the incident is RESCUED', teams.find((t) => t.id === 'team-alpha')?.status === 'AVAILABLE');
check('status history was recorded', (await call('GET', '/sos', { token: tokA })).json?.incidents?.find((i) => i.id === inc.id)?.statusHistory?.length >= 7);

// ---- closing without a rescue
console.log('closing');
const a2 = await call('POST', '/sos', { token: tokA, body: sos({ clientRequestId: 'smoke-a2-' + RUN }) });
check('after RESCUED the citizen can raise a new SOS', a2.status === 201);
const incA2 = a2.json?.incident;
check("another citizen cannot cancel someone else's SOS", (await call('POST', `/sos/${incA2.id}/cancel`, { token: tokB, body: {} })).status === 404);
const cancelled = await call('POST', `/sos/${incA2.id}/cancel`, { token: tokA, body: {} });
check('a citizen can cancel their own unassigned SOS', cancelled.status === 200 && cancelled.json?.incident?.status === 'CLOSED' && cancelled.json?.incident?.closeReason === 'CANCELLED_BY_CITIZEN');
check('a closed SOS cannot be cancelled twice', (await call('POST', `/sos/${incA2.id}/cancel`, { token: tokA, body: {} })).status === 409);
const a3 = await call('POST', '/sos', { token: tokA, body: sos({ clientRequestId: 'smoke-a3-' + RUN }) });
check('after cancelling, a new SOS is allowed', a3.status === 201);
check('admin close needs a valid reason', (await call('POST', `/sos/${a3.json?.incident?.id}/cancel`, { token: tokAdmin, body: { reason: 'because' } })).status === 400);
check('rescue staff cannot close incidents', (await call('POST', `/sos/${a3.json?.incident?.id}/cancel`, { token: tokRescue, body: { reason: 'FALSE_ALARM' } })).status === 403);
const falseAlarm = await call('POST', `/sos/${a3.json?.incident?.id}/cancel`, { token: tokAdmin, body: { reason: 'FALSE_ALARM' } });
check('admin can close an SOS as a false alarm', falseAlarm.status === 200 && falseAlarm.json?.incident?.closeReason === 'FALSE_ALARM');

// admin closes an ASSIGNED incident -> its team is released
const assignB = await call('POST', `/sos/${incB.id}/assign`, { token: tokAdmin, body: { teamId: 'team-delta', requiredAction: 'x', notes: '' } });
check('admin can assign a team to the second citizen', assignB.status === 200);
check('citizens cannot cancel once a team is assigned', (await call('POST', `/sos/${incB.id}/cancel`, { token: tokB, body: {} })).status === 409);
const dup = await call('POST', `/sos/${incB.id}/cancel`, { token: tokAdmin, body: { reason: 'DUPLICATE' } });
check('admin can close an assigned incident as a duplicate', dup.status === 200);
const teamsAfter = (await call('GET', '/teams', { token: tokAdmin })).json?.teams ?? [];
check('closing an assigned incident releases the team', teamsAfter.find((t) => t.id === 'team-delta')?.status === 'AVAILABLE');

// ---- admin records & misc
console.log('records');
check('admin can save a relocation plan', (await call('POST', '/plans', { token: tokAdmin, body: { id: 'PLAN-SMOKE', zoneName: 'x' } })).status === 201);
check('admin can log a CAP broadcast', (await call('POST', '/cap-broadcasts', { token: tokAdmin, body: { identifier: 'CAP-SMOKE-' + Date.now(), headline: 'x' } })).status === 201);
const weather = await call('GET', '/weather?scenarioId=flood-assam');
check('weather endpoint answers (live data or an honest "unavailable")', weather.status === 200 && typeof weather.json?.available === 'boolean');
console.log(`       weather available: ${weather.json?.available}`);
check('unknown API path is a JSON 404', (await call('GET', '/nope')).status === 404);

// ---- rate limiting on login
console.log('rate limit');
let limited = false;
for (let i = 0; i < 15; i++) {
  if ((await call('POST', '/auth/login', { body: { role: 'admin', code: 'guess' + i } })).status === 429) limited = true;
}
check('repeated wrong access codes get rate limited', limited);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
