/** Local OSM graph routing. Tag and proximity estimates are not field verification. */
export type Coordinate = [number, number];
export type Mode = 'one_way' | 'out_and_back' | 'loop';
export type Scenery = 'water' | 'green' | 'city' | 'any';
export const COURSE_THEMES = {
  coast: '바다·해변',
  river: '강변·하천',
  lake: '호숫가',
  forest: '흙길·숲길',
  road: '도심·도로',
  any: '상관없음',
};
export type CourseTheme = keyof typeof COURSE_THEMES;
// A transparent product threshold for mixed courses; not a learned effectiveness coefficient.
export const MIN_THEME_SHARE = 0.15;
export const HILL_PREFERENCES = {
  gentle: '완만하게',
  rolling: '언덕 조금',
  challenge: '오르막 도전',
};
export const HILL_LIMITS = { gentle: 6, rolling: 12, challenge: 20 };
export type GraphNode = {
  id: string;
  lon: number;
  lat: number;
  crossing?: boolean;
  elevationMeters?: number | null;
};
export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  distanceMeters: number;
  bidirectional: boolean;
  scenery?: Exclude<Scenery, 'any'> | 'unknown';
  crossings?: number;
  highway?: string;
  surface?: string;
  access?: string;
  foot?: string;
  terrainTags?: string[];
  gradePercent?: number | null;
  gradeQuality?: 'dem-estimate' | 'structure-unknown' | 'missing';
  surfaceClass?: 'paved' | 'unpaved' | 'unknown';
  lit?: string;
  steps?: boolean;
  bridge?: boolean;
  tunnel?: boolean;
};
export type Poi = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  nodeId?: string;
  category: string;
  offsetMeters?: number;
};
export type GraphData = {
  version: string;
  bbox: [number, number, number, number];
  nodes: GraphNode[];
  edges: GraphEdge[];
  pois: Poi[];
  [key: string]: unknown;
};
export type RouteInput = {
  origin: { lon: number; lat: number } | { nodeId: string };
  destinationId: string;
  minutes: number;
  paceMinKm: number;
  maxDistanceKm: number;
  pauseMinutes: number;
  mode: Mode;
  scenery: Scenery;
  targetDistanceKm?: number;
  theme?: CourseTheme;
  hillPreference?: keyof typeof HILL_PREFERENCES;
  surfacePreference?: 'any' | 'paved' | 'unpaved';
  avoidSteps?: boolean;
  avoidMajorRoads?: boolean;
  requireKnownSlope?: boolean;
  maxGradePercent?: number;
  timeOfDay?: 'day' | 'night';
};
export type Snap = {
  nodeId: string;
  lon: number;
  lat: number;
  distanceMeters: number;
  requested: Coordinate;
};
type Features = {
  time: number;
  scenery: number | null;
  amenities: number | null;
  comfort: number | null;
  distance: number | null;
  terrain: number | null;
  slope: number | null;
  surface: number | null;
  lighting: number | null;
};
export type TerrainSummary = {
  ascentMeters: number | null;
  descentMeters: number | null;
  maxGradePercent: number | null;
  averageGradePercent: number | null;
  gradeCoverageRatio: number;
  unknownGradeMeters: number;
  themeCoverageRatio: number;
  themeMatchRatio: number | null;
  surfaceCoverageRatio: number;
  pavedRatio: number;
  unpavedRatio: number;
  lightingCoverageRatio: number;
  litRatio: number;
  stepsMeters: number;
  roadTypes: Record<string, number>;
  elevationProfile: {
    distanceMeters: number;
    elevationMeters: number | null;
  }[];
};
export type Route = {
  id: string;
  geometry: Coordinate[];
  nodeIds: string[];
  edgeIds: string[];
  destinationIndex: number;
  distanceMeters: number;
  runningMinutes: number;
  crossingMinutes: number;
  pauseMinutes: number;
  connectorDistanceMeters: number;
  connectorAllowanceMinutes: number;
  estimatedMinutes: number;
  bufferedMinutes: number;
  score: number;
  diversifiedScore: number;
  features: Features;
  weights: Record<keyof Features, number>;
  reasons: string[];
  sceneryCoverageRatio: number;
  comfortCoverageRatio: number;
  amenitiesCount: number;
  selfOverlapRatio: number;
  overlapWithSelected: number;
  targetDifferenceMeters: number | null;
  terrain: TerrainSummary;
};
export type RecommendedRoute = Route;
export type RecommendationResult = {
  status: 'ok' | 'invalid_input' | 'no_route' | 'unsupported_location';
  message: string;
  routes: Route[];
  snaps: { origin: Snap; destination: Snap } | null;
  diagnostics: {
    generated: number;
    rejectedTime: number;
    rejectedDistance: number;
    rejectedShape: number;
    rejectedTerrain: number;
    searchedPaths: number;
  };
};
export type DestinationDistanceResult = {
  status: RecommendationResult['status'];
  message: string;
  snaps: RecommendationResult['snaps'];
  oneWayMeters: number | null;
  /** Distance lower bound for the selected shape, including unverified connectors. */
  minimumCourseMeters: number | null;
  /** Unverified straight connectors included in minimumCourseMeters. */
  connectorMeters: number;
};
type Arc = { from: number; to: number; edge: number };
type Path = Arc[];
const BASE_WEIGHTS = {
  time: 0.4,
  scenery: 0.35,
  amenities: 0.15,
  comfort: 0.1,
  distance: 0,
  terrain: 0,
  slope: 0,
  surface: 0,
  lighting: 0,
};
const RUNNER_WEIGHTS = {
  time: 0.05,
  distance: 0.3,
  scenery: 0.05,
  terrain: 0.2,
  slope: 0.15,
  surface: 0.1,
  amenities: 0.05,
  comfort: 0.05,
  lighting: 0.05,
};
export function scoreFeatures(features: Features, input: RouteInput) {
  const baseWeights =
    input.targetDistanceKm !== undefined ||
    input.theme !== undefined ||
    input.hillPreference !== undefined ||
    input.surfacePreference !== undefined ||
    input.timeOfDay === 'night'
      ? RUNNER_WEIGHTS
      : BASE_WEIGHTS;
  const keys = Object.keys(baseWeights) as (keyof Features)[];
  const weightSum = keys.reduce(
    (sum, feature) =>
      sum + (features[feature] === null ? 0 : baseWeights[feature]),
    0,
  );
  const weights = Object.fromEntries(
    keys.map((feature) => [
      feature,
      features[feature] === null ? 0 : baseWeights[feature] / weightSum,
    ]),
  ) as Record<keyof Features, number>;
  const score =
    100 *
    keys.reduce(
      (sum, feature) => sum + weights[feature] * (features[feature] ?? 0),
      0,
    );
  return { weights, score };
}

export function routeBudgetFeatures(
  input: RouteInput,
  metres: number,
  buffered: number,
) {
  return {
    time: clamp(
      (buffered - input.pauseMinutes) / (input.minutes - input.pauseMinutes),
    ),
    distance:
      input.targetDistanceKm !== undefined
        ? clamp(
            1 -
              Math.abs(metres - input.targetDistanceKm * 1000) /
                (input.targetDistanceKm * 1000),
          )
        : null,
  };
}

export function routeDistanceReason(input: RouteInput, metres: number) {
  return `목표 ${input.targetDistanceKm}km 대비 ${((metres - input.targetDistanceKm! * 1000) / 1000).toFixed(2)}km · 최대 ${input.maxDistanceKm}km 이내`;
}
const majorRoads = new Set([
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
]);
function grade(e: GraphEdge): number | null {
  return e.gradeQuality === 'dem-estimate' &&
    typeof e.gradePercent === 'number' &&
    Number.isFinite(e.gradePercent)
    ? e.gradePercent
    : null;
}
function matchesTheme(e: GraphEdge, theme: CourseTheme): boolean {
  return theme === 'forest'
    ? !!e.terrainTags?.includes('trail')
    : !!e.terrainTags?.includes(theme);
}
function excludedByRunner(e: GraphEdge, input?: RouteInput): boolean {
  if (!input) return false;
  const g = grade(e);
  return !!(
    (input.avoidSteps && (e.steps || e.highway === 'steps')) ||
    (input.avoidMajorRoads && majorRoads.has(e.highway ?? '')) ||
    (input.requireKnownSlope && g === null) ||
    (input.maxGradePercent !== undefined &&
      g !== null &&
      Math.abs(g) > input.maxGradePercent)
  );
}
function runnerPenalty(
  e: GraphEdge,
  input?: RouteInput,
  direction = 1,
): number {
  if (!input) return 0;
  let penalty = 0;
  if (input.theme && input.theme !== 'any')
    penalty += matchesTheme(e, input.theme) ? 0 : 1.25;
  if (input.surfacePreference && input.surfacePreference !== 'any')
    penalty +=
      e.surfaceClass === input.surfacePreference
        ? 0
        : e.surfaceClass === 'unknown' || !e.surfaceClass
          ? 0.25
          : 0.6;
  const g = grade(e);
  if (input.hillPreference)
    penalty +=
      g === null
        ? 0.3
        : input.hillPreference === 'gentle'
          ? Math.abs(g) / 6
          : input.hillPreference === 'rolling'
            ? Math.abs(g) / 24
            : Math.abs(g * direction - 6) / 30;
  if (input.timeOfDay === 'night')
    penalty += e.lit === 'yes' ? 0 : e.lit === 'no' ? 1 : 0.5;
  return penalty;
}

export function validateRouteInput(input: RouteInput): string | null {
  if (!input || typeof input !== 'object') return '러닝 조건을 입력해 주세요.';
  const limits: [keyof RouteInput, number, number][] = [
    ['minutes', 5, 240],
    ['paceMinKm', 3, 15],
    ['maxDistanceKm', 0.2, 30],
    ['pauseMinutes', 0, 120],
  ];
  for (const [key, min, max] of limits) {
    const n = input[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
      return `${key} 값은 ${min}~${max} 범위여야 해요.`;
  }
  if (input.pauseMinutes >= input.minutes)
    return '머무는 시간은 전체 시간보다 짧아야 해요.';
  if (
    !['one_way', 'out_and_back', 'loop'].includes(input.mode) ||
    !['water', 'green', 'city', 'any'].includes(input.scenery)
  )
    return '코스 형태와 풍경을 확인해 주세요.';
  if (
    !input.origin ||
    typeof input.origin !== 'object' ||
    typeof input.destinationId !== 'string' ||
    !input.destinationId
  )
    return '출발지와 목적지를 선택해 주세요.';
  if (
    'nodeId' in input.origin
      ? typeof input.origin.nodeId !== 'string' || !input.origin.nodeId
      : ![input.origin.lon, input.origin.lat].every(Number.isFinite) ||
        Math.abs(input.origin.lon) > 180 ||
        Math.abs(input.origin.lat) > 90
  )
    return '출발 위치가 올바르지 않아요.';
  if (
    input.targetDistanceKm !== undefined &&
    (!Number.isFinite(input.targetDistanceKm) ||
      input.targetDistanceKm < 0.2 ||
      input.targetDistanceKm > 30)
  )
    return '목표 거리는 0.2~30km로 입력해 주세요.';
  if (
    input.targetDistanceKm !== undefined &&
    input.targetDistanceKm > input.maxDistanceKm
  )
    return '최대 거리는 목표 거리보다 작을 수 없어요.';
  if (
    input.maxGradePercent !== undefined &&
    (!Number.isFinite(input.maxGradePercent) ||
      input.maxGradePercent < 1 ||
      input.maxGradePercent > 40)
  )
    return '추정 경사 상한은 1~40%로 입력해 주세요.';
  if (input.theme !== undefined && !Object.hasOwn(COURSE_THEMES, input.theme))
    return '코스 테마를 선택해 주세요.';
  if (
    input.hillPreference !== undefined &&
    !Object.hasOwn(HILL_LIMITS, input.hillPreference)
  )
    return '오르막 조건을 선택해 주세요.';
  if (
    input.surfacePreference !== undefined &&
    !['any', 'paved', 'unpaved'].includes(input.surfacePreference)
  )
    return '노면 선호를 선택해 주세요.';
  if (
    input.timeOfDay !== undefined &&
    !['day', 'night'].includes(input.timeOfDay)
  )
    return '낮 또는 야간을 선택해 주세요.';
  for (const key of [
    'avoidSteps',
    'avoidMajorRoads',
    'requireKnownSlope',
  ] as const)
    if (input[key] !== undefined && typeof input[key] !== 'boolean')
      return '제외 조건이 올바르지 않아요.';
  return null;
}
const MAX_ORIGIN_GAP = 150,
  MAX_DESTINATION_GAP = 100;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180,
    dlat = (b[1] - a[1]) * rad,
    dlon = (b[0] - a[0]) * rad;
  const x =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
  return (
    6371008.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)))
  );
}
function footAccessible(e: GraphEdge): boolean {
  if (['no', 'private', 'use_sidepath'].includes(e.foot ?? '')) return false;
  if (
    [
      'motorway',
      'motorway_link',
      'trunk',
      'trunk_link',
      'construction',
      'proposed',
    ].includes(e.highway ?? '')
  )
    return false;
  return (
    !['no', 'private', 'customers', 'delivery', 'permit'].includes(
      e.access ?? '',
    ) || ['yes', 'designated', 'permissive'].includes(e.foot ?? '')
  );
}
function comfort(e: GraphEdge): number | null {
  const values: Record<string, number> = {
    footway: 0.9,
    pedestrian: 0.9,
    path: 0.8,
    cycleway: 0.65,
    living_street: 0.7,
    residential: 0.55,
    service: 0.4,
    track: 0.5,
    steps: 0.15,
    unclassified: 0.35,
    tertiary: 0.25,
    secondary: 0.2,
    primary: 0.15,
  };
  let value = values[e.highway ?? ''];
  if (value === undefined) return null;
  if (
    [
      'sand',
      'mud',
      'dirt',
      'ground',
      'gravel',
      'fine_gravel',
      'cobblestone',
    ].includes(e.surface ?? '')
  )
    value *= 0.7;
  return value;
}

export function createRouter(data: GraphData) {
  if (
    !data ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges) ||
    !Array.isArray(data.pois) ||
    data.bbox?.length !== 4 ||
    !data.bbox.every(Number.isFinite)
  )
    throw new Error('올바른 경로 데이터가 아닙니다.');
  const [minLon, minLat, maxLon, maxLat] = data.bbox;
  if (minLon >= maxLon || minLat >= maxLat)
    throw new Error('지도 경계가 올바르지 않습니다.');
  const nodes = data.nodes,
    edges = data.edges;
  const index = new Map<string, number>();
  nodes.forEach((node, i) => {
    if (
      typeof node.id !== 'string' ||
      !Number.isFinite(node.lon) ||
      !Number.isFinite(node.lat) ||
      (node.elevationMeters != null &&
        (typeof node.elevationMeters !== 'number' ||
          !Number.isFinite(node.elevationMeters))) ||
      Math.abs(node.lon) > 180 ||
      Math.abs(node.lat) > 90 ||
      index.has(node.id)
    )
      throw new Error('지도 정점 데이터가 올바르지 않습니다.');
    index.set(node.id, i);
  });
  const adjacency: Arc[][] = nodes.map(() => []),
    reverse: Arc[][] = nodes.map(() => []);
  const edgeIds = new Set<string>();
  const comforts = edges.map(comfort);
  edges.forEach((e, edge) => {
    const from = index.get(e.from),
      to = index.get(e.to);
    if (
      typeof e.id !== 'string' ||
      edgeIds.has(e.id) ||
      from === undefined ||
      to === undefined ||
      from === to ||
      !Number.isFinite(e.distanceMeters) ||
      e.distanceMeters <= 0 ||
      typeof e.bidirectional !== 'boolean' ||
      (e.gradePercent != null &&
        (typeof e.gradePercent !== 'number' ||
          !Number.isFinite(e.gradePercent) ||
          Math.abs(e.gradePercent) > 1000)) ||
      (e.gradeQuality !== undefined &&
        !['dem-estimate', 'structure-unknown', 'missing'].includes(
          e.gradeQuality,
        )) ||
      (e.surfaceClass !== undefined &&
        !['paved', 'unpaved', 'unknown'].includes(e.surfaceClass)) ||
      (e.terrainTags !== undefined &&
        (!Array.isArray(e.terrainTags) ||
          e.terrainTags.some(
            (t) =>
              ![
                'coast',
                'river',
                'lake',
                'green',
                'forest',
                'trail',
                'road',
              ].includes(t),
          ))) ||
      (['steps', 'bridge', 'tunnel'] as const).some(
        (k) => e[k] !== undefined && typeof e[k] !== 'boolean',
      ) ||
      (e.crossings !== undefined &&
        (!Number.isFinite(e.crossings) || e.crossings < 0))
    )
      throw new Error('지도 구간 데이터가 올바르지 않습니다.');
    edgeIds.add(e.id);
    if (!footAccessible(e)) return;
    const arc = { from, to, edge };
    adjacency[from].push(arc);
    reverse[to].push(arc);
    if (e.bidirectional) {
      const back = { from: to, to: from, edge };
      adjacency[to].push(back);
      reverse[from].push(back);
    }
  });
  const pois = new Map<string, Poi>();
  for (const p of data.pois) {
    if (
      typeof p.id !== 'string' ||
      pois.has(p.id) ||
      !Number.isFinite(p.lon) ||
      !Number.isFinite(p.lat)
    )
      throw new Error('목적지 데이터가 올바르지 않습니다.');
    pois.set(p.id, p);
  }
  const amenityPois = data.pois.filter((p) =>
    ['toilets', 'drinking_water'].includes(p.category),
  );
  const coordinates = nodes.map((n) => [n.lon, n.lat] as Coordinate);
  const withinBounds = (lon: number, lat: number) =>
    lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
  const canVisit = (i: number) => adjacency[i].length + reverse[i].length > 0;
  function snap(coordinate: { lon: number; lat: number }): Snap | null {
    if (
      !Number.isFinite(coordinate?.lon) ||
      !Number.isFinite(coordinate?.lat) ||
      !withinBounds(coordinate.lon, coordinate.lat)
    )
      return null;
    const requested: Coordinate = [coordinate.lon, coordinate.lat];
    let nearest = -1,
      gap = Infinity;
    // ponytail: linear nearest-node scan suits this city extract; use a spatial index for regional graphs.
    for (let i = 0; i < nodes.length; i++) {
      if (!canVisit(i)) continue;
      const d = distanceMeters(requested, coordinates[i]);
      if (d < gap) {
        gap = d;
        nearest = i;
      }
    }
    if (nearest < 0) return null;
    return {
      nodeId: nodes[nearest].id,
      lon: nodes[nearest].lon,
      lat: nodes[nearest].lat,
      distanceMeters: gap,
      requested,
    };
  }
  // Binary heap avoids sorting the entire frontier on every graph visit.
  function search(
    start: number,
    target: number | null,
    options: {
      backwards?: boolean;
      banned?: Set<number>;
      penalty?: Map<number, number>;
      scenery?: Scenery;
      max?: number;
      input?: RouteInput;
    } = {},
  ) {
    const dist = new Float64Array(nodes.length).fill(Infinity),
      prev: (Arc | undefined)[] = Array.from(
        { length: nodes.length },
        () => undefined,
      );
    const heap: [number, number][] = [[0, start]];
    dist[start] = 0;
    function push(item: [number, number]) {
      let i = heap.length;
      heap.push(item);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent][0] <= item[0]) break;
        heap[i] = heap[parent];
        i = parent;
      }
      heap[i] = item;
    }
    while (heap.length) {
      const [cost, current] = heap[0],
        last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0])
            child++;
          if (heap[child][0] >= last[0]) break;
          heap[i] = heap[child];
          i = child;
        }
        heap[i] = last;
      }
      if (cost > dist[current]) continue;
      if (current === target) break;
      for (const arc of (options.backwards ? reverse : adjacency)[current]) {
        if (options.banned?.has(arc.edge)) continue;
        const next = options.backwards ? arc.from : arc.to,
          e = edges[arc.edge];
        if (excludedByRunner(e, options.input)) continue;
        const preferred =
          options.scenery &&
          options.scenery !== 'any' &&
          e.scenery === options.scenery;
        const edgeCost =
          e.distanceMeters *
          (1 +
            (options.penalty?.get(arc.edge) ?? 0) +
            (options.scenery
              ? runnerPenalty(
                  e,
                  options.input,
                  nodes[arc.from].id === e.from ? 1 : -1,
                )
              : 0) +
            (preferred
              ? 0
              : options.scenery && options.scenery !== 'any'
                ? 0.2
                : 0));
        const nextCost = cost + edgeCost;
        if (nextCost >= dist[next] || nextCost > (options.max ?? Infinity))
          continue;
        dist[next] = nextCost;
        prev[next] = arc;
        push([nextCost, next]);
      }
    }
    return { dist, prev };
  }
  function trace(
    prev: (Arc | undefined)[],
    start: number,
    end: number,
    backwards = false,
  ): Path | null {
    const path: Path = [];
    let current = end;
    while (current !== start) {
      const arc = prev[current];
      if (!arc || path.length > nodes.length) return null;
      path.push(arc);
      current = backwards ? arc.to : arc.from;
    }
    return backwards ? path : path.reverse();
  }
  const length = (path: Path) =>
    path.reduce((total, a) => total + edges[a.edge].distanceMeters, 0);
  function selfOverlap(path: Path) {
    const total = length(path),
      seen = new Set<number>();
    let repeated = 0;
    for (const arc of path) {
      if (seen.has(arc.edge)) repeated += edges[arc.edge].distanceMeters;
      seen.add(arc.edge);
    }
    return total ? repeated / total : 0;
  }
  function commonOverlap(a: Route, b: Route) {
    const count = (r: Route) => {
      const c = new Map<string, number>();
      for (const id of r.edgeIds) c.set(id, (c.get(id) ?? 0) + 1);
      return c;
    };
    const ac = count(a),
      bc = count(b);
    let intersection = 0,
      union = 0;
    for (const id of new Set([...ac.keys(), ...bc.keys()])) {
      const e = edges[edgeIndex.get(id)!],
        x = ac.get(id) ?? 0,
        y = bc.get(id) ?? 0;
      intersection += Math.min(x, y) * e.distanceMeters;
      union += Math.max(x, y) * e.distanceMeters;
    }
    return union ? intersection / union : 0;
  }
  const edgeIndex = new Map(edges.map((e, i) => [e.id, i]));
  function describeTerrain(
    path: Path,
    sequence: number[],
    input: RouteInput,
    metres: number,
  ): TerrainSummary {
    let knownGrade = 0,
      ascent = 0,
      descent = 0,
      maxGrade = 0,
      gradeSum = 0,
      themeKnown = 0,
      themeMatch = 0,
      paved = 0,
      unpaved = 0,
      lightingKnown = 0,
      lit = 0,
      steps = 0;
    const roadTypes: Record<string, number> = {};
    let cumulative = 0;
    const elevationProfile = [
      {
        distanceMeters: 0,
        elevationMeters: nodes[sequence[0]].elevationMeters ?? null,
      },
    ];
    for (const arc of path) {
      const e = edges[arc.edge],
        d = e.distanceMeters,
        g = grade(e);
      if (g !== null) {
        knownGrade += d;
        gradeSum += Math.abs(g) * d;
        maxGrade = Math.max(maxGrade, Math.abs(g));
        const change = (g / 100) * d * (nodes[arc.from].id === e.from ? 1 : -1);
        ascent += Math.max(0, change);
        descent += Math.max(0, -change);
      }
      if (e.terrainTags?.length) {
        themeKnown += d;
        if (input.theme && matchesTheme(e, input.theme)) themeMatch += d;
      }
      if (e.surfaceClass === 'paved') paved += d;
      if (e.surfaceClass === 'unpaved') unpaved += d;
      if (e.lit === 'yes' || e.lit === 'no') lightingKnown += d;
      if (e.lit === 'yes') lit += d;
      if (e.steps || e.highway === 'steps') steps += d;
      const kind =
        e.steps || e.highway === 'steps'
          ? '계단'
          : e.terrainTags?.includes('trail')
            ? '흙길·샛길'
            : ['footway', 'pedestrian', 'path'].includes(e.highway ?? '')
              ? '보행로'
              : e.highway === 'cycleway'
                ? '자전거길'
                : '도로';
      roadTypes[kind] = (roadTypes[kind] ?? 0) + d;
      cumulative += d;
      elevationProfile.push({
        distanceMeters: cumulative,
        elevationMeters: nodes[arc.to].elevationMeters ?? null,
      });
    }
    // Keep the native chart light; every edge still contributes to the metrics above.
    const sampled = elevationProfile.filter(
      (_, i) =>
        i === 0 ||
        i === elevationProfile.length - 1 ||
        i % Math.max(1, Math.ceil(elevationProfile.length / 100)) === 0,
    );
    return {
      ascentMeters: knownGrade ? ascent : null,
      descentMeters: knownGrade ? descent : null,
      maxGradePercent: knownGrade ? maxGrade : null,
      averageGradePercent: knownGrade ? gradeSum / knownGrade : null,
      gradeCoverageRatio: knownGrade / metres,
      unknownGradeMeters: metres - knownGrade,
      themeCoverageRatio: themeKnown / metres,
      themeMatchRatio: themeKnown ? themeMatch / themeKnown : null,
      surfaceCoverageRatio: (paved + unpaved) / metres,
      pavedRatio: paved / metres,
      unpavedRatio: unpaved / metres,
      lightingCoverageRatio: lightingKnown / metres,
      litRatio: lit / metres,
      stepsMeters: steps,
      roadTypes,
      elevationProfile: sampled,
    };
  }
  function resolveEndpoints(input: RouteInput): {
    status: 'ok' | 'unsupported_location';
    message: string;
    snaps: RecommendationResult['snaps'];
  } {
    let origin: Snap | null = null;
    if ('nodeId' in input.origin) {
      const i = index.get(input.origin.nodeId);
      if (
        i !== undefined &&
        canVisit(i) &&
        withinBounds(nodes[i].lon, nodes[i].lat)
      )
        origin = {
          nodeId: nodes[i].id,
          lon: nodes[i].lon,
          lat: nodes[i].lat,
          distanceMeters: 0,
          requested: coordinates[i],
        };
    } else origin = snap(input.origin);
    const poi = pois.get(input.destinationId),
      destination = poi ? snap(poi) : null;
    const snaps = origin && destination ? { origin, destination } : null;
    if (
      !origin ||
      !destination ||
      origin.distanceMeters > MAX_ORIGIN_GAP ||
      destination.distanceMeters > MAX_DESTINATION_GAP
    ) {
      return {
        status: 'unsupported_location',
        snaps,
        message: !origin
          ? '출발지가 지원 지도 밖에 있거나 보행 연결점을 찾을 수 없습니다.'
          : !destination
            ? '이 목적지는 현재 지도에서 지원하지 않습니다.'
            : '출발지 또는 목적지가 지도상의 보행 연결점에서 너무 멉니다. 다른 지점을 선택해 주세요.',
      };
    }
    return { status: 'ok', message: '', snaps };
  }
  function destinationDistance(input: RouteInput): DestinationDistanceResult {
    const result: DestinationDistanceResult = {
      status: 'invalid_input',
      message: '',
      snaps: null,
      oneWayMeters: null,
      minimumCourseMeters: null,
      connectorMeters: 0,
    };
    const error = validateRouteInput(input);
    if (error) return { ...result, message: error };
    const endpoints = resolveEndpoints(input);
    if (endpoints.status !== 'ok' || !endpoints.snaps)
      return { ...result, ...endpoints };
    const { origin, destination } = endpoints.snaps;
    const start = index.get(origin.nodeId)!,
      end = index.get(destination.nodeId)!;
    const connector = origin.distanceMeters + destination.distanceMeters;
    result.snaps = endpoints.snaps;
    result.connectorMeters = connector * (input.mode === 'one_way' ? 1 : 2);
    // Only hard exclusions apply: this measures metres before the user's time/distance budget.
    const outward = search(start, end, { input }).dist[end];
    if (Number.isFinite(outward)) result.oneWayMeters = outward + connector;
    let course = outward;
    if (input.mode === 'out_and_back' && Number.isFinite(outward)) {
      // recommend requires the return trip to use the same edge in reverse.
      const banned = new Set(
        edges.flatMap((edge, i) => (edge.bidirectional ? [] : [i])),
      );
      course = search(start, end, { input, banned }).dist[end] * 2;
    } else if (input.mode === 'loop' && Number.isFinite(outward)) {
      // This is a lower bound; it does not promise a loop with <=25% repeated edges.
      course += search(end, start, { input }).dist[start];
    }
    if (!Number.isFinite(course))
      return {
        ...result,
        status: 'no_route',
        message:
          '선택한 제외 조건과 코스 형태로 연결되는 보행 경로를 찾지 못했어요.',
      };
    return {
      ...result,
      status: 'ok',
      minimumCourseMeters: course + result.connectorMeters,
    };
  }
  function recommend(input: RouteInput): RecommendationResult {
    const diagnostics = {
      generated: 0,
      rejectedTime: 0,
      rejectedDistance: 0,
      rejectedShape: 0,
      rejectedTerrain: 0,
      searchedPaths: 0,
    };
    const result: RecommendationResult = {
      status: 'invalid_input',
      message: '',
      routes: [],
      snaps: null,
      diagnostics,
    };
    const invalid = (message: string) => ({ ...result, message });
    const error = validateRouteInput(input);
    if (error) return invalid(error);
    const endpoints = resolveEndpoints(input);
    if (endpoints.status !== 'ok' || !endpoints.snaps)
      return { ...result, ...endpoints };
    const { origin, destination } = endpoints.snaps;
    result.snaps = endpoints.snaps;
    const start = index.get(origin.nodeId)!,
      end = index.get(destination.nodeId)!;
    const factor = input.mode === 'one_way' ? 1 : 2;
    const connectorDistance =
      factor * (origin.distanceMeters + destination.distanceMeters);
    const connectorAllowance = (connectorDistance / 1000) * 10;
    const routeBudget = Math.min(
      Math.max(0, input.maxDistanceKm * 1000 - connectorDistance),
      (Math.max(0, input.minutes - input.pauseMinutes - connectorAllowance) /
        (input.paceMinKm * 1.1)) *
        1000,
    );
    const legBudget =
      input.mode === 'out_and_back' ? routeBudget / 2 : routeBudget;
    const dijkstra = (
      s: number,
      t: number | null,
      options: Parameters<typeof search>[2] = {},
    ) => {
      diagnostics.searchedPaths++;
      return search(s, t, { ...options, input });
    };
    // These unweighted trees measure metres for feasibility, not user preference costs.
    const originTree = dijkstra(start, null, { max: legBudget });
    const preferredOriginTree =
      input.theme !== undefined ||
      input.hillPreference !== undefined ||
      input.surfacePreference !== undefined ||
      input.timeOfDay !== undefined
        ? dijkstra(start, null, { scenery: input.scenery, max: legBudget * 12 })
        : originTree;
    const destinationTree = dijkstra(end, null, {
      backwards: true,
      max: legBudget,
    });
    const shortest = trace(originTree.prev, start, end);
    const outbound: Path[] = [],
      outboundKeys = new Set<string>();
    function addOutbound(path: Path | null) {
      if (
        !path?.length ||
        length(path) > legBudget + 1e-6 ||
        selfOverlap(path) > 1e-9
      )
        return;
      const key = path.map((a) => `${a.edge}:${a.to}`).join(',');
      if (!outboundKeys.has(key)) {
        outboundKeys.add(key);
        outbound.push(path);
      }
    }
    addOutbound(shortest);
    const penalty = new Map<number, number>();
    for (let i = 0; i < 4; i++) {
      const tree = dijkstra(start, end, {
        scenery: input.scenery,
        penalty,
        max: legBudget * 12,
      });
      const path = trace(tree.prev, start, end);
      addOutbound(path);
      if (!path?.length) break;
      for (const arc of path)
        penalty.set(arc.edge, (penalty.get(arc.edge) ?? 0) + 0.8);
    }
    // ponytail: at most 16 spatial/theme waypoints bound latency; wider search can improve recall.
    const waypointBuckets = new Map<
      number,
      { i: number; difference: number }
    >();
    const ideal =
      input.targetDistanceKm !== undefined
        ? Math.min(
            legBudget,
            input.targetDistanceKm *
              1000 *
              (input.mode === 'loop'
                ? 0.52
                : input.mode === 'out_and_back'
                  ? 0.5
                  : 1),
          )
        : input.mode === 'loop'
          ? routeBudget * 0.52
          : legBudget * 0.92;
    for (let i = 0; i < nodes.length; i++) {
      if (i === start || i === end || adjacency[i].length < 2) continue;
      const total = originTree.dist[i] + destinationTree.dist[i];
      if (
        !Number.isFinite(total) ||
        total > legBudget ||
        total < (shortest ? length(shortest) * 1.08 : 100)
      )
        continue;
      const angle = Math.atan2(
        nodes[i].lat - nodes[start].lat,
        (nodes[i].lon - nodes[start].lon) *
          Math.cos((nodes[start].lat * Math.PI) / 180),
      );
      const bucket = Math.min(
        7,
        Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 8),
      );
      const difference = Math.abs(total - ideal);
      if (difference < (waypointBuckets.get(bucket)?.difference ?? Infinity))
        waypointBuckets.set(bucket, { i, difference });
      if (
        input.theme &&
        input.theme !== 'any' &&
        adjacency[i].some((a) => matchesTheme(edges[a.edge], input.theme!))
      ) {
        const themedBucket = bucket + 8;
        if (
          difference <
          (waypointBuckets.get(themedBucket)?.difference ?? Infinity)
        )
          waypointBuckets.set(themedBucket, { i, difference });
      }
    }
    for (const { i } of [...waypointBuckets.values()].sort(
      (a, b) => a.difference - b.difference,
    )) {
      const preferredHead = trace(preferredOriginTree.prev, start, i);
      const head =
        preferredHead &&
        length(preferredHead) + destinationTree.dist[i] <= legBudget
          ? preferredHead
          : trace(originTree.prev, start, i);
      if (!head) continue;
      const tailTree = dijkstra(i, end, {
        banned: new Set(head.map((a) => a.edge)),
        scenery: input.scenery,
        max: (legBudget - length(head)) * 12,
      });
      const tail = trace(tailTree.prev, i, end);
      if (tail) addOutbound([...head, ...tail]);
    }
    const candidates: Path[] = [];
    if (input.mode === 'one_way') candidates.push(...outbound);
    if (input.mode === 'out_and_back') {
      for (const path of outbound) {
        const back: Path = [];
        for (const arc of [...path].reverse()) {
          const reverseArc = adjacency[arc.to].find(
            (a) => a.to === arc.from && a.edge === arc.edge,
          );
          if (!reverseArc) break;
          back.push(reverseArc);
        }
        if (back.length === path.length) candidates.push([...path, ...back]);
      }
    }
    if (input.mode === 'loop') {
      for (const path of outbound) {
        for (const avoidance of [4, 20]) {
          const used = new Map(path.map((a) => [a.edge, avoidance]));
          const tree = dijkstra(end, start, {
            penalty: used,
            scenery: input.scenery,
            max: routeBudget * (avoidance + 8),
          });
          const back = trace(tree.prev, end, start);
          if (back) candidates.push([...path, ...back]);
        }
      }
    }
    const keys = new Set<string>(),
      ranked: Route[] = [];
    for (const path of candidates) {
      const key = path.map((a) => `${a.edge}:${a.to}`).join(',');
      if (keys.has(key)) continue;
      keys.add(key);
      diagnostics.generated++;
      const metres = length(path),
        overlap = selfOverlap(path);
      const sequence = [start, ...path.map((a) => a.to)],
        destinationIndex = sequence.indexOf(end);
      if (
        !path.length ||
        metres < 50 ||
        destinationIndex < 0 ||
        path[0].from !== start ||
        path.some((a, i) => i > 0 && path[i - 1].to !== a.from) ||
        path.at(-1)!.to !== (input.mode === 'one_way' ? end : start) ||
        (input.mode === 'loop' && overlap > 0.25 + 1e-9)
      ) {
        diagnostics.rejectedShape++;
        continue;
      }
      if (metres + connectorDistance > input.maxDistanceKm * 1000 + 1e-6) {
        diagnostics.rejectedDistance++;
        continue;
      }
      const terrain = describeTerrain(path, sequence, input, metres);
      const themeShare =
        (terrain.themeMatchRatio ?? 0) * terrain.themeCoverageRatio;
      if (
        input.theme &&
        input.theme !== 'any' &&
        themeShare + 1e-9 < MIN_THEME_SHARE
      ) {
        diagnostics.rejectedTerrain++;
        continue;
      }
      // ponytail: ascent allowance is a declared planning heuristic, not a personalized physiological model.
      const uphillMinutes = input.hillPreference
        ? ((terrain.ascentMeters ?? 0) / 100) * 2
        : 0;
      const running = (metres / 1000) * input.paceMinKm + uphillMinutes;
      let crossingEvents = 0;
      for (const a of path)
        crossingEvents +=
          nodes[a.to].crossing === true
            ? 1
            : nodes[a.to].crossing === undefined
              ? (edges[a.edge].crossings ?? 0)
              : 0;
      const crossingMinutes = crossingEvents * 0.5;
      const estimated =
        running + crossingMinutes + input.pauseMinutes + connectorAllowance;
      const buffered =
        running * 1.1 +
        crossingMinutes +
        input.pauseMinutes +
        connectorAllowance;
      if (buffered > input.minutes + 1e-9) {
        diagnostics.rejectedTime++;
        continue;
      }
      let sceneryKnown = 0,
        sceneryMatch = 0,
        comfortKnown = 0,
        comfortSum = 0;
      for (const arc of path) {
        const e = edges[arc.edge];
        if (e.scenery && e.scenery !== 'unknown') {
          sceneryKnown += e.distanceMeters;
          if (e.scenery === input.scenery) sceneryMatch += e.distanceMeters;
        }
        const c = comforts[arc.edge];
        if (c !== null) {
          comfortKnown += e.distanceMeters;
          comfortSum += c * e.distanceMeters;
        }
      }
      const geometry = sequence.map((i) => coordinates[i]);
      const nearbyAmenities = amenityPois.filter((p) =>
        geometry.some((c) => distanceMeters(c, [p.lon, p.lat]) <= 60),
      );
      const features: Features = {
        ...routeBudgetFeatures(input, metres, buffered),
        scenery:
          (input.theme && input.theme !== 'any') ||
          input.scenery === 'any' ||
          !sceneryKnown
            ? null
            : sceneryMatch / sceneryKnown,
        amenities: nearbyAmenities.length
          ? Math.min(1, nearbyAmenities.length / 3)
          : null,
        comfort: comfortKnown ? comfortSum / comfortKnown : null,
        terrain: input.theme && input.theme !== 'any' ? themeShare : null,
        slope:
          input.hillPreference && terrain.averageGradePercent !== null
            ? input.hillPreference === 'challenge'
              ? clamp((terrain.ascentMeters ?? 0) / (metres * 0.03))
              : clamp(
                  1 -
                    terrain.averageGradePercent /
                      HILL_LIMITS[input.hillPreference],
                )
            : null,
        surface:
          input.surfacePreference &&
          input.surfacePreference !== 'any' &&
          terrain.surfaceCoverageRatio > 0
            ? input.surfacePreference === 'paved'
              ? terrain.pavedRatio
              : terrain.unpavedRatio
            : null,
        lighting:
          input.timeOfDay === 'night' && terrain.lightingCoverageRatio > 0
            ? terrain.litRatio
            : null,
      };
      const { weights, score } = scoreFeatures(features, input);
      const reasons = [
        `여유 10%·체류·횡단대기·지도 연결 간격을 포함한 예상 ${buffered.toFixed(1)}분`,
        `OSM 보행 접근 태그로 필터링한 ${input.mode === 'one_way' ? '편도' : input.mode === 'loop' ? '순환' : '동일 경로 왕복'} 경로`,
      ];
      if (features.scenery !== null)
        reasons.push(
          `풍경이 분류된 구간 ${((100 * sceneryKnown) / metres).toFixed(0)}% 중 취향 일치 ${(100 * features.scenery).toFixed(0)}% · 지도 근접 추정`,
        );
      if (input.targetDistanceKm !== undefined)
        reasons.push(routeDistanceReason(input, metres));
      if (input.theme && input.theme !== 'any')
        reasons.push(
          `${COURSE_THEMES[input.theme]} 지도 근거가 있는 구간 ${Math.round((terrain.themeMatchRatio ?? 0) * terrain.themeCoverageRatio * 100)}% · 테마가 코스 전체에 이어진다는 뜻은 아님`,
        );
      if (terrain.maxGradePercent !== null)
        reasons.push(
          `주변 지형 추정 경사 최대 ${terrain.maxGradePercent.toFixed(1)}% · 상승 약 ${terrain.ascentMeters?.toFixed(0)}m · 경사 추정 구간 ${Math.round(terrain.gradeCoverageRatio * 100)}%`,
        );
      if (terrain.unknownGradeMeters > 0.1)
        reasons.push(
          `교량·터널 등 경사 미확인 ${Math.round(terrain.unknownGradeMeters)}m 포함`,
        );
      if (input.timeOfDay === 'night')
        reasons.push(
          `야간 조명 등록 구간 ${Math.round(terrain.lightingCoverageRatio * 100)}% · 미확인 구간은 밝거나 안전한 길로 확인된 것이 아님`,
        );
      if (input.surfacePreference && input.surfacePreference !== 'any')
        reasons.push(
          `노면 등록 구간 ${Math.round(terrain.surfaceCoverageRatio * 100)}% · 미확인 노면은 선호 충족으로 계산하지 않음`,
        );
      if (nearbyAmenities.length)
        reasons.push(
          `경로 정점 60m 내 지도에 등록된 화장실·음수대 ${nearbyAmenities.length}곳 · 입구 연결 미확인`,
        );
      if (features.comfort !== null)
        reasons.push(
          '도로·노면은 OSM 등록 정보이며 실시간 혼잡과 현장 통행은 미확인',
        );
      if (connectorDistance > 1)
        reasons.push(
          `지도 연결점과 실제 위치 간 직선 간격 총 ${connectorDistance.toFixed(0)}m · 접근 예산 ${connectorAllowance.toFixed(1)}분 별도 반영, 통행 경로 미확인`,
        );
      if (Object.values(features).some((v) => v === null))
        reasons.push(
          '자료가 없거나 선택하지 않은 항목은 점수에서 제외하고 나머지 가중치를 재조정함',
        );
      ranked.push({
        id: `route-${ranked.length + 1}`,
        geometry,
        nodeIds: sequence.map((i) => nodes[i].id),
        edgeIds: path.map((a) => edges[a.edge].id),
        destinationIndex,
        distanceMeters: metres,
        runningMinutes: running,
        crossingMinutes,
        pauseMinutes: input.pauseMinutes,
        connectorDistanceMeters: connectorDistance,
        connectorAllowanceMinutes: connectorAllowance,
        estimatedMinutes: estimated,
        bufferedMinutes: buffered,
        score,
        diversifiedScore: score,
        features,
        weights,
        reasons,
        sceneryCoverageRatio: sceneryKnown / metres,
        comfortCoverageRatio: comfortKnown / metres,
        amenitiesCount: nearbyAmenities.length,
        selfOverlapRatio: overlap,
        overlapWithSelected: 0,
        targetDifferenceMeters:
          input.targetDistanceKm !== undefined
            ? metres - input.targetDistanceKm * 1000
            : null,
        terrain,
      });
    }
    while (ranked.length && result.routes.length < 3) {
      for (const item of ranked) {
        item.overlapWithSelected = Math.max(
          0,
          ...result.routes.map((selected) => commonOverlap(item, selected)),
        );
        item.diversifiedScore = item.score - 15 * item.overlapWithSelected;
      }
      ranked.sort(
        (a, b) =>
          b.diversifiedScore - a.diversifiedScore ||
          a.distanceMeters - b.distanceMeters,
      );
      result.routes.push(ranked.shift()!);
    }
    result.status = result.routes.length ? 'ok' : 'no_route';
    result.message = result.routes.length
      ? ''
      : (input.theme && input.theme !== 'any') ||
          input.maxGradePercent !== undefined ||
          input.requireKnownSlope ||
          input.avoidSteps ||
          input.avoidMajorRoads
        ? '목적지·시간·최대거리·선택 테마 15% 이상·제외 조건을 함께 만족하는 코스를 찾지 못했어요. 가까운 목적지나 왕복을 선택하거나 조건을 직접 조정해 주세요. 조건을 임의로 완화하지 않았어요.'
        : input.mode === 'loop'
          ? '목적지를 지나 출발점으로 돌아오며 중복 구간이 25% 이하인 순환 경로를 현재 조건에서 찾지 못했습니다. 왕복으로 바꾸거나 시간을 늘려 주세요.'
          : input.mode === 'out_and_back'
            ? '동일 경로로 되돌아올 수 있고 시간·거리를 만족하는 왕복 경로를 찾지 못했습니다.'
            : '현재 시간·거리 조건을 만족하는 연결 경로를 찾지 못했습니다. 시간을 늘리거나 가까운 목적지를 선택해 주세요.';
    return result;
  }
  return { recommend, snap, destinationDistance };
}
