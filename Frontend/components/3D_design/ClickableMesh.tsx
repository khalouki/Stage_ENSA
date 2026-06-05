"use client";
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { MachineInfo } from "./types";

type ClickableMeshProps = {
  info: MachineInfo;
  onSelect: (info: MachineInfo) => void;
  selected: boolean;
  children: React.ReactNode;
  position: [number, number, number];
};

export function ClickableMesh({ info, onSelect, selected, children, position }: ClickableMeshProps) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      const target = selected ? 1.04 : hovered ? 1.02 : 1;
      groupRef.current.scale.lerp(new THREE.Vector3(target, target, target), delta * 8);
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
      onClick={(e) => { e.stopPropagation(); onSelect(info); }}
    >
      {children}
      {(hovered || selected) && (
        <Html distanceFactor={8} style={{ pointerEvents: "none" }}>
          <div style={{
            background: selected ? "rgba(0,160,220,0.97)" : "rgba(15,25,45,0.93)",
            border: `1px solid ${selected ? "#00b0e8" : "#2a3a5a"}`,
            borderRadius: "6px", padding: "5px 10px", color: "#e8f4ff",
            fontSize: "11px", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
            fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
            transform: "translateX(-50%)", letterSpacing: "0.02em",
          }}>
            {info.name}
          </div>
        </Html>
      )}
    </group>
  );
}
