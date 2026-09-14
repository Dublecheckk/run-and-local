import { RUN_KINDS, type RunKind } from '@/lib/destination-recommender';

const KAKAO_CATEGORY: Partial<Record<RunKind, string>> = {
  coffee: 'CE7',
  food: 'FD6',
  sightseeing: 'AT4',
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

  const endpoint = searchText
    ? 'keyword'
    : KAKAO_CATEGORY[kind]
      ? 'category'
      : 'keyword';
  const query = new URLSearchParams({
    x: String(x),
    y: String(y),
    radius: String(radius),
    sort: 'distance',
    size: '15',
  });
  if (endpoint === 'category')
    query.set('category_group_code', KAKAO_CATEGORY[kind]!);
  else query.set('query', searchText || '공원');
  const pages = await Promise.all(
    [1, 2, 3].map(async (page) => {
      const pageQuery = new URLSearchParams(query);
      pageQuery.set('page', String(page));
      const response = await fetch(
        `https://dapi.kakao.com/v2/local/search/${endpoint}.json?${pageQuery}`,
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
  const requestedCategory = validKind ? RUN_KINDS[kind].category : null;
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
      .map((p) => ({ p, category: categoryOf(p) }))
      .filter(
        (item): item is { p: Record<string, string>; category: string } =>
          (originSearch || !!item.category) &&
          (!requestedCategory || item.category === requestedCategory),
      )
      .map(({ p, category }) => ({
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
      })),
  });
}
