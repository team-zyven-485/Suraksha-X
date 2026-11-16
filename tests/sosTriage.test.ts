import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm,
  nearestZone,
  priorityFromRiskLevel,
  recommendTeam,
  findAffectedZones,
  vulnerabilityTagsFor,
  triageSOS,
} from '../src/shared/sosTriage';
import { scenarios } from '../src/data/scenarios';
import { initialRescueTeams } from '../src/data/rescueTeams';
import type { RescueTeam } from '../src/types/sos';

const flood = scenarios['flood-assam'];
const teams = (): RescueTeam[] => structuredClone(initialRescueTeams);

test('haversineKm: zero distance and a known long distance', () => {
  assert.equal(haversineKm({ lat: 10, lng: 10 }, { lat: 10, lng: 10 }), 0);
  const delhiToMumbai = haversineKm({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 });
  assert.ok(delhiToMumbai > 1100 && delhiToMumbai < 1200, `got ${delhiToMumbai}`);
});

test('priorityFromRiskLevel maps risk to rescue priority', () => {
  assert.equal(priorityFromRiskLevel('CRITICAL'), 'P1');
  assert.equal(priorityFromRiskLevel('HIGH'), 'P2');
  assert.equal(priorityFromRiskLevel('MODERATE'), 'P3');
  assert.equal(priorityFromRiskLevel('SAFE'), 'P3');
});

test('nearestZone picks the closest zone and handles an empty list', () => {
  assert.equal(nearestZone([], { lat: 0, lng: 0 }), null);
  const target = flood.riskZones[3];
  assert.equal(nearestZone(flood.riskZones, target.coordinates)?.id, target.id);
});

test('recommendTeam: specialist first, availability beats distance, never null while teams exist', () => {
  const t = teams();
  // FLOOD is handled by alpha (4.2km) and delta (5.5km): alpha is closest.
  assert.equal(recommendTeam(t, 'FLOOD')?.id, 'team-alpha');
  // Make alpha busy: the next available specialist (delta) wins.
  t.find((x) => x.id === 'team-alpha')!.status = 'DISPATCHED';
  assert.equal(recommendTeam(t, 'FLOOD')?.id, 'team-delta');
  // Everyone busy: still returns the closest specialist instead of nothing.
  t.forEach((x) => (x.status = 'DISPATCHED'));
  assert.equal(recommendTeam(t, 'FLOOD')?.id, 'team-alpha');
  assert.equal(recommendTeam([], 'FLOOD'), null);
});

test('findAffectedZones: sorted by distance, capped at 5, within the hazard radius', () => {
  const origin = flood.riskZones[0].coordinates;
  const flagged = findAffectedZones(flood.riskZones, origin, 'FLOOD');
  assert.ok(flagged.length >= 1 && flagged.length <= 5);
  for (let i = 1; i < flagged.length; i++) assert.ok(flagged[i].distanceKm >= flagged[i - 1].distanceKm);
  assert.ok(flagged.every((z) => z.distanceKm <= 15));
  // Landslides spread less than floods.
  const tight = findAffectedZones(flood.riskZones, origin, 'LANDSLIDE');
  assert.ok(tight.every((z) => z.distanceKm <= 8));
});

test('vulnerabilityTagsFor: null zone gives no tags, populated zone gives tags', () => {
  assert.deepEqual(vulnerabilityTagsFor(null), []);
  assert.ok(vulnerabilityTagsFor(flood.riskZones[0]).length > 0);
});

test('triageSOS: derives risk, priority, zone and team from the server-known data', () => {
  const zone = flood.riskZones[0];
  const r = triageSOS({
    zones: flood.riskZones,
    teams: teams(),
    coordinates: zone.coordinates,
    disasterType: 'FLOOD',
    fallbackRegion: flood.meta.region,
  });
  assert.equal(r.zoneId, zone.id);
  assert.equal(r.riskScore, zone.riskScore);
  assert.equal(r.priority, priorityFromRiskLevel(zone.riskLevel));
  assert.equal(r.recommendedTeamId, 'team-alpha');
});

test('triageSOS with no zones falls back to the region and a P2 default', () => {
  const r = triageSOS({
    zones: [],
    teams: teams(),
    coordinates: { lat: 1, lng: 1 },
    disasterType: 'FIRE',
    fallbackRegion: 'Somewhere',
  });
  assert.equal(r.zoneId, null);
  assert.equal(r.location, 'Somewhere');
  assert.equal(r.riskScore, 50);
  assert.equal(r.priority, 'P2');
});
