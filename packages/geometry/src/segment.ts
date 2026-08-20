import type { Vec2 } from "@nrs/domain";

import { EPSILON, add, cross, distance, dot, scale, subtract } from "./vector";

export type SegmentNearest = Readonly<{
  distance: number;
  point: Vec2;
  t: number;
}>;

export function closestPointOnSegment(point: Vec2, start: Vec2, end: Vec2): SegmentNearest {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);
  if (lengthSquared <= EPSILON) return { distance: distance(point, start), point: start, t: 0 };
  const t = Math.max(0, Math.min(1, dot(subtract(point, start), segment) / lengthSquared));
  const nearest = add(start, scale(segment, t));
  return { distance: distance(point, nearest), point: nearest, t };
}

export function segmentIntersectionPoint(
  aStart: Vec2,
  aEnd: Vec2,
  bStart: Vec2,
  bEnd: Vec2,
): Vec2 | undefined {
  const r = subtract(aEnd, aStart);
  const s = subtract(bEnd, bStart);
  const denominator = cross(r, s);
  const offset = subtract(bStart, aStart);

  if (Math.abs(denominator) <= EPSILON) {
    const candidates = [aStart, aEnd, bStart, bEnd];
    for (const point of candidates) {
      if (
        closestPointOnSegment(point, aStart, aEnd).distance <= EPSILON &&
        closestPointOnSegment(point, bStart, bEnd).distance <= EPSILON
      ) {
        return point;
      }
    }
    return undefined;
  }

  const t = cross(offset, s) / denominator;
  const u = cross(offset, r) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) {
    return undefined;
  }
  return add(aStart, scale(r, t));
}

export type SegmentPairNearest = Readonly<{
  distance: number;
  pointA: Vec2;
  pointB: Vec2;
}>;

export function segmentSegmentDistance(
  aStart: Vec2,
  aEnd: Vec2,
  bStart: Vec2,
  bEnd: Vec2,
): SegmentPairNearest {
  const intersection = segmentIntersectionPoint(aStart, aEnd, bStart, bEnd);
  if (intersection) return { distance: 0, pointA: intersection, pointB: intersection };

  const candidates: SegmentPairNearest[] = [];
  const aStartNearest = closestPointOnSegment(aStart, bStart, bEnd);
  candidates.push({
    distance: aStartNearest.distance,
    pointA: aStart,
    pointB: aStartNearest.point,
  });
  const aEndNearest = closestPointOnSegment(aEnd, bStart, bEnd);
  candidates.push({ distance: aEndNearest.distance, pointA: aEnd, pointB: aEndNearest.point });
  const bStartNearest = closestPointOnSegment(bStart, aStart, aEnd);
  candidates.push({
    distance: bStartNearest.distance,
    pointA: bStartNearest.point,
    pointB: bStart,
  });
  const bEndNearest = closestPointOnSegment(bEnd, aStart, aEnd);
  candidates.push({ distance: bEndNearest.distance, pointA: bEndNearest.point, pointB: bEnd });
  return candidates.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  );
}
