import type { TranslationKey } from "@/lib/translations";

type TranslationValues = Record<string, string | number>;
type Translate = (key: TranslationKey, values?: TranslationValues) => string;

type AnomalyStatus = "normal" | "warning" | "critical" | "no_data";
type RiskLevel = "low" | "medium" | "high" | "unknown";
type Severity = "low" | "medium" | "high";

type FactorLike = {
  key: string;
  label?: string;
  score: number;
};

type RecommendationInput = {
  machine_name: string;
  has_telemetry: boolean;
  maintenance_risk_level: RiskLevel;
  maintenance_status?: string | null;
  anomaly_status?: AnomalyStatus;
  factors?: FactorLike[];
};

const anomalyStatusKeys: Record<AnomalyStatus, TranslationKey> = {
  normal: "anomalyNormal",
  warning: "anomalyWarning",
  critical: "anomalyCritical",
  no_data: "anomalyNoData",
};

const riskLevelKeys: Record<RiskLevel, TranslationKey> = {
  low: "riskLow",
  medium: "riskMedium",
  high: "riskHigh",
  unknown: "riskUnknown",
};

const severityKeys: Record<Severity, TranslationKey> = {
  low: "aiSeverityLow",
  medium: "aiSeverityMedium",
  high: "aiSeverityHigh",
};

const anomalyReasonKeys: Record<string, TranslationKey> = {
  temperature_critical: "aiAnomalyTemperatureCritical",
  temperature_drift: "aiAnomalyTemperatureDrift",
  vibration_critical: "aiAnomalyVibrationCritical",
  vibration_drift: "aiAnomalyVibrationDrift",
  status_conflict: "aiAnomalyStatusConflict",
  overspeed: "aiAnomalyOverspeed",
  repeated_errors: "aiAnomalyRepeatedErrors",
  stale_telemetry: "aiAnomalyStaleTelemetry",
};

const metricKeys: Record<string, TranslationKey> = {
  temperature: "aiMetricTemperature",
  vibration: "aiMetricVibration",
  motor_speed: "aiMetricMotorSpeed",
  error: "aiMetricError",
  telemetry: "aiMetricTelemetry",
};

const factorKeys: Record<string, TranslationKey> = {
  temperature: "aiFactorTemperature",
  vibration: "aiFactorVibration",
  runtime: "aiFactorRuntime",
  errors: "aiFactorErrors",
  trend: "aiFactorTrend",
};

export function translateAnomalyStatus(status: AnomalyStatus, t: Translate) {
  return t(anomalyStatusKeys[status]);
}

export function translateRiskLevel(level: RiskLevel, t: Translate) {
  return t(riskLevelKeys[level]);
}

export function translateSeverity(severity: Severity, t: Translate) {
  return t(severityKeys[severity]);
}

export function translateAnomalyReason(code: string, fallback: string, t: Translate) {
  const key = anomalyReasonKeys[code];
  return key ? t(key) : fallback;
}

export function translateMetric(metric: string, t: Translate) {
  const key = metricKeys[metric];
  return key ? t(key) : metric;
}

export function translateFactorLabel(factor: Pick<FactorLike, "key" | "label">, t: Translate) {
  const key = factorKeys[factor.key];
  return key ? t(key) : factor.label ?? factor.key;
}

export function translateAiRecommendation(input: RecommendationInput, fallback: string, t: Translate) {
  if (!input.has_telemetry || input.anomaly_status === "no_data") {
    return t("aiRecommendationNoTelemetry");
  }

  if (input.maintenance_status === "critical") {
    return t("aiRecommendationCritical");
  }
  if (input.maintenance_status === "maintenance_soon") {
    return t("aiRecommendationMaintenanceSoon");
  }
  if (input.maintenance_status === "monitor") {
    return t("aiRecommendationMonitor");
  }
  if (input.maintenance_status === "normal") {
    return t("aiRecommendationHealthy");
  }

  const topFactor = input.factors
    ?.filter((factor) => factor.score > 0)
    .sort((a, b) => b.score - a.score)[0];
  const factor = topFactor ? translateFactorLabel(topFactor, t).toLowerCase() : "";

  if (input.maintenance_risk_level === "high") {
    return factor
      ? t("aiRecommendationHighWithFactor", { machine: input.machine_name, factor })
      : t("aiRecommendationHigh", { machine: input.machine_name });
  }
  if (input.maintenance_risk_level === "medium") {
    return factor
      ? t("aiRecommendationMediumWithFactor", { machine: input.machine_name, factor })
      : t("aiRecommendationMedium", { machine: input.machine_name });
  }
  if (input.maintenance_risk_level === "low") {
    return input.anomaly_status === "normal"
      ? t("aiRecommendationHealthy")
      : t("aiRecommendationLowObserve", { machine: input.machine_name });
  }

  return fallback;
}
