import type { Polygon, Vec2 } from "@nrs/domain";

import { pointInPolygon } from "./polygon";
import { segmentSegmentDistance } from "./segment";

export type PolygonNearest = Readonly<{
  distance: number;
  pointA: Vec2;
  pointB: Vec2;
  edgeA: number;
  edgeB: number;
}>;

export function polygonDistance(a: Polygon, b: Polygon): PolygonNearest {
  if (a.length < 2 || b.length < 2) throw new Error("Polygon distance requires valid polygons.");
  let best: PolygonNearest | undefined;
  for (let edgeA = 0; edgeA < a.length; edgeA += 1) {
    const aStart = a[edgeA];
    const aEnd = a[(edgeA + 1) % a.length];
    if (!aStart || !aEnd) continue;
    for (let edgeB = 0; edgeB < b.length; edgeB += 1) {
      const bStart = b[edgeB];
      const bEnd = b[(edgeB + 1) % b.length];
      if (!bStart || !bEnd) continue;
      const candidate = segmentSegmentDistance(aStart, aEnd, bStart, bEnd);
      if (!best || candidate.distance < best.distance) {
        best = { ...candidate, edgeA, edgeB };
      }
    }
  }
  if (!best) throw new Error("Unable to calculate polygon distance.");
  const firstA = a[0];
  const firstB = b[0];
  if (!firstA || !firstB) throw new Error("Polygon distance requires non-empty polygons.");
  if (best.distance === 0 || pointInPolygon(firstA, b) || pointInPolygon(firstB, a)) {
    return { ...best, distance: 0 };
  }
  return best;
}
