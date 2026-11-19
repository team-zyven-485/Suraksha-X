import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_EMOJI,
  SEVERITIES,
  allowedRanges,
  assessExposure,
  buildSimulation,
  defaultParams,
  levelAt,
  pointInPolygon,
  severityFromPriority,
  validateParams,
} from '../src/shared/hazardSim';
import type { SOSDisasterType } from '../src/types/sos';

const HAZARDS: SOSDisasterType[] = ['FLOOD', 'LANDSLIDE', 'TSUNAMI', 'CYCLONE', 'EARTHQUAKE', 'FIRE', 'OTHER'];
const origin = { lat: 26.185, lng: 91.735 };

test('defaultParams: every hazard x severity is inside its allowed ranges and uses only allowed emoji', () => {
  for (const h of HAZARDS) {
    for (const s of SEVERITIES) {
      const p = defaultParams(h, s, origin);
      const r = allowedRanges(h, s);
      assert.ok(p.lengthKm >= r.lengthKm[0] && p.lengthKm <= r.lengthKm[1], `${h} ${s} length`);
      assert.ok(p.widthKm >= r.widthKm[0] && p.widthKm <= r.widthKm[1], `${h} ${s} width`);
      assert.ok(p.markers.length >= 1 && p.markers.length <= 6);
      assert.ok(p.markers.every((m) => ALLOWED_EMOJI.includes(m.emoji)));
      assert.ok(p.narrative.length > 20 && p.assumptions.length > 0 && p.considerations.length > 0);
    }
  }
});

test('defaultParams is stable for the same place and differs between places', () => {
  assert.deepEqual(defaultParams('FLOOD', 'SEVERE', origin), defaultParams('FLOOD', 'SEVERE', origin));
  assert.notEqual(defaultParams('FLOOD', 'SEVERE', origin).bearingDeg, defaultParams('FLOOD', 'SEVERE', { lat: 13.05, lng: 80.28 }).bearingDeg);
});

test('validateParams: garbage input falls back to the rule-based defaults', () => {
  for (const junk of [null, undefined, 'text', 42, [], {}]) {
    assert.deepEqual(validateParams(junk, 'FLOOD', 'MODERATE', origin), defaultParams('FLOOD', 'MODERATE', origin));
  }
});

test('validateParams: clamps wild numbers and forces the requested severity', () => {
  const p = validateParams(
    { severity: 'LOW', lengthKm: 99999, widthKm: -5, peakAfterHours: 1e9, bearingDeg: 725, intensity: { value: 1e6 } },
    'FLOOD',
    'SEVERE',
    origin
  );
  const r = allowedRanges('FLOOD', 'SEVERE');
  assert.equal(p.severity, 'SEVERE');
  assert.equal(p.lengthKm, r.lengthKm[1]);
  assert.equal(p.widthKm, r.widthKm[0]);
  assert.equal(p.peakAfterHours, r.peakAfterHours[1]);
  assert.equal(p.bearingDeg, 5); // 725 mod 360
  assert.equal(p.intensity.value, r.intensity[1]);
});

test('validateParams: strips markup, rejects unknown emoji, caps lists and markers', () => {
  const p = validateParams(
    {
      headline: '<img src=x onerror=alert(1)> Big flood',
      narrative: 'ok `text`',
      assumptions: ['a', 'b', 'c', 'd', 'e', 'f'],
      markers: [
        { emoji: '💀', label: '<b>evil</b> marker', bearingDeg: 10, distanceKm: 1 },
        { emoji: '🌊', label: 'fine', bearingDeg: 400, distanceKm: 9999 },
        { emoji: '🌊', label: '', bearingDeg: 0, distanceKm: 1 }, // no label -> dropped
        ...Array.from({ length: 10 }, (_, i) => ({ emoji: '🚧', label: `m${i}`, bearingDeg: i, distanceKm: 1 })),
      ],
    },
    'FLOOD',
    'SEVERE',
    origin
  );
  assert.ok(!/[<>`]/.test(p.headline) && !/[<>`]/.test(p.narrative));
  assert.ok(p.assumptions.length <= 4);
  assert.ok(p.markers.length <= 6);
  assert.equal(p.markers[0].emoji, '📍'); // 💀 is not allowed
  assert.ok(!/[<>]/.test(p.markers[0].label));
  assert.equal(p.markers[1].bearingDeg, 40);
  assert.ok(p.markers[1].distanceKm <= p.lengthKm * 1.2);
});

test('buildSimulation: three nested layers, SOS point inside the footprint, polygons closed enough to use', () => {
  for (const h of HAZARDS) {
    const p = defaultParams(h, 'SEVERE', origin);
    const sim = buildSimulation(p, origin, 1);
    assert.deepEqual(sim.layers.map((l) => l.id), ['watch', 'moderate', 'severe']);
    assert.ok(sim.layers.every((l) => l.polygon.length >= 24));
    assert.equal(sim.markers.length, p.markers.length);
    if (h !== 'LANDSLIDE') {
      // (a landslide starts as a point at the SOS location, which lies on its boundary)
      assert.ok(pointInPolygon(origin.lat, origin.lng, sim.layers[0].polygon), `${h}: SOS should be inside the footprint`);
    }
    // Inner zones are nested: every vertex of the severe zone lies inside the watch zone.
    // (A landslide's source point is shared by every layer and sits exactly on each boundary, so skip it.)
    const isSource = ([la, ln]: [number, number]) => Math.abs(la - origin.lat) < 1e-9 && Math.abs(ln - origin.lng) < 1e-9;
    assert.ok(sim.layers[2].polygon.filter((v) => !isSource(v)).every(([la, ln]) => pointInPolygon(la, ln, sim.layers[0].polygon)), `${h}: nesting`);
  }
});

test('buildSimulation: the footprint grows over time (except instantaneous earthquakes)', () => {
  const span = (poly: [number, number][]) => Math.max(...poly.map((p) => p[1])) - Math.min(...poly.map((p) => p[1]));
  const flood = defaultParams('FLOOD', 'SEVERE', origin);
  assert.ok(span(buildSimulation(flood, origin, 0.3).layers[0].polygon) < span(buildSimulation(flood, origin, 1).layers[0].polygon));
  const quake = defaultParams('EARTHQUAKE', 'SEVERE', origin);
  assert.equal(buildSimulation(quake, origin, 0.2).growth, 1);
});

test('buildSimulation: the footprint extends in the chosen direction', () => {
  const east = { ...defaultParams('FLOOD', 'SEVERE', origin), bearingDeg: 90 };
  const poly = buildSimulation(east, origin, 1).layers[0].polygon;
  const meanLng = poly.reduce((n, p) => n + p[1], 0) / poly.length;
  const meanLat = poly.reduce((n, p) => n + p[0], 0) / poly.length;
  assert.ok(meanLng > origin.lng + 0.01, 'centre should be east of the SOS point');
  assert.ok(Math.abs(meanLat - origin.lat) < 0.01, 'and not drift north/south');
  const north = { ...defaultParams('FLOOD', 'SEVERE', origin), bearingDeg: 0 };
  const nPoly = buildSimulation(north, origin, 1).layers[0].polygon;
  assert.ok(nPoly.reduce((n, p) => n + p[0], 0) / nPoly.length > origin.lat + 0.01);
});

test('pointInPolygon and levelAt', () => {
  const square: [number, number][] = [[0, 0], [0, 2], [2, 2], [2, 0]];
  assert.equal(pointInPolygon(1, 1, square), true);
  assert.equal(pointInPolygon(3, 1, square), false);
  const sim = buildSimulation(defaultParams('EARTHQUAKE', 'SEVERE', origin), origin, 1);
  assert.equal(levelAt(sim, origin.lat, origin.lng), 'severe');
  assert.equal(levelAt(sim, origin.lat + 5, origin.lng), null);
});

test('assessExposure: finds assets inside the footprint and the nearest safe shelters', () => {
  const sim = buildSimulation(defaultParams('EARTHQUAKE', 'SEVERE', origin), origin, 1);
  const zones = [
    { id: 'z-in', name: 'Inside', population: 1000, coordinates: origin },
    { id: 'z-out', name: 'Far', population: 5000, coordinates: { lat: origin.lat + 3, lng: origin.lng } },
  ];
  const shelters = [
    { id: 's-in', name: 'In', code: 'RC-1', available: 10, coordinates: origin },
    { id: 's-near', name: 'Near', code: 'RC-2', available: 10, coordinates: { lat: origin.lat + 1, lng: origin.lng } },
    { id: 's-full', name: 'Full', code: 'RC-3', available: 0, coordinates: { lat: origin.lat + 0.8, lng: origin.lng } },
    { id: 's-far', name: 'Far', code: 'RC-4', available: 10, coordinates: { lat: origin.lat + 2, lng: origin.lng } },
  ];
  const e = assessExposure(sim, origin, zones, shelters);
  assert.deepEqual(e.zones.map((z) => z.id), ['z-in']);
  assert.equal(e.populationInFootprint, 1000);
  assert.deepEqual(e.sheltersAtRisk.map((s) => s.id), ['s-in']);
  assert.deepEqual(e.sheltersOutside.map((s) => s.id), ['s-near', 's-far']); // full shelter excluded, sorted by distance
});

test('severityFromPriority', () => {
  assert.equal(severityFromPriority('P1'), 'SEVERE');
  assert.equal(severityFromPriority('P2'), 'MODERATE');
  assert.equal(severityFromPriority('P3'), 'LOW');
});
