export {
  buildMachinePathAlignment,
  buildPrinterBedAlignedPathAlignment,
  computePrinterMotionWorldBounds,
  createPrinterKinematics,
  createPrinterSurfaceReference,
  findPrinterBedObject,
  stylePrinterBed,
  syncPrinterMechanics,
  tickPrinterBed,
} from "@/components/simulation/machines/printerKinematics";
export {
  getPrinterBeadSize,
} from "@/components/simulation/machines/printerVisuals";
import { PRINTER_BEAD_Y_OFFSET } from "@/components/simulation/machines/printerConfig";

export function getPrinterBeadYOffset(): number {
  return PRINTER_BEAD_Y_OFFSET;
}
