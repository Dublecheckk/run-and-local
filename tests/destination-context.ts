import assert from 'node:assert/strict';
import {
  classifyKakaoDestination,
  isRouteEligible,
  missionLabelForDestinationType,
} from '../lib/destination-context.ts';

assert.equal(classifyKakaoDestination({ categoryGroupCode: 'FD6' }), 'MEAL');
assert.equal(
  classifyKakaoDestination({
    categoryGroupCode: 'FD6',
    categoryName: '음식점 > 술집 > 포차',
  }),
  'SOCIAL_NIGHT',
);
assert.equal(
  classifyKakaoDestination({ categoryGroupCode: 'MT1' }),
  'SHOPPING',
);
assert.equal(
  classifyKakaoDestination({ categoryName: '생활서비스 > 미용' }),
  'DAILY_ERRAND',
);
assert.equal(
  classifyKakaoDestination({ categoryGroupCode: 'CT1' }),
  'CULTURE_LEISURE',
);
assert.equal(
  classifyKakaoDestination({ categoryGroupCode: 'CE7' }),
  'CAFE_DESSERT',
);
assert.equal(classifyKakaoDestination({}), 'REVIEW');
assert.equal(isRouteEligible('REVIEW'), false);
assert.equal(isRouteEligible('EXCLUDE'), false);
assert.equal(isRouteEligible('MEAL'), true);
assert.equal(missionLabelForDestinationType('SHOPPING'), '쇼핑 목적지 러닝');
assert.equal(missionLabelForDestinationType('MEAL'), '식사·카페 러닝');
assert.equal(missionLabelForDestinationType('CAFE_DESSERT'), '식사·카페 러닝');

console.log('Destination type and mission context checks passed.');
