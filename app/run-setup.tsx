'use client';

import BackButton from './back-button';

import { handlePlaceSearchEnter } from '@/lib/place-search';
/* oxlint-disable next/no-img-element -- The same local assets run inside the native app. */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CalendarDays,
  LocateFixed,
  MapPin,
  Mountain,
  Trees,
  Waves,
  Building2,
  Sparkles,
  Search,
  Timer,
  UtensilsCrossed,
  ShoppingBag,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import {
  COURSE_THEMES,
  HILL_PREFERENCES,
  HILL_LIMITS,
  createRouter,
  MAX_ORIGIN_GAP_METERS,
  validateRouteInput,
  type GraphData,
  type Poi,
  type RouteInput,
} from '@/lib/recommender';
import { parseProfile, type RunnerProfile } from '@/lib/profile';
import {
  missionLabelForDestinationType,
  type DestinationType,
} from '@/lib/destination-context';
import MapView from './map-view';
import {
  RUN_KINDS,
  finalDestinationScore,
  rankDestinations,
  type DestinationAdjustment,
  type PlaceCandidate,
  type RankedPlace,
  type RunKind,
} from '@/lib/destination-recommender';

type VerifiedPlace = RankedPlace & {
  actualCourseKm: number;
  actualMinutes: number;
  routeScore: number;
  adjustment?: DestinationAdjustment;
};

export type SetupGraph = GraphData & {
  origins: { name: string; nodeId: string; lon: number; lat: number }[];
};
export const modes = { loop: '순환', out_and_back: '왕복', one_way: '편도' };
const themeIcons = {
  coast: Waves,
  river: Waves,
  lake: MapPin,
  forest: Trees,
  road: Building2,
  any: Sparkles,
};
const experiences = {
  beginner: ['이제 시작해요', '내 페이스를 찾는 중'],
  regular: ['꾸준히 달려요', '가끔 5~10km를 달려요'],
  experienced: ['러닝이 익숙해요', '거리와 페이스를 조절해요'],
};
const runKindPresentation = {
  daily: {
    icon: Building2,
    prompt: '식사·쇼핑·생활용무까지',
  },
  shopping: {
    icon: ShoppingBag,
    prompt: '필요한 물건을 사러 가는 길',
  },
  evening: {
    icon: UtensilsCrossed,
    prompt: '식당이나 카페까지',
  },
  culture: {
    icon: CalendarDays,
    prompt: '전시·공연·여가 장소까지',
  },
} as const;

export function Choice<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: T;
  items: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as T);
      }}
    >
      <SelectTrigger
        id={label.replaceAll(' ', '-')}
        aria-label={label}
        className="field-control"
      >
        {items[value]}
      </SelectTrigger>
      <SelectContent>
        {Object.entries<string>(items).map(([key, text]) => (
          <SelectItem value={key} key={key}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RunTargetDistance({
  form,
  update,
}: {
  form: RouteInput;
  update: (patch: Partial<RouteInput>) => void;
}) {
  const target = form.targetDistanceKm ?? 5;
  const choose = (km: number) =>
    update({
      targetDistanceKm: km,
      maxDistanceKm: Math.max(form.maxDistanceKm, km),
    });
  return (
    <div className="distance-setting">
      <p id="target-distance-label">오늘 뛰고 싶은 거리</p>
      <strong>
        {target}
        <small>km</small>
      </strong>
      <div className="distance-presets">
        {[3, 5, 8, 10].map((km) => (
          <Button
            key={km}
            variant={target === km ? 'default' : 'outline'}
            onClick={() => choose(km)}
            aria-pressed={target === km}
          >
            {km}km
          </Button>
        ))}
      </div>
      <Slider
        aria-labelledby="target-distance-label"
        value={[target]}
        min={1}
        max={20}
        step={0.5}
        onValueChange={(v) => choose(Array.isArray(v) ? v[0] : v)}
      />
      <p>목표와 가까운 코스를 찾고, 차이를 보여드려요.</p>
    </div>
  );
}

export function RunPreferences({
  form,
  update,
}: {
  form: RouteInput;
  update: (patch: Partial<RouteInput>) => void;
}) {
  const target = form.targetDistanceKm ?? 5;
  const plannedBase = target * form.paceMinKm * 1.1 + form.pauseMinutes;
  return (
    <div className="run-preferences">
      <RunTargetDistance form={form} update={update} />
      <fieldset className="theme-setting">
        <legend>어떤 길이 끌리나요?</legend>
        <div className="theme-options">
          {Object.entries(COURSE_THEMES).map(([key, label]) => {
            const theme = key as keyof typeof COURSE_THEMES,
              Icon = themeIcons[theme];
            return (
              <Button
                key={theme}
                variant="outline"
                className={form.theme === theme ? 'selected' : ''}
                onClick={() =>
                  update({
                    theme,
                    scenery: ['coast', 'river', 'lake'].includes(theme)
                      ? 'water'
                      : theme === 'forest'
                        ? 'green'
                        : theme === 'road'
                          ? 'city'
                          : 'any',
                  })
                }
                aria-pressed={form.theme === theme}
              >
                <Icon size={21} />
                <span>{label}</span>
                {form.theme === theme && <Check size={13} />}
              </Button>
            );
          })}
        </div>
        <p className="field-help">
          선택한 테마 구간이 15% 이상 포함된 혼합 코스를 찾아요. 흙길·숲길은
          지도에 등록된 흙길·샛길을 반영해요.
        </p>
      </fieldset>
      <fieldset className="hill-setting">
        <legend>
          <Mountain size={18} /> 오르막은 어느 정도까지?
        </legend>
        <div className="hill-options">
          {Object.entries(HILL_PREFERENCES).map(([key, label]) => (
            <Button
              key={key}
              variant="outline"
              className={form.hillPreference === key ? 'selected' : ''}
              aria-pressed={form.hillPreference === key}
              onClick={() =>
                update({ hillPreference: key as RouteInput['hillPreference'] })
              }
            >
              <strong>{label}</strong>
              <small>
                {key === 'gentle'
                  ? '낮은 경사 우선'
                  : key === 'rolling'
                    ? '거리와 경사 균형'
                    : '오르막 선호'}
              </small>
            </Button>
          ))}
        </div>
        <p className="field-help">
          지표면 고도로 추정해요. 교량 등 미확인 구간과 실제 도로 경사는 다를 수
          있어요.
        </p>
      </fieldset>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="코스-형태">코스 형태</label>
          <Choice
            label="코스 형태"
            value={form.mode}
            items={modes}
            onChange={(mode) => update({ mode })}
          />
        </div>
        <div className="form-field">
          <label htmlFor="노면-선호">노면 선호</label>
          <Choice
            label="노면 선호"
            value={form.surfacePreference ?? 'any'}
            items={{
              any: '상관없음',
              paved: '포장길 우선',
              unpaved: '흙·자갈길 우선',
            }}
            onChange={(surfacePreference) => update({ surfacePreference })}
          />
        </div>
      </div>
      <details className="run-details" open>
        <summary>거리 상한·페이스·시간</summary>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="run-maximum">
              최대 거리 <small>km</small>
            </label>
            <Input
              id="run-maximum"
              type="number"
              inputMode="decimal"
              min=".2"
              max="30"
              step=".5"
              value={form.maxDistanceKm}
              onChange={(e) =>
                update({ maxDistanceKm: Number(e.target.value) })
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="run-pace">
              편한 페이스 <small>분/km</small>
            </label>
            <Input
              id="run-pace"
              type="number"
              inputMode="decimal"
              min="3"
              max="15"
              step=".5"
              value={form.paceMinKm}
              onChange={(e) => update({ paceMinKm: Number(e.target.value) })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="run-time">
              오늘 쓸 수 있는 시간 <small>분</small>
            </label>
            <Input
              id="run-time"
              type="number"
              inputMode="numeric"
              min="5"
              max="240"
              step="5"
              value={form.minutes}
              onChange={(e) => update({ minutes: Number(e.target.value) })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="run-pause">
              목적지에서 쉬는 시간 <small>분</small>
            </label>
            <Input
              id="run-pause"
              type="number"
              inputMode="numeric"
              min="0"
              max="120"
              step="5"
              value={form.pauseMinutes}
              onChange={(e) => update({ pauseMinutes: Number(e.target.value) })}
            />
          </div>
        </div>
        <p
          className={
            plannedBase > form.minutes || target > form.maxDistanceKm
              ? 'inline-error'
              : 'field-help'
          }
        >
          <Timer size={14} /> 목표 거리 기준 약 {Math.ceil(plannedBase)}분 +
          오르막·횡단 대기.{' '}
          {target > form.maxDistanceKm
            ? '최대 거리를 목표 이상으로 바꿔 주세요.'
            : plannedBase > form.minutes
              ? '지금 시간으로는 목표보다 짧은 코스가 나올 수 있어요.'
              : '여유 시간은 10%를 포함해요.'}
        </p>
      </details>
      <details className="run-details">
        <summary>피하고 싶은 구간·러닝 시간대</summary>
        <label className="check-setting">
          <input
            type="checkbox"
            checked={form.maxGradePercent !== undefined}
            onChange={(e) =>
              update({
                maxGradePercent: e.target.checked
                  ? HILL_LIMITS[form.hillPreference ?? 'gentle']
                  : undefined,
              })
            }
          />
          <span>
            추정 경사 상한 적용
            <small>
              상한을 넘는 추정 구간을 제외해요. 교량 등 미확인 경사는 별도 제외
              조건을 켜 주세요.
            </small>
          </span>
        </label>
        {form.maxGradePercent !== undefined && (
          <div className="form-field">
            <label htmlFor="grade-limit">
              추정 경사 상한 <small>%</small>
            </label>
            <Input
              id="grade-limit"
              type="number"
              inputMode="numeric"
              min="1"
              max="40"
              step="1"
              value={form.maxGradePercent}
              onChange={(e) =>
                update({ maxGradePercent: Number(e.target.value) })
              }
            />
          </div>
        )}
        <label className="check-setting">
          <input
            type="checkbox"
            checked={form.avoidSteps ?? false}
            onChange={(e) => update({ avoidSteps: e.target.checked })}
          />
          <span>지도에 등록된 계단 제외</span>
        </label>
        <label className="check-setting">
          <input
            type="checkbox"
            checked={form.avoidMajorRoads ?? false}
            onChange={(e) => update({ avoidMajorRoads: e.target.checked })}
          />
          <span>큰 차도 구간 제외</span>
        </label>
        <label className="check-setting">
          <input
            type="checkbox"
            checked={form.requireKnownSlope ?? false}
            onChange={(e) => update({ requireKnownSlope: e.target.checked })}
          />
          <span>
            경사 미확인 구간도 제외
            <small>교량이 끊겨 코스를 찾지 못할 수 있어요.</small>
          </span>
        </label>
        <div className="form-field">
          <label htmlFor="달리는-시간대">달리는 시간대</label>
          <Choice
            label="달리는 시간대"
            value={form.timeOfDay ?? 'day'}
            items={{ day: '낮에 달려요', night: '야간에 달려요' }}
            onChange={(timeOfDay) => update({ timeOfDay })}
          />
        </div>
        {form.timeOfDay === 'night' && (
          <p className="inline-error">
            조명 정보가 적은 지역이에요. 등록 조명을 우선 고려하지만 야간 안전을
            확인한 코스는 아니에요.
          </p>
        )}
      </details>
    </div>
  );
}

export default function RunSetup({
  cityName,
  graph,
  profile,
  form,
  update,
  onProfile,
  onDestination,
  onComplete,
  onClose,
  locate,
  locationBusy,
  notice,
  loadError,
  onPlaces,
  originLabel,
  onOriginLabel,
  initialStep = 0,
}: {
  cityName: string;
  graph: SetupGraph | null;
  profile: RunnerProfile;
  form: RouteInput;
  update: (patch: Partial<RouteInput>) => void;
  onDestination: (patch: Partial<RouteInput>) => void;
  onProfile: (profile: RunnerProfile) => void;
  onComplete: () => void;
  onClose?: () => void;
  locate: () => void;
  locationBusy: boolean;
  notice: string;
  loadError: string;
  onPlaces: (places: PlaceCandidate[]) => void;
  originLabel: string;
  onOriginLabel: (label: string) => void;
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep),
    [error, setError] = useState(''),
    [mapOpen, setMapOpen] = useState(false),
    [runKind, setRunKind] = useState<RunKind>('daily'),
    [wantsRecommendation, setWantsRecommendation] = useState(false),
    [placeBusy, setPlaceBusy] = useState(false),
    [suggestedPlaces, setSuggestedPlaces] = useState<VerifiedPlace[]>([]),
    [placeQuery, setPlaceQuery] = useState(''),
    [searchPlaces, setSearchPlaces] = useState<PlaceCandidate[]>([]),
    [searchState, setSearchState] = useState<
      'idle' | 'loading' | 'kakao' | 'fallback'
    >('idle'),
    [originQuery, setOriginQuery] = useState(''),
    [originResults, setOriginResults] = useState<PlaceCandidate[]>([]),
    [originSearchBusy, setOriginSearchBusy] = useState(false);
  const places =
    graph?.pois
      .filter(
        (p) =>
          !('routeEligible' in p) ||
          (p as Poi & { routeEligible?: boolean }).routeEligible !== false,
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')) ?? [];
  const setupRouter = useMemo(
    () => (graph ? createRouter(graph) : null),
    [graph],
  );
  const originSupport = useMemo(
    () =>
      new Map(
        originResults.map((place) => [
          place.id,
          (setupRouter?.snap(place)?.distanceMeters ?? Infinity) <=
            MAX_ORIGIN_GAP_METERS,
        ]),
      ),
    [originResults, setupRouter],
  );
  const destination = places.find((p) => p.id === form.destinationId) ?? null;
  const chooseDestination = (patch: Partial<RouteInput>) => {
    setWantsRecommendation(false);
    onDestination(patch);
  };
  const clearDestination = () => {
    setPlaceQuery('');
    setSuggestedPlaces([]);
    setSearchPlaces([]);
    setSearchState('idle');
    onDestination({ destinationId: '' });
  };
  const preset = graph?.origins.find(
    (p) => 'nodeId' in form.origin && p.nodeId === form.origin.nodeId,
  );
  const originNode = graph?.nodes.find(
    (n) => 'nodeId' in form.origin && n.id === form.origin.nodeId,
  );
  const originCoordinate: [number, number] =
    'lon' in form.origin
      ? [form.origin.lon, form.origin.lat]
      : [originNode?.lon ?? 127.0448, originNode?.lat ?? 37.5436];
  const originLon = originCoordinate[0];
  const originLat = originCoordinate[1];
  useEffect(() => {
    const query = originQuery.trim();
    if (query.length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setOriginSearchBusy(true);
      fetch(
        `/api/places?query=${encodeURIComponent(query)}&purpose=origin&x=${originLon}&y=${originLat}&radius=20000`,
        { signal: abort.signal },
      )
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<{ places: PlaceCandidate[] }>;
        })
        .then(({ places }) => {
          if (!abort.signal.aborted) setOriginResults(places);
        })
        .catch(() => {
          if (!abort.signal.aborted) setOriginResults([]);
        })
        .finally(() => {
          if (!abort.signal.aborted) setOriginSearchBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [originQuery, originLon, originLat]);
  useEffect(() => {
    const query = placeQuery.trim();
    if (query.length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setSearchState('loading');
      fetch(
        `/api/places?query=${encodeURIComponent(query)}&x=${originLon}&y=${originLat}&radius=10000`,
        { signal: abort.signal },
      )
        .then(async (response) => {
          const data = (await response.json()) as {
            places?: PlaceCandidate[];
          };
          if (abort.signal.aborted) return;
          if (!response.ok || !data.places) throw new Error();
          setSearchPlaces(data.places);
          setSearchState('kakao');
          onPlaces(data.places);
        })
        .catch((reason) => {
          if (abort.signal.aborted || reason?.name === 'AbortError') return;
          setSearchPlaces([]);
          setSearchState('fallback');
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [placeQuery, originLon, originLat, onPlaces]);
  const fallbackPlaces = places.filter((p) =>
    p.name
      .toLocaleLowerCase('ko')
      .includes(placeQuery.trim().toLocaleLowerCase('ko')),
  );
  const directPlaces =
    placeQuery.trim().length < 2
      ? []
      : searchState === 'kakao'
        ? searchPlaces
        : searchState === 'fallback'
          ? fallbackPlaces
          : [];
  function chooseOrigin(place: PlaceCandidate) {
    if (!originSupport.get(place.id)) {
      setError(
        `${place.name}은(는) 현재 지원 도로망 밖이에요. ‘지원 가능’ 장소를 골라주세요.`,
      );
      return;
    }
    setError('');
    onOriginLabel(place.name);
    setOriginQuery(place.name);
    update({ origin: { lon: place.lon, lat: place.lat } });
  }
  async function suggestDestinations() {
    setPlaceBusy(true);
    setError('');
    try {
      const radius = Math.min(20000, Math.max(1500, form.maxDistanceKm * 600));
      const response = await fetch(
        `/api/places?kind=${runKind}&x=${originCoordinate[0]}&y=${originCoordinate[1]}&radius=${radius}`,
      );
      const data = (await response.json()) as {
        places?: PlaceCandidate[];
        error?: string;
      };
      if (!response.ok || !data.places)
        throw new Error(data.error || '장소를 찾지 못했어요.');
      onPlaces(data.places);
      const ranked = rankDestinations({
        origin: originCoordinate,
        kind: runKind,
        targetDistanceKm: form.targetDistanceKm ?? 5,
        maxDistanceKm: form.maxDistanceKm,
        minutes: form.minutes,
        paceMinKm: form.paceMinKm,
        pauseMinutes: form.pauseMinutes,
        mode: form.mode,
        places: data.places,
        limit: 18,
      });
      if (!ranked.length) {
        setSuggestedPlaces([]);
        setError(
          '이 미션에 맞으면서 현재 거리 안에 있는 장소를 찾지 못했어요. 다른 미션을 고르거나 최대 거리를 늘려보세요.',
        );
        return;
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const candidateGraph: SetupGraph = {
        ...graph!,
        pois: [
          ...graph!.pois.filter(
            (p) => !data.places!.some((candidate) => candidate.id === p.id),
          ),
          ...data.places,
        ],
      };
      const router = createRouter(candidateGraph);
      const verified: VerifiedPlace[] = [];
      const tryConditions = (adjustment?: VerifiedPlace['adjustment']) => {
        for (const place of ranked) {
          if (verified.some((item) => item.id === place.id)) continue;
          const routeInput: RouteInput = {
            ...form,
            destinationId: place.id,
            ...(adjustment === 'theme'
              ? { theme: 'any', scenery: 'any' }
              : adjustment === 'out_and_back'
                ? { mode: 'out_and_back', theme: 'any', scenery: 'any' }
                : {}),
          };
          const result = router.recommend(routeInput);
          const route = result.routes[0];
          if (!route) continue;
          verified.push({
            ...place,
            actualCourseKm: route.distanceMeters / 1000,
            actualMinutes: route.bufferedMinutes,
            routeScore: route.score,
            adjustment,
            score: finalDestinationScore(
              place.score,
              route.score,
              adjustment,
              RUN_KINDS[runKind].contextPrior,
            ),
          });
        }
      };
      tryConditions();
      if (verified.length < 3 && form.theme !== 'any') tryConditions('theme');
      if (verified.length < 3 && form.mode === 'loop')
        tryConditions('out_and_back');
      verified.sort((a, b) => b.score - a.score);
      setSuggestedPlaces(verified.slice(0, 3));
      if (!verified.length)
        setError(
          '장소 후보는 찾았지만 실제 보행망에서 현재 거리·시간 조건을 통과한 코스가 없어요. 최대 거리나 시간을 늘려보세요.',
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '장소 추천을 불러오지 못했어요.',
      );
    } finally {
      setPlaceBusy(false);
    }
  }
  const go = (next: number) => {
    setError('');
    setMapOpen(false);
    setStep(next);
    window.scrollTo({ top: 0 });
  };
  function next() {
    if (step === 1) {
      try {
        parseProfile(JSON.stringify(profile));
      } catch {
        setError('닉네임은 20자 이내, 페이스는 3~15분/km로 입력해 주세요.');
        return;
      }
    }
    if (step === 2 && !destination) {
      setError('검색하거나 아래 장소에서 목적지를 골라 주세요.');
      return;
    }
    if (step === 3) {
      const message = validateRouteInput(form);
      if (message) {
        setError(message);
        return;
      }
      onComplete();
      return;
    }
    go(step + 1);
  }
  return (
    <div className={`run-setup ${step === 0 ? 'welcome-setup' : ''}`}>
      <header className="setup-header">
        {step > 0 ? (
          <BackButton
            label={mapOpen ? '이전: 출발지 지도 닫기' : '이전 단계로 돌아가기'}
            onClick={() => (mapOpen ? setMapOpen(false) : go(step - 1))}
          />
        ) : (
          <span />
        )}
        {step === 0 ? (
          <span />
        ) : (
          <span className="wordmark">
            RUN<span>&</span>LOCAL<span className="brand-period">.</span>
          </span>
        )}
        {onClose ? (
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
        ) : (
          <span />
        )}
      </header>
      {step > 0 && (
        <div className="setup-steps" aria-label={`${step}/3 단계`}>
          {['러너 프로필', '오늘의 목적지', '거리와 지형'].map((label, i) => (
            <span key={label} className={step >= i + 1 ? 'active' : ''}>
              <i />
              {label}
            </span>
          ))}
        </div>
      )}
      <main className="setup-content">
        {step === 0 && (
          <div className="welcome-hero-content">
            <span className="wordmark welcome-wordmark">
              RUN<span>&</span>LOCAL<span className="brand-period">.</span>
            </span>
            <p className="welcome-region">SEOUL · SEONGSU</p>
            <h1>
              가고 싶은 곳까지,
              <br />
              나에게 맞는 길로.
            </h1>
            <p className="setup-intro">
              오늘의 목적지를 러닝으로 연결해요.
              <br />내 거리와 페이스에 맞는 길로.
            </p>
            <span className="welcome-scroll-cue">A REASON TO RUN</span>
          </div>
        )}
        {step === 1 && (
          <>
            <p className="overline">YOUR RUNNING PACE</p>
            <h1>어떤 러너인가요?</h1>
            <p className="setup-intro">
              기록 경쟁보다, 오늘 편하게 달릴 수 있는 기준으로.
            </p>
            <div className="form-field">
              <label htmlFor="runner-nickname">
                어떻게 불러드릴까요? <small>선택</small>
              </label>
              <Input
                id="runner-nickname"
                placeholder="닉네임"
                maxLength={20}
                value={profile.nickname}
                onChange={(e) =>
                  onProfile({ ...profile, nickname: e.target.value })
                }
              />
            </div>
            <div className="demographic-grid">
              <div className="form-field">
                <label htmlFor="성별">
                  성별 <small>선택</small>
                </label>
                <Choice
                  label="성별"
                  value={profile.sex}
                  items={{
                    unspecified: '선택하지 않음',
                    F: '여성',
                    M: '남성',
                  }}
                  onChange={(sex) => onProfile({ ...profile, sex })}
                />
              </div>
              <div className="form-field">
                <label htmlFor="연령대">
                  연령대 <small>선택</small>
                </label>
                <Choice
                  label="연령대"
                  value={profile.ageGroup}
                  items={{
                    unspecified: '선택하지 않음',
                    '20': '20대',
                    '30': '30대',
                    '40': '40대',
                    '50': '50대',
                    '60': '60대',
                  }}
                  onChange={(ageGroup) => onProfile({ ...profile, ageGroup })}
                />
              </div>
            </div>
            <p className="field-help data-caution">
              성별·연령대는 선택 항목이며 이 기기에만 저장돼요. 현재는 소비
              군집을 개인 선호로 판단하지 않아요.
            </p>
            <fieldset className="experience-setting">
              <legend>러닝 경험</legend>
              {Object.entries(experiences).map(([key, [label, detail]]) => (
                <Button
                  key={key}
                  variant="outline"
                  className={profile.experience === key ? 'selected' : ''}
                  aria-pressed={profile.experience === key}
                  onClick={() => {
                    const experience = key as RunnerProfile['experience'],
                      paceMinKm =
                        experience === 'beginner'
                          ? 7
                          : experience === 'regular'
                            ? 6.5
                            : 6;
                    onProfile({ ...profile, experience, paceMinKm });
                    update({
                      paceMinKm,
                      hillPreference:
                        experience === 'beginner' ? 'gentle' : 'rolling',
                    });
                  }}
                >
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                  {profile.experience === key && <Check size={19} />}
                </Button>
              ))}
            </fieldset>
            <div className="pace-card">
              <label htmlFor="profile-pace">편안하게 달릴 때의 페이스</label>
              <div>
                <Input
                  id="profile-pace"
                  type="number"
                  inputMode="decimal"
                  min="3"
                  max="15"
                  step=".5"
                  value={profile.paceMinKm}
                  onChange={(e) => {
                    const paceMinKm = Number(e.target.value);
                    onProfile({ ...profile, paceMinKm });
                    update({ paceMinKm });
                  }}
                />
                <span>분 / km</span>
              </div>
              <p>경험별 초기값이에요. 평소 페이스로 자유롭게 바꿔주세요.</p>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="overline">WHERE SHALL WE GO?</p>
            <h1>어디까지 달려볼까요?</h1>
            <p className="setup-intro">
              오늘 목표 거리를 정하고, 달리기 끝에 만나고 싶은 곳을 찾아요.
            </p>
            <RunTargetDistance form={form} update={update} />
            {!graph ? (
              <p className="setup-loading">
                {loadError || `${cityName}의 장소를 불러오고 있어요…`}
              </p>
            ) : (
              <>
                <div className="form-field primary-place-field">
                  <label htmlFor="setup-origin">오늘의 출발지</label>
                  <Select
                    value={preset?.nodeId ?? 'custom'}
                    onValueChange={(nodeId) => {
                      if (nodeId && nodeId !== 'custom') {
                        onOriginLabel(
                          graph.origins.find((p) => p.nodeId === nodeId)
                            ?.name ?? '',
                        );
                        update({ origin: { nodeId } });
                      }
                    }}
                  >
                    <SelectTrigger id="setup-origin" className="field-control">
                      {preset?.name || originLabel || '지도에서 선택한 위치'}
                    </SelectTrigger>
                    <SelectContent>
                      {!preset && (
                        <SelectItem value="custom">
                          지도에서 선택한 위치
                        </SelectItem>
                      )}
                      {graph.origins.map((p) => (
                        <SelectItem key={p.nodeId} value={p.nodeId}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Combobox
                    autoHighlight
                    filter={null}
                    items={originQuery.trim().length < 2 ? [] : originResults}
                    itemToStringLabel={(place: PlaceCandidate) => place.name}
                    isItemEqualToValue={(
                      a: PlaceCandidate,
                      b: PlaceCandidate,
                    ) => a.id === b.id}
                    onInputValueChange={(query) => {
                      if (query === originQuery) return;
                      setOriginQuery(query);
                      setOriginResults([]);
                      setOriginSearchBusy(query.trim().length >= 2);
                    }}
                    onValueChange={(place: PlaceCandidate | null) => {
                      if (place) chooseOrigin(place);
                    }}
                  >
                    <ComboboxInput
                      onKeyDown={handlePlaceSearchEnter}
                      aria-label="출발 장소 검색"
                      placeholder="카카오맵에서 출발 장소 검색"
                      showTrigger={false}
                      className="search-field"
                    >
                      <Search aria-hidden size={18} />
                    </ComboboxInput>
                    <ComboboxContent className="search-results">
                      <ComboboxEmpty>
                        {originSearchBusy
                          ? '카카오맵에서 찾는 중…'
                          : originQuery.trim().length < 2
                            ? '장소명을 2글자 이상 입력해 주세요.'
                            : '검색된 출발 장소가 없어요.'}
                      </ComboboxEmpty>
                      <ComboboxList>
                        {(place: PlaceCandidate) => (
                          <ComboboxItem
                            key={place.id}
                            value={place}
                            className={
                              originSupport.get(place.id)
                                ? 'supported-place'
                                : 'unsupported-place'
                            }
                          >
                            {place.name}
                            <small className="place-category">
                              {originSupport.get(place.id)
                                ? '지원 가능'
                                : '지원 권역 밖'}
                            </small>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  {!preset && originLabel && (
                    <p className="field-help selected-origin">
                      <MapPin size={14} /> 출발점으로 설정됨 · {originLabel}
                    </p>
                  )}
                  <div className="form-actions">
                    <Button
                      variant="outline"
                      onClick={() => setMapOpen(!mapOpen)}
                    >
                      <MapPin size={17} />
                      지도에서 선택
                    </Button>
                    <Button
                      variant="outline"
                      disabled={locationBusy}
                      onClick={locate}
                    >
                      <LocateFixed size={17} />
                      {locationBusy ? '확인 중…' : '현위치'}
                    </Button>
                  </div>
                </div>
                {mapOpen && (
                  <div className="setup-map">
                    <MapView
                      graph={graph}
                      origin={
                        'lon' in form.origin
                          ? [form.origin.lon, form.origin.lat]
                          : [
                              originNode?.lon ?? 127.0448,
                              originNode?.lat ?? 37.5436,
                            ]
                      }
                      destination={destination}
                      routes={[]}
                      selected={0}
                      picking={true}
                      onOrigin={(point) => {
                        onOriginLabel('지도에서 선택한 위치');
                        update({ origin: { lon: point[0], lat: point[1] } });
                      }}
                      onSelect={() => {}}
                    />
                    <p>지도를 눌러 출발점을 바꿀 수 있어요.</p>
                  </div>
                )}
                <div className="form-field destination-setup primary-place-field">
                  <label htmlFor="setup-destination-search">
                    오늘의 목적지
                  </label>
                  <Combobox
                    autoHighlight
                    filter={null}
                    items={directPlaces}
                    value={destination}
                    itemToStringLabel={(p: Poi) => p.name}
                    isItemEqualToValue={(a, b) => a.id === b.id}
                    onValueChange={(p) => {
                      if (p) chooseDestination({ destinationId: p.id });
                    }}
                    onInputValueChange={(query) => {
                      if (query === placeQuery) return;
                      setPlaceQuery(query);
                      setSearchPlaces([]);
                      setSearchState(
                        query.trim().length >= 2 ? 'loading' : 'idle',
                      );
                    }}
                  >
                    <ComboboxInput
                      onKeyDown={handlePlaceSearchEnter}
                      aria-label="목적지 검색"
                      id="setup-destination-search"
                      placeholder="식당·쇼핑·문화·생활 목적지 검색"
                      showTrigger={false}
                      className="search-field"
                    >
                      <Search aria-hidden size={18} />
                    </ComboboxInput>
                    <ComboboxContent className="search-results">
                      <ComboboxEmpty>
                        {searchState === 'loading'
                          ? '카카오맵에서 찾는 중…'
                          : placeQuery.trim().length < 2
                            ? '장소명을 2글자 이상 입력해 주세요.'
                            : '검색된 장소가 없어요.'}
                      </ComboboxEmpty>
                      <ComboboxList>
                        {(p: Poi) => (
                          <ComboboxItem key={p.id} value={p}>
                            {p.name}
                            <small className="place-category">
                              {'source' in p && p.source === 'kakao'
                                ? '카카오맵'
                                : '저장 장소'}
                            </small>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  {searchState === 'fallback' && (
                    <p className="field-help">
                      카카오맵에 연결할 수 없어 저장된 장소에서 찾고 있어요.
                    </p>
                  )}
                  {!destination && (
                    <label className="recommendation-opt-in">
                      <input
                        type="checkbox"
                        checked={wantsRecommendation}
                        onChange={(event) => {
                          setWantsRecommendation(event.target.checked);
                          setSuggestedPlaces([]);
                          setError('');
                        }}
                      />
                      <span>
                        <strong>목적지가 정해지지 않았어요.</strong>
                        <small>오늘의 생활 미션으로 추천받고 싶어요.</small>
                      </span>
                      <Check
                        className="recommendation-opt-in-check"
                        size={18}
                      />
                    </label>
                  )}
                  {!destination && wantsRecommendation && (
                    <div className="context-recommendation">
                      <fieldset className="run-kind-grid">
                        <legend>오늘의 생활 미션</legend>
                        {Object.entries(RUN_KINDS).map(([key, item]) => {
                          const presentation =
                            runKindPresentation[key as RunKind];
                          const Icon = presentation.icon;
                          return (
                            <Button
                              key={key}
                              type="button"
                              className="run-kind-card"
                              data-kind={key}
                              aria-pressed={runKind === key}
                              variant="outline"
                              onClick={() => setRunKind(key as RunKind)}
                            >
                              <span className="run-kind-icon">
                                <Icon aria-hidden size={19} />
                              </span>
                              <span>
                                <strong>{item.label}</strong>
                                <small>{presentation.prompt}</small>
                              </span>
                              {runKind === key && (
                                <Check className="run-kind-check" size={15} />
                              )}
                            </Button>
                          );
                        })}
                      </fieldset>
                      <Button
                        type="button"
                        className="destination-recommend-action"
                        disabled={placeBusy}
                        onClick={() => void suggestDestinations()}
                      >
                        <Sparkles size={17} />
                        {placeBusy
                          ? '카카오맵에서 찾는 중…'
                          : '미션에 맞는 목적지 추천'}
                      </Button>
                      <p className="field-help data-caution">
                        서울 집계 소비패턴은 메뉴 구성과 보조 정렬에만 사용해요.
                        개인 선호나 이동경로를 예측하지 않아요.
                      </p>
                    </div>
                  )}
                  {suggestedPlaces.length > 0 && !destination && (
                    <section
                      className="destination-recommendations"
                      aria-label="추천 목적지"
                    >
                      <div className="recommendation-heading">
                        <div>
                          <span>RUN &amp; LOCAL PICKS</span>
                          <h2>오늘의 목적지</h2>
                        </div>
                        <small>실제 보행 경로 확인 완료</small>
                      </div>
                      {suggestedPlaces.map((p, index) => (
                        <button
                          type="button"
                          key={p.id}
                          className="destination-card"
                          onClick={() =>
                            chooseDestination({
                              destinationId: p.id,
                              ...(p.adjustment
                                ? { theme: 'any', scenery: 'any' }
                                : {}),
                              ...(p.adjustment === 'out_and_back'
                                ? { mode: 'out_and_back' }
                                : {}),
                            })
                          }
                        >
                          <span className="destination-card-topline">
                            <span className="rank-badge">
                              {index + 1}순위 · {RUN_KINDS[runKind].label}
                            </span>
                            {p.contextBonus > 0 && (
                              <span className="context-badge">
                                Context +{p.contextBonus.toFixed(1)}
                              </span>
                            )}
                          </span>
                          <span className="destination-card-title">
                            <strong>{p.name}</strong>
                          </span>
                          <span className="destination-card-copy">
                            {p.address || p.reasons[2]}
                          </span>
                          <span className="destination-metrics">
                            <span>
                              <strong>{p.actualCourseKm.toFixed(1)}</strong>
                              <small>KM</small>
                            </span>
                            <span>
                              <strong>{Math.round(p.actualMinutes)}</strong>
                              <small>MIN</small>
                            </span>
                            <span>
                              <strong>{Math.round(p.score)}</strong>
                              <small>FIT</small>
                            </span>
                          </span>
                        </button>
                      ))}
                    </section>
                  )}
                </div>
                {destination && (
                  <div className="setup-destination">
                    <MapPin size={24} />
                    <span>
                      <small>
                        {missionLabelForDestinationType(
                          (
                            destination as Poi & {
                              destinationType?: DestinationType;
                            }
                          ).destinationType,
                        )}
                      </small>
                      <strong>{destination.name}</strong>
                    </span>
                    <button
                      type="button"
                      className="clear-destination"
                      aria-label="목적지 선택 해제"
                      onClick={clearDestination}
                    >
                      <X size={16} />
                      <span>선택 해제</span>
                    </button>
                  </div>
                )}
                <p className="field-help">
                  카카오맵의 {cityName} 장소를 검색해요. 저장된 {places.length}
                  곳은 API 연결 실패 시에만 보조 검색에 사용해요.
                </p>
              </>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <p className="overline">MAKE IT YOUR RUN</p>
            <h1>오늘은, 이런 러닝.</h1>
            <p className="setup-intro">
              {destination?.name}까지 어떤 길로 달릴지 골라주세요.
            </p>
            <RunPreferences form={form} update={update} />
          </>
        )}
        {(error || notice || loadError) && (
          <p className="inline-error setup-error" role="alert">
            {error || notice || loadError}
          </p>
        )}
      </main>
      <footer className="setup-footer">
        <Button
          className="primary-action"
          onClick={next}
          disabled={step >= 2 && (!graph || locationBusy)}
        >
          {step === 0
            ? '이 기기에서 시작'
            : step === 3
              ? '내 조건으로 코스 찾기'
              : '다음으로'}
          <ArrowRight size={20} />
        </Button>
        <p>
          {step === 0 || step === 1
            ? '계정 없이 시작해요. 프로필과 기록은 이 기기에 저장돼요.'
            : step === 3
              ? '거리·시간·지형 조건을 함께 확인해요.'
              : '순환과 왕복 코스는 목적지를 지나 출발점으로 돌아와요.'}
        </p>
      </footer>
    </div>
  );
}
