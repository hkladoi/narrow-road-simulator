import type { Polygon, Vec2 } from "@nrs/domain";

import { EPSILON, cross, subtract, vecAlmostEqual } from "./vector";

export function signedArea(polygon: Polygon): number {
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    if (!current || !next) continue;
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return sum / 2;
}

export function normalizePolygon(polygon: Polygon): Polygon {
  const cleaned: Vec2[] = [];
  for (const point of polygon) {
    const last = cleaned.at(-1);
    if (!last || !vecAlmostEqual(last, point)) cleaned.push(point);
  }
  const first = cleaned[0];
  const last = cleaned.at(-1);
  if (first && last && cleaned.length > 1 && vecAlmostEqual(first, last)) cleaned.pop();
  if (cleaned.length < 3) throw new Error("A polygon requires at least three distinct points.");
  return signedArea(cleaned) < 0 ? cleaned.toReversed() : cleaned;
}

export function pointOnPolygonBoundary(
  point: Vec2,
  polygon: Polygon,
  tolerance = EPSILON,
): boolean {
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (!start || !end) continue;
    const edge = subtract(end, start);
    const relative = subtract(point, start);
    if (Math.abs(cross(edge, relative)) > tolerance) continue;
    const withinX =
      point[0] >= Math.min(start[0], end[0]) - tolerance &&
      point[0] <= Math.max(start[0], end[0]) + tolerance;
    const withinY =
      point[1] >= Math.min(start[1], end[1]) - tolerance &&
      point[1] <= Math.max(start[1], end[1]) + tolerance;
    if (withinX && withinY) return true;
  }
  return false;
}

export function pointInPolygon(point: Vec2, polygon: Polygon): boolean {
  if (pointOnPolygonBoundary(point, polygon)) return true;
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (!current || !prior) continue;
    const intersects =
      current[1] > point[1] !== prior[1] > point[1] &&
      point[0] <
        ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isConvexPolygon(polygon: Polygon): boolean {
  const normalized = normalizePolygon(polygon);
  let sign = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const a = normalized[index];
    const b = normalized[(index + 1) % normalized.length];
    const c = normalized[(index + 2) % normalized.length];
    if (!a || !b || !c) continue;
    const value = cross(subtract(b, a), subtract(c, b));
    if (Math.abs(value) <= EPSILON) continue;
    const currentSign = Math.sign(value);
    if (sign === 0) sign = currentSign;
    else if (currentSign !== sign) return false;
  }
  return true;
}

function isEar(previous: Vec2, current: Vec2, next: Vec2, remaining: Vec2[]): boolean {
  if (cross(subtract(current, previous), subtract(next, current)) <= EPSILON) return false;
  const triangle: Polygon = [previous, current, next];
  return !remaining.some(
    (point) =>
      point !== previous && point !== current && point !== next && pointInPolygon(point, triangle),
  );
}

export function triangulatePolygon(polygon: Polygon): readonly Polygon[] {
  const remaining = [...normalizePolygon(polygon)];
  const triangles: Polygon[] = [];
  let guard = remaining.length * remaining.length;
  while (remaining.length > 3 && guard > 0) {
    let clipped = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const previous = remaining[(index - 1 + remaining.length) % remaining.length];
      const current = remaining[index];
      const next = remaining[(index + 1) % remaining.length];
      if (!previous || !current || !next || !isEar(previous, current, next, remaining)) continue;
      triangles.push([previous, current, next]);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error("Polygon could not be decomposed; check for self-intersection.");
    guard -= 1;
  }
  if (remaining.length === 3) triangles.push(remaining);
  return triangles;
}
