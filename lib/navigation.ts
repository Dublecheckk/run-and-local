import { distanceMeters, type Coordinate } from './recommender.ts';
export type MapPosition = {
  point: Coordinate;
  accuracy: number;
  timestamp: number;
};
export function readMapPosition(
  position: {
    coords: { longitude: number; latitude: number; accuracy: number };
    timestamp: number;
  },
  now: number,
): MapPosition | null {
  if (!position?.coords) return null;
  const { longitude, latitude, accuracy } = position.coords;
  if (
    ![longitude, latitude, accuracy, position.timestamp].every(
      Number.isFinite,
    ) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90 ||
    accuracy < 0 ||
    accuracy > 100 ||
    now - position.timestamp > 30000 ||
    position.timestamp - now > 10000
  )
    return null;
  return {
    point: [longitude, latitude],
    accuracy,
    timestamp: position.timestamp,
  };
}
// Local projection within the Seongsu pilot; proximity is not travelled distance or arrival detection.
export function distanceToCourse(
  point: Coordinate,
  geometry: Coordinate[],
): number {
  let nearest = Infinity;
  const cos = Math.cos((point[1] * Math.PI) / 180);
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1],
      b = geometry[i],
      dx = (b[0] - a[0]) * cos,
      dy = b[1] - a[1];
    const scale = dx * dx + dy * dy;
    const t = scale
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * cos * dx + (point[1] - a[1]) * dy) / scale,
          ),
        )
      : 0;
    nearest = Math.min(
      nearest,
      distanceMeters(point, [
        a[0] + t * (b[0] - a[0]),
        a[1] + t * (b[1] - a[1]),
      ]),
    );
  }
  return nearest;
}

export function courseDirections(
  geometry: Coordinate[],
  until = geometry.length - 1,
) {
  const spacing = Math.max(
    160,
    geometry
      .slice(1)
      .reduce((sum, p, i) => sum + distanceMeters(geometry[i], p), 0) / 18,
  );
  const arrows: { point: Coordinate; bearing: number }[] = [];
  let carry = 0;
  for (let i = 1; i <= Math.min(until, geometry.length - 1); i++) {
    const a = geometry[i - 1],
      b = geometry[i],
      length = distanceMeters(a, b);
    if (length < 0.1) continue;
    let offset = spacing - carry;
    while (offset <= length) {
      const t = offset / length;
      arrows.push({
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        bearing:
          (Math.atan2(
            (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180),
            b[1] - a[1],
          ) *
            180) /
          Math.PI,
      });
      offset += spacing;
    }
    carry = (carry + length) % spacing;
  }
  return arrows;
}
