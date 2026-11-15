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
const citizenA = await call('POST', '/auth/login', { body: { role: 'citizen', deviceId: 'smoke-device-aaaa1111' } });
const citizenB = await call('POST', '/auth/login', { body: { role: 'citizen', deviceId: 'smoke-device-bbbb2222' } });
check('citizen login works without a code', citizenA.status === 200 && !!citizenA.json?.token);
check('citizen identity is stable per device', (await call('POST', '/auth/login', { body: { role: 'citizen', deviceId: 'smoke-device-aaaa1111' } })).json?.user?.id === citizenA.json?.user?.id);
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

for (const next of ['DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'RESCUED']) {
  const r = await call('POST', `/sos/${inc.id}/status`, { token: tokRescue, body: { status: next } });
  check(`assigned team advances to ${next}`, r.status === 200 && r.json?.incident?.status === next);
}
const teams = (await call('GET', '/teams', { token: tokAdmin })).json?.teams ?? [];
check('team is freed once the incident is RESCUED', teams.find((t) => t.id === 'team-alpha')?.status === 'AVAILABLE');
check('status history was recorded', (await call('GET', '/sos', { token: tokA })).json?.incidents?.find((i) => i.id === inc.id)?.statusHistory?.length >= 7);

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
