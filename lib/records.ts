import type { Coordinate } from './recommender.ts';
export type RunRecord = {
  geometry: Coordinate[];
  id: string;
  destination: string;
  plannedMeters: number;
  plannedMinutes: number;
  createdAt: string;
  completedAt: string | null;
  actualKm: number | null;
  actualMinutes: number | null;
};
export const RECORD_KEY = 'run-and-local:v1';
export function parseRecords(raw: string | null): RunRecord[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  const finite = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (
    !Array.isArray(data) ||
    data.length > 200 ||
    !data.every(
      (r) =>
        r &&
        Array.isArray(r.geometry) &&
        r.geometry.length >= 2 &&
        r.geometry.length <= 20000 &&
        r.geometry.every(
          (p: unknown) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
            Math.abs(p[0]) <= 180 &&
            Math.abs(p[1]) <= 90,
        ) &&
        typeof r.id === 'string' &&
        typeof r.destination === 'string' &&
        finite(r.plannedMeters) &&
        finite(r.plannedMinutes) &&
        Number.isFinite(Date.parse(r.createdAt)) &&
        (r.completedAt === null
          ? r.actualKm === null && r.actualMinutes === null
          : Number.isFinite(Date.parse(r.completedAt)) &&
            finite(r.actualKm) &&
            finite(r.actualMinutes)),
    )
  )
    throw new Error('저장된 기록을 읽지 못했습니다. 기존 데이터는 유지됩니다.');
  return data;
}
export function completeRecord(
  record: RunRecord,
  km: number,
  minutes: number,
): RunRecord {
  if (
    ![km, minutes].every((v) => Number.isFinite(v) && v > 0) ||
    km > 100 ||
    minutes > 1440
  )
    throw new Error('실제 거리(0~100km)와 시간(0~1,440분)을 입력해 주세요.');
  return {
    ...record,
    completedAt: new Date().toISOString(),
    actualKm: km,
    actualMinutes: minutes,
  };
}
