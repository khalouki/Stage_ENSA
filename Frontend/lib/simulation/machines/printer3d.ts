import {
  analyzeSimulationFormat,
  collectMachineSignals,
  createCompatibilityError,
  MotionCommand,
  MachineModule,
  parseIgnoredProgramLine,
  SimulationError,
  SimulationMove,
  tokenizeLine,
} from "@/lib/simulation/core";
import { interpolateArcToLines } from "@/lib/simulation/arc";

const SUPPORTED_G_CODES = new Set([0, 1, 2, 3]);
const NON_MOTION_G_CODES = new Set([4, 10, 11, 17, 18, 19, 20, 21, 28, 29, 80, 90, 91, 92]);
const CNC_ONLY_G_CODES = new Set([40, 41, 42, 43, 54, 55, 56, 57, 58, 59]);
const CNC_ONLY_M_CODES = new Set([3, 4, 5, 7, 8, 9]);
const SAFE_PRINTER_M_CODES = new Set([
  0, 1, 17, 18, 24, 25, 73, 82, 83, 84, 104, 105, 106, 107, 108, 109, 114, 115, 117, 118, 140,
  141, 142, 143, 155, 190, 201, 203, 204, 205, 220, 221, 355, 400, 413, 486, 900,
]);
const EXTRUSION_EPSILON = 1e-6;
const XY_PLANE = "XY";
const ZX_PLANE = "ZX";
const YZ_PLANE = "YZ";

type MotionMode = 0 | 1 | 2 | 3;
type ArcPlane = typeof XY_PLANE | typeof ZX_PLANE | typeof YZ_PLANE;

function detectLayerComment(rawLine: string): number | null {
  const layerMatch = rawLine.match(/;\s*(?:LAYER|layer)\s*:\s*(-?\d+)/);
  if (!layerMatch) return null;
  return Number.parseInt(layerMatch[1], 10) + 1;
}

function parseInlineComment(rawLine: string): string {
  const semicolonIndex = rawLine.indexOf(";");
  return semicolonIndex >= 0 ? rawLine.slice(semicolonIndex + 1).trim() : "";
}

export const printer3dMachine: MachineModule = {
  id: "printer3d",
  label: "Imprimante 3D FDM",
  icon: "P",
  modelPath: "/models/3d_printer.glb",
  validateFile(content) {
    const formatAnalysis = analyzeSimulationFormat(content);
    if (formatAnalysis.header.machine) {
      if (formatAnalysis.header.machine === "PRINTER3D" || formatAnalysis.header.machine === "PRINTER") {
        if (formatAnalysis.hasDemoCommands || formatAnalysis.hasUnknownCommands) {
          return { ok: false, errors: [createCompatibilityError("Unsupported simulation file format")] };
        }
      } else {
        return {
          ok: false,
          errors: [
            createCompatibilityError(
              `File declared for ${formatAnalysis.header.machine} but selected machine is 3D PRINTER`,
            ),
          ],
        };
      }
    }

    if (formatAnalysis.hasDemoCommands || formatAnalysis.hasUnknownCommands) {
      return { ok: false, errors: [createCompatibilityError("Unsupported simulation file format")] };
    }

    const signals = collectMachineSignals(content);
    if (signals.hasSpindleCommand || signals.hasCoolantCommand) {
      return { ok: false, errors: [createCompatibilityError()] };
    }
    return { ok: true, errors: [] };
  },
  parse(content) {
    const lines = content.split(/\r?\n/);
    const commands: MotionCommand[] = [];
    const errors: SimulationError[] = [];
    let currentPos = { x: 0, y: 0, z: 0 };
    let hasKnownPosition = true;
    let currentFeed = 1000;
    let currentMode: MotionMode = 1;
    let relativeMode = false;
    let currentExtrusion = 0;
    let extrusionRelative = false;
    let currentLayer = 1;
    let inferredLayerZ = Number.NaN;
    let currentPlane: ArcPlane = XY_PLANE;

    for (let index = 0; index < lines.length; index += 1) {
      const ignoredLine = parseIgnoredProgramLine(lines[index]);
      if (ignoredLine) continue;

      const declaredLayer = detectLayerComment(lines[index]);
      if (declaredLayer !== null) {
        currentLayer = Math.max(1, declaredLayer);
        continue;
      }

      const inlineComment = parseInlineComment(lines[index]).toLowerCase();
      const tokenized = tokenizeLine(lines[index], index + 1);
      if (!tokenized) {
        if (inlineComment.includes("layer change")) {
          currentLayer += 1;
        }
        continue;
      }
      if ("message" in tokenized) {
        errors.push(tokenized);
        continue;
      }

      let gCode: number | null = null;
      let mCode: number | null = null;
      let x: number | null = null;
      let y: number | null = null;
      let z: number | null = null;
      let i: number | null = null;
      let j: number | null = null;
      let k: number | null = null;
      let radius: number | null = null;
      let extrusion: number | null = null;
      let feedRate = currentFeed;
      let hasMotionAxis = false;
      let lineHasError = false;
      let sawUnknownMotionCommand = false;
      let sawExtrusionAxis = false;
      let sawArcParameter = false;

      for (const token of tokenized.tokens) {
        const value = Number(token.rawValue);
        if (!Number.isFinite(value)) {
          errors.push({
            line: tokenized.lineNumber,
            message: `Invalid numeric value for "${token.letter}": "${token.rawValue}"`,
          });
          lineHasError = true;
          continue;
        }

        switch (token.letter) {
          case "G": {
            const rounded = Math.trunc(value);
            if (value !== rounded) {
              errors.push({
                line: tokenized.lineNumber,
                message: `Invalid numeric value for "G": "${token.rawValue}"`,
              });
              lineHasError = true;
              break;
            }
            gCode = rounded;
            break;
          }
          case "M": {
            const rounded = Math.trunc(value);
            if (value !== rounded) {
              errors.push({
                line: tokenized.lineNumber,
                message: `Invalid numeric value for "M": "${token.rawValue}"`,
              });
              lineHasError = true;
              break;
            }
            mCode = rounded;
            break;
          }
          case "X":
            x = value;
            hasMotionAxis = true;
            break;
          case "Y":
            y = value;
            hasMotionAxis = true;
            break;
          case "Z":
            z = value;
            hasMotionAxis = true;
            break;
          case "I":
            i = value;
            sawArcParameter = true;
            break;
          case "J":
            j = value;
            sawArcParameter = true;
            break;
          case "K":
            k = value;
            sawArcParameter = true;
            break;
          case "R":
            radius = value;
            sawArcParameter = true;
            break;
          case "E":
            extrusion = value;
            sawExtrusionAxis = true;
            break;
          case "F":
            feedRate = value;
            currentFeed = value;
            break;
          case "S":
          case "T":
            break;
          default:
            break;
        }
      }

      if (lineHasError) continue;

      const isG92 = gCode === 92;

      if (gCode !== null) {
        if (SUPPORTED_G_CODES.has(gCode)) {
          currentMode = gCode as MotionMode;
        } else if (gCode === 17) {
          currentPlane = XY_PLANE;
        } else if (gCode === 18) {
          currentPlane = ZX_PLANE;
        } else if (gCode === 19) {
          currentPlane = YZ_PLANE;
        } else if (gCode === 90) {
          relativeMode = false;
        } else if (gCode === 91) {
          relativeMode = true;
        } else if (gCode === 92) {
          if (x !== null) currentPos.x = x;
          if (y !== null) currentPos.y = y;
          if (z !== null) currentPos.z = z;
          if (extrusion !== null) currentExtrusion = extrusion;
          if (x !== null || y !== null || z !== null) hasKnownPosition = true;
        } else if (gCode === 28) {
          if (!hasMotionAxis) {
            currentPos = { x: 0, y: 0, z: 0 };
            hasKnownPosition = true;
          } else {
            if (x !== null) currentPos.x = 0;
            if (y !== null) currentPos.y = 0;
            if (z !== null) currentPos.z = 0;
            hasKnownPosition = true;
          }
        } else if (CNC_ONLY_G_CODES.has(gCode)) {
          errors.push({
            line: tokenized.lineNumber,
            message: `CNC motion command "G${gCode}" is not valid for printer simulation`,
          });
          continue;
        } else if (!NON_MOTION_G_CODES.has(gCode)) {
          sawUnknownMotionCommand = true;
        }
      }

      if (mCode !== null) {
        if (CNC_ONLY_M_CODES.has(mCode)) {
          errors.push({
            line: tokenized.lineNumber,
            message: `CNC control command "M${mCode}" is not valid for printer simulation`,
          });
          continue;
        }
        if (!SAFE_PRINTER_M_CODES.has(mCode)) continue;
      }

      if (gCode === 10 || gCode === 11) continue;

      if (mCode === 82) extrusionRelative = false;
      if (mCode === 83) extrusionRelative = true;

      const isArcMove = currentMode === 2 || currentMode === 3;
      const hasMotionIntent = hasMotionAxis || sawExtrusionAxis || (isArcMove && sawArcParameter);
      if (!hasMotionIntent) continue;
      if (isG92) continue;

      if (gCode !== null && !SUPPORTED_G_CODES.has(gCode) && !NON_MOTION_G_CODES.has(gCode)) {
        if (sawUnknownMotionCommand) {
          errors.push({
            line: tokenized.lineNumber,
            message: `Unsupported motion command "G${gCode}" on a motion line`,
          });
        }
        continue;
      }

      const targetX = x === null ? currentPos.x : relativeMode ? currentPos.x + x : x;
      const targetY = y === null ? currentPos.y : relativeMode ? currentPos.y + y : y;
      const targetZ = z === null ? currentPos.z : relativeMode ? currentPos.z + z : z;
      const targetExtrusion =
        extrusion === null
          ? currentExtrusion
          : extrusionRelative
          ? currentExtrusion + extrusion
          : extrusion;
      const extrusionDelta = targetExtrusion - currentExtrusion;
      const hasLinearTravelDistance =
        Math.abs(targetX - currentPos.x) > EXTRUSION_EPSILON ||
        Math.abs(targetY - currentPos.y) > EXTRUSION_EPSILON ||
        Math.abs(targetZ - currentPos.z) > EXTRUSION_EPSILON;
      const hasXYTravelDistance =
        Math.abs(targetX - currentPos.x) > EXTRUSION_EPSILON ||
        Math.abs(targetY - currentPos.y) > EXTRUSION_EPSILON;
      const willExtrude =
        currentMode === 1 &&
        hasKnownPosition &&
        sawExtrusionAxis &&
        extrusionDelta > EXTRUSION_EPSILON &&
        hasXYTravelDistance;
      let nextLayer = currentLayer;
      let nextInferredLayerZ = inferredLayerZ;

      if (Number.isFinite(targetZ)) {
        if (!Number.isFinite(nextInferredLayerZ)) {
          nextInferredLayerZ = targetZ;
        } else if (targetZ > nextInferredLayerZ + 1e-4) {
          nextInferredLayerZ = targetZ;
          if (commands.length > 0 && willExtrude) {
            nextLayer += 1;
          }
        }
      }

      const resolvedLayer = Math.max(1, nextLayer);

      if (isArcMove) {
        if (currentPlane !== XY_PLANE) {
          errors.push({
            line: tokenized.lineNumber,
            message: `Unsupported G2/G3 arc plane "${currentPlane}". Only XY-plane arcs (G17) are supported for printer simulation.`,
          });
          continue;
        }
        if (radius !== null) {
          errors.push({
            line: tokenized.lineNumber,
            message: 'Unsupported G2/G3 arc format: radius-based "R" arcs are not supported. Use I/J offsets.',
          });
          continue;
        }
        if (k !== null) {
          errors.push({
            line: tokenized.lineNumber,
            message: 'Unsupported G2/G3 arc format: "K" is not supported for XY-plane printer arcs.',
          });
          continue;
        }
        if (i === null && j === null) {
          errors.push({
            line: tokenized.lineNumber,
            message: 'Malformed G2/G3 arc: missing I/J center offsets.',
          });
          continue;
        }

        const arcResult = interpolateArcToLines({
          lineNumber: tokenized.lineNumber,
          start: currentPos,
          end: { x: targetX, y: targetY, z: targetZ },
          centerOffset: { i: i ?? 0, j: j ?? 0 },
          clockwise: currentMode === 2,
          feedRate,
          startExtrusion: currentExtrusion,
          endExtrusion: targetExtrusion,
          layerIndex: resolvedLayer,
        });

        if ("error" in arcResult) {
          errors.push(arcResult.error);
          continue;
        }

        commands.push(...arcResult.commands);
      } else {
        if (hasLinearTravelDistance) {
          commands.push({
            type: currentMode === 0 ? "rapid" : "linear",
            motionCode: currentMode,
            startX: currentPos.x,
            startY: currentPos.y,
            startZ: currentPos.z,
            x: targetX,
            y: targetY,
            z: targetZ,
            feedRate,
            lineNumber: tokenized.lineNumber,
            hasExtrusionCommand: sawExtrusionAxis,
            extrusion: targetExtrusion,
            extrusionDelta,
            isExtruding: willExtrude,
            layerIndex: resolvedLayer,
          });
        }
      }

      currentPos = { x: targetX, y: targetY, z: targetZ };
      currentExtrusion = targetExtrusion;
      hasKnownPosition = true;
      currentLayer = nextLayer;
      inferredLayerZ = nextInferredLayerZ;
    }

    if (commands.length === 0) {
      errors.push({
        line: 0,
        message: "Toolpath is empty or invalid. No executable G0/G1 moves were found.",
      });
    }

    return { commands, errors };
  },
  simulate(commands) {
    const moves: SimulationMove[] = commands.map((command) => {
      const isPrinting =
        command.type === "linear" &&
        command.motionCode === 1 &&
        Boolean(command.hasExtrusionCommand) &&
        Boolean(command.isExtruding) &&
        (command.extrusionDelta ?? 0) > EXTRUSION_EPSILON;

      return {
        type: command.type,
        operation: isPrinting ? "print" : "travel",
        startX: command.startX,
        startY: command.startY,
        startZ: command.startZ,
        x: command.x,
        y: command.y,
        z: command.z,
        feedRate: command.feedRate,
        lineNumber: command.lineNumber,
        hasExtrusionCommand: command.hasExtrusionCommand,
        extrusionDelta: command.extrusionDelta,
        isExtruding: command.isExtruding,
        layerIndex: command.layerIndex,
      };
    });
    const firstCommand = commands[0];
    if (
      firstCommand &&
      firstCommand.startX !== undefined &&
      firstCommand.startY !== undefined &&
      firstCommand.startZ !== undefined
    ) {
      moves.unshift({
        type: "rapid",
        operation: "travel",
        x: firstCommand.startX,
        y: firstCommand.startY,
        z: firstCommand.startZ,
        feedRate: firstCommand.feedRate,
        lineNumber: firstCommand.lineNumber,
        isExtruding: false,
      });
    }

    return {
      moves,
    };
  },
};
