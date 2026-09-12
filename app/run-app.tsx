'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Coffee,
  Download,
  Flag,
  Footprints,
  Info,
  LocateFixed,
  MapPin,
  Route as RouteIcon,
  Timer,
  TreePine,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
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

type LocalPoi = Poi & {
  openingHours?: string | null;
  address?: string | null;
  osmUrl: string;
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
  metadata: { osmTimestamp: string; attribution: string };
}
const categories: Record<string, string> = {
  cafe: '카페',
  restaurant: '식당',
  park: '공원',
  attraction: '볼거리',
};
const modes = { loop: '순환', out_and_back: '왕복', one_way: '편도' };
const sceneries = {
  water: '물가',
  green: '녹지',
  city: '도시',
  any: '상관없음',
};
const defaults: RouteInput = {
  origin: { nodeId: '4655208788' },
  destinationId: 'way/648051405',
  minutes: 45,
  paceMinKm: 7,
  maxDistanceKm: 6,
  pauseMinutes: 5,
  mode: 'loop',
  scenery: 'water',
};
const formatKm = (meters: number) => (meters / 1000).toFixed(2);
function Choice<T extends string>({
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
      <SelectTrigger id={label.replaceAll(' ', '-')} aria-label={label} className="field-control">
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
function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function RunApp() {
  const [graph, setGraph] = useState<LocalGraph | null>(null),
    [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<RouteInput>(defaults),
    [result, setResult] = useState<RecommendationResult | null>(null),
    [submitted, setSubmitted] = useState<RouteInput>(defaults);
  const [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [picking, setPicking] = useState(false),
    [locationBusy, setLocationBusy] = useState(false);
  const [tab, setTab] = useState('explore'),
    [notice, setNotice] = useState(''),
    [category, setCategory] = useState('all');
  const [records, setRecords] = useState<RunRecord[]>([]),
    [storageError, setStorageError] = useState(''),
    [finish, setFinish] = useState<RunRecord | null>(null),
    [actualKm, setActualKm] = useState(''),
    [actualMinutes, setActualMinutes] = useState(''),
    [finishError, setFinishError] = useState('');
  const computeId = useRef(0);
  const router = useMemo(() => (graph ? createRouter(graph) : null), [graph]);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/data/gangneung.json', { signal: abort.signal })
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
        setResult(createRouter(map).recommend(defaults));
      })
      .catch((e) => {
        if (e.name !== 'AbortError')
          setLoadError(
            '지도를 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.',
          );
      });
    void Promise.resolve().then(() => {
      try {
        setRecords(parseRecords(localStorage.getItem(RECORD_KEY)));
      } catch (e) {
        setStorageError(
          e instanceof Error ? e.message : '기록을 읽지 못했습니다.',
        );
      }
    });
    return () => abort.abort();
  }, []);
  function update(patch: Partial<RouteInput>) {
    computeId.current++;
    setBusy(false);
    setForm((v) => ({ ...v, ...patch }));
    setDirty(true);
    setNotice('');
  }
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
  function locate() {
    if (!navigator.geolocation) {
      setNotice('이 브라우저는 위치 기능을 지원하지 않습니다.');
      return;
    }
    setLocationBusy(true);
    setNotice('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        update({ origin: { lon: p.coords.longitude, lat: p.coords.latitude } });
        setLocationBusy(false);
        setNotice('현위치를 출발점으로 설정했습니다. 코스를 다시 찾아주세요.');
      },
      () => {
        setLocationBusy(false);
        setNotice(
          '위치를 가져오지 못했습니다. 브라우저 권한을 확인하거나 지도에서 선택해 주세요.',
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
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
  const route = result?.routes[selected];
  const completed = records.filter((r) => r.completedAt !== null);
  function addPlan() {
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
    if (saveRecord(item)) {
      setNotice('내 챌린지에 저장했습니다. 달린 뒤 실제 기록을 남겨주세요.');
      setTab('challenge');
    }
  }
  function exportGpx(geometry = route?.geometry) {
    if (!geometry) return;
    const segments = geometry
      .map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"/>`)
      .join('');
    downloadFile(
      'run-and-local.gpx',
      `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Run and Local" xmlns="http://www.topografix.com/GPX/1/1"><metadata><desc>OSM graph route. Unverified entrance gaps excluded. Copyright OpenStreetMap contributors ODbL.</desc></metadata><trk><name>Run and Local</name><trkseg>${segments}</trkseg></trk></gpx>`,
      'application/gpx+xml',
    );
    setNotice(
      'GPX를 저장했습니다. 지도 연결점까지만 포함하며 현장 통행을 보증하지 않습니다.',
    );
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="런앤로컬 홈">
          <span className="brand-mark">
            R<span>/</span>L
          </span>
          <span>
            런앤로컬<small>RUN & LOCAL</small>
          </span>
        </Link>
        <div className="region">
          <span className="live-dot" /> 강릉{' '}
          <span className="region-detail">경포 · 초당 · 안목</span>
        </div>
        <span className="edition">RUN A LITTLE. MEET LOCAL.</span>
      </header>
      <main>
        <div className="heading">
          <div>
            <p className="eyebrow">오늘의 러닝, 작은 목적지 하나</p>
            <h1>
              달려서 만나는 강릉<span>.</span>
            </h1>
            <p className="intro">
              내 시간에 맞는 길을 찾고, 도착하는 즐거움까지.
            </p>
          </div>
          <div className="weather-free">
            <Footprints size={23} />
            <div>
              <b>나만의 속도로</b>
              <small>목적지부터 정해볼까요?</small>
            </div>
          </div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList className="main-tabs">
            <TabsTrigger value="explore">
              <RouteIcon size={16} /> 코스 찾기
            </TabsTrigger>
            <TabsTrigger value="challenge">
              <Flag size={16} /> 내 챌린지{' '}
              {records.length > 0 && (
                <span className="count">{records.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="evidence">
              <Info size={16} /> 추천 근거
            </TabsTrigger>
          </TabsList>
          {notice && <output className="message">{notice}</output>}
          <TabsContent value="explore">
            {loadError ? (
              <div className="empty-panel" role="alert">
                {loadError}
                <Button onClick={() => window.location.reload()}>
                  다시 불러오기
                </Button>
              </div>
            ) : !graph ? (
              <div className="loading-panel">
                <span className="loader" />
                <h2>강릉의 길을 불러오고 있어요</h2>
                <p>실제 지도와 목적지를 준비합니다.</p>
              </div>
            ) : (
              <div className="workspace">
                <aside className="planner">
                  <div className="panel-title">
                    <span className="step">01</span>
                    <h2>오늘의 러닝 설정</h2>
                  </div>
                  <div className="field">
                    <label htmlFor="origin">
                      출발점 <span className="point-label">A</span>
                    </label>
                    <Select
                      value={originPreset?.nodeId ?? 'custom'}
                      onValueChange={(v) => {
                        if (v && v !== 'custom')
                          update({ origin: { nodeId: v } });
                      }}
                    >
                      <SelectTrigger
                        id="origin"
                        className="field-control"
                        aria-label="출발점"
                      >
                        {originPreset?.name ?? '직접 선택한 위치'}
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
                    <div className="location-actions">
                      <Button
                        variant="outline"
                        onClick={() => setPicking(!picking)}
                        aria-pressed={picking}
                      >
                        <MapPin size={14} />
                        {picking ? '선택 취소' : '지도에서 선택'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={locate}
                        disabled={locationBusy}
                      >
                        <LocateFixed size={14} />
                        {locationBusy ? '확인 중…' : '현위치'}
                      </Button>
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="destination">
                      달려갈 목적지 <span className="point-label">B</span>
                    </label>
                    <div className="category-row">
                      {[['all', '전체'], ...Object.entries(categories)].map(
                        ([id, label]) => (
                          <Button
                            key={id}
                            variant={category === id ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setCategory(id)}
                            aria-pressed={category === id}
                          >
                            {label}
                          </Button>
                        ),
                      )}
                    </div>
                    <Combobox
                      items={pois}
                      value={destination}
                      itemToStringLabel={(p) => p.name}
                      isItemEqualToValue={(a, b) => a.id === b.id}
                      onValueChange={(value) => {
                        if (value) update({ destinationId: value.id });
                      }}
                    >
                      <ComboboxInput
                        id="destination"
                        placeholder="장소 이름 검색"
                        className="destination-input"
                      />
                      <ComboboxContent>
                        <ComboboxEmpty>검색된 장소가 없습니다.</ComboboxEmpty>
                        <ComboboxList>
                          {(poi: LocalPoi) => (
                            <ComboboxItem key={poi.id} value={poi}>
                              <span>
                                {poi.name}
                                <small className="option-meta">
                                  {categories[poi.category]}
                                </small>
                              </span>
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    <p className="micro">
                      {pois.length}개 장소 · 영업 여부는 방문 전 확인해 주세요.
                    </p>
                  </div>
                  <div className="field time-field">
                    <label>
                      오늘 쓸 수 있는 시간{' '}
                      <strong>
                        {form.minutes}
                        <span>분</span>
                      </strong>
                    </label>
                    <Slider
                      aria-label="오늘 쓸 수 있는 시간"
                      value={[form.minutes]}
                      min={15}
                      max={120}
                      step={5}
                      onValueChange={(v) =>
                        update({ minutes: Array.isArray(v) ? v[0] : v })
                      }
                    />
                    <div className="range-label">
                      <span>15분</span>
                      <span>체류·여유 시간 포함</span>
                      <span>120분</span>
                    </div>
                  </div>
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="pace">
                        내 페이스 <small>분/km</small>
                      </label>
                      <Input
                        id="pace"
                        type="number"
                        min="3"
                        max="15"
                        step="0.5"
                        value={form.paceMinKm}
                        onChange={(e) =>
                          update({ paceMinKm: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="maximum">
                        최대 거리 <small>km</small>
                      </label>
                      <Input
                        id="maximum"
                        type="number"
                        min="0.5"
                        max="30"
                        step="0.5"
                        value={form.maxDistanceKm}
                        onChange={(e) =>
                          update({ maxDistanceKm: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="코스-형태">코스 형태</label>
                      <Choice
                        label="코스 형태"
                        value={form.mode}
                        items={modes}
                        onChange={(mode) => update({ mode })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="좋아하는-풍경">좋아하는 풍경</label>
                      <Choice
                        label="좋아하는 풍경"
                        value={form.scenery}
                        items={sceneries}
                        onChange={(scenery) => update({ scenery })}
                      />
                    </div>
                  </div>
                  <div className="pause-field">
                    <label htmlFor="pause">목적지에서 머무는 시간</label>
                    <div>
                      <Input
                        id="pause"
                        type="number"
                        min="0"
                        max="90"
                        step="5"
                        value={form.pauseMinutes}
                        onChange={(e) =>
                          update({ pauseMinutes: Number(e.target.value) })
                        }
                      />
                      <span>분</span>
                    </div>
                  </div>
                  <Button
                    className="find-button"
                    onClick={calculate}
                    disabled={busy}
                  >
                    {busy ? '길을 계산하고 있어요…' : '맞춤 코스 찾기'}
                    <ArrowRight size={19} />
                  </Button>
                  <p className="micro centered">
                    순환은 다른 길로 돌아오고, 왕복은 같은 길을 되짚어요.
                  </p>
                </aside>
                <section className="results">
                  <div className="map-header">
                    <div>
                      <span className="step">02</span>
                      <h2>
                        {dirty ? '조건이 바뀌었어요' : '오늘의 추천 코스'}
                      </h2>
                      <span className="result-count">
                        {dirty
                          ? '다시 검색해 주세요'
                          : `${result?.routes.length ?? 0}개 코스`}
                      </span>
                    </div>
                    <span className="snapshot">지도 기준 2026.09.12</span>
                  </div>
                  <MapView
                    graph={graph}
                    origin={origin}
                    destination={destination}
                    routes={dirty ? [] : (result?.routes ?? [])}
                    selected={selected}
                    picking={picking}
                    onOrigin={(point) => {
                      update({ origin: { lon: point[0], lat: point[1] } });
                      setPicking(false);
                      setNotice(
                        '출발점을 바꿨습니다. 맞춤 코스 찾기를 눌러주세요.',
                      );
                    }}
                    onSelect={setSelected}
                  />
                  {dirty ? (
                    <div className="empty-result">
                      <RouteIcon />
                      <h3>변경한 조건으로 새로운 길을 찾아보세요</h3>
                      <p>시간과 목적지에 맞는 실제 경로를 다시 계산합니다.</p>
                      <Button onClick={calculate} disabled={busy}>
                        코스 다시 찾기 <ArrowRight size={16} />
                      </Button>
                    </div>
                  ) : result?.status !== 'ok' ? (
                    <div className="empty-result" aria-live="polite">
                      <RouteIcon />
                      <h3>이 조건에 맞는 코스를 찾지 못했어요</h3>
                      <p>{result?.message}</p>
                      <p className="micro">
                        시간·최대 거리를 늘리거나, 출발점과 목적지를 가까이
                        바꿔보세요.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="route-cards">
                        {result.routes.map((r, i) => (
                          <button
                            key={r.id}
                            className={`route-card ${selected === i ? 'active' : ''}`}
                            onClick={() => setSelected(i)}
                            aria-pressed={selected === i}
                          >
                            <span className="card-top">
                              <span className="route-number">0{i + 1}</span>
                              <span>
                                {i === 0 ? '추천 1순위' : `대안 ${i}`}
                              </span>
                              {selected === i && <Check size={17} />}
                            </span>
                            <strong>
                              {formatKm(r.distanceMeters)}
                              <small>km</small>
                            </strong>
                            <div className="card-time">
                              <Timer size={14} />
                              {Math.ceil(r.bufferedMinutes)}분 이내 예상
                            </div>
                            <span className="card-bottom">
                              {modes[submitted.mode]} · 적합 점수{' '}
                              {Math.round(r.score)}
                              <ArrowRight size={15} />
                            </span>
                          </button>
                        ))}
                      </div>
                      {route && (
                        <div className="route-detail">
                          <div className="destination-summary">
                            <div className="destination-icon">
                              {shownDestination?.category === 'cafe' ? (
                                <Coffee />
                              ) : shownDestination?.category === 'park' ? (
                                <TreePine />
                              ) : (
                                <MapPin />
                              )}
                            </div>
                            <div>
                              <p>이번 러닝의 작은 목적지</p>
                              <h3>{shownDestination?.name}</h3>
                              <small>
                                {shownDestination
                                  ? categories[shownDestination.category]
                                  : ''}{' '}
                                ·{' '}
                                {shownDestination?.openingHours
                                  ? `등록 영업시간 ${shownDestination.openingHours}`
                                  : '영업시간 정보 없음'}
                              </small>
                            </div>
                            {shownDestination?.osmUrl && (
                              <a
                                href={shownDestination.osmUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                장소 정보 ↗
                              </a>
                            )}
                          </div>
                          <div className="reason-list">
                            {route.reasons.slice(0, 3).map((reason) => (
                              <span key={reason}>
                                <Check size={14} />
                                {reason}
                              </span>
                            ))}
                          </div>
                          <div className="time-breakdown">
                            <span>
                              달리기 <b>{route.runningMinutes.toFixed(1)}분</b>
                            </span>
                            <span>
                              체류 <b>{route.pauseMinutes}분</b>
                            </span>
                            <span>
                              횡단·연결·여유{' '}
                              <b>
                                {(
                                  route.bufferedMinutes -
                                  route.runningMinutes -
                                  route.pauseMinutes
                                ).toFixed(1)}
                                분
                              </b>
                            </span>
                          </div>
                          <p className="route-caveat">
                            {route.connectorDistanceMeters > 1
                              ? `출발·목적지와 도로 연결점 사이 약 ${Math.round(route.connectorDistanceMeters)}m는 실제 통행을 확인하지 못했습니다. 추가 시간은 추정치입니다. `
                              : ''}
                            경사·조명·공사·현장 통행은 확인되지 않았습니다.
                          </p>
                          <div className="route-actions">
                            <Button onClick={addPlan}>
                              <Flag size={16} /> 이 코스로 챌린지 저장
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => exportGpx()}
                            >
                              <Download size={16} /> GPX
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
            )}
          </TabsContent>
          <TabsContent value="challenge">
            <div className="challenge-heading">
              <div>
                <p className="eyebrow">조금씩, 꾸준히</p>
                <h2>내가 달려서 만난 순간들</h2>
                <p>
                  계획을 저장하고, 달린 뒤 직접 기록하세요. 이 브라우저에만
                  저장됩니다.
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!records.length}
                onClick={() =>
                  downloadFile(
                    'run-and-local-records.json',
                    JSON.stringify(records, null, 2),
                    'application/json',
                  )
                }
              >
                <Download size={16} /> 기록 내보내기
              </Button>
            </div>
            {storageError && (
              <p role="alert" className="message">
                {storageError}
              </p>
            )}
            <div className="stats-row">
              <div>
                <small>완료한 챌린지</small>
                <strong>
                  {completed.length}
                  <span>회</span>
                </strong>
              </div>
              <div>
                <small>기록한 거리</small>
                <strong>
                  {completed
                    .reduce((sum, r) => sum + (r.actualKm ?? 0), 0)
                    .toFixed(1)}
                  <span>km</span>
                </strong>
              </div>
              <div>
                <small>다음에 달릴 코스</small>
                <strong>
                  {records.length - completed.length}
                  <span>개</span>
                </strong>
              </div>
            </div>
            {!records.length ? (
              <div className="empty-panel">
                <Flag size={36} />
                <h3>첫 번째 목적지를 정해보세요</h3>
                <p>코스를 저장하면 여기에 나만의 챌린지가 쌓여요.</p>
                <Button onClick={() => setTab('explore')}>
                  코스 찾으러 가기 <ArrowRight size={16} />
                </Button>
              </div>
            ) : (
              <div className="record-list">
                {records.map((r) => (
                  <article className="record" key={r.id}>
                    <div
                      className={`record-icon ${r.completedAt ? 'done' : ''}`}
                    >
                      {r.completedAt ? <Check /> : <Flag />}
                    </div>
                    <div>
                      <span className="record-status">
                        {r.completedAt
                          ? '완료 · 직접 입력한 기록'
                          : '달릴 예정'}{' '}
                        · {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                      <h3>{r.destination}</h3>
                      <p>
                        {r.completedAt
                          ? `${r.actualKm} km · ${r.actualMinutes}분`
                          : `계획 ${formatKm(r.plannedMeters)} km · ${Math.ceil(r.plannedMinutes)}분`}
                      </p>
                    </div>
                    <div className="record-buttons">
                      <Button
                        variant="ghost"
                        aria-label={`${r.destination} 저장 경로 GPX 다운로드`}
                        onClick={() => exportGpx(r.geometry)}
                      >
                        <Download size={15} /> 경로
                      </Button>
                      {!r.completedAt && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setFinish(r);
                            setActualKm('');
                            setActualMinutes('');
                            setFinishError('');
                          }}
                        >
                          완주 기록하기
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="evidence">
            <div className="evidence-heading">
              <p className="eyebrow">추천의 이유를 투명하게</p>
              <h2>실제 지도 위에서, 내 조건에 맞게.</h2>
              <p>
                선택한 목적지를 반드시 지나고, 설정한 시간과 거리 안에 드는 길을
                계산합니다.
              </p>
            </div>
            <div className="evidence-grid">
              <article>
                <RouteIcon />
                <h3>길을 계산합니다</h3>
                <p>
                  17,990개 지도 지점과 19,956개 구간에서 경로를 탐색합니다.
                  시간·거리·코스 형태를 만족하지 않으면 추천에서 제외합니다.
                </p>
                <div className="weight-bars">
                  {[
                    ['시간 적합', 40],
                    ['풍경 근접', 35],
                    ['편의시설', 15],
                    ['도로 유형', 10],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <div>
                        <i style={{ width: `${value}%` }} />
                      </div>
                      <b>{value}%</b>
                    </div>
                  ))}
                </div>
                <small>
                  초기 설계 가중치입니다. 학습된 선호나 성공 확률이 아닙니다.
                  확인할 수 없는 항목은 제외하고 가중치를 다시 나눕니다.
                </small>
              </article>
              <article>
                <Waves />
                <h3>풍경은 지도 정보로 추정합니다</h3>
                <p>
                  구간 중간점에서 물가·녹지까지의 근접성과 도로 유형을
                  활용합니다. 실제 조망, 경사, 야간 조명과 현장 안전은 검증되지
                  않았습니다.
                </p>
                <div className="evidence-highlight">
                  347<small>개 실제 목적지</small>
                </div>
                <small>
                  카페·식당·공원·볼거리와 편의시설을 포함합니다. 영업시간이 없는
                  장소가 많아 영업 중 필터는 제공하지 않습니다.
                </small>
              </article>
              <article>
                <Footprints />
                <h3>통계는 배경을 설명합니다</h3>
                <div className="evidence-highlight">
                  13.63<small>% 러닝 경험률</small>
                </div>
                <p>
                  2025 국민여가활동조사 원자료의 조깅·러닝·마라톤 경험 응답을
                  가중 분석했습니다. 전체 10,028명 중 비가중 참여자는
                  1,382명입니다.
                </p>
                <small>
                  일반 여가의 제약과 여행 중 음식활동 통계는 러닝 코스 선택의
                  어려움이나 이 앱의 소비·건강 개선 효과를 직접 입증하지
                  않습니다.
                </small>
              </article>
            </div>
            <div className="source-note">
              <h3>데이터와 기록</h3>
              <p>
                지도: 2026년 9월 12일 OpenStreetMap 공개 자료, 강릉
                경포·초당·송정·안목 일부 지역. © OpenStreetMap contributors ·
                ODbL 1.0.
              </p>
              <p>
                추천 계산은 브라우저에서 실행합니다. 위치는 현위치 버튼을 누를 때만 요청합니다. 챌린지를 저장하면 출발점이 포함된 코스와 기록이 이 브라우저에 저장됩니다. 브라우저 데이터를 지우면 사라집니다. 배경지도는 OpenStreetMap 서버에서 불러옵니다.
              </p>
              <div>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  지도 출처·이용조건 ↗
                </a>
                <a href="/data/gangneung.json" download>
                  추천에 사용한 지도 데이터 ↓
                </a>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <footer>
          <span>
            RUN & LOCAL <b>달리는 이유가 하나 더.</b>
          </span>
          <span>
            강릉 시범 서비스 · 실제 통행 안내는 현장 정보를 우선하세요.
          </span>
        </footer>
      </main>
      <Dialog
        open={finish !== null}
        onOpenChange={(open) => {
          if (!open) setFinish(null);
        }}
      >
        <DialogContent className="finish-dialog">
          <DialogTitle>오늘의 완주를 기록해요</DialogTitle>
          <DialogDescription>
            {finish?.destination} · 실제 달린 거리와 시간을 직접 입력해 주세요.
          </DialogDescription>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="actual-km">실제 거리 (km)</label>
              <Input
                id="actual-km"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={actualKm}
                onChange={(e) => setActualKm(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="actual-minutes">실제 시간 (분)</label>
              <Input
                id="actual-minutes"
                type="number"
                min="0.1"
                max="1440"
                step="0.1"
                value={actualMinutes}
                onChange={(e) => setActualMinutes(e.target.value)}
              />
            </div>
          </div>
          {finishError && (
            <p role="alert" className="form-error">
              {finishError}
            </p>
          )}
          <Button
            onClick={() => {
              if (!finish) return;
              try {
                const next = completeRecord(
                  finish,
                  Number(actualKm),
                  Number(actualMinutes),
                );
                if (saveRecord(next)) {
                  setFinish(null);
                  setNotice('완주 기록을 저장했습니다.');
                }
              } catch (e) {
                setFinishError(
                  e instanceof Error ? e.message : '입력값을 확인해 주세요.',
                );
              }
            }}
          >
            완주 기록 저장 <Check size={16} />
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
