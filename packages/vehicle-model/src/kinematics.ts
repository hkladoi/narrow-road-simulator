import type { Pose, VehicleProfile } from "@nrs/domain";
import { normalizeAngle } from "@nrs/geometry";

const STRAIGHT_STEER_EPSILON = 1e-9;

export function clampSteering(steeringRad: number, maxSteerRad: number): number {
  return Math.max(-maxSteerRad, Math.min(maxSteerRad, steeringRad));
}

export function turningRadiusM(wheelbaseM: number, steeringRad: number): number {
  if (Math.abs(steeringRad) <= STRAIGHT_STEER_EPSILON) return Number.POSITIVE_INFINITY;
  return Math.abs(wheelbaseM / Math.tan(steeringRad));
}

export function integrateBicycle(
  pose: Pose,
  signedVelocityMps: number,
  steeringRad: number,
  wheelbaseM: number,
  deltaTimeS: number,
): Pose {
  if (deltaTimeS < 0) throw new Error("deltaTimeS must be non-negative.");
  if (wheelbaseM <= 0) throw new Error("wheelbaseM must be positive.");
  if (Math.abs(signedVelocityMps) <= Number.EPSILON || deltaTimeS === 0) return pose;

  if (Math.abs(steeringRad) <= STRAIGHT_STEER_EPSILON) {
    const distance = signedVelocityMps * deltaTimeS;
    return {
      x: pose.x + distance * Math.cos(pose.heading),
      y: pose.y + distance * Math.sin(pose.heading),
      heading: pose.heading,
    };
  }

  const angularVelocity = (signedVelocityMps / wheelbaseM) * Math.tan(steeringRad);
  const nextHeadingRaw = pose.heading + angularVelocity * deltaTimeS;
  const signedRadius = signedVelocityMps / angularVelocity;
  return {
    x: pose.x + signedRadius * (Math.sin(nextHeadingRaw) - Math.sin(pose.heading)),
    y: pose.y - signedRadius * (Math.cos(nextHeadingRaw) - Math.cos(pose.heading)),
    heading: normalizeAngle(nextHeadingRaw),
  };
}

export function integrateVehicle(
  pose: Pose,
  profile: VehicleProfile,
  signedVelocityMps: number,
  steeringRad: number,
  deltaTimeS: number,
): Pose {
  return integrateBicycle(
    pose,
    signedVelocityMps,
    clampSteering(steeringRad, profile.maxSteerRad),
    profile.wheelbaseM,
    deltaTimeS,
  );
}
