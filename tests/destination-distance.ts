import assert from 'node:assert/strict';
import { createRouter, distanceMeters } from '../lib/recommender.ts';
import type { GraphData, RouteInput } from '../lib/recommender.ts';

// A 1km stair shortcut and a 3km accessible detour; distances are fixture values.
const graph: GraphData = {
  version: 'destination-distance-check',
  bbox: [128.89, 37.77, 128.92, 37.8],
  nodes: [
    { id: 'a', lon: 128.9, lat: 37.78 },
    { id: 'b', lon: 128.9, lat: 37.79 },
    { id: 'c', lon: 128.91, lat: 37.79 },
    { id: 'd', lon: 128.91, lat: 37.78 },
  ],
  edges: [
    ['a', 'd'],
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
  ].map(([from, to], i) => ({
    id: `e${i}`,
    from,
    to,
    distanceMeters: 1000,
    bidirectional: true,
    highway: i === 0 ? 'steps' : 'footway',
    gradePercent: 0,
    gradeQuality: 'dem-estimate',
  })),
  pois: [
    {
      id: 'destination',
      name: '공원',
      lon: 128.91,
      lat: 37.78,
      category: 'park',
    },
  ],
};
const input: RouteInput = {
  origin: { nodeId: 'a' },
  destinationId: 'destination',
  minutes: 5,
  paceMinKm: 6,
  maxDistanceKm: 1,
  pauseMinutes: 0,
  mode: 'one_way',
  scenery: 'any',
  targetDistanceKm: 1,
  avoidSteps: true,
};
const router = createRouter(graph);
const shortest = router.destinationDistance(input);
assert.equal(shortest.status, 'ok');
assert.equal(shortest.oneWayMeters, 3000);
assert.equal(shortest.minimumCourseMeters, 3000);
assert.equal(shortest.connectorMeters, 0);
assert.equal(router.recommend(input).status, 'no_route');
assert.ok(
  shortest.oneWayMeters! > distanceMeters([128.9, 37.78], [128.91, 37.78]),
);
assert.equal(
  router.destinationDistance({ ...input, mode: 'out_and_back' })
    .minimumCourseMeters,
  6000,
);
assert.equal(
  router.destinationDistance({ ...input, mode: 'loop' }).minimumCourseMeters,
  6000,
);
assert.equal(
  router.recommend({ ...input, mode: 'loop', minutes: 120, maxDistanceKm: 10 })
    .status,
  'no_route',
  'a finite loop lower bound must not promise a loop satisfying the overlap rule',
);
assert.equal(
  router.destinationDistance({
    ...input,
    theme: 'lake',
    minutes: 120,
    maxDistanceKm: 10,
  }).minimumCourseMeters,
  3000,
  'soft preferences and final theme coverage do not change the hard-constraint lower bound',
);
assert.equal(
  router.destinationDistance({ ...input, maxDistanceKm: NaN }).status,
  'invalid_input',
);
assert.equal(
  router.destinationDistance({ ...input, targetDistanceKm: 2 }).status,
  'invalid_input',
);
assert.equal(
  router.destinationDistance({ ...input, origin: { lon: 0, lat: 0 } }).status,
  'unsupported_location',
);
assert.equal(
  router.destinationDistance({ ...input, destinationId: 'missing' }).status,
  'unsupported_location',
);

for (const condition of ['road', 'slope', 'unknown', 'private'] as const) {
  const changed = structuredClone(graph);
  const shortcut = changed.edges[0];
  shortcut.highway = condition === 'road' ? 'primary' : 'footway';
  shortcut.gradePercent = condition === 'slope' ? 8 : 0;
  shortcut.gradeQuality = condition === 'unknown' ? 'missing' : 'dem-estimate';
  if (condition === 'private') shortcut.access = 'private';
  const result = createRouter(changed).destinationDistance({
    ...input,
    avoidMajorRoads: true,
    maxGradePercent: 6,
    requireKnownSlope: true,
  });
  assert.equal(
    result.minimumCourseMeters,
    3000,
    `${condition} exclusion must remain active`,
  );
}

const directed = structuredClone(graph);
directed.edges[0].highway = 'footway';
directed.edges[0].bidirectional = false;
const directedRouter = createRouter(directed);
assert.equal(
  directedRouter.destinationDistance(input).minimumCourseMeters,
  1000,
);
const outAndBack = directedRouter.destinationDistance({
  ...input,
  mode: 'out_and_back',
});
assert.equal(outAndBack.oneWayMeters, 1000);
assert.equal(
  outAndBack.minimumCourseMeters,
  6000,
  'same-edge return must use the bidirectional detour',
);
assert.equal(
  directedRouter.destinationDistance({ ...input, mode: 'loop' })
    .minimumCourseMeters,
  4000,
);
for (const edge of directed.edges) edge.bidirectional = false;
const noReturn = createRouter(directed).destinationDistance({
  ...input,
  mode: 'loop',
});
assert.equal(noReturn.status, 'no_route');
assert.equal(noReturn.oneWayMeters, 1000);
assert.equal(noReturn.minimumCourseMeters, null);
assert.equal(
  createRouter(directed).destinationDistance({ ...input, mode: 'out_and_back' })
    .status,
  'no_route',
);

const disconnected = structuredClone(graph);
disconnected.edges = disconnected.edges.filter((edge) => edge.id !== 'e2');
assert.equal(
  createRouter(disconnected).destinationDistance(input).status,
  'no_route',
);

const offset = structuredClone(graph);
offset.pois[0].lat += 0.0002;
const offsetInput = { ...input, origin: { lon: 128.9, lat: 37.7802 } };
const offsetRouter = createRouter(offset);
const offsetDistance = offsetRouter.destinationDistance(offsetInput);
assert.equal(offsetDistance.status, 'ok');
assert.ok(
  offsetDistance.connectorMeters > 40 && offsetDistance.connectorMeters < 50,
);
assert.equal(
  offsetDistance.minimumCourseMeters,
  3000 + offsetDistance.connectorMeters,
);
const offsetRoundTrip = offsetRouter.destinationDistance({
  ...offsetInput,
  mode: 'out_and_back',
});
assert.equal(
  offsetRoundTrip.connectorMeters,
  offsetDistance.connectorMeters * 2,
);
assert.equal(
  offsetRoundTrip.minimumCourseMeters,
  6000 + offsetRoundTrip.connectorMeters,
);
offset.pois[0].lat = 37.782;
assert.equal(
  createRouter(offset).destinationDistance(input).status,
  'unsupported_location',
);
assert.equal(
  router.destinationDistance({ ...input, origin: { lon: 128.9, lat: 37.782 } })
    .status,
  'unsupported_location',
);

console.log(
  'Destination distance checks passed: graph detours, constraints, shape bounds, connectors, invalid and unsupported inputs.',
);
