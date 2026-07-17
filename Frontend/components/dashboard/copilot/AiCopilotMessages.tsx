"use client";

import type { RefObject } from "react";
import { Bot, UserRound } from "lucide-react";

import { useTranslation } from "@/components/i18n/useTranslation";
import type { TranslationKey } from "@/lib/translations";

import type { ChatMessage, CopilotDataPoint, CopilotResponse } from "./types";

type AiCopilotMessagesProps = {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  bottomRef: RefObject<HTMLDivElement | null>;
};

function severityClass(severity: CopilotResponse["severity"]) {
  if (severity === "critical") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
}

function DataPointCards({ points }: { points: CopilotDataPoint[] }) {
  if (points.length === 0) return null;

  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {points.map((point) => (
        <div key={`${point.label}-${point.unit ?? ""}`} className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-xs text-muted-foreground">{point.label}</p>
          <p className="text-sm font-semibold">
            {point.value ?? "--"} {point.unit ?? ""}
          </p>
        </div>
      ))}
    </div>
  );
}

const intentLabels: Record<CopilotResponse["intent"], TranslationKey> = {
  fablab_summary: "copilotIntentFablabSummary",
  machine_status: "copilotIntentMachineStatus",
  explain_machine_health: "copilotIntentExplainMachineHealth",
  highest_risk_machine: "copilotIntentHighestRiskMachine",
  compare_machines: "copilotIntentCompareMachines",
  recent_anomalies: "copilotIntentRecentAnomalies",
  maintenance_recommendation: "copilotIntentMaintenanceRecommendation",
  reservation_summary: "copilotIntentReservationSummary",
  help: "copilotIntentHelp",
  unknown: "copilotIntentUnknown",
};

function AssistantMessage({ message }: { message: Extract<ChatMessage, { role: "assistant" }> }) {
  const { t } = useTranslation();
  const { response } = message;

  return (
    <div className="flex items-start gap-2">
      <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10">
        <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-border bg-muted/25 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${severityClass(response.severity)}`}>
            {t(intentLabels[response.intent])}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(response.generated_at).toLocaleTimeString()}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("copilotConfidence", { value: Math.round(response.confidence * 100) })}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6">{response.answer}</p>
        <DataPointCards points={response.data_points} />
        {response.recommendations.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{t("copilotRecommendationsTitle")}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {response.recommendations.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiCopilotMessages({ messages, loading, error, bottomRef }: AiCopilotMessagesProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="space-y-4">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
            {t("copilotWelcome")}
          </div>
        )}

        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex items-start justify-end gap-2">
              <div className="max-w-[82%] rounded-xl rounded-tr-sm bg-primary px-3 py-2.5 text-sm leading-6 text-primary-foreground">
                {message.content}
              </div>
              <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted">
                <UserRound className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
          ) : (
            <AssistantMessage key={message.id} message={message} />
          ),
        )}

        {loading && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10">
              <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="rounded-xl rounded-tl-sm border border-border bg-muted/25 px-3 py-2.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                {t("copilotAnalyzing")}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
