export type DestinationType =
  | 'MEAL'
  | 'SHOPPING'
  | 'DAILY_ERRAND'
  | 'CULTURE_LEISURE'
  | 'SOCIAL_NIGHT'
  | 'SPORTS_WELLNESS'
  | 'CAFE_DESSERT'
  | 'REVIEW'
  | 'EXCLUDE';

export type MissionContextId =
  | 'LIFE_DESTINATION_RUN'
  | 'SHOPPING_DESTINATION_RUN'
  | 'EVENING_APPOINTMENT_RUN'
  | 'CULTURE_LEISURE_RUN';

export const DESTINATION_TYPE_LABELS: Record<DestinationType, string> = {
  MEAL: '식사',
  SHOPPING: '쇼핑',
  DAILY_ERRAND: '생활용무',
  CULTURE_LEISURE: '문화·여가',
  SOCIAL_NIGHT: '저녁 약속',
  SPORTS_WELLNESS: '운동·웰니스',
  CAFE_DESSERT: '카페·디저트',
  REVIEW: '분류 검토 필요',
  EXCLUDE: '제외',
};

export const MISSION_CONTEXTS = {
  LIFE_DESTINATION_RUN: {
    label: '생활 목적지 러닝',
    prompt: '식사·쇼핑·생활용무까지',
    destinationTypes: ['MEAL', 'SHOPPING', 'DAILY_ERRAND'] as DestinationType[],
    contextPrior: 0.759417,
    source: '신한카드 MC_0',
  },
  SHOPPING_DESTINATION_RUN: {
    label: '쇼핑 목적지 러닝',
    prompt: '필요한 물건을 사러 가는 길',
    destinationTypes: ['SHOPPING'] as DestinationType[],
    contextPrior: 0.157734,
    source: '신한카드 MC_2',
  },
  EVENING_APPOINTMENT_RUN: {
    label: '저녁 약속 러닝',
    prompt: '식사나 약속 장소까지',
    destinationTypes: ['MEAL', 'SOCIAL_NIGHT'] as DestinationType[],
    contextPrior: 0.082849,
    source: '신한카드 MC_1 기반 규칙 라벨',
  },
  CULTURE_LEISURE_RUN: {
    label: '문화생활 러닝',
    prompt: '전시·공연·여가 장소까지',
    destinationTypes: ['CULTURE_LEISURE'] as DestinationType[],
    contextPrior: 0,
    source: '보조 메뉴',
  },
} as const;

export function contextBonus(contextPrior?: number) {
  if (!Number.isFinite(contextPrior)) return 0;
  return Math.min(5, Math.max(0, contextPrior! * 5));
}

export function missionForDestinationType(type?: DestinationType) {
  if (!type || type === 'REVIEW' || type === 'EXCLUDE') return null;
  if (type === 'SHOPPING') return 'SHOPPING_DESTINATION_RUN' as const;
  if (type === 'MEAL' || type === 'SOCIAL_NIGHT')
    return 'EVENING_APPOINTMENT_RUN' as const;
  if (type === 'CULTURE_LEISURE') return 'CULTURE_LEISURE_RUN' as const;
  return 'LIFE_DESTINATION_RUN' as const;
}

export function missionLabelForDestinationType(type?: DestinationType) {
  const id = missionForDestinationType(type);
  return id ? MISSION_CONTEXTS[id].label : '목적지 러닝';
}

export function isRouteEligible(type?: DestinationType) {
  return !!type && !['REVIEW', 'EXCLUDE'].includes(type);
}

export function classifyKakaoDestination(place: {
  categoryGroupCode?: string;
  categoryName?: string;
}): DestinationType {
  const group = place.categoryGroupCode ?? '';
  const detail = place.categoryName ?? '';
  if (group === 'CE7') return 'CAFE_DESSERT';
  if (group === 'FD6')
    return /술집|포차|유흥|바\b/.test(detail) ? 'SOCIAL_NIGHT' : 'MEAL';
  if (['MT1', 'CS2'].includes(group)) return 'SHOPPING';
  if (['CT1', 'AT4', 'AD5'].includes(group)) return 'CULTURE_LEISURE';
  if (['HP8', 'PM9', 'BK9', 'PO3', 'AG2', 'PS3', 'SC4', 'AC5'].includes(group))
    return 'DAILY_ERRAND';
  if (/백화점|쇼핑|패션|의류|잡화|마트|편의점/.test(detail)) return 'SHOPPING';
  if (/미용|반려동물|세탁|수선|병원|약국|은행|공공기관/.test(detail))
    return 'DAILY_ERRAND';
  if (/공연|전시|미술|박물|도서관|영화|관광|공원/.test(detail))
    return 'CULTURE_LEISURE';
  if (/헬스|요가|필라테스|스포츠|운동/.test(detail)) return 'SPORTS_WELLNESS';
  return 'REVIEW';
}
