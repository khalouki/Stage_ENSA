import * as THREE from "three";

export const PRINTER_MIN_Z_SCALE = 1.25;

// PRINTER_HEAD_PARTS move left/right on local X and follow G-code Z on local Y.
export const PRINTER_HEAD_X_MIN = -0.07;
export const PRINTER_HEAD_X_MAX = 0.07;

// PRINTER_Z_PARTS move vertically using the Blender-measured model Z range.
// In the imported Three.js scene this is applied to the parts' local Y axis.
export const PRINTER_Z_MIN = -1.11;
export const PRINTER_Z_MAX = 0;

export const PRINTER_HEAD_PARTS = [
  "Cube.005", "Cube.007", "Cube.017",
  "Cube.020", "Cube.022", "Cube.024",
  "Cylinder.018", "Cylinder.032", "Cylinder.033",
  "Cylinder.034", "Cylinder.035", "Sphere.009",
] as const;

export const PRINTER_Z_PARTS = [
  "Cylinder.026", "Cylinder.025", "Cylinder.023",
  "Cylinder.024", "Cylinder.029", "Cylinder.031",
  "Sphere.002", "Sphere.004", "Cube.009",
  "Cube.010", "Cube.012", "Cube.014",
  "Cube.015", "Cube.016","Cube.020",
] as const;

export const PRINTER_BED_PARTS = [
  "PRINT_BED_ROOT",
] as const;

export const PRINTER_BED_ROOT_PART = "PRINT_BED_ROOT";
export const PRINTER_PRINT_SURFACE_PART = "PRINT_SURFACE";
export const PRINTER_BED_PART = PRINTER_PRINT_SURFACE_PART;
export const PRINTER_GRID_PART = "Grid";
export const PRINTER_Z_GUIDE_PARTS = ["Cylinder.023", "Cylinder.024"] as const;
export const PRINTER_NOZZLE_OBJECT_NAME = "Sphere.009";
export const PRINTER_NOZZLE_MESH_NAME = "Sphere.009_Material_0";
export const PRINTER_DEBUG_VISIBLE_OFFSET = 0;
export const PRINTER_BEAD_Y_OFFSET = 0.005;

export type PositionedPrinterPart = {
  name: string;
  object: THREE.Object3D;
  initialPosition: THREE.Vector3;
};

export type PrinterKinematics = {
  headParts: PositionedPrinterPart[];
  zParts: PositionedPrinterPart[];
  bedParts: PositionedPrinterPart[];
  bedAttachedParts: PositionedPrinterPart[];
  bedMesh: THREE.Mesh | null;
  nozzleObject: THREE.Object3D | null;
  bedBasePosition: THREE.Vector3;
  currentBedOffset: number;
  anchorWorld: THREE.Vector3;
  xLimits: {
    minLocalOffset: number;
    maxLocalOffset: number;
  };
  zLimits: {
    minLocalOffset: number;
    maxLocalOffset: number;
  };
  motionWorldBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  printLayerWorldBounds: {
    minZ: number;
    maxZ: number;
  };
  modelWorldScaleY: number;
};

export type PrintSegmentDescriptor = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  width: number;
  height: number;
  moveIndex: number;
};

export type PrintChunk = {
  mesh: THREE.InstancedMesh;
  capacity: number;
};

export type PrintedObjectReveal = {
  group: THREE.Group;
  meshes: THREE.Mesh[];
  clippingPlane: THREE.Plane;
  minY: number;
  maxY: number;
};
