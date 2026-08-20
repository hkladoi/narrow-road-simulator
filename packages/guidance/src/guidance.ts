import type { MotionDirection, Trajectory, TrajectoryPoint } from "@nrs/planner";

export type SteeringIntent = "left" | "straight" | "right";

export type GuidanceStep = Readonly<{
  index: number;
  startPointIndex: number;
  endPointIndex: number;
  direction: MotionDirection;
  steering: SteeringIntent;
  distanceM: number;
  durationS: number;
  instructionVi: string;
}>;

export type GuidanceOptions = Readonly<{
  straightThresholdRad: number;
  mergeSteeringToleranceRad: number;
  shortSegmentM: number;
}>;

export const DEFAULT_GUIDANCE_OPTIONS: GuidanceOptions = {
  straightThresholdRad: (3 * Math.PI) / 180,
  mergeSteeringToleranceRad: (5 * Math.PI) / 180,
  shortSegmentM: 0.35,
};

function steeringIntent(steeringRad: number, threshold: number): SteeringIntent {
  if (steeringRad > threshold) return "left";
  if (steeringRad < -threshold) return "right";
  return "straight";
}

function pointDistance(from: TrajectoryPoint, to: TrajectoryPoint): number {
  return Math.hypot(to.pose.x - from.pose.x, to.pose.y - from.pose.y);
}

function formatMeters(distanceM: number): string {
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: distanceM < 1 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(distanceM);
}

function wording(direction: MotionDirection, steering: SteeringIntent, distanceM: number): string {
  const movement = direction === "forward" ? "Tiến" : "Lùi";
  const distance = `${formatMeters(distanceM)} m`;
  if (steering === "straight") return `${movement} thẳng ${distance}.`;
  const side = steering === "left" ? "trái" : "phải";
  return `${movement} và giữ lái sang ${side} trong ${distance}.`;
}

type MutableStep = {
  startPointIndex: number;
  endPointIndex: number;
  direction: MotionDirection;
  steering: SteeringIntent;
  representativeSteeringRad: number;
  distanceM: number;
  durationS: number;
};

export function buildGuidance(
  trajectory: Trajectory,
  options: Partial<GuidanceOptions> = {},
): readonly GuidanceStep[] {
  const config = { ...DEFAULT_GUIDANCE_OPTIONS, ...options };
  if (trajectory.points.length < 2) return [];
  const segments: MutableStep[] = [];
  for (let index = 1; index < trajectory.points.length; index += 1) {
    const previous = trajectory.points[index - 1];
    const point = trajectory.points[index];
    if (!previous || !point) continue;
    const intent = steeringIntent(point.steeringRad, config.straightThresholdRad);
    const last = segments.at(-1);
    const canMerge =
      last?.direction === point.direction &&
      last.steering === intent &&
      Math.abs(last.representativeSteeringRad - point.steeringRad) <=
        config.mergeSteeringToleranceRad;
    const distanceM = pointDistance(previous, point);
    const durationS = Math.max(0, point.elapsedS - previous.elapsedS);
    if (canMerge) {
      last.endPointIndex = index;
      last.distanceM += distanceM;
      last.durationS += durationS;
      last.representativeSteeringRad = (last.representativeSteeringRad + point.steeringRad) / 2;
    } else {
      segments.push({
        startPointIndex: index - 1,
        endPointIndex: index,
        direction: point.direction,
        steering: intent,
        representativeSteeringRad: point.steeringRad,
        distanceM,
        durationS,
      });
    }
  }

  for (let index = 1; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const previous = segments[index - 1];
    const next = segments[index + 1];
    if (
      segment &&
      previous &&
      next &&
      segment.distanceM < config.shortSegmentM &&
      previous.direction === next.direction &&
      previous.steering === next.steering
    ) {
      previous.endPointIndex = next.endPointIndex;
      previous.distanceM += segment.distanceM + next.distanceM;
      previous.durationS += segment.durationS + next.durationS;
      segments.splice(index, 2);
      index -= 1;
    }
  }

  return segments.map((segment, index) => ({
    index,
    startPointIndex: segment.startPointIndex,
    endPointIndex: segment.endPointIndex,
    direction: segment.direction,
    steering: segment.steering,
    distanceM: segment.distanceM,
    durationS: segment.durationS,
    instructionVi: wording(segment.direction, segment.steering, segment.distanceM),
  }));
}
