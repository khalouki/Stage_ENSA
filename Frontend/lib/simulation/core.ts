export type MachineId = "printer3d" | "cnc";

export type SimulationMoveType = "rapid" | "linear";
export type SimulationOperation = "travel" | "print" | "cut";

export type SimulationMove = {
  type: SimulationMoveType;
  operation: SimulationOperation;
  x: number;
  y: number;
  z: number;
  feedRate: number;
  lineNumber: number;
  extrusionDelta?: number;
  isExtruding?: boolean;
  layerIndex?: number;
};

export type SimulationError = {
  line: number;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: SimulationError[];
};

export type MachineSignals = {
  hasExtrusionAxis: boolean;
  hasPrinterMCode: boolean;
  hasSpindleCommand: boolean;
  hasCoolantCommand: boolean;
  hasToolChange: boolean;
  hasArcMotion: boolean;
  hasNegativeZMotion: boolean;
  hasSpindleSpeed: boolean;
};

export type TokenizedLine = {
  lineNumber: number;
  raw: string;
  compact: string;
  tokens: Array<{ letter: string; rawValue: string }>;
};

export type IgnoredLine =
  | { kind: "percent" }
  | { kind: "programHeader"; programNumber: number };

export type MotionCommand = {
  type: SimulationMoveType;
  x: number;
  y: number;
  z: number;
  feedRate: number;
  lineNumber: number;
  extrusion?: number;
  extrusionDelta?: number;
  isExtruding?: boolean;
  layerIndex?: number;
  spindleOn?: boolean;
};

export type MachineSimulation = {
  moves: SimulationMove[];
};

export type MachineModule = {
  id: MachineId;
  label: string;
  icon: string;
  modelPath: string;
  validateFile: (content: string) => ValidationResult;
  parse: (content: string) => { commands: MotionCommand[]; errors: SimulationError[] };
  simulate: (commands: MotionCommand[]) => MachineSimulation;
};

const TOKEN_REGEX = /([A-Z])([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g;
const PRINTER_M_CODES = new Set([82, 83, 84, 104, 106, 107, 109, 140, 190]);
const SPINDLE_M_CODES = new Set([3, 4, 5]);
const COOLANT_M_CODES = new Set([7, 8, 9]);
const DEMO_TOOLPATH_COMMANDS = new Set(["MOVE", "CUT", "ENGRAVE"]);

export type SimulationHeaderMetadata = {
  machine: string | null;
  format: string | null;
  mode: string | null;
  entries: Record<string, string>;
};

export type SimulationFormatAnalysis = {
  header: SimulationHeaderMetadata;
  commandWords: string[];
  hasDemoCommands: boolean;
  hasUnknownCommands: boolean;
  isLaserDemoToolpath: boolean;
};

export function createCompatibilityError(message = "This file is not compatible with the selected machine type."): SimulationError {
  return {
    line: 0,
    message,
  };
}

export function normalizeLine(line: string): string {
  return line.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim().toUpperCase();
}

export function tokenizeLine(line: string, lineNumber: number): TokenizedLine | SimulationError | null {
  const normalized = normalizeLine(line);
  if (!normalized) return null;

  const compact = normalized.replace(/\s+/g, "");
  const tokens: TokenizedLine["tokens"] = [];
  let malformed = false;
  let cursor = 0;

  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(compact)) !== null) {
    if (match.index !== cursor) {
      malformed = true;
      break;
    }
    tokens.push({ letter: match[1], rawValue: match[2] });
    cursor = TOKEN_REGEX.lastIndex;
  }

  if (malformed || cursor !== compact.length) {
    return {
      line: lineNumber,
      message: `Malformed token near "${compact.slice(cursor)}"`,
    };
  }

  if (tokens.length === 0) return null;

  return {
    lineNumber,
    raw: normalized,
    compact,
    tokens,
  };
}

export function parseIgnoredProgramLine(line: string): IgnoredLine | null {
  const normalized = normalizeLine(line);
  if (!normalized) return null;
  if (normalized === "%") return { kind: "percent" };

  const programHeaderMatch = normalized.match(/^O(\d+)$/);
  if (programHeaderMatch) {
    return {
      kind: "programHeader",
      programNumber: Number(programHeaderMatch[1]),
    };
  }

  return null;
}

export function collectMachineSignals(content: string): MachineSignals {
  const signals: MachineSignals = {
    hasExtrusionAxis: false,
    hasPrinterMCode: false,
    hasSpindleCommand: false,
    hasCoolantCommand: false,
    hasToolChange: false,
    hasArcMotion: false,
    hasNegativeZMotion: false,
    hasSpindleSpeed: false,
  };

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const tokenized = tokenizeLine(lines[index], index + 1);
    if (!tokenized || "message" in tokenized) continue;

    for (const token of tokenized.tokens) {
      const value = Number(token.rawValue);
      if (!Number.isFinite(value)) continue;

      if (token.letter === "E") signals.hasExtrusionAxis = true;
      if (token.letter === "T") signals.hasToolChange = true;
      if (token.letter === "S") signals.hasSpindleSpeed = true;
      if (token.letter === "Z" && value < 0) signals.hasNegativeZMotion = true;

      if (token.letter === "G") {
        const rounded = Math.trunc(value);
        if (rounded === 2 || rounded === 3) signals.hasArcMotion = true;
      }

      if (token.letter === "M") {
        const rounded = Math.trunc(value);
        if (PRINTER_M_CODES.has(rounded)) signals.hasPrinterMCode = true;
        if (SPINDLE_M_CODES.has(rounded)) signals.hasSpindleCommand = true;
        if (COOLANT_M_CODES.has(rounded)) signals.hasCoolantCommand = true;
      }
    }
  }

  return signals;
}

export function parseSimulationHeader(content: string): SimulationHeaderMetadata {
  const entries: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*#\s*([A-Z_]+)\s*:\s*(.+?)\s*$/i);
    if (!match) continue;
    entries[match[1].trim().toUpperCase()] = match[2].trim().toUpperCase();
  }

  return {
    machine: entries.MACHINE ?? null,
    format: entries.FORMAT ?? null,
    mode: entries.MODE ?? null,
    entries,
  };
}

export function analyzeSimulationFormat(content: string): SimulationFormatAnalysis {
  const header = parseSimulationHeader(content);
  const commandWords: string[] = [];
  let hasDemoCommands = false;
  let hasUnknownCommands = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";") || trimmed.startsWith("(")) continue;

    const ignored = parseIgnoredProgramLine(trimmed);
    if (ignored) continue;

    const firstToken = trimmed.split(/\s+/, 1)[0]?.toUpperCase() ?? "";
    if (!firstToken) continue;

    commandWords.push(firstToken);

    if (DEMO_TOOLPATH_COMMANDS.has(firstToken)) {
      hasDemoCommands = true;
      continue;
    }

    if (/^[GMTXYZFIJKRSEO][+\-]?(?:\d+(?:\.\d*)?|\.\d+)?$/i.test(firstToken)) {
      continue;
    }

    hasUnknownCommands = true;
  }

  return {
    header,
    commandWords,
    hasDemoCommands,
    hasUnknownCommands,
    isLaserDemoToolpath:
      header.machine === "LASER" &&
      header.format === "DEMO_TOOLPATH" &&
      hasDemoCommands &&
      commandWords.every((command) => DEMO_TOOLPATH_COMMANDS.has(command)),
  };
}

export function hasInvalidMoveData(moves: SimulationMove[]): boolean {
  return moves.some(
    (move) =>
      (move.type !== "rapid" && move.type !== "linear") ||
      !Number.isFinite(move.x) ||
      !Number.isFinite(move.y) ||
      !Number.isFinite(move.z) ||
      !Number.isFinite(move.feedRate),
  );
}

export function estimateTotalSeconds(moves: SimulationMove[]): number {
  if (moves.length === 0) return 0;

  let distance = 0;
  for (let index = 1; index < moves.length; index += 1) {
    const from = moves[index - 1];
    const to = moves[index];
    distance += Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2 + (to.z - from.z) ** 2);
  }

  return Math.round(distance / 40);
}

export function deriveLayerInfo(moves: SimulationMove[], currentIdx: number) {
  const layers = Array.from(
    new Set(
      moves
        .map((move) => move.layerIndex)
        .filter((layerIndex): layerIndex is number => Number.isFinite(layerIndex)),
    ),
  ).sort((a, b) => a - b);

  if (layers.length > 0) {
    const totalLayers = layers.length;
    const currentMove = moves[Math.min(currentIdx, Math.max(moves.length - 1, 0))];
    const currentLayer = currentMove?.layerIndex ?? layers[0];
    return { currentLayer: Math.max(1, currentLayer), totalLayers };
  }

  const printableMoves = moves.filter((move) => move.operation === "print");
  const source = printableMoves.length > 0 ? printableMoves : moves;
  if (source.length === 0) return { currentLayer: 0, totalLayers: 0 };

  const zLevels = Array.from(new Set(source.map((move) => Number(move.z.toFixed(3))))).sort((a, b) => a - b);
  const totalLayers = Math.max(1, zLevels.length);
  const currentMove = moves[Math.min(currentIdx, Math.max(moves.length - 1, 0))];
  const currentZ = currentMove?.z ?? 0;
  const currentLayer = Math.max(1, zLevels.findIndex((z) => z >= currentZ - 0.01) + 1);

  return { currentLayer, totalLayers };
}