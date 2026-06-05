"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CNCPanel } from "@/components/simulation/CNCPanel";
import { PrinterPanel, type PrintLineThickness } from "@/components/simulation/PrinterPanel";
import { SimulationNoticeModal } from "@/components/simulation/SimulationNoticeModal";
import { ThreeScene } from "@/components/simulation/ThreeScene";
import { usePageTransition } from "@/components/app-shell";
import { useTranslation } from "@/components/i18n";
import { apiRequest } from "@/lib/api";
import {
  deriveLayerInfo,
  estimateTotalSeconds,
  hasInvalidMoveData,
  resolveMachineId,
  simulationMachineMap,
  type MachineId,
  type SimulationError,
  type SimulationMove,
} from "@/lib/simulation";

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

function useLiveDrift(base: number, range: number, ms = 2200) {
  const [value, setValue] = useState(base);
  const baseRef = useRef(base);

  useEffect(() => {
    baseRef.current = base;
  }, [base]);

  useEffect(() => {
    const id = setInterval(() => {
      setValue(Number((baseRef.current + (Math.random() - 0.5) * 2 * range).toFixed(1)));
    }, ms);
    return () => clearInterval(id);
  }, [ms, range]);

  return value;
}

const CNC_ESTIMATE_DEFAULT_FEED_MM_PER_MIN = 1000;
const CNC_ESTIMATE_RAPID_FEED_MM_PER_MIN = 7200;
const CNC_ESTIMATE_TINY_MOVE_MM = 0.5;
const CNC_ESTIMATE_MIN_SEGMENT_SECONDS = 0.012;

function estimateCncVisualSimulation(moves: SimulationMove[], selectedSpeed: number) {
  const speedMultiplier = Math.max(selectedSpeed, 0.01);
  let pathLengthMm = 0;
  let durationSec = 0;

  for (let index = 0; index < moves.length - 1; index += 1) {
    const from = moves[index];
    const to = moves[index + 1];
    const distanceMm = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (distanceMm <= 1e-8) continue;

    pathLengthMm += distanceMm;
    if (distanceMm < CNC_ESTIMATE_TINY_MOVE_MM) continue;

    const feedRateMmPerMinute =
      to.type === "rapid"
        ? CNC_ESTIMATE_RAPID_FEED_MM_PER_MIN
        : Number.isFinite(to.feedRate) && to.feedRate > 0
        ? to.feedRate
        : CNC_ESTIMATE_DEFAULT_FEED_MM_PER_MIN;
    const effectiveSpeedMmPerSecond = Math.max((feedRateMmPerMinute / 60) * speedMultiplier, 0.01);
    const moveDurationSec = distanceMm / effectiveSpeedMmPerSecond;
    durationSec += Math.max(moveDurationSec, CNC_ESTIMATE_MIN_SEGMENT_SECONDS / Math.max(speedMultiplier, 1));
  }

  return { pathLengthMm, durationSec };
}

function SimulationWorkspace({ machineId, machineInstanceId }: { machineId: MachineId; machineInstanceId: number | null }) {
  const router = useRouter();
  const startLoading = usePageTransition();
  const { t } = useTranslation();
  const [dark] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem("fablab-theme");
    return stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const machine = simulationMachineMap[machineId];
  const isPrinter = machineId === "printer3d";

  const [moves, setMoves] = useState<SimulationMove[]>([]);
  const [hasProgram, setHasProgram] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [position, setPosition] = useState({ x: "0.00", y: "0.00", z: "0.00" });
  const [progress, setProgress] = useState(0);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [printLineColor, setPrintLineColor] = useState("#c0392b");
  const [printLineThickness, setPrintLineThickness] = useState<PrintLineThickness>("medium");
  const [simulationErrors, setSimulationErrors] = useState<SimulationError[]>([]);
  const [simulationErrorMessage, setSimulationErrorMessage] = useState<string | null>(null);
  const [showSafetyNotice, setShowSafetyNotice] = useState(true);
  const [liveState, setLiveState] = useState<MachineState | null>(null);
  const [liveStateError, setLiveStateError] = useState<string | null>(null);

  const [elapsedSec, setElapsedSec] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const elapsedBaseRef = useRef(0);

  const resetSimulationState = useCallback((clearFile: boolean) => {
    setMoves([]);
    setHasProgram(false);
    setIsPlaying(false);
    setIsPaused(false);
    setPosition({ x: "0.00", y: "0.00", z: "0.00" });
    setProgress(0);
    setCurrentMoveIndex(0);
    setSimulationErrors([]);
    setSimulationErrorMessage(null);
    setElapsedSec(0);
    elapsedBaseRef.current = 0;
    startTimeRef.current = null;
    if (clearFile) setFileName(null);
    setResetKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (startTimeRef.current !== null) {
        elapsedBaseRef.current += ((Date.now() - startTimeRef.current) / 1000) * speed;
        startTimeRef.current = null;
      }
      return;
    }

    startTimeRef.current = Date.now();
    const id = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedSec(elapsedBaseRef.current + ((Date.now() - startTimeRef.current) / 1000) * speed);
      }
    }, 500);

    return () => clearInterval(id);
  }, [isPlaying, speed]);

  useEffect(() => {
    if (!machineInstanceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveState(null);
      setLiveStateError(null);
      return;
    }

    const loadLiveState = async () => {
      try {
        const state = await apiRequest<MachineState>(`/machines/${machineInstanceId}/state`);
        setLiveState(state);
        setLiveStateError(null);
      } catch (error) {
        setLiveStateError(error instanceof Error ? error.message : t("simulationMqttUnavailable"));
      }
    };

    void loadLiveState();
    const timer = setInterval(() => void loadLiveState(), 4000);
    return () => clearInterval(timer);
  }, [machineInstanceId, t]);

  const estimatedSec = useMemo(() => estimateTotalSeconds(moves), [moves]);
  const cncVisualEstimate = useMemo(
    () => estimateCncVisualSimulation(moves, speed),
    [moves, speed],
  );
  const { currentLayer, totalLayers } = useMemo(
    () => deriveLayerInfo(moves, currentMoveIndex),
    [currentMoveIndex, moves],
  );

  const targetNozzle = isPlaying ? 215 : isPaused ? 195 : hasProgram ? 215 : 22;
  const targetBed = isPlaying ? 60 : isPaused ? 55 : hasProgram ? 60 : 22;
  const driftNozzleTemp = useLiveDrift(targetNozzle, isPlaying ? 3 : 0.5);
  const bedTemp = useLiveDrift(targetBed, isPlaying ? 1 : 0.2);
  const driftSpindleRPM = useLiveDrift(isPlaying ? 1740 : 0, isPlaying ? 30 : 0);
  const nozzleTemp = liveState ? liveState.temperature : driftNozzleTemp;
  const spindleActive = liveState ? liveState.motor_speed > 0 : isPlaying;
  const spindleRPM = liveState ? liveState.motor_speed : driftSpindleRPM;
  const liveTelemetry = liveState
    ? {
        sourceLabel: `${liveState.machine_name} · ${liveState.status}`,
        temperature: liveState.temperature,
        vibration: liveState.vibration,
        motorSpeed: liveState.motor_speed,
        usageDuration: liveState.usage_duration,
        updatedAt: liveState.updated_at,
        error: liveState.error,
      }
    : null;

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      const validation = machine.validateFile(text);
      if (!validation.ok) {
        resetSimulationState(false);
        setFileName(name);
        setSimulationErrors(validation.errors);
        setSimulationErrorMessage(t("simulationFileIncompatible"));
        return;
      }

      const parsed = machine.parse(text);
      const simulated = machine.simulate(parsed.commands);
      const extrusionSegmentsCount = simulated.moves.filter((move) => move.operation === "print").length;
      const travelMovesCount = simulated.moves.filter((move) => move.operation === "travel").length;
      const layerCount = new Set(
        simulated.moves
          .map((move) => move.layerIndex)
          .filter((layer): layer is number => typeof layer === "number"),
      ).size;

      if (machineId === "printer3d") {
        console.info("[Printer3D] G-code debug", {
          totalParsedMoves: simulated.moves.length,
          extrusionSegmentsCount,
          travelMovesCount,
          layerCount,
        });
      }

      setMoves(simulated.moves);
      setSimulationErrors(parsed.errors);
      setHasProgram(simulated.moves.length > 0);
      setIsPlaying(false);
      setIsPaused(false);
      setProgress(0);
      setCurrentMoveIndex(0);
      setFileName(name);
      setSimulationErrorMessage(
        parsed.errors.length > 0
          ? t("simulationFileHasErrors")
          : machineId === "printer3d" && extrusionSegmentsCount === 0
          ? t("simulationNoExtrusion")
          : null,
      );
      setResetKey((key) => key + 1);
      setElapsedSec(0);
      elapsedBaseRef.current = 0;
      startTimeRef.current = null;
    },
    [machine, machineId, resetSimulationState, t],
  );

  const canRunSimulation = hasProgram && simulationErrors.length === 0 && !hasInvalidMoveData(moves);

  const handleStart = useCallback(() => {
    if (!canRunSimulation) {
      const reason =
        simulationErrors.length > 0
          ? t("simulationBlockedErrors")
          : !hasProgram
          ? t("simulationBlockedNoMoves")
          : t("simulationBlockedInvalidPath");
      setSimulationErrorMessage(reason);
      setIsPlaying(false);
      setIsPaused(false);
      return;
    }

    setSimulationErrorMessage(null);
    setIsPlaying(true);
    setIsPaused(false);
  }, [canRunSimulation, hasProgram, simulationErrors.length, t]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    setIsPaused(true);
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setCurrentMoveIndex(0);
    setPosition({ x: "0.00", y: "0.00", z: "0.00" });
    setSimulationErrorMessage(null);
    setElapsedSec(0);
    elapsedBaseRef.current = 0;
    startTimeRef.current = null;
    setResetKey((key) => key + 1);
  }, []);

  const handlePositionUpdate = useCallback((nextPosition: { x: string; y: string; z: string }) => {
    setPosition(nextPosition);
  }, []);

  const handleProgressUpdate = useCallback(
    (pct: number) => {
      setProgress(pct);
      setCurrentMoveIndex(Math.round(pct * moves.length));
      if (pct >= 1) {
        setIsPlaying(false);
        setIsPaused(false);
      }
    },
    [moves.length],
  );

  const headerBg = dark ? "bg-gray-950/95 border-gray-800" : "bg-white/95 border-gray-200";
  const titleC = dark ? "text-white" : "text-gray-900";
  const subC = dark ? "text-gray-400" : "text-gray-500";
  const btnBack = dark
    ? "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300"
    : "bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700";
  const divider = dark ? "bg-gray-700" : "bg-gray-300";
  const panelBdr = dark ? "border-gray-800" : "border-gray-200";

  const statusBadge = isPlaying
    ? { cls: "bg-emerald-900/80 text-emerald-300 border-emerald-700", dot: "bg-emerald-400 animate-pulse", label: t("simulationInProgress") }
    : isPaused
    ? { cls: "bg-amber-900/80 text-amber-300 border-amber-700", dot: "bg-amber-400", label: t("simulationPaused") }
    : hasProgram
    ? {
        cls: dark ? "bg-gray-800 text-gray-300 border-gray-700" : "bg-gray-100 text-gray-600 border-gray-300",
        dot: "bg-gray-400",
        label: t("simulationReady"),
      }
    : null;

  const firstError = simulationErrors[0] ?? null;

  return (
    <div className={`flex h-screen w-full flex-col overflow-hidden ${dark ? "bg-gray-950" : "bg-slate-100"}`}>
      <SimulationNoticeModal open={showSafetyNotice} onOpenChange={setShowSafetyNotice} dark={dark} />

      <header className={`flex items-center justify-between border-b px-4 py-2.5 backdrop-blur-sm shrink-0 ${headerBg}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              startLoading();
              router.push("/lab");
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${btnBack}`}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("simulationBackToLab")}
          </button>

          <div className={`h-5 w-px ${divider}`} />

          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
              {machine.icon}
            </span>
            <div>
              <span className={`text-sm font-bold ${titleC}`}>{t("simulationTitle")}</span>
              <span className={`ml-2 text-xs ${subC}`}>· {machine.label}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {statusBadge && (
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge.cls}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
              {statusBadge.label}
            </div>
          )}

          {fileName && (
            <div
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                dark ? "border-cyan-900/60 bg-gray-800/80 text-cyan-400" : "border-cyan-200 bg-cyan-50 text-cyan-700"
              }`}
            >
              {fileName}
            </div>
          )}
          {machineInstanceId && (
            <div
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                liveState
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : liveStateError
                  ? "border-red-500/30 bg-red-500/10 text-red-500"
                  : dark
                  ? "border-gray-700 bg-gray-800 text-gray-400"
                  : "border-gray-200 bg-gray-100 text-gray-500"
              }`}
            >
              {liveState ? `MQTT: ${liveState.machine_name}` : liveStateError ? t("simulationMqttUnavailable") : t("simulationMqttLoading")}
            </div>
          )}
        </div>
      </header>

      {(simulationErrorMessage || firstError) && (
        <div
          className={`border-b px-4 py-2 text-xs ${
            dark ? "border-red-900 bg-red-950/50 text-red-200" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {simulationErrorMessage && <p>{simulationErrorMessage}</p>}
          {firstError && (
            <p>
              {t("simulationLine")} {firstError.line > 0 ? firstError.line : "-"}: {firstError.message}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className={`relative mb-4 min-w-0 flex-1 ${dark ? "bg-gray-950" : "bg-slate-100"}`}>
          <ThreeScene
            key={resetKey}
            moves={moves}
            isPlaying={isPlaying}
            playbackSpeed={speed}
            resetKey={resetKey}
            modelPath={machine.modelPath}
            machineType={machineId}
            printLineColor={printLineColor}
            printLineThickness={printLineThickness}
            dark={dark}
            onPositionUpdate={handlePositionUpdate}
            onProgressUpdate={handleProgressUpdate}
          />

          {!hasProgram && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                 className={`rounded-2xl border px-8 py-6 text-center ${
                    dark 
                    ? "border-gray-700/40 bg-black/20 backdrop-blur-lg" 
                    : "border-gray-200/40 bg-white/20 backdrop-blur-lg"
                 }`}>
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-lg font-bold text-primary">
                  {machine.icon}
                </div>
                <p className={`mb-1 text-sm font-semibold ${dark ? "text-gray-200" : "text-gray-700"}`}>
                  {t("simulationNoCompatibleFile")}
                </p>
                <p className={`text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>
                  {t("simulationLoadMatchingFile")}
                </p>
              </div>
            </div>
          )}

          {hasProgram && (
            <div
              className={`absolute bottom-0 left-0 right-0 border-t px-5 py-3 backdrop-blur-sm ${
                dark ? "border-gray-800 bg-gray-950/80" : "border-gray-200 bg-white/80"
              }`}
            >
              <div className="flex items-center gap-4">
                <span className={`shrink-0 font-mono text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>
                  {Math.round(progress * 100)}%
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-700/30">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isPrinter ? "bg-linear-to-r from-primary to-violet-500" : "bg-violet-500"
                    }`}
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <span className={`shrink-0 font-mono text-[10px] ${dark ? "text-gray-500" : "text-gray-400"}`}>
                  {currentMoveIndex.toLocaleString()} / {moves.length.toLocaleString()} {t("simulationMoves")}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className={`w-80 shrink-0 overflow-hidden border-l ${panelBdr}`}>
          {isPrinter ? (
            <PrinterPanel
              dark={dark}
              onFileLoad={handleFileLoad}
              onStart={handleStart}
              onPause={handlePause}
              onReset={handleReset}
              isPlaying={isPlaying}
              isPaused={isPaused}
              hasGCode={hasProgram}
              fileName={fileName}
              position={position}
              progress={progress}
              moveCount={moves.length}
              currentMoveIndex={currentMoveIndex}
              speed={speed}
              onSpeedChange={setSpeed}
              lineColor={printLineColor}
              onLineColorChange={setPrintLineColor}
              lineThickness={printLineThickness}
              onLineThicknessChange={setPrintLineThickness}
              canStartSimulation={canRunSimulation}
              gcodeErrors={simulationErrors}
              simulationError={simulationErrorMessage}
              currentLayer={currentLayer}
              totalLayers={totalLayers}
              estimatedSec={estimatedSec}
              elapsedSec={elapsedSec}
              nozzleTemp={nozzleTemp}
              bedTemp={bedTemp}
              liveTelemetry={liveTelemetry}
            />
          ) : (
            <CNCPanel
              dark={dark}
              onFileLoad={handleFileLoad}
              onStart={handleStart}
              onPause={handlePause}
              onReset={handleReset}
              isPlaying={isPlaying}
              isPaused={isPaused}
              hasGCode={hasProgram}
              fileName={fileName}
              position={position}
              progress={progress}
              moveCount={moves.length}
              currentMoveIndex={currentMoveIndex}
              speed={speed}
              onSpeedChange={setSpeed}
              canStartSimulation={canRunSimulation}
              gcodeErrors={simulationErrors}
              simulationError={simulationErrorMessage}
              spindleRPM={spindleRPM}
              spindleActive={spindleActive}
              liveTelemetry={liveTelemetry}
              estimatedPathLengthMm={cncVisualEstimate.pathLengthMm}
              estimatedDurationSec={cncVisualEstimate.durationSec}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SimulationContent() {
  const searchParams = useSearchParams();
  const machineId = resolveMachineId(searchParams.get("machine"));
  const machineInstanceId = Number(searchParams.get("machineId"));
  const resolvedMachineInstanceId = Number.isFinite(machineInstanceId) && machineInstanceId > 0 ? machineInstanceId : null;

  return <SimulationWorkspace key={`${machineId}-${resolvedMachineInstanceId ?? "demo"}`} machineId={machineId} machineInstanceId={resolvedMachineInstanceId} />;
}

export default function SimulationPage() {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-gray-950">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-gray-400">{t("simulationLoading")}</span>
          </div>
        </div>
      }
    >
      <SimulationContent />
    </Suspense>
  );
}
