import type { Polygon, PolygonObstacle, Pose, Vec2, VehicleProfile } from "@nrs/domain";
import {
  aabbIntersects,
  closestPointOnSegment,
  convexPolygonsIntersect,
  interpolateAngle,
  isConvexPolygon,
  polygonAabb,
  polygonDistance,
  triangulatePolygon,
} from "@nrs/geometry";
import {
  VEHICLE_CORNER_ORDER,
  type VehicleCorner,
  vehicleWorldFootprint,
} from "@nrs/vehicle-model";

export type CollisionQuery = Readonly<{
  colliding: boolean;
  clearanceM: number;
  nearestObstacleId?: string;
  nearestVehiclePoint?: Vec2;
  nearestObstaclePoint?: Vec2;
  nearestVehicleCorner?: VehicleCorner;
}>;

function convexPieces(polygon: Polygon): readonly Polygon[] {
  return isConvexPolygon(polygon) ? [polygon] : triangulatePolygon(polygon);
}

function nearestCornerToPolygon(
  footprint: Polygon,
  obstacle: Polygon,
): Readonly<{ corner: VehicleCorner; vehiclePoint: Vec2; obstaclePoint: Vec2; distance: number }> {
  let best:
    | Readonly<{ corner: VehicleCorner; vehiclePoint: Vec2; obstaclePoint: Vec2; distance: number }>
    | undefined;
  for (let cornerIndex = 0; cornerIndex < footprint.length; cornerIndex += 1) {
    const vehiclePoint = footprint[cornerIndex];
    const corner = VEHICLE_CORNER_ORDER[cornerIndex];
    if (!vehiclePoint || !corner) continue;
    for (let edgeIndex = 0; edgeIndex < obstacle.length; edgeIndex += 1) {
      const start = obstacle[edgeIndex];
      const end = obstacle[(edgeIndex + 1) % obstacle.length];
      if (!start || !end) continue;
      const nearest = closestPointOnSegment(vehiclePoint, start, end);
      if (!best || nearest.distance < best.distance) {
        best = { corner, vehiclePoint, obstaclePoint: nearest.point, distance: nearest.distance };
      }
    }
  }
  if (!best) throw new Error("Cannot calculate a nearest vehicle corner for an empty polygon.");
  return best;
}

export function queryFootprintCollision(
  footprint: Polygon,
  obstacles: readonly PolygonObstacle[],
): CollisionQuery {
  const footprintAabb = polygonAabb(footprint);
  let colliding = false;
  let clearanceM = Number.POSITIVE_INFINITY;
  let nearestObstacleId: string | undefined;
  let nearestVehiclePoint: Vec2 | undefined;
  let nearestObstaclePoint: Vec2 | undefined;
  let nearestVehicleCorner: VehicleCorner | undefined;

  for (const obstacle of obstacles) {
    const obstacleAabb = polygonAabb(obstacle.polygon);
    let obstacleCollision = false;
    if (aabbIntersects(footprintAabb, obstacleAabb)) {
      for (const piece of convexPieces(obstacle.polygon)) {
        if (convexPolygonsIntersect(footprint, piece)) {
          obstacleCollision = true;
          colliding = true;
          break;
        }
      }
    }

    const nearest = polygonDistance(footprint, obstacle.polygon);
    const corner = nearestCornerToPolygon(footprint, obstacle.polygon);
    const candidateClearance = obstacleCollision ? 0 : nearest.distance;
    if (candidateClearance < clearanceM) {
      clearanceM = candidateClearance;
      nearestObstacleId = obstacle.id;
      nearestVehiclePoint = nearest.pointA;
      nearestObstaclePoint = nearest.pointB;
      nearestVehicleCorner = corner.corner;
    }
  }

  if (nearestObstacleId === undefined)
    return { colliding: false, clearanceM: Number.POSITIVE_INFINITY };
  if (!nearestVehiclePoint || !nearestObstaclePoint || !nearestVehicleCorner) {
    throw new Error("Collision query produced incomplete nearest-feature metadata.");
  }
  return {
    colliding,
    clearanceM,
    nearestObstacleId,
    nearestVehiclePoint,
    nearestObstaclePoint,
    nearestVehicleCorner,
  };
}

export function queryVehicleCollision(
  profile: VehicleProfile,
  pose: Pose,
  obstacles: readonly PolygonObstacle[],
): CollisionQuery {
  return queryFootprintCollision(vehicleWorldFootprint(profile, pose), obstacles);
}

export type ClampedPose = Readonly<{
  pose: Pose;
  collision: CollisionQuery;
  fraction: number;
}>;

function interpolatePose(start: Pose, end: Pose, amount: number): Pose {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
    heading: interpolateAngle(start.heading, end.heading, amount),
  };
}

export function clampPoseBeforeCollision(
  profile: VehicleProfile,
  start: Pose,
  proposed: Pose,
  obstacles: readonly PolygonObstacle[],
  iterations = 24,
): ClampedPose {
  const startCollision = queryVehicleCollision(profile, start, obstacles);
  if (startCollision.colliding) return { pose: start, collision: startCollision, fraction: 0 };
  const endCollision = queryVehicleCollision(profile, proposed, obstacles);
  if (!endCollision.colliding) return { pose: proposed, collision: endCollision, fraction: 1 };

  let safeFraction = 0;
  let collidingFraction = 1;
  let safePose = start;
  let safeCollision = startCollision;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const midpoint = (safeFraction + collidingFraction) / 2;
    const candidate = interpolatePose(start, proposed, midpoint);
    const collision = queryVehicleCollision(profile, candidate, obstacles);
    if (collision.colliding) {
      collidingFraction = midpoint;
    } else {
      safeFraction = midpoint;
      safePose = candidate;
      safeCollision = collision;
    }
  }
  return {
    pose: safePose,
    collision: { ...safeCollision, colliding: true, clearanceM: 0 },
    fraction: safeFraction,
  };
}
