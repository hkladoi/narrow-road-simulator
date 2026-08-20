import type { Pose } from "@nrs/domain";
import { angleDifference } from "@nrs/geometry";

import type { MotionDirection } from "./contracts";

export type ReedsSheppStraightShot = Readonly<{
  family: "S+" | "S-";
  direction: MotionDirection;
  distanceM: number;
}>;

/**
 * Recognizes the exact straight-line families of a Reeds–Shepp path. S+ is a
 * forward segment and S- is a reverse segment. Curved/cusp families fall back
 * to Hybrid A* so this optimization cannot weaken completeness or safety.
 */
export function classifyReedsSheppStraightShot(
  start: Pose,
  target: Pose,
  angularToleranceRad = 0.035,
): ReedsSheppStraightShot | undefined {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const distanceM = Math.hypot(dx, dy);
  if (distanceM < 1e-9) return undefined;
  if (Math.abs(angleDifference(start.heading, target.heading)) > angularToleranceRad)
    return undefined;
  const bearing = Math.atan2(dy, dx);
  if (Math.abs(angleDifference(start.heading, bearing)) <= angularToleranceRad) {
    return { family: "S+", direction: "forward", distanceM };
  }
  if (Math.abs(angleDifference(start.heading + Math.PI, bearing)) <= angularToleranceRad) {
    return { family: "S-", direction: "reverse", distanceM };
  }
  return undefined;
}
