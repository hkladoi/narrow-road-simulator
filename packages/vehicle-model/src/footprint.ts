import type { Polygon, Pose, Vec2, VehicleProfile } from "@nrs/domain";
import { transformPoint, transformPolygon } from "@nrs/geometry";

export type VehicleCorner = "rear-right" | "front-right" | "front-left" | "rear-left";

export const VEHICLE_CORNER_ORDER: readonly VehicleCorner[] = [
  "rear-right",
  "front-right",
  "front-left",
  "rear-left",
];

export function vehicleLocalFootprint(profile: VehicleProfile): Polygon {
  const halfWidth = profile.widthM / 2;
  const front = profile.wheelbaseM + profile.frontOverhangM;
  const rear = -profile.rearOverhangM;
  return [
    [rear, -halfWidth],
    [front, -halfWidth],
    [front, halfWidth],
    [rear, halfWidth],
  ];
}

export function vehicleWorldFootprint(profile: VehicleProfile, pose: Pose): Polygon {
  return transformPolygon(vehicleLocalFootprint(profile), pose);
}

export type AxleGeometry = Readonly<{
  rearCenter: Vec2;
  frontCenter: Vec2;
  rearLeft: Vec2;
  rearRight: Vec2;
  frontLeft: Vec2;
  frontRight: Vec2;
  visualTrackWidthM: number;
}>;

export function vehicleAxleGeometry(profile: VehicleProfile, pose: Pose): AxleGeometry {
  const visualTrackWidthM = profile.trackWidthM ?? profile.widthM * 0.78;
  const halfTrack = visualTrackWidthM / 2;
  return {
    rearCenter: transformPoint([0, 0], pose),
    frontCenter: transformPoint([profile.wheelbaseM, 0], pose),
    rearLeft: transformPoint([0, halfTrack], pose),
    rearRight: transformPoint([0, -halfTrack], pose),
    frontLeft: transformPoint([profile.wheelbaseM, halfTrack], pose),
    frontRight: transformPoint([profile.wheelbaseM, -halfTrack], pose),
    visualTrackWidthM,
  };
}
