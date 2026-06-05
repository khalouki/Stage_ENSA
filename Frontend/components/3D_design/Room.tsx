"use client";
import * as THREE from "three";
import { Theme } from "./types";
import { WallBranding } from "./WallBranding";

export function Room({ theme }: { theme: Theme }) {
  const dark = theme === "dark";

  // ── Palette: clean industrial engineering lab ─────────────────
  const floorColor   = dark ? "#AEBDDB" : "#d4d0c8";  // polished concrete
  const floorRough   = dark ? 0.55 : 0.6;
  const floorMetal   = dark ? 0.08 : 0.04;
  const wallColor    = dark ? "#ececea" : "#ececea";   // off-white / charcoal
  const ceilingColor = dark ? "#EAEBEF87" : "#e8e8e6";
  const trimColor    = dark ? "#2a2d34" : "#b0aca0";
  const tileGrout    = dark ? "#2e3138" : "#c0bcb4";

  // Window appearance
  const windowSky    = dark ? "#5A606599" : "#ccdeed";
  const windowGlass  = dark ? "#2a3d50" : "#a8cce0";
  const windowFrame  = dark ? "#3a3f4a" : "#8a9aaa";

  const windowZ: number[] = [-7, 0, 7];

  return (
    <group>
      {/* ── FLOOR ─────────────────────────────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 24]} />
        <meshStandardMaterial
          color={floorColor}
          roughness={floorRough}
          metalness={floorMetal}
        />
      </mesh>

      {/* Subtle tile joints — every 2 m */}
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh
          key={`gx-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-13 + i * 2, 0.003, 0]}
        >
          <planeGeometry args={[0.03, 24]} />
          <meshStandardMaterial color={tileGrout} roughness={1} />
        </mesh>
      ))}
      {Array.from({ length: 11 }).map((_, i) => (
        <mesh
          key={`gz-${i}`}
          rotation={[-Math.PI / 2, Math.PI / 2, 0]}
          position={[0, 0.003, -10 + i * 2]}
        >
          <planeGeometry args={[0.03, 30]} />
          <meshStandardMaterial color={tileGrout} roughness={1} />
        </mesh>
      ))}

      {/* ── BACK WALL ─────────────────────────────────────────────── */}
      <mesh position={[0, 5, -12]} receiveShadow>
        <planeGeometry args={[30, 10]} />
        <meshStandardMaterial color={wallColor} roughness={0.92} />
      </mesh>

      {/* Subtle wainscot panel on back wall */}
      <mesh position={[0, 0.75, -11.96]}>
        <boxGeometry args={[30, 1.5, 0.04]} />
        <meshStandardMaterial color={dark ? "#B6B5AFB3" : "#d8d4cc"} roughness={0.95} />
      </mesh>

      <WallBranding dark={dark} />

      {/* ── LEFT WALL ─────────────────────────────────────────────── */}
      <mesh position={[-15, 5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[24, 10]} />
        <meshStandardMaterial color={wallColor} roughness={0.92} />
      </mesh>

      {/* ── RIGHT WALL (closed) ───────────────────────────────────── */}
      <mesh position={[15, 5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[24, 10]} />
        <meshStandardMaterial color={wallColor} roughness={0.92} />
      </mesh>

      {/* ── FRONT WALL ────────────────────────────────────────────── */}
      <mesh position={[0, 5, 12]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[30, 10]} />
        <meshStandardMaterial color={wallColor} roughness={0.92} />
      </mesh>

      {/* ── WINDOWS ───────────────────────────────────────────────── */}
      {windowZ.map((z, i) => (
        <group key={`win-${i}`} position={[-14.97, 5.2, z]}>
          {/* Sky fill */}
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[3.0, 2.6]} />
            <meshStandardMaterial
              color={windowSky}
              emissive={windowSky}
              emissiveIntensity={dark ? 0.25 : 0.55}
            />
          </mesh>

          {/* Glass */}
          <mesh position={[0.015, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[2.8, 2.4]} />
            <meshStandardMaterial
              color={windowGlass}
              transparent
              opacity={dark ? 0.22 : 0.15}
              roughness={0.02}
              metalness={0.1}
              depthWrite={false}
            />
          </mesh>

          {/* Frame — four members */}
          {[ 
            { p: [0,    1.3, 0], s: [3.2, 0.08, 0.1] },
            { p: [0,   -1.3, 0], s: [3.2, 0.08, 0.1] },
            { p: [1.55, 0,   0], s: [0.08, 2.6, 0.1] },
            { p: [-1.55,0,   0], s: [0.08, 2.6, 0.1] },
            // Centre mullion
            { p: [0,    0,   0], s: [0.06, 2.6, 0.1] },
          ].map((b, j) => (
            <mesh key={j} position={b.p as [number, number, number]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={b.s as [number, number, number]} />
              <meshStandardMaterial
                color={windowFrame}
                roughness={0.25}
                metalness={0.7}
              />
            </mesh>
          ))}

          {/* Very soft light shaft */}
          {!dark && (
            <mesh position={[3.5, -1.2, 0]} rotation={[0, 0, Math.PI / 6]}>
              <cylinderGeometry args={[0.01, 1.2, 7, 6, 1, true]} />
              <meshStandardMaterial
                color="#fff8e8"
                transparent
                opacity={0.022}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* ── CEILING ───────────────────────────────────────────────── */}
      <mesh position={[0, 10, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 24]} />
        <meshStandardMaterial color={ceilingColor} roughness={0.98} />
      </mesh>

      {/* Ceiling edge trim / cornice */}
      {[ 
        { pos: [0,  9.95, -12],  rot: [0, 0, 0],           w: 30 },
        { pos: [0,  9.95,  12],  rot: [0, Math.PI, 0],     w: 30 },
        { pos: [-15,9.95,  0],   rot: [0, Math.PI / 2, 0], w: 24 },
        { pos: [ 15,9.95,  0],   rot: [0,-Math.PI / 2, 0], w: 24 },
      ].map((c, i) => (
        <mesh key={`cor-${i}`} position={c.pos as [number, number, number]} rotation={c.rot as [number, number, number]}>
          <boxGeometry args={[c.w, 0.12, 0.18]} />
          <meshStandardMaterial color={trimColor} roughness={0.9} />
        </mesh>
      ))}

      {/* ── SKIRTING ──────────────────────────────────────────────── */}
      {[ 
        { pos: [0, 0.06, -11.96], rot: [0, 0, 0],           w: 30 },
        { pos: [0, 0.06,  11.96], rot: [0, Math.PI, 0],     w: 30 },
        { pos: [-14.96,0.06, 0],  rot: [0, Math.PI / 2, 0], w: 24 },
        { pos: [ 14.96,0.06, 0],  rot: [0,-Math.PI / 2, 0], w: 24 },
      ].map((s, i) => (
        <mesh key={`sk-${i}`} position={s.pos as [number, number, number]} rotation={s.rot as [number, number, number]}>
          <boxGeometry args={[s.w, 0.12, 0.06]} />
          <meshStandardMaterial color={trimColor} roughness={0.85} />
        </mesh>
      ))}

      {/* ── FLOOR SAFETY STRIPS around machine zones ──────────────── */}
      {[ 
        // Printer area
        { pos: [-2, 0.004, -5.8], w: 5, d: 0.06 },
        { pos: [-2, 0.004, -2.2], w: 5, d: 0.06 },
        { pos: [-4.4, 0.004, -4], w: 0.06, d: 3.7 },
        { pos: [ 0.4, 0.004, -4], w: 0.06, d: 3.7 },
        // CNC area
        { pos: [-2, 0.004, 2.2],  w: 5, d: 0.06 },
        { pos: [-2, 0.004, 5.8],  w: 5, d: 0.06 },
        { pos: [-4.4, 0.004, 4],  w: 0.06, d: 3.7 },
        { pos: [ 0.4, 0.004, 4],  w: 0.06, d: 3.7 },
      ].map((stripe, i) => (
        <mesh key={`sf-${i}`} position={stripe.pos as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[stripe.w, stripe.d]} />
          <meshStandardMaterial
            color={dark ? "#c8a020" : "#d4aa22"}
            roughness={0.8}
          />
        </mesh>
      ))}
      
      {/* ── INDUSTRIAL ENTRANCE DOOR (on Right Wall) ────────────────── */}
      <group position={[14.94, 0, -5]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Door Frame */}
        <mesh position={[0, 1.25, 0]}>
          <boxGeometry args={[2.2, 2.5, 0.15]} />
          <meshStandardMaterial color={dark ? "#E6DEDE" : "#D3983A"} metalness={0.8} roughness={0.2} />
        </mesh>

        {/* The Actual Door Leaf */}
        <group position={[0, 1.25, 0.02]}>
          <mesh>
            <boxGeometry args={[2.0, 2.4, 0.08]} />
            <meshStandardMaterial 
              color={dark ? "#2a2d34" : "#7a8a9a"} 
              metalness={0.4} 
              roughness={0.3} 
            />
          </mesh>

          {/* Viewing Glass Window */}
          <mesh position={[0, 0.4, 0.05]}>
            <boxGeometry args={[0.4, 0.6, 0.02]} />
            <meshStandardMaterial 
              color={windowGlass} 
              transparent 
              opacity={0.6} 
              emissive={windowGlass}
              emissiveIntensity={dark ? 0.1 : 0}
            />
          </mesh>

          {/* Door Handle (Horizontal Bar) */}
          <mesh position={[0.8, -0.1, 0.08]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.3, 12]} />
            <meshStandardMaterial color="#c0c0c0" metalness={1} roughness={0.1} />
          </mesh>
          
          {/* Handle Base Plate */}
          <mesh position={[0.8, -0.1, 0.05]}>
            <boxGeometry args={[0.1, 0.4, 0.02]} />
            <meshStandardMaterial color="#808080" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* "LAB ACCESS" Sign above door */}
        <mesh position={[0, 2.7, 0.01]}>
          <planeGeometry args={[1.2, 0.3]} />
          <meshStandardMaterial color={dark ? "#1e293b" : "#e2e8f0"} />
          {/* Note: You could add a Text component here later for "ENTRANCE" */}
        </mesh>
      </group>
      
    </group>
  );
}
