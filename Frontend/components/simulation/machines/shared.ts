import * as THREE from "three";

export type AxisLimit = {
  minWorldDelta: number;
  maxWorldDelta: number;
};

export type LocalAxisDirection = {
  localVector: THREE.Vector3;
  worldVector: THREE.Vector3;
};

export function normalizeNodeName(value: string): string {
  return value.replace(/[.\s_-]+/g, "").toLowerCase();
}

export function findNodeByNameFlexible(root: THREE.Object3D, wantedName: string): THREE.Object3D | null {
  const exact = root.getObjectByName(wantedName);
  if (exact) return exact;

  const normalizedWanted = normalizeNodeName(wantedName);
  let fallback: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (fallback) return;
    if (normalizeNodeName(child.name) === normalizedWanted) {
      fallback = child;
    }
  });

  return fallback;
}

export function getProjectedBounds(box: THREE.Box3, axis: THREE.Vector3): { min: number; max: number } {
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    const projection = corner.dot(axis);
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }

  return { min, max };
}

export function getBoundsFromObjects(objects: THREE.Object3D[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    bounds.union(new THREE.Box3().setFromObject(object));
  }
  return bounds;
}

export function computeTravelLimits(
  movingBoundsSource: THREE.Object3D | THREE.Box3,
  referenceBoundsSource: THREE.Object3D | THREE.Box3,
  axis: THREE.Vector3,
): AxisLimit {
  const normalizedAxis = axis.clone().normalize();
  const movingBox =
    movingBoundsSource instanceof THREE.Box3
      ? movingBoundsSource
      : (movingBoundsSource.updateWorldMatrix(true, true), new THREE.Box3().setFromObject(movingBoundsSource));
  const movingBounds = getProjectedBounds(movingBox, normalizedAxis);
  const referenceBox =
    referenceBoundsSource instanceof THREE.Box3
      ? referenceBoundsSource
      : (referenceBoundsSource.updateWorldMatrix(true, true), new THREE.Box3().setFromObject(referenceBoundsSource));
  const referenceBounds = getProjectedBounds(referenceBox, normalizedAxis);

  return {
    minWorldDelta: referenceBounds.min - movingBounds.min,
    maxWorldDelta: referenceBounds.max - movingBounds.max,
  };
}

export function lerpObjectAxisPosition(
  object: THREE.Object3D,
  axis: "x" | "y" | "z",
  target: number,
  blend: number,
) {
  object.position[axis] = THREE.MathUtils.lerp(object.position[axis], target, blend);
}

export function lerpObjectPosition(
  object: THREE.Object3D,
  target: THREE.Vector3,
  blend: number,
) {
  object.position.lerp(target, blend);
}

export function detectReferenceAxisDirection(
  reference: THREE.Object3D,
  targetParent: THREE.Object3D | null,
): LocalAxisDirection {
  const referenceQuaternion = new THREE.Quaternion();
  reference.getWorldQuaternion(referenceQuaternion);

  let dominantLocalAxis = new THREE.Vector3(1, 0, 0);
  const referenceMesh = reference as THREE.Mesh;
  if (referenceMesh.geometry) {
    if (!referenceMesh.geometry.boundingBox) {
      referenceMesh.geometry.computeBoundingBox();
    }
    const box = referenceMesh.geometry.boundingBox;
    if (box) {
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.y >= size.x && size.y >= size.z) {
        dominantLocalAxis = new THREE.Vector3(0, 1, 0);
      } else if (size.z >= size.x && size.z >= size.y) {
        dominantLocalAxis = new THREE.Vector3(0, 0, 1);
      }
    }
  }

  const worldVector = dominantLocalAxis.clone().applyQuaternion(referenceQuaternion).normalize();
  const parentQuaternion = new THREE.Quaternion();
  (targetParent ?? reference.parent ?? reference).getWorldQuaternion(parentQuaternion);
  const localVector = worldVector.clone().applyQuaternion(parentQuaternion.invert()).normalize();

  return { localVector, worldVector };
}
