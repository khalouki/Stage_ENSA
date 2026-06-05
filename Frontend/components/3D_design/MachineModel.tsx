"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { applyModelVisibilityConfig } from "./modelConfigs";

type MachineModelProps = {
  modelPath: string;
  hovered?: boolean;
  autoFit?: boolean;
  targetSize?: number;
  showDebugHelper?: boolean;
};

export function MachineModel({
  modelPath,
  hovered = false,
  autoFit = true,
  targetSize = 1.2,
  showDebugHelper = false,
}: MachineModelProps) {
  const { scene } = useGLTF(modelPath);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    applyModelVisibilityConfig(clone, modelPath);

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((material) => (material as THREE.Material).clone());
        } else {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }
    });
    return clone;
  }, [scene, modelPath]);

  const fitScale = useMemo(() => {
    if (!autoFit) return 1;

    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxAxis = Math.max(size.x, size.y, size.z);

    return maxAxis > 0 ? targetSize / maxAxis : 1;
  }, [autoFit, clonedScene, targetSize]);

  const centeredOffset = useMemo<[number, number, number]>(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = new THREE.Vector3();
    box.getCenter(center);

    return [
      -center.x * fitScale,
      -box.min.y * fitScale,
      -center.z * fitScale,
    ];
  }, [clonedScene, fitScale]);

  useEffect(() => {
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const applyEmissive = (material: THREE.Material) => {
          const standardMaterial = material as THREE.MeshStandardMaterial;
          if (standardMaterial.emissive !== undefined) {
            standardMaterial.emissive.set(hovered ? "#1d4ed8" : "#000000");
            standardMaterial.emissiveIntensity = hovered ? 0.18 : 0;
          }
        };

        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(applyEmissive);
        } else {
          applyEmissive(mesh.material as THREE.Material);
        }
      }
    });
  }, [hovered, clonedScene]);

  return (
    <group>
      {showDebugHelper && (
        <>
          <axesHelper args={[0.8]} />
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshBasicMaterial color="#ef4444" />
          </mesh>
        </>
      )}

      <primitive object={clonedScene} position={centeredOffset} scale={fitScale} />
    </group>
  );
}
