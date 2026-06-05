"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/components/i18n";

type Props = {
  machineName: string;
  dark: boolean;
  onClose: () => void;
};

type ParsedMove = {
  x: number; y: number; z: number; e: number; layer: number;
};

// ── Minimal G-code parser ────────────────────────────────────────────────────
function parseGCode(text: string): { moves: ParsedMove[]; totalLayers: number } {
  const lines = text.split("\n");
  const moves: ParsedMove[] = [];
  let x = 0, y = 0, z = 0, e = 0, layer = 0;

  for (const raw of lines) {
    const line = raw.split(";")[0].trim().toUpperCase();
    if (!line.startsWith("G0") && !line.startsWith("G1")) continue;

    const get = (axis: string) => {
      const m = line.match(new RegExp(`${axis}([\\-\\d.]+)`));
      return m ? parseFloat(m[1]) : null;
    };

    const nx = get("X") ?? x;
    const ny = get("Y") ?? y;
    const nz = get("Z") ?? z;
    const ne = get("E") ?? e;

    if (nz !== z) layer++;
    x = nx; y = ny; z = nz; e = ne;
    moves.push({ x, y, z, e, layer });
  }

  return { moves, totalLayers: layer };
}

// ── Canvas renderer ──────────────────────────────────────────────────────────
function renderLayer(
  canvas: HTMLCanvasElement,
  moves: ParsedMove[],
  currentLayer: number,
  dark: boolean
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = dark ? "#0d1117" : "#f8f9fa";
  ctx.fillRect(0, 0, W, H);

  const layerMoves = moves.filter(m => m.layer === currentLayer);
  if (layerMoves.length < 2) {
    ctx.fillStyle = dark ? "#444" : "#bbb";
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Aucun mouvement sur ce calque", W / 2, H / 2);
    return;
  }

  // Auto-scale to fit
  const xs = layerMoves.map(m => m.x), ys = layerMoves.map(m => m.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 30;
  const scaleX = (W - pad * 2) / (maxX - minX || 1);
  const scaleY = (H - pad * 2) / (maxY - minY || 1);
  const scale = Math.min(scaleX, scaleY);
  const offX = pad + ((W - pad * 2) - (maxX - minX) * scale) / 2;
  const offY = pad + ((H - pad * 2) - (maxY - minY) * scale) / 2;
  const tx = (v: number) => offX + (v - minX) * scale;
  const ty = (v: number) => H - (offY + (v - minY) * scale);

  // Draw travel moves (thin gray)
  ctx.beginPath();
  ctx.strokeStyle = dark ? "#2a3a4a" : "#dde";
  ctx.lineWidth = 0.8;
  for (let i = 1; i < layerMoves.length; i++) {
    const prev = layerMoves[i - 1], cur = layerMoves[i];
    if (cur.e <= prev.e) {
      ctx.moveTo(tx(prev.x), ty(prev.y));
      ctx.lineTo(tx(cur.x), ty(cur.y));
    }
  }
  ctx.stroke();

  // Draw extrusion moves (colored)
  const progress = layerMoves.length;
  for (let i = 1; i < progress; i++) {
    const prev = layerMoves[i - 1], cur = layerMoves[i];
    if (cur.e > prev.e) {
      const t = i / progress;
      ctx.beginPath();
      ctx.strokeStyle = dark
        ? `hsl(${200 + t * 60}, 80%, ${45 + t * 25}%)`
        : `hsl(${200 + t * 60}, 70%, ${35 + t * 20}%)`;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.moveTo(tx(prev.x), ty(prev.y));
      ctx.lineTo(tx(cur.x), ty(cur.y));
      ctx.stroke();
    }
  }

  // Current position dot
  const last = layerMoves[layerMoves.length - 1];
  ctx.beginPath();
  ctx.arc(tx(last.x), ty(last.y), 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ff4444";
  ctx.fill();
}

// ── Main Modal ───────────────────────────────────────────────────────────────
export default function GCodeModal({ machineName, dark, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const animRef = useRef<number | null>(null);
  const { t } = useTranslation();

  const [moves, setMoves]           = useState<ParsedMove[]>([]);
  const [totalLayers, setTotal]     = useState(0);
  const [currentLayer, setLayer]    = useState(0);
  const [playing, setPlaying]       = useState(false);
  const [speed, setSpeed]           = useState(1);
  const [fileName, setFileName]     = useState("");
  const [error, setError]           = useState("");
  const [dragging, setDragging]     = useState(false);

  // Render when layer or moves change
  useEffect(() => {
    if (!canvasRef.current || moves.length === 0) return;
    renderLayer(canvasRef.current, moves, currentLayer, dark);
  }, [moves, currentLayer, dark]);

  // Auto-play
  useEffect(() => {
    if (!playing) { if (animRef.current) clearInterval(animRef.current); return; }
    animRef.current = window.setInterval(() => {
      setLayer(l => {
        if (l >= totalLayers) { setPlaying(false); return l; }
        return l + 1;
      });
    }, Math.max(80, 400 / speed));
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [playing, speed, totalLayers]);

  const loadFile = useCallback((file: File) => {
    setError("");
    if (!file.name.endsWith(".gcode") && !file.name.endsWith(".gc") && !file.name.endsWith(".txt")) {
      setError("Fichier invalide - utilisez un fichier .gcode"); return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { moves: m, totalLayers: tl } = parseGCode(text);
      if (m.length === 0) { setError("Aucun mouvement G0/G1 trouvé dans ce fichier."); return; }
      setMoves(m); setTotal(tl); setLayer(0); setPlaying(false);
    };
    reader.readAsText(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) loadFile(f);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0]; if (f) loadFile(f);
  };

  // Styles
  const bg      = dark ? "bg-gray-900 border-gray-700"  : "bg-white border-gray-200";
  const header  = dark ? "border-gray-800 text-white"   : "border-gray-100 text-gray-900";
  const sub     = dark ? "text-gray-400"                : "text-gray-500";
  const dropBg  = dragging
    ? (dark ? "border-blue-400 bg-blue-950/30" : "border-blue-400 bg-blue-50")
    : (dark ? "border-gray-700 bg-gray-800/50 hover:border-gray-500" : "border-gray-200 bg-gray-50 hover:border-gray-400");
  const btnPrimary = "bg-blue-600 hover:bg-blue-500 text-white";
  const btnGhost   = dark
    ? "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
    : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200";
  const sliderTrack = dark ? "accent-blue-400" : "accent-blue-600";
  const layerBg     = dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600";
  const canvasBg    = dark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`relative w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col ${bg}`}
        style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${header}`}>
          <div>
            <h2 className="font-bold text-base">{t("simulationTitle")}</h2>
            <p className={`text-xs mt-0.5 ${sub}`}>{machineName}</p>
          </div>
          <button onClick={onClose}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-colors ${btnGhost}`}>
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Drop zone */}
          <div
            className={`rounded-xl border-2 border-dashed transition-colors cursor-pointer p-6 text-center ${dropBg}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".gcode,.gc,.txt" className="hidden" onChange={onFileChange} />
            <div className="text-3xl mb-2">📂</div>
            {fileName ? (
              <p className={`text-sm font-semibold ${dark ? "text-blue-400" : "text-blue-600"}`}>{fileName}</p>
            ) : (
              <>
                <p className={`text-sm font-medium ${dark ? "text-gray-300" : "text-gray-700"}`}>
                  Déposez votre fichier G-code ici
                </p>
                <p className={`text-xs mt-1 ${sub}`}>ou cliquez pour parcourir — .gcode / .gc</p>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-lg px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {error}
            </div>
          )}

          {/* Canvas */}
          {moves.length > 0 && (
            <div className={`rounded-xl border overflow-hidden ${canvasBg}`}>
              <canvas
                ref={canvasRef}
                width={580}
                height={320}
                className="w-full"
                style={{ display: "block" }}
              />
            </div>
          )}

          {/* Controls */}
          {moves.length > 0 && (
            <div className="space-y-4">
              {/* Layer info */}
              <div className="flex items-center justify-between">
                <span className={`text-xs font-mono px-2 py-1 rounded ${layerBg}`}>
                  Calque {currentLayer} / {totalLayers}
                </span>
                <span className={`text-xs ${sub}`}>
                  {moves.filter(m => m.layer === currentLayer).length} mouvements
                </span>
              </div>

              {/* Layer slider */}
              <input
                type="range" min={0} max={totalLayers} value={currentLayer}
                onChange={(e) => { setPlaying(false); setLayer(Number(e.target.value)); }}
                className={`w-full h-1.5 rounded-full cursor-pointer ${sliderTrack}`}
              />

              {/* Playback buttons */}
              <div className="flex items-center gap-3">
                <button onClick={() => { setLayer(0); setPlaying(false); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnGhost}`}>
                  {t("panelReset")}
                </button>
                <button
                  onClick={() => setPlaying(p => !p)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${btnPrimary}`}>
                  {playing ? t("panelPause") : currentLayer >= totalLayers ? "Rejouer" : t("panelStart")}
                </button>
                <button onClick={() => setLayer(l => Math.min(l + 1, totalLayers))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnGhost}`}>
                  +1 ⏭
                </button>
              </div>

              {/* Speed */}
              <div className="flex items-center gap-3">
                <span className={`text-xs w-14 ${sub}`}>{t("panelSpeed")}</span>
                <input
                  type="range" min={1} max={10} value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className={`flex-1 h-1.5 rounded-full cursor-pointer ${sliderTrack}`}
                />
                <span className={`text-xs font-mono w-8 text-right ${dark ? "text-blue-400" : "text-blue-600"}`}>
                  ×{speed}
                </span>
              </div>
            </div>
          )}

          {moves.length === 0 && !error && (
            <p className={`text-center text-xs ${sub}`}>
              Chargez un fichier G-code pour commencer la simulation couche par couche.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
