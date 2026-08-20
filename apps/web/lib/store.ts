"use client";

import {
  BUILT_IN_SCENARIO_TEMPLATES,
  type Pose,
  type Scene,
  type SceneObject,
  type Vec2,
  type VehicleProfile,
} from "@nrs/domain";
import type { PlannerMetrics, PlannerResult, Trajectory } from "@nrs/planner";
import { BUILT_IN_VEHICLE_PROFILES } from "@nrs/vehicle-model";
import { create } from "zustand";

export type EditorTool = "select" | "wall" | "area" | "gate" | "goal";

type Snapshot = Readonly<{ scene: Scene }>;

type WorkbenchState = {
  scene: Scene;
  selectedObjectId: string | undefined;
  selectedVehicle: VehicleProfile;
  tool: EditorTool;
  draftPoints: Vec2[];
  past: Snapshot[];
  future: Snapshot[];
  trajectory: Trajectory | undefined;
  plannerMetrics: PlannerMetrics | undefined;
  plannerStatus: "idle" | "planning" | "ready" | "failed";
  plannerMessage: string | undefined;
  playbackTimeS: number;
  setTool: (tool: EditorTool) => void;
  setScene: (scene: Scene) => void;
  setSelectedObject: (id?: string) => void;
  setVehicle: (vehicle: VehicleProfile) => void;
  setVehiclePose: (pose: Pose, recordHistory?: boolean) => void;
  addDraftPoint: (point: Vec2) => void;
  clearDraft: () => void;
  commitDraft: () => void;
  moveObject: (id: string, delta: Vec2) => void;
  updateSelectedObject: (object: SceneObject) => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  setPlannerStatus: (status: WorkbenchState["plannerStatus"], message?: string) => void;
  setPlannerResult: (result: PlannerResult) => void;
  setPlaybackTime: (timeS: number) => void;
};

const initialTemplate = BUILT_IN_SCENARIO_TEMPLATES[0];
const initialVehicle = BUILT_IN_VEHICLE_PROFILES[0];
if (!initialTemplate || !initialVehicle)
  throw new Error("Built-in templates and vehicles are required.");

function withHistory(state: WorkbenchState, scene: Scene) {
  return {
    scene,
    past: [...state.past.slice(-49), { scene: state.scene }],
    future: [],
    trajectory: undefined,
    plannerMetrics: undefined,
    plannerStatus: "idle" as const,
    plannerMessage: undefined,
    playbackTimeS: 0,
  };
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  scene: initialTemplate.scene,
  selectedVehicle: initialVehicle,
  selectedObjectId: undefined,
  tool: "select",
  draftPoints: [],
  past: [],
  future: [],
  plannerStatus: "idle",
  plannerMessage: undefined,
  plannerMetrics: undefined,
  trajectory: undefined,
  playbackTimeS: 0,
  setTool: (tool) => set({ tool, draftPoints: [], selectedObjectId: undefined }),
  setScene: (scene) =>
    set((state) => ({
      ...withHistory(state, scene),
      selectedObjectId: undefined,
      draftPoints: [],
    })),
  setSelectedObject: (selectedObjectId) => set({ selectedObjectId }),
  setVehicle: (selectedVehicle) =>
    set((state) => {
      const vehicle = state.scene.vehicle
        ? { ...state.scene.vehicle, profileId: selectedVehicle.id }
        : { profileId: selectedVehicle.id, pose: { x: 2.2, y: 2.25, heading: 0 } };
      return { ...withHistory(state, { ...state.scene, vehicle }), selectedVehicle };
    }),
  setVehiclePose: (pose, recordHistory = false) =>
    set((state) => {
      const scene = { ...state.scene, vehicle: { profileId: state.selectedVehicle.id, pose } };
      return recordHistory ? withHistory(state, scene) : { scene };
    }),
  addDraftPoint: (point) => set((state) => ({ draftPoints: [...state.draftPoints, point] })),
  clearDraft: () => set({ draftPoints: [] }),
  commitDraft: () =>
    set((state) => {
      const points = state.draftPoints;
      if (state.tool === "goal" && points[0]) {
        const [x, y] = points[0];
        return {
          ...withHistory(state, {
            ...state.scene,
            goal: {
              type: "pose",
              x,
              y,
              heading: 0,
              positionToleranceM: 0.35,
              headingToleranceRad: 0.17,
            },
          }),
          draftPoints: [],
          tool: "select",
        };
      }
      if (state.tool === "gate" && points.length >= 2) {
        const [start, end] = points;
        if (!start || !end) return {};
        const object: SceneObject = {
          id: crypto.randomUUID(),
          type: "gate",
          start,
          end,
          label: "Cổng",
        };
        return {
          ...withHistory(state, { ...state.scene, objects: [...state.scene.objects, object] }),
          draftPoints: [],
          tool: "select",
        };
      }
      if ((state.tool === "wall" || state.tool === "area") && points.length >= 3) {
        const object: SceneObject = {
          id: crypto.randomUUID(),
          type: state.tool === "wall" ? "wall" : "drivableArea",
          polygon: points,
        };
        return {
          ...withHistory(state, { ...state.scene, objects: [...state.scene.objects, object] }),
          draftPoints: [],
          tool: "select",
        };
      }
      return {};
    }),
  moveObject: (id, [dx, dy]) =>
    set((state) => {
      const objects = state.scene.objects.map((object): SceneObject => {
        if (object.id !== id) return object;
        if (object.type === "gate") {
          return {
            ...object,
            start: [object.start[0] + dx, object.start[1] + dy],
            end: [object.end[0] + dx, object.end[1] + dy],
          };
        }
        return { ...object, polygon: object.polygon.map(([x, y]) => [x + dx, y + dy] as const) };
      });
      return withHistory(state, { ...state.scene, objects });
    }),
  updateSelectedObject: (updated) =>
    set((state) =>
      withHistory(state, {
        ...state.scene,
        objects: state.scene.objects.map((object) => (object.id === updated.id ? updated : object)),
      }),
    ),
  deleteSelected: () =>
    set((state) => {
      if (!state.selectedObjectId) return {};
      return {
        ...withHistory(state, {
          ...state.scene,
          objects: state.scene.objects.filter((object) => object.id !== state.selectedObjectId),
        }),
        selectedObjectId: undefined,
      };
    }),
  undo: () =>
    set((state) => {
      const snapshot = state.past.at(-1);
      if (!snapshot) return {};
      return {
        scene: snapshot.scene,
        past: state.past.slice(0, -1),
        future: [{ scene: state.scene }, ...state.future],
        selectedObjectId: undefined,
        trajectory: undefined,
        plannerStatus: "idle",
      };
    }),
  redo: () =>
    set((state) => {
      const snapshot = state.future[0];
      if (!snapshot) return {};
      return {
        scene: snapshot.scene,
        past: [...state.past, { scene: state.scene }],
        future: state.future.slice(1),
        selectedObjectId: undefined,
        trajectory: undefined,
        plannerStatus: "idle",
      };
    }),
  setPlannerStatus: (plannerStatus, plannerMessage) => set({ plannerStatus, plannerMessage }),
  setPlannerResult: (result) =>
    set(
      result.ok
        ? {
            trajectory: result.trajectory,
            plannerMetrics: result.metrics,
            plannerStatus: "ready",
            plannerMessage: undefined,
            playbackTimeS: 0,
          }
        : {
            trajectory: undefined,
            plannerMetrics: result.metrics,
            plannerStatus: "failed",
            plannerMessage: result.message,
            playbackTimeS: 0,
          },
    ),
  setPlaybackTime: (playbackTimeS) => set({ playbackTimeS }),
}));
