import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createRouter,
  type GraphData,
  type RouteInput,
} from '../lib/recommender.ts';

const file = process.argv[2] ?? 'public/data/gangneung.json';
const graph = JSON.parse(fs.readFileSync(file, 'utf8')) as GraphData;
const cases = [
  { name: '주문진', start: '1957603296', destination: '11182801686' },
  { name: '옥계', start: '11399335412', destination: '13070979294' },
];
for (const item of cases)
  graph.pois.push({
    id: `coverage:${item.name}`,
    name: item.name,
    lon: graph.nodes.find((node) => node.id === item.destination)!.lon,
    lat: graph.nodes.find((node) => node.id === item.destination)!.lat,
    nodeId: item.destination,
    category: 'attraction',
  });

const router = createRouter(graph);
for (const item of cases) {
  assert(
    graph.nodes.some((node) => node.id === item.start),
    `${item.name} 출발 정점 누락`,
  );
  const input: RouteInput = {
    origin: { nodeId: item.start },
    destinationId: `coverage:${item.name}`,
    minutes: 120,
    paceMinKm: 7,
    maxDistanceKm: 10,
    pauseMinutes: 5,
    mode: 'out_and_back',
    scenery: 'any',
    targetDistanceKm: 6,
    theme: 'any',
    hillPreference: 'gentle',
    surfacePreference: 'any',
    avoidSteps: true,
    avoidMajorRoads: false,
    requireKnownSlope: false,
    timeOfDay: 'day',
  };
  const result = router.recommend(input);
  assert.equal(result.status, 'ok', `${item.name} 전역 경로 생성 실패`);
  assert(result.routes[0].distanceMeters <= 10_000);
}
console.log('Gangneung city coverage checks passed: 주문진, 옥계.');
