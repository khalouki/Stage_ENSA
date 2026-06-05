"use client";
import { useRef } from "react";
import { Play, Pause, RotateCcw, Upload, Activity, Zap, Cpu, Gauge } from "lucide-react";
import { useTranslation } from "@/components/i18n";

export type CNCPanelProps = {
  dark: boolean;
  onFileLoad: (text: string, name: string) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  isPlaying: boolean;
  isPaused: boolean;
  hasGCode: boolean;
  fileName: string | null;
  position: { x: string; y: string; z: string };
  progress: number;
  moveCount: number;
  currentMoveIndex: number;
  speed: number;
  onSpeedChange: (v: number) => void;
  canStartSimulation: boolean;
  gcodeErrors: { line: number; message: string }[];
  simulationError: string | null;
  spindleRPM: number;
  spindleActive: boolean;
  liveTelemetry?: {
    sourceLabel: string;
    temperature: number;
    vibration: number;
    usageDuration: number;
    updatedAt: string;
    error?: string | null;
  } | null;
  estimatedPathLengthMm?: number;
  estimatedDurationSec?: number;
};

function SL({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold tracking-[0.12em] uppercase text-muted-foreground/55 mb-1.5">
      {children}
    </p>
  );
}

function Bar({ value, max = 100, colorClass = "bg-primary" }: { value: number; max?: number; colorClass?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CNCPanel({
  onFileLoad, onStart, onPause, onReset,
  isPlaying, isPaused, hasGCode, fileName,
  position, progress, moveCount, currentMoveIndex,
  speed, onSpeedChange,
  canStartSimulation, gcodeErrors, simulationError,
  spindleRPM, spindleActive, liveTelemetry,
  estimatedPathLengthMm, estimatedDurationSec,
}: CNCPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const progressPct = Math.round(progress * 100);
  const speedOptions = [
    { label: t("panelSlow"), value: 0.5 },
    { label: t("panelNormal"), value: 1 },
    { label: t("panelFast"), value: 3 },
    { label: t("panelVeryFast"), value: 8 },
  ];
  const speedLabel = Number.isInteger(speed) ? speed.toFixed(0) : speed.toFixed(1);
  const pathLengthLabel =
    typeof estimatedPathLengthMm === "number"
      ? estimatedPathLengthMm >= 1000
        ? `${(estimatedPathLengthMm / 1000).toFixed(2)} m`
        : `${estimatedPathLengthMm.toFixed(0)} mm`
      : "--";
  const durationLabel =
    typeof estimatedDurationSec === "number"
      ? estimatedDurationSec >= 60
        ? `${Math.floor(estimatedDurationSec / 60)}m ${Math.round(estimatedDurationSec % 60)}s`
        : `${Math.max(1, Math.round(estimatedDurationSec))}s`
      : "--";

  const statusColor =
    isPlaying ? "text-emerald-500" :
    isPaused  ? "text-amber-500"   :
    hasGCode  ? "text-primary"     : "text-muted-foreground";

  const statusLabel =
    isPlaying ? t("simulationInProgress") :
    isPaused  ? t("simulationPaused")     :
    hasGCode  ? t("simulationReady")      : t("labWaitingData");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onFileLoad(ev.target?.result as string, file.name);
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-card">

      {/* Machine badge */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-base shrink-0">
            <Cpu className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold">CNC Router 4-Axes</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Simulation · {t("panelToolpath")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <span className="relative flex w-2 h-2">
            {isPlaying && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full w-2 h-2 ${
              isPlaying ? "bg-emerald-500" : isPaused ? "bg-amber-400" : hasGCode ? "bg-primary" : "bg-muted-foreground/30"
            }`} />
          </span>
          <span className={`text-[11px] font-semibold tracking-widest uppercase ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* File */}
      <div className="px-5 py-4 border-b border-border">
        <SL>{t("panelFileNc")}</SL>
        {fileName ? (
          <div className="bg-muted/40 rounded-lg px-3 py-2 border border-border/60 mb-2.5">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-mono truncate text-primary">{fileName}</span>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">{moveCount.toLocaleString()} {t("simulationMoves")}</p>
          </div>
        ) : (
          <div className="bg-muted/20 rounded-lg px-3 py-3 border border-dashed border-border mb-2.5 text-center">
            <p className="text-xs text-muted-foreground">{t("panelNoFile")}</p>
          </div>
        )}
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          {t("panelLoadFile")}
        </button>
        <input ref={fileRef} type="file" accept=".gcode,.nc,.txt" className="hidden" onChange={handleFile} />
      </div>

      {/* Controls */}
      <div className="px-5 py-4 border-b border-border">
        <SL>{t("panelControls")}</SL>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button
            onClick={onStart}
            disabled={!canStartSimulation || (isPlaying && !isPaused)}
            className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
              !canStartSimulation || (isPlaying && !isPaused)
                ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            <Play className="w-4 h-4" />
            {isPaused ? t("panelResume") : t("panelStart")}
          </button>
          <button
            onClick={onPause}
            disabled={!isPlaying || isPaused}
            className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
              !isPlaying || isPaused
                ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                : "bg-amber-500 hover:bg-amber-400 text-white"
            }`}
          >
            <Pause className="w-4 h-4" />
            {t("panelPause")}
          </button>
          <button
            onClick={onReset}
            disabled={!hasGCode}
            className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
              !hasGCode
                ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                : "bg-muted hover:bg-accent text-foreground"
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            {t("panelReset")}
          </button>
        </div>

        {(simulationError || gcodeErrors.length > 0) && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-500 leading-relaxed">
            {simulationError && <p>{simulationError}</p>}
            {gcodeErrors.slice(0, 3).map((err, idx) => (
              <p key={`${err.line}-${idx}`}>
                {t("simulationLine")} {err.line > 0 ? err.line : "-"}: {err.message}
              </p>
            ))}
            {gcodeErrors.length > 3 && <p>+{gcodeErrors.length - 3} {t("panelOtherErrors")}</p>}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Gauge className="h-3 w-3" />
              {t("panelSpeed")}
            </span>
            <span className="text-[11px] font-bold font-mono text-primary">{speedLabel}×</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {speedOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSpeedChange(option.value)}
                className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                  speed === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hasGCode && (
        <div className="px-5 py-4 border-b border-border">
          <SL>{t("panelEstimation")}</SL>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{t("panelLength")}</p>
              <p className="mt-1 text-sm font-bold font-mono tabular-nums">{pathLengthLabel}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{t("panelDuration")}</p>
              <p className="mt-1 text-sm font-bold font-mono tabular-nums">{durationLabel}</p>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {hasGCode && (
        <div className="px-5 py-4 border-b border-border">
          <SL>{t("panelProgress")}</SL>
          <div className="flex items-end justify-between mb-2">
            <span className="text-3xl font-bold font-mono tabular-nums">
              {progressPct}
              <span className="text-lg text-muted-foreground font-normal">%</span>
            </span>
            <p className="text-[10px] text-muted-foreground">
              {currentMoveIndex.toLocaleString()} / {moveCount.toLocaleString()} {t("simulationMoves")}
            </p>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-linear-to-r from-primary to-violet-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Spindle */}
      <div className="px-5 py-4 border-b border-border">
        <SL>{t("panelSpindleState")}</SL>
        {liveTelemetry && (
          <div className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                {t("panelMqttLive")}
              </span>
              <span className="truncate text-[9px] text-muted-foreground">{liveTelemetry.sourceLabel}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <span>{t("dashboardTemp")}: <b>{liveTelemetry.temperature.toFixed(1)} C</b></span>
              <span>{t("panelVibration")}: <b>{liveTelemetry.vibration.toFixed(2)}</b></span>
              <span>{t("panelUsage")}: <b>{liveTelemetry.usageDuration} min</b></span>
              <span>{t("panelUpdate")}: <b>{new Date(liveTelemetry.updatedAt).toLocaleTimeString()}</b></span>
            </div>
            {liveTelemetry.error && <p className="mt-1 text-[10px] font-medium text-red-500">{liveTelemetry.error}</p>}
          </div>
        )}
        <div className="bg-muted/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${spindleActive ? "text-emerald-500" : "text-muted-foreground/40"}`} />
              <span className="text-sm font-semibold">{t("panelSpindle")}</span>
            </div>
            <span className={`text-[11px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full ${
              spindleActive
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {spindleActive ? t("panelActive") : t("panelStopped")}
            </span>
          </div>
          <div className="flex items-end gap-1 mb-2">
            <span className={`text-2xl font-bold font-mono tabular-nums ${spindleActive ? "text-emerald-500" : "text-muted-foreground/40"}`}>
              {spindleActive ? spindleRPM.toLocaleString() : "0"}
            </span>
            <span className="text-xs text-muted-foreground mb-0.5">RPM</span>
          </div>
          <Bar value={spindleActive ? spindleRPM : 0} max={2200} colorClass="bg-emerald-500" />
          <div className="flex justify-between mt-1 text-[9px] text-muted-foreground/50">
            <span>0</span><span>2200 RPM</span>
          </div>
        </div>
      </div>

      {/* Tool position */}
      <div className="px-5 py-4">
        <SL>{t("panelToolPosition")}</SL>
        <div className="grid grid-cols-3 gap-2">
          {(["X", "Y", "Z"] as const).map((axis, i) => {
            const val = [position.x, position.y, position.z][i];
            const color = ["text-red-500", "text-emerald-500", "text-blue-500"][i];
            return (
              <div key={axis} className="bg-muted/30 rounded-lg p-3 text-center">
                <p className={`text-[10px] font-bold mb-1.5 ${color}`}>{axis}</p>
                <p className="text-xs font-mono font-semibold tabular-nums">{val}</p>
              </div>
            );
          })}
        </div>
        <p className="text-[9px] text-muted-foreground/50 mt-2 text-center">
          {t("panelWorkCoordinates")}
        </p>
      </div>
    </div>
  );
}
