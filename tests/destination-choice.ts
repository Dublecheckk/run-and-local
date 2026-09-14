import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDistanceConsent,
  distanceConsentInput,
  exceedsGoal,
  nearbyDestinations,
  routesWithinGoal,
} from '../lib/destination-choice.ts';
import { createRouter } from '../lib/recommender.ts';
import type { GraphData, GraphEdge, RouteInput } from '../lib/recommender.ts';

// Separate branches have known route lengths; all POIs pass the coarse distance screen.
const destinations = [
  ['original', 3000],
  ['near', 1500],
  ['boundary', 2000],
  ['short', 800],
  ['far', 2200],
  ['stairs', 1000],
  ['major', 1000],
  ['steep', 1000],
  ['unknown', 1000],
  ['wrong-theme', 1000],
  ['cafe', 1000],
] as const;
const origin = { id: 'origin', lon: 128.9, lat: 37.78 };
const places = destinations.map(([id], i) => ({
  id,
  name: id,
  lon: origin.lon + 0.002 + i * 0.0002,
  lat: origin.lat + 0.002,
  category: id === 'cafe' ? 'cafe' : 'park',
}));
const graph: GraphData = {
  version: 'destination-choice-check',
  bbox: [128.89, 37.77, 128.92, 37.8],
  nodes: [origin, ...places],
  pois: places,
  edges: destinations.map(
    ([id, meters]): GraphEdge => ({
      id: `edge-${id}`,
      from: origin.id,
      to: id,
      distanceMeters: meters,
      bidirectional: true,
      highway:
        id === 'stairs' ? 'steps' : id === 'major' ? 'primary' : 'footway',
      gradePercent: id === 'steep' ? 8 : 0,
      gradeQuality: id === 'unknown' ? 'missing' : 'dem-estimate',
      terrainTags: id === 'wrong-theme' ? ['road'] : ['river'],
      surfaceClass: 'paved',
      lit: 'yes',
    }),
  ),
};
const input: RouteInput = {
  origin: { nodeId: origin.id },
  destinationId: 'original',
  minutes: 50,
  paceMinKm: 6,
  pauseMinutes: 3,
  targetDistanceKm: 2,
  maxDistanceKm: 4,
  mode: 'one_way',
  scenery: 'water',
  theme: 'river',
  hillPreference: 'gentle',
  surfacePreference: 'paved',
  avoidSteps: true,
  avoidMajorRoads: true,
  maxGradePercent: 6,
  requireKnownSlope: true,
  timeOfDay: 'night',
};
const before = structuredClone(input);
Object.freeze(input.origin);
Object.freeze(input);
assert.equal(exceedsGoal(2000, input), false);
assert.equal(exceedsGoal(2000 + 1e-7, input), false);
assert.equal(exceedsGoal(2000.001, input), true);
const consent = distanceConsentInput(input, 2501, 61.2);
assert.deepEqual(consent, {
  ...input,
  targetDistanceKm: 2.6,
  maxDistanceKm: 4,
  minutes: 62,
});
assert.deepEqual(distanceConsentInput(input, 800, 10), input);
assert.deepEqual(distanceConsentInput(input, 4300, 70), {
  ...input,
  targetDistanceKm: 4.3,
  maxDistanceKm: 4.3,
  minutes: 70,
});
assert.equal(distanceConsentInput(input, 30000, 240)?.maxDistanceKm, 30);
assert.equal(distanceConsentInput(input, 30000.1, 240), null);
assert.equal(distanceConsentInput(input, 3000, 240.1), null);
assert.equal(distanceConsentInput(input, NaN, 50), null);
assert.equal(distanceConsentInput(input, 3000, Infinity), null);

const router = createRouter(graph);
const quoted = router.recommend(input);
const quotedBefore = structuredClone(quoted);
const agreement = createDistanceConsent(input, quoted)!;
assert.ok(agreement);
assert.equal(agreement.result.routes.length, 1);
assert.strictEqual(
  agreement.result.routes[0].geometry,
  quoted.routes[0].geometry,
);
assert.strictEqual(
  agreement.result.routes[0].edgeIds,
  quoted.routes[0].edgeIds,
);
assert.equal(agreement.input.targetDistanceKm, 3);
assert.equal(agreement.result.routes[0].targetDifferenceMeters, 0);
assert.equal(agreement.result.routes[0].features.distance, 1);
assert.ok(
  agreement.result.routes[0].reasons.includes(
    '목표 3km 대비 0.00km · 최대 4km 이내',
  ),
);
assert.deepEqual(
  quoted,
  quotedBefore,
  'quoting must not mutate the original recommendation',
);
assert.equal(createDistanceConsent(input, { ...quoted, routes: [] }), null);

// Consent also keeps the same path when both original distance and time caps
// had to be expanded to find it. Access/terrain settings cannot change.
const strictInput = { ...input, maxDistanceKm: 2, minutes: 10 };
const expanded = createDistanceConsent(strictInput, quoted)!;
assert.equal(expanded.input.maxDistanceKm, 3);
assert.equal(
  expanded.input.minutes,
  Math.ceil(quoted.routes[0].bufferedMinutes),
);
assert.deepEqual(expanded.input, {
  ...strictInput,
  targetDistanceKm: 3,
  maxDistanceKm: 3,
  minutes: Math.ceil(quoted.routes[0].bufferedMinutes),
});
assert.strictEqual(
  expanded.result.routes[0].geometry,
  quoted.routes[0].geometry,
);
const validated = router.recommend(expanded.input).routes[0];
assert.deepEqual(expanded.result.routes[0].features, validated.features);
assert.equal(expanded.result.routes[0].score, validated.score);

const fiveKmGraph = structuredClone(graph);
fiveKmGraph.edges[0].distanceMeters = 5000;
const fiveKmRouter = createRouter(fiveKmGraph);
const tenKmInput = {
  ...input,
  targetDistanceKm: 10,
  maxDistanceKm: 10,
  minutes: 100,
};
assert.equal(
  fiveKmRouter.recommend({ ...tenKmInput, mode: 'out_and_back' }).routes[0]
    .distanceMeters,
  10000,
);
assert.equal(
  fiveKmRouter.recommend({ ...tenKmInput, mode: 'one_way' }).routes[0]
    .distanceMeters,
  5000,
);
assert.equal(
  fiveKmRouter.recommend({ ...tenKmInput, mode: 'loop' }).status,
  'no_route',
);

// Regression: changing the target from 3 to 3.2km used to replace a 3.152km
// quoted route with candidates over 3.2km. Consent must preserve the quoted path.
const liveGraph = JSON.parse(
  readFileSync(
    new URL('../public/data/gangneung.json', import.meta.url),
    'utf8',
  ),
) as GraphData;
const liveRouter = createRouter(liveGraph);
const liveInput: RouteInput = {
  origin: { nodeId: '4655208788' },
  destinationId: 'node/11119092279',
  minutes: 60,
  paceMinKm: 7,
  maxDistanceKm: 6,
  pauseMinutes: 5,
  mode: 'loop',
  scenery: 'water',
  targetDistanceKm: 3,
  theme: 'coast',
  hillPreference: 'gentle',
  surfacePreference: 'any',
  avoidSteps: true,
  avoidMajorRoads: false,
  requireKnownSlope: false,
  timeOfDay: 'day',
};
const liveResult = liveRouter.recommend(liveInput);
const liveAgreement = createDistanceConsent(liveInput, liveResult)!;
assert.ok(liveAgreement);
const agreedRoute = liveAgreement.result.routes[0];
assert.strictEqual(agreedRoute.geometry, liveResult.routes[0].geometry);
assert.strictEqual(agreedRoute.edgeIds, liveResult.routes[0].edgeIds);
assert.ok(
  exceedsGoal(
    agreedRoute.distanceMeters + agreedRoute.connectorDistanceMeters,
    liveInput,
  ),
);
assert.equal(
  routesWithinGoal(liveAgreement.result, liveAgreement.input).length,
  1,
);
assert.ok(agreedRoute.bufferedMinutes <= liveAgreement.input.minutes);
assert.ok(
  agreedRoute.distanceMeters + agreedRoute.connectorDistanceMeters <=
    liveAgreement.input.maxDistanceKm * 1000,
);
assert.deepEqual({ ...liveAgreement.input, targetDistanceKm: 3 }, liveInput);
const choices = await nearbyDestinations(
  graph,
  router,
  input,
  new AbortController().signal,
);
assert.deepEqual(
  choices.map((choice) => choice.place.id),
  ['boundary', 'near', 'short'],
);
for (const choice of choices) {
  assert.equal(choice.place.category, 'park');
  assert.notEqual(choice.place.id, input.destinationId);
  assert.ok(choice.totalMeters <= 2000);
  assert.deepEqual(choice.input, {
    ...input,
    destinationId: choice.place.id,
    maxDistanceKm: 2,
  });
  assert.equal(choice.result.status, 'ok');
  assert.ok(
    choice.result.routes.every(
      (route) =>
        route.distanceMeters + route.connectorDistanceMeters <= 2000 + 1e-6,
    ),
  );
  assert.ok(
    choice.result.routes.every(
      (route) => route.bufferedMinutes <= input.minutes,
    ),
  );
}
const selectedNear = await nearbyDestinations(
  graph,
  router,
  { ...input, destinationId: 'near' },
  new AbortController().signal,
);
assert.equal(
  selectedNear.some((choice) => choice.place.id === 'near'),
  false,
  'exclude the original destination even when it fits the goal',
);
assert.deepEqual(
  await nearbyDestinations(
    graph,
    router,
    { ...input, minutes: 5, pauseMinutes: 0 },
    new AbortController().signal,
  ),
  [],
  'nearby discovery must not extend the available time',
);
assert.deepEqual(
  await nearbyDestinations(
    graph,
    router,
    { ...input, mode: 'loop' },
    new AbortController().signal,
  ),
  [],
  'a dead-end star has no valid loop; do not silently offer out-and-back routes',
);
const roundTrips = await nearbyDestinations(
  graph,
  router,
  { ...input, mode: 'out_and_back' },
  new AbortController().signal,
);
assert.deepEqual(
  roundTrips.map((choice) => choice.place.id),
  ['short'],
);
assert.equal(roundTrips[0].totalMeters, 1600);
assert.equal(roundTrips[0].input.mode, 'out_and_back');

const mixed = structuredClone(choices[0].result);
mixed.snaps!.origin.distanceMeters = 30;
mixed.snaps!.destination.distanceMeters = 70;
mixed.routes = [1800, 1900.001, 1900].map((meters, i) => ({
  ...mixed.routes[0],
  id: `mixed-${i}`,
  distanceMeters: meters,
  connectorDistanceMeters: 100,
}));
assert.deepEqual(
  routesWithinGoal(mixed, input).map((route) => route.id),
  ['mixed-0', 'mixed-2'],
  'check every candidate including snap connectors, include the exact boundary, and preserve order',
);
assert.deepEqual(
  routesWithinGoal(
    {
      ...mixed,
      routes: mixed.routes.map((route) => ({
        ...route,
        connectorDistanceMeters: 200,
      })),
    },
    { ...input, mode: 'out_and_back' },
  ).map((route) => route.id),
  ['mixed-0'],
  'return trips double the unverified connectors',
);
assert.equal(
  mixed.routes.length,
  3,
  'filtering must not mutate the recommendation',
);

const aborted = new AbortController();
aborted.abort();
await assert.rejects(nearbyDestinations(graph, router, input, aborted.signal), {
  name: 'AbortError',
});
await assert.rejects(
  nearbyDestinations(
    graph,
    router,
    { ...input, destinationId: 'missing' },
    aborted.signal,
  ),
  { name: 'AbortError' },
);
const during = new AbortController();
let searches = 0;
const cancelAfterFirst = {
  ...router,
  recommend(candidate: RouteInput) {
    const result = router.recommend(candidate);
    searches++;
    during.abort();
    return result;
  },
};
await assert.rejects(
  nearbyDestinations(graph, cancelAfterFirst, input, during.signal),
  { name: 'AbortError' },
);
assert.equal(
  searches,
  1,
  'cancellation must stop later searches and discard partial results',
);
assert.deepEqual(
  input,
  before,
  'consent and alternative discovery must not mutate the original requirements',
);
console.log(
  'Destination choice checks passed: consent boundaries, real route budgets and exclusions, unchanged requirements, cancellation.',
);
