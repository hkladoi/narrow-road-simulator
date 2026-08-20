import { BUILT_IN_SCENARIO_TEMPLATES, type PolygonObstacle } from "@nrs/domain";
import { planHybridAStar, validateTrajectory, type PlannerRequest } from "@nrs/planner";
import { BUILT_IN_VEHICLE_PROFILES } from "@nrs/vehicle-model";
import { describe, expect, it } from "vitest";

const vehicle = BUILT_IN_VEHICLE_PROFILES[0];
if (!vehicle) throw new Error("A built-in vehicle is required.");

describe("built-in scenario regression fixtures", () => {
  for (const fixture of BUILT_IN_SCENARIO_TEMPLATES) {
    it(`${fixture.slug} terminates within its budget and returns only validated paths`, () => {
      const scene = fixture.scene;
      if (!scene.goal) throw new Error(`${fixture.slug} must define a goal.`);
      if (!scene.vehicle) throw new Error(`${fixture.slug} must define a vehicle pose.`);

      const input: PlannerRequest = {
        start: scene.vehicle.pose,
        goal: scene.goal,
        vehicle,
        obstacles: scene.objects.filter(
          (object): object is PolygonObstacle =>
            object.type !== "drivableArea" && object.type !== "gate",
        ),
        config: {
          timeoutMs: 3_000,
          maxNodes: 50_000,
          safetyMarginM: scene.safetyMarginM ?? 0.15,
        },
      };
      const result = planHybridAStar(input);

      expect(result.metrics.elapsedMs).toBeLessThanOrEqual(3_250);
      expect(result.metrics.expandedNodes).toBeLessThanOrEqual(50_000);
      if (result.ok) expect(validateTrajectory(result.trajectory, input)).toBe(true);
      else expect(["timeout", "node-budget", "no-path"]).toContain(result.reason);
    }, 5_000);
  }
});
