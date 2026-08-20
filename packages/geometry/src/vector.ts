import type { Vec2 } from "@nrs/domain";

export const EPSILON = 1e-10;

export function add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function scale(vector: Vec2, scalar: number): Vec2 {
  return [vector[0] * scalar, vector[1] * scalar];
}

export function dot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function cross(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

export function lengthSquared(vector: Vec2): number {
  return dot(vector, vector);
}

export function length(vector: Vec2): number {
  return Math.sqrt(lengthSquared(vector));
}

export function distance(a: Vec2, b: Vec2): number {
  return length(subtract(a, b));
}

export function normalize(vector: Vec2): Vec2 {
  const magnitude = length(vector);
  if (magnitude <= EPSILON) return [0, 0];
  return scale(vector, 1 / magnitude);
}

export function leftNormal(vector: Vec2): Vec2 {
  return [-vector[1], vector[0]];
}

export function almostEqual(a: number, b: number, tolerance = EPSILON): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function vecAlmostEqual(a: Vec2, b: Vec2, tolerance = EPSILON): boolean {
  return almostEqual(a[0], b[0], tolerance) && almostEqual(a[1], b[1], tolerance);
}
