/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline SVG is the accessible data chart, not a bitmap image. */
import { COURSE_THEMES, type CourseTheme, type Route } from '@/lib/recommender';

export default function RouteTerrain({
  route,
  theme,
}: {
  route: Route;
  theme?: CourseTheme;
}) {
  const t = route.terrain;
  const elevations = t.elevationProfile.filter(
    (p) => p.elevationMeters !== null,
  );
  const low = Math.min(...elevations.map((p) => p.elevationMeters!));
  const high = Math.max(...elevations.map((p) => p.elevationMeters!));
  const range = Math.max(10, high - low);
  const chart = elevations
    .map(
      (p) =>
        `${((p.distanceMeters / route.distanceMeters) * 300).toFixed(1)},${(78 - ((p.elevationMeters! - low) / range) * 62).toFixed(1)}`,
    )
    .join(' ');
  const percent = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <section className="route-terrain">
      <div className="terrain-heading">
        <h2>어떤 길인지, 미리 살펴요</h2>
        <span>지도·지형 추정</span>
      </div>
      {route.targetDifferenceMeters !== null && (
        <p className="distance-match">
          목표 거리보다{' '}
          <strong>
            {(Math.abs(route.targetDifferenceMeters) / 1000).toFixed(2)}km{' '}
            {route.targetDifferenceMeters >= 0 ? '길어요' : '짧아요'}
          </strong>
        </p>
      )}
      {theme && theme !== 'any' && (
        <p className="distance-match">
          <strong>
            {COURSE_THEMES[theme]} 구간{' '}
            {percent((t.themeMatchRatio ?? 0) * t.themeCoverageRatio)}
          </strong>
          <br />
          지도 태그·근접 근거로 분류한 혼합 코스예요.
        </p>
      )}
      <div className="terrain-metrics">
        <div>
          <small>추정 상승</small>
          <strong>
            {t.ascentMeters === null
              ? '미확인'
              : `${Math.round(t.ascentMeters)} m`}
          </strong>
        </div>
        <div>
          <small>추정 최대 경사</small>
          <strong>
            {t.maxGradePercent === null
              ? '미확인'
              : `${t.maxGradePercent.toFixed(1)} %`}
          </strong>
        </div>
        <div>
          <small>경사 추정 구간</small>
          <strong>{percent(t.gradeCoverageRatio)}</strong>
        </div>
      </div>
      {elevations.length > 1 && (
        <figure className="elevation-chart">
          <figcaption>
            <span>주변 지표면 고도</span>
            <span>
              {Math.round(low)}–{Math.round(high)}m
            </span>
          </figcaption>
          <svg
            viewBox="0 0 300 90"
            role="img"
            aria-label={`코스 주변 지표면 고도 ${Math.round(low)}미터부터 ${Math.round(high)}미터까지`}
          >
            <path
              d="M0 78 H300 M0 47 H300 M0 16 H300"
              stroke="#d9e3d5"
              strokeDasharray="3 4"
              fill="none"
            />
            <polyline
              points={chart}
              fill="none"
              stroke="#72984c"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <span>출발</span>
            <span>{(route.distanceMeters / 1000).toFixed(2)}km</span>
          </div>
        </figure>
      )}
      <div className="surface-composition">
        <span style={{ width: percent(t.pavedRatio) }} />
        <span style={{ width: percent(t.unpavedRatio) }} />
      </div>
      <p className="surface-labels">
        <span>포장 {percent(t.pavedRatio)}</span>
        <span>흙·자갈 {percent(t.unpavedRatio)}</span>
        <span>미확인 {percent(1 - t.surfaceCoverageRatio)}</span>
      </p>
      <p className="road-type-labels">
        {Object.entries(t.roadTypes)
          .map(
            ([name, metres]) =>
              `${name} ${percent(metres / route.distanceMeters)}`,
          )
          .join(' · ')}
      </p>
      {t.unknownGradeMeters > 1 && (
        <p className="terrain-warning">
          교량·터널 등 {Math.round(t.unknownGradeMeters)}m는 경사 미확인
          구간이에요.
        </p>
      )}
      <p className="terrain-method">
        공개 지표면 고도 타일을 도로망 주변에서 평활화하고 최소 60m 기준으로
        계산한 추정이에요. 실제 도로 경사와 다를 수 있어요.
      </p>
    </section>
  );
}
