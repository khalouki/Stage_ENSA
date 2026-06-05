"use client";

import { useEffect, useMemo, useState } from "react";

import type { AuthUser } from "@/components/auth/AuthProvider";
import { apiRequest } from "@/lib/api";

import type { LabOverview, Machine, MachinePreview, MachineState, UserList } from "./types";
import { hasActiveAlert, healthFromState } from "./utils";

type UseHomeDataParams = {
  user: AuthUser | null;
  token: string | null;
  isAdmin: boolean;
};

export function useHomeData({ user, token, isAdmin }: UseHomeDataParams) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [states, setStates] = useState<MachineState[]>([]);
  const [activeUsers, setActiveUsers] = useState<number | null>(null);
  const [statsLoaded, setStatsLoaded] = useState(false);

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const [machineRows, stateRows] = await Promise.all([
          apiRequest<Machine[]>("/lab/machines"),
          apiRequest<MachineState[]>("/monitoring/machines/states"),
        ]);
        setMachines(machineRows);
        setStates(stateRows);

        if (isAdmin && token) {
          const users = await apiRequest<UserList>("/admin/users?page=1&page_size=100", { token });
          setActiveUsers(users.items.filter((item) => item.is_active).length);
        } else {
          setActiveUsers(user ? 1 : null);
        }
      } catch {
        setMachines([]);
        setStates([]);
      } finally {
        setStatsLoaded(true);
      }
    };

    void loadHomeData();
    const timer = setInterval(() => void loadHomeData(), 6000);
    return () => clearInterval(timer);
  }, [isAdmin, token, user]);

  const stateByMachineId = useMemo(
    () =>
      states.reduce<Record<number, MachineState>>((acc, state) => {
        acc[state.machine_id] = state;
        return acc;
      }, {}),
    [states],
  );

  const labOverview = useMemo<LabOverview>(() => {
    const connectedMachines = states.filter((state) => {
      const lastMs = new Date(state.updated_at).getTime();
      return Number.isFinite(lastMs) && Date.now() - lastMs <= 30_000;
    }).length;
    const activeAlerts = states.filter(hasActiveAlert).length;
    const availableCount = machines.filter((machine) => machine.status === "available").length;
    const availability = machines.length > 0 ? Math.round((availableCount / machines.length) * 100) : 0;

    return { connectedMachines, activeAlerts, availableCount, availability };
  }, [machines, states]);

  const machinePreview = useMemo<MachinePreview[]>(
    () =>
      machines.slice(0, 3).map((machine) => {
        const state = stateByMachineId[machine.id];
        return {
          id: machine.id,
          machine: machine.name,
          machineStatus: machine.status,
          health: healthFromState(state),
          status: hasActiveAlert(
            state ?? {
              machine_id: machine.id,
              machine_name: machine.name,
              status: machine.status,
              temperature: 0,
              motor_speed: 0,
              vibration: 0,
              updated_at: "",
            },
          )
            ? "warning"
            : machine.status === "offline"
            ? "offline"
            : "running",
        };
      }),
    [machines, stateByMachineId],
  );

  return {
    activeUsers,
    labOverview,
    machinePreview,
    machineCount: machines.length,
    statsLoaded,
  };
}
