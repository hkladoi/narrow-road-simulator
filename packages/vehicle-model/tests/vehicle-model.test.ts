import type { VehicleProfile } from "@nrs/domain";
import { describe, expect, it } from "vitest";

import {
  BUILT_IN_VEHICLE_PROFILES,
  integrateVehicle,
  turningRadiusM,
  validateVehicleProfile,
  vehicleLocalFootprint,
} from "../src";

const firstProfile = BUILT_IN_VEHICLE_PROFILES[0];
if (!firstProfile) throw new Error("Expected a built-in vehicle profile fixture.");
const profile: VehicleProfile = firstProfile;
const origin = { x: 0, y: 0, heading: 0 };

describe("vehicle footprint", () => {
  it("uses rear axle center as the reference pose", () => {
    const footprint = vehicleLocalFootprint(profile);
    expect(footprint[0]).toEqual([-profile.rearOverhangM, -profile.widthM / 2]);
    expect(footprint[2]).toEqual([profile.wheelbaseM + profile.frontOverhangM, profile.widthM / 2]);
  });
});

describe("kinematic bicycle integration", () => {
  it("moves straight when steering is zero", () => {
    expect(integrateVehicle(origin, profile, 1, 0, 1)).toEqual({ x: 1, y: 0, heading: 0 });
  });

  it("curves left and right in forward gear", () => {
    const left = integrateVehicle(origin, profile, 1, 0.4, 1);
    const right = integrateVehicle(origin, profile, 1, -0.4, 1);
    expect(left.y).toBeGreaterThan(0);
    expect(left.heading).toBeGreaterThan(0);
    expect(right.y).toBeLessThan(0);
    expect(right.heading).toBeLessThan(0);
  });

  it("reverses steering geometry correctly", () => {
    const reverseLeft = integrateVehicle(origin, profile, -1, 0.4, 1);
    expect(reverseLeft.x).toBeLessThan(0);
    expect(reverseLeft.y).toBeGreaterThan(0);
    expect(reverseLeft.heading).toBeLessThan(0);
  });

  it("matches L / tan(delta) turning radius", () => {
    expect(turningRadiusM(profile.wheelbaseM, 0.4)).toBeCloseTo(
      profile.wheelbaseM / Math.tan(0.4),
      12,
    );
  });

  it("clamps steering to the profile maximum", () => {
    expect(integrateVehicle(origin, profile, 1, 10, 1)).toEqual(
      integrateVehicle(origin, profile, 1, profile.maxSteerRad, 1),
    );
  });
});

describe("profile validation", () => {
  it("accepts all built-in profiles", () => {
    for (const builtIn of BUILT_IN_VEHICLE_PROFILES) {
      expect(validateVehicleProfile(builtIn)).toEqual([]);
    }
  });

  it("rejects inconsistent overhang geometry", () => {
    expect(validateVehicleProfile({ ...profile, frontOverhangM: 2 })).toContainEqual(
      expect.objectContaining({ code: "OVERHANG_SUM_MISMATCH" }),
    );
  });
});
