import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  createRouter,
  distanceMeters,
  MIN_THEME_SHARE,
  validateRouteInput,
} from '../lib/recommender.ts';
import type { GraphData, GraphEdge, RouteInput } from '../lib/recommender.ts';
import {
  parseProfile,
  DEFAULT_PROFILE,
  PROFILE_KEY,
  saveProfile,
} from '../lib/profile.ts';

// Two genuine alternative corridors: flat riverside and a steeper unpaved trail.
const nodes = [
  { id: 'a', lon: 128.9, lat: 37.78, elevationMeters: 10 },
  { id: 'b', lon: 128.905, lat: 37.783, elevationMeters: 12 },
  { id: 'c', lon: 128.905, lat: 37.777, elevationMeters: 40 },
  { id: 'd', lon: 128.91, lat: 37.78, elevationMeters: 14 },
];
const edges: GraphEdge[] = [
  ['a', 'b'],
  ['b', 'd'],
  ['a', 'c'],
  ['c', 'd'],
].map(([from, to], i) => {
  const a = nodes.find((n) => n.id === from)!,
    b = nodes.find((n) => n.id === to)!;
  return {
    id: `e${i}`,
    from,
    to,
    distanceMeters: distanceMeters([a.lon, a.lat], [b.lon, b.lat]),
    bidirectional: true,
    highway: 'footway',
    gradePercent: i < 2 ? 1 : i === 2 ? 8 : -4,
    gradeQuality: 'dem-estimate',
    surfaceClass: i < 2 ? 'paved' : 'unpaved',
    terrainTags: i < 2 ? ['river', 'road', 'forest'] : ['trail', 'forest'],
    lit: i < 2 ? 'yes' : 'no',
  };
});
const graph: GraphData = {
  version: 'terrain-check',
  bbox: [128.89, 37.77, 128.92, 37.79],
  nodes,
  edges,
  pois: nodes.map((n) => ({ ...n, name: n.id, category: 'park' })),
};
const base: RouteInput = {
  origin: { nodeId: 'a' },
  destinationId: 'd',
  minutes: 60,
  paceMinKm: 7,
  maxDistanceKm: 4,
  pauseMinutes: 0,
  mode: 'one_way',
  scenery: 'any',
  targetDistanceKm: 1.1,
  hillPreference: 'gentle',
  surfacePreference: 'any',
  avoidSteps: true,
};
const router = createRouter(graph),
  river = router.recommend({ ...base, theme: 'river' }),
  forest = router.recommend({ ...base, theme: 'forest', scenery: 'green' });
assert.equal(river.status, 'ok');
assert.equal(forest.status, 'ok');
assert.deepEqual(river.routes[0].edgeIds, ['e0', 'e1']);
assert.deepEqual(
  forest.routes[0].edgeIds,
  ['e2', 'e3'],
  'nearby trees on a road must not masquerade as a trail',
);
assert.equal(
  router.recommend({ ...base, theme: 'lake' }).status,
  'no_route',
  'unsupported themes must not silently fall back to roads',
);
assert.equal(
  router.recommend({ ...base, theme: 'forest', maxGradePercent: 6 }).status,
  'no_route',
);
assert.equal(
  router.recommend({ ...base, theme: 'forest', maxGradePercent: 10 }).status,
  'ok',
);
assert.equal(river.routes[0].terrain.pavedRatio, 1);
assert.equal(forest.routes[0].terrain.unpavedRatio, 1);
const reverse = router.recommend({
  ...base,
  origin: { nodeId: 'd' },
  destinationId: 'a',
  theme: 'forest',
}).routes[0];
assert.ok(
  Math.abs(
    forest.routes[0].terrain.ascentMeters! - reverse.terrain.descentMeters!,
  ) < 1e-7,
);
assert.ok(
  Math.abs(
    forest.routes[0].terrain.descentMeters! - reverse.terrain.ascentMeters!,
  ) < 1e-7,
);
assert.ok(
  forest.routes[0].runningMinutes >
    (forest.routes[0].distanceMeters / 1000) * base.paceMinKm,
  'uphill adds the disclosed planning allowance',
);
const missing = structuredClone(graph);
for (const e of missing.edges) {
  e.gradePercent = null;
  e.gradeQuality = 'structure-unknown';
  e.surfaceClass = 'unknown';
  delete e.lit;
}
const unknown = createRouter(missing).recommend({
  ...base,
  theme: 'river',
  surfacePreference: 'paved',
  timeOfDay: 'night',
}).routes[0];
assert.equal(unknown.terrain.ascentMeters, null);
assert.equal(unknown.terrain.maxGradePercent, null);
assert.equal(unknown.features.slope, null);
assert.equal(unknown.features.surface, null);
assert.equal(unknown.features.lighting, null);
assert.equal(unknown.terrain.surfaceCoverageRatio, 0);
assert.equal(unknown.terrain.lightingCoverageRatio, 0);
assert.equal(
  createRouter(missing).recommend({ ...base, requireKnownSlope: true }).status,
  'no_route',
);
assert.equal(
  createRouter(missing).recommend({ ...base, maxGradePercent: 2 }).status,
  'ok',
  'a known-only slope cap does not invent grades for bridges',
);
for (const setting of ['steps', 'major'] as const) {
  const changed = structuredClone(graph);
  changed.edges[2].highway = setting === 'steps' ? 'steps' : 'primary';
  assert.equal(
    createRouter(changed).recommend({
      ...base,
      theme: 'forest',
      avoidMajorRoads: true,
    }).status,
    'no_route',
  );
}
const someKnown = structuredClone(graph);
someKnown.edges[1].surfaceClass = 'unknown';
delete someKnown.edges[1].lit;
const partial = createRouter(someKnown).recommend({
  ...base,
  theme: 'river',
  surfacePreference: 'paved',
  timeOfDay: 'night',
}).routes[0];
assert.ok(
  partial.features.surface! < 0.6 && partial.features.lighting! < 0.6,
  'partial evidence must not yield 100% preference match',
);
assert.ok(validateRouteInput({ ...base, targetDistanceKm: 5 }));
assert.ok(validateRouteInput({ ...base, maxGradePercent: NaN }));
assert.ok(
  validateRouteInput({ ...base, avoidSteps: 'yes' as unknown as boolean }),
);
assert.equal(parseProfile(null), null);
assert.deepEqual(
  parseProfile(JSON.stringify(DEFAULT_PROFILE)),
  DEFAULT_PROFILE,
);
assert.equal(
  parseProfile(JSON.stringify({ ...DEFAULT_PROFILE, nickname: ' 러너 ' }))
    ?.nickname,
  '러너',
);
assert.throws(() => parseProfile('{'));
assert.throws(() =>
  parseProfile(JSON.stringify({ ...DEFAULT_PROFILE, paceMinKm: 0 })),
);

const real: GraphData = JSON.parse(
    readFileSync('public/data/gangneung.json', 'utf8'),
  ),
  realRouter = createRouter(real);
const realBase: RouteInput = {
  ...base,
  origin: { nodeId: '4655208788' },
  destinationId: 'way/648051405',
  pauseMinutes: 5,
  maxDistanceKm: 6,
  mode: 'loop',
  targetDistanceKm: 5,
};
const report = [];
for (const theme of ['coast', 'river', 'forest', 'road'] as const) {
  const input = {
    ...realBase,
    theme,
    scenery: (theme === 'forest'
      ? 'green'
      : theme === 'road'
        ? 'city'
        : 'water') as RouteInput['scenery'],
  };
  const start = performance.now(),
    result = realRouter.recommend(input);
  assert.equal(result.status, 'ok', `real ${theme} course exists`);
  for (const r of result.routes) {
    assert.ok(
      (r.terrain.themeMatchRatio ?? 0) * r.terrain.themeCoverageRatio + 1e-9 >=
        MIN_THEME_SHARE,
    );
    assert.ok(
      r.distanceMeters + r.connectorDistanceMeters <=
        input.maxDistanceKm * 1000 + 1e-6,
    );
    assert.ok(r.bufferedMinutes <= input.minutes);
    assert.ok(r.selfOverlapRatio <= 0.25 + 1e-9);
    assert.ok(r.geometry.length === r.edgeIds.length + 1);
  }
  const first = result.routes[0];
  report.push({
    theme,
    elapsedMs: Math.round(performance.now() - start),
    routes: result.routes.length,
    km: Number((first.distanceMeters / 1000).toFixed(3)),
    targetDeltaKm: Number((first.targetDifferenceMeters! / 1000).toFixed(3)),
    themeShare: Number(
      (
        (first.terrain.themeMatchRatio ?? 0) * first.terrain.themeCoverageRatio
      ).toFixed(4),
    ),
    ascentMeters: first.terrain.ascentMeters,
    diagnostics: result.diagnostics,
  });
}
assert.ok(
  new Set(report.map((r) => `${r.km}:${r.ascentMeters}`)).size >= 3,
  'themes change real courses, not just labels',
);
writeFileSync(
  '../development/terrain-recommendation-check.json',
  JSON.stringify(
    {
      date: new Date().toISOString(),
      note: 'Deterministic functional checks, not user effectiveness or exhaustive optimality validation.',
      report,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Terrain + device profile checks passed. Real Gangneung theme scenarios:',
  JSON.stringify(report),
);

const device = new Map([[PROFILE_KEY, '{broken-json']]);
const storage = {
  getItem: (key: string) => device.get(key) ?? null,
  setItem: (key: string, value: string) => {
    device.set(key, value);
  },
};
saveProfile(storage, DEFAULT_PROFILE);
assert.deepEqual(parseProfile(device.get(PROFILE_KEY)!), DEFAULT_PROFILE);
assert.ok(
  [...device.entries()].some(
    ([key, value]) =>
      key.startsWith(PROFILE_KEY + ':recovery:') && value === '{broken-json',
  ),
);
const blocked = new Map([[PROFILE_KEY, '{broken-json']]);
assert.throws(() =>
  saveProfile(
    {
      getItem: (key) => blocked.get(key) ?? null,
      setItem: () => {
        throw Error('quota');
      },
    },
    DEFAULT_PROFILE,
  ),
);
assert.equal(blocked.get(PROFILE_KEY), '{broken-json');
console.log(
  'Unreadable profile recovery preserves bytes; failed backup preserves original.',
);

const threeKm = realRouter.recommend({
  ...realBase,
  theme: 'coast',
  scenery: 'water',
  targetDistanceKm: 3,
}).routes[0];
assert.ok(
  Math.abs(threeKm.distanceMeters - 3000) < 500,
  'target distance must affect generation, not just maximum budget',
);
const uphill = router.recommend({
  ...base,
  theme: 'forest',
  hillPreference: 'challenge',
}).routes[0];
const downhill = router.recommend({
  ...base,
  origin: { nodeId: 'd' },
  destinationId: 'a',
  theme: 'forest',
  hillPreference: 'challenge',
}).routes[0];
assert.ok(
  uphill.features.slope! >= downhill.features.slope!,
  'ascent challenge never rewards descent more than ascent',
);
