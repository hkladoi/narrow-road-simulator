import {
  clampPoseBeforeCollision,
  queryVehicleCollision,
  type CollisionQuery,
} from "@nrs/collision";
import type { PolygonObstacle, Pose, VehicleProfile } from "@nrs/domain";
import { clampSteering, integrateVehicle } from "@nrs/vehicle-model";

export type Gear = "D" | "R";

export type ManualControlInput = Readonly<{
  gear: Gear;
  throttle: number;
  brake: boolean;
  steer: number;
}>;

export type SimulatorSettings = Readonly<{
  fixedStepS: number;
  maxForwardSpeedMps: number;
  maxReverseSpeedMps: number;
  accelerationMps2: number;
  brakingMps2: number;
  steeringRateRadPerS: number;
}>;

export const DEFAULT_SIMULATOR_SETTINGS: SimulatorSettings = {
  fixedStepS: 0.025,
  maxForwardSpeedMps: 1.5,
  maxReverseSpeedMps: 1,
  accelerationMps2: 1.4,
  brakingMps2: 3,
  steeringRateRadPerS: 1.8,
};

export type ManualSimulationState = Readonly<{
  pose: Pose;
  speedMps: number;
  steeringRad: number;
  gear: Gear;
  elapsedS: number;
  collision: CollisionQuery;
}>;

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return current;
}

export function createManualSimulationState(
  profile: VehicleProfile,
  pose: Pose,
  obstacles: readonly PolygonObstacle[] = [],
): ManualSimulationState {
  return {
    pose,
    speedMps: 0,
    steeringRad: 0,
    gear: "D",
    elapsedS: 0,
    collision: queryVehicleCollision(profile, pose, obstacles),
  };
}

function stepFixed(
  state: ManualSimulationState,
  input: ManualControlInput,
  profile: VehicleProfile,
  obstacles: readonly PolygonObstacle[],
  settings: SimulatorSettings,
  deltaTimeS: number,
): ManualSimulationState {
  const direction = input.gear === "D" ? 1 : -1;
  const speedLimit = input.gear === "D" ? settings.maxForwardSpeedMps : settings.maxReverseSpeedMps;
  const targetSpeed = input.brake
    ? 0
    : direction * Math.max(0, Math.min(1, input.throttle)) * speedLimit;
  const speedRate = input.brake ? settings.brakingMps2 : settings.accelerationMps2;
  const speedMps = approach(state.speedMps, targetSpeed, speedRate * deltaTimeS);
  const targetSteering = clampSteering(
    Math.max(-1, Math.min(1, input.steer)) * profile.maxSteerRad,
    profile.maxSteerRad,
  );
  const steeringRad = approach(
    state.steeringRad,
    targetSteering,
    settings.steeringRateRadPerS * deltaTimeS,
  );
  const proposedPose = integrateVehicle(state.pose, profile, speedMps, steeringRad, deltaTimeS);
  const clamped = clampPoseBeforeCollision(profile, state.pose, proposedPose, obstacles);
  return {
    pose: clamped.pose,
    speedMps: clamped.fraction < 1 ? 0 : speedMps,
    steeringRad,
    gear: input.gear,
    elapsedS: state.elapsedS + deltaTimeS,
    collision: clamped.collision,
  };
}

export function stepManualSimulation(
  state: ManualSimulationState,
  input: ManualControlInput,
  profile: VehicleProfile,
  obstacles: readonly PolygonObstacle[],
  elapsedS: number,
  settings: SimulatorSettings = DEFAULT_SIMULATOR_SETTINGS,
): ManualSimulationState {
  if (elapsedS < 0) throw new Error("elapsedS must be non-negative.");
  let remaining = elapsedS;
  let next = state;
  while (remaining > 1e-12) {
    const deltaTimeS = Math.min(settings.fixedStepS, remaining);
    next = stepFixed(next, input, profile, obstacles, settings, deltaTimeS);
    remaining -= deltaTimeS;
  }
  return next;
}
