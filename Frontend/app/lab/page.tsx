"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { useRouter } from "next/navigation";

import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import { Scene, WebGLErrorBoundary } from "@/components/3D_design";
import type { LabMachine, MachineState } from "@/components/3D_design";
import { usePageTransition, useTheme } from "@/components/app-shell";
import { useTranslation } from "@/components/i18n";
import { apiRequest } from "@/lib/api";

type MachineById = Record<number, MachineState>;
type BackendConnectionState = "checking" | "connected" | "error";
type SidebarMqttState = {
  label: string;
  tone: "red" | "yellow" | "green";
  helpText: string | null;
};
type MQTTStatus = {
  enabled: boolean;
  started: boolean;
  connected: boolean;
  broker_host: string;
  broker_port: number;
  topic_pattern: string;
  last_error?: string | null;
  last_message_at?: string | null;
  message_count: number;
};

function Sidebar({
  machine,
  state,
  mqttStatus,
  mqttState,
  onSimulate,
  onReserve,
  onDetails,
}: {
  machine: LabMachine;
  state: MachineState | null;
  mqttStatus: MQTTStatus | null;
  mqttState: SidebarMqttState;
  onSimulate: () => void;
  onReserve: () => void;
  onDetails: () => void;
}) {
  const { t } = useTranslation();
  const mqttBadgeClass =
    mqttState.tone === "green"
      ? "text-emerald-500"
      : mqttState.tone === "yellow"
      ? "text-amber-500"
      : "text-rose-500";
  return (
    <aside className="w-full md:w-80 border-l border-border bg-card p-4 space-y-4 overflow-y-auto">
      <div>
        <h2 className="text-lg font-semibold">{machine.name}</h2>
        <p className="text-xs text-muted-foreground">{machine.machine_type_name}</p>
        {machine.notes && <p className="text-sm mt-2 text-muted-foreground">{machine.notes}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">{t("labStatus")}</p>
          <p className="font-medium capitalize">{machine.status}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">{t("labTemp")}</p>
          <p className="font-medium">{state ? `${state.temperature.toFixed(1)} °C` : "--"}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">{t("labVibration")}</p>
          <p className="font-medium">{state ? state.vibration.toFixed(2) : "--"}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">{t("labMotorSpeed")}</p>
          <p className="font-medium">{state ? `${Math.round(state.motor_speed)} RPM` : "--"}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 text-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{t("labMqttConnection")}</p>
          <span className={`text-xs font-medium ${mqttBadgeClass}`}>
            {mqttState.label}
          </span>
        </div>
        {mqttState.helpText && (
          <p className="mt-2 text-xs text-muted-foreground">{mqttState.helpText}</p>
        )}
        {mqttStatus && (
          <div className="mt-2 text-xs text-muted-foreground space-y-1">
            <p>
              {t("labBroker")}: {mqttStatus.broker_host}:{mqttStatus.broker_port}
            </p>
            <p>{t("dashboardTopic")}: {mqttStatus.topic_pattern}</p>
            <p>{t("dashboardMessages")}: {mqttStatus.message_count}</p>
            {mqttStatus.last_message_at && <p>{t("labLastData")}: {new Date(mqttStatus.last_message_at).toLocaleTimeString()}</p>}
            {mqttStatus.last_error && mqttState.tone === "red" && <p className="text-rose-500">{t("dashboardError")}: {mqttStatus.last_error}</p>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <button
          className="w-full rounded-lg border border-border px-4 py-2 font-medium hover:bg-accent transition"
          onClick={onDetails}
        >
          {t("labViewDetails")}
        </button>
        <button
          className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground font-medium hover:opacity-90 transition"
          onClick={onSimulate}
        >
          {t("labOpenSimulation")}
        </button>
        <button
          className="w-full rounded-lg border border-border px-4 py-2 font-medium hover:bg-accent transition"
          onClick={onReserve}
        >
          {t("labReserve")}
        </button>
      </div>
    </aside>
  );
}

export default function Lab3DPage() {
  const router = useRouter();
  const startLoading = usePageTransition();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [backendStatus, setBackendStatus] = useState<BackendConnectionState>("checking");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [machines, setMachines] = useState<LabMachine[]>([]);
  const [statesById, setStatesById] = useState<MachineById>({});
  const [mqttStatus, setMqttStatus] = useState<MQTTStatus | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<number | null>(null);
  const [mqttNow, setMqttNow] = useState(() => Date.now());

  useEffect(() => {
    const checkBackendConnection = async () => {
      setBackendStatus("checking");
      setBackendError(null);
      try {
        await apiRequest<unknown>("/health");
        setBackendStatus("connected");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("labBackendUnknown");
        setBackendStatus("error");
        setBackendError(message);
        setMachines([]);
        setStatesById({});
        setMqttStatus(null);
        setSelectedMachineId(null);
      }
    };

    void checkBackendConnection();
  }, [t]);

  useEffect(() => {
    if (backendStatus !== "connected") return;

    const loadMachines = async () => {
      const rows = await apiRequest<LabMachine[]>("/lab/machines");
      setMachines(rows);
      if (rows.length > 0) {
        setSelectedMachineId((prev) => prev ?? rows[0].id);
      }
    };
    void loadMachines();
  }, [backendStatus]);

  useEffect(() => {
    if (backendStatus !== "connected") return;

    const timer = setInterval(() => {
      setMqttNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [backendStatus]);

  useEffect(() => {
    if (backendStatus !== "connected") return;

    let timer: NodeJS.Timeout | null = null;
    const loadStates = async () => {
      const [states, mqtt] = await Promise.all([
        apiRequest<MachineState[]>("/monitoring/machines/states"),
        apiRequest<MQTTStatus>("/monitoring/mqtt/status"),
      ]);
      const next = states.reduce<MachineById>((acc, item) => {
        acc[item.machine_id] = item;
        return acc;
      }, {});
      setStatesById(next);
      setMqttStatus(mqtt);
    };
    void loadStates();
    timer = setInterval(() => void loadStates(), 5000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [backendStatus]);

  const selectedMachine = useMemo(
    () => machines.find((item) => item.id === selectedMachineId) ?? null,
    [machines, selectedMachineId]
  );

  const selectedState = selectedMachine ? statesById[selectedMachine.id] ?? null : null;
  const toSimulationMachineName = (machine: LabMachine) => {
    if (machine.machine_type_code === "CNC") return "cnc";
    return "printer3d";
  };
  const mqttSidebarState = useMemo<SidebarMqttState>(() => {
    const mqttConnected = Boolean(mqttStatus?.enabled && mqttStatus?.started && mqttStatus?.connected);
    if (!mqttConnected) {
      return {
        label: t("labDisconnected"),
        tone: "red",
        helpText: t("labDisconnectedHelp"),
      };
    }

    if (!mqttStatus?.last_message_at) {
      return {
        label: t("labWaitingData"),
        tone: "yellow",
        helpText: t("labWaitingDataHelp"),
      };
    }

    const lastMessageMs = new Date(mqttStatus.last_message_at).getTime();
    if (!Number.isFinite(lastMessageMs) || mqttNow - lastMessageMs > 10_000) {
      return {
        label: t("labNoRecentData"),
        tone: "yellow",
        helpText: t("labNoRecentDataHelp"),
      };
    }

    return {
      label: t("labLive"),
      tone: "green",
      helpText: t("labLiveHelp"),
    };
  }, [mqttNow, mqttStatus, t]);

  const showLoadingOverlay = backendStatus === "checking";
  const showErrorOverlay = backendStatus === "error";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 p-4 md:p-6 max-w-375 w-full mx-auto bg-background dark:bg-[#1e293b]">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">{t("labTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("labSubtitle")}</p>
        </header>

        <div className="rounded-xl border border-border overflow-hidden flex flex-col md:flex-row h-[75vh] min-h-130">
          <div className="relative flex-1 min-w-0">
            <WebGLErrorBoundary
              fallback={
                <div className="h-full grid place-content-center text-muted-foreground">
                  {t("labWebglUnavailable")}
                </div>
              }
            >
              <Canvas
                shadows
                style={{ pointerEvents: backendStatus === "connected" ? "auto" : "none" }}
                gl={{
                  antialias: true,
                  toneMapping: theme === "dark" ? THREE.ACESFilmicToneMapping : THREE.LinearToneMapping,
                  toneMappingExposure: theme === "dark" ? 1.05 : 1.25,
                }}
              >
                <Scene
                  machines={backendStatus === "connected" ? machines : []}
                  statesById={statesById}
                  selectedMachineId={backendStatus === "connected" ? selectedMachineId : null}
                  onSelectMachine={(machine) => setSelectedMachineId(machine?.id ?? null)}
                  theme={theme}
                />
              </Canvas>
            </WebGLErrorBoundary>

            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-border/70 bg-background/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
              <div className="mb-1 font-semibold text-foreground">{t("labMovement")}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                <span><b className="text-foreground">Z</b> {t("labForward")}</span>
                <span><b className="text-foreground">S</b> {t("labBackward")}</span>
                <span><b className="text-foreground">Q</b> {t("labLeft")}</span>
                <span><b className="text-foreground">D</b> {t("labRight")}</span>
              </div>
            </div>

            {showLoadingOverlay && (
              <div className="absolute inset-0 z-10 grid place-content-center bg-background/85 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <div>
                    <p className="text-sm font-semibold">{t("labCheckingBackend")}</p>
                    <p className="text-xs text-muted-foreground">{t("labUnlockApi")}</p>
                  </div>
                </div>
              </div>
            )}

            {showErrorOverlay && (
              <div className="absolute inset-0 z-10 grid place-content-center bg-background/90 px-6 text-center backdrop-blur-sm">
                <div className="max-w-md rounded-2xl border border-border bg-card/95 px-6 py-5 shadow-lg">
                  <p className="text-lg font-semibold">{t("labBackendFailed")}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("labBackendBlocked")}
                  </p>
                  {backendError && (
                    <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {backendError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {backendStatus === "connected" && selectedMachine && (
            <Sidebar
              machine={selectedMachine}
              state={selectedState}
              mqttStatus={mqttStatus}
              mqttState={mqttSidebarState}
              onSimulate={() => {
                startLoading();
                router.push(
                  `/simulation?machine=${encodeURIComponent(toSimulationMachineName(selectedMachine))}&machineId=${selectedMachine.id}`,
                );
              }}
              onReserve={() => router.push(`/reservations?machineId=${selectedMachine.id}`)}
              onDetails={() => {
                startLoading();
                router.push(`/machines/${selectedMachine.id}`);
              }}
            />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
