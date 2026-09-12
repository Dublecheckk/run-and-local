import { parseRecords, type RunRecord } from './records.ts';
export type RunSession = {
  record: RunRecord;
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
  return s;
}
