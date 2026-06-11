import * as THREE from "three";
import type { SimulationMove } from "@/lib/simulation";
import { detectSurfaceReference, type Bounds3, type SurfaceReference } from "@/components/simulation/alignment";
import {
  CNC_BED_MAX,
  CNC_BED_MIN,
  CNC_BED_LOCAL_MOVEMENT,
  CNC_HEAD_LOCAL_MOVEMENT,
  CNC_MOVING_PARTS,
} from "@/components/simulation/machines/cncConfig";
import {
  CNC_HEAD_SINE_AMPLITUDE,
  CNC_HEAD_SINE_SPEED,
  CNC_HEAD_SINE_TEST,
  CNC_MODEL_DEBUG,
} from "@/components/simulation/machines/cncModelDebug";
import {
  getBoundsFromObjects,
  type AxisLimit,
} from "@/components/simulation/machines/shared";

const CNC_WORKSPACE_NAME = CNC_MOVING_PARTS.workspace;
const CNC_FALLBACK_WORKSPACE_NAME = "CNC_WORKSPACE_FALLBACK";
const CNC_BED_MOTION_GROUP_NAME = "cncBedMotionGroup";
const CNC_WORKSPACE_MICRO_AMPLITUDE = 0.001;
const CNC_WORKSPACE_MICRO_FREQUENCY_HZ = 10;

type PositionedCncPart = {
  key?: string;
  name: string;
  object: THREE.Object3D;
  initialPosition: THREE.Vector3;
  axis: "x" | "y" | "z";
  offsetFrom: number;
  offsetTo: number;
};

type CncWorkspaceMotionState = {
  elapsedSeconds: number;
  offset: number;
};

export type CncKinematics = {
  headParts: PositionedCncPart[];
  bedParts: PositionedCncPart[];
  headRig: THREE.Group | null;
  headDebugHelper: THREE.BoxHelper | null;
  machineRoot: THREE.Object3D;
  bedMotionGroup: THREE.Group | null;
  bedMotionGroupInitialPosition: THREE.Vector3 | null;
  workspaceObject: THREE.Object3D | null;
  headRigInitialPosition: THREE.Vector3 | null;
  headAnchorWorld: THREE.Vector3 | null;
  headReference: THREE.Object3D | null;
  headLimits: AxisLimit;
  headParentScaleY: number;
  motionWorldBounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  bedMotionWorldBounds: {
    minZ: number;
    maxZ: number;
  };
  workspaceMotion: CncWorkspaceMotionState;
};

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

export function computeCncMotionWorldBounds(
  moves: SimulationMove[],
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3,
) {
  const firstMove = moves[0];
  const fallback = firstMove ? toWorld(firstMove.x, firstMove.y, firstMove.z) : new THREE.Vector3();

  if (moves.length === 0) {
    return {
      minX: fallback.x,
      maxX: fallback.x + 1,
      minZ: fallback.y,
      maxZ: fallback.y + 1,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const move of moves) {
    const world = toWorld(move.x, move.y, move.z);
    minX = Math.min(minX, world.x);
    maxX = Math.max(maxX, world.x);
    minZ = Math.min(minZ, world.y);
    maxZ = Math.max(maxZ, world.y);
  }

  if (maxX - minX < 1e-6) maxX = minX + 1;
  if (maxZ - minZ < 1e-6) maxZ = minZ + 1;

  return { minX, maxX, minZ, maxZ };
}

export function computeCncBedMotionWorldBounds(
  moves: SimulationMove[],
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3,
) {
  const firstMove = moves[0];
  const fallback = firstMove ? toWorld(firstMove.x, firstMove.y, firstMove.z) : new THREE.Vector3();

  if (moves.length === 0) {
    return {
      minZ: fallback.z,
      maxZ: fallback.z + 1,
    };
  }

  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const move of moves) {
    const world = toWorld(move.x, move.y, move.z);
    minZ = Math.min(minZ, world.z);
    maxZ = Math.max(maxZ, world.z);
  }

  if (maxZ - minZ < 1e-6) maxZ = minZ + 1;

  return { minZ, maxZ };
}

export function createCncSurfaceReference(model: THREE.Object3D): SurfaceReference | null {
  const workspaceObject = ensureCncWorkspaceObject(model);
  if (!workspaceObject) return null;

  model.updateWorldMatrix(true, true);
  workspaceObject.updateWorldMatrix(true, false);

  const modelBox = new THREE.Box3().setFromObject(model);
  const workspaceBox = new THREE.Box3().setFromObject(workspaceObject);

  return {
    sourceMeshName: workspaceObject.name || CNC_WORKSPACE_NAME,
    topSurfaceY: workspaceBox.max.y,
    modelBounds: boundsFromBox(modelBox),
    bedBounds: boundsFromBox(workspaceBox),
  };
}

function ensureCncWorkspaceObject(model: THREE.Object3D): THREE.Object3D | null {
  const existing = model.getObjectByName(CNC_WORKSPACE_NAME) ?? model.getObjectByName(CNC_FALLBACK_WORKSPACE_NAME);
  if (existing) return existing;

  const fallbackSurface = detectSurfaceReference(model, "cnc");
  if (!fallbackSurface) return null;

  const fallbackGeometry = new THREE.PlaneGeometry(
    Math.max(fallbackSurface.bedBounds.size.x, 2),
    Math.max(fallbackSurface.bedBounds.size.z, 2),
  );
  const fallbackMaterial = new THREE.MeshBasicMaterial({
    color: 0x6aa4b8,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    visible: false,
  });
  const fallbackPlane = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
  fallbackPlane.name = CNC_FALLBACK_WORKSPACE_NAME;
  fallbackPlane.rotation.x = -Math.PI / 2;
  fallbackPlane.position.set(
    fallbackSurface.bedBounds.center.x,
    fallbackSurface.topSurfaceY,
    fallbackSurface.bedBounds.center.z,
  );
  fallbackPlane.userData.isCncWorkspaceFallback = true;
  model.add(fallbackPlane);
  return fallbackPlane;
}

function hasMovingAncestor(object: THREE.Object3D, movingObjects: Set<THREE.Object3D>) {
  let parent = object.parent;
  while (parent) {
    if (movingObjects.has(parent)) return true;
    parent = parent.parent;
  }
  return false;
}

function hasAncestorInSet(object: THREE.Object3D, objects: Set<THREE.Object3D>) {
  let parent = object.parent;
  while (parent) {
    if (objects.has(parent)) return true;
    parent = parent.parent;
  }
  return false;
}

function createCncBedMotionGroup(
  model: THREE.Object3D,
  bedParts: PositionedCncPart[],
  workspaceObject: THREE.Object3D | null,
): { group: THREE.Group | null; initialPosition: THREE.Vector3 | null } {
  const candidates = new Set<THREE.Object3D>();

  for (const part of bedParts) {
    candidates.add(part.object);
  }
  if (workspaceObject) {
    candidates.add(workspaceObject);
  }

  const roots = [...candidates].filter((object) => object !== model && !hasAncestorInSet(object, candidates));
  if (roots.length === 0) {
    return { group: null, initialPosition: null };
  }

  model.updateWorldMatrix(true, true);

  const group = new THREE.Group();
  group.name = CNC_BED_MOTION_GROUP_NAME;
  model.add(group);
  group.updateWorldMatrix(true, false);

  for (const object of roots) {
    group.attach(object);
  }

  group.updateWorldMatrix(true, true);

  return {
    group,
    initialPosition: group.position.clone(),
  };
}

function getNormalizedHeadMovement(kinematics: CncKinematics, toolWorldPos: THREE.Vector3): number {
  const minY = kinematics.motionWorldBounds.minZ;
  const maxY = kinematics.motionWorldBounds.maxZ;
  const span = Math.max(maxY - minY, 1e-6);
  let t = (toolWorldPos.y - minY) / span;

  if (CNC_HEAD_SINE_TEST) {
    t += Math.sin(performance.now() * 0.001 * CNC_HEAD_SINE_SPEED) * CNC_HEAD_SINE_AMPLITUDE;
  }

  return THREE.MathUtils.clamp(t, 0, 1);
}

function updateWorkspaceMotion(
  motion: CncWorkspaceMotionState,
  progress: number,
  dt: number,
  immediate: boolean,
): number {
  if (immediate) {
    motion.elapsedSeconds = 0;
  } else {
    motion.elapsedSeconds += Math.max(dt, 0);
  }

  const bedProgress = THREE.MathUtils.clamp(progress, 0, 1);
  const bedPosition = THREE.MathUtils.lerp(
    CNC_BED_MIN,
    CNC_BED_MAX,
    bedProgress,
  );
  const microOscillation = immediate
    ? 0
    : Math.sin(motion.elapsedSeconds * Math.PI * 2 * CNC_WORKSPACE_MICRO_FREQUENCY_HZ) *
      CNC_WORKSPACE_MICRO_AMPLITUDE;
  motion.offset = bedPosition + microOscillation;
  return motion.offset;
}

export function mapCncMachineToScene(
  alignment: {
    originX: number;
    originZ: number;
    topSurfaceY: number;
    pathScale: number;
    gcodeMinX: number;
    gcodeMinY: number;
    clearance: number;
  },
  gx: number,
  gy: number,
  gz: number,
  zScale: number,
): THREE.Vector3 {
  return new THREE.Vector3(
    alignment.originX + (gx - alignment.gcodeMinX) * alignment.pathScale,
    alignment.topSurfaceY + alignment.clearance + gz * zScale,
    alignment.originZ + (gy - alignment.gcodeMinY) * alignment.pathScale,
  );
}

export function setupCncKinematics(
  model: THREE.Object3D,
  moves: SimulationMove[],
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3,
): CncKinematics | null {
  const workspaceObject = ensureCncWorkspaceObject(model);
  const headParts: PositionedCncPart[] = [];
  const seenHeadObjects = new Set<THREE.Object3D>();
  for (const movement of CNC_HEAD_LOCAL_MOVEMENT) {
    const { name } = movement;
    const object = model.getObjectByName(name);
    if (!object) continue;
    if (seenHeadObjects.has(object)) continue;
    if (hasMovingAncestor(object, seenHeadObjects)) continue;
    seenHeadObjects.add(object);
    headParts.push({
      name,
      object,
      initialPosition: object.position.clone(),
      axis: movement.axis,
      offsetFrom: movement.from,
      offsetTo: movement.to,
    });
  }

  const bedParts: PositionedCncPart[] = [];
  const seenBedObjects = new Set<THREE.Object3D>();
  for (const movement of CNC_BED_LOCAL_MOVEMENT) {
    const { name } = movement;
    const object = model.getObjectByName(name);
    if (!object) continue;
    if (seenBedObjects.has(object)) continue;
    if (hasMovingAncestor(object, seenBedObjects)) continue;
    seenBedObjects.add(object);
    bedParts.push({
      key: movement.key,
      name,
      object,
      initialPosition: object.position.clone(),
      axis: movement.axis,
      offsetFrom: movement.from,
      offsetTo: movement.to,
    });
  }

  const headReference = model.getObjectByName("Torus");
  const bedMotion = createCncBedMotionGroup(model, bedParts, workspaceObject);

  if (!workspaceObject && headParts.length === 0 && bedParts.length === 0) {
    return null;
  }

  const headScale = new THREE.Vector3();
  (headParts[0]?.object ?? model).getWorldScale(headScale);

  const headLimits = { minWorldDelta: 0, maxWorldDelta: 1 };

  let headRig: THREE.Group | null = null;
  let headDebugHelper: THREE.BoxHelper | null = null;
  let headRigInitialPosition: THREE.Vector3 | null = null;
  let headAnchorWorld: THREE.Vector3 | null = null;
  if (headParts.length > 0) {
    model.updateWorldMatrix(true, true);
    const headBounds = getBoundsFromObjects(headParts.map((part) => part.object));
    const emitterWorld = new THREE.Vector3(
      (headBounds.min.x + headBounds.max.x) * 0.5,
      headBounds.min.y,
      (headBounds.min.z + headBounds.max.z) * 0.5,
    );

    headRig = new THREE.Group();
    headRig.name = "cncLaserHeadRig";
    headRig.position.copy(model.worldToLocal(emitterWorld.clone()));
    headRigInitialPosition = headRig.position.clone();
    headAnchorWorld = emitterWorld.clone();
    model.add(headRig);

    if (CNC_MODEL_DEBUG) {
      headDebugHelper = new THREE.BoxHelper(headParts[0].object, 0xff5aa5);
      headDebugHelper.name = "cncHeadGroupDebugHelper";
      model.parent?.add(headDebugHelper);
    }
  }

  return {
    headParts,
    bedParts,
    headRig,
    headDebugHelper,
    machineRoot: model,
    bedMotionGroup: bedMotion.group,
    bedMotionGroupInitialPosition: bedMotion.initialPosition,
    workspaceObject,
    headRigInitialPosition,
    headAnchorWorld,
    headReference: headReference ?? null,
    headLimits,
    headParentScaleY: headScale.y || 1,
    motionWorldBounds: computeCncMotionWorldBounds(moves, toWorld),
    bedMotionWorldBounds: computeCncBedMotionWorldBounds(moves, toWorld),
    workspaceMotion: {
      elapsedSeconds: 0,
      offset: 0,
    },
  };
}

export function syncCncMechanics(
  kinematics: CncKinematics | null,
  toolWorldPos: THREE.Vector3,
  dt: number,
  immediate = false,
  progress = 0,
) {
  if (!kinematics) return;

  const t = getNormalizedHeadMovement(kinematics, toolWorldPos);
  const workspaceOffset = updateWorkspaceMotion(kinematics.workspaceMotion, progress, dt, immediate);

  for (const part of kinematics.headParts) {
    const offset = THREE.MathUtils.lerp(part.offsetFrom, part.offsetTo, t);
    part.object.position.copy(part.initialPosition);
    part.object.position[part.axis] = part.initialPosition[part.axis] + offset;
  }

  if (kinematics.bedMotionGroup && kinematics.bedMotionGroupInitialPosition) {
    kinematics.bedMotionGroup.position.copy(kinematics.bedMotionGroupInitialPosition);
    kinematics.bedMotionGroup.position.x = kinematics.bedMotionGroupInitialPosition.x + workspaceOffset;
  } else {
    for (const part of kinematics.bedParts) {
      part.object.position.copy(part.initialPosition);
      part.object.position.x = part.initialPosition.x + workspaceOffset;
    }
  }

  if (
    kinematics.headRig?.parent &&
    kinematics.headRigInitialPosition &&
    kinematics.headReference
  ) {
    kinematics.headReference.updateWorldMatrix(true, false);
    const emitterWorld = new THREE.Vector3();
    kinematics.headReference.getWorldPosition(emitterWorld);
    kinematics.headRig.position.copy(kinematics.headRig.parent.worldToLocal(emitterWorld));
  }

  kinematics.headDebugHelper?.update();
}

export function getCncHeadEmitterWorldPosition(kinematics: CncKinematics | null): THREE.Vector3 | null {
  if (!kinematics?.headReference) return null;

  const emitter = new THREE.Vector3();
  kinematics.headReference.updateWorldMatrix(true, false);
  kinematics.headReference.getWorldPosition(emitter);
  return emitter;
}
