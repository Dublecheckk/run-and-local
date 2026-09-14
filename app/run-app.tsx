'use client';
/* oxlint-disable next/no-img-element -- Local photos are also bundled in native apps without a Next image server. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { currentPosition, exportFile } from '@/lib/device';
import {
  elapsed,
  parseSession,
  SESSION_KEY,
  type RunSession,
} from '@/lib/session';
import {
  ArrowRight,
  Bookmark,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  Play,
  Pause,
  X,
  Activity,
  Compass,
  Smartphone,
  Share2,
  ArrowUpRight,
  Check,
  Coffee,
  Download,
  Flag,
  Info,
  LocateFixed,
  MapPin,
  Route as RouteIcon,
  Search,
  Timer,
  Maximize,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  createRouter,
  MAX_ORIGIN_GAP_METERS,
  type Coordinate,
  type GraphData,
  type Poi,
  type RecommendationResult,
  type RouteInput,
} from '@/lib/recommender';
import {
  completeRecord,
  parseRecords,
  RECORD_KEY,
  type RunRecord,
} from '@/lib/records';
import MapView from './map-view';
import NavigationScreen from './navigation-screen';
import RouteTerrain from './route-terrain';
import RunSetup, { RunPreferences, modes } from './run-setup';
import { COURSE_THEMES } from '@/lib/recommender';
import {
  DEFAULT_PROFILE,
  PROFILE_KEY,
  saveProfile,
  parseProfile,
  type RunnerProfile,
} from '@/lib/profile';
import type { PlaceCandidate } from '@/lib/destination-recommender';

type LocalPoi = Poi & {
  openingHours?: string | null;
  address?: string | null;
  osmUrl: string;
  source?: 'kakao' | 'osm';
};
interface LocalGraph extends GraphData {
  pois: LocalPoi[];
  origins: {
    id: string;
    name: string;
    nodeId: string;
    lon: number;
    lat: number;
  }[];
  metadata: {
    osmTimestamp: string;
    attribution: string;
    terrain?: { dem: { attribution: string; licenseUrl: string } };
  };
}
const regions = {
  seongsu: {
    city: '서울',
    name: '성수·서울숲·뚝섬',
    dataUrl: '/data/seongsu.json',
    defaultTheme: 'river' as const,
  },
  gangneung: {
    city: '강릉',
    name: '강릉 전역',
    dataUrl: '/data/gangneung.json',
    defaultTheme: 'coast' as const,
  },
};
type RegionId = keyof typeof regions;
const categories: Record<string, string> = {
  cafe: '카페',
  restaurant: '식당',
  park: '공원',
  attraction: '볼거리',
};
const categoryKinds: Record<string, string> = {
  cafe: 'coffee',
  restaurant: 'food',
  park: 'park',
  attraction: 'sightseeing',
};
const sceneries = {
  water: '물가',
  green: '녹지',
  city: '도시',
  any: '상관없음',
};
const defaults: RouteInput = {
  origin: { nodeId: '4655208788' },
  destinationId: '',
  minutes: 60,
  paceMinKm: 7,
  maxDistanceKm: 6,
  pauseMinutes: 5,
  mode: 'loop',
  scenery: 'water',
  targetDistanceKm: 5,
  theme: 'coast',
  hillPreference: 'gentle',
  surfacePreference: 'any',
  avoidSteps: true,
  avoidMajorRoads: false,
  requireKnownSlope: false,
  timeOfDay: 'day',
};
const formatKm = (meters: number) => (meters / 1000).toFixed(2);
export default function RunApp() {
  const [regionId, setRegionId] = useState<RegionId>('seongsu');
  const region = regions[regionId];
  const [graph, setGraph] = useState<LocalGraph | null>(null),
    [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<RouteInput>(defaults),
    [result, setResult] = useState<RecommendationResult | null>(null),
    [submitted, setSubmitted] = useState<RouteInput>(defaults);
  const [originLabel, setOriginLabel] = useState('');
  const [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [picking, setPicking] = useState(false),
    [locationBusy, setLocationBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false),
    [navigationOpen, setNavigationOpen] = useState(true);
  const [tab, setTab] = useState('explore'),
    [notice, setNotice] = useState(''),
    [category, setCategory] = useState('all');
  const [placeQuery, setPlaceQuery] = useState(''),
    [placeSearchResults, setPlaceSearchResults] = useState<LocalPoi[]>([]),
    [placeSearchState, setPlaceSearchState] = useState<
      'idle' | 'loading' | 'kakao' | 'fallback'
    >('idle');
  const [originQuery, setOriginQuery] = useState(''),
    [originSearchResults, setOriginSearchResults] = useState<PlaceCandidate[]>(
      [],
    ),
    [originSearchBusy, setOriginSearchBusy] = useState(false);
  const [records, setRecords] = useState<RunRecord[]>([]),
    [storageError, setStorageError] = useState(''),
    [finish, setFinish] = useState<RunRecord | null>(null),
    [actualKm, setActualKm] = useState(''),
    [actualMinutes, setActualMinutes] = useState(''),
    [finishError, setFinishError] = useState('');
  const [sheet, setSheet] = useState<
    'settings' | 'place' | 'about' | 'region' | null
  >(null);
  const [session, setSession] = useState<RunSession | null>(null),
    [now, setNow] = useState(0),
    [sessionError, setSessionError] = useState('');
  const [profile, setProfile] = useState<RunnerProfile | null>(null);
  const [draftProfile, setDraftProfile] =
    useState<RunnerProfile>(DEFAULT_PROFILE);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [setupStep, setSetupStep] = useState<number | null>(0);
  const computeId = useRef(0);
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const saved = parseProfile(localStorage.getItem(PROFILE_KEY));
        if (saved) {
          setProfile(saved);
          setDraftProfile(saved);
          setSetupStep(2);
          setForm((v) => ({
            ...v,
            paceMinKm: saved.paceMinKm,
            hillPreference:
              saved.experience === 'beginner' ? 'gentle' : 'rolling',
          }));
        }
      } catch (e) {
        setProfileError(
          e instanceof Error ? e.message : '기기 프로필을 읽지 못했어요.',
        );
      } finally {
        setProfileReady(true);
      }
    });
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const router = useMemo(() => (graph ? createRouter(graph) : null), [graph]);
  const originSupport = useMemo(
    () =>
      new Map(
        originSearchResults.map((place) => [
          place.id,
          (router?.snap(place)?.distanceMeters ?? Infinity) <=
            MAX_ORIGIN_GAP_METERS,
        ]),
      ),
    [originSearchResults, router],
  );
  useEffect(() => {
    const abort = new AbortController();
    fetch(region.dataUrl, { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error('지도 데이터 다운로드에 실패했습니다.');
        return r.json();
      })
      .then((data) => {
        const map = data as LocalGraph;
        createRouter(map);
        if (!Array.isArray(map.origins) || !map.origins.length)
          throw new Error('출발점 데이터가 없습니다.');
        setGraph(map);
        const first = map.origins[0];
        setForm((current) => {
          const next: RouteInput = {
            ...current,
            origin: { nodeId: first.nodeId },
            destinationId: '',
            theme: region.defaultTheme,
            scenery: 'water',
          };
          setSubmitted(next);
          return next;
        });
        setOriginLabel(first.name);
        setResult(null);
        setDirty(true);
      })
      .catch((e) => {
        if (e.name !== 'AbortError')
          setLoadError(
            '지도를 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.',
          );
      });
    return () => abort.abort();
  }, [region.dataUrl, region.defaultTheme]);
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setRecords(parseRecords(localStorage.getItem(RECORD_KEY)));
        try {
          const restored = parseSession(localStorage.getItem(SESSION_KEY));
          setSession(restored);
          if (restored) setSetupStep(null);
          setNow(Date.now());
        } catch (e) {
          setSessionError(
            e instanceof Error ? e.message : '진행 중 기록을 읽지 못했습니다.',
          );
        }
      } catch (e) {
        setStorageError(
          e instanceof Error ? e.message : '기록을 읽지 못했습니다.',
        );
      }
    });
  }, []);

  function selectRegion(nextRegionId: RegionId) {
    if (nextRegionId === regionId) {
      setSheet(null);
      return;
    }
    computeId.current++;
    setBusy(false);
    setGraph(null);
    setLoadError('');
    setRegionId(nextRegionId);
    setPlaceQuery('');
    setOriginQuery('');
    setPlaceSearchResults([]);
    setOriginSearchResults([]);
    setSheet(null);
    setNotice(`${regions[nextRegionId].name} 지도로 바꿨어요.`);
  }
  function update(patch: Partial<RouteInput>) {
    setPreviewOpen(false);
    computeId.current++;
    setBusy(false);
    setForm((v) => ({ ...v, ...patch }));
    setDirty(true);
    setNotice('');
  }
  function selectOrigin(origin: RouteInput['origin'], label: string) {
    setOriginLabel(label);
    update({ origin });
  }
  function selectOriginPlace(place: PlaceCandidate) {
    if (!originSupport.get(place.id)) {
      setNotice(
        `${place.name}은(는) ${region.name} 지원 도로망 밖이에요. ‘지원 가능’ 장소를 골라주세요.`,
      );
      return;
    }
    setOriginQuery(place.name);
    selectOrigin({ lon: place.lon, lat: place.lat }, place.name);
  }
  function isSupportedOrigin(place: PlaceCandidate) {
    return originSupport.get(place.id) === true;
  }
  const mergePlaces = useCallback((places: PlaceCandidate[]) => {
    setGraph((current) =>
      current
        ? {
            ...current,
            pois: [
              ...current.pois.filter(
                (poi) => !places.some((place) => place.id === poi.id),
              ),
              ...places.map((place) => ({
                ...place,
                osmUrl: place.placeUrl ?? '',
                openingHours: null,
                address: place.address ?? null,
              })),
            ],
          }
        : current,
    );
  }, []);
  function calculate() {
    if (!router) return;
    const id = ++computeId.current;
    setBusy(true);
    setNotice('');
    setPicking(false);
    setTimeout(() => {
      if (id !== computeId.current) return;
      try {
        setResult(router.recommend(form));
        setSubmitted(form);
        setSelected(0);
        setDirty(false);
        setSheet(null);
      } catch {
        setNotice('계산에 실패했습니다. 조건을 확인하고 다시 시도해 주세요.');
      } finally {
        setBusy(false);
      }
    }, 35);
  }
  function saveRecord(item: RunRecord) {
    try {
      if (storageError) throw new Error(storageError);
      const latest = parseRecords(localStorage.getItem(RECORD_KEY));
      const next = latest.some((r) => r.id === item.id)
        ? latest.map((r) => (r.id === item.id ? item : r))
        : [item, ...latest];
      if (next.length > 200)
        throw new Error('기록은 최대 200개까지 저장됩니다.');
      parseRecords(JSON.stringify(next));
      localStorage.setItem(RECORD_KEY, JSON.stringify(next));
      setRecords(next);
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '저장 공간이 부족합니다.');
      return false;
    }
  }
  async function locate(openSettings = true) {
    const request = ++computeId.current;
    setLocationBusy(true);
    setNotice('');
    try {
      const p = await currentPosition();
      if (request !== computeId.current) return;
      selectOrigin(
        { lon: p.coords.longitude, lat: p.coords.latitude },
        `현위치 · 오차 약 ${Math.round(p.coords.accuracy)}m`,
      );
      setNotice(
        p.coords.accuracy > 100
          ? `현위치를 약 ${Math.round(p.coords.accuracy)}m 정확도로 설정했어요. 지도에서 위치를 확인해 주세요.`
          : '현위치로 설정했어요. 조건을 확인하고 코스를 찾아주세요.',
      );
      if (openSettings) setSheet('settings');
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : '위치 권한을 확인하거나 출발 지점을 직접 선택해 주세요.',
      );
    } finally {
      setLocationBusy(false);
    }
  }
  const destination =
    graph?.pois.find((p) => p.id === form.destinationId) ?? null;
  const shownDestination =
    graph?.pois.find((p) => p.id === submitted.destinationId) ?? null;
  const origin: Coordinate = useMemo(() => {
    if ('lon' in form.origin) return [form.origin.lon, form.origin.lat];
    const n = graph?.nodes.find(
      (n) => n.id === ('nodeId' in form.origin ? form.origin.nodeId : ''),
    );
    return n ? [n.lon, n.lat] : [128.9097283, 37.7985231];
  }, [form.origin, graph]);
  const originPreset = graph?.origins.find(
    (p) => 'nodeId' in form.origin && p.nodeId === form.origin.nodeId,
  );
  const shownOriginLabel = originPreset?.name || originLabel || '선택한 위치';
  const pois = useMemo(
    () =>
      graph?.pois
        .filter(
          (p) =>
            categories[p.category] &&
            (category === 'all' || p.category === category),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')) ?? [],
    [graph, category],
  );
  const originLon = origin[0];
  const originLat = origin[1];
  useEffect(() => {
    const query = originQuery.trim();
    if (query.length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setOriginSearchBusy(true);
      const params = new URLSearchParams({
        query,
        purpose: 'origin',
        x: String(originLon),
        y: String(originLat),
        radius: '20000',
      });
      fetch(`/api/places?${params}`, { signal: abort.signal })
        .then((response) => {
          if (!response.ok) throw new Error('Origin search failed');
          return response.json() as Promise<{ places: PlaceCandidate[] }>;
        })
        .then(({ places }) => setOriginSearchResults(places))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError'))
            setOriginSearchResults([]);
        })
        .finally(() => setOriginSearchBusy(false));
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
      setPlaceSearchState('loading');
      const params = new URLSearchParams({
        query,
        x: String(originLon),
        y: String(originLat),
        radius: '10000',
      });
      if (category !== 'all') params.set('kind', categoryKinds[category]);
      fetch(`/api/places?${params}`, { signal: abort.signal })
        .then((response) => {
          if (!response.ok) throw new Error('Kakao search failed');
          return response.json() as Promise<{ places: PlaceCandidate[] }>;
        })
        .then(({ places }) => {
          const mapped = places.map((place) => ({
            ...place,
            osmUrl: place.placeUrl ?? '',
            openingHours: null,
            address: place.address ?? null,
          }));
          setPlaceSearchResults(mapped);
          setPlaceSearchState('kakao');
          mergePlaces(places);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError'))
            setPlaceSearchState('fallback');
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [placeQuery, category, originLon, originLat, mergePlaces]);
  const fallbackPois = useMemo(() => {
    const query = placeQuery.trim().toLocaleLowerCase('ko');
    return query.length < 2
      ? []
      : pois.filter((poi) => poi.name.toLocaleLowerCase('ko').includes(query));
  }, [placeQuery, pois]);
  const searchedPois =
    placeQuery.trim().length < 2
      ? []
      : placeSearchState === 'kakao'
        ? placeSearchResults
        : placeSearchState === 'fallback'
          ? fallbackPois
          : [];
  const route = result?.routes[selected];
  const completed = records.filter((r) => r.completedAt !== null);
  function addPlan(start = false) {
    if (!route || !shownDestination || dirty) return;
    const item: RunRecord = {
      geometry: route.geometry,
      id: crypto.randomUUID(),
      destination: shownDestination.name,
      plannedMeters: route.distanceMeters,
      plannedMinutes: route.bufferedMinutes,
      createdAt: new Date().toISOString(),
      completedAt: null,
      actualKm: null,
      actualMinutes: null,
    };
    if (start) {
      if (
        storeSession({
          record: item,
          elapsedMs: 0,
          resumedAt: Date.now(),
          navigation: {
            mode: submitted.mode,
            destination: [shownDestination.lon, shownDestination.lat],
            destinationIndex: route.destinationIndex,
          },
        })
      ) {
        setPreviewOpen(false);
        setNavigationOpen(true);
      }
      return;
    }
    if (saveRecord(item)) {
      setNotice('내 챌린지에 저장했습니다. 달린 뒤 실제 기록을 남겨주세요.');
      setTab('challenge');
    }
  }
  async function exportGpx(geometry = route?.geometry) {
    if (!geometry) return;
    const segments = geometry
      .map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"/>`)
      .join('');
    await exportFile(
      'run-and-local.gpx',
      `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Run and Local" xmlns="http://www.topografix.com/GPX/1/1"><metadata><desc>OSM graph route. Unverified entrance gaps excluded. Copyright OpenStreetMap contributors ODbL.</desc></metadata><trk><name>Run and Local</name><trkseg>${segments}</trkseg></trk></gpx>`,
      'application/gpx+xml',
    );
    setNotice(
      'GPX를 저장했습니다. 지도 연결점까지만 포함하며 현장 통행을 보증하지 않습니다.',
    );
  }
  function storeSession(next: RunSession | null) {
    try {
      if (sessionError) throw new Error(sessionError);
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
      setSession(next);
      setSetupStep(null);
      setNow(Date.now());
      return true;
    } catch {
      setNotice(
        '러닝 상태를 저장하지 못했어요. 기기 저장 공간을 확인해 주세요.',
      );
      return false;
    }
  }
  function pauseSession() {
    if (session)
      return storeSession({
        ...session,
        elapsedMs: elapsed(session, Date.now()),
        resumedAt: null,
      });
  }
  function finishSession() {
    if (!session) return;
    const minutes = elapsed(session, Date.now()) / 60000;
    if (!pauseSession()) return;
    setFinish(session.record);
    setActualKm('');
    setActualMinutes(Math.max(0.1, Math.min(1440, minutes)).toFixed(1));
    setFinishError('');
  }
  function requestExport(geometry = route?.geometry) {
    void exportGpx(geometry).catch(() =>
      setNotice('파일을 공유하지 못했어요. 다시 시도해 주세요.'),
    );
  }
  const sessionSeconds = session ? Math.floor(elapsed(session, now) / 1000) : 0;
  const timerText = `${String(Math.floor(sessionSeconds / 3600)).padStart(2, '0')}:${String(Math.floor(sessionSeconds / 60) % 60).padStart(2, '0')}:${String(sessionSeconds % 60).padStart(2, '0')}`;
  function completeSetup() {
    try {
      const next = parseProfile(
        JSON.stringify({ ...draftProfile, paceMinKm: form.paceMinKm }),
      );
      if (!next) return;
      saveProfile(localStorage, next);
      setProfileError('');
      setProfile(next);
      setDraftProfile(next);
      setSetupStep(null);
      setTab('explore');
      setDirty(true);
      calculate();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : '기기 프로필을 저장하지 못했어요.',
      );
    }
  }
  if (!profileReady)
    return (
      <div className="loading-screen">
        <span className="loading-orbit" />
        <p>러닝을 준비하고 있어요</p>
      </div>
    );
  if (setupStep !== null && !session)
    return (
      <RunSetup
        key={setupStep}
        cityName={region.city}
        initialStep={setupStep}
        graph={graph}
        profile={draftProfile}
        form={form}
        update={update}
        onProfile={setDraftProfile}
        onComplete={completeSetup}
        onClose={
          profile || records.length
            ? () => {
                setSetupStep(null);
                if (!result) setTab('records');
              }
            : undefined
        }
        locate={() => void locate(false)}
        locationBusy={locationBusy}
        notice={notice || profileError}
        loadError={loadError}
        onPlaces={mergePlaces}
        originLabel={originLabel}
        onOriginLabel={setOriginLabel}
      />
    );
  return (
    <div className="phone-app">
      {!(
        graph &&
        ((session && navigationOpen) || (previewOpen && route && !dirty))
      ) && (
        <>
          <header className="app-header">
            <button
              className="wordmark"
              onClick={() => setTab('explore')}
              aria-label="런앤로컬 탐색"
            >
              RUN<span>&</span>LOCAL<span className="brand-period">.</span>
            </button>
            <button className="city-switch" onClick={() => setSheet('region')}>
              <span /> {region.city} <ChevronDown size={15} />
            </button>
          </header>
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(String(v))}
            className="app-tabs"
          >
            <TabsContent value="explore" className="explore-screen">
              {loadError ? (
                <div className="loading-screen">
                  <MapPin size={32} />
                  <h1>지도를 불러오지 못했어요</h1>
                  <p>{loadError}</p>
                  <Button onClick={() => window.location.reload()}>
                    다시 시도
                  </Button>
                </div>
              ) : !graph ? (
                <div className="loading-screen">
                  <span className="loading-orbit" />
                  <h1>달릴 길을 찾고 있어요</h1>
                  <p>{region.name}의 실제 지도와 연결 중</p>
                </div>
              ) : (
                <>
                  <div className="map-stage">
                    <MapView
                      graph={graph}
                      origin={origin}
                      destination={destination}
                      routes={dirty ? [] : (result?.routes ?? [])}
                      selected={selected}
                      picking={picking}
                      onOrigin={(point) => {
                        selectOrigin(
                          { lon: point[0], lat: point[1] },
                          '지도에서 선택한 위치',
                        );
                        setPicking(false);
                        setSheet('settings');
                      }}
                      onSelect={setSelected}
                    />
                    <button
                      className="destination-search"
                      onClick={() => setSheet('place')}
                    >
                      <span className="search-pin">
                        <MapPin size={18} />
                      </span>
                      <span>
                        <small>오늘의 목적지</small>
                        <strong>
                          {destination?.name ?? '어디까지 달려볼까요?'}
                        </strong>
                      </span>
                      <ChevronDown size={19} />
                    </button>
                    <div className="map-tools">
                      <Button
                        variant="secondary"
                        size="icon"
                        aria-label="현위치를 출발점으로"
                        disabled={locationBusy}
                        onClick={() => void locate()}
                      >
                        <LocateFixed
                          size={20}
                          className={locationBusy ? 'locating' : ''}
                        />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        aria-label="지도를 눌러 출발점 선택"
                        aria-pressed={picking}
                        onClick={() => setPicking(!picking)}
                      >
                        <MapPin size={20} />
                      </Button>
                    </div>
                    {route && !dirty && (
                      <Button
                        className="map-expand"
                        variant="secondary"
                        onClick={() => setPreviewOpen(true)}
                      >
                        <Maximize size={16} /> 크게 보기
                      </Button>
                    )}
                    <button
                      className="map-origin"
                      onClick={() => setSheet('settings')}
                    >
                      <span className="origin-dot" />
                      {shownOriginLabel}
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <section className="discovery-panel">
                    {sessionError && (
                      <p className="inline-error">{sessionError}</p>
                    )}
                    <div className="sheet-handle" />
                    <div className="discovery-heading">
                      <div>
                        <p className="overline">YOUR NEXT RUN</p>
                        <h1>
                          {dirty
                            ? '어떤 길로 달릴까요?'
                            : submitted.theme === 'river'
                              ? '강변을 만나는 러닝.'
                              : submitted.theme === 'lake'
                                ? '호수를 만나는 러닝.'
                                : submitted.theme === 'forest'
                                  ? '흙길을 만나는 러닝.'
                                  : submitted.scenery === 'water'
                                    ? '오늘은, 바다 쪽으로.'
                                    : submitted.scenery === 'green'
                                      ? '초록을 따라 달려요.'
                                      : '내 속도로 만나는 동네.'}
                        </h1>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="러닝 조건 설정"
                        onClick={() => setSheet('settings')}
                      >
                        <SlidersHorizontal size={22} />
                      </Button>
                    </div>
                    <button
                      className="condition-strip"
                      onClick={() => setSheet('settings')}
                    >
                      <Timer size={15} />
                      <span>
                        {form.targetDistanceKm ?? form.maxDistanceKm}km 목표
                      </span>
                      <i />
                      <span>{modes[form.mode]}</span>
                      <i />
                      <span>
                        {form.theme
                          ? COURSE_THEMES[form.theme]
                          : sceneries[form.scenery]}
                      </span>
                      <span className="edit-label">변경</span>
                    </button>
                    {dirty ? (
                      <div className="empty-course">
                        <p>새로운 조건으로 코스를 찾아보세요.</p>
                        <Button
                          className="primary-action"
                          onClick={calculate}
                          disabled={busy}
                        >
                          {busy ? '계산 중…' : '이 조건으로 코스 찾기'}
                          <ArrowRight size={20} />
                        </Button>
                      </div>
                    ) : result?.status !== 'ok' ? (
                      <div className="empty-course">
                        <h2>조건에 맞는 길을 찾지 못했어요</h2>
                        <p>{result?.message}</p>
                        <Button
                          className="primary-action"
                          onClick={() => setSheet('settings')}
                        >
                          시간·출발점 바꾸기
                          <ArrowRight size={20} />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div
                          className="route-options"
                          aria-label="추천 코스 선택"
                        >
                          {result.routes.map((r, i) => (
                            <button
                              key={r.id}
                              className={`course-option ${selected === i ? 'selected' : ''}`}
                              onClick={() => setSelected(i)}
                              aria-pressed={selected === i}
                            >
                              <span>
                                {i === 0 ? 'BEST FIT' : `ROUTE 0${i + 1}`}
                                {selected === i && <Check size={13} />}
                              </span>
                              <strong>
                                {formatKm(r.distanceMeters)}
                                <small>km</small>
                              </strong>
                              <p>
                                {Math.ceil(r.bufferedMinutes)}분 ·{' '}
                                {modes[submitted.mode]}
                              </p>
                              <small className="route-climb">
                                ↗{' '}
                                {r.terrain.ascentMeters === null
                                  ? '경사 미확인'
                                  : `추정 ${Math.round(r.terrain.ascentMeters)}m 상승`}
                              </small>
                            </button>
                          ))}
                        </div>
                        {route && (
                          <>
                            <div className="course-caption">
                              <span>
                                <RouteIcon size={15} />
                                {submitted.theme
                                  ? COURSE_THEMES[submitted.theme]
                                  : '내 조건에 맞춘 길'}
                                {submitted.theme &&
                                  submitted.theme !== 'any' &&
                                  ` · 포함 ${Math.round((route.terrain.themeMatchRatio ?? 0) * route.terrain.themeCoverageRatio * 100)}%`}
                              </span>
                              <button onClick={() => setSheet('about')}>
                                추천 이유 <ArrowUpRight size={14} />
                              </button>
                            </div>
                            <div className="start-actions">
                              <Button
                                className="primary-action"
                                disabled={!!session || !!sessionError}
                                onClick={() => addPlan(true)}
                              >
                                <Play size={18} fill="currentColor" />
                                {session
                                  ? '진행 중인 러닝이 있어요'
                                  : '이 코스로 달리기'}
                                <ArrowRight size={20} />
                              </Button>
                              <Button
                                className="save-route"
                                variant="outline"
                                size="icon"
                                aria-label="이 코스를 내 챌린지에 저장"
                                onClick={() => addPlan()}
                              >
                                <Bookmark size={21} />
                              </Button>
                            </div>
                            <RouteTerrain
                              route={route}
                              theme={submitted.theme}
                            />
                            <button
                              className="destination-card"
                              onClick={() => setSheet('place')}
                            >
                              <div className="destination-thumb">
                                {shownDestination?.id === 'way/648051405' ? (
                                  <img
                                    src="/images/gangmun-beach.jpg"
                                    alt="강문해변의 GANGMUN 포토존과 바다"
                                  />
                                ) : shownDestination?.category === 'cafe' ? (
                                  <Coffee size={28} />
                                ) : (
                                  <MapPin size={28} />
                                )}
                              </div>
                              <span>
                                <small>달리기 끝에 만나는</small>
                                <strong>{shownDestination?.name}</strong>
                                <em>
                                  {shownDestination
                                    ? categories[shownDestination.category]
                                    : ''}{' '}
                                  · {submitted.pauseMinutes}분 머무르기
                                </em>
                              </span>
                              <ArrowUpRight size={19} />
                            </button>
                            <p className="route-disclaimer">
                              현장 통행·상점 입구·영업 여부는 방문 전 확인해
                              주세요.
                            </p>
                          </>
                        )}
                      </>
                    )}
                  </section>
                </>
              )}
            </TabsContent>
            <TabsContent value="challenge" className="content-screen">
              <div className="screen-title">
                <p className="overline">ONE RUN AT A TIME</p>
                <h1>
                  나의 챌린지<span>.</span>
                </h1>
                <p>저장해 둔 목적지, 다음 러닝의 이유.</p>
              </div>
              <div className="challenge-total">
                <div>
                  <span>완료한 챌린지</span>
                  <strong>
                    {completed.length}
                    <small>회</small>
                  </strong>
                </div>
                <div className="completion-ring">
                  <Flag size={32} />
                </div>
                <p>
                  목적지 하나씩,
                  <br />
                  나만의 {region.city}을 채워가요.
                </p>
              </div>
              <div className="section-line">
                <h2>달릴 예정</h2>
                <span>{records.length - completed.length}개</span>
              </div>
              {records.filter((r) => !r.completedAt).length === 0 ? (
                <div className="empty-state">
                  <Bookmark size={30} />
                  <h3>다음 목적지를 담아보세요</h3>
                  <p>
                    마음에 드는 코스에서 책갈피를 누르면
                    <br />
                    여기에 나만의 챌린지가 모여요.
                  </p>
                  <Button variant="outline" onClick={() => setTab('explore')}>
                    코스 둘러보기
                    <ArrowRight size={17} />
                  </Button>
                </div>
              ) : (
                records
                  .filter((r) => !r.completedAt)
                  .map((r, i) => (
                    <article className="saved-course" key={r.id}>
                      <span className="saved-number">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <small>저장한 러닝 코스</small>
                        <h3>{r.destination}</h3>
                        <p>
                          {formatKm(r.plannedMeters)} km <span>·</span> 약{' '}
                          {Math.ceil(r.plannedMinutes)}분
                        </p>
                        <div className="saved-actions">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setFinish(r);
                              setActualKm('');
                              setActualMinutes('');
                              setFinishError('');
                            }}
                          >
                            완주 기록
                            <ChevronRight size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => requestExport(r.geometry)}
                            aria-label={`${r.destination} GPX 공유`}
                          >
                            <Share2 size={16} />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))
              )}
              {storageError && <p className="inline-error">{storageError}</p>}
            </TabsContent>
            <TabsContent value="records" className="content-screen">
              <div className="runner-profile-card">
                <span>
                  <small>이 기기의 러너</small>
                  <strong>{profile?.nickname || '러너'}님</strong>
                </span>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraftProfile(profile ?? DEFAULT_PROFILE);
                    setSetupStep(1);
                  }}
                >
                  내 정보
                </Button>
                <Button onClick={() => setSetupStep(2)}>새 러닝</Button>
              </div>
              <div className="screen-title">
                <p className="overline">EVERY KILOMETER COUNTS</p>
                <h1>
                  내가 달린 기록<span>.</span>
                </h1>
                <p>어제보다 한 걸음, 나만의 페이스로.</p>
              </div>
              <div className="distance-total">
                <span>누적 러닝 거리</span>
                <strong>
                  {completed
                    .reduce((sum, r) => sum + (r.actualKm ?? 0), 0)
                    .toFixed(1)}
                  <small>km</small>
                </strong>
                <div>
                  <span>
                    <Flag size={15} />
                    {completed.length}회 완료
                  </span>
                  <span>
                    <Timer size={15} />
                    {Math.round(
                      completed.reduce(
                        (sum, r) => sum + (r.actualMinutes ?? 0),
                        0,
                      ),
                    )}
                    분
                  </span>
                </div>
              </div>
              <div className="section-line">
                <h2>러닝 히스토리</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="기록 JSON 내보내기"
                  disabled={!records.length}
                  onClick={() =>
                    void exportFile(
                      'run-and-local-records.json',
                      JSON.stringify(records, null, 2),
                      'application/json',
                    ).catch(() => setNotice('기록을 내보내지 못했어요.'))
                  }
                >
                  <Download size={19} />
                </Button>
              </div>
              {!completed.length ? (
                <div className="empty-state">
                  <Activity size={32} />
                  <h3>첫 러닝을 기다리고 있어요</h3>
                  <p>달린 뒤 실제 거리와 시간을 남겨주세요.</p>
                  <Button variant="outline" onClick={() => setTab('explore')}>
                    러닝 시작하기
                    <ArrowRight size={17} />
                  </Button>
                </div>
              ) : (
                completed.map((r) => (
                  <article className="history-item" key={r.id}>
                    <span className="history-check">
                      <Check size={21} />
                    </span>
                    <div>
                      <small>
                        {new Date(r.completedAt!).toLocaleDateString('ko-KR')}
                      </small>
                      <h3>{r.destination}</h3>
                      <p>
                        {r.actualKm} km <span>·</span> {r.actualMinutes}분
                      </p>
                      <small>거리 직접 입력</small>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${r.destination} 경로 공유`}
                      onClick={() => requestExport(r.geometry)}
                    >
                      <Share2 size={18} />
                    </Button>
                  </article>
                ))
              )}
              <button
                className="settings-row"
                onClick={() => setSheet('about')}
              >
                <Info size={18} />
                <span>앱 정보 · 데이터와 개인정보</span>
                <ChevronRight size={18} />
              </button>
              <a
                className="settings-row"
                href="https://run-and-local-gangneung.jason1207890.chatgpt.site/downloads/run-and-local.apk"
                download
              >
                <Smartphone size={18} />
                <span>Android 앱 설치 파일</span>
                <Download size={18} />
              </a>
              <p className="local-note">
                기록과 저장한 코스는 이 기기에 보관돼요.
                <br />
                앱을 삭제하기 전 기록을 내보내 주세요.
              </p>
            </TabsContent>
            <TabsList className="bottom-nav">
              <TabsTrigger value="explore">
                <Compass />
                <span>탐색</span>
              </TabsTrigger>
              <TabsTrigger value="challenge">
                <Flag />
                <span>챌린지</span>
              </TabsTrigger>
              <TabsTrigger value="records">
                <Activity />
                <span>내 기록</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {session && !navigationOpen && (
            <div className="resume-map-banner">
              <button
                className="banner-info"
                onClick={() => setNavigationOpen(true)}
              >
                <RouteIcon size={18} />
                <span>
                  {session.resumedAt === null ? '쉬어가는 중' : '러닝 중'} ·{' '}
                  {timerText}
                </span>
                <strong>
                  지도 열기 <ChevronRight size={15} />
                </strong>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  session.resumedAt === null
                    ? storeSession({ ...session, resumedAt: Date.now() })
                    : pauseSession()
                }
                aria-label={
                  session.resumedAt === null ? '러닝 재개' : '러닝 일시정지'
                }
              >
                {session.resumedAt === null ? (
                  <Play size={16} />
                ) : (
                  <Pause size={16} />
                )}
              </Button>
            </div>
          )}
        </>
      )}
      {notice && (
        <output className="toast-message">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="알림 닫기">
            <X size={16} />
          </button>
        </output>
      )}
      {graph && session && navigationOpen && (
        <NavigationScreen
          graph={graph}
          geometry={session.record.geometry}
          destinationName={session.record.destination}
          plan={session.navigation}
          plannedMeters={session.record.plannedMeters}
          plannedMinutes={session.record.plannedMinutes}
          now={now}
          timer={timerText}
          paused={session.resumedAt === null}
          onBack={() => {
            setNavigationOpen(false);
            if (!result) setTab('records');
          }}
          onPause={() =>
            session.resumedAt === null
              ? storeSession({ ...session, resumedAt: Date.now() })
              : pauseSession()
          }
          onFinish={finishSession}
          onShare={() => requestExport(session.record.geometry)}
        />
      )}
      {graph &&
        previewOpen &&
        route &&
        !dirty &&
        shownDestination &&
        !(session && navigationOpen) && (
          <NavigationScreen
            graph={graph}
            geometry={route.geometry}
            destinationName={shownDestination.name}
            plan={{
              mode: submitted.mode,
              destination: [shownDestination.lon, shownDestination.lat],
              destinationIndex: route.destinationIndex,
            }}
            plannedMeters={route.distanceMeters}
            plannedMinutes={route.bufferedMinutes}
            now={now}
            onBack={() => setPreviewOpen(false)}
            onStart={!session ? () => addPlan(true) : undefined}
            onShare={() => requestExport()}
          />
        )}
      <Dialog
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
      >
        <DialogContent className="mobile-sheet">
          <div className="sheet-handle" />
          {sheet === 'settings' && (
            <>
              <DialogTitle>오늘의 러닝 설정</DialogTitle>
              <DialogDescription>
                달리고 싶은 만큼, 내가 좋아하는 길로.
              </DialogDescription>
              {graph && (
                <>
                  <div className="form-field">
                    <label htmlFor="origin">출발점</label>
                    <Select
                      value={originPreset?.nodeId ?? 'custom'}
                      onValueChange={(v) => {
                        if (v && v !== 'custom') {
                          const preset = graph.origins.find(
                            (item) => item.nodeId === v,
                          );
                          selectOrigin(
                            { nodeId: v },
                            preset?.name ?? '선택한 출발점',
                          );
                        }
                      }}
                    >
                      <SelectTrigger id="origin" className="field-control">
                        {shownOriginLabel}
                      </SelectTrigger>
                      <SelectContent>
                        {!originPreset && (
                          <SelectItem value="custom">
                            직접 선택한 위치
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
                      items={
                        originQuery.trim().length < 2 ? [] : originSearchResults
                      }
                      itemToStringLabel={(place: PlaceCandidate) => place.name}
                      isItemEqualToValue={(
                        a: PlaceCandidate,
                        b: PlaceCandidate,
                      ) => a.id === b.id}
                      onInputValueChange={setOriginQuery}
                      onValueChange={(place: PlaceCandidate | null) => {
                        if (place) selectOriginPlace(place);
                      }}
                    >
                      <ComboboxInput
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
                              onClick={() => selectOriginPlace(place)}
                              className={
                                isSupportedOrigin(place)
                                  ? 'supported-place'
                                  : 'unsupported-place'
                              }
                            >
                              {place.name}
                              <small className="place-category">
                                {isSupportedOrigin(place)
                                  ? '지원 가능'
                                  : '지원 권역 밖'}
                              </small>
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    {!originPreset && originLabel && (
                      <p className="form-help selected-origin">
                        <MapPin size={14} /> 출발점으로 설정됨 · {originLabel}
                      </p>
                    )}
                    <div className="form-actions">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPicking(true);
                          setSheet(null);
                          setTab('explore');
                        }}
                      >
                        <MapPin size={17} />
                        지도에서 선택
                      </Button>
                      <Button
                        variant="outline"
                        disabled={locationBusy}
                        onClick={() => void locate()}
                      >
                        <LocateFixed size={17} />
                        현위치
                      </Button>
                    </div>
                  </div>
                  <RunPreferences form={form} update={update} />
                  <Button
                    className="primary-action sheet-action"
                    onClick={calculate}
                    disabled={busy}
                  >
                    {busy ? '코스를 계산하고 있어요…' : '맞춤 코스 찾기'}
                    <ArrowRight size={20} />
                  </Button>
                </>
              )}
            </>
          )}
          {sheet === 'place' && (
            <>
              <DialogTitle>달려갈 목적지</DialogTitle>
              <DialogDescription>
                도착하는 즐거움이 있는 곳을 골라보세요.
              </DialogDescription>
              <div className="category-row">
                {[['all', '전체'], ...Object.entries(categories)].map(
                  ([id, label]) => (
                    <Button
                      key={id}
                      variant={category === id ? 'secondary' : 'ghost'}
                      onClick={() => setCategory(id)}
                      aria-pressed={category === id}
                    >
                      {label}
                    </Button>
                  ),
                )}
              </div>
              <Combobox
                items={searchedPois}
                value={destination}
                itemToStringLabel={(p) => p.name}
                isItemEqualToValue={(a, b) => a.id === b.id}
                onInputValueChange={setPlaceQuery}
                onValueChange={(value) => {
                  if (value) update({ destinationId: value.id });
                }}
              >
                <ComboboxInput
                  aria-label="목적지 이름 검색"
                  placeholder="카페, 식당, 공원 검색"
                  showTrigger={false}
                  className="search-field place-search"
                >
                  <Search aria-hidden size={18} />
                </ComboboxInput>
                <ComboboxContent className="search-results">
                  <ComboboxEmpty>
                    {placeSearchState === 'loading'
                      ? '카카오맵에서 검색하고 있어요…'
                      : placeQuery.trim().length < 2
                        ? '두 글자 이상 입력해 주세요.'
                        : '검색된 장소가 없어요.'}
                  </ComboboxEmpty>
                  <ComboboxList>
                    {(p: LocalPoi) => (
                      <ComboboxItem value={p} key={p.id}>
                        {p.name}
                        <small className="place-category">
                          {p.source === 'kakao'
                            ? `카카오맵 · ${categories[p.category]}`
                            : `저장 장소 · ${categories[p.category]}`}
                        </small>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {placeSearchState === 'fallback' && (
                <p className="form-help">
                  카카오맵 검색에 연결하지 못해 저장된 장소에서 찾았어요.
                </p>
              )}
              {destination?.id === 'way/648051405' && (
                <figure className="place-photo">
                  <img
                    src="/images/gangmun-beach.jpg"
                    alt="실제 강문해변의 바다와 포토존"
                  />
                  <figcaption>
                    강문해변 · Mobius6 / Wikimedia Commons · CC BY-SA 4.0
                  </figcaption>
                </figure>
              )}
              {destination && (
                <div className="place-detail">
                  <span>{categories[destination.category]}</span>
                  <h2>{destination.name}</h2>
                  <p>
                    {destination.openingHours
                      ? `등록된 영업시간: ${destination.openingHours}`
                      : '영업시간 정보가 없어요. 방문 전에 확인해 주세요.'}
                  </p>
                  <a href={destination.osmUrl} target="_blank" rel="noreferrer">
                    장소 정보 확인
                    <ArrowUpRight size={17} />
                  </a>
                </div>
              )}
              <Button
                className="primary-action sheet-action"
                disabled={busy}
                onClick={calculate}
              >
                {busy ? '계산 중…' : '여기로 달려갈래요'}
                <ArrowRight size={20} />
              </Button>
              <p className="field-help">
                카페·식당·공원·볼거리 {pois.length}곳에서 선택
              </p>
            </>
          )}
          {sheet === 'region' && (
            <>
              <DialogTitle>달릴 지역 선택</DialogTitle>
              <DialogDescription>
                지역별 도로망을 필요할 때만 불러와요.
              </DialogDescription>
              <div className="region-options">
                {(
                  Object.entries(regions) as [
                    RegionId,
                    (typeof regions)[RegionId],
                  ][]
                ).map(([id, item]) => (
                  <button
                    key={id}
                    className={regionId === id ? 'selected' : ''}
                    onClick={() => selectRegion(id)}
                    aria-pressed={regionId === id}
                  >
                    <span>
                      <MapPin size={20} />
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {id === 'seongsu'
                          ? '성수·서울숲·뚝섬 실증권역'
                          : '기존 강릉 서비스 권역'}
                      </small>
                    </span>
                    {regionId === id ? (
                      <Check size={19} />
                    ) : (
                      <ChevronRight size={19} />
                    )}
                  </button>
                ))}
              </div>
              <p className="field-help">
                지역을 바꾸면 출발점과 목적지를 새 지도에 맞게 다시 설정해요.
              </p>
            </>
          )}
          {sheet === 'about' && (
            <>
              <DialogTitle>내 코스의 추천 이유</DialogTitle>
              <DialogDescription>
                확인할 수 있는 정보로, 이해할 수 있는 추천.
              </DialogDescription>
              {route && !dirty && (
                <div className="explanation">
                  <div className="score-line">
                    <span>조건 적합 점수</span>
                    <strong>
                      {Math.round(route.score)}
                      <small>/ 100</small>
                    </strong>
                  </div>
                  {route.reasons.map((reason) => (
                    <p key={reason}>
                      <Check size={16} />
                      {reason}
                    </p>
                  ))}
                  <Button variant="outline" onClick={() => requestExport()}>
                    <Download size={17} />
                    현재 경로 GPX
                  </Button>
                </div>
              )}
              <div className="about-section">
                <h2>{region.name} 시범지역</h2>
                {regionId === 'seongsu' ? (
                  <p>
                    성수·서울숲·뚝섬과 한강 남·북단 연결 구간의 OSM 보행
                    도로망에서 코스를 계산해요. 현재 고도·경사는 미확인이며,
                    실제 공사·현장 통행과 상점 입구는 방문 전 확인해야 해요.
                  </p>
                ) : (
                  <p>
                    강릉 전역의 실제 지도 구간에서 코스를 계산해요. 경사는 공개
                    지표면 고도의 추정값이에요. 실제 도로 경사·공사·현장 통행과
                    상점 입구는 확인되지 않았어요.
                  </p>
                )}
                <h2>규칙 기반 추천</h2>
                <p>
                  목표 거리·테마·경사·노면을 경로 탐색과 순위 계산에 반영해요.
                  선택한 테마 구간이 전체의 15% 이상인 혼합 코스 중 시간·최대
                  거리·제외 조건을 통과한 후보만 보여드려요. 15%는 서비스 설계
                  기준이에요. 이용자 데이터로 학습한 모델이나 안전·성공 확률은
                  아니에요.
                </p>
                <h2>고도·경사 데이터</h2>
                {regionId === 'gangneung' ? (
                  <p>
                    Copernicus GLO-30 지표면 모델을 평활화하고 60m 이상 간격으로
                    경사를 추정해요. 수목·건물이 포함되며 실제 도로의 순간 최대
                    경사는 아니에요. 교량·터널·계단은 경사 미확인으로 남겨요.
                  </p>
                ) : (
                  <p>
                    성수 실증판은 고도 데이터를 아직 결합하지 않아 경사를
                    ‘미확인’으로 표시해요. 경사 선호는 고도 결합 후 정밀하게
                    반영할 예정이에요.
                  </p>
                )}
                {graph?.metadata.terrain && (
                  <p className="dem-attribution">
                    <a
                      href={graph.metadata.terrain.dem.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {graph.metadata.terrain.dem.attribution}
                    </a>
                  </p>
                )}
                <h2>내 기록과 개인정보</h2>
                <p>
                  위치는 현위치 버튼을 누를 때만 요청해요. 저장한 코스에는 출발
                  위치가 포함되며, 러닝 기록과 함께 이 기기에만 보관해요. 지도
                  화면에서 현재 위치를 켜면 위치를 갱신해요. 지도를 닫거나 앱을
                  벗어나거나 러닝을 일시정지하면 위치 표시를 중지해요. 위치
                  이력은 저장하지 않고 GPS로 완주를 판정하지 않아요. 앱 삭제 시
                  기록이 사라질 수 있어요.
                </p>
                <h2>데이터 출처</h2>
                <p>
                  지도 기준 2026.09 · © OpenStreetMap contributors · ODbL 1.0.
                  배경지도는 OSM 서버에서 불러와요. 2025 국민여가활동조사의 러닝
                  경험률 13.63%는 서비스 배경이며 앱 효과를 입증하지 않아요.
                </p>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  지도 출처·라이선스 ↗
                </a>
                {regionId === 'gangneung' && (
                  <a
                    href="https://commons.wikimedia.org/wiki/File:Gangmun_Beach_20220502_004.jpg"
                    target="_blank"
                    rel="noreferrer"
                  >
                    강문해변 사진: Mobius6 · CC BY-SA 4.0 ↗
                  </a>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={finish !== null}
        onOpenChange={(open) => {
          if (!open) setFinish(null);
        }}
      >
        <DialogContent className="mobile-sheet finish-sheet">
          <div className="sheet-handle" />
          <div className="finish-medal">
            <Check size={30} />
          </div>
          <DialogTitle>오늘도, 한 걸음 더.</DialogTitle>
          <DialogDescription>
            {finish?.destination}에서의 러닝을 기록해요.
          </DialogDescription>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="actual-km">
                실제 거리 <small>km</small>
              </label>
              <Input
                id="actual-km"
                type="number"
                inputMode="decimal"
                min=".01"
                max="100"
                step=".01"
                placeholder="직접 입력"
                value={actualKm}
                onChange={(e) => setActualKm(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="actual-minutes">
                실제 시간 <small>분</small>
              </label>
              <Input
                id="actual-minutes"
                type="number"
                inputMode="decimal"
                min=".1"
                max="1440"
                step=".1"
                placeholder="직접 입력"
                value={actualMinutes}
                onChange={(e) => setActualMinutes(e.target.value)}
              />
            </div>
          </div>
          {finishError && (
            <p className="inline-error" role="alert">
              {finishError}
            </p>
          )}
          <Button
            className="primary-action"
            onClick={() => {
              if (!finish) return;
              try {
                const next = completeRecord(
                  finish,
                  Number(actualKm),
                  Number(actualMinutes),
                );
                if (saveRecord(next)) {
                  if (session?.record.id === next.id && !storeSession(null)) {
                    setFinishError(
                      '완주 기록은 저장됐어요. 타이머 종료를 다시 시도해 주세요.',
                    );
                    return;
                  }
                  setFinish(null);
                  setTab('records');
                  setNotice('오늘의 완주를 기록했어요.');
                }
              } catch (e) {
                setFinishError(
                  e instanceof Error ? e.message : '입력값을 확인해 주세요.',
                );
              }
            }}
          >
            완주 기록 저장
            <Check size={19} />
          </Button>
          <p className="field-help">입력한 기록은 이 기기에 저장돼요.</p>
          {session?.record.id === finish?.id && (
            <Button
              variant="ghost"
              onClick={() => {
                if (storeSession(null)) {
                  setFinish(null);
                  setTab(result ? 'explore' : 'records');
                  setNotice('기록을 남기지 않고 러닝을 종료했어요.');
                } else
                  setFinishError(
                    '타이머를 종료하지 못했어요. 다시 시도해 주세요.',
                  );
              }}
            >
              기록 없이 종료
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
