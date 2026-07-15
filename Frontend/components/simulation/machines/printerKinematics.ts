import * as THREE from "three";
import { MachineId, SimulationMove } from "@/lib/simulation";
import {
  buildBedFitPathAlignment,
  buildPathAlignment,
  PathAlignment,
  SurfaceReference,
} from "@/components/simulation/alignment";
import {
  dampObjectAxisPosition,
  findNodeByNameFlexible,
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
const PRINTER_HEAD_DAMPING = 16;
const PRINTER_Z_DAMPING = 18;
const PRINTER_BED_DAMPING = 14;
const PRINTER_PARK_DAMPING = 7;
const PRINTER_PARK_EPSILON = 0.0005;
const NOZZLE_COOL_EMISSIVE = 0x1a0600;
const NOZZLE_HOT_EMISSIVE = 0xff5a1f;
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
  dt: number,
  immediate: boolean,
): void {
  const next = initialPosition[axis] + delta;
  if (immediate) {
    target.position[axis] = next;
    return;
  }
  dampObjectAxisPosition(target, axis, next, PRINTER_BED_DAMPING, dt);
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

export function computePrinterPrintLayerWorldBounds(
  moves: SimulationMove[],
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3,
) {
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const move of moves) {
    if (move.operation !== "print") continue;
    const world = toWorld(move.x, move.y, move.z);
    minZ = Math.min(minZ, world.y);
    maxZ = Math.max(maxZ, world.y);
  }

  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    const bounds = computePrinterMotionWorldBounds(moves, toWorld);
    return {
      minZ: bounds.minZ,
      maxZ: bounds.maxZ,
    };
  }

  if (maxZ - minZ < 1e-6) maxZ = minZ;
  return { minZ, maxZ };
}

export function stylePrinterBed(bedMesh: THREE.Mesh | null): void {
  if (!bedMesh) return;

  const applyToMaterial = (material: THREE.Material) => {
    const next = material.clone();
    if (next instanceof THREE.MeshStandardMaterial || next instanceof THREE.MeshPhysicalMaterial) {
      next.roughness = THREE.MathUtils.clamp(next.roughness * 0.72 + 0.18, 0.42, 0.68);
      next.metalness = Math.max(next.metalness, 0.04);
      next.envMapIntensity = Math.max(next.envMapIntensity, 0.7);
      if (next instanceof THREE.MeshPhysicalMaterial) {
        next.clearcoat = Math.max(next.clearcoat, 0.12);
        next.clearcoatRoughness = Math.max(next.clearcoatRoughness, 0.55);
      }
    }
    next.needsUpdate = true;
    return next;
  };

  if (Array.isArray(bedMesh.material)) {
    bedMesh.material = bedMesh.material.map(applyToMaterial);
  } else if (bedMesh.material) {
    bedMesh.material = applyToMaterial(bedMesh.material);
  }
}

function enhanceNozzleMaterial(material: THREE.Material): THREE.Material {
  const color =
    "color" in material && material.color instanceof THREE.Color
      ? material.color.clone()
      : new THREE.Color(0x5f6266);
  const next =
    material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial
      ? material.clone()
      : new THREE.MeshStandardMaterial({ color });

  if (next instanceof THREE.MeshStandardMaterial) {
    next.color.copy(color);
    next.metalness = Math.max(next.metalness, 0.62);
    next.roughness = THREE.MathUtils.clamp(next.roughness * 0.55 + 0.16, 0.22, 0.42);
    next.emissive = new THREE.Color(NOZZLE_COOL_EMISSIVE);
    next.emissiveIntensity = 0;
    next.envMapIntensity = Math.max(next.envMapIntensity, 0.85);
  }

  next.userData.printerNozzleMaterial = true;
  next.needsUpdate = true;
  return next;
}

export function stylePrinterNozzle(nozzleObject: THREE.Object3D | null): void {
  if (!nozzleObject) return;

  nozzleObject.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map(enhanceNozzleMaterial);
    } else if (child.material) {
      child.material = enhanceNozzleMaterial(child.material);
    }
    child.castShadow = true;
  });
}

export function updatePrinterNozzleHeat(
  kinematics: PrinterKinematics | null,
  isPrinting: boolean,
  dt: number,
): void {
  const nozzleObject = kinematics?.nozzleObject;
  if (!nozzleObject) return;

  const current = typeof nozzleObject.userData.printerNozzleHeat === "number"
    ? nozzleObject.userData.printerNozzleHeat
    : 0;
  const target = isPrinting ? 1 : 0;
  const next = THREE.MathUtils.damp(current, target, isPrinting ? 5.5 : 2.6, Math.max(dt, 0));
  nozzleObject.userData.printerNozzleHeat = next;
  const emissive = new THREE.Color(NOZZLE_COOL_EMISSIVE).lerp(new THREE.Color(NOZZLE_HOT_EMISSIVE), next);

  nozzleObject.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (
        material.userData?.printerNozzleMaterial &&
        (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)
      ) {
        material.emissive.copy(emissive);
        material.emissiveIntensity = THREE.MathUtils.lerp(0.02, 0.95, next);
      }
    }
  });
}

export function configurePrinterModelShadows(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });

  const enableMeshShadows = (
    object: THREE.Object3D | null,
    options: { cast?: boolean; receive?: boolean },
  ) => {
    object?.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = Boolean(options.cast);
      child.receiveShadow = Boolean(options.receive);
    });
  };

  enableMeshShadows(findPrinterBedObject(model), { cast: true, receive: true });
  enableMeshShadows(findPrinterPrintSurfaceObject(model), { receive: true });
  for (const name of PRINTER_HEAD_PARTS) {
    enableMeshShadows(findNodeByNameFlexible(model, name), { cast: true });
  }
  for (const name of PRINTER_Z_PARTS) {
    enableMeshShadows(findNodeByNameFlexible(model, name), { cast: true });
  }
  enableMeshShadows(findNodeByNameFlexible(model, PRINTER_NOZZLE_OBJECT_NAME), { cast: true });
}

export function tickPrinterBed(_kinematics: PrinterKinematics | null, _isPrinting: boolean): void {
  void _kinematics;
  void _isPrinting;
  // The real bed meshes are positioned from G-code Y in syncPrinterMechanics.
}

function getPrinterLayerLocalOffset(kinematics: PrinterKinematics, toolWorldY: number): number {
  const layerMin = kinematics.printLayerWorldBounds.minZ;
  const layerMax = Math.max(kinematics.printLayerWorldBounds.maxZ, layerMin);
  const layerSpan = Math.max(layerMax - layerMin, 0);
  const safetyGap = THREE.MathUtils.clamp(layerSpan * 0.015, 0.006, 0.025);
  const currentLayerHeight = THREE.MathUtils.clamp(
    toolWorldY - layerMin + safetyGap,
    0,
    layerSpan + safetyGap,
  );
  const localLayerLift = currentLayerHeight / Math.max(Math.abs(kinematics.modelWorldScaleY), 1e-6);
  return THREE.MathUtils.clamp(
    PRINTER_Z_MIN + localLayerLift,
    kinematics.zLimits.minLocalOffset,
    kinematics.zLimits.maxLocalOffset,
  );
}

export function parkPrinterMechanics(
  machineType: MachineId | "generic",
  kinematics: PrinterKinematics | null,
  dt: number,
  immediate = false,
): boolean {
  if (machineType !== "printer3d" || !kinematics) return true;

  let maxDelta = 0;
  const settleAxis = (
    part: PositionedPrinterPart,
    axis: "x" | "y" | "z",
    target: number,
  ) => {
    if (immediate) {
      part.object.position[axis] = target;
      return;
    } else {
      dampObjectAxisPosition(part.object, axis, target, PRINTER_PARK_DAMPING, dt);
      if (Math.abs(part.object.position[axis] - target) < PRINTER_PARK_EPSILON) {
        part.object.position[axis] = target;
      }
    }
    maxDelta = Math.max(maxDelta, Math.abs(part.object.position[axis] - target));
  };

  for (const part of kinematics.headParts) {
    settleAxis(part, "x", part.initialPosition.x);
    settleAxis(part, "y", part.initialPosition.y);
  }

  for (const part of kinematics.zParts) {
    settleAxis(part, "y", part.initialPosition.y);
  }

  return maxDelta < PRINTER_PARK_EPSILON;
}

export function syncPrinterMechanics(
  machineType: MachineId | "generic",
  kinematics: PrinterKinematics | null,
  toolWorldPos: THREE.Vector3,
  dt: number,
  immediate = false,
): void {
  if (machineType !== "printer3d" || !kinematics) return;

  const xSpan = Math.max(kinematics.motionWorldBounds.maxX - kinematics.motionWorldBounds.minX, 1e-6);
  const ySpan = Math.max(kinematics.motionWorldBounds.maxY - kinematics.motionWorldBounds.minY, 1e-6);
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
  const headOffsetX = THREE.MathUtils.lerp(
    kinematics.xLimits.minLocalOffset,
    kinematics.xLimits.maxLocalOffset,
    xProgress,
  );
  const zOffsetY = getPrinterLayerLocalOffset(kinematics, toolWorldPos.y);
  const bedOffset = THREE.MathUtils.lerp(PRINTER_BED_MIN, PRINTER_BED_MAX, yProgress);
  kinematics.currentBedOffset = bedOffset;
  const debugHeadOffsetX = headOffsetX + PRINTER_DEBUG_VISIBLE_OFFSET;
  const debugZOffsetY = zOffsetY + PRINTER_DEBUG_VISIBLE_OFFSET;

  for (const part of kinematics.headParts) {
    const targetX = part.initialPosition.x + debugHeadOffsetX;
    const targetY = part.initialPosition.y + debugZOffsetY;
    if (immediate) {
      part.object.position.x = targetX;
      part.object.position.y = targetY;
      continue;
    }
    dampObjectAxisPosition(part.object, "x", targetX, PRINTER_HEAD_DAMPING, dt);
    // G-code Z is world Y in this scene, and this imported printer model uses
    // local Y for vertical head/nozzle travel.
    dampObjectAxisPosition(part.object, "y", targetY, PRINTER_Z_DAMPING, dt);
  }

  for (const part of kinematics.zParts) {
    const targetY = part.initialPosition.y + debugZOffsetY;
    if (immediate) {
      part.object.position.y = targetY;
    } else {
      dampObjectAxisPosition(part.object, "y", targetY, PRINTER_Z_DAMPING, dt);
    }
  }

  for (const part of kinematics.bedParts) {
    applyBedMotionDelta(part.object, PRINTER_BED_VISUAL_AXIS, part.initialPosition, bedOffset, dt, immediate);
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
  stylePrinterNozzle(nozzleObject);

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
  const printLayerWorldBounds = computePrinterPrintLayerWorldBounds(moves, toWorld);
  const modelWorldScale = model.getWorldScale(new THREE.Vector3());

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
    printLayerWorldBounds,
    modelWorldScaleY: Math.max(Math.abs(modelWorldScale.y), 1e-6),
  };
}
