import assert from 'node:assert/strict';
import { elapsed, parseSession, type RunSession } from '../lib/session.ts';
const session: RunSession = {
  record: {
    id: 's1',
    destination: '강문해변',
    geometry: [
      [128.9, 37.8],
      [128.91, 37.8],
    ],
    plannedMeters: 4200,
    plannedMinutes: 38,
    createdAt: '2026-09-12T00:00:00Z',
    completedAt: null,
    actualKm: null,
    actualMinutes: null,
  },
  elapsedMs: 10000,
  resumedAt: 100000,
};
assert.equal(elapsed(session, 105000), 15000);
assert.equal(elapsed(session, 99000), 10000);
assert.equal(elapsed({ ...session, resumedAt: null }, 105000), 10000);
assert.deepEqual(parseSession(JSON.stringify(session)), session);
assert.equal(parseSession(null), null);
for (const raw of [
  '',
  '{',
  '{}',
  JSON.stringify({ ...session, elapsedMs: -1 }),
  JSON.stringify({ ...session, resumedAt: '1000' }),
  JSON.stringify({ ...session, record: null }),
])
  assert.throws(() => parseSession(raw));
console.log(
  'Run timer: pause/resume, reload, clock rollback and invalid data checks passed.',
);
