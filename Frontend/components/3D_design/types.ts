export type Theme = "dark" | "light";

export type MachineInfo = {
  name: string;
  type: string;
  status: "running" | "idle" | "warning" | "offline";
  specs: Record<string, string>;
  temperature: number;
  speed: number;
  jobProgress: number;
  healthScore: number;
  jobName?: string;
};

export type MachineStatus = "available" | "busy" | "offline" | "maintenance";

export type LabMachine = {
  id: number;
  name: string;
  machine_type_id: number;
  machine_type_code: string;
  machine_type_name: string;
  model_path: string;
  status: MachineStatus;
  notes?: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
  scale_x: number;
  scale_y: number;
  scale_z: number;
};

export type MachineState = {
  machine_id: number;
  machine_name: string;
  status: string;
  temperature: number;
  motor_speed: number;
  vibration: number;
  usage_duration: number;
  error?: string | null;
  updated_at: string;
};
