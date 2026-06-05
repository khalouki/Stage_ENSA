"use client";
import { useRef } from "react";
import {
  Play, Pause, RotateCcw, Upload, Layers, Thermometer,
  Clock, Activity, Zap, Gauge, Paintbrush,
} from "lucide-react";
import { useTranslation } from "@/components/i18n";

export type PrintLineThickness = "thin" | "medium" | "thick";

export type PrinterPanelProps = {
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
  progress: number;          // 0–1
  moveCount: number;
  currentMoveIndex: number;
  speed: number;
  onSpeedChange: (v: number) => void;
  lineColor: string;
  onLineColorChange: (color: string) => void;
  lineThickness: PrintLineThickness;
  onLineThicknessChange: (thickness: PrintLineThickness) => void;
  canStartSimulation: boolean;
  gcodeErrors: { line: number; message: string }[];
  simulationError: string | null;
  // Derived / simulated fields
  currentLayer: number;
  totalLayers: number;
  estimatedSec: number;      // total estimated seconds
  elapsedSec: number;        // seconds elapsed so far
	  nozzleTemp: number;        // °C (simulated drift)
	  bedTemp: number;           // °C
	  liveTelemetry?: {
	    sourceLabel: string;
	    vibration: number;
	    motorSpeed: number;
	    usageDuration: number;
	    updatedAt: string;
	    error?: string | null;
	  } | null;
	};

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function Bar({
  value, max = 100, gradient = false, colorClass = "bg-primary",
}: { value: number; max?: number; gradient?: boolean; colorClass?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          gradient ? "bg-linear-to-r from-primary to-violet-500" : colorClass
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SL({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold tracking-[0.12em] uppercase text-muted-foreground/55 mb-1.5">
      {children}
    </p>
  );
}

export function PrinterPanel({
  onFileLoad, onStart, onPause, onReset,
  isPlaying, isPaused, hasGCode, fileName,
  position, progress, moveCount, currentMoveIndex,
  speed, onSpeedChange,
  lineColor, onLineColorChange,
  lineThickness, onLineThicknessChange,
  canStartSimulation, gcodeErrors, simulationError,
	  currentLayer, totalLayers, estimatedSec, elapsedSec,
	  nozzleTemp, bedTemp, liveTelemetry,
	}: PrinterPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onFileLoad(ev.target?.result as string, file.name);
    reader.readAsText(file);
    e.target.value = "";
  };

  const progressPct = Math.round(progress * 100);
  const remainingSec = Math.max(0, estimatedSec - elapsedSec);
  const speedOptions = [
    { label: t("panelSlow"), value: 0.5 },
    { label: t("panelNormal"), value: 1 },
    { label: t("panelFast"), value: 2 },
  ];
  const colorOptions = ["#c0392b", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed"];
  const thicknessOptions: Array<{ label: string; value: PrintLineThickness }> = [
    { label: t("panelThin"), value: "thin" },
    { label: t("panelMedium"), value: "medium" },
    { label: t("panelThick"), value: "thick" },
  ];

  const statusColor =
    isPlaying ? "text-emerald-500" :
    isPaused  ? "text-amber-500"   :
    hasGCode  ? "text-primary"     : "text-muted-foreground";

  const statusLabel =
    isPlaying ? t("simulationInProgress") :
    isPaused  ? t("simulationPaused")      :
    hasGCode  ? t("simulationReady")       : t("labWaitingData");

  const nozzleColor =
    nozzleTemp > 200 ? "text-red-500" :
    nozzleTemp > 150 ? "text-amber-500" : "text-muted-foreground";

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-card">

      {/* ── Machine badge ── */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-base shrink-0">
            🖨
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">Imprimante 3D FDM</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Simulation · {t("panelPreview")}
            </p>
          </div>
        </div>

        {/* Status pill */}
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

      {/* ── File loader ── */}
      <div className="px-5 py-4 border-b border-border">
        <SL>{t("panelFile")}</SL>

        {fileName ? (
          <div className="bg-muted/40 rounded-lg px-3 py-2.5 border border-border/60 mb-2.5">
            <div className="flex items-start gap-2">
              <Activity className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-primary truncate">{fileName}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {moveCount.toLocaleString()} {t("simulationMoves")} · {totalLayers} {t("panelLayer").toLowerCase()}s
                </p>
              </div>
            </div>
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

      {/* ── Playback controls ── */}
      <div className="px-5 py-4 border-b border-border">
        <SL>{t("panelControls")}</SL>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {/* Start / Resume */}
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

          {/* Pause */}
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

          {/* Reset */}
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
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-500 leading-relaxed">
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
            <span className="text-[11px] font-bold font-mono text-primary">{speed.toFixed(1)}×</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
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

      {/* ── Print style ── */}
      <div className="px-5 py-4 border-b border-border">
        <SL>{t("panelDepositStyle")}</SL>
        <div className="space-y-3">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Paintbrush className="h-3 w-3" />
                {t("panelColor")}
              </span>
              <input
                type="color"
                value={lineColor}
                onChange={(event) => onLineColorChange(event.target.value)}
                className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                aria-label={t("panelFilamentColor")}
              />
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {colorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onLineColorChange(color)}
                  className={`h-7 rounded-md border transition-transform hover:scale-105 ${
                    lineColor.toLowerCase() === color ? "border-foreground" : "border-border"
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`${t("panelColor")} ${color}`}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-[10px] text-muted-foreground">{t("panelThickness")}</span>
            <div className="grid grid-cols-3 gap-1.5">
              {thicknessOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onLineThicknessChange(option.value)}
                  className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                    lineThickness === option.value
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
      </div>

      {/* ── Progress ── */}
      {hasGCode && (
        <div className="px-5 py-4 border-b border-border">
          <SL>{t("panelProgress")}</SL>

          {/* Big progress number */}
          <div className="flex items-end justify-between mb-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-foreground">
              {progressPct}
              <span className="text-lg text-muted-foreground font-normal">%</span>
            </span>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">
                {t("panelMove")} {currentMoveIndex.toLocaleString()} / {moveCount.toLocaleString()}
              </p>
            </div>
          </div>

          <Bar value={progress * 100} gradient />

          {/* Layer progress */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded-lg p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Layers className="w-3 h-3 text-primary" />
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{t("panelLayer")}</span>
              </div>
              <p className="text-sm font-bold font-mono tabular-nums">
                {currentLayer}
                <span className="text-[10px] text-muted-foreground font-normal"> / {totalLayers}</span>
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Clock className="w-3 h-3 text-primary" />
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{t("panelRemaining")}</span>
              </div>
              <p className="text-sm font-bold font-mono tabular-nums">{fmt(remainingSec)}</p>
            </div>
          </div>

          {/* Elapsed / Total */}
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{t("panelElapsed")}: <span className="font-mono text-foreground">{fmt(elapsedSec)}</span></span>
            <span>{t("panelEstimatedTotal")}: <span className="font-mono text-foreground">{fmt(estimatedSec)}</span></span>
          </div>
        </div>
      )}

      {/* ── Thermal ── */}
	      <div className="px-5 py-4 border-b border-border">
	        <SL>{t("panelTemperatures")}</SL>
	        {liveTelemetry && (
	          <div className="mb-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
	            <div className="flex items-center justify-between gap-2">
	              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
	                {t("panelMqttLive")}
	              </span>
	              <span className="truncate text-[9px] text-muted-foreground">{liveTelemetry.sourceLabel}</span>
	            </div>
	            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
	              <span>{t("panelVibration")}: <b>{liveTelemetry.vibration.toFixed(2)}</b></span>
	              <span>{t("panelSpeed")}: <b>{Math.round(liveTelemetry.motorSpeed)} RPM</b></span>
	              <span>{t("panelUsage")}: <b>{liveTelemetry.usageDuration} min</b></span>
	              <span>{t("panelUpdate")}: <b>{new Date(liveTelemetry.updatedAt).toLocaleTimeString()}</b></span>
	            </div>
	            {liveTelemetry.error && <p className="mt-1 text-[10px] font-medium text-red-500">{liveTelemetry.error}</p>}
	          </div>
	        )}
	        <div className="grid grid-cols-2 gap-2">
          {/* Nozzle */}
          <div className="bg-muted/30 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Thermometer className="w-3 h-3 text-orange-500 shrink-0" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{t("panelNozzle")}</span>
            </div>
            <p className={`text-sm font-bold font-mono tabular-nums ${nozzleColor}`}>
              {nozzleTemp.toFixed(1)}°C
            </p>
            <Bar
              value={nozzleTemp} max={280}
              colorClass={nozzleTemp > 200 ? "bg-red-500" : nozzleTemp > 150 ? "bg-amber-400" : "bg-sky-500"}
            />
          </div>
          {/* Bed */}
          <div className="bg-muted/30 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap className="w-3 h-3 text-blue-500 shrink-0" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{t("panelBed")}</span>
            </div>
            <p className="text-sm font-bold font-mono tabular-nums text-blue-500">
              {bedTemp.toFixed(1)}°C
            </p>
            <Bar value={bedTemp} max={110} colorClass="bg-blue-500" />
          </div>
        </div>
      </div>

      {/* ── Nozzle position ── */}
      <div className="px-5 py-4 border-b border-border">
        <SL>{t("panelNozzlePosition")}</SL>
        <div className="grid grid-cols-3 gap-2">
          {(["X", "Y", "Z"] as const).map((axis, i) => {
            const val = [position.x, position.y, position.z][i];
            const color = ["text-red-500", "text-emerald-500", "text-blue-500"][i];
            return (
              <div key={axis} className="bg-muted/30 rounded-lg p-2 text-center">
                <p className={`text-[10px] font-bold mb-1 ${color}`}>{axis}</p>
                <p className="text-xs font-mono tabular-nums font-semibold">{val}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="px-5 py-4">
        <SL>{t("panelPathLegend")}</SL>
        <div className="space-y-2">
          {[
            { color: "bg-primary", label: t("panelFilamentDeposit") },
            { color: "bg-muted-foreground/30", label: t("panelRapidMove") },
            { color: "bg-violet-500", label: t("panelPlannedPath") },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className={`w-5 h-1 rounded-full ${color} shrink-0`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
