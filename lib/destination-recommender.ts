import { distanceMeters, type Coordinate, type Mode } from './recommender.ts';
import type { RunnerProfile } from './profile.ts';
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

// Analysis-team aggregate cluster mapping. Menu order only, never route scores.
const CONSUMPTION_CLUSTERS: Record<
  0 | 1 | 2 | 3,
  { name: string; activity: string; kinds: RunKind[] }
> = {
  0: { name: '식사·쇼핑 혼합형', activity: '식사·쇼핑', kinds: ['daily'] },
  1: { name: '쇼핑 중심형', activity: '쇼핑', kinds: ['shopping'] },
  // MEAL evidence; no statistical preference inferred for cafes.
  2: { name: '식사 중심형', activity: '식사', kinds: ['evening'] },
  3: {
    name: '쇼핑·식사 혼합형',
    activity: '쇼핑·식사',
    kinds: ['daily', 'shopping'],
  },
};

export function missionMenuForProfile(
  profile: Pick<RunnerProfile, 'sex' | 'ageGroup'>,
) {
  const supportedAge = ['20', '30', '40', '50', '60'].includes(
    profile.ageGroup,
  );
  const clusterId =
    !supportedAge || (profile.sex !== 'F' && profile.sex !== 'M')
      ? null
      : profile.sex === 'F'
        ? profile.ageGroup === '20'
          ? 0
          : 1
        : profile.ageGroup === '20'
          ? 2
          : 3;
  const cluster = clusterId === null ? null : CONSUMPTION_CLUSTERS[clusterId];
  const suggestedKinds = cluster ? [...cluster.kinds] : [];
  const kinds = [
    ...suggestedKinds,
    ...(Object.keys(RUN_KINDS) as RunKind[]).filter(
      (kind) => !suggestedKinds.includes(kind),
    ),
  ];
  return { clusterId, cluster, suggestedKinds, kinds };
}

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
