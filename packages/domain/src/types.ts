export type Vec2 = readonly [x: number, y: number];

export type Pose = Readonly<{
  x: number;
  y: number;
  heading: number;
}>;

export type Polygon = readonly Vec2[];

export type VehicleCategory = "hatchback" | "sedan" | "suv" | "mpv" | "pickup" | "custom";

export type VehicleDataStatus = "READY" | "PARTIAL" | "RESOLVING" | "REVIEW_REQUIRED";

export type VehicleProfile = Readonly<{
  id: string;
  name: string;
  category: VehicleCategory;
  lengthM: number;
  widthM: number;
  wheelbaseM: number;
  frontOverhangM: number;
  rearOverhangM: number;
  maxSteerRad: number;
  minTurnRadiusM?: number;
  trackWidthM?: number;
  manufacturer?: string;
  model?: string;
  generation?: string;
  trim?: string;
  market?: string;
  canonicalKey?: string;
  dataStatus?: VehicleDataStatus;
}>;

export type DrivableArea = Readonly<{
  id: string;
  type: "drivableArea";
  polygon: Polygon;
}>;

export type PolygonObstacleType = "wall" | "curb" | "obstacle" | "parkedVehicle";

export type PolygonObstacle = Readonly<{
  id: string;
  type: PolygonObstacleType;
  polygon: Polygon;
}>;

export type Gate = Readonly<{
  id: string;
  type: "gate";
  start: Vec2;
  end: Vec2;
  label?: string;
}>;

export type SceneObject = DrivableArea | PolygonObstacle | Gate;

export type PoseGoal = Readonly<{
  type: "pose";
  x: number;
  y: number;
  heading: number;
  positionToleranceM: number;
  headingToleranceRad: number;
}>;

export type RegionGoal = Readonly<{
  type: "region";
  polygon: Polygon;
  heading?: number;
  headingToleranceRad?: number;
}>;

export type Goal = PoseGoal | RegionGoal;

export type Scene = Readonly<{
  version: 1;
  name: string;
  world: Readonly<{
    unit: "m";
    gridSize: number;
  }>;
  objects: readonly SceneObject[];
  vehicle?: Readonly<{
    profileId: string;
    pose: Pose;
  }>;
  goal?: Goal;
  safetyMarginM?: number;
}>;
