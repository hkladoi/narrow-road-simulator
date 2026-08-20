import type { PlannerRequest } from "@nrs/planner";
import { planHybridAStar, validateTrajectory } from "@nrs/planner";
import { BUILT_IN_VEHICLE_PROFILES } from "@nrs/vehicle-model";
import { describe, expect, it } from "vitest";

const vehicle = (() => {
  const profile = BUILT_IN_VEHICLE_PROFILES[0];
  if (!profile) throw new Error("A built-in vehicle is required.");
  return profile;
})();

function request(overrides: Partial<PlannerRequest> = {}): PlannerRequest {
  return {
    start: { x: 0, y: 0, heading: 0 },
    goal: {
      type: "pose",
      x: 4,
      y: 0,
      heading: 0,
      positionToleranceM: 0.4,
      headingToleranceRad: 0.2,
    },
    vehicle,
    obstacles: [],
    config: { timeoutMs: 2_000, maxNodes: 10_000, safetyMarginM: 0 },
    ...overrides,
  };
}

describe("Hybrid A*", () => {
  it("finds and validates a deterministic straight path", () => {
    const input = request();
    const result = planHybridAStar(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trajectory.totalDistanceM).toBeGreaterThan(3.4);
    expect(validateTrajectory(result.trajectory, input)).toBe(true);
    expect(result.metrics.expandedNodes).toBeGreaterThan(0);
  });

  it("honours cancellation", () => {
    const result = planHybridAStar(request(), { isCancelled: () => true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cancelled");
  });

  it("uses the Reeds–Shepp S- family for an aligned reverse shot", () => {
    const result = planHybridAStar(
      request({
        start: { x: 4, y: 0, heading: 0 },
        goal: {
          type: "pose",
          x: 0,
          y: 0,
          heading: 0,
          positionToleranceM: 0.2,
          headingToleranceRad: 0.1,
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metrics.analyticConnections).toBe(1);
    expect(result.metrics.reverseDistanceM).toBeGreaterThan(3.9);
    expect(result.trajectory.points.at(-1)?.direction).toBe("reverse");
  });

  it("rejects a colliding start pose with safety margin", () => {
    const result = planHybridAStar(
      request({
        obstacles: [
          {
            id: "wall",
            type: "wall",
            polygon: [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid-request");
  });
});
