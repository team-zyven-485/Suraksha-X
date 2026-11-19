import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HAZARD_PENALTY_MIN_PER_KM, pickRoute, routeExposure, routeScore, suggestVias } from '../src/shared/hazardRouting';
import { haversineKm } from '../src/shared/sosTriage';
import { buildSimulation, defaultParams, pointInPolygon } from '../src/shared/hazardSim';

const origin = { lat: 26.185, lng: 91.735 };
const sim = buildSimulation(defaultParams('FLOOD', 'SEVERE', origin), origin, 1);

// Straight east-west line right through the SOS point (and so through the footprint)…
const through: [number, number][] = [
  [origin.lat, origin.lng - 0.3],
  [origin.lat, origin.lng],
  [origin.lat, origin.lng + 0.3],
];
// …and a long way round, far north of any footprint (0.4 deg ~ 44 km, footprint is < 20 km).
const around: [number, number][] = [
  [origin.lat, origin.lng - 0.3],
  [origin.lat + 0.4, origin.lng - 0.3],
  [origin.lat + 0.4, origin.lng + 0.3],
  [origin.lat, origin.lng + 0.3],
];

test('routeExposure: a route through the footprint has exposure, one far away has none', () => {
  const a = routeExposure(through, sim);
  const b = routeExposure(around, sim);
  assert.ok(a.kmInside > 1, `expected km inside, got ${a.kmInside}`);
  assert.ok(a.kmInside <= a.kmTotal);
  assert.ok(Math.abs(a.kmInside - (a.kmSevere + a.kmModerate + a.kmWatch)) < 0.02);
  assert.equal(b.kmInside, 0);
  assert.ok(a.kmTotal > 58 && a.kmTotal < 62, `total ${a.kmTotal}`); // 0.6 deg of longitude at 26 deg N ~ 60 km
});

test('routeExposure: the strongest zone is counted where zones overlap, nothing is double counted', () => {
  const a = routeExposure(through, sim);
  assert.ok(a.kmSevere > 0, 'the SOS point is inside the severe zone');
  assert.ok(a.kmInside <= a.kmTotal + 0.01);
});

test('routeScore adds time and weighted exposure', () => {
  const e = { kmSevere: 2, kmModerate: 3, kmWatch: 4, kmInside: 9, kmTotal: 20 };
  const expected = 10 + 2 * HAZARD_PENALTY_MIN_PER_KM.severe + 3 * HAZARD_PENALTY_MIN_PER_KM.moderate + 4 * HAZARD_PENALTY_MIN_PER_KM.watch;
  assert.equal(routeScore(10, e), expected);
  assert.equal(routeScore(10, { kmSevere: 0, kmModerate: 0, kmWatch: 0, kmInside: 0, kmTotal: 20 }), 10);
});

test('pickRoute: takes a modest detour to avoid the hazard', () => {
  const routes = [
    { coordinates: through, durationMin: 40 },
    { coordinates: around, durationMin: 46 },
  ];
  const c = pickRoute(routes, sim);
  assert.equal(c.fastestIndex, 0);
  assert.equal(c.chosenIndex, 1);
  assert.equal(c.avoided, true);
  assert.equal(c.extraMinutes, 6);
  assert.ok(c.kmInsideSaved > 1);
  assert.ok(c.severeKmSaved > 0);
});

test('pickRoute: does NOT take an absurd detour; the penalty is bounded', () => {
  const routes = [
    { coordinates: through, durationMin: 40 },
    { coordinates: around, durationMin: 400 },
  ];
  const c = pickRoute(routes, sim);
  assert.equal(c.chosenIndex, 0);
  assert.equal(c.avoided, false);
  assert.equal(c.extraMinutes, 0);
  assert.equal(c.kmInsideSaved, 0);
});

test('pickRoute: a single route is returned as is, and ties keep the first', () => {
  const only = pickRoute([{ coordinates: through, durationMin: 40 }], sim);
  assert.equal(only.chosenIndex, 0);
  assert.equal(only.avoided, false);
  const twin = pickRoute(
    [
      { coordinates: around, durationMin: 30 },
      { coordinates: around, durationMin: 30 },
    ],
    sim
  );
  assert.equal(twin.chosenIndex, 0);
});

test('suggestVias: detour waypoints sit just outside the footprint and never make the trip absurdly long', () => {
  const from = { lat: origin.lat, lng: origin.lng - 0.08 };
  const to = { lat: origin.lat, lng: origin.lng + 0.08 };
  const vias = suggestVias(from, to, sim);
  assert.ok(vias.length >= 1 && vias.length <= 3);
  const watch = sim.layers[0].polygon;
  for (const v of vias) {
    assert.equal(pointInPolygon(v.lat, v.lng, watch), false, 'a detour waypoint must be outside the footprint');
    const length = haversineKm(from, v) + haversineKm(v, to);
    assert.ok(length <= 2.2 * haversineKm(from, to) + 4);
  }
  // sorted by detour length (shortest first)
  const lens = vias.map((v) => haversineKm(from, v) + haversineKm(v, to));
  assert.deepEqual([...lens].sort((x, y) => x - y), lens);
});
