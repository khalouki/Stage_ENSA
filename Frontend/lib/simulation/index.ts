export {
  deriveLayerInfo,
  estimateTotalSeconds,
  hasInvalidMoveData,
  type MachineId,
  type MachineModule,
  type MachineSimulation,
  type MotionCommand,
  type SimulationError,
  type SimulationMove,
  type ValidationResult,
} from "@/lib/simulation/core";

import { cncMachine } from "@/lib/simulation/machines/cnc";
import { printer3dMachine } from "@/lib/simulation/machines/printer3d";
import type { MachineId, MachineModule } from "@/lib/simulation/core";

export const simulationMachineMap: Record<MachineId, MachineModule> = {
  printer3d: printer3dMachine,
  cnc: cncMachine,
};

const MACHINE_QUERY_ALIASES: Record<string, MachineId> = {
  printer3d: "printer3d",
  printer: "printer3d",
  "imprimante 3d fdm": "printer3d",
  cnc: "cnc",
  "cnc router": "cnc",
};

export function resolveMachineId(value: string | null | undefined): MachineId {
  if (!value) return "printer3d";
  return MACHINE_QUERY_ALIASES[value.trim().toLowerCase()] ?? "printer3d";
}
