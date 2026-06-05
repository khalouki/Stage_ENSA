import {
  analyzeSimulationFormat,
  collectMachineSignals,
  createCompatibilityError,
  MotionCommand,
  MachineModule,
  normalizeLine,
  parseIgnoredProgramLine,
  SimulationError,
  tokenizeLine,
} from "@/lib/simulation/core";
import { interpolateArcToLines } from "@/lib/simulation/arc";

const SUPPORTED_G_CODES = new Set([0, 1, 2, 3, 17, 18, 19, 21, 40, 43, 49, 54, 55, 56, 57, 58, 59, 90, 91, 92]);
const MOTION_G_CODES = new Set([0, 1, 2, 3]);
const PRINTER_M_CODES = new Set([82, 83, 84, 104, 106, 107, 109, 140, 190]);
const DEMO_COMMANDS = new Set(["MOVE", "CUT", "ENGRAVE"]);
const XY_PLANE = 17;

function getSelectedMachineLabel(): string {
  return "CNC";
}

function createDeclaredMachineMismatchError(declaredMachine: string): SimulationError {
  return createCompatibilityError(`File declared for ${declaredMachine} but selected machine is ${getSelectedMachineLabel()}`);
}

function parseDemoToolpath(content: string): { commands: MotionCommand[]; errors: SimulationError[] } {
  const commands: MotionCommand[] = [];
  const errors: SimulationError[] = [];
  const lines = content.split(/\r?\n/);
  let currentPos = { x: 0, y: 0, z: 0 };
  let currentFeed = 1000;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const normalized = normalizeLine(rawLine);
    if (!normalized) continue;

    const ignoredLine = parseIgnoredProgramLine(normalized);
    if (ignoredLine) continue;

    const [commandWord, ...rest] = normalized.split(/\s+/);
    if (!DEMO_COMMANDS.has(commandWord)) {
      errors.push({
        line: index + 1,
        message: `Unsupported simulation command "${commandWord}"`,
      });
      continue;
    }

    const tokenized = tokenizeLine(rest.join(" "), index + 1);
    if (!tokenized) continue;
    if ("message" in tokenized) {
      errors.push(tokenized);
      continue;
    }

    let x: number | null = null;
    let y: number | null = null;
    let z: number | null = null;
    let feedRate = currentFeed;
    let lineHasError = false;

    for (const token of tokenized.tokens) {
      const value = Number(token.rawValue);
      if (!Number.isFinite(value)) {
        errors.push({
          line: index + 1,
          message: `Invalid numeric value for "${token.letter}": "${token.rawValue}"`,
        });
        lineHasError = true;
        continue;
      }

      switch (token.letter) {
        case "X":
          x = value;
          break;
        case "Y":
          y = value;
          break;
        case "Z":
          z = value;
          break;
        case "F":
          feedRate = value;
          currentFeed = value;
          break;
        default:
          errors.push({
            line: index + 1,
            message: `Unsupported parameter "${token.letter}" in demo toolpath`,
          });
          lineHasError = true;
          break;
      }
    }

    if (lineHasError) continue;

    const targetX = x ?? currentPos.x;
    const targetY = y ?? currentPos.y;
    const targetZ = z ?? currentPos.z;
    const isCut = commandWord === "CUT" || commandWord === "ENGRAVE";

    commands.push({
      type: isCut ? "linear" : "rapid",
      x: targetX,
      y: targetY,
      z: targetZ,
      feedRate,
      lineNumber: index + 1,
      spindleOn: isCut,
    });

    currentPos = { x: targetX, y: targetY, z: targetZ };
  }

  if (commands.length === 0) {
    errors.push({
      line: 0,
      message: "Toolpath is empty or invalid. No executable simulation moves were found.",
    });
  }

  return { commands, errors };
}

export const cncMachine: MachineModule = {
  id: "cnc",
  label: "CNC Router",
  icon: "C",
  modelPath: "/models/CNC.glb",
  validateFile(content) {
    const formatAnalysis = analyzeSimulationFormat(content);
    if (formatAnalysis.header.machine) {
      if (formatAnalysis.header.machine === "LASER") {
        if (formatAnalysis.isLaserDemoToolpath) {
          return { ok: true, errors: [] };
        }

        return { ok: false, errors: [createCompatibilityError("Unsupported simulation file format")] };
      }

      if (formatAnalysis.header.machine === "CNC") {
        if (formatAnalysis.hasDemoCommands || formatAnalysis.hasUnknownCommands) {
          return { ok: false, errors: [createCompatibilityError("Unsupported simulation file format")] };
        }
      } else {
        return { ok: false, errors: [createDeclaredMachineMismatchError(formatAnalysis.header.machine)] };
      }
    }

    if (formatAnalysis.hasDemoCommands || formatAnalysis.hasUnknownCommands) {
      return { ok: false, errors: [createCompatibilityError("Unsupported simulation file format")] };
    }

    const signals = collectMachineSignals(content);
    const hasSimpleCncMotion = content.split(/\r?\n/).some((line, index) => {
      const tokenized = tokenizeLine(line, index + 1);
      if (!tokenized || "message" in tokenized) return false;

      let hasMotionCode = false;
      let hasXY = false;
      for (const token of tokenized.tokens) {
        const value = Number(token.rawValue);
        if (!Number.isFinite(value)) continue;
        if (token.letter === "G" && MOTION_G_CODES.has(Math.trunc(value))) hasMotionCode = true;
        if (token.letter === "X" || token.letter === "Y") hasXY = true;
      }
      return hasMotionCode && hasXY;
    });
    const hasCncCue =
      signals.hasSpindleCommand ||
      signals.hasCoolantCommand ||
      signals.hasToolChange ||
      signals.hasArcMotion ||
      signals.hasNegativeZMotion ||
      signals.hasSpindleSpeed ||
      hasSimpleCncMotion;

    if (signals.hasExtrusionAxis || signals.hasPrinterMCode || !hasCncCue) {
      return { ok: false, errors: [createCompatibilityError()] };
    }

    return { ok: true, errors: [] };
  },
  parse(content) {
    const formatAnalysis = analyzeSimulationFormat(content);
    if (formatAnalysis.isLaserDemoToolpath) {
      return parseDemoToolpath(content);
    }

    const lines = content.split(/\r?\n/);
    const commands: MotionCommand[] = [];
    const errors: SimulationError[] = [];
    let currentPos = { x: 0, y: 0, z: 0 };
    let currentFeed = 1000;
    let currentMode: 0 | 1 | 2 | 3 = 1;
    let currentPlane = XY_PLANE;
    let relativeMode = false;
    let spindleOn = false;

    for (let index = 0; index < lines.length; index += 1) {
      const ignoredLine = parseIgnoredProgramLine(lines[index]);
      if (ignoredLine) continue;

      const tokenized = tokenizeLine(lines[index], index + 1);
      if (!tokenized) continue;
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
      let feedRate = currentFeed;
      let hasMotionAxis = false;
      let lineHasError = false;

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
            break;
          case "J":
            j = value;
            break;
          case "K":
            k = value;
            break;
          case "R":
            radius = value;
            break;
          case "F":
            feedRate = value;
            currentFeed = value;
            break;
          case "S":
          case "T":
            break;
          case "E":
            errors.push({
              line: tokenized.lineNumber,
              message: 'Extrusion axis "E" is not valid for CNC simulation',
            });
            lineHasError = true;
            break;
          default:
            break;
        }
      }

      if (lineHasError) continue;

      if (gCode !== null) {
        if (MOTION_G_CODES.has(gCode)) {
          currentMode = gCode as 0 | 1 | 2 | 3;
        } else if (gCode === 17) {
          currentPlane = 17;
        } else if (gCode === 18) {
          currentPlane = 18;
        } else if (gCode === 19) {
          currentPlane = 19;
        } else if (gCode === 90) {
          relativeMode = false;
        } else if (gCode === 91) {
          relativeMode = true;
        } else if (gCode === 92) {
          if (x !== null) currentPos.x = x;
          if (y !== null) currentPos.y = y;
          if (z !== null) currentPos.z = z;
        } else if (!SUPPORTED_G_CODES.has(gCode)) {
          errors.push({
            line: tokenized.lineNumber,
            message: `Unsupported CNC command "G${gCode}"`,
          });
          continue;
        }
      }

      if (mCode !== null) {
        if (PRINTER_M_CODES.has(mCode)) {
          errors.push({
            line: tokenized.lineNumber,
            message: `Printer control command "M${mCode}" is not valid for CNC simulation`,
          });
          continue;
        }
        if (mCode === 3 || mCode === 4) spindleOn = true;
        if (mCode === 5) spindleOn = false;
      }

      const isArcMove = currentMode === 2 || currentMode === 3;
      if (!hasMotionAxis && !isArcMove) continue;

      const targetX = x === null ? currentPos.x : relativeMode ? currentPos.x + x : x;
      const targetY = y === null ? currentPos.y : relativeMode ? currentPos.y + y : y;
      const targetZ = z === null ? currentPos.z : relativeMode ? currentPos.z + z : z;

      if (isArcMove) {
        if (currentPlane !== XY_PLANE) {
          errors.push({
            line: tokenized.lineNumber,
            message: `Unsupported CNC G2/G3 arc plane "G${currentPlane}". Only XY-plane arcs (G17) are supported.`,
          });
          continue;
        }
        if (radius !== null) {
          errors.push({
            line: tokenized.lineNumber,
            message: 'Unsupported CNC G2/G3 arc format: radius-based "R" arcs are not supported. Use I/J offsets.',
          });
          continue;
        }
        if (k !== null) {
          errors.push({
            line: tokenized.lineNumber,
            message: 'Unsupported CNC G2/G3 arc format: "K" is not supported for XY-plane arcs.',
          });
          continue;
        }
        if (i === null && j === null) {
          errors.push({
            line: tokenized.lineNumber,
            message: "Malformed CNC G2/G3 arc: missing I/J center offsets.",
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
          startExtrusion: 0,
          endExtrusion: 0,
          layerIndex: 0,
          config: {
            maxSegmentLengthMm: 0.5,
            maxAngleStepRad: Math.PI / 36,
            radiusToleranceMm: 0.1,
            allowRadiusMismatch: true,
          },
        });

        if ("error" in arcResult) {
          errors.push({
            line: tokenized.lineNumber,
            message: arcResult.error.message.replace("Unsupported G2/G3 arc", "Unsupported CNC G2/G3 arc"),
          });
          continue;
        }

        let segmentStart = currentPos;
        for (const segment of arcResult.commands) {
          commands.push({
            ...segment,
            motionCode: 1,
            startX: segmentStart.x,
            startY: segmentStart.y,
            startZ: segmentStart.z,
            spindleOn,
          });
          segmentStart = { x: segment.x, y: segment.y, z: segment.z };
        }
      } else {
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
          spindleOn,
        });
      }

      currentPos = { x: targetX, y: targetY, z: targetZ };
    }

    if (commands.length === 0) {
      errors.push({
        line: 0,
        message: "Toolpath is empty or invalid. No executable CNC moves were found.",
      });
    }

    const xs = commands.map((command) => command.x);
    const ys = commands.map((command) => command.y);
    const originalBoundingBox =
      commands.length > 0
        ? {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
          }
        : null;
    const cuttingSegments = commands.filter(
      (command) => command.type === "linear" && command.z <= 0,
    ).length;

    console.info("[CNC] Parsed toolpath", {
      parsedPoints: commands.length,
      cuttingSegments,
      originalBoundingBox,
    });

    return { commands, errors };
  },
  simulate(commands) {
    return {
      moves: commands.map((command) => ({
        type: command.type,
        operation: command.type === "linear" && command.z <= 0 ? "cut" : "travel",
        x: command.x,
        y: command.y,
        z: command.z,
        feedRate: command.feedRate,
        lineNumber: command.lineNumber,
      })),
    };
  },
};
