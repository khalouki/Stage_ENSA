import type { MachineState } from "./types";

export function hasActiveAlert(state: MachineState) {
  return Boolean(state.error) || state.temperature >= 75 || state.vibration >= 2.2;
}

export function healthFromState(state?: MachineState) {
  if (!state) return 0;

  const tempRisk = Math.max(0, state.temperature - 45) * 0.9;
  const vibrationRisk = state.vibration * 13;
  const errorRisk = state.error ? 25 : 0;

  return Math.max(0, Math.min(100, Math.round(100 - tempRisk - vibrationRisk - errorRisk)));
}

export function statusKey(status: string) {
  return `status${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
