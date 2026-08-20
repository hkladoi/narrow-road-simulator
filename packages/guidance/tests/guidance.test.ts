import { buildGuidance } from "@nrs/guidance";
import type { Trajectory } from "@nrs/planner";
import { describe, expect, it } from "vitest";

const trajectory: Trajectory = {
  version: 1,
  totalDistanceM: 3,
  estimatedDurationS: 3,
  points: [
    {
      pose: { x: 0, y: 0, heading: 0 },
      direction: "forward",
      steeringRad: 0,
      distanceM: 0,
      elapsedS: 0,
    },
    {
      pose: { x: 1, y: 0, heading: 0 },
      direction: "forward",
      steeringRad: 0,
      distanceM: 1,
      elapsedS: 1,
    },
    {
      pose: { x: 2, y: 0.2, heading: 0.2 },
      direction: "forward",
      steeringRad: 0.3,
      distanceM: 2,
      elapsedS: 2,
    },
    {
      pose: { x: 2.8, y: 0.5, heading: 0.3 },
      direction: "reverse",
      steeringRad: -0.2,
      distanceM: 3,
      elapsedS: 3,
    },
  ],
};

describe("Vietnamese guidance", () => {
  it("segments by direction and steering intent with deterministic wording", () => {
    const steps = buildGuidance(trajectory);
    expect(steps.map((step) => step.instructionVi)).toEqual([
      "Tiến thẳng 1 m.",
      "Tiến và giữ lái sang trái trong 1 m.",
      "Lùi và giữ lái sang phải trong 0,9 m.",
    ]);
  });

  it("returns no step for a single-point trajectory", () => {
    expect(buildGuidance({ ...trajectory, points: trajectory.points.slice(0, 1) })).toEqual([]);
  });
});
