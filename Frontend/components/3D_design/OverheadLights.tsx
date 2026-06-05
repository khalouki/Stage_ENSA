"use client";
import { Theme } from "./types";

// Slim LED strip fixtures — minimal geometry, clean look
const FIXTURES: [number, number, number][] = [
  [-5, 9.7, -5], [5, 9.7, -5],
  [-5, 9.7,  0], [5, 9.7,  0],
  [-5, 9.7,  5], [5, 9.7,  5],
];

export function OverheadLights({ theme }: { theme: Theme }) {
  const dark = theme === "dark";
  const housingColor  = dark ? "#3a3c42" : "#d0cec8";
  const diffuserEmit  = dark ? "#c8d8f0" : "#fff8e8";
  const diffuserBase  = dark ? "#8899bb" : "#fffde8";
  const lightColor    = dark ? "#c8dcff" : "#fffbe8";
  const lightIntensity = dark ? 14 : 28;

  return (
    <group>
      {FIXTURES.map((pos, i) => (
        <group key={i} position={pos}>
          {/* Fixture housing */}
          <mesh>
            <boxGeometry args={[0.14, 0.05, 2.6]} />
            <meshStandardMaterial
              color={housingColor}
              roughness={0.35}
              metalness={0.65}
            />
          </mesh>
          {/* Diffuser panel */}
          <mesh position={[0, -0.03, 0]}>
            <boxGeometry args={[0.10, 0.02, 2.4]} />
            <meshStandardMaterial
              color={diffuserBase}
              emissive={diffuserEmit}
              emissiveIntensity={dark ? 0.9 : 1.6}
              roughness={0.05}
            />
          </mesh>
          {/* Point light */}
          <pointLight
            intensity={lightIntensity}
            distance={14}
            color={lightColor}
            decay={2}
            castShadow={false}
          />
        </group>
      ))}
    </group>
  );
}
