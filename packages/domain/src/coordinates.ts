import type { Pose, Vec2 } from "./types";

export type CanvasViewport = Readonly<{
  originPx: Vec2;
  pixelsPerMeter: number;
}>;

export function worldToCanvas(point: Vec2, viewport: CanvasViewport): Vec2 {
  const [originX, originY] = viewport.originPx;
  return [
    originX + point[0] * viewport.pixelsPerMeter,
    originY - point[1] * viewport.pixelsPerMeter,
  ];
}

export function canvasToWorld(point: Vec2, viewport: CanvasViewport): Vec2 {
  const [originX, originY] = viewport.originPx;
  return [
    (point[0] - originX) / viewport.pixelsPerMeter,
    (originY - point[1]) / viewport.pixelsPerMeter,
  ];
}

export function worldPoseToCanvas(pose: Pose, viewport: CanvasViewport): Pose {
  const [x, y] = worldToCanvas([pose.x, pose.y], viewport);
  return { x, y, heading: -pose.heading };
}

export function canvasPoseToWorld(pose: Pose, viewport: CanvasViewport): Pose {
  const [x, y] = canvasToWorld([pose.x, pose.y], viewport);
  return { x, y, heading: -pose.heading };
}
