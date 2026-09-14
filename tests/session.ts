import assert from 'node:assert/strict';
import {
  elapsed,
  parseSession,
  restoreSession,
  SESSION_KEY,
  type RunSession,
} from '../lib/session.ts';
import { RECORD_KEY, parseRecords } from '../lib/records.ts';
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

const bounds: [number, number, number, number] = [
  127.02, 37.51, 127.105, 37.575,
];
const current: RunSession = {
  ...session,
  record: {
    ...session.record,
    geometry: [
      [127.04, 37.54],
      [127.05, 37.55],
    ],
  },
};
function device(value: RunSession, failAt?: string) {
  const data = new Map([[SESSION_KEY, JSON.stringify(value)]]);
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === failAt) throw Error('quota');
      data.set(key, value);
    },
    removeItem: (key: string) => {
      if (key === failAt) throw Error('storage unavailable');
      data.delete(key);
    },
  };
  return { data, storage };
}
const local = device(current);
assert.deepEqual(restoreSession(local.storage, bounds), {
  session: current,
  archived: false,
});
assert.equal(
  local.data.size,
  1,
  'supported sessions require no storage writes',
);
local.data.set(RECORD_KEY, '{broken-records');
assert.deepEqual(
  restoreSession(local.storage, bounds),
  {
    session: current,
    archived: false,
  },
  'a damaged history must not prevent a valid current session from resuming',
);
for (const old of [
  session,
  {
    ...current,
    record: {
      ...current.record,
      geometry: [current.record.geometry[0], session.record.geometry[1]],
    },
  },
]) {
  const { data, storage } = device(old);
  const raw = data.get(SESSION_KEY);
  assert.deepEqual(restoreSession(storage, bounds), {
    session: null,
    archived: true,
  });
  assert.equal(data.get(`${SESSION_KEY}:recovery:${old.record.id}`), raw);
  assert.deepEqual(parseRecords(data.get(RECORD_KEY)!), [old.record]);
  assert.equal(data.has(SESSION_KEY), false);
  assert.deepEqual(restoreSession(storage, bounds), {
    session: null,
    archived: false,
  });
  assert.equal(parseRecords(data.get(RECORD_KEY)!).length, 1);
}
for (const failAt of [
  `${SESSION_KEY}:recovery:${session.record.id}`,
  RECORD_KEY,
  SESSION_KEY,
]) {
  const { data, storage } = device(session, failAt);
  const raw = data.get(SESSION_KEY);
  assert.throws(() => restoreSession(storage, bounds));
  assert.equal(
    data.get(SESSION_KEY),
    raw,
    'failed migration must keep active bytes',
  );
}
for (const records of [
  '{broken',
  JSON.stringify(
    Array.from({ length: 200 }, (_, i) => ({
      ...session.record,
      id: String(i),
    })),
  ),
]) {
  const { data, storage } = device(session);
  data.set(RECORD_KEY, records);
  assert.throws(() => restoreSession(storage, bounds));
  assert.equal(data.get(SESSION_KEY), JSON.stringify(session));
  assert.equal(data.get(RECORD_KEY), records);
}
const finished = {
  ...session.record,
  completedAt: '2026-09-13T00:00:00Z',
  actualKm: 4.2,
  actualMinutes: 40,
};
const existing = device(session);
existing.data.set(RECORD_KEY, JSON.stringify([finished]));
restoreSession(existing.storage, bounds);
assert.deepEqual(
  parseRecords(existing.data.get(RECORD_KEY)!),
  [finished],
  'never overwrite a completed record',
);
const unreadable = device(session);
unreadable.data.set(SESSION_KEY, '{broken');
assert.throws(() => restoreSession(unreadable.storage, bounds));
assert.equal(unreadable.data.get(SESSION_KEY), '{broken');
console.log(
  'Region migration: current, mixed-region, archive, duplicate, quota and corrupt storage checks passed.',
);
