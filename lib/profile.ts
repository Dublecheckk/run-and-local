export const PROFILE_KEY = 'run-and-local:runner:v1';
export type RunnerProfile = {
  nickname: string;
  experience: 'beginner' | 'regular' | 'experienced';
  paceMinKm: number;
  sex: 'F' | 'M' | 'unspecified';
  ageGroup: '20' | '30' | '40' | '50' | '60' | 'unspecified';
};
export const DEFAULT_PROFILE: RunnerProfile = {
  nickname: '',
  experience: 'beginner',
  paceMinKm: 7,
  sex: 'unspecified',
  ageGroup: 'unspecified',
};
export function parseProfile(raw: string | null): RunnerProfile | null {
  if (raw === null) return null;
  const p: unknown = JSON.parse(raw);
  if (
    !p ||
    typeof p !== 'object' ||
    !('nickname' in p) ||
    typeof p.nickname !== 'string' ||
    p.nickname.trim().length > 20 ||
    !('experience' in p) ||
    !['beginner', 'regular', 'experienced'].includes(String(p.experience)) ||
    !('paceMinKm' in p) ||
    typeof p.paceMinKm !== 'number' ||
    !Number.isFinite(p.paceMinKm) ||
    p.paceMinKm < 3 ||
    p.paceMinKm > 15
  )
    throw new Error('기기 프로필을 읽지 못했어요. 기존 데이터는 유지됩니다.');
  return {
    nickname: p.nickname.trim(),
    experience: p.experience as RunnerProfile['experience'],
    paceMinKm: p.paceMinKm,
    sex:
      'sex' in p && ['F', 'M'].includes(String(p.sex))
        ? (p.sex as RunnerProfile['sex'])
        : 'unspecified',
    ageGroup:
      'ageGroup' in p &&
      ['20', '30', '40', '50', '60'].includes(String(p.ageGroup))
        ? (p.ageGroup as RunnerProfile['ageGroup'])
        : 'unspecified',
  };
}

// Preserve unreadable profile bytes before replacement; a failed backup aborts the write.
export function saveProfile(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  profile: RunnerProfile,
) {
  const raw = JSON.stringify(profile);
  parseProfile(raw);
  const previous = storage.getItem(PROFILE_KEY);
  try {
    parseProfile(previous);
  } catch {
    if (previous !== null)
      storage.setItem(
        `${PROFILE_KEY}:recovery:${crypto.randomUUID()}`,
        previous,
      );
  }
  storage.setItem(PROFILE_KEY, raw);
}
