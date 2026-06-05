"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Database, ShieldAlert, Wifi, Wrench } from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTranslation } from "@/components/i18n";
import {
  translateAiRecommendation,
  translateAnomalyReason,
  translateAnomalyStatus,
  translateFactorLabel,
  translateRiskLevel,
} from "@/lib/aiTranslations";
import { apiRequest } from "@/lib/api";

type DashboardStats = {
  users: number;
  machines: number;
  reservations: number;
  pendingReservations: number;
};

type MonitoringFactor = {
  key: string;
  label: string;
  score: number;
  weight: number;
  current_value?: number | null;
  unit?: string | null;
  detail: string;
  trend?: string | null;
};

type MonitoringAnomaly = {
  code: string;
  metric: string;
  severity: "low" | "medium" | "high";
  reason: string;
  current_value?: number | null;
  threshold?: number | null;
  unit?: string | null;
};

type MachineAssessment = {
  machine_id: number;
  machine_name: string;
  machine_type?: string | null;
  status: string;
  has_telemetry: boolean;
  anomaly_status: "normal" | "warning" | "critical" | "no_data";
  health_score?: number | null;
  maintenance_risk_score?: number | null;
  maintenance_risk_level: "low" | "medium" | "high" | "unknown";
  failure_probability?: number | null;
  recommendation: string;
  anomaly_count: number;
  anomaly_details: MonitoringAnomaly[];
  factors: MonitoringFactor[];
  telemetry?: {
    temperature: number;
    vibration: number;
    motor_speed: number;
    usage_duration: number;
    error?: string | null;
    updated_at: string;
  } | null;
  recent_error_count: number;
  telemetry_points: number;
  assessed_at: string;
  last_telemetry_at?: string | null;
  maintenance_status?: string | null;
  anomaly_score?: number | null;
};

type FleetAssessment = {
  generated_at: string;
  total_machines: number;
  with_telemetry: number;
  normal_count: number;
  warning_count: number;
  critical_count: number;
  average_health_score?: number | null;
  machines: MachineAssessment[];
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

function statusBadge(status: MachineAssessment["anomaly_status"]) {
  if (status === "critical") return "bg-red-100 text-red-700 border-red-200";
  if (status === "warning") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "normal") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function riskBadge(level: MachineAssessment["maintenance_risk_level"]) {
  if (level === "high") return "bg-red-100 text-red-700";
  if (level === "medium") return "bg-amber-100 text-amber-700";
  if (level === "low") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

function connectionBadge(isOnline: boolean) {
  return isOnline
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
}

function HealthBar({ value, noTelemetryLabel }: { value?: number | null; noTelemetryLabel: string }) {
  const score = value ?? 0;
  const color = score >= 80 ? "bg-emerald-500" : score >= 55 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-full">
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{value == null ? noTelemetryLabel : `${score}/100`}</div>
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overview, setOverview] = useState<FleetAssessment | null>(null);
  const [mqttStatus, setMqttStatus] = useState<MQTTStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!token) return;
      try {
        const [users, machines, reservations, monitoring, mqtt] = await Promise.all([
          apiRequest<{ total: number; items: { id: number }[] }>("/admin/users?page=1&page_size=1", { token }),
          apiRequest<{ id: number }[]>("/machines", { token }),
          apiRequest<{ id: number; status: string }[]>("/admin/reservations", { token }),
          apiRequest<FleetAssessment>("/admin/ai/monitoring/overview", { token }),
          apiRequest<MQTTStatus>("/monitoring/mqtt/status", { token }),
        ]);

        setStats({
          users: users.total,
          machines: machines.length,
          reservations: reservations.length,
          pendingReservations: reservations.filter((item) => item.status === "pending").length,
        });
        setOverview(monitoring);
        setMqttStatus(mqtt);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("dashboardLoadFailed"));
      }
    };

    if (!loading && !user) {
      router.push("/login");
      return;
    }
    if (!loading && user?.role !== "admin") {
      router.push("/");
      return;
    }

    void loadDashboard();
    const timer = setInterval(() => void loadDashboard(), 8000);
    return () => clearInterval(timer);
  }, [loading, router, t, token, user]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const topRiskMachines = overview?.machines
    .filter((machine) => machine.maintenance_risk_score != null)
    .sort((a, b) => (b.maintenance_risk_score ?? 0) - (a.maintenance_risk_score ?? 0))
    .slice(0, 3) ?? [];
  const mqttOnline = Boolean(mqttStatus?.enabled && mqttStatus?.started && mqttStatus?.connected);
  const lastMessageMs = mqttStatus?.last_message_at ? new Date(mqttStatus.last_message_at).getTime() : Number.NaN;
  const dataOnline = Number.isFinite(lastMessageMs) && now - lastMessageMs <= 10_000;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-9 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboardTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("dashboardDescription")}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">MQTT</h2>
                <p className="text-sm text-muted-foreground">
                  {mqttStatus
                    ? `${mqttStatus.broker_host}:${mqttStatus.broker_port}`
                    : t("dashboardCheckingBroker")}
                </p>
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${connectionBadge(mqttOnline)}`}>
              {mqttOnline ? t("commonOnline") : t("commonOffline")}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <p>{t("dashboardTopic")}: {mqttStatus?.topic_pattern ?? "--"}</p>
            <p>{t("dashboardMessages")}: {mqttStatus?.message_count ?? "--"}</p>
            {mqttStatus?.last_error && <p className="col-span-2 text-red-600">{t("dashboardError")}: {mqttStatus.last_error}</p>}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">{t("dashboardData")}</h2>
                <p className="text-sm text-muted-foreground">
                  {dataOnline
                    ? t("dashboardTelemetryArriving")
                    : t("dashboardNoRecentTelemetry")}
                </p>
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${connectionBadge(dataOnline)}`}>
              {dataOnline ? t("commonOnline") : t("commonOffline")}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <p>
              {t("dashboardLastData")}: {mqttStatus?.last_message_at ? new Date(mqttStatus.last_message_at).toLocaleTimeString() : "--"}
            </p>
            <p>{t("dashboardFreshness")}: {dataOnline ? t("dashboardUnder10s") : t("dashboardOlder10s")}</p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">{t("dashboardUsers")}</p>
          <p className="text-3xl font-bold">{stats?.users ?? "-"}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">{t("commonMachines")}</p>
          <p className="text-3xl font-bold">{stats?.machines ?? "-"}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">{t("dashboardPendingReservations")}</p>
          <p className="text-3xl font-bold">{stats?.pendingReservations ?? "-"}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">{t("dashboardAverageMachineHealth")}</p>
          <p className="text-3xl font-bold">
            {overview?.average_health_score != null ? `${Math.round(overview.average_health_score)}%` : "-"}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <h2 className="font-semibold">{t("dashboardAnomalyStatus")}</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">{t("dashboardNormal")}</p>
              <p className="text-2xl font-bold text-emerald-800">{overview?.normal_count ?? "-"}</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs text-amber-700">{t("dashboardWarning")}</p>
              <p className="text-2xl font-bold text-amber-800">{overview?.warning_count ?? "-"}</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-xs text-red-700">{t("dashboardCritical")}</p>
              <p className="text-2xl font-bold text-red-800">{overview?.critical_count ?? "-"}</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">{t("dashboardTelemetryCoverage")}</h2>
          </div>
          <p className="text-3xl font-bold">{overview?.with_telemetry ?? "-"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("dashboardTelemetryCoverageText")}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold">{t("dashboardHighestRisk")}</h2>
          </div>
          <div className="space-y-3">
            {topRiskMachines.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("dashboardNoRisk")}</p>
            )}
            {topRiskMachines.map((machine) => (
              <div key={machine.machine_id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{machine.machine_name}</p>
                  <p className="text-xs text-muted-foreground">{machine.machine_type ?? t("dashboardUnknownType")}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${riskBadge(machine.maintenance_risk_level)}`}>
                  {machine.maintenance_risk_score ?? "-"} {t("dashboardRisk")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{t("dashboardAIMonitoring")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("dashboardAIMonitoringDescription")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboardUpdated")} {overview ? new Date(overview.generated_at).toLocaleTimeString() : "--"}
          </p>
        </div>

        <div className="">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3">{t("commonMachine")}</th>
                <th className="text-left px-4 py-3">{t("dashboardHealth")}</th>
                <th className="text-left px-4 py-3">{t("dashboardAnomaly")}</th>
                <th className="text-left px-4 py-3">{t("dashboardRisk")}</th>
                <th className="text-left px-4 py-3">{t("dashboardTelemetry")}</th>
                <th className="text-left px-4 py-3">{t("dashboardRecommendation")}</th>
              </tr>
            </thead>
            <tbody>
              {overview?.machines.map((machine) => (
                <tr key={machine.machine_id} className="border-t border-border align-top">
                  <td className="px-4 py-4 min-w-48">
                    <p className="font-medium">{machine.machine_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {machine.machine_type ?? t("dashboardUnknownType")} · {machine.status}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {machine.has_telemetry ? `${machine.telemetry_points} points` : t("dashboardWaitingTelemetry")}
                    </p>
                  </td>
                  <td className="px-4 py-4 min-w-40">
                    <HealthBar value={machine.health_score} noTelemetryLabel={t("dashboardNoTelemetry")} />
                  </td>
                  <td className="px-4 py-4 min-w-56">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold capitalize ${statusBadge(machine.anomaly_status)}`}>
                      {translateAnomalyStatus(machine.anomaly_status, t)}
                    </span>
                    <div className="mt-2 space-y-1">
                      {machine.anomaly_details.length === 0 && (
                        <p className="text-xs text-muted-foreground">{t("dashboardNoAnomaly")}</p>
                      )}
                      {machine.anomaly_details.slice(0, 2).map((anomaly) => (
                        <div key={anomaly.code} className="flex gap-2 text-xs">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                          <span>{translateAnomalyReason(anomaly.code, anomaly.reason, t)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 min-w-40">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${riskBadge(machine.maintenance_risk_level)}`}>
                      {translateRiskLevel(machine.maintenance_risk_level, t)}
                    </span>
                    <p className="mt-2 font-semibold">{machine.maintenance_risk_score ?? "-"}/100</p>
                    <p className="text-xs text-muted-foreground">
                      {t("dashboardFailureProbability")} {machine.failure_probability != null ? `${Math.round(machine.failure_probability * 100)}%` : "--"}
                    </p>
                  </td>
                  <td className="px-4 py-4 min-w-44">
                    {!machine.telemetry ? (
                      <p className="text-xs text-muted-foreground">{t("dashboardNoSensorValues")}</p>
                    ) : (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>{t("dashboardTemp")}: {machine.telemetry.temperature.toFixed(1)} C</p>
                        <p>{t("labVibration")}: {machine.telemetry.vibration.toFixed(2)} mm/s</p>
                        <p>{t("dashboardSpeed")}: {Math.round(machine.telemetry.motor_speed)} rpm</p>
                        <p>{t("dashboardUsage")}: {machine.telemetry.usage_duration} min</p>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 min-w-80">
                    <p>{translateAiRecommendation(machine, machine.recommendation, t)}</p>
                    {machine.factors.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {machine.factors
                          .filter((factor) => factor.score > 0)
                          .slice(0, 2)
                          .map((factor) => (
                            <span key={factor.key} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {translateFactorLabel(factor, t)}: {factor.score}
                            </span>
                          ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!overview?.machines.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("dashboardNoMachineData")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppLayout>
      <DashboardContent />
    </AppLayout>
  );
}
