import * as THREE from "three";
import type { SimulationMove } from "@/lib/simulation";
import type { PrintChunk, PrintedObjectReveal } from "@/components/simulation/machines/printerConfig";
import {
  updatePrinterSampleObjectReveal,
  updatePrintedGeometry,
} from "@/components/simulation/machines/printerVisuals";

type MutableRef<T> = {
  current: T;
};

type PrinterAnimationState = {
  playing: boolean;
  speed: number;
  moveIdx: number;
  segT: number;
  moves: SimulationMove[];
};

type TickPrinterAnimationArgs = {
  dt: number;
  tool: THREE.Group;
  anim: PrinterAnimationState;
  activeSegRef: MutableRef<THREE.Object3D | null>;
  printChunks: PrintChunk[];
  printedObjectReveal: PrintedObjectReveal | null;
  reconstructedPrintMode: boolean;
  revealedPrintCountRef: MutableRef<number>;
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3;
  disposeRenderable: (obj: THREE.Object3D) => void;
  syncPrinterMechanics: (toolWorldPos: THREE.Vector3, dt: number, immediate?: boolean) => void;
  syncCncMechanics: (toolWorldPos: THREE.Vector3, dt: number, immediate?: boolean) => void;
  tickPrinterBed: (isPrinting: boolean) => void;
  disableCncLaserEffect: (dt: number) => void;
  onPrintComplete?: () => void;
  onPositionUpdate: (pos: { x: string; y: string; z: string }) => void;
  onProgressUpdate: (pct: number) => void;
};

// Returns the world-space length of the segment between two consecutive moves.
// Used to advance segT in proportion to real distance so fast travel moves and
// short extrusion segments don't run at wildly different apparent speeds.
function segWorldLength(
  anim: PrinterAnimationState,
  toWorld: (gx: number, gy: number, gz: number) => THREE.Vector3,
): number {
  const from = anim.moves[anim.moveIdx];
  const to = anim.moves[anim.moveIdx + 1];
  if (!from || !to) return 1;
  const wFrom = toWorld(from.x, from.y, from.z);
  const wTo = toWorld(to.x, to.y, to.z);
  return Math.max(wFrom.distanceTo(wTo), 1e-4);
}

export function tickPrinterAnimation({
  dt,
  tool,
  anim,
  activeSegRef,
  printChunks,
  printedObjectReveal,
  reconstructedPrintMode,
  revealedPrintCountRef,
  toWorld,
  disposeRenderable,
  syncPrinterMechanics,
  syncCncMechanics,
  tickPrinterBed,
  disableCncLaserEffect,
  onPrintComplete,
  onPositionUpdate,
  onProgressUpdate,
}: TickPrinterAnimationArgs): void {
  // Advance by world-space distance so every mm of movement takes the same time
  // regardless of whether the segment is 0.1 mm or 200 mm long.
  // BASE_SPEED (mm/s at speed=1) gives a sensible default.
  const BASE_SPEED = 80; // world-units per second at speed=1
  const len = segWorldLength(anim, toWorld);
  anim.segT += (dt * BASE_SPEED * anim.speed) / len;
  const objectPrintMode = Boolean(printedObjectReveal) || reconstructedPrintMode;

  while (anim.segT >= 1 && anim.moveIdx < anim.moves.length - 1) {
    const completedTo = anim.moves[anim.moveIdx + 1];
    const completedIsPrint = completedTo?.operation === "print";
    // Convert leftover fraction back to world-distance, then re-normalise by
    // the NEXT segment's length so the remainder is expressed in [0,1] of
    // the new segment, not the old one.
    const prevLen = Math.max(segWorldLength(anim, toWorld), 1e-4);
    const leftoverDist = (anim.segT - 1) * prevLen;
    anim.moveIdx++;
    const nextLen = Math.max(segWorldLength(anim, toWorld), 1e-4);
    anim.segT = leftoverDist / nextLen;

    if (completedIsPrint && !printedObjectReveal) {
      revealedPrintCountRef.current = updatePrintedGeometry(
        printChunks,
        revealedPrintCountRef.current + 1,
      );
    }

    if (activeSegRef.current) {
      activeSegRef.current.removeFromParent();
      disposeRenderable(activeSegRef.current);
      activeSegRef.current = null;
    }
  }

  if (anim.moveIdx >= anim.moves.length - 1) {
    anim.playing = false;
    anim.segT = 0;
    disableCncLaserEffect(dt);
    tickPrinterBed(false);
    updatePrinterSampleObjectReveal(printedObjectReveal, 1);
    onPrintComplete?.();
    onProgressUpdate(1);
    return;
  }

  const from = anim.moves[anim.moveIdx];
  const to = anim.moves[anim.moveIdx + 1];
  const t = Math.min(anim.segT, 1);
  const progress = (anim.moveIdx + t) / Math.max(anim.moves.length - 1, 1);

  const gx = THREE.MathUtils.lerp(from.x, to.x, t);
  const gy = THREE.MathUtils.lerp(from.y, to.y, t);
  const gz = THREE.MathUtils.lerp(from.z, to.z, t);
  const toolPos = toWorld(gx, gy, gz);
  const isPrinting = to.operation === "print";

  tool.position.copy(toolPos);
  tool.visible = true;
  syncPrinterMechanics(toolPos, dt);
  syncCncMechanics(toolPos, dt);
  tickPrinterBed(isPrinting);
  updatePrinterSampleObjectReveal(printedObjectReveal, progress);

  if (activeSegRef.current) {
    activeSegRef.current.removeFromParent();
    disposeRenderable(activeSegRef.current);
    activeSegRef.current = null;
  }

  const isRapid = to.operation === "travel";

  // In object-print mode non-printing moves were already skipped above.
  // In gcode mode we still skip travel-move visuals — real printing simulations
  // only show the extruded filament, not the nozzle repositioning moves.
  if (isRapid) {
    onPositionUpdate({ x: gx.toFixed(2), y: gy.toFixed(2), z: gz.toFixed(2) });
    onProgressUpdate(progress);
    return;
  }
  if (objectPrintMode && !isPrinting) {
    onPositionUpdate({ x: gx.toFixed(2), y: gy.toFixed(2), z: gz.toFixed(2) });
    onProgressUpdate(progress);
    return;
  }

  onPositionUpdate({ x: gx.toFixed(2), y: gy.toFixed(2), z: gz.toFixed(2) });
  onProgressUpdate(progress);
}
