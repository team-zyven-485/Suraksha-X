import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeStep } from '../server/routing';
import { cumulativeKm, offsetPoint, pointAtKm, progressAlong } from '../src/lib/roadRoute';
import { haversineKm } from '../src/shared/sosTriage';

test('describeStep produces readable instructions', () => {
  assert.equal(describeStep({ maneuver: { type: 'depart' }, name: 'MG Road' }), 'Start on MG Road');
  assert.equal(describeStep({ maneuver: { type: 'depart' }, name: '' }), 'Start your journey');
  assert.equal(describeStep({ maneuver: { type: 'turn', modifier: 'left' }, name: 'NH-27' }), 'Turn left onto NH-27');
  assert.equal(describeStep({ maneuver: { type: 'turn', modifier: 'slight right' }, name: '' }), 'Turn slightly right');
  assert.equal(describeStep({ maneuver: { type: 'roundabout', exit: 2 }, name: 'Ring Road' }), 'At the roundabout, take exit 2 onto Ring Road');
  assert.equal(describeStep({ maneuver: { type: 'arrive' } }), 'Arrive at your destination');
  assert.equal(describeStep({ maneuver: { type: 'arrive', modifier: 'right' } }), 'Arrive at your destination, on the right');
  assert.equal(describeStep({}), 'Continue'); // unknown input never throws
});

// A straight east-west line at the equator: 0.1 degree of longitude ~ 11.1 km.
const line: [number, number][] = [
  [0, 0],
  [0, 0.05],
  [0, 0.1],
];

test('cumulativeKm sums segment lengths', () => {
  const cum = cumulativeKm(line);
  assert.equal(cum[0], 0);
  assert.ok(Math.abs(cum[2] - 11.12) < 0.1, `got ${cum[2]}`);
});

test('pointAtKm interpolates along the route and clamps at the ends', () => {
  const cum = cumulativeKm(line);
  const mid = pointAtKm(line, cum, cum[2] / 2);
  assert.ok(Math.abs(mid.lng - 0.05) < 0.001);
  assert.deepEqual(pointAtKm(line, cum, -5), { lat: 0, lng: 0 });
  assert.ok(Math.abs(pointAtKm(line, cum, 999).lng - 0.1) < 1e-9);
});

test('progressAlong: remaining distance shrinks as the team advances, and detects leaving the route', () => {
  const cum = cumulativeKm(line);
  const atStart = progressAlong(line, cum, { lat: 0, lng: 0 });
  const nearEnd = progressAlong(line, cum, { lat: 0, lng: 0.09 });
  assert.ok(atStart.remainingKm > nearEnd.remainingKm);
  assert.ok(Math.abs(atStart.remainingKm - cum[2]) < 0.05);
  assert.equal(atStart.offRoute, false);
  assert.equal(progressAlong(line, cum, { lat: 0.5, lng: 0.05 }).offRoute, true); // ~55 km north of the line
});

test('offsetPoint moves the requested distance', () => {
  const origin = { lat: 26.18, lng: 91.73 };
  for (const bearing of [0, 90, 135, 270]) {
    const p = offsetPoint(origin, 5, bearing);
    assert.ok(Math.abs(haversineKm(origin, p) - 5) < 0.01, `bearing ${bearing}`);
  }
});
