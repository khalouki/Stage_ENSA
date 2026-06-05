import * as THREE from "three";

export type EngravingSegment = {
  start: THREE.Vector2;
  end: THREE.Vector2;
  moveIndex: number;
};

export type CncEngravingVisual = {
  group: THREE.Group;
  scorchTexture: THREE.CanvasTexture;
  markWidth: number;
  dispose: () => void;
};

const CANVAS_SIZE = 1024;
const MARK_WIDTH_RATIO = 0.011;
const SCORCH_TEXTURE_BASE = "#f2f4f6";

function drawScorchStroke(
  ctx: CanvasRenderingContext2D,
  a: THREE.Vector2,
  b: THREE.Vector2,
  lineWidth: number,
  intensity: number,
): void {
  const ax = a.x * CANVAS_SIZE;
  const ay = a.y * CANVAS_SIZE;
  const bx = b.x * CANVAS_SIZE;
  const by = b.y * CANVAS_SIZE;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = `rgba(14, 7, 3, ${0.22 * intensity})`;
  ctx.lineWidth = lineWidth * 3.1;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.strokeStyle = `rgba(56, 25, 8, ${0.42 * intensity})`;
  ctx.lineWidth = lineWidth * 1.75;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.strokeStyle = `rgba(5, 2, 1, ${0.72 * intensity})`;
  ctx.lineWidth = lineWidth * 0.85;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

export function createCncEngravingVisual(
  parent: THREE.Object3D,
  segments: EngravingSegment[],
  plateWidth: number,
  plateDepth: number,
  plateHeight: number,
): CncEngravingVisual {
  void segments;
  void plateHeight;
  const markWidth = THREE.MathUtils.clamp(Math.min(plateWidth, plateDepth) * MARK_WIDTH_RATIO, 0.2, 0.65);

  const group = new THREE.Group();
  group.name = "cncEngravingGroup";
  parent.add(group);

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;

  const scorchTexture = new THREE.CanvasTexture(canvas);
  scorchTexture.colorSpace = THREE.SRGBColorSpace;
  scorchTexture.anisotropy = 8;
  scorchTexture.minFilter = THREE.LinearMipmapLinearFilter;
  scorchTexture.magFilter = THREE.LinearFilter;
  scorchTexture.generateMipmaps = true;

  const dispose = () => {
    group.removeFromParent();
    scorchTexture.dispose();
  };

  return {
    group,
    scorchTexture,
    markWidth,
    dispose,
  };
}

export function updateCncEngravingVisual(
  engraving: CncEngravingVisual | null,
  segments: EngravingSegment[],
  plateWidth: number,
  plateDepth: number,
  plateHeight: number,
  completedMoveIndex: number,
  activeMoveIndex?: number,
  activeProgress = 1,
): void {
  if (!engraving) return;

  void plateHeight;
  const ctx = (engraving.scorchTexture.image as HTMLCanvasElement).getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = SCORCH_TEXTURE_BASE;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const scorchWidth = Math.max(
    2.5,
    Math.min(CANVAS_SIZE / plateWidth, CANVAS_SIZE / plateDepth) * engraving.markWidth * 0.9,
  );

  for (const segment of segments) {
    if (segment.moveIndex <= completedMoveIndex) {
      drawScorchStroke(ctx, segment.start, segment.end, scorchWidth, 1);
      continue;
    }

    if (activeMoveIndex === segment.moveIndex && activeProgress > 0) {
      const t = THREE.MathUtils.clamp(activeProgress, 0, 1);
      const partialEnd = new THREE.Vector2(
        segment.start.x + (segment.end.x - segment.start.x) * t,
        segment.start.y + (segment.end.y - segment.start.y) * t,
      );
      drawScorchStroke(ctx, segment.start, partialEnd, scorchWidth, 0.85);
    }
  }

  engraving.scorchTexture.needsUpdate = true;
}
