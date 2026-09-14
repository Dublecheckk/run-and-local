import assert from 'node:assert/strict';
import {
  finalDestinationScore,
  missionMenuForProfile,
  rankDestinations,
  RUN_KINDS,
  type PlaceCandidate,
} from '../lib/destination-recommender.ts';
import {
  DEFAULT_PROFILE,
  parseProfile,
  type RunnerProfile,
} from '../lib/profile.ts';

for (const sex of ['F', 'M'] as const) {
  for (const ageGroup of ['20', '30', '40', '50', '60'] as const) {
    const menu = missionMenuForProfile({ sex, ageGroup });
    const clusterId =
      sex === 'F' ? (ageGroup === '20' ? 0 : 1) : ageGroup === '20' ? 2 : 3;
    const expected = [
      ['daily'],
      ['shopping'],
      ['evening'],
      ['daily', 'shopping'],
    ][clusterId];
    assert.equal(menu.clusterId, clusterId);
    assert.deepEqual(menu.suggestedKinds, expected);
    assert.deepEqual(menu.kinds.slice(0, expected.length), expected);
    assert.deepEqual(
      [...menu.kinds].sort(),
      Object.keys(RUN_KINDS).sort(),
      'every mission stays available exactly once',
    );
  }
}
for (const profile of [
  DEFAULT_PROFILE,
  { sex: 'F', ageGroup: 'unspecified' },
  { sex: 'unspecified', ageGroup: '20' },
  parseProfile(
    JSON.stringify({ ...DEFAULT_PROFILE, sex: 'other', ageGroup: '70' }),
  ),
] as RunnerProfile[]) {
  const menu = missionMenuForProfile(profile);
  assert.equal(menu.clusterId, null);
  assert.deepEqual(menu.suggestedKinds, []);
  assert.deepEqual(menu.kinds, ['daily', 'shopping', 'evening', 'culture']);
}

const places: PlaceCandidate[] = [
  {
    id: 'near',
    name: '가까운 식당',
    lon: 128.91,
    lat: 37.8,
    category: 'cafe',
    destinationType: 'MEAL',
    source: 'kakao',
  },
  {
    id: 'fit',
    name: '맞춤 식당',
    lon: 128.92,
    lat: 37.8,
    category: 'cafe',
    destinationType: 'MEAL',
    categoryDetail: '음식점 > 한식',
    address: '서울 성동구',
    phone: '033',
    source: 'kakao',
  },
  {
    id: 'food',
    name: '식당',
    lon: 128.92,
    lat: 37.8,
    category: 'restaurant',
    destinationType: 'SHOPPING',
    source: 'kakao',
  },
];
const ranked = rankDestinations({
  origin: [128.9, 37.8],
  kind: 'evening',
  targetDistanceKm: 4,
  maxDistanceKm: 6,
  minutes: 50,
  paceMinKm: 7,
  pauseMinutes: 5,
  mode: 'out_and_back',
  places,
});
assert(ranked.length === 2);
assert(ranked.every((p) => p.destinationType === 'MEAL'));
assert.equal(ranked[0].id, 'fit');
assert(ranked[0].score >= ranked[1].score);

const cafe = rankDestinations({
  origin: [128.9, 37.8],
  kind: 'evening',
  targetDistanceKm: 4,
  maxDistanceKm: 6,
  minutes: 50,
  paceMinKm: 7,
  pauseMinutes: 5,
  mode: 'out_and_back',
  places: [{ ...places[0], id: 'cafe', destinationType: 'CAFE_DESSERT' }],
});
assert.equal(cafe.length, 1);

const originalScore = finalDestinationScore(80, 90);
assert.equal(finalDestinationScore(80, 90, 'theme'), originalScore - 8);
assert.equal(finalDestinationScore(80, 90, 'out_and_back'), originalScore - 15);
assert.equal(
  originalScore,
  86.5,
  'only place and route fit contribute to the score',
);
console.log('Destination recommender checks passed.');
