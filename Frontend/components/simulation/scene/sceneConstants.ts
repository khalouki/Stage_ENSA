import { MachineId } from "@/lib/simulation";
export {
  PRINTER_BED_PART,
  PRINTER_BED_PARTS,
  PRINTER_BEAD_Y_OFFSET,
  PRINTER_DEBUG_VISIBLE_OFFSET,
  PRINTER_GRID_PART,
  PRINTER_HEAD_X_MAX,
  PRINTER_HEAD_X_MIN,
  PRINTER_HEAD_PARTS,
  PRINTER_MIN_Z_SCALE,
  PRINTER_NOZZLE_MESH_NAME,
  PRINTER_NOZZLE_OBJECT_NAME,
  PRINTER_Z_MAX,
  PRINTER_Z_MIN,
  PRINTER_Z_GUIDE_PARTS,
  PRINTER_Z_PARTS,
  type PositionedPrinterPart,
  type PrintChunk,
  type PrintSegmentDescriptor,
  type PrinterKinematics,
} from "@/components/simulation/machines/printerConfig";

export const COLOR_RAPID = 0x4fc3f7;
export const COLOR_RAPID_DONE = 0x0288d1;

export const COLOR_CUT = 0x00e676;
export const COLOR_DONE = 0x00b248;

export const COLOR_PRINT_ACTIVE = 0xff5a1f;
export const COLOR_PRINT_DONE = 0xbf360c;

export const COLOR_GHOST = 0x90caf9;

export const COLOR_TOOL = 0xffffff;
export const COLOR_WORKPIECE = 0xffd54f;

export const SURFACE_CLEARANCE_CNC = 0.2;
export const SURFACE_CLEARANCE_PRINTER = 0.03;
export const MAX_STORED_SEGS = 6000;

export const MODEL_TARGET_MAX_DIM: Record<MachineId | "generic", number> = {
  printer3d: 140,
  cnc: 180,
  generic: 160,
};
