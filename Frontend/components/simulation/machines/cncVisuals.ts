/**
 * cncVisuals.ts
 *
 * CNC workpiece creation plus integration with the dedicated engraving renderer.
 */

import * as THREE from "three";
import type { SimulationMove } from "@/lib/simulation";
import type { SurfaceReference } from "@/components/simulation/alignment";
import {
  createCncEngravingVisual,
  type CncEngravingVisual,
  type EngravingSegment,
  updateCncEngravingVisual,
} from "@/components/simulation/machines/cncEngraving";

const WORKPIECE_EDGE = 0x546e7a;
export type CncWorkpieceVisual = {
  root: THREE.Group;
  workpiece: THREE.Mesh;
  engraving: CncEngravingVisual;
  plateWidth: number;
  plateDepth: number;
  plateHeight: number;
  segments: EngravingSegment[];
  dispose: () => void;
};

function toSurfaceUV(
  worldX: number,
  worldZ: number,
  plateOriginX: number,
  plateOriginZ: number,
  plateWidth: number,
  plateDepth: number,
): THREE.Vector2 {
  return new THREE.Vector2(
    (worldX - plateOriginX) / plateWidth,
    1 - (worldZ - plateOriginZ) / plateDepth,
  );
}

export function renderCncEngraving(
  visual: CncWorkpieceVisual | null,
  completedMoveIndex: number,
  activeMoveIndex?: number,
  activeProgress = 1,
): void {
  if (!visual) return;

  updateCncEngravingVisual(
    visual.engraving,
    visual.segments,
    visual.plateWidth,
    visual.plateDepth,
    visual.plateHeight,
    completedMoveIndex,
    activeMoveIndex,
    activeProgress,
  );
}

export function createCncWorkpieceVisual(
  parentObject: THREE.Object3D,
  moves: SimulationMove[],
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3,
  surface: SurfaceReference,
): CncWorkpieceVisual {
  parentObject.updateWorldMatrix(true, true);

  const workspaceBounds = surface.bedBounds;
  const workspaceCenterWorld = workspaceBounds.center.clone();
  const plateWidth = Math.max(workspaceBounds.size.x, 1e-3);
  const plateDepth = Math.max(workspaceBounds.size.z, 1e-3);
  const plateHeight = THREE.MathUtils.clamp(
    Math.min(plateWidth, plateDepth) * 0.035,
    1.2,
    2.8,
  );

  let sceneRoot: THREE.Object3D = parentObject;
  while (sceneRoot.parent) sceneRoot = sceneRoot.parent;

  const root = new THREE.Group();
  root.name = "cncWorkpieceRoot";
  root.position.set(
    workspaceCenterWorld.x,
    surface.topSurfaceY + plateHeight * 0.5,
    workspaceCenterWorld.z,
  );
  root.quaternion.set(0, 0, 0, 1);
  sceneRoot.add(root);

  const geo = new THREE.BoxGeometry(plateWidth, plateHeight, plateDepth);
  const sideMat = new THREE.MeshStandardMaterial({
    color: 0xd9dde2,
    roughness: 0.42,
    metalness: 0.55,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: 0xe5e8ec,
    roughness: 0.36,
    metalness: 0.5,
  });

  const workpiece = new THREE.Mesh(geo, [
    sideMat.clone(),
    sideMat.clone(),
    topMat,
    sideMat.clone(),
    sideMat.clone(),
    sideMat.clone(),
  ]);
  workpiece.name = "cncWorkpiece";
  workpiece.castShadow = true;
  workpiece.receiveShadow = true;
  root.add(workpiece);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: WORKPIECE_EDGE, transparent: true, opacity: 0.5 }),
  );
  edges.name = "cncWorkpieceEdges";
  root.add(edges);

  const plateOriginX = workspaceBounds.min.x;
  const plateOriginZ = workspaceBounds.min.z;
  const segments: EngravingSegment[] = [];

  for (let i = 1; i < moves.length; i += 1) {
    const move = moves[i];
    if (move.operation !== "cut") continue;

    const prev = moves[i - 1];
    const startWorld = toWorld(prev.x, prev.y, prev.z);
    const endWorld = toWorld(move.x, move.y, move.z);
    const dx = startWorld.x - endWorld.x;
    const dz = startWorld.z - endWorld.z;
    if (dx * dx + dz * dz < 1e-8) continue;

    segments.push({
      start: toSurfaceUV(startWorld.x, startWorld.z, plateOriginX, plateOriginZ, plateWidth, plateDepth),
      end: toSurfaceUV(endWorld.x, endWorld.z, plateOriginX, plateOriginZ, plateWidth, plateDepth),
      moveIndex: i,
    });
  }

  const engraving = createCncEngravingVisual(root, segments, plateWidth, plateDepth, plateHeight);
  topMat.map = engraving.scorchTexture;
  topMat.needsUpdate = true;

  const dispose = () => {
    root.removeFromParent();
    engraving.dispose();
    geo.dispose();
    edges.geometry.dispose();
    (edges.material as THREE.Material).dispose();
    for (const material of workpiece.material as THREE.Material[]) {
      material.dispose();
    }
  };

  const visual: CncWorkpieceVisual = {
    root,
    workpiece,
    engraving,
    plateWidth,
    plateDepth,
    plateHeight,
    segments,
    dispose,
  };

  renderCncEngraving(visual, -1);
  return visual;
}
