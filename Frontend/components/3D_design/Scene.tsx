"use client";

import { useCallback, useState } from "react";
import { Html } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";

import { FirstPersonCamera } from "./FirstPersonCamera";
import { FloorGrid } from "./FloorGrid";
import { MachineModel } from "./MachineModel";
import { getModelScaleMultiplier } from "./modelConfigs";
import { OverheadLights } from "./OverheadLights";
import { Room } from "./Room";
import { LabMachine, MachineState, Theme } from "./types";

type SceneProps = {
  machines: LabMachine[];
  statesById?: Record<number, MachineState>;
  selectedMachineId: number | null;
  onSelectMachine: (machine: LabMachine | null) => void;
  theme: Theme;
};

function statusColor(status: LabMachine["status"]): string {
  if (status === "available") return "#22c55e";
  if (status === "busy") return "#f59e0b";
  if (status === "maintenance") return "#f97316";
  return "#ef4444";
}

function statusHint(machine: LabMachine, state?: MachineState) {
  if (state?.error) {
    return {
      label: "Alert",
      detail: state.error,
      color: "#ef4444",
      background: "rgba(127, 29, 29, 0.9)",
      border: "rgba(248, 113, 113, 0.7)",
    };
  }

  if (state && (state.temperature >= 75 || state.vibration >= 2.2)) {
    return {
      label: "Warning",
      detail: `${state.temperature.toFixed(1)} C · ${state.vibration.toFixed(2)} vib`,
      color: "#f59e0b",
      background: "rgba(120, 53, 15, 0.9)",
      border: "rgba(251, 191, 36, 0.7)",
    };
  }

  if (machine.status === "available") {
    return {
      label: "Available",
      detail: state ? `${state.temperature.toFixed(1)} C · ${Math.round(state.motor_speed)} RPM` : "Waiting for MQTT",
      color: "#22c55e",
      background: "rgba(6, 78, 59, 0.88)",
      border: "rgba(52, 211, 153, 0.65)",
    };
  }

  if (machine.status === "busy") {
    return {
      label: "Busy",
      detail: state ? `${state.temperature.toFixed(1)} C · ${Math.round(state.motor_speed)} RPM` : "In use",
      color: "#f59e0b",
      background: "rgba(120, 53, 15, 0.88)",
      border: "rgba(251, 191, 36, 0.65)",
    };
  }

  if (machine.status === "maintenance") {
    return {
      label: "Maintenance",
      detail: "Inspection required",
      color: "#f97316",
      background: "rgba(124, 45, 18, 0.88)",
      border: "rgba(253, 186, 116, 0.65)",
    };
  }

  return {
    label: "Offline",
    detail: "No operation",
    color: "#ef4444",
    background: "rgba(127, 29, 29, 0.88)",
    border: "rgba(248, 113, 113, 0.65)",
  };
}

function targetSizeForMachine(machine: LabMachine): number {
  const code = (machine.machine_type_code ?? "").toUpperCase();
  let baseTargetSize = 0.9;

  if (["3DP", "PRINTER", "FDM", "SLA"].includes(code)) {
    baseTargetSize = 0.55;
  } else if (code === "CNC") {
    baseTargetSize = 1.7;
  } else if (code === "3D_PRINTER") {
    baseTargetSize = 1.3;
  }

  return baseTargetSize * getModelScaleMultiplier(machine.model_path, "lab");
}

function fallbackPosition(machine: LabMachine, index: number): [number, number, number] {
  const code = (machine.machine_type_code ?? "").toUpperCase();
  if (["3DP", "PRINTER", "FDM", "SLA"].includes(code)) return [-2, 0, -4];
  if (code === "CNC") return [-2, 0, 4];

  const extras: [number, number, number][] = [
    [6, 0, -7],
    [6, 0, -2],
    [6, 0, 3],
    [6, 0, 8],
    [11, 0, -6],
    [11, 0, 2],
  ];

  return extras[index % extras.length];
}

function hasExplicitPlacement(machine: LabMachine): boolean {
  return machine.position_x !== 0 || machine.position_y !== 0 || machine.position_z !== 0;
}

function normalizeScale(value: number): number {
  return value === 0 ? 1 : value;
}

function resolvePlacement(machine: LabMachine, index: number) {
  const position = hasExplicitPlacement(machine)
    ? ([machine.position_x, machine.position_y, machine.position_z] as [number, number, number])
    : fallbackPosition(machine, index);

  return {
    position,
    rotation: [machine.rotation_x, machine.rotation_y, machine.rotation_z] as [number, number, number],
    scale: [
      normalizeScale(machine.scale_x),
      normalizeScale(machine.scale_y),
      normalizeScale(machine.scale_z),
    ] as [number, number, number],
  };
}

export function Scene({ machines, statesById = {}, selectedMachineId, onSelectMachine, theme }: SceneProps) {
  const dark = theme === "dark";
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const showDebugHelper = process.env.NEXT_PUBLIC_DEBUG_MACHINE_ROOTS === "true";

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>, id: number) => {
    e.stopPropagation();
    setHoveredId(id);
    document.body.style.cursor = "pointer";
  }, []);

  const handlePointerOut = useCallback(() => {
    setHoveredId(null);
    document.body.style.cursor = "default";
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>, machine: LabMachine) => {
      e.stopPropagation();
      onSelectMachine(machine);
    },
    [onSelectMachine],
  );

  return (
    <>
      <FirstPersonCamera />
      <ambientLight intensity={dark ? 0.35 : 0.9} color={dark ? "#c8d0e0" : "#f0f4ff"} />
      <directionalLight
        position={[-16, 14, 4]}
        intensity={dark ? 0.6 : 1.5}
        color="#EEE8F8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <directionalLight
        position={[12, 6, 8]}
        intensity={dark ? 0.3 : 0.5}
        color={dark ? "#7090c0" : "#d8e8ff"}
      />

      <Room theme={theme} />
      <FloorGrid theme={theme} />
      <OverheadLights theme={theme} />

      {machines.map((machine, index) => {
        const isSelected = selectedMachineId === machine.id;
        const isHovered = hoveredId === machine.id;
        const placement = resolvePlacement(machine, index);
        const targetSize = targetSizeForMachine(machine);
        const ringColor = isSelected ? "#3b82f6" : isHovered ? "#60a5fa" : statusColor(machine.status);
        const ringOpacity = isSelected ? 0.85 : isHovered ? 0.65 : 0.35;
        const state = statesById[machine.id];
        const hint = statusHint(machine, state);

        return (
          <group
            key={machine.id}
            position={placement.position}
            rotation={placement.rotation}
            scale={placement.scale}
            onPointerOver={(e) => handlePointerOver(e, machine.id)}
            onPointerOut={handlePointerOut}
            onClick={(e) => handleClick(e, machine)}
          >
            <MachineModel
              modelPath={machine.model_path}
              autoFit
              targetSize={targetSize}
              hovered={isHovered}
              showDebugHelper={showDebugHelper}
            />

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[0.7, 0.82, 32]} />
              <meshBasicMaterial color={ringColor} transparent opacity={ringOpacity} />
            </mesh>

            <Html position={[0, 2.35, 0]} center sprite>
              <div
                style={{
                  minWidth: 126,
                  maxWidth: 180,
                  padding: "6px 9px",
                  borderRadius: 8,
                  border: `1px solid ${hint.border}`,
                  background: hint.background,
                  color: "#f8fafc",
                  fontSize: 10,
                  lineHeight: 1.15,
                  whiteSpace: "nowrap",
                  boxShadow: isSelected
                    ? "0 0 16px rgba(59,130,246,0.45)"
                    : `0 0 12px ${hint.color}33`,
                  transform: isSelected || isHovered ? "scale(1.06)" : "scale(1)",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      background: hint.color,
                      boxShadow: `0 0 8px ${hint.color}`,
                      flex: "0 0 auto",
                    }}
                  />
                  <span style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {hint.label}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "rgba(226,232,240,0.82)",
                    textAlign: "center",
                  }}
                >
                  {hint.detail}
                </div>
              </div>
            </Html>

            <Html position={[0, 1.82, 0]} center sprite>
              <div
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: isHovered
                    ? "1px solid rgba(96,165,250,0.6)"
                    : "1px solid rgba(255,255,255,0.3)",
                  background: isHovered ? "rgba(15,23,42,0.92)" : "rgba(15,23,42,0.75)",
                  color: isHovered ? "#93c5fd" : "#e2e8f0",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                  boxShadow: isHovered ? "0 0 8px rgba(59,130,246,0.35)" : "none",
                }}
              >
                {machine.name}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
