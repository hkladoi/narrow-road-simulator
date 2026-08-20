import type { PolygonObstacle, VehicleProfile } from "@nrs/domain";
import { describe, expect, it } from "vitest";

import { clampPoseBeforeCollision, queryVehicleCollision } from "../src";

const vehicle: VehicleProfile = {
  id: "test-car",
  name: "Test car",
  category: "sedan",
  lengthM: 4,
  widthM: 2,
  wheelbaseM: 2.5,
  frontOverhangM: 0.8,
  rearOverhangM: 0.7,
  maxSteerRad: 0.55,
};

const obstacle = (
  id: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PolygonObstacle => ({
  id,
  type: "obstacle",
  polygon: [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ],
});

describe("vehicle collision golden cases", () => {
  it("detects a front-left corner hitting a wall", () => {
    const result = queryVehicleCollision(vehicle, { x: 0, y: 0, heading: 0 }, [
      obstacle("wall", 3.2, 0.75, 3.6, 1.25),
    ]);
    expect(result.colliding).toBe(true);
    expect(result.nearestVehicleCorner).toBe("front-left");
    expect(result.nearestObstacleId).toBe("wall");
  });

  it("detects rear swing into a wall", () => {
    const result = queryVehicleCollision(vehicle, { x: 0, y: 0, heading: Math.PI / 4 }, [
      obstacle("rear-wall", -1.25, 0.05, -0.8, 0.7),
    ]);
    expect(result.colliding).toBe(true);
    expect(result.nearestVehicleCorner).toMatch(/^rear-/);
  });

  it("treats a parked vehicle as a hard obstacle", () => {
    const parked: PolygonObstacle = {
      ...obstacle("parked", 2.8, -1, 5, 1),
      type: "parkedVehicle",
    };
    expect(queryVehicleCollision(vehicle, { x: 0, y: 0, heading: 0 }, [parked]).colliding).toBe(
      true,
    );
  });

  it("reports positive clearance for a rotated near-miss", () => {
    const result = queryVehicleCollision(vehicle, { x: 0, y: 0, heading: Math.PI / 4 }, [
      obstacle("far", 4, 2.5, 5, 3.5),
    ]);
    expect(result.colliding).toBe(false);
    expect(result.clearanceM).toBeGreaterThan(0);
  });

  it("clamps motion immediately before penetration", () => {
    const wall = obstacle("wall", 4, -2, 4.2, 2);
    const result = clampPoseBeforeCollision(
      vehicle,
      { x: 0, y: 0, heading: 0 },
      { x: 2, y: 0, heading: 0 },
      [wall],
    );
    expect(result.fraction).toBeGreaterThan(0);
    expect(result.fraction).toBeLessThan(1);
    expect(result.pose.x).toBeCloseTo(0.7, 5);
    expect(result.collision.colliding).toBe(true);
  });
});
