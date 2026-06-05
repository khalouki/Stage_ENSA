import type { MotionCommand, SimulationError } from "@/lib/simulation/core";

type Position3D = {
  x: number;
  y: number;
  z: number;
};

export type ArcInterpolationConfig = {
  maxSegmentLengthMm: number;
  maxAngleStepRad: number;
  radiusToleranceMm: number;
  allowRadiusMismatch: boolean;
};

export type ArcInterpolationInput = {
  lineNumber: number;
  start: Position3D;
  end: Position3D;
  centerOffset: { i: number; j: number };
  clockwise: boolean;
  feedRate: number;
  startExtrusion: number;
  endExtrusion: number;
  layerIndex: number;
  config?: Partial<ArcInterpolationConfig>;
};

export const DEFAULT_ARC_INTERPOLATION_CONFIG: ArcInterpolationConfig = {
  maxSegmentLengthMm: 0.75,
  maxAngleStepRad: Math.PI / 18,
  radiusToleranceMm: 0.05,
  allowRadiusMismatch: false,
};

const TWO_PI = Math.PI * 2;
const ARC_EPSILON = 1e-6;

function normalizeAngle(angle: number): number {
  let normalized = angle % TWO_PI;
  if (normalized < 0) normalized += TWO_PI;
  return normalized;
}

function resolveArcSweep(startAngle: number, endAngle: number, clockwise: boolean): number {
  const normalizedStart = normalizeAngle(startAngle);
  const normalizedEnd = normalizeAngle(endAngle);

  if (clockwise) {
    let sweep = normalizedStart - normalizedEnd;
    if (sweep <= ARC_EPSILON) sweep += TWO_PI;
    return -sweep;
  }

  let sweep = normalizedEnd - normalizedStart;
  if (sweep <= ARC_EPSILON) sweep += TWO_PI;
  return sweep;
}

function buildArcError(lineNumber: number, reason: string): SimulationError {
  return {
    line: lineNumber,
    message: `Unsupported G2/G3 arc: ${reason}`,
  };
}

export function interpolateArcToLines(
  input: ArcInterpolationInput,
): { commands: MotionCommand[] } | { error: SimulationError } {
  const config: ArcInterpolationConfig = {
    ...DEFAULT_ARC_INTERPOLATION_CONFIG,
    ...input.config,
  };

  const centerX = input.start.x + input.centerOffset.i;
  const centerY = input.start.y + input.centerOffset.j;
  const startDx = input.start.x - centerX;
  const startDy = input.start.y - centerY;
  const endDx = input.end.x - centerX;
  const endDy = input.end.y - centerY;
  const startRadius = Math.hypot(startDx, startDy);
  const endRadius = Math.hypot(endDx, endDy);

  if (startRadius <= ARC_EPSILON) {
    return { error: buildArcError(input.lineNumber, "I/J offsets produce a zero-radius arc") };
  }

  const hasRadiusMismatch = Math.abs(startRadius - endRadius) > config.radiusToleranceMm;
  if (hasRadiusMismatch && !config.allowRadiusMismatch) {
    return {
      error: buildArcError(
        input.lineNumber,
        `start/end radius mismatch (${startRadius.toFixed(3)}mm vs ${endRadius.toFixed(3)}mm)`,
      ),
    };
  }

  const startAngle = Math.atan2(startDy, startDx);
  const endAngle = Math.atan2(endDy, endDx);
  const sameEndpoint =
    Math.abs(input.end.x - input.start.x) <= ARC_EPSILON &&
    Math.abs(input.end.y - input.start.y) <= ARC_EPSILON;
  const sweepAngle = sameEndpoint
    ? input.clockwise
      ? -TWO_PI
      : TWO_PI
    : resolveArcSweep(startAngle, endAngle, input.clockwise);
  const averageRadius = hasRadiusMismatch ? (startRadius + endRadius) * 0.5 : startRadius;
  const arcLength = Math.abs(sweepAngle) * averageRadius;
  const segmentsByLength = Math.ceil(arcLength / config.maxSegmentLengthMm);
  const segmentsByAngle = Math.ceil(Math.abs(sweepAngle) / config.maxAngleStepRad);
  const segmentCount = Math.max(1, segmentsByLength, segmentsByAngle);
  const extrusionDelta = input.endExtrusion - input.startExtrusion;
  const commands: MotionCommand[] = [];

  for (let segmentIndex = 1; segmentIndex <= segmentCount; segmentIndex += 1) {
    const ratio = segmentIndex / segmentCount;
    const angle = startAngle + sweepAngle * ratio;
    const isFinalSegment = segmentIndex === segmentCount;
    const radius = hasRadiusMismatch ? startRadius + (endRadius - startRadius) * ratio : startRadius;
    const x = isFinalSegment ? input.end.x : centerX + Math.cos(angle) * radius;
    const y = isFinalSegment ? input.end.y : centerY + Math.sin(angle) * radius;
    const z = isFinalSegment ? input.end.z : input.start.z + (input.end.z - input.start.z) * ratio;
    const extrusion = isFinalSegment
      ? input.endExtrusion
      : input.startExtrusion + extrusionDelta * ratio;
    const previousExtrusion =
      commands.length > 0 ? commands[commands.length - 1].extrusion ?? input.startExtrusion : input.startExtrusion;
    const segmentExtrusionDelta = extrusion - previousExtrusion;

    commands.push({
      type: "linear",
      x,
      y,
      z,
      feedRate: input.feedRate,
      lineNumber: input.lineNumber,
      extrusion,
      extrusionDelta: segmentExtrusionDelta,
      isExtruding: segmentExtrusionDelta > ARC_EPSILON,
      layerIndex: input.layerIndex,
    });
  }

  return { commands };
}
