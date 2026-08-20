import type { VehicleProfile } from "@nrs/domain";

import { turningRadiusM } from "./kinematics";

export type VehicleProfileIssue = Readonly<{
  field: keyof VehicleProfile | "geometry";
  code: string;
  message: string;
}>;

export function validateVehicleProfile(profile: VehicleProfile): readonly VehicleProfileIssue[] {
  const issues: VehicleProfileIssue[] = [];
  const positiveFields = ["lengthM", "widthM", "wheelbaseM", "maxSteerRad"] as const;
  for (const field of positiveFields) {
    if (!Number.isFinite(profile[field]) || profile[field] <= 0) {
      issues.push({ field, code: "POSITIVE_REQUIRED", message: `${field} must be positive.` });
    }
  }
  for (const field of ["frontOverhangM", "rearOverhangM"] as const) {
    if (!Number.isFinite(profile[field]) || profile[field] < 0) {
      issues.push({
        field,
        code: "NON_NEGATIVE_REQUIRED",
        message: `${field} must be non-negative.`,
      });
    }
  }
  if (profile.widthM >= profile.lengthM) {
    issues.push({
      field: "widthM",
      code: "WIDTH_GE_LENGTH",
      message: "Vehicle width must be less than length.",
    });
  }

  const expectedLength = profile.wheelbaseM + profile.frontOverhangM + profile.rearOverhangM;
  const allowedLengthError = Math.max(0.08, profile.lengthM * 0.02);
  if (Math.abs(expectedLength - profile.lengthM) > allowedLengthError) {
    issues.push({
      field: "geometry",
      code: "OVERHANG_SUM_MISMATCH",
      message: "Wheelbase plus front/rear overhangs must match overall length within tolerance.",
    });
  }

  if (profile.trackWidthM !== undefined && profile.trackWidthM >= profile.widthM) {
    issues.push({
      field: "trackWidthM",
      code: "TRACK_GE_WIDTH",
      message: "Track width must be smaller than overall width.",
    });
  }

  if (profile.minTurnRadiusM !== undefined) {
    const modelRadius = turningRadiusM(profile.wheelbaseM, profile.maxSteerRad);
    const relativeError = Math.abs(modelRadius - profile.minTurnRadiusM) / profile.minTurnRadiusM;
    if (relativeError > 0.35) {
      issues.push({
        field: "minTurnRadiusM",
        code: "TURN_RADIUS_MISMATCH",
        message: "Minimum turn radius conflicts with wheelbase and maximum steering angle.",
      });
    }
  }
  return issues;
}

export function assertValidVehicleProfile(profile: VehicleProfile): void {
  const issues = validateVehicleProfile(profile);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  }
}
