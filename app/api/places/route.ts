import { RUN_KINDS, type RunKind } from '@/lib/destination-recommender';
import {
  MISSION_CONTEXTS,
  classifyKakaoDestination,
  isRouteEligible,
  missionForDestinationType,
  missionLabelForDestinationType,
} from '@/lib/destination-context';

type KakaoSearchPlan =
  | { endpoint: 'category'; category: string }
  | { endpoint: 'keyword'; query: string };

const KAKAO_SEARCH: Record<RunKind, KakaoSearchPlan[]> = {
  daily: [
    { endpoint: 'category', category: 'FD6' },
    { endpoint: 'category', category: 'MT1' },
    { endpoint: 'category', category: 'CS2' },
    { endpoint: 'category', category: 'HP8' },
  ],
  shopping: [
    { endpoint: 'category', category: 'MT1' },
    { endpoint: 'category', category: 'CS2' },
    { endpoint: 'keyword', query: '쇼핑' },
  ],
  evening: [
    { endpoint: 'category', category: 'FD6' },
    { endpoint: 'category', category: 'CE7' },
  ],
  culture: [
    { endpoint: 'category', category: 'CT1' },
    { endpoint: 'category', category: 'AT4' },
  ],
};

export async function GET(request: Request) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key)
    return Response.json(
      { error: '카카오 REST API 키가 설정되지 않았어요.' },
      { status: 503 },
    );
  const params = new URL(request.url).searchParams;
  const kind = params.get('kind') as RunKind;
  const searchText = params.get('query')?.trim() ?? '';
  const originSearch = params.get('purpose') === 'origin';
  const x = Number(params.get('x'));
  const y = Number(params.get('y'));
  const radius = Math.min(
    20000,
    Math.max(500, Number(params.get('radius')) || 5000),
  );
  const validKind = Object.hasOwn(RUN_KINDS, kind);
  if (
    (!validKind && searchText.length < 2) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return Response.json(
      { error: '검색 조건을 확인해 주세요.' },
      { status: 400 },
    );

  const plans: KakaoSearchPlan[] = searchText
    ? [{ endpoint: 'keyword', query: searchText }]
    : KAKAO_SEARCH[kind];
  const requests = plans.flatMap((plan) =>
    (searchText || plans.length === 1 ? [1, 2, 3] : [1]).map((page) => ({
      plan,
      page,
    })),
  );
  const pages = await Promise.all(
    requests.map(async ({ plan, page }) => {
      const pageQuery = new URLSearchParams({
        x: String(x),
        y: String(y),
        radius: String(radius),
        sort: 'distance',
        size: '15',
        page: String(page),
      });
      if (plan.endpoint === 'category')
        pageQuery.set('category_group_code', plan.category);
      else pageQuery.set('query', plan.query);
      const response = await fetch(
        `https://dapi.kakao.com/v2/local/search/${plan.endpoint}.json?${pageQuery}`,
        { headers: { Authorization: `KakaoAK ${key}` } },
      );
      if (!response.ok) throw new Error(`Kakao Local ${response.status}`);
      return (await response.json()) as {
        documents: Array<Record<string, string>>;
      };
    }),
  ).catch(() => null);
  if (!pages)
    return Response.json(
      { error: '카카오 장소 검색에 실패했어요.' },
      { status: 502 },
    );
  const documents = pages
    .flatMap((page) => page.documents)
    .filter(
      (place, index, all) => all.findIndex((p) => p.id === place.id) === index,
    );
  const requestedTypes = validKind ? RUN_KINDS[kind].destinationTypes : null;
  const categoryOf = (place: Record<string, string>) =>
    place.category_group_code === 'CE7'
      ? 'cafe'
      : place.category_group_code === 'FD6'
        ? 'restaurant'
        : place.category_name.includes('공원')
          ? 'park'
          : ['AT4', 'CT1'].includes(place.category_group_code)
            ? 'attraction'
            : null;
  return Response.json({
    places: documents
      .map((p) => {
        const destinationType = classifyKakaoDestination({
          categoryGroupCode: p.category_group_code,
          categoryName: p.category_name,
        });
        const missionContextId = missionForDestinationType(destinationType);
        return {
          p,
          category: categoryOf(p) || 'place',
          destinationType,
          missionContextId,
          routeEligible: isRouteEligible(destinationType),
        };
      })
      .filter(
        (item) =>
          originSearch ||
          (item.routeEligible &&
            (!requestedTypes || requestedTypes.includes(item.destinationType))),
      )
      .map(
        ({
          p,
          category,
          destinationType,
          missionContextId,
          routeEligible,
        }) => ({
          id: `kakao:${p.id}`,
          name: p.place_name,
          lon: Number(p.x),
          lat: Number(p.y),
          category: category || 'place',
          categoryDetail: p.category_name,
          address: p.road_address_name || p.address_name,
          phone: p.phone,
          placeUrl: p.place_url,
          source: 'kakao',
          destinationType,
          missionContextId,
          missionLabel: missionLabelForDestinationType(destinationType),
          contextPrior: missionContextId
            ? MISSION_CONTEXTS[missionContextId].contextPrior
            : 0,
          routeEligible,
        }),
      ),
  });
}
