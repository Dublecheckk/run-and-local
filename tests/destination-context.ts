import assert from 'node:assert/strict';
import {
  classifyKakaoDestination,
  contextBonus,
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
assert.equal(contextBonus(0), 0);
assert.equal(contextBonus(0.5), 2.5);
assert.equal(contextBonus(10), 5);
assert.equal(missionLabelForDestinationType('SHOPPING'), '쇼핑 목적지 러닝');
assert.equal(missionLabelForDestinationType('MEAL'), '저녁 약속 러닝');

console.log('Destination type and mission context checks passed.');
