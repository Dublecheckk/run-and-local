'use client';

import BackButton from './back-button';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MapPin, Route, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  createRouter,
  type GraphData,
  type RecommendationResult,
  type RouteInput,
} from '@/lib/recommender';
import {
  createDistanceConsent,
  exceedsGoal,
  nearbyDestinations,
  routesWithinGoal,
  type DistanceConsent,
  type NearbyDestination,
} from '@/lib/destination-choice';

export type DestinationRequest = {
  id: number;
  input: RouteInput;
  recommend: boolean;
};
type View = {
  phase: 'checking' | 'question' | 'nearby' | 'error';
  oneWayMeters?: number;
  totalMeters?: number;
  proposal?: DistanceConsent | null;
  message?: string;
  options?: NearbyDestination[];
  busy?: boolean;
};
const modeName = { one_way: '편도', out_and_back: '왕복', loop: '순환' };

export default function DestinationChoice({
  request,
  graph,
  router,
  onDismiss,
  onProceed,
}: {
  request: DestinationRequest | null;
  graph: GraphData | null;
  router: ReturnType<typeof createRouter> | null;
  onDismiss: () => void;
  onProceed: (input: RouteInput, result: RecommendationResult) => void;
}) {
  const [view, setView] = useState<View>({ phase: 'checking' });
  const work = useRef<AbortController | null>(null);
  // Parent callbacks may change on render; work is scoped to the request itself.
  const callbacks = useRef({ onDismiss, onProceed });
  useEffect(() => {
    callbacks.current = { onDismiss, onProceed };
  });
  useEffect(() => {
    if (!request || !router) return;
    const abort = new AbortController();
    work.current = abort;
    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (abort.signal.aborted) return;
      setView({ phase: 'checking' });
      const input = request.input;
      const distance = router.destinationDistance(input);
      if (distance.status !== 'ok' || distance.minimumCourseMeters === null) {
        setView({ phase: 'error', message: distance.message });
        return;
      }
      const minimum = distance.minimumCourseMeters;
      if (!exceedsGoal(minimum, input) && !request.recommend) {
        callbacks.current.onDismiss();
        return;
      }
      if (minimum > 30_000) {
        setView({
          phase: 'question',
          oneWayMeters: distance.oneWayMeters ?? undefined,
          totalMeters: minimum,
          message:
            '이 목적지는 현재 지원하는 최대 30km를 넘어요. 목표 거리 안의 다른 장소를 찾아볼까요?',
        });
        return;
      }
      const searchInput: RouteInput = exceedsGoal(minimum, input)
        ? {
            ...input,
            targetDistanceKm: Math.ceil(minimum / 100) / 10,
            maxDistanceKm: 30,
            minutes: 240,
          }
        : input;
      const result = router.recommend(searchInput);
      const route = result.routes[0];
      const total = route
        ? route.distanceMeters + route.connectorDistanceMeters
        : minimum;
      if (!route && !exceedsGoal(minimum, input)) {
        setView({ phase: 'error', message: result.message });
        return;
      }
      if (!exceedsGoal(minimum, input) && !exceedsGoal(total, input)) {
        callbacks.current.onProceed(input, {
          ...result,
          routes: routesWithinGoal(result, input),
        });
        return;
      }
      setView({
        phase: 'question',
        oneWayMeters: distance.oneWayMeters ?? undefined,
        totalMeters: total,
        proposal: createDistanceConsent(input, result),
        message: route
          ? undefined
          : '현재 테마와 제외 조건을 유지한 코스를 찾지 못했어요. 다른 목적지를 선택하거나 조건을 직접 조정해 주세요.',
      });
    })().catch((error) => {
      if (!abort.signal.aborted)
        setView({
          phase: 'error',
          message:
            error instanceof Error
              ? error.message
              : '목적지 거리를 확인하지 못했어요.',
        });
    });
    return () => abort.abort();
  }, [request, router]);

  function dismiss() {
    work.current?.abort();
    onDismiss();
  }
  function accept() {
    if (!view.proposal || work.current?.signal.aborted) return;
    onProceed(view.proposal.input, view.proposal.result);
  }
  async function findAlternatives() {
    if (!request || !graph || !router || !work.current) return;
    const signal = work.current.signal;
    setView({ phase: 'nearby', busy: true });
    try {
      const options = await nearbyDestinations(
        graph,
        router,
        request.input,
        signal,
      );
      if (!signal.aborted) setView({ phase: 'nearby', options });
    } catch {
      if (!signal.aborted)
        setView({
          phase: 'nearby',
          message: '다른 목적지를 찾지 못했어요. 다시 시도해 주세요.',
        });
    }
  }
  const destination = graph?.pois.find(
    (p) => p.id === request?.input.destinationId,
  );
  const goal = request?.input.targetDistanceKm ?? 5;
  const input = request?.input;
  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent className="distance-choice" showCloseButton={false}>
        <div className="back-toolbar">
          <BackButton onClick={dismiss} label="이전: 입력 화면으로 돌아가기" />
          <span className="distance-choice-icon">
            <Route size={26} />
          </span>
        </div>
        <DialogTitle>
          {view.phase === 'checking'
            ? '목적지까지 거리를 확인하고 있어요'
            : view.phase === 'nearby'
              ? `오늘의 ${goal}km 안에서 찾아봤어요`
              : view.phase === 'error'
                ? '이 목적지의 길을 확인할 수 없어요'
                : '목적지가 오늘 목표한 거리보다 먼데, 괜찮으신가요?'}
        </DialogTitle>
        <DialogDescription>
          {view.phase === 'nearby'
            ? '같은 종류의 장소 중 실제 코스가 목표 거리 이내인 후보예요.'
            : view.phase === 'checking'
              ? '출발점과 목적지 사이의 지도 보행망을 확인해요.'
              : `${destination?.name ?? '선택한 목적지'} · ${input ? modeName[input.mode] : ''} 코스`}
        </DialogDescription>
        {view.phase === 'checking' && (
          <output className="distance-progress">거리 계산 중…</output>
        )}
        {view.phase === 'question' && (
          <>
            <div className="distance-comparison">
              <div>
                <small>오늘 목표</small>
                <strong>
                  {goal}
                  <span>km</span>
                </strong>
              </div>
              <ArrowRight size={20} />
              <div>
                <small>
                  {view.proposal ? '찾은 코스 · 약' : '지도 기준 최소'}
                </small>
                <strong>
                  {((view.totalMeters ?? 0) / 1000).toFixed(1)}
                  <span>km</span>
                </strong>
              </div>
            </div>
            <p className="distance-context">
              <MapPin size={16} /> 목적지까지 편도 약{' '}
              {((view.oneWayMeters ?? 0) / 1000).toFixed(1)}km
              {input?.mode !== 'one_way'
                ? ' · 전체 거리는 돌아오는 길을 포함해요.'
                : ''}
            </p>
            <p className="distance-disclaimer">
              지도 연결점까지의 예상 거리예요. 입구 연결 구간과 현장 통행은
              확인되지 않았어요.
            </p>
            {view.proposal && input && (
              <div className="distance-consent-details">
                <strong>괜찮아요를 선택하면</strong>
                <span>
                  오늘 목표 {goal} → {view.proposal.input.targetDistanceKm}km
                </span>
                {view.proposal.input.maxDistanceKm !== input.maxDistanceKm && (
                  <span>
                    최대 거리 {input.maxDistanceKm} →{' '}
                    {view.proposal.input.maxDistanceKm}km
                  </span>
                )}
                {view.proposal.input.minutes !== input.minutes && (
                  <span>
                    <Timer size={14} /> 가용 시간 {input.minutes} →{' '}
                    {view.proposal.input.minutes}분
                  </span>
                )}
                <small>
                  위에서 찾은 코스로 진행해요. 테마·코스 형태·제외 조건은
                  유지해요.
                </small>
              </div>
            )}
            {view.message && (
              <p role="alert" className="inline-error">
                {view.message}
              </p>
            )}
            {view.proposal && (
              <Button className="primary-action" onClick={accept}>
                괜찮아요, 이 목적지로 추천
                <ArrowRight size={18} />
              </Button>
            )}
            <Button
              variant="outline"
              disabled={view.busy}
              onClick={() => void findAlternatives()}
            >
              아니요, {goal}km 안의 목적지 찾기
            </Button>
          </>
        )}
        {view.phase === 'nearby' && (
          <>
            {view.busy ? (
              <output className="distance-progress">
                목표 거리 안의 코스를 확인하고 있어요…
              </output>
            ) : (
              <>
                <div className="distance-alternatives">
                  {view.options?.map((option) => (
                    <button
                      key={option.place.id}
                      onClick={() => onProceed(option.input, option.result)}
                    >
                      <span>
                        <strong>{option.place.name}</strong>
                        <small>
                          전체 약 {(option.totalMeters / 1000).toFixed(1)}km ·{' '}
                          {Math.ceil(option.result.routes[0].bufferedMinutes)}분
                        </small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  ))}
                </div>
                {!view.options?.length && (
                  <output>
                    {view.message ||
                      '현재 지도와 거리·시간·테마 조건에 맞는 다른 목적지가 없어요. 돌아가서 조건이나 출발지를 바꿔 주세요.'}
                  </output>
                )}
                <p className="distance-disclaimer">
                  현재 앱에 불러온 장소에서 찾아요. 목표 거리와 제외 조건을 넘는
                  코스는 표시하지 않아요.
                </p>
              </>
            )}
          </>
        )}
        {view.phase === 'error' && (
          <p role="alert" className="inline-error">
            {view.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
