import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createRouter,
  type GraphData,
  type RouteInput,
} from '../lib/recommender.ts';

type RegionGraph = GraphData & {
  origins: { name: string; nodeId: string; lon: number; lat: number }[];
};

const file = process.argv[2] ?? 'public/data/seongsu.json';
const graph = JSON.parse(fs.readFileSync(file, 'utf8')) as RegionGraph;
const pairs = [
  ['서울숲역 인근', '뚝섬역 인근'],
  ['성수역 인근', '뚝섬유원지역 인근'],
] as const;

for (const [, destinationName] of pairs) {
  const destination = graph.origins.find(
    (item) => item.name === destinationName,
  );
  assert(destination, `${destinationName} 기준점 누락`);
  graph.pois.push({
    id: `coverage:${destinationName}`,
    name: destinationName,
    lon: destination.lon,
    lat: destination.lat,
    nodeId: destination.nodeId,
    category: 'attraction',
  });
}

const router = createRouter(graph);
assert.equal(
  router.snap({ lon: 126.978, lat: 37.566 }),
  null,
  '권역 밖 출발지 차단',
);
for (const origin of graph.origins)
  assert.equal(
    router.snap(origin)?.distanceMeters,
    0,
    `${origin.name} 출발 가능`,
  );
for (const [startName, destinationName] of pairs) {
  const start = graph.origins.find((item) => item.name === startName);
  assert(start, `${startName} 기준점 누락`);
  const input: RouteInput = {
    origin: { nodeId: start.nodeId },
    destinationId: `coverage:${destinationName}`,
    minutes: 120,
    paceMinKm: 7,
    maxDistanceKm: 12,
    pauseMinutes: 5,
    mode: 'one_way',
    scenery: 'any',
    targetDistanceKm: 5,
    theme: 'any',
    hillPreference: 'gentle',
    surfacePreference: 'any',
    avoidSteps: true,
    avoidMajorRoads: false,
    requireKnownSlope: false,
    timeOfDay: 'day',
  };
  const result = router.recommend(input);
  assert.equal(
    result.status,
    'ok',
    `${startName} → ${destinationName} 경로 생성 실패`,
  );
  assert(result.routes[0].distanceMeters <= 12_000);
}

console.log('성수 실증권역 연결성 확인: 서울숲·성수·뚝섬.');
