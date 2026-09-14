import { parseRecords, RECORD_KEY, type RunRecord } from './records.ts';
import type { Coordinate, Mode } from './recommender.ts';
export type NavigationPlan = {
  mode: Mode;
  destination: Coordinate;
  destinationIndex: number;
};
export type RunSession = {
  record: RunRecord;
  navigation?: NavigationPlan;
  elapsedMs: number;
  resumedAt: number | null;
};
export const SESSION_KEY = 'run-and-local:session:v1';
// Never resume a saved route on another region's map. Keep both its raw state
// and its planned course before releasing the active-session slot.
export function restoreSession(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  [west, south, east, north]: [number, number, number, number],
) {
  const raw = storage.getItem(SESSION_KEY);
  const session = parseSession(raw);
  if (
    !session ||
    session.record.geometry.every(
      ([lon, lat]) =>
        lon >= west && lon <= east && lat >= south && lat <= north,
    )
  )
    return { session, archived: false };

  const records = parseRecords(storage.getItem(RECORD_KEY));
  const next = records.some((r) => r.id === session.record.id)
    ? records
    : [session.record, ...records];
  const serialized = JSON.stringify(next);
  parseRecords(serialized);
  storage.setItem(`${SESSION_KEY}:recovery:${session.record.id}`, raw!);
  storage.setItem(RECORD_KEY, serialized);
  storage.removeItem(SESSION_KEY);
  return { session: null, archived: true };
}
export function elapsed(session: RunSession, now: number) {
  return (
    session.elapsedMs +
    (session.resumedAt === null ? 0 : Math.max(0, now - session.resumedAt))
  );
}
export function parseSession(raw: string | null): RunSession | null {
  if (raw === null) return null;
  const s = JSON.parse(raw) as RunSession;
  if (
    !s ||
    !Number.isFinite(s.elapsedMs) ||
    s.elapsedMs < 0 ||
    s.elapsedMs > 86400000 ||
    !(s.resumedAt === null || (Number.isFinite(s.resumedAt) && s.resumedAt > 0))
  )
    throw new Error(
      '진행 중 러닝을 읽지 못했습니다. 저장된 원본은 유지합니다.',
    );
  parseRecords(JSON.stringify([s.record]));
  if (s.navigation !== undefined) {
    const n = s.navigation;
    if (
      !n ||
      !['one_way', 'out_and_back', 'loop'].includes(n.mode) ||
      !Array.isArray(n.destination) ||
      n.destination.length !== 2 ||
      !n.destination.every(Number.isFinite) ||
      Math.abs(n.destination[0]) > 180 ||
      Math.abs(n.destination[1]) > 90 ||
      !Number.isInteger(n.destinationIndex) ||
      n.destinationIndex < 0 ||
      n.destinationIndex >= s.record.geometry.length
    )
      throw new Error(
        '저장된 코스의 목적지 정보를 읽지 못했어요. 원본은 유지됩니다.',
      );
  }
  return s;
}
