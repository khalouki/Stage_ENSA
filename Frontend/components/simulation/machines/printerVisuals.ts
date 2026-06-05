import * as THREE from "three";
import type { SimulationMove } from "@/lib/simulation";
import {
  COLOR_GHOST,
} from "@/components/simulation/scene/sceneConstants";
import {
  PRINTER_BEAD_Y_OFFSET,
  type PrintChunk,
  type PrintSegmentDescriptor,
  type PrintedObjectReveal,
} from "@/components/simulation/machines/printerConfig";
import type { SurfaceReference } from "@/components/simulation/alignment";

const FDM_NOZZLE_WIDTH_MM = 0.35;
const FDM_LAYER_HEIGHT_MM = 0.1;
const MIN_PATH_WIDTH = 0.025;
const MAX_PATH_WIDTH = 0.55;
const MIN_PATH_HEIGHT = 0.012;
const EXTRUSION_EPSILON = 1e-7;
const PRINT_POLYGON_OFFSET_FACTOR = -1;
const PRINT_POLYGON_OFFSET_UNITS = -1;

// Filament color palette — mimics real PLA/PETG printed plastic.
// Active (just extruded): bright molten orange-red glow.
// Done (cooled): deep matte red/maroon with slight sheen, like real printed plastic.
const COLOR_FILAMENT_ACTIVE_BASE  = 0xff4400;   // hot molten orange-red
const COLOR_FILAMENT_DONE_BASE    = 0xc0392b;   // cooled red plastic (like Cura default)
const PRINTED_OBJECT_COLOR        = 0xc0392b;
type PrintColor = THREE.ColorRepresentation | undefined;

function createFilamentPathGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** Active bead: glowing hot molten filament fresh from the nozzle. */
function createActiveMaterial(printLineColor?: PrintColor): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: printLineColor ?? COLOR_FILAMENT_ACTIVE_BASE,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: PRINT_POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits: PRINT_POLYGON_OFFSET_UNITS,
  });
}

/** Done bead: cooled, slightly shiny plastic. */
function createDoneMaterial(printLineColor?: PrintColor): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: printLineColor ?? COLOR_FILAMENT_DONE_BASE,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: PRINT_POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits: PRINT_POLYGON_OFFSET_UNITS,
  });
}

function getPathVisualWidth(pathScale: number): number {
  return THREE.MathUtils.clamp(pathScale * FDM_NOZZLE_WIDTH_MM, MIN_PATH_WIDTH, MAX_PATH_WIDTH);
}

export function getPrinterBeadSize(
  pathScale: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
  extrusionDelta = 0,
) {
  const length = start.distanceTo(end);
  void extrusionDelta;

  return {
    width: getPathVisualWidth(pathScale),
    height: Math.max(pathScale * FDM_LAYER_HEIGHT_MM, MIN_PATH_HEIGHT),
    length,
  };
}

export function createPrinterSegmentObject(
  start: THREE.Vector3,
  end: THREE.Vector3,
  isRapid: boolean,
  pathScale: number,
  extrusionDelta = 0,
  progress = 1,
  printLineColor?: PrintColor,
): THREE.Object3D {
  // Travel moves: return a completely invisible dummy object.
  // Real printers don't show travel lines — the nozzle just moves.
  if (isRapid) {
    const dummy = new THREE.Object3D();
    dummy.userData.isRapid = true;
    dummy.userData.kind = "rapid";
    dummy.visible = false;
    return dummy;
  }

  const direction = end.clone().sub(start);
  const { width, height, length } = getPrinterBeadSize(pathScale, start, end, extrusionDelta);
  void progress;
  const visibleLength = Math.max(length, 0);

  if (visibleLength > 1e-4) {
    const geo = createFilamentPathGeometry();
    const mat = createActiveMaterial(printLineColor);
    const path = new THREE.Mesh(geo, mat);
    path.frustumCulled = false;
    path.scale.set(visibleLength, height, width);
    path.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
    path.position.copy(start).lerp(end, 0.5);
    path.position.y += PRINTER_BEAD_Y_OFFSET;
    path.castShadow = false;
    path.receiveShadow = false;
    path.userData.isRapid = false;
    path.userData.kind = "print";
    return path;
  }

  // Fallback invisible object for zero-length segments
  const dummy = new THREE.Object3D();
  dummy.userData.isRapid = false;
  dummy.userData.kind = "print";
  dummy.visible = false;
  return dummy;
}

export function markPrinterSegmentDone(segment: THREE.Object3D, printLineColor?: PrintColor): void {
  // Travel dummies: nothing to do
  if (segment.userData?.isRapid || !segment.visible) return;

  // For Mesh beads (print segments) swap the hot material for the cooled one
  if (segment instanceof THREE.Mesh) {
    const oldMat = segment.material as THREE.Material;
    segment.material = createDoneMaterial(printLineColor);
    oldMat.dispose();
    segment.castShadow = false;
    segment.receiveShadow = false;
    return;
  }

  // Legacy Line fallback (should not happen in printer mode now)
  if (segment instanceof THREE.Line) {
    const mat = segment.material as THREE.LineBasicMaterial;
    mat.color.set(printLineColor ?? COLOR_FILAMENT_DONE_BASE);
    mat.transparent = false;
    mat.opacity = 1;
  }
}

export function buildPrinterPrintSegments(
  moves: SimulationMove[],
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3,
  pathScale: number,
): PrintSegmentDescriptor[] {
  const printSegments: PrintSegmentDescriptor[] = [];
  for (let index = 0; index < moves.length - 1; index += 1) {
    const from = moves[index];
    const to = moves[index + 1];
    if (to.operation !== "print") continue;

    const start = toWorld(from.x, from.y, from.z);
    const end = toWorld(to.x, to.y, to.z);
    const distance = start.distanceTo(end);
    if (distance <= 1e-4) continue;

    const { width, height } = getPrinterBeadSize(pathScale, start, end, to.extrusionDelta ?? 0);
    printSegments.push({
      start,
      end,
      width,
      height,
      moveIndex: index + 1,
    });
  }
  return printSegments;
}

export function buildPrinterReconstructedSegments(
  moves: SimulationMove[],
  surface: SurfaceReference,
): PrintSegmentDescriptor[] {
  const extrusionSegments: Array<{ from: SimulationMove; to: SimulationMove; moveIndex: number }> = [];
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };

  for (let index = 0; index < moves.length - 1; index += 1) {
    const from = moves[index];
    const to = moves[index + 1];
    if (to.operation !== "print" || (to.extrusionDelta ?? 0) <= EXTRUSION_EPSILON) continue;

    extrusionSegments.push({ from, to, moveIndex: index + 1 });
    for (const point of [from, to]) {
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxY = Math.max(bounds.maxY, point.y);
      bounds.minZ = Math.min(bounds.minZ, point.z);
      bounds.maxZ = Math.max(bounds.maxZ, point.z);
    }
  }

  if (extrusionSegments.length === 0) return [];

  const bed = surface.bedBounds;
  const gSpanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const gSpanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const layerValues: number[] = [];
  for (const segment of extrusionSegments) {
    const z = segment.to.z;
    if (!layerValues.some((layerZ) => Math.abs(layerZ - z) < 1e-5)) {
      layerValues.push(z);
    }
  }
  layerValues.sort((a, b) => a - b);
  const bedPadding = Math.max(Math.min(bed.size.x, bed.size.z) * 0.16, 0.04);
  const fitScale = Math.min(
    Math.max(bed.size.x - bedPadding * 2, 1e-6) / gSpanX,
    Math.max(bed.size.z - bedPadding * 2, 1e-6) / gSpanY,
  );
  const objectHeight = THREE.MathUtils.clamp(Math.min(bed.size.x, bed.size.z) * 0.22, 0.18, 0.9);
  const pathWidth = getPathVisualWidth(fitScale);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  const layerStep = layerValues.length > 1 ? objectHeight / (layerValues.length - 1) : 0;
  const layerIndexForZ = (z: number) => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    layerValues.forEach((layerZ, index) => {
      const distance = Math.abs(layerZ - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  };

  const mapPoint = (move: SimulationMove) =>
    new THREE.Vector3(
      bed.center.x + (move.x - centerX) * fitScale,
      surface.topSurfaceY + layerIndexForZ(move.z) * layerStep,
      bed.center.z + (move.y - centerY) * fitScale,
    );

  return extrusionSegments.flatMap(({ from, to, moveIndex }) => {
    const start = mapPoint(from);
    const end = mapPoint(to);
    if (start.distanceToSquared(end) <= 1e-8) return [];

    return [{
      start,
      end,
      width: pathWidth,
      height: Math.max(fitScale * FDM_LAYER_HEIGHT_MM, MIN_PATH_HEIGHT),
      moveIndex,
    }];
  });
}

export function buildPrintedGeometry(
  parent: THREE.Object3D,
  segments: PrintSegmentDescriptor[],
  printLineColor?: PrintColor,
): PrintChunk[] {
  const chunks: PrintChunk[] = [];
  const chunkSize = 2500;
  const helperMatrix = new THREE.Matrix4();
  const helperPosition = new THREE.Vector3();
  const helperScale = new THREE.Vector3();
  const helperQuaternion = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);

  for (let index = 0; index < segments.length; index += chunkSize) {
    const slice = segments.slice(index, index + chunkSize);
    const mesh = new THREE.InstancedMesh(createFilamentPathGeometry(), createDoneMaterial(printLineColor), slice.length);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    slice.forEach((segment, localIndex) => {
      const direction = segment.end.clone().sub(segment.start);
      const length = Math.max(direction.length(), 0.02);
      helperQuaternion.setFromUnitVectors(xAxis, direction.normalize());
      helperScale.set(length, segment.height, segment.width);
      helperPosition.copy(segment.start).lerp(segment.end, 0.5);
      helperPosition.y += PRINTER_BEAD_Y_OFFSET;
      helperMatrix.compose(helperPosition, helperQuaternion, helperScale);
      mesh.setMatrixAt(localIndex, helperMatrix);
    });

    // Mark the buffer dirty after initial upload so the GPU sees the data.
    mesh.instanceMatrix.needsUpdate = true;

    parent.add(mesh);
    chunks.push({ mesh, capacity: slice.length });
  }

  return chunks;
}

export function updatePrintedGeometry(chunks: PrintChunk[], completedCount: number): number {
  let remaining = Math.max(0, completedCount);
  let revealedCount = 0;

  for (const chunk of chunks) {
    const count = Math.max(0, Math.min(chunk.capacity, remaining));
    chunk.mesh.count = count;
    chunk.mesh.instanceMatrix.needsUpdate = true;
    remaining -= chunk.capacity;
    revealedCount += count;
  }

  return revealedCount;
}

export function updatePrintChunksColor(chunks: PrintChunk[], printLineColor?: PrintColor): void {
  for (const chunk of chunks) {
    const materials = Array.isArray(chunk.mesh.material) ? chunk.mesh.material : [chunk.mesh.material];
    for (const material of materials) {
      if ("color" in material && material.color instanceof THREE.Color) {
        material.color.set(printLineColor ?? COLOR_FILAMENT_DONE_BASE);
        material.needsUpdate = true;
      }
    }
  }
}

export function createPrinterGhostPath(points: THREE.Vector3[]): THREE.Line {
  const ghost = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: COLOR_GHOST,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  ghost.name = "ghostPath";
  return ghost;
}

export function createPrinterSampleObject(
  parent: THREE.Object3D,
  surface: SurfaceReference,
): PrintedObjectReveal {
  const bed = surface.bedBounds;
  const bedSpan = Math.max(Math.min(bed.size.x, bed.size.z), 1);
  const length = bedSpan * 0.42;
  const width = bedSpan * 0.22;
  const bodyHeight = bedSpan * 0.09;
  const cabinHeight = bedSpan * 0.1;
  const wheelRadius = bedSpan * 0.045;
  const wheelDepth = bedSpan * 0.035;
  const baseY = surface.topSurfaceY + PRINTER_BEAD_Y_OFFSET;
  const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), surface.topSurfaceY - 0.002);

  const makeMaterial = (color: number, roughness = 0.58) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.02,
      clearcoat: 0.18,
      clearcoatRoughness: 0.52,
      clippingPlanes: [clippingPlane],
      clipShadows: true,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: PRINT_POLYGON_OFFSET_FACTOR,
      polygonOffsetUnits: PRINT_POLYGON_OFFSET_UNITS,
      side: THREE.DoubleSide,
    });
  const redMaterial = makeMaterial(PRINTED_OBJECT_COLOR);
  const darkRedMaterial = makeMaterial(0x7a1614, 0.64);
  const headlightMaterial = makeMaterial(0xffd66b, 0.5);

  const group = new THREE.Group();
  group.name = "printerTargetObjectReveal";
  group.visible = false;
  const meshes: THREE.Mesh[] = [];
  const addMesh = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: THREE.Vector3,
    rotation?: THREE.Euler,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.copy(position);
    if (rotation) mesh.rotation.copy(rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
  };

  addMesh(
    "printerTargetCarBody",
    new THREE.BoxGeometry(length, bodyHeight, width),
    redMaterial,
    new THREE.Vector3(bed.center.x, baseY + wheelRadius + bodyHeight * 0.5, bed.center.z),
  );
  addMesh(
    "printerTargetCarCabin",
    new THREE.BoxGeometry(length * 0.38, cabinHeight, width * 0.78),
    redMaterial,
    new THREE.Vector3(bed.center.x + length * 0.05, baseY + wheelRadius + bodyHeight + cabinHeight * 0.5, bed.center.z),
  );

  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelDepth, 32);
  const wheelRotation = new THREE.Euler(Math.PI / 2, 0, 0);
  for (const x of [bed.center.x - length * 0.28, bed.center.x + length * 0.28]) {
    for (const z of [bed.center.z - width * 0.55, bed.center.z + width * 0.55]) {
      addMesh(
        "printerTargetCarWheel",
        wheelGeometry.clone(),
        darkRedMaterial,
        new THREE.Vector3(x, baseY + wheelRadius, z),
        wheelRotation,
      );
    }
  }

  const lightGeometry = new THREE.BoxGeometry(length * 0.035, bodyHeight * 0.32, width * 0.18);
  for (const z of [bed.center.z - width * 0.28, bed.center.z + width * 0.28]) {
    addMesh(
      "printerTargetCarHeadlight",
      lightGeometry.clone(),
      headlightMaterial,
      new THREE.Vector3(bed.center.x + length * 0.52, baseY + wheelRadius + bodyHeight * 0.52, z),
    );
  }
  parent.add(group);

  const minY = baseY;
  const maxY = baseY + wheelRadius * 2 + bodyHeight + cabinHeight;
  return {
    group,
    meshes,
    clippingPlane,
    minY,
    maxY,
  };
}

export function updatePrinterSampleObjectReveal(
  reveal: PrintedObjectReveal | null,
  progress: number,
): void {
  if (!reveal) return;
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  reveal.group.visible = clamped > 0;
  reveal.clippingPlane.constant = THREE.MathUtils.lerp(
    reveal.minY - 0.002,
    reveal.maxY + 0.002,
    clamped,
  );
}
