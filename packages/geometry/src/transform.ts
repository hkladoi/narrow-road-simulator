import type { Polygon, Pose, Vec2 } from "@nrs/domain";

export function rotatePoint(point: Vec2, angle: number): Vec2 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [point[0] * cosine - point[1] * sine, point[0] * sine + point[1] * cosine];
}

export function transformPoint(point: Vec2, pose: Pose): Vec2 {
  const rotated = rotatePoint(point, pose.heading);
  return [rotated[0] + pose.x, rotated[1] + pose.y];
}

export function inverseTransformPoint(point: Vec2, pose: Pose): Vec2 {
  return rotatePoint([point[0] - pose.x, point[1] - pose.y], -pose.heading);
}

export function transformPolygon(polygon: Polygon, pose: Pose): Polygon {
  return polygon.map((point) => transformPoint(point, pose));
}
