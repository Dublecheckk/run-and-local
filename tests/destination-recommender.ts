import assert from 'node:assert/strict';
import {
  rankDestinations,
  type PlaceCandidate,
} from '../lib/destination-recommender.ts';

const places: PlaceCandidate[] = [
  {
    id: 'near',
    name: '가까운 카페',
    lon: 128.91,
    lat: 37.8,
    category: 'cafe',
    source: 'kakao',
  },
  {
    id: 'fit',
    name: '맞춤 카페',
    lon: 128.92,
    lat: 37.8,
    category: 'cafe',
    categoryDetail: '음식점 > 카페',
    address: '강릉시',
    phone: '033',
    source: 'kakao',
  },
  {
    id: 'food',
    name: '식당',
    lon: 128.92,
    lat: 37.8,
    category: 'restaurant',
    source: 'kakao',
  },
];
const ranked = rankDestinations({
  origin: [128.9, 37.8],
  kind: 'coffee',
  targetDistanceKm: 4,
  maxDistanceKm: 6,
  minutes: 50,
  paceMinKm: 7,
  pauseMinutes: 5,
  mode: 'out_and_back',
  places,
});
assert(ranked.length === 2);
assert(ranked.every((p) => p.category === 'cafe'));
assert.equal(ranked[0].id, 'fit');
assert(ranked[0].score >= ranked[1].score);
console.log('Destination recommender checks passed.');
