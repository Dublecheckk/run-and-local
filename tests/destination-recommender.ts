import assert from 'node:assert/strict';
import {
  finalDestinationScore,
  rankDestinations,
  type PlaceCandidate,
} from '../lib/destination-recommender.ts';

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

const originalScore = finalDestinationScore(80, 90);
assert.equal(finalDestinationScore(80, 90, 'theme'), originalScore - 8);
assert.equal(finalDestinationScore(80, 90, 'out_and_back'), originalScore - 15);
assert.equal(finalDestinationScore(80, 90, undefined, 1), originalScore + 5);
console.log('Destination recommender checks passed.');
