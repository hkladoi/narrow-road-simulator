"use client";

import {
  BUILT_IN_SCENARIO_TEMPLATES,
  type PolygonObstacle,
  type VehicleProfile,
} from "@nrs/domain";
import { buildGuidance } from "@nrs/guidance";
import type { PlannerWorkerResponse } from "@nrs/planner";
import { playbackTimeAfterTick } from "@nrs/playback";
import {
  createManualSimulationState,
  stepManualSimulation,
  type Gear,
  type ManualSimulationState,
} from "@nrs/simulator";
import type { VehicleCandidate, VehicleSearchResponse } from "@nrs/vehicle-catalog";
import { BUILT_IN_VEHICLE_PROFILES } from "@nrs/vehicle-model";
import {
  ArrowDownToLine,
  CarFront,
  Check,
  CircleDotDashed,
  Command,
  CornerUpLeft,
  CornerUpRight,
  DoorOpen,
  Eraser,
  Gauge,
  Goal,
  LoaderCircle,
  MousePointer2,
  OctagonX,
  Pause,
  Play,
  Save,
  Search,
  SquareDashedMousePointer,
  BrickWall,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useWorkbenchStore, type EditorTool } from "../lib/store";
import { SceneCanvas } from "./scene-canvas";

function ToolButton({
  label,
  active = false,
  disabled = false,
  loading = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="icon-button"
      data-active={active || undefined}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="spin" /> : children}
    </button>
  );
}

function StatusPill() {
  const status = useWorkbenchStore((state) => state.plannerStatus);
  const message =
    status === "planning"
      ? "Đang tìm đường"
      : status === "ready"
        ? "Đã có quỹ đạo"
        : status === "failed"
          ? "Chưa tìm được đường"
          : "Sẵn sàng";
  return (
    <span className="status-pill" data-tone={status}>
      {status === "ready" ? (
        <Check aria-hidden="true" />
      ) : status === "failed" ? (
        <OctagonX aria-hidden="true" />
      ) : status === "planning" ? (
        <LoaderCircle aria-hidden="true" className="spin" />
      ) : (
        <CircleDotDashed aria-hidden="true" />
      )}
      {message}
    </span>
  );
}

function Toolbar({ openCommands }: { openCommands: () => void }) {
  const tool = useWorkbenchStore((state) => state.tool);
  const draftPoints = useWorkbenchStore((state) => state.draftPoints);
  const past = useWorkbenchStore((state) => state.past);
  const future = useWorkbenchStore((state) => state.future);
  const setTool = useWorkbenchStore((state) => state.setTool);
  const commitDraft = useWorkbenchStore((state) => state.commitDraft);
  const clearDraft = useWorkbenchStore((state) => state.clearDraft);
  const undo = useWorkbenchStore((state) => state.undo);
  const redo = useWorkbenchStore((state) => state.redo);
  const tools: readonly [EditorTool, string, ReactNode][] = [
    ["select", "Chọn và di chuyển", <MousePointer2 key="select" />],
    ["wall", "Vẽ tường hoặc vật cản", <BrickWall key="wall" />],
    ["area", "Vẽ vùng có thể chạy", <SquareDashedMousePointer key="area" />],
    ["gate", "Đặt cổng đo", <DoorOpen key="gate" />],
    ["goal", "Đặt đích", <Goal key="goal" />],
  ];
  return (
    <div className="toolbar" role="toolbar" aria-label="Công cụ biên tập">
      {tools.map(([value, label, icon]) => (
        <ToolButton
          key={value}
          label={label}
          active={tool === value}
          onClick={() => setTool(value)}
        >
          {icon}
        </ToolButton>
      ))}
      <span className="toolbar-divider" aria-hidden="true" />
      <ToolButton
        label="Hoàn tất hình đang vẽ"
        disabled={draftPoints.length === 0}
        onClick={commitDraft}
      >
        <Check />
      </ToolButton>
      <ToolButton label="Bỏ hình đang vẽ" disabled={draftPoints.length === 0} onClick={clearDraft}>
        <Eraser />
      </ToolButton>
      <span className="toolbar-divider" aria-hidden="true" />
      <ToolButton label="Hoàn tác" disabled={past.length === 0} onClick={undo}>
        <CornerUpLeft />
      </ToolButton>
      <ToolButton label="Làm lại" disabled={future.length === 0} onClick={redo}>
        <CornerUpRight />
      </ToolButton>
      <span className="toolbar-spacer" />
      <button className="command-trigger" onClick={openCommands}>
        <Command aria-hidden="true" />
        <span>Lệnh</span>
        <kbd>Ctrl K</kbd>
      </button>
    </div>
  );
}

function TemplateChooser() {
  const scene = useWorkbenchStore((state) => state.scene);
  const setScene = useWorkbenchStore((state) => state.setScene);
  return (
    <label className="field compact-field">
      <span>Mẫu đường</span>
      <select
        value={
          BUILT_IN_SCENARIO_TEMPLATES.find((item) => item.scene.name === scene.name)?.slug ??
          "custom"
        }
        onChange={(event) => {
          const selected = BUILT_IN_SCENARIO_TEMPLATES.find(
            (item) => item.slug === event.target.value,
          );
          if (selected) setScene(selected.scene);
        }}
      >
        <option value="custom">Kịch bản tùy chỉnh</option>
        {BUILT_IN_SCENARIO_TEMPLATES.map((template) => (
          <option key={template.slug} value={template.slug}>
            {template.name}
          </option>
        ))}
      </select>
      <span className="field-help">5 fixture chuẩn cho đường hẹp.</span>
    </label>
  );
}

function VehicleChooser() {
  const vehicle = useWorkbenchStore((state) => state.selectedVehicle);
  const setVehicle = useWorkbenchStore((state) => state.setVehicle);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly VehicleCandidate[]>([]);
  const [candidate, setCandidate] = useState<VehicleCandidate>();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function searchVehicles() {
    if (!query.trim()) return;
    setState("loading");
    setMessage("");
    try {
      const response = await fetch(`/api/vehicles/search?query=${encodeURIComponent(query)}`);
      const payload = (await response.json()) as VehicleSearchResponse | { message: string };
      if (!response.ok || !("results" in payload))
        throw new Error("message" in payload ? payload.message : "Không thể tìm xe.");
      setResults(payload.results);
      setCandidate(undefined);
      setState("idle");
      setMessage(
        `${String(payload.results.length)} kết quả${payload.braveUsed ? " · đã tra Brave" : " · từ cơ sở dữ liệu"}`,
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Không thể tìm xe.");
    }
  }

  async function resolveCandidate() {
    if (!candidate) return;
    setState("loading");
    try {
      const response = await fetch("/api/vehicles/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidate),
      });
      const payload = (await response.json()) as { profile?: VehicleProfile; message?: string };
      if (!response.ok || !payload.profile)
        throw new Error(payload.message ?? "Không thể xác minh cấu hình xe.");
      setVehicle(payload.profile);
      setState("idle");
      setMessage(`Đã chọn ${payload.profile.name}.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Không thể xác minh cấu hình xe.");
    }
  }

  return (
    <section className="inspector-section">
      <div className="section-title">
        <CarFront aria-hidden="true" />
        <h2>Xe mô phỏng</h2>
      </div>
      <label className="field">
        <span>Hồ sơ hiện tại</span>
        <select
          value={vehicle.id}
          onChange={(event) => {
            const profile = BUILT_IN_VEHICLE_PROFILES.find(
              (item) => item.id === event.target.value,
            );
            if (profile) setVehicle(profile);
          }}
        >
          {BUILT_IN_VEHICLE_PROFILES.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
          {!BUILT_IN_VEHICLE_PROFILES.some((item) => item.id === vehicle.id) ? (
            <option value={vehicle.id}>{vehicle.name}</option>
          ) : null}
        </select>
        <span className="field-help">
          {vehicle.lengthM.toFixed(2)} × {vehicle.widthM.toFixed(2)} m · trục cơ sở{" "}
          {vehicle.wheelbaseM.toFixed(2)} m
        </span>
      </label>
      <div className="search-row">
        <label className="field">
          <span>Tìm xe thật</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void searchVehicles();
            }}
            placeholder="Ví dụ: VF 5"
            aria-describedby="vehicle-search-help"
          />
        </label>
        <button
          className="secondary-button square-action"
          onClick={() => void searchVehicles()}
          disabled={state === "loading" || !query.trim()}
          aria-label="Tìm xe"
        >
          {state === "loading" ? <LoaderCircle className="spin" /> : <Search />}
        </button>
      </div>
      <div id="vehicle-search-help" className="field-help stable-help" role="status">
        {message || "Tìm DB trước; Brave chỉ chạy khi DB chưa đủ kết quả."}
      </div>
      {results.length ? (
        <div className="candidate-list" role="listbox" aria-label="Ứng viên xe">
          {results.map((result) => (
            <button
              key={`${result.canonicalKey ?? "candidate"}-${result.displayName}`}
              role="option"
              aria-selected={candidate === result}
              className="candidate"
              data-selected={candidate === result || undefined}
              onClick={() => setCandidate(result)}
            >
              <span>{result.displayName}</span>
              <small>
                {result.source === "DATABASE" ? "Cơ sở dữ liệu" : "Ứng viên web"} ·{" "}
                {result.dataStatus}
              </small>
            </button>
          ))}
        </div>
      ) : null}
      {candidate ? (
        <button
          className="primary-button full-button"
          onClick={() => void resolveCandidate()}
          disabled={state === "loading"}
        >
          {state === "loading" ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}Xác minh và
          dùng xe
        </button>
      ) : null}
    </section>
  );
}

function ObjectInspector() {
  const scene = useWorkbenchStore((state) => state.scene);
  const selectedId = useWorkbenchStore((state) => state.selectedObjectId);
  const update = useWorkbenchStore((state) => state.updateSelectedObject);
  const deleteSelected = useWorkbenchStore((state) => state.deleteSelected);
  const object = scene.objects.find((item) => item.id === selectedId);
  if (!object)
    return (
      <section className="inspector-section empty-selection">
        <MousePointer2 aria-hidden="true" />
        <p>Chọn một đối tượng trên bản vẽ để sửa tọa độ chính xác.</p>
      </section>
    );
  const selectedObject = object;
  function updatePoint(index: number, axis: 0 | 1, value: number) {
    if (selectedObject.type === "gate") {
      const start = [...selectedObject.start] as [number, number];
      const end = [...selectedObject.end] as [number, number];
      (index === 0 ? start : end)[axis] = value;
      update({ ...selectedObject, start, end });
      return;
    }
    const polygon = selectedObject.polygon.map((point, pointIndex) =>
      pointIndex === index
        ? (point.map((coordinate, coordinateIndex) =>
            coordinateIndex === axis ? value : coordinate,
          ) as [number, number])
        : point,
    );
    update({ ...selectedObject, polygon });
  }
  const points = object.type === "gate" ? [object.start, object.end] : object.polygon;
  return (
    <section className="inspector-section">
      <div className="section-title">
        <SquareDashedMousePointer aria-hidden="true" />
        <h2>Thuộc tính</h2>
      </div>
      <dl className="spec-list">
        <div>
          <dt>Loại</dt>
          <dd>{object.type}</dd>
        </div>
        <div>
          <dt>ID</dt>
          <dd className="mono truncate">{object.id}</dd>
        </div>
      </dl>
      <div className="point-grid">
        <span>Điểm</span>
        <span>X (m)</span>
        <span>Y (m)</span>
        {points.map((point, index) => (
          <div className="point-row" key={index}>
            <span>{index + 1}</span>
            <input
              type="number"
              step="0.1"
              value={point[0]}
              onChange={(event) => updatePoint(index, 0, Number(event.target.value))}
              aria-label={`Điểm ${String(index + 1)}, X`}
            />
            <input
              type="number"
              step="0.1"
              value={point[1]}
              onChange={(event) => updatePoint(index, 1, Number(event.target.value))}
              aria-label={`Điểm ${String(index + 1)}, Y`}
            />
          </div>
        ))}
      </div>
      <button className="danger-button full-button" onClick={deleteSelected}>
        <X aria-hidden="true" />
        Xóa đối tượng
      </button>
    </section>
  );
}

function PlannerPanel() {
  const scene = useWorkbenchStore((state) => state.scene);
  const vehicle = useWorkbenchStore((state) => state.selectedVehicle);
  const status = useWorkbenchStore((state) => state.plannerStatus);
  const message = useWorkbenchStore((state) => state.plannerMessage);
  const metrics = useWorkbenchStore((state) => state.plannerMetrics);
  const trajectory = useWorkbenchStore((state) => state.trajectory);
  const setStatus = useWorkbenchStore((state) => state.setPlannerStatus);
  const setResult = useWorkbenchStore((state) => state.setPlannerResult);
  const workerRef = useRef<Worker | undefined>(undefined);
  const requestIdRef = useRef<string | undefined>(undefined);
  const guidance = useMemo(() => (trajectory ? buildGuidance(trajectory) : []), [trajectory]);

  useEffect(() => () => workerRef.current?.terminate(), []);
  function plan() {
    if (!scene.vehicle || !scene.goal) {
      setStatus("failed", "Cần đặt vị trí xe và đích trước khi tìm đường.");
      return;
    }
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../lib/planner.worker.ts", import.meta.url), {
      type: "module",
    });
    const requestId = crypto.randomUUID();
    workerRef.current = worker;
    requestIdRef.current = requestId;
    setStatus("planning", "Hybrid A* đang mở rộng trạng thái…");
    worker.onmessage = (event: MessageEvent<PlannerWorkerResponse>) => {
      if (event.data.requestId !== requestId || event.data.type !== "result") return;
      setResult(event.data.result);
      worker.terminate();
    };
    worker.onerror = () => setStatus("failed", "Web Worker lập kế hoạch đã dừng ngoài dự kiến.");
    worker.postMessage({
      type: "plan",
      requestId,
      payload: {
        start: scene.vehicle.pose,
        goal: scene.goal,
        vehicle,
        obstacles: scene.objects.filter(
          (object): object is PolygonObstacle =>
            object.type !== "drivableArea" && object.type !== "gate",
        ),
        config: { safetyMarginM: scene.safetyMarginM ?? 0.15 },
      },
    });
  }
  function cancel() {
    if (workerRef.current && requestIdRef.current)
      workerRef.current.postMessage({ type: "cancel", requestId: requestIdRef.current });
  }
  return (
    <section className="inspector-section">
      <div className="section-title">
        <Gauge aria-hidden="true" />
        <h2>Quỹ đạo</h2>
      </div>
      <div className="button-row">
        <button className="primary-button" onClick={plan} disabled={status === "planning"}>
          {status === "planning" ? <LoaderCircle className="spin" /> : <Gauge />}Tìm đường
        </button>
        {status === "planning" ? (
          <button className="secondary-button" onClick={cancel}>
            <Pause />
            Hủy
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="inline-message" data-tone={status}>
          {message}
        </p>
      ) : null}
      {metrics ? (
        <dl className="spec-list metrics">
          <div>
            <dt>Thời gian</dt>
            <dd>{Math.round(metrics.elapsedMs)} ms</dd>
          </div>
          <div>
            <dt>Nút mở rộng</dt>
            <dd>{metrics.expandedNodes.toLocaleString("vi-VN")}</dd>
          </div>
          <div>
            <dt>Quãng đường</dt>
            <dd>{metrics.pathLengthM.toFixed(1)} m</dd>
          </div>
          <div>
            <dt>Khoảng hở min</dt>
            <dd>
              {Number.isFinite(metrics.minimumClearanceM)
                ? metrics.minimumClearanceM.toFixed(2)
                : "∞"}{" "}
              m
            </dd>
          </div>
        </dl>
      ) : null}
      {guidance.length ? (
        <ol className="guidance-list">
          {guidance.map((step) => (
            <li key={step.index}>
              <span>{step.index + 1}</span>
              <p>{step.instructionVi}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function PlaybackBar() {
  const trajectory = useWorkbenchStore((state) => state.trajectory);
  const time = useWorkbenchStore((state) => state.playbackTimeS);
  const setTime = useWorkbenchStore((state) => state.setPlaybackTime);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const previousRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing || !trajectory) return;
    let frame = 0;
    const tick = (now: number) => {
      const previous = previousRef.current ?? now;
      previousRef.current = now;
      const current = useWorkbenchStore.getState().playbackTimeS;
      const next = playbackTimeAfterTick(
        current,
        (now - previous) / 1000,
        speed,
        trajectory.estimatedDurationS,
      );
      setTime(next);
      if (next >= trajectory.estimatedDurationS) {
        setPlaying(false);
        previousRef.current = undefined;
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      previousRef.current = undefined;
    };
  }, [playing, setTime, speed, trajectory]);
  return (
    <div className="playback-bar">
      <button
        className="icon-button"
        aria-label={playing ? "Tạm dừng phát lại" : "Phát quỹ đạo"}
        disabled={!trajectory}
        onClick={() => {
          if (trajectory && time >= trajectory.estimatedDurationS) setTime(0);
          setPlaying((value) => !value);
        }}
      >
        {playing ? <Pause /> : <Play />}
      </button>
      <label>
        <span className="sr-only">Vị trí phát lại</span>
        <input
          type="range"
          min="0"
          max={trajectory?.estimatedDurationS ?? 1}
          step="0.01"
          value={time}
          disabled={!trajectory}
          onChange={(event) => setTime(Number(event.target.value))}
        />
      </label>
      <span className="mono playback-time">
        {time.toFixed(1)} / {(trajectory?.estimatedDurationS ?? 0).toFixed(1)} s
      </span>
      <label className="speed-select">
        <span>Tốc độ</span>
        <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          <option value="0.5">0,5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
        </select>
      </label>
    </div>
  );
}

function ManualDrive() {
  const scene = useWorkbenchStore((state) => state.scene);
  const profile = useWorkbenchStore((state) => state.selectedVehicle);
  const setVehiclePose = useWorkbenchStore((state) => state.setVehiclePose);
  const [enabled, setEnabled] = useState(false);
  const [gear, setGear] = useState<Gear>("D");
  const [collision, setCollision] = useState(false);
  const keys = useRef(new Set<string>());
  const simulation = useRef<ManualSimulationState | undefined>(undefined);
  const obstacles = useMemo(
    () =>
      scene.objects.filter(
        (object): object is PolygonObstacle =>
          object.type !== "drivableArea" && object.type !== "gate",
      ),
    [scene.objects],
  );
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current.add(event.key.toLowerCase());
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useEffect(() => {
    if (!enabled || !scene.vehicle) return;
    simulation.current = createManualSimulationState(profile, scene.vehicle.pose, obstacles);
    const timer = window.setInterval(() => {
      const current = simulation.current;
      if (!current) return;
      const next = stepManualSimulation(
        current,
        {
          gear,
          throttle: keys.current.has("w") || keys.current.has("arrowup") ? 1 : 0,
          brake: keys.current.has(" ") || keys.current.has("s") || keys.current.has("arrowdown"),
          steer:
            keys.current.has("a") || keys.current.has("arrowleft")
              ? 1
              : keys.current.has("d") || keys.current.has("arrowright")
                ? -1
                : 0,
        },
        profile,
        obstacles,
        0.025,
      );
      simulation.current = next;
      setVehiclePose(next.pose);
      setCollision(next.collision.colliding);
    }, 25);
    return () => window.clearInterval(timer);
  }, [enabled, gear, obstacles, profile, scene.vehicle, setVehiclePose]);
  return (
    <div className="manual-drive">
      <button
        className="secondary-button"
        data-active={enabled || undefined}
        onClick={() => setEnabled((value) => !value)}
      >
        <CarFront />
        {enabled ? "Dừng lái" : "Lái tay"}
      </button>
      <div className="gear-toggle" aria-label="Chọn số">
        <button data-active={gear === "D" || undefined} onClick={() => setGear("D")}>
          D
        </button>
        <button data-active={gear === "R" || undefined} onClick={() => setGear("R")}>
          R
        </button>
      </div>
      <span className="drive-help">WASD / phím mũi tên · Space để phanh</span>
      {collision ? (
        <span className="collision-label">
          <OctagonX />
          Va chạm
        </span>
      ) : null}
    </div>
  );
}

function CommandPalette({ dialogRef }: { dialogRef: React.RefObject<HTMLDialogElement | null> }) {
  const [query, setQuery] = useState("");
  const setTool = useWorkbenchStore((state) => state.setTool);
  const setScene = useWorkbenchStore((state) => state.setScene);
  const commands = [
    { label: "Chọn đối tượng", run: () => setTool("select") },
    { label: "Vẽ tường", run: () => setTool("wall") },
    { label: "Vẽ vùng chạy", run: () => setTool("area") },
    { label: "Đặt đích", run: () => setTool("goal") },
    ...BUILT_IN_SCENARIO_TEMPLATES.map((template) => ({
      label: `Mở ${template.name}`,
      run: () => setScene(template.scene),
    })),
  ].filter((command) =>
    command.label.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
  );
  return (
    <dialog ref={dialogRef} className="command-dialog" onClose={() => setQuery("")}>
      <div className="command-search">
        <Search aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Gõ tên lệnh…"
          aria-label="Tìm lệnh"
        />
        <button
          className="icon-button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Đóng bảng lệnh"
        >
          <X />
        </button>
      </div>
      <div className="command-list">
        {commands.map((command) => (
          <button
            key={command.label}
            onClick={() => {
              command.run();
              dialogRef.current?.close();
            }}
          >
            {command.label}
            <kbd>Enter</kbd>
          </button>
        ))}
      </div>
    </dialog>
  );
}

export default function Workbench() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scene = useWorkbenchStore((state) => state.scene);
  const setScene = useWorkbenchStore((state) => state.setScene);
  const deleteSelected = useWorkbenchStore((state) => state.deleteSelected);
  const undo = useWorkbenchStore((state) => state.undo);
  const redo = useWorkbenchStore((state) => state.redo);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "error">("idle");
  const openCommands = useCallback(() => dialogRef.current?.showModal(), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommands();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (
        event.key === "Delete" ||
        (event.key === "Backspace" && !(event.target instanceof HTMLInputElement))
      )
        deleteSelected();
      if (event.key === "Escape") useWorkbenchStore.getState().clearDraft();
      if (event.key === "Enter" && useWorkbenchStore.getState().draftPoints.length)
        useWorkbenchStore.getState().commitDraft();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, openCommands, redo, undo]);
  async function saveScenario() {
    setSaving(true);
    setSaveState("idle");
    try {
      const response = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: scene.name, scene }),
      });
      if (!response.ok) throw new Error("Không lưu được kịch bản vào PostgreSQL.");
    } catch {
      setSaveState("error");
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            NR
          </span>
          <div>
            <h1>Narrow Road</h1>
            <p>Mô phỏng quỹ đạo xe · đơn vị mét</p>
          </div>
        </div>
        <div className="header-actions">
          <StatusPill />
          <button
            className="secondary-button"
            onClick={() => void saveScenario()}
            disabled={saving}
          >
            {saving ? <LoaderCircle className="spin" /> : <Save />}Lưu
          </button>
        </div>
      </header>
      <Toolbar openCommands={openCommands} />
      <section className="workbench-grid">
        <aside className="setup-panel">
          <TemplateChooser />
          <label className="field">
            <span>Tên kịch bản</span>
            <input
              value={scene.name}
              onChange={(event) => setScene({ ...scene, name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Khoảng an toàn (m)</span>
            <input
              type="number"
              min="0"
              max="2"
              step="0.05"
              value={scene.safetyMarginM ?? 0}
              onChange={(event) =>
                setScene({ ...scene, safetyMarginM: Number(event.target.value) })
              }
            />
            <span className="field-help">Được cộng vào thân xe khi hậu kiểm.</span>
          </label>
          <VehicleChooser />
        </aside>
        <section className="canvas-panel">
          <div className="canvas-heading">
            <div>
              <h2>Mặt bằng</h2>
              <p>Trục X sang phải · Y hướng lên · góc 0 theo +X</p>
            </div>
            <span className="mono">Snap {scene.world.gridSize.toFixed(1)} m</span>
          </div>
          <SceneCanvas />
          {saveState === "error" ? (
            <div className="toast-error" role="alert">
              <OctagonX />
              Không lưu được kịch bản. Kiểm tra DATABASE_URL rồi thử lại.
            </div>
          ) : null}
        </section>
        <aside className="inspector-panel">
          <ObjectInspector />
          <PlannerPanel />
        </aside>
      </section>
      <div className="bottom-dock">
        <ManualDrive />
        <PlaybackBar />
      </div>
      <footer className="app-footer">
        <span>Narrow Road Simulator · V1–V3</span>
        <span>Hệ tọa độ world: m / rad · bicycle model · Hybrid A*</span>
      </footer>
      <CommandPalette dialogRef={dialogRef} />
    </main>
  );
}
