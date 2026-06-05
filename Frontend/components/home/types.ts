import type { LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/lib/translations";

export type Machine = {
  id: number;
  name: string;
  machine_type_name: string;
  status: "available" | "busy" | "offline" | "maintenance";
};

export type MachineState = {
  machine_id: number;
  machine_name: string;
  status: string;
  temperature: number;
  motor_speed: number;
  vibration: number;
  error?: string | null;
  updated_at: string;
};

export type UserList = {
  total: number;
  items: Array<{ id: number; is_active: boolean }>;
};

export type HomeStat = {
  value: string;
  label: string;
  icon: LucideIcon;
};

export type LabOverview = {
  connectedMachines: number;
  activeAlerts: number;
  availableCount: number;
  availability: number;
};

export type HomeFeature = {
  icon: LucideIcon;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  color: string;
  bg: string;
  href: string;
};

export type MachinePreview = {
  id: number;
  machine: string;
  machineStatus: Machine["status"];
  health: number;
  status: "running" | "warning" | "offline";
};
