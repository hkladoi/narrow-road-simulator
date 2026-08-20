import type { Polygon, Vec2 } from "@nrs/domain";

import { leftNormal, normalize, subtract } from "./vector";

type Projection = Readonly<{ min: number; max: number }>;

function project(polygon: Polygon, axis: Vec2): Projection {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    const value = point[0] * axis[0] + point[1] * axis[1];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function axesFor(polygon: Polygon): Vec2[] {
  const axes: Vec2[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    if (!current || !next) continue;
    const axis = normalize(leftNormal(subtract(next, current)));
    if (axis[0] !== 0 || axis[1] !== 0) axes.push(axis);
  }
  return axes;
}

export function convexPolygonsIntersect(a: Polygon, b: Polygon, tolerance = 1e-10): boolean {
  for (const axis of [...axesFor(a), ...axesFor(b)]) {
    const projectionA = project(a, axis);
    const projectionB = project(b, axis);
    if (
      projectionA.max < projectionB.min - tolerance ||
      projectionB.max < projectionA.min - tolerance
    ) {
      return false;
    }
  }
  return true;
}
