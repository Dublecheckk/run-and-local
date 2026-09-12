import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRouter, distanceMeters } from '../lib/recommender.ts';
import type {
  GraphData,
  RouteInput,
  RecommendationResult,
} from '../lib/recommender.ts';

const fixture: GraphData = {
  version: 'test',
  bbox: [128.89, 37.77, 128.92, 37.8],
  nodes: [],
  edges: [],
  pois: [],
};
for (let y = 0; y < 5; y++)
  for (let x = 0; x < 5; x++)
    fixture.nodes.push({
      id: `${x},${y}`,
      lon: 128.9 + x * 0.001,
      lat: 37.78 + y * 0.001,
      crossing: x === 2 && y === 2,
    });
for (const n of fixture.nodes) {
  const [x, y] = n.id.split(',').map(Number);
  for (const id of [`${x + 1},${y}`, `${x},${y + 1}`]) {
    const to = fixture.nodes.find((n) => n.id === id);
    if (to)
      fixture.edges.push({
        id: `${n.id}-${to.id}`,
        from: n.id,
        to: to.id,
        distanceMeters: distanceMeters([n.lon, n.lat], [to.lon, to.lat]),
        bidirectional: true,
        highway: 'footway',
        scenery: y > 2 ? 'water' : y < 2 ? 'green' : 'city',
      });
  }
}
fixture.pois = [
  {
    id: 'destination',
    name: '시험 목적지',
    lon: 128.904,
    lat: 37.782,
    category: 'cafe',
  },
  {
    id: 'toilet',
    name: '화장실',
    lon: 128.902,
    lat: 37.782,
    category: 'toilets',
  },
];
const router = createRouter(fixture);
const input: RouteInput = {
  origin: { nodeId: '0,2' },
  destinationId: 'destination',
  minutes: 12,
  paceMinKm: 7,
  maxDistanceKm: 2,
  pauseMinutes: 1,
  mode: 'one_way',
  scenery: 'water',
};
let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks++;
}
function invariants(
  graph: GraphData,
  result: RecommendationResult,
  user: RouteInput,
) {
  const byId = new Map(graph.edges.map((e) => [e.id, e]));
  for (const route of result.routes) {
    check(
      route.geometry.length === route.edgeIds.length + 1,
      'geometry follows every edge',
    );
    check(
      route.geometry.length === route.nodeIds.length,
      'node/geometry alignment',
    );
    check(
      route.nodeIds[route.destinationIndex] ===
        result.snaps!.destination.nodeId,
      'visits destination snap',
    );
    check(
      route.nodeIds[0] === result.snaps!.origin.nodeId,
      'starts at origin snap',
    );
    check(
      route.nodeIds.at(-1) ===
        (user.mode === 'one_way'
          ? result.snaps!.destination.nodeId
          : result.snaps!.origin.nodeId),
      'correct mode endpoint',
    );
    let total = 0;
    for (let i = 0; i < route.edgeIds.length; i++) {
      const e = byId.get(route.edgeIds[i])!;
      check(
        (e.from === route.nodeIds[i] && e.to === route.nodeIds[i + 1]) ||
          (e.bidirectional &&
            e.to === route.nodeIds[i] &&
            e.from === route.nodeIds[i + 1]),
        'edge direction legal',
      );
      total += e.distanceMeters;
    }
    check(
      route.geometry.every(
        (point, i) =>
          i === 0 ||
          Math.abs(
            distanceMeters(route.geometry[i - 1], point) -
              byId.get(route.edgeIds[i - 1])!.distanceMeters,
          ) < 0.5,
      ),
      'stored length agrees with geometry',
    );
    check(
      Math.abs(total - route.distanceMeters) < 1e-6,
      'actual edge-length sum',
    );
    check(
      route.distanceMeters <= user.maxDistanceKm * 1000 + 1e-6,
      'distance hard bound',
    );
    check(route.bufferedMinutes <= user.minutes + 1e-9, 'time hard bound');
    check(
      Math.abs(
        route.bufferedMinutes -
          ((total / 1000) * user.paceMinKm * 1.1 +
            route.crossingMinutes +
            user.pauseMinutes +
            route.connectorAllowanceMinutes),
      ) < 1e-9,
      'full time accounting',
    );
    check(
      Math.abs(Object.values(route.weights).reduce((s, n) => s + n, 0) - 1) <
        1e-9,
      'known weights normalized',
    );
    if (user.mode === 'loop')
      check(route.selfOverlapRatio <= 0.25 + 1e-9, 'loop overlap bound');
    if (user.mode === 'out_and_back') {
      const half = route.edgeIds.length / 2;
      check(Number.isInteger(half), 'outback even');
      check(
        JSON.stringify(route.edgeIds.slice(0, half)) ===
          JSON.stringify(route.edgeIds.slice(half).reverse()),
        'outback exact physical reverse',
      );
      check(
        JSON.stringify(route.nodeIds.slice(0, half + 1)) ===
          JSON.stringify(route.nodeIds.slice(half).reverse()),
        'outback exact geometry reverse',
      );
    }
  }
}
for (const mode of ['one_way', 'out_and_back', 'loop'] as const) {
  const user = { ...input, mode },
    result = router.recommend(user);
  check(result.status === 'ok', `grid finds ${mode}`);
  invariants(fixture, result, user);
}
for (const invalid of [
  { minutes: NaN },
  { minutes: Infinity },
  { minutes: '12' },
  { paceMinKm: 0 },
  { pauseMinutes: 12 },
  { maxDistanceKm: -1 },
  { mode: 'circle' },
  { scenery: 'ocean' },
])
  check(
    router.recommend({ ...input, ...invalid } as RouteInput).status ===
      'invalid_input',
    'input validation',
  );
check(
  router.recommend({ ...input, origin: { lon: 0, lat: 0 } }).status ===
    'unsupported_location',
  'outside bbox',
);
check(
  router.recommend({ ...input, origin: { lon: NaN, lat: 37.78 } }).status ===
    'unsupported_location',
  'invalid coordinate',
);
check(
  router.recommend({ ...input, origin: { lon: 128.919, lat: 37.799 } })
    .status === 'unsupported_location',
  'too distant origin snap',
);
check(
  router.recommend({ ...input, destinationId: 'missing' }).status ===
    'unsupported_location',
  'unknown destination',
);
check(
  router.recommend({ ...input, maxDistanceKm: 0.2 }).routes.length === 0,
  'cannot relax distance',
);
check(
  router.recommend({ ...input, minutes: 5, pauseMinutes: 4.9 }).routes
    .length === 0,
  'cannot relax time',
);
const farDestination = structuredClone(fixture);
farDestination.pois[0].lon = 128.919;
farDestination.pois[0].lat = 37.799;
check(
  createRouter(farDestination).recommend(input).status ===
    'unsupported_location',
  'too distant destination snap',
);
const waterTop = router.recommend(input).routes[0];
const greenTop = router.recommend({ ...input, scenery: 'green' }).routes[0];
check(
  JSON.stringify(waterTop.edgeIds) !== JSON.stringify(greenTop.edgeIds),
  'scenery preference changes ranking',
);
const gapInput = { ...input, origin: { lon: 128.90005, lat: 37.78205 } };
const gap = router.recommend(gapInput);
check(
  gap.routes[0].connectorAllowanceMinutes > 0,
  'unverified connector allowance',
);
invariants(fixture, gap, gapInput);
const line = structuredClone(fixture);
line.nodes = line.nodes.filter((n) =>
  ['0,2', '1,2', '2,2', '3,2', '4,2'].includes(n.id),
);
const allowed = new Set(line.nodes.map((n) => n.id));
line.edges = line.edges.filter((e) => allowed.has(e.from) && allowed.has(e.to));
check(
  createRouter(line).recommend({ ...input, mode: 'loop' }).routes.length === 0,
  'line graph cannot masquerade as loop',
);
line.edges.forEach((e) => {
  e.bidirectional = false;
});
check(
  createRouter(line).recommend(input).status === 'ok',
  'direction allows outbound',
);
check(
  createRouter(line).recommend({ ...input, mode: 'out_and_back' }).routes
    .length === 0,
  'one-way foot path cannot outback',
);
line.edges[1].foot = 'no';
check(
  createRouter(line).recommend(input).routes.length === 0,
  'inaccessible edge excluded',
);
const unknown = structuredClone(fixture);
unknown.edges.forEach((e) => {
  delete e.scenery;
  delete e.highway;
});
unknown.pois = unknown.pois.filter((p) => p.category === 'cafe');
const unknownResult = createRouter(unknown).recommend(input);
check(
  unknownResult.routes.every(
    (r) =>
      r.features.scenery === null &&
      r.features.amenities === null &&
      r.features.comfort === null &&
      r.weights.time === 1,
  ),
  'missing evidence is not an invented feature',
);
const report: Record<string, unknown> = {
  passed: true,
  fixtureChecks: checks,
  scope:
    'geometry, legal directions, hard limits, gap time, unavailable evidence; not field safety or recommendation relevance',
};
if (process.argv[2]) {
  const data = JSON.parse(readFileSync(process.argv[2], 'utf8')) as GraphData;
  const real = createRouter(data);
  const origins = data.origins as {
    name: string;
    nodeId: string;
    lon: number;
    lat: number;
  }[];
  const cases: Record<string, unknown>[] = [];
  for (const origin of origins) {
    const nearby = data.pois
      .filter((p) => ['cafe', 'park', 'attraction'].includes(p.category))
      .map((p) => ({
        p,
        distance: distanceMeters([origin.lon, origin.lat], [p.lon, p.lat]),
      }))
      .filter((p) => p.distance > 300 && p.distance < 2200)
      .sort((a, b) => Math.abs(a.distance - 900) - Math.abs(b.distance - 900));
    for (const { p } of nearby.slice(0, 2)) {
      for (const mode of ['one_way', 'out_and_back', 'loop'] as const) {
        const user: RouteInput = {
          ...input,
          origin: { nodeId: origin.nodeId },
          destinationId: p.id,
          mode,
          minutes: 45,
          pauseMinutes: 5,
          maxDistanceKm: 6,
        };
        const before = performance.now(),
          result = real.recommend(user),
          milliseconds = performance.now() - before;
        invariants(data, result, user);
        cases.push({
          origin: origin.name,
          originNode: origin.nodeId,
          destination: p.name,
          destinationId: p.id,
          mode,
          status: result.status,
          milliseconds: Math.round(milliseconds),
          diagnostics: result.diagnostics,
          routes: result.routes.map((r) => ({
            distanceMeters: Math.round(r.distanceMeters),
            bufferedMinutes: Number(r.bufferedMinutes.toFixed(1)),
            selfOverlapRatio: r.selfOverlapRatio,
            score: Number(r.score.toFixed(1)),
          })),
        });
      }
    }
  }
  check(
    cases.some((c) => c.mode === 'loop' && c.status === 'ok'),
    'real OSM loop exists',
  );
  check(
    cases.some((c) => c.mode === 'out_and_back' && c.status === 'ok'),
    'real OSM outback exists',
  );
  report.realCases = cases;
  report.totalChecks = checks;
}
if (process.argv[3])
  writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log('Routing checks passed:', checks);
