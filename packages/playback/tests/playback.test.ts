import { playbackTimeAfterTick, sampleTrajectory } from "@nrs/playback";
import type { Trajectory } from "@nrs/planner";
import { describe, expect, it } from "vitest";

const trajectory: Trajectory = {
  version: 1,
  totalDistanceM: 2,
  estimatedDurationS: 2,
  points: [
    {
      pose: { x: 0, y: 0, heading: 3 },
      direction: "forward",
      steeringRad: 0,
      distanceM: 0,
      elapsedS: 0,
    },
    {
      pose: { x: 2, y: 2, heading: -3 },
      direction: "forward",
      steeringRad: 0.2,
      distanceM: 2,
      elapsedS: 2,
    },
  ],
};

describe("trajectory playback", () => {
  it("interpolates pose and wraps heading over the shortest arc", () => {
    const sample = sampleTrajectory(trajectory, 1);
    expect(sample?.pose.x).toBeCloseTo(1);
    expect(sample?.pose.y).toBeCloseTo(1);
    expect(Math.abs(sample?.pose.heading ?? 0)).toBeGreaterThan(3);
    expect(sample?.progress).toBe(0.5);
  });

  it("clamps and loops playback time", () => {
    expect(playbackTimeAfterTick(1.8, 1, 1, 2)).toBe(2);
    expect(playbackTimeAfterTick(1.8, 1, 1, 2, true)).toBeCloseTo(0.8);
  });
});
