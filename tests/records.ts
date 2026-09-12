import assert from 'node:assert/strict';
import {
  parseRecords,
  completeRecord,
  type RunRecord,
} from '../lib/records.ts';
const plan: RunRecord = {
  geometry: [
    [128.9, 37.8],
    [128.91, 37.8],
  ],
  id: '1',
  destination: '강문해변',
  plannedMeters: 4200,
  plannedMinutes: 38,
  createdAt: '2026-09-12T00:00:00Z',
  completedAt: null,
  actualKm: null,
  actualMinutes: null,
};
assert.deepEqual(parseRecords(null), []);
assert.deepEqual(parseRecords(JSON.stringify([plan])), [plan]);
const done = completeRecord(plan, 4.3, 41);
assert.equal(done.actualKm, 4.3);
assert.ok(done.completedAt);
assert.equal(plan.completedAt, null);
assert.deepEqual(parseRecords(JSON.stringify([done])), [done]);
for (const raw of [
  '{',
  '{}',
  '[null]',
  JSON.stringify([{ ...plan, plannedMeters: -1 }]),
  JSON.stringify([
    {
      ...plan,
      geometry: [
        [999, 37],
        [128, 37],
      ],
    },
  ]),
  JSON.stringify([{ ...plan, completedAt: 'invalid' }]),
  JSON.stringify(Array(201).fill(plan)),
])
  assert.throws(() => parseRecords(raw));
for (const [km, min] of [
  [0, 10],
  [-1, 10],
  [NaN, 10],
  [101, 10],
  [2, 0],
  [2, Infinity],
  [2, 1441],
])
  assert.throws(() => completeRecord(plan, km, min));
console.log(
  'Records: parse, corruption preservation, limits and completion checks passed.',
);
