import { parseRecords, type RunRecord } from './records.ts';
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
