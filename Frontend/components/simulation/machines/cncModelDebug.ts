import * as THREE from "three";

export const CNC_MODEL_DEBUG = false;
export const CNC_HEAD_SINE_TEST = false;
export const CNC_HEAD_SINE_AMPLITUDE = 2.4;
export const CNC_HEAD_SINE_SPEED = 2.2;

export type CncObjectInspection = {
  name: string;
  parentName: string | null;
  type: string;
  worldPosition: THREE.Vector3;
  bounds: THREE.Box3;
  size: THREE.Vector3;
};

export function inspectCncObjectByName(
  root: THREE.Object3D,
  objectName: string,
): CncObjectInspection | null {
  const object = root.getObjectByName(objectName);
  if (!object) return null;

  root.updateWorldMatrix(true, true);
  object.updateWorldMatrix(true, true);

  const worldPosition = new THREE.Vector3();
  const size = new THREE.Vector3();
  const bounds = new THREE.Box3().setFromObject(object);
  object.getWorldPosition(worldPosition);
  bounds.getSize(size);

  return {
    name: object.name,
    parentName: object.parent?.name ?? null,
    type: object.type,
    worldPosition,
    bounds,
    size,
  };
}

export function logCncSceneGraph(root: THREE.Object3D): void {
  if (!CNC_MODEL_DEBUG) return;

  root.traverse((object) => {
    console.info("[CNC][SceneGraph]", {
      name: object.name || "(unnamed)",
      type: object.type,
      parentName: object.parent?.name ?? null,
    });
  });
}

export function attachCncDebugHelpers(
  scene: THREE.Scene,
  root: THREE.Object3D,
  candidateNames: readonly string[],
): () => void {
  if (!CNC_MODEL_DEBUG) return () => {};

  const helpers: THREE.Object3D[] = [];
  for (const name of candidateNames) {
    const object = root.getObjectByName(name);
    if (!object) {
      console.warn(`[CNC][Debug] Candidate "${name}" not found`);
      continue;
    }

    const inspection = inspectCncObjectByName(root, name);
    console.info("[CNC][Inspect]", inspection);

    const helper = new THREE.BoxHelper(object, 0x00e5ff);
    helper.name = `cncDebugHelper:${name}`;
    scene.add(helper);
    helpers.push(helper);
  }

  return () => {
    for (const helper of helpers) {
      helper.removeFromParent();
    }
  };
}
