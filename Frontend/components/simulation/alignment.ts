import * as THREE from "three";
import { MachineId, SimulationMove } from "@/lib/simulation";

export type MachineType = MachineId | "generic";

export type Bounds3 = {
  min: THREE.Vector3;
  max: THREE.Vector3;
  size: THREE.Vector3;
  center: THREE.Vector3;
};

export type SurfaceReference = {
  modelBounds: Bounds3;
  bedBounds: Bounds3;
  topSurfaceY: number;
  sourceMeshName: string;
};

export type PathAlignment = {
  topSurfaceY: number;
  clearance: number;
  originX: number;
  originZ: number;
  pathScale: number;
  gcodeMinX: number;
  gcodeMinY: number;
};

const DEFAULT_BED_FIT_RATIO = 0.38;

function boundsFromBox(box: THREE.Box3): Bounds3 {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return {
    min: box.min.clone(),
    max: box.max.clone(),
    size,
    center,
  };
}

function getMoveXYBounds(moves: SimulationMove[]) {
  const finiteMoves = moves.filter((move) => Number.isFinite(move.x) && Number.isFinite(move.y));
  if (finiteMoves.length === 0) return null;

  const xs = finiteMoves.map((m) => m.x);
  const ys = finiteMoves.map((m) => m.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function objectBounds(object: THREE.Object3D): Bounds3 {
  return boundsFromBox(new THREE.Box3().setFromObject(object));
}

export function detectSurfaceReference(
  model: THREE.Object3D,
  machineType: MachineType,
): SurfaceReference {
  const modelBounds = objectBounds(model);
  const modelHeight = Math.max(modelBounds.size.y, 1e-6);
  const nameHints = machineType === "cnc"
    ? ["table", "bed", "work", "base", "plate", "machin"]
    : machineType === "printer3d"
    ? ["bed", "plate", "build", "heat", "platform"]
    : ["bed", "plate", "table", "base"];

  type Candidate = { meshName: string; box: THREE.Box3; score: number };
  const candidates: Candidate[] = [];

  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.x <= 0 || size.z <= 0) return;

    const footprint = size.x * size.z;
    if (footprint < 4) return;

    const centerY = (box.min.y + box.max.y) * 0.5;
    const centerFrac = (centerY - modelBounds.min.y) / modelHeight;
    const topFrac = (box.max.y - modelBounds.min.y) / modelHeight;
    const thinness = 1 / Math.max(size.y, 0.2);
    const lowerHalfBoost = THREE.MathUtils.clamp(1.25 - centerFrac, 0.2, 1.25);
    const topPenalty = topFrac > 0.78 ? 0.15 : 1.0;

    const normalizedName = (obj.name || "").toLowerCase();
    const hasHint = nameHints.some((hint) => normalizedName.includes(hint));
    const nameBoost = hasHint ? 2.2 : 1.0;

    const score = footprint * thinness * lowerHalfBoost * topPenalty * nameBoost;
    candidates.push({ meshName: obj.name || "(unnamed)", box, score });
  });

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    const bedBounds = boundsFromBox(winner.box);
    return {
      modelBounds,
      bedBounds,
      topSurfaceY: bedBounds.max.y,
      sourceMeshName: winner.meshName,
    };
  }

  // Fallback: model-level bounds with a machine-specific estimated top surface.
  const fallbackTopFrac = machineType === "printer3d" ? 0.24 : machineType === "cnc" ? 0.42 : 0.33;
  const fallbackTop = modelBounds.min.y + modelHeight * fallbackTopFrac;
  const fallbackBox = new THREE.Box3(
    new THREE.Vector3(modelBounds.min.x, modelBounds.min.y, modelBounds.min.z),
    new THREE.Vector3(modelBounds.max.x, fallbackTop, modelBounds.max.z),
  );

  return {
    modelBounds,
    bedBounds: boundsFromBox(fallbackBox),
    topSurfaceY: fallbackTop,
    sourceMeshName: "(fallback)",
  };
}

export function buildPathAlignment(
  moves: SimulationMove[],
  surface: SurfaceReference,
  clearance: number,
): PathAlignment {
  if (moves.length === 0) {
    return {
      topSurfaceY: surface.topSurfaceY,
      clearance,
      originX: surface.bedBounds.min.x + 1,
      originZ: surface.bedBounds.min.z + 1,
      pathScale: 1,
      gcodeMinX: 0,
      gcodeMinY: 0,
    };
  }

  const xs = moves.map((m) => m.x);
  const ys = moves.map((m) => m.y);
  const gMinX = Math.min(...xs);
  const gMaxX = Math.max(...xs);
  const gMinY = Math.min(...ys);
  const gMaxY = Math.max(...ys);

  const gSpanX = Math.max(gMaxX - gMinX, 1e-6);
  const gSpanY = Math.max(gMaxY - gMinY, 1e-6);
  const margin = 1.0;
  const availableX = Math.max(surface.bedBounds.size.x - margin * 2, 1e-6);
  const availableZ = Math.max(surface.bedBounds.size.z - margin * 2, 1e-6);
  const fitScale = Math.min(availableX / gSpanX, availableZ / gSpanY);
  const pathScale = THREE.MathUtils.clamp(
    Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1,
    0.01,
    100,
  );

  return {
    topSurfaceY: surface.topSurfaceY,
    clearance,
    originX: surface.bedBounds.min.x + margin,
    originZ: surface.bedBounds.min.z + margin,
    pathScale,
    gcodeMinX: gMinX,
    gcodeMinY: gMinY,
  };
}

export function buildCenteredPathAlignment(
  moves: SimulationMove[],
  surface: SurfaceReference,
  clearance: number,
): PathAlignment {
  if (moves.length === 0) {
    return {
      topSurfaceY: surface.topSurfaceY,
      clearance,
      originX: surface.bedBounds.center.x,
      originZ: surface.bedBounds.center.z,
      pathScale: 1,
      gcodeMinX: 0,
      gcodeMinY: 0,
    };
  }

  const xs = moves.map((m) => m.x);
  const ys = moves.map((m) => m.y);
  const gMinX = Math.min(...xs);
  const gMaxX = Math.max(...xs);
  const gMinY = Math.min(...ys);
  const gMaxY = Math.max(...ys);

  const gcodeWidth = Math.max(gMaxX - gMinX, 1e-6);
  const gcodeHeight = Math.max(gMaxY - gMinY, 1e-6);
  const padding = Math.max(Math.min(surface.bedBounds.size.x, surface.bedBounds.size.z) * 0.08, 0.15);
  const availableX = Math.max(surface.bedBounds.size.x - padding * 2, 1e-6);
  const availableZ = Math.max(surface.bedBounds.size.z - padding * 2, 1e-6);
  const scaleX = availableX / gcodeWidth;
  const scaleZ = availableZ / gcodeHeight;
  const fitScale = Math.min(scaleX, scaleZ);
  const pathScale = THREE.MathUtils.clamp(
    Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1,
    0.01,
    100,
  );
  const centerX = (gMinX + gMaxX) * 0.5;
  const centerY = (gMinY + gMaxY) * 0.5;

  return {
    topSurfaceY: surface.topSurfaceY,
    clearance,
    originX: surface.bedBounds.center.x,
    originZ: surface.bedBounds.center.z,
    pathScale,
    gcodeMinX: centerX,
    gcodeMinY: centerY,
  };
}

export function buildBedFitPathAlignment(
  moves: SimulationMove[],
  surface: SurfaceReference,
  clearance: number,
  fitRatio = DEFAULT_BED_FIT_RATIO,
): PathAlignment {
  const safeFitRatio = THREE.MathUtils.clamp(fitRatio, 0.3, 0.8);
  const bedCenter = surface.bedBounds.center;

  if (moves.length === 0) {
    return {
      topSurfaceY: surface.topSurfaceY,
      clearance,
      originX: bedCenter.x,
      originZ: bedCenter.z,
      pathScale: 1,
      gcodeMinX: 0,
      gcodeMinY: 0,
    };
  }

  const bounds = getMoveXYBounds(moves);
  if (!bounds) {
    return {
      topSurfaceY: surface.topSurfaceY,
      clearance,
      originX: bedCenter.x,
      originZ: bedCenter.z,
      pathScale: 1,
      gcodeMinX: 0,
      gcodeMinY: 0,
    };
  }

  const gcodeWidth = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const gcodeHeight = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const targetX = Math.max(surface.bedBounds.size.x * safeFitRatio, 1e-6);
  const targetZ = Math.max(surface.bedBounds.size.z * safeFitRatio, 1e-6);
  const fitScale = Math.min(targetX / gcodeWidth, targetZ / gcodeHeight);
  const pathScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;

  return {
    topSurfaceY: surface.topSurfaceY,
    clearance,
    originX: bedCenter.x,
    originZ: bedCenter.z,
    pathScale,
    gcodeMinX: (bounds.minX + bounds.maxX) * 0.5,
    gcodeMinY: (bounds.minY + bounds.maxY) * 0.5,
  };
}

export function gcodeToWorld(
  alignment: PathAlignment,
  gx: number,
  gy: number,
  gz: number,
): THREE.Vector3 {
  return new THREE.Vector3(
    alignment.originX + (gx - alignment.gcodeMinX) * alignment.pathScale,
    alignment.topSurfaceY + gz * alignment.pathScale + alignment.clearance,
    alignment.originZ + (gy - alignment.gcodeMinY) * alignment.pathScale,
  );
}

export function transformedPathBounds(
  moves: SimulationMove[],
  alignment: PathAlignment,
): Bounds3 {
  if (moves.length === 0) {
    const origin = new THREE.Vector3(alignment.originX, alignment.topSurfaceY, alignment.originZ);
    return { min: origin.clone(), max: origin.clone(), size: new THREE.Vector3(), center: origin };
  }

  const box = new THREE.Box3();
  for (const move of moves) {
    box.expandByPoint(gcodeToWorld(alignment, move.x, move.y, move.z));
  }
  return boundsFromBox(box);
}
