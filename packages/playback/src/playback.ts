import type { Pose } from "@nrs/domain";
import { interpolateAngle } from "@nrs/geometry";
import type { MotionDirection, Trajectory } from "@nrs/planner";

export type PlaybackSample = Readonly<{
  pose: Pose;
  direction: MotionDirection;
  steeringRad: number;
  elapsedS: number;
  progress: number;
  pointIndex: number;
}>;

export function sampleTrajectory(
  trajectory: Trajectory,
  elapsedS: number,
): PlaybackSample | undefined {
  const first = trajectory.points[0];
  if (!first) return undefined;
  const clampedTime = Math.max(0, Math.min(elapsedS, trajectory.estimatedDurationS));
  const progress =
    trajectory.estimatedDurationS > 0 ? clampedTime / trajectory.estimatedDurationS : 1;
  const nextIndex = trajectory.points.findIndex((point) => point.elapsedS >= clampedTime);
  if (nextIndex <= 0) {
    return { ...first, elapsedS: clampedTime, progress, pointIndex: 0 };
  }
  const next = trajectory.points[nextIndex];
  const previous = trajectory.points[nextIndex - 1];
  if (!next || !previous) return { ...first, elapsedS: clampedTime, progress, pointIndex: 0 };
  const duration = next.elapsedS - previous.elapsedS;
  const amount = duration <= 0 ? 1 : (clampedTime - previous.elapsedS) / duration;
  return {
    pose: {
      x: previous.pose.x + (next.pose.x - previous.pose.x) * amount,
      y: previous.pose.y + (next.pose.y - previous.pose.y) * amount,
      heading: interpolateAngle(previous.pose.heading, next.pose.heading, amount),
    },
    direction: next.direction,
    steeringRad: previous.steeringRad + (next.steeringRad - previous.steeringRad) * amount,
    elapsedS: clampedTime,
    progress,
    pointIndex: nextIndex,
  };
}

export function playbackTimeAfterTick(
  currentS: number,
  deltaS: number,
  speed: number,
  durationS: number,
  loop = false,
): number {
  if (deltaS < 0 || speed < 0) throw new Error("deltaS and speed must be non-negative.");
  const next = currentS + deltaS * speed;
  if (loop && durationS > 0) return next % durationS;
  return Math.min(durationS, next);
}
