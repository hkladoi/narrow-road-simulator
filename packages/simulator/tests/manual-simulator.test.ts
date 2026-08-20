import type { PolygonObstacle, VehicleProfile } from "@nrs/domain";
import { describe, expect, it } from "vitest";

import {
  createManualSimulationState,
  DEFAULT_SIMULATOR_SETTINGS,
  stepManualSimulation,
} from "../src";

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

const wall: PolygonObstacle = {
  id: "wall",
  type: "wall",
  polygon: [
    [4, -2],
    [4.2, -2],
    [4.2, 2],
    [4, 2],
  ],
};

describe("fixed-step manual simulator", () => {
  it("is deterministic across equivalent elapsed-time chunking", () => {
    const initial = createManualSimulationState(vehicle, { x: 0, y: 0, heading: 0 });
    const input = { gear: "D" as const, throttle: 1, brake: false, steer: 0.5 };
    const once = stepManualSimulation(initial, input, vehicle, [], 1);
    let chunked = initial;
    for (let index = 0; index < 10; index += 1) {
      chunked = stepManualSimulation(chunked, input, vehicle, [], 0.1);
    }
    expect(chunked.pose.x).toBeCloseTo(once.pose.x, 10);
    expect(chunked.pose.y).toBeCloseTo(once.pose.y, 10);
    expect(chunked.pose.heading).toBeCloseTo(once.pose.heading, 10);
  });

  it("supports reverse without rotating in place", () => {
    const initial = createManualSimulationState(vehicle, { x: 0, y: 0, heading: 0 });
    const result = stepManualSimulation(
      initial,
      { gear: "R", throttle: 1, brake: false, steer: 1 },
      vehicle,
      [],
      1,
    );
    expect(result.pose.x).toBeLessThan(0);
    expect(result.pose.heading).toBeLessThan(0);
    expect(result.pose).not.toEqual({ x: 0, y: 0, heading: expect.any(Number) });
  });

  it("clamps motion before penetration", () => {
    const settings = {
      ...DEFAULT_SIMULATOR_SETTINGS,
      accelerationMps2: 100,
      maxForwardSpeedMps: 2,
    };
    const initial = createManualSimulationState(vehicle, { x: 0, y: 0, heading: 0 }, [wall]);
    const result = stepManualSimulation(
      initial,
      { gear: "D", throttle: 1, brake: false, steer: 0 },
      vehicle,
      [wall],
      1,
      settings,
    );
    expect(result.pose.x).toBeCloseTo(0.7, 4);
    expect(result.speedMps).toBe(0);
    expect(result.collision.colliding).toBe(true);
  });

  it("applies steering-rate limits", () => {
    const initial = createManualSimulationState(vehicle, { x: 0, y: 0, heading: 0 });
    const result = stepManualSimulation(
      initial,
      { gear: "D", throttle: 0, brake: false, steer: 1 },
      vehicle,
      [],
      0.1,
    );
    expect(result.steeringRad).toBeCloseTo(DEFAULT_SIMULATOR_SETTINGS.steeringRateRadPerS * 0.1);
    expect(result.pose).toEqual(initial.pose);
  });
});
