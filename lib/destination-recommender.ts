import { distanceMeters, type Coordinate, type Mode } from './recommender.ts';
import {
  MISSION_CONTEXTS,
  type DestinationType,
  type MissionContextId,
} from './destination-context.ts';

export const RUN_KINDS = {
  daily: {
    label: MISSION_CONTEXTS.LIFE_DESTINATION_RUN.label,
    destinationTypes: MISSION_CONTEXTS.LIFE_DESTINATION_RUN.destinationTypes,
  },
  shopping: {
    label: MISSION_CONTEXTS.SHOPPING_DESTINATION_RUN.label,
    destinationTypes:
      MISSION_CONTEXTS.SHOPPING_DESTINATION_RUN.destinationTypes,
  },
  evening: {
    label: MISSION_CONTEXTS.EVENING_APPOINTMENT_RUN.label,
    destinationTypes: MISSION_CONTEXTS.EVENING_APPOINTMENT_RUN.destinationTypes,
  },
  culture: {
    label: MISSION_CONTEXTS.CULTURE_LEISURE_RUN.label,
    destinationTypes: MISSION_CONTEXTS.CULTURE_LEISURE_RUN.destinationTypes,
  },
} as const;
export type RunKind = keyof typeof RUN_KINDS;

export type PlaceCandidate = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  category: string;
  destinationType?: DestinationType;
  missionContextId?: MissionContextId;
  missionLabel?: string;
  routeEligible?: boolean;
  categoryDetail?: string;
  address?: string;
  phone?: string;
  placeUrl?: string;
  source: 'kakao' | 'osm';
};

export type RankedPlace = PlaceCandidate & {
  directDistanceMeters: number;
  estimatedCourseKm: number;
  score: number;
  reasons: string[];
};

export type DestinationAdjustment = 'theme' | 'out_and_back';

export const DESTINATION_ADJUSTMENT_PENALTIES: Record<
  DestinationAdjustment,
  number
> = {
  theme: 8,
  out_and_back: 15,
};

export function finalDestinationScore(
  placeScore: number,
  routeScore: number,
  adjustment?: DestinationAdjustment,
) {
  const penalty = adjustment ? DESTINATION_ADJUSTMENT_PENALTIES[adjustment] : 0;
  return Math.max(0, placeScore * 0.35 + routeScore * 0.65 - penalty);
}

export function rankDestinations(input: {
  origin: Coordinate;
  kind: RunKind;
  targetDistanceKm: number;
  maxDistanceKm: number;
  minutes: number;
  paceMinKm: number;
  pauseMinutes: number;
  mode: Mode;
  places: PlaceCandidate[];
  limit?: number;
}): RankedPlace[] {
  const factor = input.mode === 'one_way' ? 1 : 2;
  const targetMetres = input.targetDistanceKm * 1000;
  const maxMetres = input.maxDistanceKm * 1000;
  const availableRunMinutes = Math.max(1, input.minutes - input.pauseMinutes);
  const expectedMetresByTime =
    (availableRunMinutes / (input.paceMinKm * 1.1)) * 1000;
  const destinationTypes = RUN_KINDS[input.kind].destinationTypes;

  return input.places
    .filter(
      (p) =>
        p.routeEligible !== false &&
        !!p.destinationType &&
        destinationTypes.includes(p.destinationType),
    )
    .map((p) => {
      const direct = distanceMeters(input.origin, [p.lon, p.lat]);
      const estimated = direct * factor * 1.2;
      const distanceFit = Math.max(
        0,
        1 - Math.abs(estimated - targetMetres) / targetMetres,
      );
      const timeFit = Math.max(
        0,
        1 - Math.abs(estimated - expectedMetresByTime) / expectedMetresByTime,
      );
      const information =
        [p.address, p.phone, p.categoryDetail].filter(Boolean).length / 3;
      const feasibility = estimated <= maxMetres * 1.1 ? 1 : 0;
      const score =
        100 *
        (0.5 * distanceFit +
          0.25 * timeFit +
          0.15 * information +
          0.1 * feasibility);
      return {
        ...p,
        directDistanceMeters: direct,
        estimatedCourseKm: estimated / 1000,
        score,
        reasons: [
          `직선 ${direct < 1000 ? `${Math.round(direct)}m` : `${(direct / 1000).toFixed(1)}km`} 거리`,
          `목표 ${input.targetDistanceKm}km와 가까운 예상 코스`,
          p.categoryDetail || `${RUN_KINDS[input.kind].label} 목적에 맞는 장소`,
        ],
      };
    })
    .filter(
      (p) =>
        p.directDistanceMeters > 100 &&
        p.estimatedCourseKm <= input.maxDistanceKm * 1.25,
    )
    .sort(
      (a, b) =>
        b.score - a.score || a.directDistanceMeters - b.directDistanceMeters,
    )
    .filter((p, i, all) => all.findIndex((q) => q.name === p.name) === i)
    .slice(0, input.limit ?? 3);
}
