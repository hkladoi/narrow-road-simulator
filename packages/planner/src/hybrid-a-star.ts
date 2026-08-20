import { queryVehicleCollision } from "@nrs/collision";
import type { Goal, Pose, VehicleProfile } from "@nrs/domain";
import { angleDifference, pointInPolygon } from "@nrs/geometry";
import { integrateVehicle, validateVehicleProfile } from "@nrs/vehicle-model";

import type {
  CancellationSignal,
  MotionDirection,
  PlannerConfig,
  PlannerMetrics,
  PlannerRequest,
  PlannerResult,
  Trajectory,
  TrajectoryPoint,
} from "./contracts";
import { classifyReedsSheppStraightShot } from "./reeds-shepp";

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  spatialResolutionM: 0.35,
  headingBins: 72,
  primitiveLengthM: 0.55,
  collisionSampleM: 0.12,
  maxNodes: 120_000,
  timeoutMs: 8_000,
  goalPositionToleranceM: 0.35,
  goalHeadingToleranceRad: (8 * Math.PI) / 180,
  reversePenalty: 1.35,
  gearChangePenalty: 2.2,
  steeringPenalty: 0.25,
  steeringChangePenalty: 0.3,
  safetyMarginM: 0.15,
  nominalSpeedMps: 0.8,
};

type SearchNode = {
  pose: Pose;
  direction: MotionDirection;
  steeringRad: number;
  distanceM: number;
  g: number;
  f: number;
  parent?: SearchNode;
};

type MutableMetrics = {
  expandedNodes: number;
  generatedNodes: number;
  analyticConnections: number;
};

function expandedProfile(profile: VehicleProfile, marginM: number): VehicleProfile {
  return {
    ...profile,
    lengthM: profile.lengthM + 2 * marginM,
    widthM: profile.widthM + 2 * marginM,
    frontOverhangM: profile.frontOverhangM + marginM,
    rearOverhangM: profile.rearOverhangM + marginM,
  };
}

function goalPose(goal: Goal): Pose {
  if (goal.type === "pose") return { x: goal.x, y: goal.y, heading: goal.heading };
  const center = goal.polygon.reduce(
    (sum, point) => ({ x: sum.x + point[0], y: sum.y + point[1] }),
    { x: 0, y: 0 },
  );
  return {
    x: center.x / goal.polygon.length,
    y: center.y / goal.polygon.length,
    heading: goal.heading ?? 0,
  };
}

function reachedGoal(pose: Pose, goal: Goal, config: PlannerConfig): boolean {
  if (goal.type === "region") {
    if (!pointInPolygon([pose.x, pose.y], goal.polygon)) return false;
    return goal.heading === undefined
      ? true
      : Math.abs(angleDifference(pose.heading, goal.heading)) <=
          (goal.headingToleranceRad ?? config.goalHeadingToleranceRad);
  }
  const positionTolerance = goal.positionToleranceM || config.goalPositionToleranceM;
  const headingTolerance = goal.headingToleranceRad || config.goalHeadingToleranceRad;
  return (
    Math.hypot(pose.x - goal.x, pose.y - goal.y) <= positionTolerance &&
    Math.abs(angleDifference(pose.heading, goal.heading)) <= headingTolerance
  );
}

function heuristic(pose: Pose, goal: Goal): number {
  const target = goalPose(goal);
  return (
    Math.hypot(target.x - pose.x, target.y - pose.y) +
    0.45 * Math.abs(angleDifference(pose.heading, target.heading))
  );
}

function stateKey(node: SearchNode, config: PlannerConfig): string {
  const x = Math.round(node.pose.x / config.spatialResolutionM);
  const y = Math.round(node.pose.y / config.spatialResolutionM);
  const wrapped = ((node.pose.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const heading = Math.round((wrapped / (2 * Math.PI)) * config.headingBins) % config.headingBins;
  return [x, y, heading, node.direction].join(":");
}

function isMotionCollisionFree(
  from: Pose,
  direction: MotionDirection,
  steeringRad: number,
  request: PlannerRequest,
  profile: VehicleProfile,
  config: PlannerConfig,
): Pose | undefined {
  const sampleCount = Math.max(2, Math.ceil(config.primitiveLengthM / config.collisionSampleM));
  let pose = from;
  const signedSpeed = direction === "forward" ? config.nominalSpeedMps : -config.nominalSpeedMps;
  const stepTime = config.primitiveLengthM / sampleCount / config.nominalSpeedMps;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    pose = integrateVehicle(pose, request.vehicle, signedSpeed, steeringRad, stepTime);
    if (queryVehicleCollision(profile, pose, request.obstacles).colliding) return undefined;
  }
  return pose;
}

function reconstruct(last: SearchNode, config: PlannerConfig): Trajectory {
  const nodes: SearchNode[] = [];
  let cursor: SearchNode | undefined = last;
  while (cursor) {
    nodes.push(cursor);
    cursor = cursor.parent;
  }
  nodes.reverse();
  let elapsedS = 0;
  const points: TrajectoryPoint[] = nodes.map((node, index) => {
    if (index > 0) elapsedS += config.primitiveLengthM / config.nominalSpeedMps;
    return {
      pose: node.pose,
      direction: node.direction,
      steeringRad: node.steeringRad,
      distanceM: node.distanceM,
      elapsedS,
    };
  });
  return {
    version: 1,
    points,
    totalDistanceM: last.distanceM,
    estimatedDurationS: elapsedS,
  };
}

function tryReedsSheppStraightConnection(
  current: SearchNode,
  request: PlannerRequest,
  safeProfile: VehicleProfile,
  config: PlannerConfig,
): SearchNode | undefined {
  if (request.goal.type !== "pose") return undefined;
  const target = { x: request.goal.x, y: request.goal.y, heading: request.goal.heading };
  const shot = classifyReedsSheppStraightShot(current.pose, target);
  if (!shot) return undefined;
  const sampleCount = Math.max(1, Math.ceil(shot.distanceM / config.collisionSampleM));
  const stepDistanceM = shot.distanceM / sampleCount;
  const signedSpeed =
    shot.direction === "forward" ? config.nominalSpeedMps : -config.nominalSpeedMps;
  const stepTimeS = stepDistanceM / config.nominalSpeedMps;
  let parent = current;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const pose = integrateVehicle(parent.pose, request.vehicle, signedSpeed, 0, stepTimeS);
    if (queryVehicleCollision(safeProfile, pose, request.obstacles).colliding) return undefined;
    const isLast = sample === sampleCount - 1;
    const cost = parent.g + stepDistanceM;
    parent = {
      pose: isLast ? target : pose,
      direction: shot.direction,
      steeringRad: 0,
      distanceM: parent.distanceM + stepDistanceM,
      g: cost,
      f: cost,
      parent,
    };
  }
  return parent;
}

function pathMetrics(
  trajectory: Trajectory | undefined,
  profile: VehicleProfile,
  obstacles: PlannerRequest["obstacles"],
  elapsedMs: number,
  mutable: MutableMetrics,
  smoothed: boolean,
): PlannerMetrics {
  let reverseDistanceM = 0;
  let gearChanges = 0;
  let minimumClearanceM = Number.POSITIVE_INFINITY;
  if (trajectory) {
    trajectory.points.forEach((point, index) => {
      const previous = trajectory.points[index - 1];
      if (previous) {
        const delta = Math.hypot(point.pose.x - previous.pose.x, point.pose.y - previous.pose.y);
        if (point.direction === "reverse") reverseDistanceM += delta;
        if (point.direction !== previous.direction) gearChanges += 1;
      }
      minimumClearanceM = Math.min(
        minimumClearanceM,
        queryVehicleCollision(profile, point.pose, obstacles).clearanceM,
      );
    });
  }
  return {
    ...mutable,
    elapsedMs,
    pathLengthM: trajectory?.totalDistanceM ?? 0,
    reverseDistanceM,
    gearChanges,
    minimumClearanceM,
    smoothed,
  };
}

export function validateTrajectory(
  trajectory: Trajectory,
  request: PlannerRequest,
  config: PlannerConfig = { ...DEFAULT_PLANNER_CONFIG, ...request.config },
): boolean {
  const profile = expandedProfile(request.vehicle, config.safetyMarginM);
  return trajectory.points.every(
    (point) => !queryVehicleCollision(profile, point.pose, request.obstacles).colliding,
  );
}

function smoothTrajectory(
  trajectory: Trajectory,
  request: PlannerRequest,
  config: PlannerConfig,
): Trajectory {
  if (trajectory.points.length < 4) return trajectory;
  const points = trajectory.points.map((point) => ({ ...point, pose: { ...point.pose } }));
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!previous || !current || previous.direction !== next?.direction) continue;
    points[index] = {
      ...current,
      pose: {
        x: 0.25 * previous.pose.x + 0.5 * current.pose.x + 0.25 * next.pose.x,
        y: 0.25 * previous.pose.y + 0.5 * current.pose.y + 0.25 * next.pose.y,
        heading: current.pose.heading,
      },
    };
  }
  const candidate = { ...trajectory, points };
  return validateTrajectory(candidate, request, config) ? candidate : trajectory;
}

export function planHybridAStar(
  request: PlannerRequest,
  cancellation?: CancellationSignal,
  onProgress?: (expandedNodes: number) => void,
): PlannerResult {
  const startedAt = performance.now();
  const config = { ...DEFAULT_PLANNER_CONFIG, ...request.config };
  const mutable: MutableMetrics = { expandedNodes: 0, generatedNodes: 0, analyticConnections: 0 };
  const validation = validateVehicleProfile(request.vehicle);
  if (validation.length > 0 || config.nominalSpeedMps <= 0 || config.primitiveLengthM <= 0) {
    return {
      ok: false,
      reason: "invalid-request",
      message:
        validation.map((issue) => issue.message).join(" ") || "Cấu hình planner không hợp lệ.",
      metrics: pathMetrics(undefined, request.vehicle, request.obstacles, 0, mutable, false),
    };
  }
  const safeProfile = expandedProfile(request.vehicle, config.safetyMarginM);
  if (queryVehicleCollision(safeProfile, request.start, request.obstacles).colliding) {
    return {
      ok: false,
      reason: "invalid-request",
      message: "Vị trí bắt đầu va chạm hoặc không đủ khoảng an toàn.",
      metrics: pathMetrics(undefined, safeProfile, request.obstacles, 0, mutable, false),
    };
  }

  const startNode: SearchNode = {
    pose: request.start,
    direction: "forward",
    steeringRad: 0,
    distanceM: 0,
    g: 0,
    f: heuristic(request.start, request.goal),
  };
  const open: SearchNode[] = [startNode];
  const bestCost = new Map<string, number>([[stateKey(startNode, config), 0]]);
  const steeringSamples = [-request.vehicle.maxSteerRad, 0, request.vehicle.maxSteerRad];
  const directions: readonly MotionDirection[] = ["forward", "reverse"];

  while (open.length > 0) {
    if (cancellation?.isCancelled()) {
      const elapsedMs = performance.now() - startedAt;
      return {
        ok: false,
        reason: "cancelled",
        message: "Đã hủy tác vụ lập kế hoạch.",
        metrics: pathMetrics(undefined, safeProfile, request.obstacles, elapsedMs, mutable, false),
      };
    }
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs >= config.timeoutMs) {
      return {
        ok: false,
        reason: "timeout",
        message: `Không tìm thấy đường trong ${String(config.timeoutMs)} ms.`,
        metrics: pathMetrics(undefined, safeProfile, request.obstacles, elapsedMs, mutable, false),
      };
    }
    if (mutable.expandedNodes >= config.maxNodes) {
      return {
        ok: false,
        reason: "node-budget",
        message: `Đã dùng hết ngân sách ${String(config.maxNodes)} nút.`,
        metrics: pathMetrics(undefined, safeProfile, request.obstacles, elapsedMs, mutable, false),
      };
    }

    let bestIndex = 0;
    for (let index = 1; index < open.length; index += 1) {
      if (
        (open[index]?.f ?? Number.POSITIVE_INFINITY) <
        (open[bestIndex]?.f ?? Number.POSITIVE_INFINITY)
      ) {
        bestIndex = index;
      }
    }
    const current = open.splice(bestIndex, 1)[0];
    if (!current) break;
    mutable.expandedNodes += 1;
    if (mutable.expandedNodes % 500 === 0) onProgress?.(mutable.expandedNodes);

    if (reachedGoal(current.pose, request.goal, config)) {
      const raw = reconstruct(current, config);
      const smoothed = smoothTrajectory(raw, request, config);
      const didSmooth = smoothed !== raw;
      return {
        ok: true,
        trajectory: smoothed,
        metrics: pathMetrics(
          smoothed,
          safeProfile,
          request.obstacles,
          performance.now() - startedAt,
          mutable,
          didSmooth,
        ),
      };
    }

    const analytic = tryReedsSheppStraightConnection(current, request, safeProfile, config);
    if (analytic && reachedGoal(analytic.pose, request.goal, config)) {
      mutable.analyticConnections += 1;
      const raw = reconstruct(analytic, config);
      const smoothed = smoothTrajectory(raw, request, config);
      return {
        ok: true,
        trajectory: smoothed,
        metrics: pathMetrics(
          smoothed,
          safeProfile,
          request.obstacles,
          performance.now() - startedAt,
          mutable,
          smoothed !== raw,
        ),
      };
    }

    for (const direction of directions) {
      for (const steeringRad of steeringSamples) {
        const pose = isMotionCollisionFree(
          current.pose,
          direction,
          steeringRad,
          request,
          safeProfile,
          config,
        );
        if (!pose) continue;
        mutable.generatedNodes += 1;
        const gearPenalty = direction === current.direction ? 0 : config.gearChangePenalty;
        const reversePenalty = direction === "reverse" ? config.reversePenalty : 1;
        const steerRatio = Math.abs(steeringRad) / request.vehicle.maxSteerRad;
        const steerChange =
          Math.abs(steeringRad - current.steeringRad) / request.vehicle.maxSteerRad;
        const g =
          current.g +
          config.primitiveLengthM * reversePenalty +
          gearPenalty +
          config.steeringPenalty * steerRatio +
          config.steeringChangePenalty * steerChange;
        const child: SearchNode = {
          pose,
          direction,
          steeringRad,
          distanceM: current.distanceM + config.primitiveLengthM,
          g,
          f: g + heuristic(pose, request.goal),
          parent: current,
        };
        const key = stateKey(child, config);
        if (g + 1e-9 >= (bestCost.get(key) ?? Number.POSITIVE_INFINITY)) continue;
        bestCost.set(key, g);
        open.push(child);
      }
    }
  }

  const elapsedMs = performance.now() - startedAt;
  return {
    ok: false,
    reason: "no-path",
    message: "Không tìm thấy quỹ đạo khả thi với cấu hình hiện tại.",
    metrics: pathMetrics(undefined, safeProfile, request.obstacles, elapsedMs, mutable, false),
  };
}
