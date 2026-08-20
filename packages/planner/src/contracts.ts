import type { Goal, PolygonObstacle, Pose, VehicleProfile } from "@nrs/domain";

export type MotionDirection = "forward" | "reverse";

export type TrajectoryPoint = Readonly<{
  pose: Pose;
  direction: MotionDirection;
  steeringRad: number;
  distanceM: number;
  elapsedS: number;
}>;

export type Trajectory = Readonly<{
  version: 1;
  points: readonly TrajectoryPoint[];
  totalDistanceM: number;
  estimatedDurationS: number;
}>;

export type PlannerConfig = Readonly<{
  spatialResolutionM: number;
  headingBins: number;
  primitiveLengthM: number;
  collisionSampleM: number;
  maxNodes: number;
  timeoutMs: number;
  goalPositionToleranceM: number;
  goalHeadingToleranceRad: number;
  reversePenalty: number;
  gearChangePenalty: number;
  steeringPenalty: number;
  steeringChangePenalty: number;
  safetyMarginM: number;
  nominalSpeedMps: number;
}>;

export type PlannerRequest = Readonly<{
  start: Pose;
  goal: Goal;
  vehicle: VehicleProfile;
  obstacles: readonly PolygonObstacle[];
  config?: Partial<PlannerConfig>;
}>;

export type PlannerMetrics = Readonly<{
  expandedNodes: number;
  generatedNodes: number;
  elapsedMs: number;
  pathLengthM: number;
  reverseDistanceM: number;
  gearChanges: number;
  minimumClearanceM: number;
  smoothed: boolean;
  analyticConnections: number;
}>;

export type PlannerFailureReason =
  "cancelled" | "invalid-request" | "node-budget" | "timeout" | "no-path";

export type PlannerResult =
  | Readonly<{ ok: true; trajectory: Trajectory; metrics: PlannerMetrics }>
  | Readonly<{ ok: false; reason: PlannerFailureReason; message: string; metrics: PlannerMetrics }>;

export type CancellationSignal = Readonly<{ isCancelled: () => boolean }>;

export type PlannerWorkerRequest =
  | Readonly<{ type: "plan"; requestId: string; payload: PlannerRequest }>
  | Readonly<{ type: "cancel"; requestId: string }>;

export type PlannerWorkerResponse =
  | Readonly<{ type: "progress"; requestId: string; expandedNodes: number }>
  | Readonly<{ type: "result"; requestId: string; result: PlannerResult }>;
