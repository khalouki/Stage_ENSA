"use client";
import { useRef } from "react";

type Props = {
  machineName: string;
  dark: boolean;
  onFileLoad: (text: string, name: string) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  isPlaying: boolean;
  isPaused: boolean;
  hasGCode: boolean;
  position: { x: string; y: string; z: string };
  progress: number;
  moveCount: number;
  currentMoveIndex: number;
  speed: number;
  onSpeedChange: (v: number) => void;
};

export function ControlPanel({
  machineName, dark, onFileLoad, onStart, onPause, onReset,
  isPlaying, isPaused, hasGCode, position,
  moveCount, currentMoveIndex, speed, onSpeedChange,
}: Props) {
  const gcodeRef = useRef<HTMLInputElement>(null);
  const progressPct = moveCount > 0 ? Math.round((currentMoveIndex / moveCount) * 100) : 0;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onFileLoad(ev.target?.result as string, file.name);
    reader.readAsText(file);
    e.target.value = "";
  };

  const bg       = dark ? "bg-gray-900 text-gray-100" : "bg-white text-gray-800";
  const divider  = dark ? "border-gray-700"           : "border-gray-200";
  const label    = dark ? "text-gray-400"             : "text-gray-500";
  const cardBg   = dark ? "bg-gray-800"               : "bg-gray-100";
  const cardText = dark ? "text-white"                : "text-gray-900";
  const rangeBg  = dark ? "bg-gray-700"               : "bg-gray-200";
  const disabledBtn = `${cardBg} ${label} cursor-not-allowed`;

  return (
    <div className={`flex flex-col h-full p-4 gap-4 overflow-y-auto ${bg}`}>

      {/* Header */}
      <div>
        <h1 className="text-base font-bold text-cyan-500 tracking-wider">Simulation G-code</h1>
        <p className={`text-xs mt-0.5 ${label}`}>{machineName}</p>
      </div>

      <div className={`border-t ${divider}`} />

      {/* Load G-code */}
      <div className="flex flex-col gap-2">
        <h2 className={`text-xs font-semibold uppercase tracking-widest ${label}`}>Fichier</h2>
        <button
          onClick={() => gcodeRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 transition-colors text-sm font-medium text-white"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Charger G-code (.gcode / .nc)
        </button>
        <input ref={gcodeRef} type="file" accept=".gcode,.nc,.txt" className="hidden" onChange={handleFile} />
      </div>

      <div className={`border-t ${divider}`} />

      {/* Playback */}
      <div className="flex flex-col gap-2">
        <h2 className={`text-xs font-semibold uppercase tracking-widest ${label}`}>Simulation</h2>

        <div className="flex gap-2">
          <button onClick={onStart} disabled={!hasGCode || (isPlaying && !isPaused)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors
              ${!hasGCode || (isPlaying && !isPaused) ? disabledBtn : "bg-green-700 hover:bg-green-600 text-white"}`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            {isPaused ? "Reprendre" : "Démarrer"}
          </button>

          <button onClick={onPause} disabled={!isPlaying || isPaused}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors
              ${!isPlaying || isPaused ? disabledBtn : "bg-yellow-700 hover:bg-yellow-600 text-white"}`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Pause
          </button>

          <button onClick={onReset} disabled={!hasGCode}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors
              ${!hasGCode ? disabledBtn : "bg-red-800 hover:bg-red-700 text-white"}`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Reset
          </button>
        </div>

        {/* Speed */}
        <div className="flex flex-col gap-1 mt-1">
          <div className={`flex justify-between text-xs ${label}`}>
            <span>Vitesse</span>
            <span className="font-mono text-cyan-500">{speed.toFixed(1)}x</span>
          </div>
          <input type="range" min="0.1" max="10" step="0.1" value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className={`w-full h-1.5 rounded-full appearance-none cursor-pointer accent-cyan-500 ${rangeBg}`} />
          <div className={`flex justify-between text-xs opacity-60 ${label}`}><span>0.1x</span><span>10x</span></div>
        </div>
      </div>

      <div className={`border-t ${divider}`} />

      {/* Progress */}
      {hasGCode && (
        <div className="flex flex-col gap-2">
          <h2 className={`text-xs font-semibold uppercase tracking-widest ${label}`}>Progression</h2>
          <div className="flex items-center justify-between text-xs">
            <span className={label}>Move {currentMoveIndex} / {moveCount}</span>
            <span className="text-cyan-500 font-mono font-bold">{progressPct}%</span>
          </div>
          <div className={`w-full h-2 rounded-full overflow-hidden ${rangeBg}`}>
            <div className="h-full bg-linear-to-r from-cyan-500 to-green-400 rounded-full transition-all duration-100"
              style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {hasGCode && <div className={`border-t ${divider}`} />}

      {/* Position */}
      <div className="flex flex-col gap-2">
        <h2 className={`text-xs font-semibold uppercase tracking-widest ${label}`}>Position</h2>
        <div className="grid grid-cols-3 gap-2">
          {([ ["X","text-red-400",position.x], ["Y","text-green-400",position.y], ["Z","text-blue-400",position.z] ] as const).map(([axis, color, val]) => (
            <div key={axis} className={`rounded p-2 text-center ${cardBg}`}>
              <div className={`text-xs font-semibold mb-0.5 ${color}`}>{axis}</div>
              <div className={`font-mono text-sm ${cardText}`}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-auto flex flex-col gap-1">
        <div className={`border-t ${divider} mb-2`} />
        <h2 className={`text-xs font-semibold uppercase tracking-widest mb-1 ${label}`}>Légende</h2>
        <div className={`flex items-center gap-2 text-xs ${label}`}>
          <div className="w-6 h-0.5 bg-green-400 rounded" /><span>Coupe (G1)</span>
        </div>
        <div className={`flex items-center gap-2 text-xs ${label}`}>
          <div className="w-6 h-0.5 bg-red-400 rounded" /><span>Rapide (G0)</span>
        </div>
        <div className={`flex items-center gap-2 text-xs ${label}`}>
          <div className="w-3 h-3 rounded-full bg-orange-500 shrink-0" /><span>Outil</span>
        </div>
      </div>
    </div>
  );
}
