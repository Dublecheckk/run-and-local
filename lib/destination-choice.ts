import {
  createRouter,
  routeBudgetFeatures,
  routeDistanceReason,
  scoreFeatures,
  type GraphData,
  type Poi,
  type RecommendationResult,
  type RouteInput,
} from './recommender.ts';
import {
  RUN_KINDS,
  rankDestinations,
  type RunKind,
} from './destination-recommender.ts';

type Router = ReturnType<typeof createRouter>;
export type DistanceConsent = {
  input: RouteInput;
  result: RecommendationResult;
};
export type NearbyDestination = {
  place: Poi;
  input: RouteInput;
  result: RecommendationResult;
  totalMeters: number;
};

export const exceedsGoal = (meters: number, input: RouteInput) =>
  meters > (input.targetDistanceKm ?? 5) * 1000 + 1e-6;

export function routesWithinGoal(
  result: RecommendationResult,
  input: RouteInput,
) {
  return result.routes.filter(
    (route) =>
      route.distanceMeters + route.connectorDistanceMeters <=
      (input.targetDistanceKm ?? 5) * 1000 + 1e-6,
  );
}

// Consent changes distance/time only; terrain and access exclusions stay intact.
export function distanceConsentInput(
  input: RouteInput,
  meters: number,
  minutes: number,
): RouteInput | null {
  const km = Math.ceil(meters / 100) / 10;
  if (
    !Number.isFinite(km) ||
    !Number.isFinite(minutes) ||
    km > 30 ||
    minutes > 240
  )
    return null;
  return {
    ...input,
    targetDistanceKm: Math.max(input.targetDistanceKm ?? 5, km),
    maxDistanceKm: Math.max(input.maxDistanceKm, km),
    minutes: Math.max(input.minutes, Math.ceil(minutes)),
  };
}

// Keep the exact candidate that was quoted. A new search can choose a different path.
export function createDistanceConsent(
  input: RouteInput,
  result: RecommendationResult,
): DistanceConsent | null {
  const route = result.routes[0];
  if (result.status !== 'ok' || !route) return null;
  const proposal = distanceConsentInput(
    input,
    route.distanceMeters + route.connectorDistanceMeters,
    route.bufferedMinutes,
  );
  if (!proposal) return null;
  const features = {
    ...route.features,
    ...routeBudgetFeatures(
      proposal,
      route.distanceMeters,
      route.bufferedMinutes,
    ),
  };
  const { score, weights } = scoreFeatures(features, proposal);
  return {
    input: proposal,
    result: {
      ...result,
      routes: [
        {
          ...route,
          features,
          weights,
          score,
          diversifiedScore: score,
          overlapWithSelected: 0,
          targetDifferenceMeters:
            route.distanceMeters - proposal.targetDistanceKm! * 1000,
          reasons: [
            ...route.reasons.filter((reason) => !reason.startsWith('목표 ')),
            routeDistanceReason(proposal, route.distanceMeters),
          ],
        },
      ],
    },
  };
}

export async function nearbyDestinations(
  graph: GraphData,
  router: Router,
  input: RouteInput,
  signal: AbortSignal,
): Promise<NearbyDestination[]> {
  signal.throwIfAborted();
  const selected = graph.pois.find((p) => p.id === input.destinationId);
  const kind = (Object.keys(RUN_KINDS) as RunKind[]).find(
    (k) => RUN_KINDS[k].category === selected?.category,
  );
  const origin =
    'lon' in input.origin
      ? input.origin
      : graph.nodes.find(
          (n) => 'nodeId' in input.origin && n.id === input.origin.nodeId,
        );
  if (!kind || !origin) return [];
  const goal = Math.min(input.targetDistanceKm ?? 5, input.maxDistanceKm);
  const candidates = rankDestinations({
    ...input,
    origin: [origin.lon, origin.lat],
    kind,
    targetDistanceKm: goal,
    maxDistanceKm: goal,
    places: graph.pois
      .filter((p) => p.id !== input.destinationId)
      .map((p) => ({
        ...p,
        source:
          'source' in p && p.source === 'kakao'
            ? ('kakao' as const)
            : ('osm' as const),
      })),
    limit: 18,
  });
  const found: NearbyDestination[] = [];
  for (const place of candidates) {
    // Let the phone render and process cancellation between route searches.
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.throwIfAborted();
    const candidateInput = {
      ...input,
      destinationId: place.id,
      targetDistanceKm: goal,
      maxDistanceKm: goal,
    };
    const result = router.recommend(candidateInput);
    const routes = routesWithinGoal(result, candidateInput);
    if (routes.length)
      found.push({
        place,
        input: candidateInput,
        result: { ...result, routes },
        totalMeters:
          routes[0].distanceMeters + routes[0].connectorDistanceMeters,
      });
  }
  signal.throwIfAborted();
  return found
    .sort(
      (a, b) =>
        Math.abs(goal * 1000 - a.totalMeters) -
          Math.abs(goal * 1000 - b.totalMeters) ||
        b.result.routes[0].score - a.result.routes[0].score,
    )
    .slice(0, 3);
}
