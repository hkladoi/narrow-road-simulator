import type { Polygon, Vec2 } from "@nrs/domain";

export type Aabb = Readonly<{
  min: Vec2;
  max: Vec2;
}>;

export function polygonAabb(polygon: Polygon): Aabb {
  if (polygon.length === 0) throw new Error("Cannot calculate an AABB for an empty polygon.");
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { min: [minX, minY], max: [maxX, maxY] };
}

export function aabbIntersects(a: Aabb, b: Aabb, tolerance = 0): boolean {
  return !(
    a.max[0] < b.min[0] - tolerance ||
    b.max[0] < a.min[0] - tolerance ||
    a.max[1] < b.min[1] - tolerance ||
    b.max[1] < a.min[1] - tolerance
  );
}

export function expandAabb(aabb: Aabb, amount: number): Aabb {
  return {
    min: [aabb.min[0] - amount, aabb.min[1] - amount],
    max: [aabb.max[0] + amount, aabb.max[1] + amount],
  };
}
