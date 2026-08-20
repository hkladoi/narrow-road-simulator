"use client";

import type { Polygon, Pose, SceneObject, Vec2 } from "@nrs/domain";
import { sampleTrajectory } from "@nrs/playback";
import { vehicleAxleGeometry, vehicleWorldFootprint } from "@nrs/vehicle-model";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";

import { useWorkbenchStore } from "../lib/store";

type CanvasColors = {
  paper: string;
  paper2: string;
  grid: string;
  road: string;
  wall: string;
  accent: string;
  accentSoft: string;
  ink: string;
  error: string;
  success: string;
  warning: string;
};

const fallbackColors: CanvasColors = {
  paper: "",
  paper2: "",
  grid: "",
  road: "",
  wall: "",
  accent: "",
  accentSoft: "",
  ink: "",
  error: "",
  success: "",
  warning: "",
};

function readColors(): CanvasColors {
  if (typeof document === "undefined") return fallbackColors;
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    paper: token("--color-paper", fallbackColors.paper),
    paper2: token("--color-paper-2", fallbackColors.paper2),
    grid: token("--color-grid", fallbackColors.grid),
    road: token("--color-road", fallbackColors.road),
    wall: token("--color-wall", fallbackColors.wall),
    accent: token("--color-accent", fallbackColors.accent),
    accentSoft: token("--color-accent-soft", fallbackColors.accentSoft),
    ink: token("--color-ink", fallbackColors.ink),
    error: token("--color-error", fallbackColors.error),
    success: token("--color-success", fallbackColors.success),
    warning: token("--color-warning", fallbackColors.warning),
  };
}

function flatten(points: Polygon, height: number, pixelsPerMeter: number): number[] {
  return points.flatMap(([x, y]) => [24 + x * pixelsPerMeter, height - 24 - y * pixelsPerMeter]);
}

function stagePoint(point: Vec2, height: number, pixelsPerMeter: number): Vec2 {
  return [24 + point[0] * pixelsPerMeter, height - 24 - point[1] * pixelsPerMeter];
}

function ObjectShape({
  object,
  height,
  pixelsPerMeter,
  selected,
  colors,
  onSelect,
  onMove,
}: {
  object: SceneObject;
  height: number;
  pixelsPerMeter: number;
  selected: boolean;
  colors: CanvasColors;
  onSelect: () => void;
  onMove: (delta: Vec2) => void;
}) {
  const common = {
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (event: {
      target: { x(): number; y(): number; position(value: { x: number; y: number }): void };
    }) => {
      const dx = event.target.x() / pixelsPerMeter;
      const dy = -event.target.y() / pixelsPerMeter;
      event.target.position({ x: 0, y: 0 });
      onMove([dx, dy]);
    },
  };
  if (object.type === "gate") {
    const start = stagePoint(object.start, height, pixelsPerMeter);
    const end = stagePoint(object.end, height, pixelsPerMeter);
    return (
      <Group {...common}>
        <Line
          points={[...start, ...end]}
          stroke={colors.warning}
          strokeWidth={selected ? 5 : 3}
          dash={[8, 5]}
        />
        <Text
          x={(start[0] + end[0]) / 2 + 6}
          y={(start[1] + end[1]) / 2 - 18}
          text={object.label ?? "Cổng"}
          fill={colors.ink}
          fontSize={12}
        />
      </Group>
    );
  }
  const isRoad = object.type === "drivableArea";
  return (
    <Group {...common}>
      <Line
        points={flatten(object.polygon, height, pixelsPerMeter)}
        closed
        fill={isRoad ? colors.road : colors.wall}
        stroke={selected ? colors.accent : isRoad ? colors.grid : colors.ink}
        strokeWidth={selected ? 3 : 1.5}
        lineJoin="round"
      />
    </Group>
  );
}

function VehicleShape({
  pose,
  height,
  pixelsPerMeter,
  colors,
}: {
  pose: Pose;
  height: number;
  pixelsPerMeter: number;
  colors: CanvasColors;
}) {
  const profile = useWorkbenchStore((state) => state.selectedVehicle);
  const footprint = vehicleWorldFootprint(profile, pose);
  const axles = vehicleAxleGeometry(profile, pose);
  const rear = [
    stagePoint(axles.rearLeft, height, pixelsPerMeter),
    stagePoint(axles.rearRight, height, pixelsPerMeter),
  ].flat();
  const front = [
    stagePoint(axles.frontLeft, height, pixelsPerMeter),
    stagePoint(axles.frontRight, height, pixelsPerMeter),
  ].flat();
  const center = stagePoint([pose.x, pose.y], height, pixelsPerMeter);
  const nose = stagePoint(
    [
      pose.x + Math.cos(pose.heading) * profile.wheelbaseM,
      pose.y + Math.sin(pose.heading) * profile.wheelbaseM,
    ],
    height,
    pixelsPerMeter,
  );
  return (
    <Group listening={false}>
      <Line
        points={flatten(footprint, height, pixelsPerMeter)}
        closed
        fill={colors.accentSoft}
        stroke={colors.accent}
        strokeWidth={2.5}
      />
      <Line points={rear} stroke={colors.ink} strokeWidth={4} lineCap="round" />
      <Line points={front} stroke={colors.ink} strokeWidth={4} lineCap="round" />
      <Line points={[...center, ...nose]} stroke={colors.accent} strokeWidth={2} />
      <Circle x={center[0]} y={center[1]} radius={4} fill={colors.accent} />
    </Group>
  );
}

export function SceneCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 620 });
  const [colors, setColors] = useState(fallbackColors);
  const scene = useWorkbenchStore((state) => state.scene);
  const selectedObjectId = useWorkbenchStore((state) => state.selectedObjectId);
  const tool = useWorkbenchStore((state) => state.tool);
  const draftPoints = useWorkbenchStore((state) => state.draftPoints);
  const trajectory = useWorkbenchStore((state) => state.trajectory);
  const playbackTimeS = useWorkbenchStore((state) => state.playbackTimeS);
  const addDraftPoint = useWorkbenchStore((state) => state.addDraftPoint);
  const setSelectedObject = useWorkbenchStore((state) => state.setSelectedObject);
  const moveObject = useWorkbenchStore((state) => state.moveObject);
  const pixelsPerMeter = useMemo(() => Math.max(30, Math.min(52, size.width / 16)), [size.width]);
  const playback = trajectory ? sampleTrajectory(trajectory, playbackTimeS) : undefined;
  const vehiclePose = playback?.pose ?? scene.vehicle?.pose;

  useEffect(() => {
    setColors(readColors());
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.max(280, entry.contentRect.width),
        height: Math.max(420, entry.contentRect.height),
      });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const gridLines = [];
  for (let x = 0; x <= size.width; x += pixelsPerMeter)
    gridLines.push(
      <Line
        key={`x-${String(x)}`}
        points={[24 + x, 0, 24 + x, size.height]}
        stroke={colors.grid}
        strokeWidth={0.6}
        listening={false}
      />,
    );
  for (let y = 0; y <= size.height; y += pixelsPerMeter)
    gridLines.push(
      <Line
        key={`y-${String(y)}`}
        points={[0, size.height - 24 - y, size.width, size.height - 24 - y]}
        stroke={colors.grid}
        strokeWidth={0.6}
        listening={false}
      />,
    );

  return (
    <div ref={hostRef} className="canvas-host" aria-label="Bản vẽ đường hẹp theo mét">
      <Stage
        width={size.width}
        height={size.height}
        onMouseDown={(event) => {
          if (tool === "select") {
            if (event.target === event.target.getStage()) setSelectedObject(undefined);
            return;
          }
          const pointer = event.target.getStage()?.getPointerPosition();
          if (!pointer) return;
          const grid = scene.world.gridSize;
          const x = Math.round((pointer.x - 24) / pixelsPerMeter / grid) * grid;
          const y = Math.round((size.height - 24 - pointer.y) / pixelsPerMeter / grid) * grid;
          addDraftPoint([x, y]);
        }}
      >
        <Layer>
          <Rect width={size.width} height={size.height} fill={colors.paper} />
          {gridLines}
          {scene.objects.map((object) => (
            <ObjectShape
              key={object.id}
              object={object}
              height={size.height}
              pixelsPerMeter={pixelsPerMeter}
              selected={selectedObjectId === object.id}
              colors={colors}
              onSelect={() => setSelectedObject(object.id)}
              onMove={(delta) => moveObject(object.id, delta)}
            />
          ))}
          {scene.goal?.type === "pose" ? (
            <Group listening={false}>
              <Circle
                x={24 + scene.goal.x * pixelsPerMeter}
                y={size.height - 24 - scene.goal.y * pixelsPerMeter}
                radius={scene.goal.positionToleranceM * pixelsPerMeter}
                stroke={colors.success}
                dash={[7, 5]}
                strokeWidth={2}
              />
              <Line
                points={[
                  24 + scene.goal.x * pixelsPerMeter,
                  size.height - 24 - scene.goal.y * pixelsPerMeter,
                  24 + (scene.goal.x + Math.cos(scene.goal.heading)) * pixelsPerMeter,
                  size.height - 24 - (scene.goal.y + Math.sin(scene.goal.heading)) * pixelsPerMeter,
                ]}
                stroke={colors.success}
                strokeWidth={3}
              />
            </Group>
          ) : null}
          {trajectory ? (
            <Line
              points={trajectory.points.flatMap((point) =>
                stagePoint([point.pose.x, point.pose.y], size.height, pixelsPerMeter),
              )}
              stroke={colors.success}
              strokeWidth={3}
              dash={[10, 5]}
              lineCap="round"
              listening={false}
            />
          ) : null}
          {draftPoints.length ? (
            <Line
              points={draftPoints.flatMap((point) =>
                stagePoint(point, size.height, pixelsPerMeter),
              )}
              stroke={colors.accent}
              strokeWidth={2}
              dash={[6, 4]}
              closed={tool === "wall" || tool === "area"}
              listening={false}
            />
          ) : null}
          {vehiclePose ? (
            <VehicleShape
              pose={vehiclePose}
              height={size.height}
              pixelsPerMeter={pixelsPerMeter}
              colors={colors}
            />
          ) : null}
          <Text
            x={size.width - 96}
            y={size.height - 20}
            text="1 ô = 1 m"
            fill={colors.ink}
            fontSize={11}
          />
        </Layer>
      </Stage>
    </div>
  );
}
