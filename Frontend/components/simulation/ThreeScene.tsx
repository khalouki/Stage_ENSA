"use client";

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MachineId, SimulationMove } from "@/lib/simulation";
import { applyModelVisibilityConfig } from "@/components/3D_design/modelConfigs";
import {
  computeCncBedMotionWorldBounds,
  computeCncMotionWorldBounds,
  createCncSurfaceReference,
  setupCncKinematics,
  syncCncMechanics,
  type CncKinematics,
} from "@/components/simulation/machines/cncKinematics";
import {
  attachCncLaserBeamMesh,
  createCncLaserEffect,
  updateCncLaserEffect,
  type CncLaserEffect,
} from "@/components/simulation/machines/cncLaserEffect";
import {
  attachCncDebugHelpers,
  CNC_MODEL_DEBUG,
  logCncSceneGraph,
} from "@/components/simulation/machines/cncModelDebug";
import {
  CNC_DEBUG_PART_CANDIDATES,
  CNC_HEAD_LOCAL_MOVEMENT,
  CNC_HEAD_VISIBLE_COLOR,
  CNC_HEAD_VISIBLE_EMISSIVE,
  CNC_HEAD_VISIBLE_METALNESS,
  CNC_HEAD_VISIBLE_ROUGHNESS,
} from "@/components/simulation/machines/cncConfig";
import {
  detectSurfaceReference,
  PathAlignment,
  SurfaceReference,
} from "@/components/simulation/alignment";
import {
  COLOR_CUT,
  COLOR_DONE,
  COLOR_RAPID,
  COLOR_WORKPIECE,
  MAX_STORED_SEGS,
  MODEL_TARGET_MAX_DIM,
  SURFACE_CLEARANCE_CNC,
  SURFACE_CLEARANCE_PRINTER,
} from "@/components/simulation/scene/sceneConstants";
import {
  buildMachinePathAlignment,
  computePrinterMotionWorldBounds as computePrinterMotionWorldBoundsForMoves,
  createPrinterKinematics,
  createPrinterSurfaceReference,
  findPrinterBedObject,
  syncPrinterMechanics as syncPrinterMechanicsForTool,
  tickPrinterBed as tickPrinterBedForKinematics,
} from "@/components/simulation/machines/printerKinematics";
import {
  PRINTER_BEAD_Y_OFFSET,
  PRINTER_BED_ROOT_PART,
  PRINTER_MIN_Z_SCALE,
  type PrintChunk,
  type PrintSegmentDescriptor,
  type PrintedObjectReveal,
  type PrinterKinematics,
} from "@/components/simulation/machines/printerConfig";
import {
  buildPrintedGeometry as buildPrinterPrintedGeometry,
  buildPrinterPrintSegments,
  createPrinterGhostPath,
  updatePrintChunksColor,
  updatePrintedGeometry as updatePrinterPrintedGeometry,
} from "@/components/simulation/machines/printerVisuals";
import { tickPrinterAnimation } from "@/components/simulation/machines/printerAnimation";
import { createSimulationScene } from "@/components/simulation/scene/sceneSetup";

type Props = {
  moves: SimulationMove[];
  isPlaying: boolean;
  playbackSpeed: number;
  resetKey: number;
  modelPath?: string;
  machineType?: MachineId | "generic";
  printLineColor?: string;
  printLineThickness?: PrintLineThickness;
  printerRenderMode?: PrinterRenderMode;
  dark?: boolean;
  onPositionUpdate: (pos: { x: string; y: string; z: string }) => void;
  onProgressUpdate: (pct: number) => void;
};

type CameraViewState = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
};

type ViewPreset = "reset" | "top" | "front" | "side";
type PrintLineThickness = "thin" | "medium" | "thick";
export type PrinterRenderMode = "object" | "gcode";

type CncPathSegment = {
  from: SimulationMove;
  to: SimulationMove;
  moveIndex: number;
};

type CncCuttingSegment = THREE.Vector3[];

type CncAnimationEdge = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  from: SimulationMove;
  to: SimulationMove;
  isCutting: boolean;
};

type CncParsedPath = {
  cuttingSegments: CncPathSegment[];
  travelSegments: CncPathSegment[];
  bbox: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null;
};

function formatVector3(vector: THREE.Vector3): [number, number, number] {
  return [
    Number(vector.x.toFixed(3)),
    Number(vector.y.toFixed(3)),
    Number(vector.z.toFixed(3)),
  ];
}

type CncPrintAnimationState = {
  segmentIndex: number;
  pointIndex: number;
  edgeT: number;
  completedEdges: number;
  totalEdges: number;
};

type CncWorkspacePoint = {
  x: number;
  y: number;
  workspaceY: number;
};

const CNC_TRACE_SURFACE_OFFSET = 0.018;
const CNC_DEFAULT_FEED_RATE_MM_PER_MIN = 1000;
const CNC_RAPID_FEED_RATE_MM_PER_MIN = 7200;
const CNC_TINY_MOVE_MM = 0.5;
const CNC_MIN_SEGMENT_SECONDS = 0.012;
const CNC_MAX_EDGES_PER_FRAME = 400;

function createCncPrintAnimationState(totalEdges = 0): CncPrintAnimationState {
  return {
    segmentIndex: 0,
    pointIndex: 0,
    edgeT: 0,
    completedEdges: 0,
    totalEdges,
  };
}

function getCncMinimumEdgeSeconds(speedMultiplier: number): number {
  return CNC_MIN_SEGMENT_SECONDS / Math.max(speedMultiplier, 1);
}

function getCncMoveDistanceMm(from: SimulationMove, to: SimulationMove): number {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

function getCncMoveDurationSeconds(from: SimulationMove, to: SimulationMove, selectedSpeedMultiplier: number): number {
  const distanceMm = getCncMoveDistanceMm(from, to);
  if (distanceMm < CNC_TINY_MOVE_MM) return 0;

  const feedRateMmPerMinute =
    to.type === "rapid"
      ? CNC_RAPID_FEED_RATE_MM_PER_MIN
      : Number.isFinite(to.feedRate) && to.feedRate > 0
      ? to.feedRate
      : CNC_DEFAULT_FEED_RATE_MM_PER_MIN;
  // G21 + G94 feed rates are mm/min. Convert F to mm/s, then apply the global UI multiplier.
  const speedMmPerSecond = feedRateMmPerMinute / 60;
  const effectiveSpeedMmPerSecond = Math.max(speedMmPerSecond * selectedSpeedMultiplier, 0.01);
  const durationSeconds = distanceMm / effectiveSpeedMmPerSecond;
  // Keep a tiny floor for visible non-tiny moves, but let dense sub-0.5 mm toolpath segments batch instantly.
  return Math.max(durationSeconds, getCncMinimumEdgeSeconds(selectedSpeedMultiplier));
}

export function ThreeScene({
  moves,
  isPlaying,
  playbackSpeed,
  resetKey,
  modelPath,
  machineType = "generic",
  printLineColor,
  printerRenderMode = "object",
  dark = true,
  onPositionUpdate,
  onProgressUpdate,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cncDebugMessageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const defaultCameraViewRef = useRef<CameraViewState | null>(null);
  const frameRef = useRef<number | null>(null);
  const cncDebugCleanupRef = useRef<(() => void) | null>(null);

  const surfaceRef = useRef<SurfaceReference | null>(null);
  const alignmentRef = useRef<PathAlignment | null>(null);

  const toolGroupRef = useRef<THREE.Group | null>(null);
  const toolLightRef = useRef<THREE.PointLight | null>(null);
  const cncLaserEffectRef = useRef<CncLaserEffect | null>(null);
  const cncEngravingTraceRef = useRef<THREE.Group | null>(null);
  const cncPreviewTraceRef = useRef<THREE.Group | null>(null);
  const cncCuttingSegmentsRef = useRef<CncCuttingSegment[]>([]);
  const cncAnimationEdgesRef = useRef<CncAnimationEdge[]>([]);
  const cncSegmentParentRef = useRef<THREE.Object3D | null>(null);
  const cncPrintStateRef = useRef<CncPrintAnimationState>(createCncPrintAnimationState());
  const printerKinematicsRef = useRef<PrinterKinematics | null>(null);
  const cncKinematicsRef = useRef<CncKinematics | null>(null);

  const ghostLineRef = useRef<THREE.Line | null>(null);
  const activeSegRef = useRef<THREE.Object3D | null>(null);
  const drawnSegsRef = useRef<THREE.Object3D[]>([]);
  const printSegmentsRef = useRef<PrintSegmentDescriptor[]>([]);
  const printChunksRef = useRef<PrintChunk[]>([]);
  const printedObjectRevealRef = useRef<PrintedObjectReveal | null>(null);
  const printerPrintBedAttachedGroupRef = useRef<THREE.Group | null>(null);
  const printerPrintGroupDebugAtRef = useRef(0);
  const revealedPrintCountRef = useRef(0);
  const workpieceRef = useRef<THREE.Mesh | null>(null);

  const animRef = useRef({
    playing: false,
    speed: 1,
    moveIdx: 0,
    segT: 0,
    moves: [] as SimulationMove[],
  });

  const onPosRef = useRef(onPositionUpdate);
  const onProgRef = useRef(onProgressUpdate);
  const isPlayingRef = useRef(isPlaying);
  const tickCallbackRef = useRef<((dt: number) => void) | null>(null);

  const showCncDebugMessage = useCallback((message: string | null) => {
    const element = cncDebugMessageRef.current;
    if (!element) return;
    element.textContent = message ?? "";
    element.style.display = message ? "block" : "none";
  }, []);

  useEffect(() => {
    onPosRef.current = onPositionUpdate;
    onProgRef.current = onProgressUpdate;
  }, [onPositionUpdate, onProgressUpdate]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const clearance = machineType === "printer3d" ? SURFACE_CLEARANCE_PRINTER : SURFACE_CLEARANCE_CNC;

  const updateToolVisualMode = useCallback(() => {
    const tool = toolGroupRef.current;
    if (!tool) return;

    const isCnc     = machineType === "cnc";

    tool.traverse((child) => {
      const visualRole = child.userData?.toolVisualRole as string | undefined;
      if (visualRole === "printerGeneratedVisual") {
        child.visible = false;
      }
      if (visualRole === "toolLight") {
        child.visible = isCnc;
        if (!isCnc && child instanceof THREE.PointLight) {
          child.intensity = 0;
        }
      }
      if (visualRole === "cncFallbackMarker") {
        child.visible = isCnc && !cncKinematicsRef.current?.headParts.length;
      }
    });

    updateCncLaserEffect(cncLaserEffectRef.current, false, 0);
  }, [machineType]);

  const mapCncPointToWorkspace = useCallback((point: CncWorkspacePoint): THREE.Vector3 => {
    const alignment = alignmentRef.current;
    if (!alignment) {
      return new THREE.Vector3(point.x, point.workspaceY, point.y);
    }

    return new THREE.Vector3(
      alignment.originX - (point.x - alignment.gcodeMinX) * alignment.pathScale,
      point.workspaceY,
      alignment.originZ + (point.y - alignment.gcodeMinY) * alignment.pathScale,
    );
  }, []);

  const toWorld = useCallback(
    (gx: number, gy: number, gz: number): THREE.Vector3 => {
      const alignment = alignmentRef.current;
      if (!alignment) {
        return new THREE.Vector3(gx, gz + clearance, gy);
      }
      if (machineType === "printer3d") {
        const zScale = Math.max(alignment.pathScale, PRINTER_MIN_Z_SCALE);
        // World X = bed left/right, World Y = height above bed, World Z = bed front/back.
        // alignment.clearance is the thin gap between the bed top and layer-0 beads
        // (keeps geometry from z-fighting the bed surface).
        // gz=0 → first layer sits exactly at clearance above topSurfaceY.
        return new THREE.Vector3(
          alignment.originX + (gx - (alignment.gcodeMinX ?? 0)) * alignment.pathScale,
          alignment.topSurfaceY + gz * zScale + alignment.clearance,
          alignment.originZ + (gy - (alignment.gcodeMinY ?? 0)) * alignment.pathScale,
        );
      }
      // CNC / laser engraver: the head moves in X/Y (gx, gy) at a fixed focal
      // height above the workpiece surface. Machine coordinates are mapped
      // through the same workspace mapper used by the preview and engraving.
      const cncMoves = animRef.current.moves;
      let minZ = gz;
      let maxZ = gz;
      for (const move of cncMoves) {
        minZ = Math.min(minZ, move.z);
        maxZ = Math.max(maxZ, move.z);
      }
      const zSpan = Math.max(maxZ - minZ, 1e-6);
      const normalizedZ = THREE.MathUtils.clamp((gz - minZ) / zSpan, 0, 1);
      const focalClearance = THREE.MathUtils.lerp(4.0, 10.0, normalizedZ);
      return mapCncPointToWorkspace({
        x: gx,
        y: gy,
        workspaceY: alignment.topSurfaceY + alignment.clearance + focalClearance,
      });
    },
    [clearance, machineType, mapCncPointToWorkspace],
  );

  const disposeRenderable = useCallback((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    const line = obj as THREE.Line;
    if (mesh.geometry) mesh.geometry.dispose();
    if (line.geometry && line.geometry !== mesh.geometry) line.geometry.dispose();

    const material = (mesh.material ?? line.material) as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (Array.isArray(material)) {
      material.forEach((mat) => mat.dispose());
    } else {
      material?.dispose();
    }
  }, []);

  const disposeCncEngravingTrace = useCallback(() => {
    const trace = cncEngravingTraceRef.current;
    if (!trace) return;

    trace.removeFromParent();
    trace.traverse((obj) => {
      if (obj === activeSegRef.current) {
        activeSegRef.current = null;
      }
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((material) => material.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    cncEngravingTraceRef.current = null;
  }, []);

  const disposeCncPreviewTrace = useCallback(() => {
    const preview = cncPreviewTraceRef.current;
    if (!preview) return;

    preview.removeFromParent();
    preview.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((material) => material.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    cncPreviewTraceRef.current = null;
  }, []);

  const parseCncToolpathSegments = useCallback((simMoves: SimulationMove[]): CncParsedPath => {
    const cuttingSegments: CncPathSegment[] = [];
    const travelSegments: CncPathSegment[] = [];
    const bbox = new THREE.Box2();

    for (let index = 0; index < simMoves.length - 1; index += 1) {
      const from = simMoves[index];
      const to = simMoves[index + 1];
      const segment = { from, to, moveIndex: index + 1 };
      const hasPlaneMotion = Math.abs(to.x - from.x) > 1e-8 || Math.abs(to.y - from.y) > 1e-8;
      const toolDown = to.operation === "cut";
      const isCuttingMove = to.type === "linear" && toolDown;

      if (isCuttingMove) {
        if (hasPlaneMotion) {
          cuttingSegments.push(segment);
          bbox.expandByPoint(new THREE.Vector2(from.x, from.y));
          bbox.expandByPoint(new THREE.Vector2(to.x, to.y));
        }
      } else if (hasPlaneMotion) {
        travelSegments.push(segment);
      }
    }

    const parsedBbox = bbox.isEmpty()
      ? null
      : {
          minX: bbox.min.x,
          maxX: bbox.max.x,
          minY: bbox.min.y,
          maxY: bbox.max.y,
        };

    return {
      cuttingSegments,
      travelSegments,
      bbox: parsedBbox,
    };
  }, []);

  const updatePrinterAnchor = useCallback(() => {
    const kin = printerKinematicsRef.current;
    const firstMove = animRef.current.moves[0];
    if (!kin || !firstMove) return;
    kin.anchorWorld.copy(toWorld(firstMove.x, firstMove.y, firstMove.z));
  }, [toWorld]);

  const getPrinterPrintBedAttachedGroup = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return null;
    const model = scene.getObjectByName("machineModel");
    const bedRoot = model ? findPrinterBedObject(model) : null;

    if (!bedRoot) {
      console.warn(`[Printer3D] ${PRINTER_BED_ROOT_PART} not found; cannot attach printed geometry to bed.`);
      return null;
    }

    if (!printerPrintBedAttachedGroupRef.current) {
      const group = new THREE.Group();
      group.name = "Printed_Design";
      printerPrintBedAttachedGroupRef.current = group;
    }

    const printGroup = printerPrintBedAttachedGroupRef.current;
    if (printGroup.parent !== bedRoot) {
      bedRoot.add(printGroup);
      printGroup.position.set(0, 0, 0);
      printGroup.rotation.set(0, 0, 0);
      printGroup.scale.set(1, 1, 1);
      bedRoot.updateWorldMatrix(true, false);
      printGroup.updateWorldMatrix(true, false);

      const bedRootWorld = bedRoot.getWorldPosition(new THREE.Vector3());
      const printGroupWorld = printGroup.getWorldPosition(new THREE.Vector3());
      console.info("[Printer3D] Printed geometry parented", {
        parent: bedRoot.name,
        printGroup: {
          local: formatVector3(printGroup.position),
          world: formatVector3(printGroupWorld),
          scale: formatVector3(printGroup.scale),
        },
        printBedRoot: {
          local: formatVector3(bedRoot.position),
          world: formatVector3(bedRootWorld),
          scale: formatVector3(bedRoot.scale),
        },
      });
    }

    return printerPrintBedAttachedGroupRef.current;
  }, []);

  const printerPointToPrintLocal = useCallback(
    (gx: number, gy: number, gz: number): THREE.Vector3 => {
      const world = toWorld(gx, gy, gz);
      const printGroup = getPrinterPrintBedAttachedGroup();
      printGroup?.updateWorldMatrix(true, false);
      return printGroup ? printGroup.worldToLocal(world) : world;
    },
    [getPrinterPrintBedAttachedGroup, toWorld],
  );

  const getPrinterPrintLocalPathScale = useCallback(() => {
    const alignment = alignmentRef.current;
    const printGroup = getPrinterPrintBedAttachedGroup();
    const pathScale = alignment?.pathScale ?? 1;
    if (!printGroup) return pathScale;

    const worldScale = printGroup.getWorldScale(new THREE.Vector3());
    const horizontalScale = Math.max((Math.abs(worldScale.x) + Math.abs(worldScale.z)) * 0.5, 1e-6);
    return pathScale / horizontalScale;
  }, [getPrinterPrintBedAttachedGroup]);

  const syncPrinterMechanics = useCallback(
    (toolWorldPos: THREE.Vector3, dt: number, immediate = false) => {
      syncPrinterMechanicsForTool(machineType, printerKinematicsRef.current, toolWorldPos, dt, immediate);

      if (machineType !== "printer3d" || process.env.NODE_ENV === "production") return;

      const now = Date.now();
      if (now - printerPrintGroupDebugAtRef.current < 750) return;
      printerPrintGroupDebugAtRef.current = now;

      const printGroup = printerPrintBedAttachedGroupRef.current;
      if (!printGroup) return;

      const printBedRoot = printGroup.parent;
      printBedRoot?.updateWorldMatrix(true, false);
      printGroup.updateWorldMatrix(true, false);
      const printBedRootWorld = printBedRoot?.getWorldPosition(new THREE.Vector3()) ?? null;
      const printGroupWorld = printGroup.getWorldPosition(new THREE.Vector3());

      console.debug("[Printer3D] print group transform debug", {
        toolWorld: formatVector3(toolWorldPos),
        printBedRoot: printBedRoot
          ? {
              name: printBedRoot.name,
              local: formatVector3(printBedRoot.position),
              world: printBedRootWorld ? formatVector3(printBedRootWorld) : null,
              scale: formatVector3(printBedRoot.scale),
            }
          : null,
        printGroup: {
          local: formatVector3(printGroup.position),
          world: formatVector3(printGroupWorld),
          scale: formatVector3(printGroup.scale),
        },
      });
    },
    [machineType],
  );

  const makeCncHeadVisible = useCallback((model: THREE.Object3D) => {
    if (machineType !== "cnc") return;

    const headNames = CNC_HEAD_LOCAL_MOVEMENT
      .map((part) => part.name)
      .filter((name) => name !== "Laser_Beam");

    for (const name of headNames) {
      const object = model.getObjectByName(name);
      object?.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const adjusted = materials.map((material) => {
          const nextMaterial = new THREE.MeshStandardMaterial({
            color: CNC_HEAD_VISIBLE_COLOR,
            metalness: CNC_HEAD_VISIBLE_METALNESS,
            roughness: CNC_HEAD_VISIBLE_ROUGHNESS,
            emissive: CNC_HEAD_VISIBLE_EMISSIVE,
            emissiveIntensity: 0,
          });

          if ("map" in material && material.map instanceof THREE.Texture) {
            nextMaterial.map = material.map;
          }
          if ("normalMap" in material && material.normalMap instanceof THREE.Texture) {
            nextMaterial.normalMap = material.normalMap;
          }
          return nextMaterial;
        });

        child.material = Array.isArray(child.material) ? adjusted : adjusted[0];
      });
    }
  }, [machineType]);

  const snapToolToFirstMove = useCallback(() => {
    const tool = toolGroupRef.current;
    const firstMove = animRef.current.moves[0];
    if (!tool || !firstMove) return false;

    if (machineType === "printer3d" && (!surfaceRef.current || !alignmentRef.current)) {
      return false;
    }

    const firstCncPoint = machineType === "cnc"
      ? cncAnimationEdgesRef.current[0]?.start ?? cncCuttingSegmentsRef.current[0]?.[0]
      : null;
    let firstWorld = firstCncPoint
      ? cncSegmentParentRef.current
        ? cncSegmentParentRef.current.localToWorld(firstCncPoint.clone())
        : firstCncPoint.clone()
      : toWorld(firstMove.x, firstMove.y, firstMove.z);
    syncCncMechanics(cncKinematicsRef.current, firstWorld, 0, true, 0);
    if (firstCncPoint && cncSegmentParentRef.current) {
      firstWorld = cncSegmentParentRef.current.localToWorld(firstCncPoint.clone());
    }
    tool.position.copy(firstWorld);
    tool.visible = true;
    syncPrinterMechanics(firstWorld, 0, true);
    return true;
  }, [machineType, syncPrinterMechanics, toWorld]);

  const computePrinterMotionWorldBounds = useCallback(() => {
    return computePrinterMotionWorldBoundsForMoves(animRef.current.moves, toWorld);
  }, [toWorld]);

  const tickPrinterBed = useCallback((isPrinting: boolean) => {
    tickPrinterBedForKinematics(printerKinematicsRef.current, isPrinting);
  }, []);

  const updatePrintedGeometry = useCallback((completedCount: number) => {
    const safeCount = Math.max(0, Math.min(completedCount, printSegmentsRef.current.length));
    revealedPrintCountRef.current = updatePrinterPrintedGeometry(printChunksRef.current, safeCount);
  }, []);

  useEffect(() => {
    updatePrintChunksColor(printChunksRef.current, printLineColor);
  }, [printLineColor]);

  const buildPrintedGeometry = useCallback(
    (segments: PrintSegmentDescriptor[]) => {
      const scene = sceneRef.current;
      if (!scene) return;

      const printGroup = getPrinterPrintBedAttachedGroup();
      if (!printGroup) return;

      printSegmentsRef.current = segments;
      revealedPrintCountRef.current = 0;
      printChunksRef.current.push(...buildPrinterPrintedGeometry(printGroup, segments, printLineColor));
    },
    [getPrinterPrintBedAttachedGroup, printLineColor],
  );

  const disposePrintedObjectReveal = useCallback(() => {
    const reveal = printedObjectRevealRef.current;
    if (!reveal) return;

    reveal.group.removeFromParent();
    const disposedMaterials = new Set<THREE.Material>();
    for (const mesh of reveal.meshes) {
      mesh.geometry.dispose();
      const material = mesh.material;
      const materials = Array.isArray(material) ? material : [material];
      for (const mat of materials) {
        if (disposedMaterials.has(mat)) continue;
        mat.dispose();
        disposedMaterials.add(mat);
      }
    }
    printedObjectRevealRef.current = null;
  }, []);

  const clearPath = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    updateCncLaserEffect(cncLaserEffectRef.current, false, 0);
    disposeCncPreviewTrace();
    disposeCncEngravingTrace();
    cncCuttingSegmentsRef.current = [];
    cncAnimationEdgesRef.current = [];
    cncSegmentParentRef.current = null;
    cncPrintStateRef.current = createCncPrintAnimationState();

    for (const seg of drawnSegsRef.current) {
      scene.remove(seg);
      disposeRenderable(seg);
    }
    drawnSegsRef.current = [];

    for (const chunk of printChunksRef.current) {
      chunk.mesh.removeFromParent();
      disposeRenderable(chunk.mesh);
    }
    printChunksRef.current = [];
    printSegmentsRef.current = [];
    disposePrintedObjectReveal();
    printerPrintBedAttachedGroupRef.current?.removeFromParent();
    printerPrintBedAttachedGroupRef.current = null;
    revealedPrintCountRef.current = 0;

    if (activeSegRef.current) {
      activeSegRef.current.removeFromParent();
      disposeRenderable(activeSegRef.current);
      activeSegRef.current = null;
    }

    if (ghostLineRef.current) {
      ghostLineRef.current.removeFromParent();
      ghostLineRef.current.geometry.dispose();
      ghostLineRef.current = null;
    }

    if (workpieceRef.current) {
      scene.remove(workpieceRef.current);
      workpieceRef.current.geometry.dispose();
      workpieceRef.current = null;
    }
  }, [disposeCncEngravingTrace, disposeCncPreviewTrace, disposePrintedObjectReveal, disposeRenderable]);

  const createCncTraceMark = useCallback(
    (
      start: THREE.Vector3,
      end: THREE.Vector3,
      color: number,
      opacity: number,
      name: string,
      linewidth: number,
    ): THREE.Line | null => {
      if (start.distanceToSquared(end) < 1e-8) return null;

      const geometry = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: true,
        depthWrite: false,
        linewidth,
      });
      const mark = new THREE.Line(geometry, material);
      mark.name = name;
      mark.renderOrder = 2;
      return mark;
    },
    [],
  );

  const clearActiveSegment = useCallback(() => {
    const active = activeSegRef.current;
    if (!active) return;

    active.removeFromParent();
    disposeRenderable(active);
    activeSegRef.current = null;
  }, [disposeRenderable]);

  const ensureCncEngravingTrace = useCallback((): THREE.Group | null => {
    const scene = sceneRef.current;
    if (!scene) return null;

    const traceParent = cncSegmentParentRef.current ?? cncKinematicsRef.current?.workspaceObject ?? scene;

    if (!cncEngravingTraceRef.current) {
      const trace = new THREE.Group();
      trace.name = "cncBurnedEngravingTrace";
      traceParent.add(trace);
      cncEngravingTraceRef.current = trace;
    }

    if (cncEngravingTraceRef.current.parent !== traceParent) {
      cncEngravingTraceRef.current.removeFromParent();
      traceParent.add(cncEngravingTraceRef.current);
    }

    return cncEngravingTraceRef.current;
  }, []);

  const appendCncEngravingSegment = useCallback(
    (start: THREE.Vector3, end: THREE.Vector3, active = false): THREE.Line | null => {
      const trace = ensureCncEngravingTrace();
      if (!trace) return null;

      const line = createCncTraceMark(
        start,
        end,
        active ? 0x120704 : 0x050201,
        active ? 0.58 : 0.88,
        active ? "cncActiveBurnedEngravingSegment" : "cncBurnedEngravingSegment",
        active ? 2 : 3,
      );

      if (line) trace.add(line);
      return line;
    },
    [createCncTraceMark, ensureCncEngravingTrace],
  );

  const cncRenderPointToWorld = useCallback((point: THREE.Vector3): THREE.Vector3 => {
    const parent = cncSegmentParentRef.current;
    return parent ? parent.localToWorld(point.clone()) : point.clone();
  }, []);

  const resetCncPrintAnimation = useCallback(() => {
    clearActiveSegment();
    cncPrintStateRef.current = createCncPrintAnimationState(cncAnimationEdgesRef.current.length);
  }, [clearActiveSegment]);

  const buildCncWorkspacePreview = useCallback(
    (simMoves: SimulationMove[], parsedPath: CncParsedPath): THREE.Box3 | null => {
      const scene = sceneRef.current;
      const alignment = alignmentRef.current;
      const surface = surfaceRef.current;
      if (!scene || !alignment || !surface || simMoves.length === 0) return null;

      disposeCncPreviewTrace();

      const workspace = cncKinematicsRef.current?.workspaceObject;
      const workspaceBox = workspace
        ? new THREE.Box3().setFromObject(workspace)
        : new THREE.Box3(surface.bedBounds.min.clone(), surface.bedBounds.max.clone());
      const topY = workspaceBox.max.y;
      const previewParent = workspace ?? scene;
      previewParent.updateWorldMatrix(true, true);

      const group = new THREE.Group();
      group.name = "cncWorkspaceToolpathPreview";
      previewParent.add(group);
      cncPreviewTraceRef.current = group;
      cncSegmentParentRef.current = previewParent;

      const cuttingMaterial = new THREE.LineBasicMaterial({
        color: 0x130805,
        transparent: true,
        opacity: 0.42,
        depthTest: true,
        depthWrite: false,
      });
      const fallbackMaterial = new THREE.LineBasicMaterial({
        color: 0xffb020,
        transparent: true,
        opacity: 0.7,
        depthTest: true,
        depthWrite: false,
      });

      const toPreviewPoint = (move: SimulationMove) => {
        const world = mapCncPointToWorkspace({
          x: move.x,
          y: move.y,
          workspaceY: topY + CNC_TRACE_SURFACE_OFFSET,
        });
        return {
          world,
          render: workspace ? workspace.worldToLocal(world.clone()) : world.clone(),
        };
      };

      const cuttingSegments: CncCuttingSegment[] = [];
      const animationEdges: CncAnimationEdge[] = [];
      const scaledBox = new THREE.Box3();
      let activeCuttingSegment: CncCuttingSegment | null = null;

      for (let index = 0; index < simMoves.length - 1; index += 1) {
        const from = simMoves[index];
        const to = simMoves[index + 1];
        const hasPlaneMotion = Math.abs(to.x - from.x) > 1e-8 || Math.abs(to.y - from.y) > 1e-8;
        const toolDown = to.operation === "cut";
        const isCuttingMove = to.type === "linear" && toolDown;

        if (!hasPlaneMotion) continue;
        if (!isCuttingMove) activeCuttingSegment = null;

        const start = toPreviewPoint(from);
        const end = toPreviewPoint(to);
        if (start.render.distanceToSquared(end.render) < 1e-8) continue;

        animationEdges.push({
          start: start.render.clone(),
          end: end.render.clone(),
          from,
          to,
          isCutting: isCuttingMove,
        });

        if (isCuttingMove) {
          scaledBox.expandByPoint(start.world);
          scaledBox.expandByPoint(end.world);

          const lastPoint = activeCuttingSegment?.[activeCuttingSegment.length - 1];
          if (!activeCuttingSegment || !lastPoint || lastPoint.distanceToSquared(start.render) >= 1e-8) {
            activeCuttingSegment = [start.render.clone(), end.render.clone()];
            cuttingSegments.push(activeCuttingSegment);
          } else {
            activeCuttingSegment.push(end.render.clone());
          }
        }
      }

      cncCuttingSegmentsRef.current = cuttingSegments;
      cncAnimationEdgesRef.current = animationEdges;
      cncPrintStateRef.current = createCncPrintAnimationState(animationEdges.length);

      let renderedSegments = 0;

      for (const segment of cuttingSegments) {
        if (segment.length < 2) continue;

        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(segment.map((point) => point.clone())),
          cuttingMaterial.clone(),
        );
        line.name = "cncPreviewCutSegment";
        line.renderOrder = 3;
        group.add(line);

        renderedSegments += 1;
      }

      if (renderedSegments === 0) {
        const centerWorld = toPreviewPoint(simMoves[0]).world;
        const workspaceSize = workspaceBox.getSize(new THREE.Vector3());
        const markerSize = Math.max(Math.min(workspaceSize.x, workspaceSize.z) * 0.025, 0.08);
        const markerSegments: Array<[THREE.Vector3, THREE.Vector3]> = [
          [
            centerWorld.clone().add(new THREE.Vector3(-markerSize, 0, 0)),
            centerWorld.clone().add(new THREE.Vector3(markerSize, 0, 0)),
          ],
          [
            centerWorld.clone().add(new THREE.Vector3(0, 0, -markerSize)),
            centerWorld.clone().add(new THREE.Vector3(0, 0, markerSize)),
          ],
        ];

        for (const [startWorld, endWorld] of markerSegments) {
          const points = workspace
            ? [workspace.worldToLocal(startWorld.clone()), workspace.worldToLocal(endWorld.clone())]
            : [startWorld, endWorld];
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), fallbackMaterial.clone());
          line.name = "cncPreviewFallbackMarker";
          line.renderOrder = 4;
          group.add(line);
          scaledBox.expandByPoint(startWorld);
          scaledBox.expandByPoint(endWorld);
        }
        renderedSegments = markerSegments.length;
      }

      const scaledBoundingBox = scaledBox.isEmpty()
        ? null
        : {
            minX: Number(scaledBox.min.x.toFixed(3)),
            maxX: Number(scaledBox.max.x.toFixed(3)),
            minY: Number(scaledBox.min.z.toFixed(3)),
            maxY: Number(scaledBox.max.z.toFixed(3)),
          };
      cuttingMaterial.dispose();
      fallbackMaterial.dispose();

      console.info("[CNC] Workspace preview", {
        parsedPoints: simMoves.length,
        cuttingSegments: cuttingSegments.length,
        cuttingEdges: parsedPath.cuttingSegments.length,
        ignoredTravelSegments: parsedPath.travelSegments.length,
        originalBoundingBox: parsedPath.bbox,
        scaledBoundingBox,
        renderedSegments,
        workspace: workspace?.name ?? surface.sourceMeshName,
      });

      if (parsedPath.cuttingSegments.length === 0) {
        const message = "No valid CNC cutting segments found.";
        console.warn(`[CNC] ${message}`);
        showCncDebugMessage(message);
      } else {
        showCncDebugMessage(null);
      }

      return scaledBox.isEmpty() ? null : scaledBox;
    },
    [disposeCncPreviewTrace, mapCncPointToWorkspace, showCncDebugMessage],
  );

  const fitCameraToBounds = useCallback((box: THREE.Box3, padding = 1.35) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || box.isEmpty()) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const fitHeightDistance = (maxDim * padding) / (2 * Math.tan(fov / 2));
    const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 0.1);
    const distance = Math.max(fitHeightDistance, fitWidthDistance);
    const viewDir = new THREE.Vector3(1, 0.8, 1).normalize();

    camera.position.copy(center.clone().addScaledVector(viewDir, distance));
    camera.near = machineType === "printer3d" ? 0.005 : Math.max(0.05, distance / 1000);
    camera.far = Math.max(400, distance * 30);
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.minDistance = machineType === "printer3d"
      ? Math.max(0.25, maxDim * 0.03)
      : Math.max(2, maxDim * 0.15);
    controls.maxDistance = Math.max(250, maxDim * 25);
    controls.update();
  }, [machineType]);

  const getCameraFocusBox = useCallback(() => {
    if (machineType === "cnc" && surfaceRef.current) {
      const surface = surfaceRef.current;
      const box = new THREE.Box3(surface.bedBounds.min.clone(), surface.bedBounds.max.clone());
      const headRoom = Math.max(surface.modelBounds.size.y * 0.32, surface.bedBounds.size.x * 0.18, 2);
      box.max.y = surface.topSurfaceY + headRoom;
      box.min.y = Math.min(surface.topSurfaceY - Math.max(surface.modelBounds.size.y * 0.08, 0.6), box.min.y);
      return box;
    }

    const model = sceneRef.current?.getObjectByName("machineModel");
    if (model) {
      return new THREE.Box3().setFromObject(model);
    }

    return new THREE.Box3(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 4, 4));
  }, [machineType]);

  const applyCameraView = useCallback((view: CameraViewState, rememberDefault = false) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    camera.up.copy(view.up);
    camera.position.copy(view.position);
    controls.target.copy(view.target);
    camera.lookAt(view.target);
    controls.update();

    if (rememberDefault) {
      defaultCameraViewRef.current = {
        position: view.position.clone(),
        target: view.target.clone(),
        up: view.up.clone(),
      };
    }
  }, []);

  const setViewportPreset = useCallback(
    (preset: ViewPreset, rememberDefault = false) => {
      if (preset === "reset" && defaultCameraViewRef.current) {
        applyCameraView(defaultCameraViewRef.current);
        return;
      }

      const box = getCameraFocusBox();
      if (box.isEmpty()) return;

      const size = new THREE.Vector3();
      const target = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(target);

      if (machineType === "cnc" && surfaceRef.current) {
        target.y = surfaceRef.current.topSurfaceY + Math.max(size.y * 0.35, 1.2);
      }

      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const distance = maxDim * (machineType === "cnc" ? 1.35 : 1.8);
      const verticalLift = Math.max(size.y * 0.2, maxDim * 0.12);
      const up = new THREE.Vector3(0, 1, 0);
      let position: THREE.Vector3;

      if (preset === "top") {
        position = target.clone().add(new THREE.Vector3(0, distance, 0.001));
        up.set(0, 0, -1);
      } else if (preset === "front") {
        position = target.clone().add(new THREE.Vector3(0, verticalLift, distance));
      } else if (preset === "side") {
        position = target.clone().add(new THREE.Vector3(distance, verticalLift, 0));
      } else {
        position = target.clone().add(new THREE.Vector3(distance * 0.52, distance * 0.34, distance * 0.78));
      }

      applyCameraView({ position, target, up }, rememberDefault);
    },
    [applyCameraView, getCameraFocusBox, machineType],
  );

  const panCameraTarget = useCallback((horizontal: number, vertical: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const distance = Math.max(camera.position.distanceTo(controls.target), 1);
    const panStep = distance * 0.045;
    const forward = controls.target.clone().sub(camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = camera.up.clone().normalize();
    const delta = right.multiplyScalar(horizontal * panStep).add(up.multiplyScalar(vertical * panStep));

    camera.position.add(delta);
    controls.target.add(delta);
    controls.update();
  }, []);

  const tickCncPrintAnimation = useCallback(
    (dt: number) => {
      const anim = animRef.current;
      const tool = toolGroupRef.current;
      if (!tool) return;

      const animationEdges = cncAnimationEdgesRef.current;
      const state = cncPrintStateRef.current;
      state.totalEdges = animationEdges.length;

      if (state.totalEdges === 0) {
        clearActiveSegment();
        anim.playing = false;
        updateCncLaserEffect(cncLaserEffectRef.current, false, dt);
        if (toolLightRef.current) toolLightRef.current.intensity = 0;
        onProgRef.current(1);
        return;
      }

      const getCurrentEdge = () => {
        return animationEdges[state.segmentIndex] ?? null;
      };

      let currentEdge = getCurrentEdge();
      let remainingSeconds = dt;
      let processedEdges = 0;

      while (currentEdge && processedEdges < CNC_MAX_EDGES_PER_FRAME) {
        const duration = getCncMoveDurationSeconds(currentEdge.from, currentEdge.to, playbackSpeed);

        if (duration > 0) {
          state.edgeT += remainingSeconds / duration;
          if (state.edgeT < 1) break;
        }

        const leftoverSeconds = duration > 0 ? (state.edgeT - 1) * duration : remainingSeconds;
        clearActiveSegment();
        if (currentEdge.isCutting) {
          appendCncEngravingSegment(currentEdge.start, currentEdge.end);
        }

        state.completedEdges += 1;
        state.segmentIndex += 1;
        state.pointIndex = 0;

        currentEdge = getCurrentEdge();
        state.edgeT = 0;
        remainingSeconds = leftoverSeconds;
        processedEdges += 1;
      }

      currentEdge = getCurrentEdge();
      if (!currentEdge) {
        clearActiveSegment();
        anim.playing = false;
        anim.segT = 0;
        updateCncLaserEffect(cncLaserEffectRef.current, false, dt);
        if (toolLightRef.current) toolLightRef.current.intensity = 0;
        onProgRef.current(1);
        return;
      }

      const edgeProgress = THREE.MathUtils.clamp(state.edgeT, 0, 1);
      const printProgress = (state.completedEdges + edgeProgress) / state.totalEdges;
      const activeEnd = currentEdge.start.clone().lerp(currentEdge.end, edgeProgress);
      let toolPos = cncRenderPointToWorld(activeEnd);

      clearActiveSegment();
      if (currentEdge.isCutting && edgeProgress > 0) {
        activeSegRef.current = appendCncEngravingSegment(currentEdge.start, activeEnd, true);
      }

      syncCncMechanics(cncKinematicsRef.current, toolPos, dt, false, printProgress);
      toolPos = cncRenderPointToWorld(activeEnd);
      tool.position.copy(toolPos);
      tool.visible = true;
      tickPrinterBed(false);

      if (toolLightRef.current) {
        toolLightRef.current.color.set(0x34cfff);
        toolLightRef.current.intensity = currentEdge.isCutting ? 4.8 + Math.sin(Date.now() * 0.04) * 0.7 : 0;
      }
      updateCncLaserEffect(cncLaserEffectRef.current, currentEdge.isCutting, dt);

      onPosRef.current({
        x: toolPos.x.toFixed(2),
        y: toolPos.z.toFixed(2),
        z: toolPos.y.toFixed(2),
      });
      onProgRef.current(printProgress);
    },
    [
      appendCncEngravingSegment,
      clearActiveSegment,
      cncRenderPointToWorld,
      playbackSpeed,
      tickPrinterBed,
    ],
  );

  const tick = useCallback(
    (dt: number) => {
      const anim = animRef.current;
      if (!anim.playing || anim.moves.length < 2) return;

      const scene = sceneRef.current;
      const tool = toolGroupRef.current;
      if (!scene || !tool) return;

      if (machineType === "cnc") {
        tickCncPrintAnimation(dt);
        return;
      }

      if (machineType === "printer3d") {
        if (toolLightRef.current) toolLightRef.current.intensity = 0;
        tickPrinterAnimation({
          dt,
          tool,
          anim,
          activeSegRef,
          printChunks: printChunksRef.current,
          printedObjectReveal: printedObjectRevealRef.current,
          reconstructedPrintMode: printerRenderMode === "object",
          revealedPrintCountRef,
          toWorld,
          disposeRenderable,
          syncPrinterMechanics,
          syncCncMechanics: (toolWorldPos, delta, immediate) => {
            syncCncMechanics(cncKinematicsRef.current, toolWorldPos, delta, immediate);
          },
          tickPrinterBed,
          disableCncLaserEffect: (delta) => updateCncLaserEffect(cncLaserEffectRef.current, false, delta),
          onPositionUpdate: onPosRef.current,
          onProgressUpdate: onProgRef.current,
        });
        return;
      }

      anim.segT += dt * 80 * anim.speed;

      while (anim.segT >= 1 && anim.moveIdx < anim.moves.length - 1) {
        anim.segT -= 1;
        anim.moveIdx++;

        if (activeSegRef.current) {
          if (activeSegRef.current instanceof THREE.Line) {
            const mat = activeSegRef.current.material as THREE.LineBasicMaterial;
            mat.color.set(COLOR_DONE);
            mat.transparent = false;
            mat.opacity = 1;
            drawnSegsRef.current.push(activeSegRef.current);
          } else {
            drawnSegsRef.current.push(activeSegRef.current);
          }

          activeSegRef.current = null;

          if (drawnSegsRef.current.length > MAX_STORED_SEGS) {
            const old = drawnSegsRef.current.shift();
            if (old) {
              scene.remove(old);
              disposeRenderable(old);
            }
          }
        }
      }

      if (anim.moveIdx >= anim.moves.length - 1) {
        anim.playing = false;
        anim.segT = 0;
        if (toolLightRef.current) toolLightRef.current.intensity = 0;
        updateCncLaserEffect(cncLaserEffectRef.current, false, dt);
        tickPrinterBed(false);
        onProgRef.current(1);
        return;
      }

      const from = anim.moves[anim.moveIdx];
      const to = anim.moves[anim.moveIdx + 1];
      const t = Math.min(anim.segT, 1);

      const gx = THREE.MathUtils.lerp(from.x, to.x, t);
      const gy = THREE.MathUtils.lerp(from.y, to.y, t);
      const gz = THREE.MathUtils.lerp(from.z, to.z, t);
      const toolPos = toWorld(gx, gy, gz);
      const isPrinting = to.operation === "print";

      tool.position.copy(toolPos);
      tool.visible = true;
      syncCncMechanics(cncKinematicsRef.current, toolPos, dt);
      tickPrinterBed(isPrinting);

      if (toolLightRef.current) {
        toolLightRef.current.color.set(0xf8fbff);
        toolLightRef.current.intensity = 0;
      }

      if (activeSegRef.current) {
        scene.remove(activeSegRef.current);
        disposeRenderable(activeSegRef.current);
      }

      const isRapid = to.operation === "travel";
      const seg = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([toWorld(from.x, from.y, from.z), toolPos]),
        new THREE.LineBasicMaterial({
          color: isRapid ? COLOR_RAPID : COLOR_CUT,
          transparent: isRapid,
          opacity: isRapid ? 0.35 : 1,
          depthWrite: !isRapid,
        }),
      );
      seg.userData.isRapid = isRapid;
      seg.userData.kind = isRapid ? "rapid" : "cut";
      seg.name = "activeSeg";
      scene.add(seg);
      activeSegRef.current = seg;

      onPosRef.current({ x: gx.toFixed(2), y: gy.toFixed(2), z: gz.toFixed(2) });
      onProgRef.current(anim.moveIdx / (anim.moves.length - 1));
    },
    [
      disposeRenderable,
      machineType,
      printerRenderMode,
      syncPrinterMechanics,
      tickCncPrintAnimation,
      tickPrinterBed,
      toWorld,
    ],
  );

  useEffect(() => {
    tickCallbackRef.current = tick;
  }, [tick]);

  const setupPrinterKinematics = useCallback(() => {
    if (machineType !== "printer3d") {
      printerKinematicsRef.current = null;
      return;
    }

    const model = sceneRef.current?.getObjectByName("machineModel");
    if (!model) return;

    printerKinematicsRef.current = createPrinterKinematics({
      model,
      moves: animRef.current.moves,
      toWorld,
    });
  }, [machineType, toWorld]);

  const setupMachineKinematics = useCallback((model: THREE.Object3D) => {
    if (machineType === "printer3d") {
      cncKinematicsRef.current = null;
      setupPrinterKinematics();
      return;
    }

    printerKinematicsRef.current = null;
    cncKinematicsRef.current = machineType === "cnc"
      ? setupCncKinematics(model, animRef.current.moves, toWorld)
      : null;
  }, [machineType, setupPrinterKinematics, toWorld]);
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const setup = createSimulationScene(container);
    const { scene, renderer, camera, controls, toolGroup, toolLight, resizeObserver } = setup;

    sceneRef.current = scene;
    rendererRef.current = renderer;
    renderer.localClippingEnabled = true;
    cameraRef.current = camera;
    controlsRef.current = controls;
    toolGroupRef.current = toolGroup;
    toolLightRef.current = toolLight;
    cncLaserEffectRef.current = createCncLaserEffect();

    updateToolVisualMode();

    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    renderer.domElement.addEventListener("contextmenu", preventContextMenu);

    let last = 0;
    const animate = (now: number) => {
      frameRef.current = requestAnimationFrame(animate);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      controls.update();
      tickCallbackRef.current?.(dt);
      renderer.render(scene, camera);
    };
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      resizeObserver.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      cncDebugCleanupRef.current?.();
      cncDebugCleanupRef.current = null;
      cncLaserEffectRef.current?.dispose();
      cncLaserEffectRef.current = null;
      renderer.domElement.removeEventListener("contextmenu", preventContextMenu);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [updateToolVisualMode]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.target instanceof HTMLElement) {
        const tagName = event.target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || tagName === "select" || event.target.isContentEditable) {
          return;
        }
      }

      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") {
        event.preventDefault();
        panCameraTarget(-1, 0);
      } else if (key === "arrowright" || key === "d") {
        event.preventDefault();
        panCameraTarget(1, 0);
      } else if (key === "arrowup" || key === "w") {
        event.preventDefault();
        panCameraTarget(0, 1);
      } else if (key === "arrowdown" || key === "s") {
        event.preventDefault();
        panCameraTarget(0, -1);
      } else if (key === "r") {
        event.preventDefault();
        setViewportPreset("reset");
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [panCameraTarget, setViewportPreset]);

  useEffect(() => {
    updateToolVisualMode();
  }, [machineType, updateToolVisualMode]);

  const rebuildPathGeometry = useCallback(() => {
    const scene = sceneRef.current;
    const tool = toolGroupRef.current;
    if (!scene) return;

    clearPath();
    if (machineType !== "cnc") showCncDebugMessage(null);

    const simMoves = animRef.current.moves;
    if (simMoves.length === 0) {
      if (tool) tool.visible = false;
      if (machineType === "cnc") showCncDebugMessage(null);
      return;
    }

    const worldPts = simMoves.map((m) => toWorld(m.x, m.y, m.z));
    const cncParsedPath = machineType === "cnc" ? parseCncToolpathSegments(simMoves) : null;
    const cncPreviewBox =
      machineType === "cnc" && cncParsedPath
        ? buildCncWorkspacePreview(simMoves, cncParsedPath)
        : null;
    const firstPrintMoveIndex = simMoves.findIndex((move) => move.operation === "print");
    const firstToolWorld = worldPts[0] ?? null;
    if (machineType === "printer3d" && simMoves.length > 1) {
      // Ensure the model's world matrices are fresh before computing any world-space positions.
      const model = sceneRef.current?.getObjectByName("machineModel");
      if (model) model.updateWorldMatrix(true, true);

      const printSegments = buildPrinterPrintSegments(
        simMoves,
        printerPointToPrintLocal,
        getPrinterPrintLocalPathScale(),
      );
      printSegmentsRef.current = printSegments;
      buildPrintedGeometry(printSegments);
      updatePrintedGeometry(0);
      const printGroup = printerPrintBedAttachedGroupRef.current;
      const printBedRoot = printGroup?.parent ?? null;
      printBedRoot?.updateWorldMatrix(true, true);
      printGroup?.updateWorldMatrix(true, true);
      const nozzle = printerKinematicsRef.current?.nozzleObject ?? null;
      const headPart = printerKinematicsRef.current?.headParts[0]?.object ?? null;
      const nozzleWorld = nozzle?.getWorldPosition(new THREE.Vector3()) ?? null;
      const headWorld = headPart?.getWorldPosition(new THREE.Vector3()) ?? null;
      const printBedRootWorld = printBedRoot?.getWorldPosition(new THREE.Vector3()) ?? null;
      const printGroupWorld = printGroup?.getWorldPosition(new THREE.Vector3()) ?? null;
      console.info("[Printer3D] Prepared print segments", {
        mode: printerRenderMode,
        segmentCount: printSegments.length,
        firstSegmentStart: printSegments[0]?.start.toArray() ?? null,
        firstSegmentEnd: printSegments[0]?.end.toArray() ?? null,
        printParent: printBedRoot?.name ?? null,
        localPathScale: getPrinterPrintLocalPathScale(),
        head: headPart
          ? {
              name: headPart.name,
              local: formatVector3(headPart.position),
              world: headWorld ? formatVector3(headWorld) : null,
            }
          : null,
        nozzle: nozzle
          ? {
              name: nozzle.name,
              local: formatVector3(nozzle.position),
              world: nozzleWorld ? formatVector3(nozzleWorld) : null,
            }
          : null,
        printBedRoot: printBedRoot
          ? {
              local: formatVector3(printBedRoot.position),
              world: printBedRootWorld ? formatVector3(printBedRootWorld) : null,
              scale: formatVector3(printBedRoot.scale),
            }
          : null,
        printGroup: printGroup
          ? {
              local: formatVector3(printGroup.position),
              world: printGroupWorld ? formatVector3(printGroupWorld) : null,
              scale: formatVector3(printGroup.scale),
            }
          : null,
      });

      const alignment = alignmentRef.current;
      const firstBeadY =
        firstPrintMoveIndex > 0
          ? toWorld(
              simMoves[firstPrintMoveIndex].x,
              simMoves[firstPrintMoveIndex].y,
              simMoves[firstPrintMoveIndex].z,
            ).y + PRINTER_BEAD_Y_OFFSET
          : null;
      console.info("[Printer3D] Bed/path debug", {
        bedTopY: alignment?.topSurfaceY ?? null,
        firstToolWorldY: firstToolWorld ? Number(firstToolWorld.y.toFixed(3)) : null,
        firstPrintedBeadY: firstBeadY !== null ? Number(firstBeadY.toFixed(3)) : null,
      });
    }

    // Ghost path: only show for generic/CNC modes.
    // For printer3d the ghost path clutters the view — you only see what's been printed.
    if (machineType !== "cnc" && machineType !== "printer3d") {
      const ghost = createPrinterGhostPath(worldPts);
      scene.add(ghost);
      ghostLineRef.current = ghost;
    }

    const alignment = alignmentRef.current;
    const pathBounds = cncPreviewBox
      ? (() => {
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          cncPreviewBox.getSize(size);
          cncPreviewBox.getCenter(center);
          return { min: cncPreviewBox.min.clone(), max: cncPreviewBox.max.clone(), size, center };
        })()
      : (() => {
          const box = new THREE.Box3().setFromPoints(worldPts);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          return { min: box.min.clone(), max: box.max.clone(), size, center };
        })();
    const min = pathBounds.min;
    const max = pathBounds.max;
    const size = pathBounds.size;

    const focusBox = new THREE.Box3(
      new THREE.Vector3(min.x, Math.min(0, min.y), min.z),
      new THREE.Vector3(max.x, Math.max(max.y, size.y || 1), max.z),
    );

    if (machineType === "cnc" && cncKinematicsRef.current?.workspaceObject) {
      focusBox.union(new THREE.Box3().setFromObject(cncKinematicsRef.current.workspaceObject));
    } else if (machineType !== "printer3d") {
      const workW = Math.max(size.x, 2);
      const workD = Math.max(size.z, 2);
      const workH = Math.max(size.y * 0.6, 1);

      const wpGeo = new THREE.BoxGeometry(workW, workH, workD);
      const wp = new THREE.Mesh(
        wpGeo,
        new THREE.MeshStandardMaterial({
          color: COLOR_WORKPIECE,
          roughness: 0.9,
          metalness: 0.05,
          transparent: true,
          opacity: 0.15,
          side: THREE.FrontSide,
        }),
      );
      wp.name = "workpiece";

      const topY = alignment?.topSurfaceY ?? min.y;
      wp.position.set((min.x + max.x) / 2, topY - workH / 2, (min.z + max.z) / 2);
      wp.receiveShadow = true;
      wp.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(wpGeo),
          new THREE.LineBasicMaterial({
            color: COLOR_WORKPIECE,
            transparent: true,
            opacity: 0.4,
          }),
        ),
      );
      scene.add(wp);
      workpieceRef.current = wp;
      focusBox.union(new THREE.Box3().setFromObject(wp));
    }

    if (tool) {
      tool.position.copy(worldPts[0]);
      tool.visible = true;
      syncPrinterMechanics(worldPts[0], 0, true);
      syncCncMechanics(cncKinematicsRef.current, worldPts[0], 0, true);
    }

    fitCameraToBounds(focusBox, 1.4);
  }, [
    buildPrintedGeometry,
    buildCncWorkspacePreview,
    clearPath,
    fitCameraToBounds,
    machineType,
    parseCncToolpathSegments,
    getPrinterPrintLocalPathScale,
    printerPointToPrintLocal,
    printerRenderMode,
    showCncDebugMessage,
    syncPrinterMechanics,
    toWorld,
    updatePrintedGeometry,
  ]);

  useEffect(() => {
    animRef.current.moves = moves;
    animRef.current.moveIdx = 0;
    animRef.current.segT = 0;
    animRef.current.playing = false;

    if (surfaceRef.current) {
      alignmentRef.current = buildMachinePathAlignment(moves, surfaceRef.current, clearance, machineType);
      updatePrinterAnchor();
      if (printerKinematicsRef.current) {
        printerKinematicsRef.current.motionWorldBounds = computePrinterMotionWorldBounds();
      }
      if (cncKinematicsRef.current) {
        cncKinematicsRef.current.motionWorldBounds = computeCncMotionWorldBounds(
          moves,
          toWorld,
        );
        cncKinematicsRef.current.bedMotionWorldBounds = computeCncBedMotionWorldBounds(
          moves,
          toWorld,
        );
      }
    }

    rebuildPathGeometry();
  }, [moves, clearPath, rebuildPathGeometry, clearance, computePrinterMotionWorldBounds, machineType, toWorld, updatePrinterAnchor]);

  useEffect(() => {
    if (!isPlaying) {
      animRef.current.playing = false;
      updateCncLaserEffect(cncLaserEffectRef.current, false, 0);
      tickPrinterBed(false);
      return;
    }

    const readyToPlay = snapToolToFirstMove();
    if (machineType === "cnc" && readyToPlay) {
      const printState = cncPrintStateRef.current;
      const isAtStart =
        printState.segmentIndex === 0 &&
        printState.pointIndex === 0 &&
        printState.completedEdges === 0 &&
        printState.edgeT === 0;
      const isRestart =
        isAtStart ||
        (printState.totalEdges > 0 && printState.completedEdges >= printState.totalEdges);
      if (isRestart) {
        disposeCncEngravingTrace();
        resetCncPrintAnimation();
      }
      disposeCncPreviewTrace();
    }
    animRef.current.playing = readyToPlay;
  }, [
    disposeCncEngravingTrace,
    disposeCncPreviewTrace,
    isPlaying,
    machineType,
    resetCncPrintAnimation,
    snapToolToFirstMove,
    tickPrinterBed,
  ]);

  useEffect(() => {
    animRef.current.speed = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    const tool = toolGroupRef.current;
    const anim = animRef.current;
    anim.moveIdx = 0;
    anim.segT = 0;
    anim.playing = false;

    clearPath();
    rebuildPathGeometry();

    if (tool && anim.moves.length > 0) {
      snapToolToFirstMove();
    }

    if (toolLightRef.current) {
      toolLightRef.current.intensity = 0;
    }
    updateCncLaserEffect(cncLaserEffectRef.current, false, 0);
    tickPrinterBed(false);
  }, [resetKey, clearPath, rebuildPathGeometry, snapToolToFirstMove, tickPrinterBed]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!modelPath || !scene) return;
    printerKinematicsRef.current = null;
    cncKinematicsRef.current = null;
    cncDebugCleanupRef.current?.();
    cncDebugCleanupRef.current = null;

    const old = scene.getObjectByName("machineModel");
    if (old) scene.remove(old);
    const oldHeadDebugHelper = scene.getObjectByName("cncHeadGroupDebugHelper");
    if (oldHeadDebugHelper) {
      scene.remove(oldHeadDebugHelper);
    }

    new GLTFLoader().load(modelPath, (gltf) => {
      const model = gltf.scene.clone(true);
      model.name = "machineModel";

      applyModelVisibilityConfig(model, modelPath);
      makeCncHeadVisible(model);

      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = new THREE.Vector3();
      rawBox.getSize(rawSize);
      const targetDim = MODEL_TARGET_MAX_DIM[machineType] ?? MODEL_TARGET_MAX_DIM.generic;
      const maxRawDim = Math.max(rawSize.x, rawSize.y, rawSize.z, 1e-6);
      const normalizedScale = targetDim / maxRawDim;
      model.scale.setScalar(normalizedScale);

      model.updateWorldMatrix(true, true);

      const normalizedBox = new THREE.Box3().setFromObject(model);
      const normalizedCenter = new THREE.Vector3();
      normalizedBox.getCenter(normalizedCenter);

      // Center machine on X/Z origin and place it on the ground plane.
      model.position.set(-normalizedCenter.x, -normalizedBox.min.y, -normalizedCenter.z);

      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      scene.add(model);
      // Update world matrices now that the model is in the scene graph so that
      // all subsequent bounding-box and surface-reference computations use
      // correct world-space transforms.
      model.updateWorldMatrix(true, true);

      if (machineType === "cnc" && CNC_MODEL_DEBUG) {
        logCncSceneGraph(model);
        cncDebugCleanupRef.current = attachCncDebugHelpers(
          scene,
          model,
          [
            ...CNC_DEBUG_PART_CANDIDATES.head,
            ...CNC_DEBUG_PART_CANDIDATES.gantry,
            ...CNC_DEBUG_PART_CANDIDATES.workspace,
          ],
        );
      }

      let surface =
        machineType === "cnc"
          ? createCncSurfaceReference(model)
          : detectSurfaceReference(model, machineType);
      if (machineType === "printer3d") {
        const bedObject = findPrinterBedObject(model);
        if (bedObject) {
          surface = createPrinterSurfaceReference(model, bedObject);
        }
      }

      
      if (machineType === "cnc" && !surface) {
        console.warn('[CNC] Required workspace object "CNC_WORKSPACE" was not found; CNC path alignment is disabled.');
      }

      surfaceRef.current = surface;
      alignmentRef.current = surface
        ? buildMachinePathAlignment(animRef.current.moves, surface, clearance, machineType)
        : null;
      setupMachineKinematics(model);
      if (machineType === "cnc") {
        attachCncLaserBeamMesh(cncLaserEffectRef.current, model);
      }
      updateToolVisualMode();

      if (isPlayingRef.current) {
        animRef.current.playing = snapToolToFirstMove();
      }

      if (machineType === "cnc") {
        setViewportPreset("reset", true);
      } else {
        fitCameraToBounds(new THREE.Box3().setFromObject(model), 1.3);
      }

      if (animRef.current.moves.length > 0) {
        rebuildPathGeometry();
      }
    });
  }, [modelPath, machineType, clearance, makeCncHeadVisible, rebuildPathGeometry, fitCameraToBounds, setViewportPreset, setupMachineKinematics, snapToolToFirstMove, updateToolVisualMode]);

  const viewButtonClass = dark
    ? "border-gray-700 bg-gray-950/80 text-gray-200 hover:bg-gray-800"
    : "border-gray-300 bg-white/85 text-gray-700 hover:bg-gray-100";

  return (
    <div
      ref={mountRef}
      tabIndex={0}
      onPointerDown={() => mountRef.current?.focus()}
      className="relative h-full w-full outline-none"
      style={{ background: "#3f3f3f" }}
    >
      <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setViewportPreset("reset")}
          className={`rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition-colors ${viewButtonClass}`}
        >
          Reset View
        </button>
        <button
          type="button"
          onClick={() => setViewportPreset("top")}
          className={`rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition-colors ${viewButtonClass}`}
        >
          Top View
        </button>
        <button
          type="button"
          onClick={() => setViewportPreset("front")}
          className={`rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition-colors ${viewButtonClass}`}
        >
          Front View
        </button>
        <button
          type="button"
          onClick={() => setViewportPreset("side")}
          className={`rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition-colors ${viewButtonClass}`}
        >
          Side View
        </button>
      </div>
      <div
        ref={cncDebugMessageRef}
        className={`absolute bottom-3 left-3 z-10 hidden max-w-sm rounded-md border px-3 py-2 text-xs shadow-sm backdrop-blur ${
          dark
            ? "border-amber-500/30 bg-gray-950/85 text-amber-200"
            : "border-amber-400/40 bg-white/90 text-amber-700"
        }`}
      />
    </div>
  );
}
