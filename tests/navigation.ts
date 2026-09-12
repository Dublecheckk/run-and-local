import assert from 'node:assert/strict';
import { mock } from 'node:test';
import {
  readMapPosition,
  distanceToCourse,
  courseDirections,
} from '../lib/navigation.ts';
import { parseSession } from '../lib/session.ts';
const stamp = 1_800_000_000_000;
const position = {
  coords: { longitude: 128.901, latitude: 37.78, accuracy: 12 },
  timestamp: stamp,
};
assert.deepEqual(readMapPosition(position, stamp), {
  point: [128.901, 37.78],
  accuracy: 12,
  timestamp: stamp,
});
for (const p of [
  { ...position, timestamp: stamp - 30001 },
  { ...position, timestamp: stamp + 10001 },
  { ...position, coords: { ...position.coords, accuracy: 101 } },
  { ...position, coords: { ...position.coords, longitude: NaN } },
  { ...position, coords: { ...position.coords, latitude: 91 } },
])
  assert.equal(readMapPosition(p, stamp), null);
const path: [number, number][] = [
  [128.9, 37.78],
  [128.902, 37.78],
];
assert.ok(
  distanceToCourse([128.901, 37.78], path) < 0.01,
  'middle of a segment must not appear off route',
);
assert.ok(Math.abs(distanceToCourse([128.901, 37.781], path) - 111.195) < 0.1);
assert.ok(
  distanceToCourse([128.905, 37.78], path) > 200,
  'past an endpoint uses endpoint distance',
);
assert.ok(
  Number.isFinite(distanceToCourse([128.901, 37.78], [path[0], path[0]])),
);
const record = {
  geometry: path,
  id: 'test',
  destination: '강문해변',
  plannedMeters: 200,
  plannedMinutes: 5,
  createdAt: '2026-09-12T00:00:00Z',
  completedAt: null,
  actualKm: null,
  actualMinutes: null,
};
const old = { record, elapsedMs: 0, resumedAt: null };
assert.deepEqual(
  parseSession(JSON.stringify(old)),
  old,
  'older active runs survive schema extension',
);
const session = {
  ...old,
  navigation: { mode: 'one_way', destination: path[1], destinationIndex: 1 },
};
assert.deepEqual(parseSession(JSON.stringify(session)), session);
assert.throws(() =>
  parseSession(
    JSON.stringify({
      ...session,
      navigation: { ...session.navigation, destinationIndex: 2 },
    }),
  ),
);
assert.throws(() =>
  parseSession(
    JSON.stringify({
      ...session,
      navigation: { ...session.navigation, destination: [200, 0] },
    }),
  ),
);
let native = false,
  requests = 0,
  cleared = 0,
  callback: (p: unknown, e?: unknown) => void = () => {};
let permission = { location: 'granted', coarseLocation: 'granted' };
mock.module('@capacitor/core', {
  namedExports: { Capacitor: { isNativePlatform: () => native } },
});
mock.module('@capacitor/geolocation', {
  namedExports: {
    Geolocation: {
      requestPermissions: async () => {
        requests++;
        return permission;
      },
      watchPosition: async (_options: unknown, cb: typeof callback) => {
        callback = cb;
        return 'watch-1';
      },
      clearWatch: async ({ id }: { id: string }) => {
        assert.equal(id, 'watch-1');
        cleared++;
      },
    },
  },
});
const { watchCurrentPosition } = await import('../lib/device.ts');
let updates = 0,
  errors = 0;
const stop = await watchCurrentPosition(
  () => {
    updates++;
  },
  () => {
    errors++;
  },
);
assert.equal(requests, 0, 'web must not call native-only requestPermissions');
callback(position);
callback(null, Error('timeout'));
assert.equal(updates, 1);
assert.equal(errors, 1);
await stop();
assert.equal(cleared, 1, 'clearWatch receives the same async ID');
native = true;
permission = { location: 'denied', coarseLocation: 'denied' };
await assert.rejects(() =>
  watchCurrentPosition(
    () => {},
    () => {},
  ),
);
assert.equal(requests, 1);
permission = { location: 'denied', coarseLocation: 'granted' };
const approximate = await watchCurrentPosition(
  () => {},
  () => {},
);
await approximate();
assert.equal(cleared, 2);
console.log(
  'Navigation: position validity/age, segment distance, legacy/new session, web/native permission, GPS callback and clear checks passed.',
);

const longSegment: [number, number][] = [
  [128.9, 37.78],
  [128.9, 37.79],
];
const arrows = courseDirections(longSegment);
assert.equal(arrows.length, 6, 'long edges carry every spaced direction arrow');
assert.ok(arrows.every((a) => Math.abs(a.bearing) < 0.1));
assert.ok(
  courseDirections([...longSegment].reverse()).every(
    (a) => Math.abs(a.bearing) === 180,
  ),
);
const outback = courseDirections([...longSegment, longSegment[0]], 1);
assert.ok(
  outback.every((a) => Math.abs(a.bearing) < 0.1),
  'out-and-back only displays outbound arrows',
);
