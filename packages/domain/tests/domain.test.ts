import { describe, expect, it } from "vitest";

import {
  canvasPoseToWorld,
  canvasToWorld,
  parseScene,
  serializeScene,
  worldPoseToCanvas,
  worldToCanvas,
} from "../src";

const viewport = { originPx: [400, 300] as const, pixelsPerMeter: 80 };

describe("world and canvas coordinates", () => {
  it("round-trips a point while flipping the canvas y axis", () => {
    const world = [1.23456789, -2.34567891] as const;
    const roundTripped = canvasToWorld(worldToCanvas(world, viewport), viewport);
    expect(roundTripped[0]).toBeCloseTo(world[0], 12);
    expect(roundTripped[1]).toBeCloseTo(world[1], 12);
  });

  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])(
    "round-trips a pose at heading %f",
    (heading) => {
      const pose = { x: 2.4, y: -0.75, heading };
      expect(canvasPoseToWorld(worldPoseToCanvas(pose, viewport), viewport)).toEqual(pose);
    },
  );
});

describe("scene schema v1", () => {
  it("parses and serializes without losing practical precision", () => {
    const scene = {
      version: 1,
      name: "Precision fixture",
      world: { unit: "m", gridSize: 0.1 },
      objects: [
        {
          id: "road-1",
          type: "drivableArea",
          polygon: [
            [0, 0],
            [8.123456789, 0],
            [8.123456789, 3.987654321],
          ],
        },
      ],
    };

    expect(parseScene(JSON.parse(serializeScene(scene)))).toEqual(scene);
  });

  it("rejects pixels as a world unit", () => {
    expect(() =>
      parseScene({ version: 1, name: "Invalid", world: { unit: "px", gridSize: 10 }, objects: [] }),
    ).toThrow();
  });
});
