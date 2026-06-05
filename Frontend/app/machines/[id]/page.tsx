"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Cpu,
  Gauge,
  Play,
  Radio,
  Wrench,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTranslation } from "@/components/i18n";
import {
  translateAiRecommendation,
  translateAnomalyReason,
  translateAnomalyStatus,
  translateRiskLevel,
  translateSeverity,
} from "@/lib/aiTranslations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/api";

type Machine = {
  id: number;
  name: string;
  machine_type_code: string;
  machine_type_name: string;
  model_path: string;
  status: "available" | "busy" | "offline" | "maintenance";
  notes?: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
};

type MachineState = {
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

type TelemetryRow = {
  id: number;
  machine_id: number;
  timestamp: string;
  temperature: number;
  motor_speed: number;
  vibration: number;
  usage_duration: number;
  error?: string | null;
};

type MachineAssessment = {
  has_telemetry: boolean;
  anomaly_status: "normal" | "warning" | "critical" | "no_data";
  health_score?: number | null;
  maintenance_risk_score?: number | null;
  maintenance_risk_level: "low" | "medium" | "high" | "unknown";
  failure_probability?: number | null;
  recommendation: string;
  anomaly_details: Array<{
    code: string;
    metric: string;
    severity: "low" | "medium" | "high";
    reason: string;
  }>;
  telemetry_points: number;
  model_used?: string | null;
  maintenance_status?: string | null;
  anomaly_score?: number | null;
};

function statusTone(status: Machine["status"] | string) {
  if (status === "available") return "bg-emerald-500";
  if (status === "busy") return "bg-amber-500";
  if (status === "maintenance") return "bg-orange-500";
  return "bg-red-500";
}

function riskClass(level?: string | null) {
  if (level === "high" || level === "critical") return "bg-red-100 text-red-700 border-red-200";
  if (level === "medium" || level === "warning") return "bg-amber-100 text-amber-700 border-amber-200";
  if (level === "low" || level === "normal") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function toSimulationMachine(machine: Machine) {
  return machine.machine_type_code === "CNC" ? "cnc" : "printer3d";
}

function formatTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleTimeString();
}

function MachineDetailPageInner() {
  const router = useRouter();
  const params = useParams();
  const { user, token, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const machineId = Number(params.id);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [state, setState] = useState<MachineState | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryRow[]>([]);
  const [assessment, setAssessment] = useState<MachineAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "admin" || !token) {
      setLoading(false);
      return;
    }
    if (!Number.isFinite(machineId)) {
      setError(t("machineInvalidId"));
      setLoading(false);
      return;
    }

    const loadMachine = async () => {
      try {
        const [machineData, stateData, telemetryData] = await Promise.all([
          apiRequest<Machine>(`/machines/${machineId}`, { token }),
          apiRequest<MachineState>(`/machines/${machineId}/state`),
          apiRequest<TelemetryRow[]>(`/monitoring/telemetry?machine_id=${machineId}&limit=48`),
        ]);

        setMachine(machineData);
        setState(stateData);
        setTelemetry(telemetryData);
        setError(null);

        if (user?.role === "admin" && token) {
          try {
            const aiData = await apiRequest<MachineAssessment>(`/admin/ai/monitoring/machines/${machineId}`, { token });
            setAssessment(aiData);
          } catch {
            setAssessment(null);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("machineLoadFailed"));
      } finally {
        setLoading(false);
      }
    };

    void loadMachine();
    const timer = setInterval(() => void loadMachine(), 6000);
    return () => clearInterval(timer);
  }, [authLoading, machineId, router, t, token, user]);

  const chartData = useMemo(
    () =>
      telemetry
        .slice()
        .reverse()
        .map((row) => ({
          time: formatTime(row.timestamp),
          temperature: Number(row.temperature.toFixed(1)),
          vibration: Number(row.vibration.toFixed(2)),
          speed: Math.round(row.motor_speed),
        })),
    [telemetry],
  );

  const healthScore = assessment?.health_score ?? (state ? Math.max(0, 100 - Math.round(state.vibration * 12)) : null);
  const hasAnomaly = assessment?.anomaly_status === "warning" || assessment?.anomaly_status === "critical" || Boolean(state?.error);

  if (authLoading) return null;
  if (!user) return null;

  if (user?.role !== "admin") {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-2xl place-content-center px-4 py-16 text-center">
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <p className="text-sm font-semibold text-red-600">403</p>
          <h1 className="mt-2 text-2xl font-bold">{t("machinesForbiddenTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("machinesForbiddenDescription")}</p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            {t("machinesBackToDashboard")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-9 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/machines">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t("commonMachines")}
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{machine?.name ?? t("machineDetails")}</h1>
          <p className="text-sm text-muted-foreground">
            {machine ? `${machine.machine_type_name} · ${machine.machine_type_code}` : t("machineLoadingInstance")}
          </p>
        </div>
        {machine && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => router.push(`/reservations?machineId=${machine.id}`)}>
              <CalendarClock className="w-4 h-4" />
              {t("machineReserve")}
            </Button>
            <Button className="gap-2" onClick={() => router.push(`/simulation?machine=${toSimulationMachine(machine)}&machineId=${machine.id}`)}>
              <Play className="w-4 h-4" />
              {t("machineSimulateGcode")}
            </Button>
          </div>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">{t("machineLoadingTelemetry")}</div>}

      {machine && !loading && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t("commonStatus")}</p>
                <span className={`h-2.5 w-2.5 rounded-full ${statusTone(machine.status)}`} />
              </div>
              <p className="mt-2 text-2xl font-bold capitalize">{machine.status}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("machineLastUpdate")} {formatTime(state?.updated_at)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t("labTemp")}</p>
              <p className="mt-2 text-2xl font-bold">{state ? `${state.temperature.toFixed(1)} C` : "--"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("machineLiveSensor")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t("labVibration")}</p>
              <p className="mt-2 text-2xl font-bold">{state ? `${state.vibration.toFixed(2)} mm/s` : "--"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("machineMechanicalStability")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t("labMotorSpeed")}</p>
              <p className="mt-2 text-2xl font-bold">{state ? `${Math.round(state.motor_speed)} RPM` : "--"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("machineCurrentMotion")}</p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{t("machineTelemetryHistory")}</h2>
                  <p className="text-sm text-muted-foreground">{t("machineLatestReadings", { count: telemetry.length })}</p>
                </div>
                <Badge variant="outline" className="gap-1.5">
                  <Radio className="h-3.5 w-3.5" />
                  {telemetry.length > 0 ? t("machineDataReceived") : t("machineWaitingMqtt")}
                </Badge>
              </div>
              <div className="h-72">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="machine_temp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Area type="monotone" dataKey="temperature" stroke="#f97316" fill="url(#machine_temp)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="vibration" stroke="#3b82f6" fill="transparent" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-content-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
                    {t("machineNoTelemetryStored")}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-amber-500" />
                  <h2 className="font-semibold">{t("machineMaintenanceHealth")}</h2>
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <Progress value={healthScore ?? 0} className="h-2 flex-1" />
                  <span className="text-sm font-bold">{healthScore == null ? "--" : `${healthScore}/100`}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${riskClass(assessment?.maintenance_risk_level)}`}>
                    {t("machineRisk")}: {assessment ? translateRiskLevel(assessment.maintenance_risk_level, t) : t("commonUnknown")}
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${riskClass(assessment?.anomaly_status)}`}>
                    {t("dashboardAnomaly")}: {assessment ? translateAnomalyStatus(assessment.anomaly_status, t) : state?.error ? t("dashboardWarning") : t("commonUnknown")}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {assessment ? translateAiRecommendation({
                    machine_name: machine.name,
                    has_telemetry: assessment.has_telemetry,
                    maintenance_risk_level: assessment.maintenance_risk_level,
                    maintenance_status: assessment.maintenance_status,
                    anomaly_status: assessment.anomaly_status,
                  }, assessment.recommendation, t) : t("machineAdminAssessment")}
                </p>
              </div>

              <div className={`rounded-xl border p-5 ${hasAnomaly ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`}>
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${hasAnomaly ? "text-amber-600" : "text-muted-foreground"}`} />
                  <h2 className="font-semibold">{t("machineAnomalyAlerts")}</h2>
                </div>
                {assessment?.anomaly_details?.length ? (
                  <div className="space-y-2">
                    {assessment.anomaly_details.map((item) => (
                      <p key={item.code} className="text-sm">
                        <span className="font-medium capitalize">{translateSeverity(item.severity, t)}</span>:{" "}
                        {translateAnomalyReason(item.code, item.reason, t)}
                      </p>
                    ))}
                  </div>
                ) : state?.error ? (
                  <p className="text-sm">{t("machineReportedError")}: {state.error}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("machineNoCurrentAnomaly")}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <Cpu className="mb-2 h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">{t("machineModel")}</p>
              <p className="font-mono text-xs">{machine.model_path}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <Gauge className="mb-2 h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">{t("machineUsageDuration")}</p>
              <p className="font-semibold">{state ? `${state.usage_duration} min` : "--"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <Activity className="mb-2 h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">{t("machineLabPlacement")}</p>
              <p className="font-mono text-xs">
                X {machine.position_x}, Y {machine.position_y}, Z {machine.position_z}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function MachineDetailPage() {
  return (
    <AppLayout>
      <MachineDetailPageInner />
    </AppLayout>
  );
}
