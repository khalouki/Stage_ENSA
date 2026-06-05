"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { applyModelVisibilityConfig } from "../modelConfigs";
import { MachineInfo } from "../types";

type Props = {
  position: [number, number, number];
  onSelect: (info: MachineInfo | null) => void;
  selected: boolean;
};

const info: MachineInfo = {
  name: "CNC Router",
  type: "Usinage Numérique CNC",
  status: "running",
  specs: {
    Axes: "4",
    "Zone de travail": "600×600 mm",
    Vitesse: "1 750 RPM",
    "Moteur broche": "2.2 kW",
    Précision: "±0.05 mm",
  },
  temperature: 47,
  speed: 1750,
  jobProgress: 38,
  healthScore: 74,
  jobName: "Support_alu_v2.nc",
};

export function CNCRouter({ position, onSelect, selected }: Props) {
  const groupRef  = useRef<THREE.Group>(null);
  const ringRef   = useRef<THREE.Mesh>(null);
  const { scene } = useGLTF("/models/CNC.glb");
  const model     = useMemo(() => {
    const clone = scene.clone(true);
    applyModelVisibilityConfig(clone, "/models/CNC.glb");
    return clone;
  }, [scene]);

  const [uniformScale, setUniformScale] = useState(1);
  const [labelHeight,  setLabelHeight]  = useState(2.5);
  const [modelSize,    setModelSize]    = useState(new THREE.Vector3(1, 2.2, 1));
  const [hovered,      setHovered]      = useState(false);
  const currentScale = useRef(1);

  useEffect(() => {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
        child.geometry?.computeBoundingBox();
        child.geometry?.computeBoundingSphere();
      }
    });

    const box  = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const cen  = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(cen);
    model.position.set(-cen.x, -box.min.y, -cen.z);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale  = maxDim > 0 ? 2.2 / maxDim : 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUniformScale(scale);
    setModelSize(size.clone());
    setLabelHeight(size.y * scale + 0.35);
    currentScale.current = scale;
  }, [model]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = hovered ? uniformScale * 1.07 : uniformScale;
    currentScale.current = THREE.MathUtils.lerp(currentScale.current, target, 0.12);
    groupRef.current.scale.setScalar(currentScale.current);

    if (ringRef.current) {
      ringRef.current.rotation.z -= delta * 0.8; // reverse spin vs printer
      const targetOpacity = selected ? 0.85 : 0;
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.1);
    }
  });

  const boxArgs = useMemo<[number, number, number]>(
    () => [modelSize.x + 0.1, modelSize.y + 0.1, modelSize.z + 0.1],
    [modelSize]
  );

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, Math.PI / 2, 0]}
      onPointerEnter={(e) => { e.stopPropagation(); setHovered(true);  document.body.style.cursor = "pointer"; }}
      onPointerLeave={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
      onClick={(e)        => { e.stopPropagation(); onSelect(info); }}
    >
      <primitive object={model} />

      {/* Invisible hit-box */}
      <mesh position={[0, modelSize.y / 2, 0]} visible={false}>
        <boxGeometry args={boxArgs} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Selection ring */}
      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01 / uniformScale, 0]}
      >
        <ringGeometry args={[1.3, 1.48, 48]} />
        <meshBasicMaterial
          color={selected ? "#3b82f6" : "#60a5fa"}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {hovered && !selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012 / uniformScale, 0]}>
          <ringGeometry args={[1.2, 1.32, 48]} />
          <meshBasicMaterial color="#93c5fd" transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Floating label */}
      <Html position={[0, labelHeight / uniformScale, 0]} center sprite>
        <div style={{
          background: selected ? "#1d4ed8" : hovered ? "#2563eb" : "rgba(30,40,60,0.88)",
          color: "#fff",
          padding: "5px 11px",
          borderRadius: "5px",
          fontSize: "12px",
          fontWeight: 600,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          border: `1px solid ${selected ? "#60a5fa" : "rgba(96,165,250,0.3)"}`,
          boxShadow: selected ? "0 0 14px rgba(59,130,246,0.7)" : "none",
          transition: "all 0.2s",
          letterSpacing: "0.03em",
        }}>
          ⚙️ CNC Router
        </div>
      </Html>
    </group>
  );
}

useGLTF.preload("/models/CNC.glb");
