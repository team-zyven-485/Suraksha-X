import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.MONGODB_URI; // these tests exercise the in-memory store
const { createStore } = await import('../server/store');
type IncidentDoc = import('../server/store').IncidentDoc;

let n = 0;
function incident(overrides: Partial<IncidentDoc> = {}): IncidentDoc {
  n++;
  const created = new Date(Date.now() + n * 1000).toISOString();
  return {
    id: `SOS-TEST${n}`,
    citizenId: `cit-${n}`,
    citizenName: 'T',
    scenarioId: 'flood-assam',
    zoneId: null,
    zoneName: 'Z',
    location: 'Z',
    coordinates: { lat: 1, lng: 1 },
    isDemoLocation: true,
    disasterType: 'FLOOD',
    hazard: 'Flood',
    riskScore: 50,
    vulnerabilityTags: [],
    affectedZones: [],
    recommendedTeamId: null,
    priority: 'P2',
    status: 'REQUESTED',
    communicationMode: 'Mobile Network',
    assignedTeamId: null,
    instructions: null,
    etaMin: null,
    createdAt: created,
    statusHistory: [{ status: 'REQUESTED', timestamp: created }],
    isOpen: true,
    closeReason: null,
    clientRequestId: null,
    ...overrides,
  } as IncidentDoc;
}

const expectDuplicate = async (p: Promise<unknown>, key: string) => {
  await assert.rejects(p, (e: any) => e.code === 11000 && Object.keys(e.keyPattern).includes(key));
};

test('a citizen can have only ONE open incident; closing it frees the slot', async () => {
  const store = await createStore();
  const first = incident({ citizenId: 'cit-one-open' });
  await store.insertIncident(first);
  await expectDuplicate(store.insertIncident(incident({ citizenId: 'cit-one-open' })), 'citizenId');

  const closed = await store.updateIncident(
    first.id,
    { status: ['REQUESTED'] },
    { status: 'CLOSED', isOpen: false, closeReason: 'FALSE_ALARM' },
    { status: 'CLOSED', timestamp: new Date().toISOString() }
  );
  assert.equal(closed?.isOpen, false);
  await store.insertIncident(incident({ citizenId: 'cit-one-open' })); // allowed now
  assert.equal((await store.findOpenIncident('cit-one-open'))?.isOpen, true);
});

test('duplicate incident id and duplicate clientRequestId are rejected', async () => {
  const store = await createStore();
  const a = incident({ clientRequestId: 'req-1', citizenId: 'cit-dup' });
  await store.insertIncident(a);
  await expectDuplicate(store.insertIncident(incident({ id: a.id })), 'id');
  // Same citizen + same request id (their first SOS is still open, but the
  // request-id clash is what identifies it as a re-send)
  await expectDuplicate(store.insertIncident(incident({ citizenId: 'cit-dup', clientRequestId: 'req-1' })), 'clientRequestId');
  assert.equal((await store.findIncidentByClientRequest('cit-dup', 'req-1'))?.id, a.id);
});

test('updateIncident honours its guards and appends history', async () => {
  const store = await createStore();
  const inc = incident();
  await store.insertIncident(inc);
  const wrong = await store.updateIncident(inc.id, { status: ['DISPATCHED'] }, { status: 'EN_ROUTE' }, { status: 'EN_ROUTE', timestamp: 't' });
  assert.equal(wrong, null);
  const wrongTeam = await store.updateIncident(inc.id, { assignedTeamId: 'team-x' }, { status: 'ASSIGNED' }, { status: 'ASSIGNED', timestamp: 't' });
  assert.equal(wrongTeam, null);
  const ok = await store.updateIncident(
    inc.id,
    { status: ['REQUESTED'], assignedTeamId: null },
    { status: 'ASSIGNED', assignedTeamId: 'team-alpha' },
    { status: 'ASSIGNED', timestamp: 't' }
  );
  assert.equal(ok?.status, 'ASSIGNED');
  assert.equal(ok?.statusHistory.length, 2);
});

test('team reservation is atomic: only one caller wins an AVAILABLE team', async () => {
  const store = await createStore();
  const first = await store.updateTeam('team-charlie', { status: 'ASSIGNED', activeIncidentId: 'X' }, ['AVAILABLE']);
  const second = await store.updateTeam('team-charlie', { status: 'ASSIGNED', activeIncidentId: 'Y' }, ['AVAILABLE']);
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal((await store.getTeam('team-charlie'))?.activeIncidentId, 'X');
  assert.equal(await store.updateTeam('no-such-team', { status: 'AVAILABLE' }), false);
});

test('listIncidents: newest first and filterable by citizen', async () => {
  const store = await createStore();
  const a = incident({ citizenId: 'cit-list-a' });
  const b = incident({ citizenId: 'cit-list-b' });
  await store.insertIncident(a);
  await store.insertIncident(b);
  const all = await store.listIncidents();
  assert.ok(all.findIndex((i) => i.id === b.id) < all.findIndex((i) => i.id === a.id));
  assert.deepEqual((await store.listIncidents({ citizenId: 'cit-list-a' })).map((i) => i.id), [a.id]);
});

test('stores return copies, so callers cannot mutate stored state', async () => {
  const store = await createStore();
  const inc = incident({ citizenId: 'cit-copy' });
  await store.insertIncident(inc);
  const read = await store.getIncident(inc.id);
  read!.riskScore = 999;
  assert.equal((await store.getIncident(inc.id))?.riskScore, 50);
});
