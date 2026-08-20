import type { PolygonObstacle, Scene } from "./types";

type BuiltInScenarioTemplate = Readonly<{
  slug: string;
  name: string;
  description: string;
  scene: Scene;
}>;

function wall(id: string, polygon: PolygonObstacle["polygon"]): PolygonObstacle {
  return { id, type: "wall", polygon };
}

function scene(name: string, objects: Scene["objects"], goal: NonNullable<Scene["goal"]>): Scene {
  return {
    version: 1,
    name,
    world: { unit: "m", gridSize: 0.1 },
    objects,
    vehicle: { profileId: "builtin-small-hatchback", pose: { x: 2.2, y: 2.25, heading: 0 } },
    goal,
    safetyMarginM: 0.15,
  };
}

export const BUILT_IN_SCENARIO_TEMPLATES: readonly BuiltInScenarioTemplate[] = [
  {
    slug: "ngo-chu-l",
    name: "Ngõ chữ L",
    description: "Rẽ vuông góc trong hành lang rộng 4,5 m.",
    scene: scene(
      "Ngõ chữ L",
      [
        {
          id: "road",
          type: "drivableArea",
          polygon: [
            [0, 0],
            [10, 0],
            [10, 10],
            [5.5, 10],
            [5.5, 4.5],
            [0, 4.5],
          ],
        },
        wall("north-west", [
          [0, 4.5],
          [5.5, 4.5],
          [5.5, 5],
          [0, 5],
        ]),
        wall("inner-corner", [
          [5.5, 5],
          [5.5, 10],
          [6, 10],
          [6, 5],
        ]),
        wall("south", [
          [0, -0.5],
          [10, -0.5],
          [10, 0],
          [0, 0],
        ]),
        wall("east", [
          [10, 0],
          [10.5, 0],
          [10.5, 10],
          [10, 10],
        ]),
      ],
      {
        type: "pose",
        x: 7.75,
        y: 7.4,
        heading: Math.PI / 2,
        positionToleranceM: 0.4,
        headingToleranceRad: 0.18,
      },
    ),
  },
  {
    slug: "ngo-chu-t",
    name: "Ngõ chữ T",
    description: "Tiếp cận nút chữ T và rẽ trái trong không gian giới hạn.",
    scene: scene(
      "Ngõ chữ T",
      [
        {
          id: "road",
          type: "drivableArea",
          polygon: [
            [0, 0],
            [13, 0],
            [13, 4.5],
            [8.75, 4.5],
            [8.75, 10],
            [4.25, 10],
            [4.25, 4.5],
            [0, 4.5],
          ],
        },
        wall("south", [
          [0, -0.5],
          [13, -0.5],
          [13, 0],
          [0, 0],
        ]),
        wall("west-top", [
          [0, 4.5],
          [4.25, 4.5],
          [4.25, 5],
          [0, 5],
        ]),
        wall("stem-left", [
          [4.25, 5],
          [4.75, 5],
          [4.75, 10],
          [4.25, 10],
        ]),
        wall("stem-right", [
          [8.25, 5],
          [8.75, 5],
          [8.75, 10],
          [8.25, 10],
        ]),
        wall("east-top", [
          [8.75, 4.5],
          [13, 4.5],
          [13, 5],
          [8.75, 5],
        ]),
      ],
      {
        type: "pose",
        x: 6.5,
        y: 7.4,
        heading: Math.PI / 2,
        positionToleranceM: 0.4,
        headingToleranceRad: 0.18,
      },
    ),
  },
  {
    slug: "ngo-cut",
    name: "Ngõ cụt",
    description: "Lùi và đổi hướng trước vách cuối ngõ.",
    scene: scene(
      "Ngõ cụt",
      [
        {
          id: "road",
          type: "drivableArea",
          polygon: [
            [0, 0],
            [12, 0],
            [12, 5],
            [0, 5],
          ],
        },
        wall("south", [
          [0, -0.5],
          [12.5, -0.5],
          [12.5, 0],
          [0, 0],
        ]),
        wall("north", [
          [0, 5],
          [12.5, 5],
          [12.5, 5.5],
          [0, 5.5],
        ]),
        wall("dead-end", [
          [12, 0],
          [12.5, 0],
          [12.5, 5],
          [12, 5],
        ]),
      ],
      {
        type: "pose",
        x: 3,
        y: 2.5,
        heading: Math.PI,
        positionToleranceM: 0.45,
        headingToleranceRad: 0.2,
      },
    ),
  },
  {
    slug: "cong-hep",
    name: "Cổng hẹp",
    description: "Căn thân xe qua khe cổng rộng 2,15 m.",
    scene: scene(
      "Cổng hẹp",
      [
        {
          id: "road",
          type: "drivableArea",
          polygon: [
            [0, 0],
            [14, 0],
            [14, 6],
            [0, 6],
          ],
        },
        wall("gate-lower", [
          [6.5, 0],
          [7, 0],
          [7, 1.92],
          [6.5, 1.92],
        ]),
        wall("gate-upper", [
          [6.5, 4.07],
          [7, 4.07],
          [7, 6],
          [6.5, 6],
        ]),
        { id: "gate", type: "gate", start: [6.75, 1.92], end: [6.75, 4.07], label: "2,15 m" },
      ],
      {
        type: "pose",
        x: 11,
        y: 3,
        heading: 0,
        positionToleranceM: 0.35,
        headingToleranceRad: 0.12,
      },
    ),
  },
  {
    slug: "quay-dau-duong-hep",
    name: "Quay đầu đường hẹp",
    description: "Quay đầu nhiều nhịp trong đoạn đường rộng 5 m.",
    scene: scene(
      "Quay đầu đường hẹp",
      [
        {
          id: "road",
          type: "drivableArea",
          polygon: [
            [0, 0],
            [15, 0],
            [15, 5],
            [0, 5],
          ],
        },
        wall("south", [
          [0, -0.5],
          [15, -0.5],
          [15, 0],
          [0, 0],
        ]),
        wall("north", [
          [0, 5],
          [15, 5],
          [15, 5.5],
          [0, 5.5],
        ]),
      ],
      {
        type: "pose",
        x: 4,
        y: 2.5,
        heading: Math.PI,
        positionToleranceM: 0.4,
        headingToleranceRad: 0.18,
      },
    ),
  },
] as const;
