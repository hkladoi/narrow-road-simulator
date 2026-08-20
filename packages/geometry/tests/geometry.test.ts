import type { Polygon } from "@nrs/domain";
import { describe, expect, it } from "vitest";

import {
  convexPolygonsIntersect,
  normalizeAngle,
  normalizePolygon,
  pointInPolygon,
  polygonDistance,
  rotatePoint,
  signedArea,
  transformPolygon,
  triangulatePolygon,
} from "../src";

const rectangle = (minX: number, minY: number, maxX: number, maxY: number): Polygon => [
  [minX, minY],
  [maxX, minY],
  [maxX, maxY],
  [minX, maxY],
];

describe("angles and transforms", () => {
  it.each([
    [0, [1, 0]],
    [Math.PI / 2, [0, 1]],
    [Math.PI, [-1, 0]],
    [-Math.PI / 2, [0, -1]],
  ] as const)("rotates a point by %f", (angle, expected) => {
    const actual = rotatePoint([1, 0], angle);
    expect(actual[0]).toBeCloseTo(expected[0], 12);
    expect(actual[1]).toBeCloseTo(expected[1], 12);
  });

  it("normalizes arbitrary angles", () => {
    expect(normalizeAngle(5 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-4.5 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  it("transforms a local polygon into world coordinates", () => {
    const result = transformPolygon(rectangle(0, 0, 1, 1), {
      x: 2,
      y: 3,
      heading: Math.PI / 2,
    });
    expect(result[0]).toEqual([2, 3]);
    const secondPoint = result[1];
    expect(secondPoint).toBeDefined();
    if (!secondPoint) throw new Error("Expected a second transformed point.");
    expect(secondPoint[0]).toBeCloseTo(2);
    expect(secondPoint[1]).toBeCloseTo(4);
  });
});

describe("polygon helpers", () => {
  it("treats boundary points as inside", () => {
    expect(pointInPolygon([1, 0], rectangle(0, 0, 2, 2))).toBe(true);
    expect(pointInPolygon([1, 1], rectangle(0, 0, 2, 2))).toBe(true);
    expect(pointInPolygon([3, 1], rectangle(0, 0, 2, 2))).toBe(false);
  });

  it("normalizes clockwise winding and duplicate closing points", () => {
    const normalized = normalizePolygon([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ]);
    expect(normalized).toHaveLength(4);
    expect(signedArea(normalized)).toBeGreaterThan(0);
  });

  it("decomposes a concave polygon into triangles", () => {
    const concave: Polygon = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 0.4],
      [0, 1],
    ];
    const triangles = triangulatePolygon(concave);
    expect(triangles).toHaveLength(3);
    expect(triangles.reduce((sum, triangle) => sum + signedArea(triangle), 0)).toBeCloseTo(
      signedArea(concave),
    );
  });
});

describe("SAT and clearance golden cases", () => {
  it("treats an edge touch as collision", () => {
    expect(convexPolygonsIntersect(rectangle(0, 0, 1, 1), rectangle(1, 0, 2, 1))).toBe(true);
  });

  it("treats a corner touch as collision", () => {
    expect(convexPolygonsIntersect(rectangle(0, 0, 1, 1), rectangle(1, 1, 2, 2))).toBe(true);
  });

  it("preserves a 1 mm gap", () => {
    const a = rectangle(0, 0, 1, 1);
    const b = rectangle(1.001, 0, 2.001, 1);
    expect(convexPolygonsIntersect(a, b)).toBe(false);
    expect(polygonDistance(a, b).distance).toBeCloseTo(0.001, 10);
  });

  it("detects rotated rectangle collision and near-miss", () => {
    const base = rectangle(-1, -0.5, 1, 0.5);
    const rotated = transformPolygon(base, { x: 1.2, y: 0, heading: Math.PI / 4 });
    const miss = transformPolygon(base, { x: 3, y: 0, heading: Math.PI / 4 });
    expect(convexPolygonsIntersect(base, rotated)).toBe(true);
    expect(convexPolygonsIntersect(base, miss)).toBe(false);
    expect(polygonDistance(base, miss).distance).toBeGreaterThan(0);
  });
});
