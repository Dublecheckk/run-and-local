'use client';

import BackButton from './back-button';
import { useEffect, useMemo, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import {
  LocateFixed,
  Maximize,
  Pause,
  Play,
  Route as RouteIcon,
  Share2,
  Square,
  Navigation,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { watchCurrentPosition } from '@/lib/device';
import {
  readMapPosition,
  distanceToCourse,
  type MapPosition,
} from '@/lib/navigation';
import type { Coordinate, GraphData } from '@/lib/recommender';
import type { NavigationPlan } from '@/lib/session';
import MapView from './map-view';

type Props = {
  graph: GraphData;
  geometry: Coordinate[];
  destinationName: string;
  plan?: NavigationPlan;
  plannedMeters: number;
  plannedMinutes: number;
  now: number;
  timer?: string;
  paused?: boolean;
  onBack: () => void;
  onStart?: () => void;
  onPause?: () => void;
  onFinish?: () => void;
  onShare: () => void;
};
export default function NavigationScreen(props: Props) {
  const {
    graph,
    geometry,
    destinationName,
    plan,
    timer,
    paused = false,
  } = props;
  const [watching, setWatching] = useState(false),
    [fix, setFix] = useState<MapPosition | null>(null),
    [locationMessage, setLocationMessage] = useState(
      '현재 위치를 켜면 내 위치를 지도에 표시해요.',
    );
  const [follow, setFollow] = useState(false),
    [overview, setOverview] = useState(0);
  const [west, south, east, north] = graph.bbox;
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!watching || paused) return;
    let canceled = false,
      stop: (() => Promise<void>) | undefined,
      remove: (() => Promise<void>) | undefined;
    const release = () => {
      const close = stop;
      stop = undefined;
      void close?.().catch(() => {});
      const unlisten = remove;
      remove = undefined;
      void unlisten?.().catch(() => {});
    };
    const background = () => {
      if (canceled) return;
      canceled = true;
      release();
      setWatching(false);
      setFix(null);
      setFollow(false);
      setLocationMessage('위치 표시가 중지됐어요. 필요할 때 다시 켜 주세요.');
    };
    const fail = () => {
      if (canceled) return;
      canceled = true;
      release();
      setWatching(false);
      setFix(null);
      setFollow(false);
      setLocationMessage(
        '위치를 받지 못했어요. 권한과 GPS를 확인하고 다시 켜 주세요.',
      );
    };
    void (async () => {
      const listener = await App.addListener('pause', background);
      if (canceled) {
        await listener.remove();
        return;
      }
      remove = () => listener.remove();
      const close = await watchCurrentPosition((position) => {
        if (canceled) return;
        const next = readMapPosition(position, Date.now());
        if (!next) {
          setFix(null);
          setLocationMessage('정확한 위치를 기다리고 있어요.');
          return;
        }
        if (
          next.point[0] < west ||
          next.point[0] > east ||
          next.point[1] < south ||
          next.point[1] > north
        ) {
          setFix(null);
          setLocationMessage(
            '현재 위치가 강릉 시범지역 밖이에요. 전체 코스를 확인해 주세요.',
          );
          return;
        }
        setFix(next);
        setLocationMessage('');
      }, fail);
      if (canceled) await close();
      else {
        stop = close;
        const state = await App.getState();
        if (!canceled && !state.isActive) background();
      }
    })().catch(fail);
    return () => {
      canceled = true;
      release();
    };
  }, [watching, paused, west, south, east, north]);
  const position =
    fix && watching && !paused && props.now - fix.timestamp <= 30000
      ? fix
      : null;
  const gap = position ? distanceToCourse(position.point, geometry) : null;
  const routes = useMemo(() => [{ geometry }], [geometry]);
  const destinationLon = plan?.destination[0],
    destinationLat = plan?.destination[1];
  const destination = useMemo(
    () =>
      destinationLon !== undefined && destinationLat !== undefined
        ? {
            id: 'course-destination',
            name: destinationName,
            lon: destinationLon,
            lat: destinationLat,
            category: 'destination',
          }
        : null,
    [destinationLon, destinationLat, destinationName],
  );
  const routeKind =
    plan?.mode === 'one_way'
      ? '목적지까지 편도'
      : plan?.mode === 'out_and_back'
        ? '목적지 경유 · 같은 길로 복귀'
        : plan?.mode === 'loop'
          ? '목적지 경유 · 출발점으로 복귀'
          : '저장한 코스';
  const status = paused
    ? '일시정지 중 · 위치 표시도 멈췄어요'
    : locationMessage ||
      (!position
        ? '정확한 위치를 기다리고 있어요.'
        : gap! > Math.max(50, position.accuracy * 2)
          ? `코스에서 약 ${Math.round(gap!)}m 떨어져 있어요`
          : `경로 근처 · 위치 오차 약 ±${Math.round(position.accuracy)}m`);
  const locate = () => {
    if (paused) return;
    setFollow(true);
    if (!watching) {
      setLocationMessage('현재 위치를 찾고 있어요…');
      setWatching(true);
    }
  };
  return (
    <section
      className="route-navigation"
      aria-label={timer ? '러닝 지도' : '코스 전체 지도'}
    >
      <header className="navigation-header">
        <div className="navigation-topline">
          <BackButton
            ref={back}
            onClick={props.onBack}
            label={
              timer
                ? '이전: 지도를 접고 코스 목록으로'
                : '이전: 코스 목록으로 돌아가기'
            }
          />
          <span>
            <i className={timer && !paused ? 'is-running' : ''} />
            {timer
              ? paused
                ? '잠시 쉬어가는 중'
                : '러닝 중'
              : '코스 미리보기'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={props.onShare}
            aria-label="이 코스 GPX 공유"
          >
            <Share2 size={18} />
          </Button>
        </div>
        <div className="navigation-destination">
          <span className="destination-letter">
            {plan ? 'B' : <MapPin size={20} />}
          </span>
          <div>
            <h1>{destinationName}</h1>
            <p>{routeKind}</p>
          </div>
          <Navigation size={22} />
        </div>
      </header>
      <div className="navigation-map-area">
        <MapView
          graph={graph}
          origin={geometry[0]}
          destination={destination}
          routes={routes}
          selected={0}
          picking={false}
          onOrigin={() => {}}
          onSelect={() => {}}
          navigation
          location={position}
          follow={follow}
          overviewRequest={overview}
          onPan={() => setFollow(false)}
          directionUntil={
            plan?.mode === 'out_and_back' ? plan.destinationIndex : undefined
          }
        />
        <div className="navigation-map-key">
          <span>A 출발{plan && plan.mode !== 'one_way' ? '·도착' : ''}</span>
          {plan && <span>B 목적지</span>}
          <span>
            › {plan?.mode === 'out_and_back' ? '가는 방향' : '진행 방향'}
          </span>
        </div>
        <div className="navigation-map-tools">
          <Button
            variant="secondary"
            onClick={() => {
              setFollow(false);
              setOverview((v) => v + 1);
            }}
            aria-label="전체 코스 보기"
          >
            <Maximize size={18} />
            <span>전체 코스</span>
          </Button>
          <Button
            variant="secondary"
            className={follow && watching ? 'is-following' : ''}
            onClick={locate}
            disabled={paused}
            aria-label="현재 위치 켜고 따라가기"
          >
            <LocateFixed size={20} />
            <span>{follow && position ? '위치 따라가기' : '내 위치'}</span>
          </Button>
        </div>
      </div>
      <footer className="navigation-panel">
        <output
          className={`navigation-location-status ${position ? 'has-fix' : ''}`}
          aria-live="polite"
        >
          <MapPin size={15} />
          <p>{status}</p>
          {watching && !paused && (
            <button
              onClick={() => {
                setWatching(false);
                setFix(null);
                setFollow(false);
                setLocationMessage('현재 위치 표시를 껐어요.');
              }}
            >
              끄기
            </button>
          )}
        </output>
        <div className="navigation-stats">
          <div>
            <small>{timer ? '러닝 시간' : '예상 시간'}</small>
            <strong>
              {timer ?? Math.ceil(props.plannedMinutes)}
              {!timer && <em>분</em>}
            </strong>
          </div>
          <div>
            <small>계획 코스</small>
            <strong>
              {(props.plannedMeters / 1000).toFixed(2)}
              <em>km</em>
            </strong>
          </div>
        </div>
        <div className="navigation-actions">
          {timer ? (
            <>
              <Button
                className="primary-action"
                onClick={() => {
                  setWatching(false);
                  setFix(null);
                  setFollow(false);
                  setLocationMessage(
                    '현재 위치를 켜면 내 위치를 지도에 표시해요.',
                  );
                  props.onPause?.();
                }}
              >
                {paused ? <Play size={20} /> : <Pause size={20} />}{' '}
                {paused ? '이어서 달리기' : '일시정지'}
              </Button>
              <Button
                className="navigation-end"
                onClick={() => {
                  setWatching(false);
                  setFix(null);
                  props.onFinish?.();
                }}
              >
                <Square size={17} /> 종료
              </Button>
            </>
          ) : (
            <Button
              className="primary-action"
              onClick={props.onStart}
              disabled={!props.onStart}
            >
              <Play size={18} fill="currentColor" />
              {props.onStart
                ? '이 코스로 달리기'
                : '진행 중 러닝을 먼저 종료해 주세요'}
              <RouteIcon size={20} />
            </Button>
          )}
        </div>
        <p className="navigation-caption">
          {plan
            ? '실제 입구 연결·현장 통행은 미확인 · 음성 안내 없음'
            : '이전 저장 코스는 목적지 좌표가 없어 경로만 표시해요.'}
          {timer ? ' · 거리는 종료 후 직접 기록' : ''}
        </p>
      </footer>
    </section>
  );
}
