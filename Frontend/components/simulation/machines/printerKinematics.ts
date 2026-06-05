import * as THREE from "three";
import { MachineId, SimulationMove } from "@/lib/simulation";
import {
  buildBedFitPathAlignment,
  buildPathAlignment,
  PathAlignment,
  SurfaceReference,
} from "@/components/simulation/alignment";
import {
  findNodeByNameFlexible,
  lerpObjectAxisPosition,
} from "@/components/simulation/machines/shared";
import {
  PRINTER_BED_PART,
  PRINTER_BED_PARTS,
  PRINTER_BED_ROOT_PART,
  PRINTER_DEBUG_VISIBLE_OFFSET,
  PRINTER_GRID_PART,
  PRINTER_HEAD_X_MAX,
  PRINTER_HEAD_X_MIN,
  PRINTER_HEAD_PARTS,
  PRINTER_NOZZLE_MESH_NAME,
  PRINTER_NOZZLE_OBJECT_NAME,
  PRINTER_PRINT_SURFACE_PART,
  PRINTER_Z_MAX,
  PRINTER_Z_GUIDE_PARTS,
  PRINTER_Z_MIN,
  PRINTER_Z_PARTS,
  type PositionedPrinterPart,
  type PrinterKinematics,
} from "@/components/simulation/machines/printerConfig";

export const PRINTER_BED_MIN = -0.23;
export const PRINTER_BED_MAX = -0.15;
const CNC_DESIGN_FIT_RATIO = 0.46;

// Blender bed axis is Y, but the imported Three.js visual front/back axis is Z,
// so animate the actual bed meshes on local Z instead of moving Cube.003 on Y.
const PRINTER_BED_VISUAL_AXIS = "z";
let lastPrinterKinematicsDebugAt = 0;

function formatVector3(vector: THREE.Vector3): [number, number, number] {
  return [
    Number(vector.x.toFixed(3)),
    Number(vector.y.toFixed(3)),
    Number(vector.z.toFixed(3)),
  ];
}

function getCncCuttingPathMoves(moves: SimulationMove[]): SimulationMove[] {
  const cuttingMoves: SimulationMove[] = [];

  for (let index = 1; index < moves.length; index += 1) {
    const from = moves[index - 1];
    const to = moves[index];
    const hasPlaneMotion = Math.abs(to.x - from.x) > 1e-8 || Math.abs(to.y - from.y) > 1e-8;

    if (to.operation !== "cut" || !hasPlaneMotion) continue;

    cuttingMoves.push(from, to);
  }

  return cuttingMoves.length > 0 ? cuttingMoves : moves;
}

function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let parent = object.parent;
  while (parent) {
    if (parent === ancestor) return true;
    parent = parent.parent;
  }
  return false;
}

function applyBedMotionDelta(
  target: THREE.Object3D,
  axis: typeof PRINTER_BED_VISUAL_AXIS,
  initialPosition: THREE.Vector3,
  delta: number,
  blend: number,
): void {
  lerpObjectAxisPosition(target, axis, initialPosition[axis] + delta, blend);
}

export function findPrinterBedObject(root: THREE.Object3D): THREE.Object3D | null {
  return root.getObjectByName(PRINTER_BED_ROOT_PART) ?? findNodeByNameFlexible(root, PRINTER_BED_ROOT_PART);
}

export function findPrinterPrintSurfaceObject(root: THREE.Object3D): THREE.Object3D | null {
  return root.getObjectByName(PRINTER_PRINT_SURFACE_PART) ?? findNodeByNameFlexible(root, PRINTER_PRINT_SURFACE_PART);
}

export function buildPrinterBedAlignedPathAlignment(
  moves: SimulationMove[],
  surface: SurfaceReference,
  clearance: number,
): PathAlignment {
  const baseAlignment = buildBedFitPathAlignment(moves, surface, clearance);
  const bedCenter = surface.bedBounds.center;

  if (moves.length === 0) {
    return {
      ...baseAlignment,
      topSurfaceY: surface.topSurfaceY,
      clearance,
      originX: bedCenter.x,
      originZ: bedCenter.z,
    };
  }

  const xs = moves.map((move) => move.x);
  const ys = moves.map((move) => move.y);
  const gMinX = Math.min(...xs);
  const gMaxX = Math.max(...xs);
  const gMinY = Math.min(...ys);
  const gMaxY = Math.max(...ys);
  // Place the gcode centroid at the bed centre. toWorld offsets each point by
  // (gx - gMinX) * pathScale from originX, so to centre the print we set
  // originX = bedCenter.x - halfSpan, exactly as before — but with the gcode
  // midpoint, not halfSpan derived from pathScale twice.
  const halfSpanX = ((gMaxX - gMinX) / 2) * baseAlignment.pathScale;
  const halfSpanZ = ((gMaxY - gMinY) / 2) * baseAlignment.pathScale;

  return {
    ...baseAlignment,
    topSurfaceY: surface.topSurfaceY,
    clearance,
    originX: bedCenter.x - halfSpanX,
    originZ: bedCenter.z - halfSpanZ,
    gcodeMinX: gMinX,
    gcodeMinY: gMinY,
  };
}

export function buildMachinePathAlignment(
  moves: SimulationMove[],
  surface: SurfaceReference,
  clearance: number,
  machineType: MachineId | "generic",
): PathAlignment {
  if (machineType === "printer3d") {
    return buildPrinterBedAlignedPathAlignment(moves, surface, clearance);
  }

  if (machineType === "cnc") {
    return buildBedFitPathAlignment(
      getCncCuttingPathMoves(moves),
      surface,
      clearance,
      CNC_DESIGN_FIT_RATIO,
    );
  }

  return buildPathAlignment(moves, surface, clearance);
}

export function computePrinterMotionWorldBounds(
  moves: SimulationMove[],
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3,
) {
  const firstMove = moves[0];
  const fallback = firstMove ? toWorld(firstMove.x, firstMove.y, firstMove.z) : new THREE.Vector3();

  if (moves.length === 0) {
    return {
      minX: fallback.x,
      maxX: fallback.x + 1,
      // minY/maxY = world Z axis (gcode Y / bed front-back)
      minY: fallback.z,
      maxY: fallback.z + 1,
      // minZ/maxZ = world Y axis (gcode Z / print height)
      minZ: fallback.y,
      maxZ: fallback.y + 1,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY; // world Z
  let maxY = Number.NEGATIVE_INFINITY; // world Z
  let minZ = Number.POSITIVE_INFINITY; // world Y (height)
  let maxZ = Number.NEGATIVE_INFINITY; // world Y (height)

  for (const move of moves) {
    const world = toWorld(move.x, move.y, move.z);
    minX = Math.min(minX, world.x);
    maxX = Math.max(maxX, world.x);
    minY = Math.min(minY, world.z); // world Z = gcode Y = bed front-back
    maxY = Math.max(maxY, world.z);
    minZ = Math.min(minZ, world.y); // world Y = gcode Z = print height
    maxZ = Math.max(maxZ, world.y);
  }

  if (maxX - minX < 1e-6) maxX = minX + 1;
  if (maxY - minY < 1e-6) maxY = minY + 1;
  if (maxZ - minZ < 1e-6) maxZ = minZ + 1;

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

export function stylePrinterBed(bedMesh: THREE.Mesh | null): void {
  if (!bedMesh) return;

  const applyToMaterial = (material: THREE.Material) => {
    const next = material.clone();
    if ("color" in next && next.color instanceof THREE.Color) {
      next.color.setHex(0xf6f8fb);
    }
    if (next instanceof THREE.MeshStandardMaterial || next instanceof THREE.MeshPhysicalMaterial) {
      next.color.setHex(0xf5f7fa);
      next.roughness = 0.72;
      next.metalness = 0.05;
    }
    return next;
  };

  if (Array.isArray(bedMesh.material)) {
    bedMesh.material = bedMesh.material.map(applyToMaterial);
  } else if (bedMesh.material) {
    bedMesh.material = applyToMaterial(bedMesh.material);
  }
}

export function tickPrinterBed(_kinematics: PrinterKinematics | null, _isPrinting: boolean): void {
  void _kinematics;
  void _isPrinting;
  // The real bed meshes are positioned from G-code Y in syncPrinterMechanics.
}

export function syncPrinterMechanics(
  machineType: MachineId | "generic",
  kinematics: PrinterKinematics | null,
  toolWorldPos: THREE.Vector3,
  dt: number,
  immediate = false,
): void {
  if (machineType !== "printer3d" || !kinematics) return;

  const blendXY = immediate ? 1 : THREE.MathUtils.clamp(dt * 14, 0.12, 0.82);
  const blendZ = immediate ? 1 : THREE.MathUtils.clamp(dt * 18, 0.18, 0.9);
  const xSpan = Math.max(kinematics.motionWorldBounds.maxX - kinematics.motionWorldBounds.minX, 1e-6);
  const ySpan = Math.max(kinematics.motionWorldBounds.maxY - kinematics.motionWorldBounds.minY, 1e-6);
  const zSpan = Math.max(kinematics.motionWorldBounds.maxZ - kinematics.motionWorldBounds.minZ, 1e-6);
  const xProgress = THREE.MathUtils.clamp(
    (toolWorldPos.x - kinematics.motionWorldBounds.minX) / xSpan,
    0,
    1,
  );
  const yProgress = THREE.MathUtils.clamp(
    (toolWorldPos.z - kinematics.motionWorldBounds.minY) / ySpan,
    0,
    1,
  );
  const zProgress = THREE.MathUtils.clamp(
    (toolWorldPos.y - kinematics.motionWorldBounds.minZ) / zSpan,
    0,
    1,
  );
  const headOffsetX = THREE.MathUtils.lerp(
    kinematics.xLimits.minLocalOffset,
    kinematics.xLimits.maxLocalOffset,
    xProgress,
  );
  const zOffsetY = THREE.MathUtils.lerp(
    kinematics.zLimits.minLocalOffset,
    kinematics.zLimits.maxLocalOffset,
    zProgress,
  );
  const bedOffset = THREE.MathUtils.lerp(PRINTER_BED_MIN, PRINTER_BED_MAX, yProgress);
  kinematics.currentBedOffset = bedOffset;
  const debugHeadOffsetX = headOffsetX + PRINTER_DEBUG_VISIBLE_OFFSET;
  const debugZOffsetY = zOffsetY + PRINTER_DEBUG_VISIBLE_OFFSET;

  for (const part of kinematics.headParts) {
    const targetX = part.initialPosition.x + debugHeadOffsetX;
    const targetY = part.initialPosition.y + debugZOffsetY;
    lerpObjectAxisPosition(part.object, "x", targetX, blendXY);
    // G-code Z is world Y in this scene, and this imported printer model uses
    // local Y for vertical head/nozzle travel.
    lerpObjectAxisPosition(part.object, "y", targetY, blendZ);
  }

  for (const part of kinematics.zParts) {
    const targetY = part.initialPosition.y + debugZOffsetY;
    lerpObjectAxisPosition(part.object, "y", targetY, blendZ);
  }

  for (const part of kinematics.bedParts) {
    applyBedMotionDelta(part.object, PRINTER_BED_VISUAL_AXIS, part.initialPosition, bedOffset, blendXY);
  }

  if (process.env.NODE_ENV !== "production") {
    const now = Date.now();
    if (now - lastPrinterKinematicsDebugAt >= 750) {
      lastPrinterKinematicsDebugAt = now;

      const headPart = kinematics.headParts[0] ?? null;
      const bedRoot = kinematics.bedParts[0]?.object ?? null;
      const headWorld = headPart?.object.getWorldPosition(new THREE.Vector3()) ?? null;
      const nozzleWorld = kinematics.nozzleObject?.getWorldPosition(new THREE.Vector3()) ?? null;
      const bedWorld = bedRoot?.getWorldPosition(new THREE.Vector3()) ?? null;

      console.debug("[Printer3D] kinematics transform debug", {
        headOffsetX: Number(debugHeadOffsetX.toFixed(3)),
        bedOffset: Number(bedOffset.toFixed(3)),
        headYOffset: Number(debugZOffsetY.toFixed(3)),
        gantryYOffset: Number(debugZOffsetY.toFixed(3)),
        head: headPart
          ? {
              name: headPart.name,
              local: formatVector3(headPart.object.position),
              world: headWorld ? formatVector3(headWorld) : null,
              parent: headPart.object.parent?.name ?? null,
              inheritsBedRoot: bedRoot ? isDescendantOf(headPart.object, bedRoot) : false,
            }
          : null,
        nozzle: kinematics.nozzleObject
          ? {
              name: kinematics.nozzleObject.name,
              local: formatVector3(kinematics.nozzleObject.position),
              world: nozzleWorld ? formatVector3(nozzleWorld) : null,
              parent: kinematics.nozzleObject.parent?.name ?? null,
              inheritsBedRoot: bedRoot ? isDescendantOf(kinematics.nozzleObject, bedRoot) : false,
            }
          : null,
        printBedRoot: bedRoot
          ? {
              name: bedRoot.name,
              local: formatVector3(bedRoot.position),
              world: bedWorld ? formatVector3(bedWorld) : null,
              rotation: formatVector3(new THREE.Vector3(bedRoot.rotation.x, bedRoot.rotation.y, bedRoot.rotation.z)),
              scale: formatVector3(bedRoot.scale),
            }
          : null,
      });
    }
  }
}

export function createPrinterSurfaceReference(
  model: THREE.Object3D,
  bedRoot: THREE.Object3D,
): SurfaceReference {
  model.updateWorldMatrix(true, true);
  bedRoot.updateWorldMatrix(true, true);

  const printSurface = findPrinterPrintSurfaceObject(bedRoot) ?? findPrinterPrintSurfaceObject(model);
  if (!printSurface) {
    console.warn(`[Printer3D] ${PRINTER_PRINT_SURFACE_PART} not found; falling back to ${PRINTER_BED_ROOT_PART} bounds.`);
  }

  const surfaceObject = printSurface ?? bedRoot;
  // Must propagate to children so Box3.setFromObject gets correct world transforms.
  surfaceObject.updateWorldMatrix(true, true);

  const modelBox = new THREE.Box3().setFromObject(model);
  const bedBox = new THREE.Box3().setFromObject(surfaceObject);
  const modelSize = new THREE.Vector3();
  const modelCenter = new THREE.Vector3();
  const bedSize = new THREE.Vector3();
  const bedCenter = new THREE.Vector3();
  modelBox.getSize(modelSize);
  modelBox.getCenter(modelCenter);
  bedBox.getSize(bedSize);
  bedBox.getCenter(bedCenter);

  return {
    sourceMeshName: surfaceObject.name || PRINTER_BED_PART,
    topSurfaceY: bedBox.max.y,
    modelBounds: { min: modelBox.min.clone(), max: modelBox.max.clone(), size: modelSize, center: modelCenter },
    bedBounds: { min: bedBox.min.clone(), max: bedBox.max.clone(), size: bedSize, center: bedCenter },
  };
}

type CreatePrinterKinematicsArgs = {
  model: THREE.Object3D;
  moves: SimulationMove[];
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3;
};

export function createPrinterKinematics({
  model,
  moves,
  toWorld,
}: CreatePrinterKinematicsArgs): PrinterKinematics | null {
  const bedObject = findPrinterBedObject(model);
  const printSurfaceObject = findPrinterPrintSurfaceObject(bedObject ?? model) ?? findPrinterPrintSurfaceObject(model);
  const bedMesh = printSurfaceObject instanceof THREE.Mesh ? printSurfaceObject : null;
  const nozzleObject = findNodeByNameFlexible(model, PRINTER_NOZZLE_OBJECT_NAME);
  const nozzleMesh = nozzleObject ? findNodeByNameFlexible(nozzleObject, PRINTER_NOZZLE_MESH_NAME) : null;
  stylePrinterBed(bedMesh);

  console.info("[Printer3D] Real nozzle lookup", {
    nozzleObject: nozzleObject?.name ?? null,
    nozzleMesh: nozzleMesh?.name ?? null,
    found: Boolean(nozzleObject),
  });
  if (!nozzleObject) {
    console.warn(
      `[Printer3D] Real nozzle object "${PRINTER_NOZZLE_OBJECT_NAME}" was not found; falling back to the generated virtual pen.`,
    );
  }

  const gridReference = findNodeByNameFlexible(model, PRINTER_GRID_PART);
  const guideA = findNodeByNameFlexible(model, PRINTER_Z_GUIDE_PARTS[0]);
  const guideB = findNodeByNameFlexible(model, PRINTER_Z_GUIDE_PARTS[1]);

  const headParts: PositionedPrinterPart[] = [];
  const zParts: PositionedPrinterPart[] = [];
  const bedParts: PositionedPrinterPart[] = [];

  for (const name of PRINTER_HEAD_PARTS) {
    const object = findNodeByNameFlexible(model, name);
    if (!object) {
      console.warn(`[Printer3D] Missing head part: ${name}`);
      continue;
    }
    headParts.push({
      name,
      object,
      initialPosition: object.position.clone(),
    });
  }

  for (const name of PRINTER_Z_PARTS) {
    const object = findNodeByNameFlexible(model, name);
    if (!object) {
      console.warn(`[Printer3D] Missing Z part: ${name}`);
      continue;
    }
    zParts.push({
      name,
      object,
      initialPosition: object.position.clone(),
    });
  }

  for (const name of PRINTER_BED_PARTS) {
    const object = findNodeByNameFlexible(model, name);
    if (!object) {
      console.warn(`[Printer3D] Missing bed part: ${name}`);
      continue;
    }
    bedParts.push({
      name,
      object,
      initialPosition: object.position.clone(),
    });
  }

  console.info("[Printer3D] Found head parts", headParts.map((part) => part.name));
  console.info("[Printer3D] Found Z parts", zParts.map((part) => part.name));
  console.info("[Printer3D] Found bed motion parts", bedParts.map((part) => part.name));
  console.info("[Printer3D] Found bed/grid/guides", {
    bed: bedObject?.name ?? null,
    printSurface: printSurfaceObject?.name ?? null,
    grid: gridReference?.name ?? null,
    guideA: guideA?.name ?? null,
    guideB: guideB?.name ?? null,
  });
  console.info("[Printer3D] Transform inheritance check", {
    printBedRoot: bedObject?.name ?? null,
    nozzleUnderPrintBedRoot: Boolean(bedObject && nozzleObject && isDescendantOf(nozzleObject, bedObject)),
    headPartsUnderPrintBedRoot: bedObject
      ? headParts
          .filter((part) => isDescendantOf(part.object, bedObject))
          .map((part) => part.name)
      : [],
    zPartsUnderPrintBedRoot: bedObject
      ? zParts
          .filter((part) => isDescendantOf(part.object, bedObject))
          .map((part) => part.name)
      : [],
  });
  console.info("[Printer3D] Found parts", {
    head: headParts.map((part) => part.name),
    z: zParts.map((part) => part.name),
    bed: bedParts.map((part) => part.name),
    fixedReferences: [PRINTER_GRID_PART, ...PRINTER_Z_GUIDE_PARTS],
  });
  console.info("[Printer3D] Initial local positions", {
    head: headParts.map((part) => ({
      name: part.name,
      x: Number(part.initialPosition.x.toFixed(3)),
      y: Number(part.initialPosition.y.toFixed(3)),
      z: Number(part.initialPosition.z.toFixed(3)),
    })),
    z: zParts.map((part) => ({
      name: part.name,
      x: Number(part.initialPosition.x.toFixed(3)),
      y: Number(part.initialPosition.y.toFixed(3)),
      z: Number(part.initialPosition.z.toFixed(3)),
    })),
    bed: bedParts.map((part) => ({
      name: part.name,
      x: Number(part.initialPosition.x.toFixed(3)),
      y: Number(part.initialPosition.y.toFixed(3)),
      z: Number(part.initialPosition.z.toFixed(3)),
    })),
  });

  if (headParts.length === 0 && zParts.length === 0 && bedParts.length === 0) {
    console.warn("[Printer3D] No critical moving parts found; printer motion disabled.");
    return null;
  }

  if (!gridReference || !guideA || !guideB) {
    console.warn("[Printer3D] Missing one or more fixed reference parts; measured movement ranges will still be used.", {
      grid: Boolean(gridReference),
      guideA: Boolean(guideA),
      guideB: Boolean(guideB),
    });
  }

  const xLimits = {
    minLocalOffset: PRINTER_HEAD_X_MIN,
    maxLocalOffset: PRINTER_HEAD_X_MAX,
  };
  const zLimits = {
    minLocalOffset: PRINTER_Z_MIN,
    maxLocalOffset: PRINTER_Z_MAX,
  };
  const firstMove = moves[0];
  const anchorWorld = firstMove
    ? toWorld(firstMove.x, firstMove.y, firstMove.z)
    : headParts[0]?.object.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
  const motionWorldBounds = computePrinterMotionWorldBounds(moves, toWorld);

  console.info("[Printer3D] X travel", {
    measuredMin: xLimits.minLocalOffset,
    measuredMax: xLimits.maxLocalOffset,
    pathMin: motionWorldBounds.minX,
    pathMax: motionWorldBounds.maxX,
  });
  console.info("[Printer3D] Z travel", {
    measuredMin: zLimits.minLocalOffset,
    measuredMax: zLimits.maxLocalOffset,
    pathMin: motionWorldBounds.minZ,
    pathMax: motionWorldBounds.maxZ,
  });
  console.info("[Printer3D] Bed Y travel", {
    measuredMin: PRINTER_BED_MIN,
    measuredMax: PRINTER_BED_MAX,
    visualAxis: PRINTER_BED_VISUAL_AXIS,
    pathMin: motionWorldBounds.minY,
    pathMax: motionWorldBounds.maxY,
  });

  return {
    headParts,
    zParts,
    bedParts,
    bedAttachedParts: [],
    bedMesh,
    nozzleObject,
    bedBasePosition: bedObject ? bedObject.position.clone() : new THREE.Vector3(),
    currentBedOffset: 0,
    anchorWorld,
    xLimits,
    zLimits,
    motionWorldBounds,
  };
}
