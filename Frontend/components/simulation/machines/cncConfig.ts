export const CNC_MOVING_PARTS = {
  headGroup: [
    "CNC_Machine_with_Doors_mesh124",
    "CNC_Machine_with_Doors_mesh173",
    "Torus",
    "Laser_Beam",
  ],
  workspace: "CNC_WORKSPACE",
} as const;

export const CNC_HEAD_LOCAL_MOVEMENT = [
  {
    name: "CNC_Machine_with_Doors_mesh124",
    axis: "z",
    from: -0.09,
    to: 0,
  },
  {
    name: "CNC_Machine_with_Doors_mesh173",
    axis: "x",
    from: -0.09,
    to: 0,
  },
  {
    name: "Torus",
    axis: "y",
    from: 0.17,
    to: 0,
  },
  {
    name: "Laser_Beam",
    axis: "y",
    from: 0.17,
    to: 0,
  },
] as const;

export const CNC_BED_LOCAL_MOVEMENT = [
  {
    key: "bedLegs",
    name: "CNC_Machine_with_Doors_mesh16",
    axis: "x",
    from: -0.17,
    to: 0.17,
  },
  {
    key: "bed",
    name: "CNC_Machine_with_Doors_mesh105",
    axis: "y",
    from: -0.08,
    to: 0.08,
  },
  {
    key: "workspace",
    name: CNC_MOVING_PARTS.workspace,
    axis: "x",
    from: -0.024,
    to: 0.024,
  },
] as const;

export const CNC_FIXED_REFERENCE_PARTS = {
  backPanel: "CNC_Machine_with_Doors_mesh12",
  headVertical: "CNC_Machine_with_Doors_mesh139",
  topLimit: "CNC_Machine_with_Doors_mesh52",
  bottomLimit: "CNC_Machine_with_Doors_mesh57",
} as const;

export const CNC_AXIS_MAPPING = {
  head: {
    axis: "y",
    reference: CNC_FIXED_REFERENCE_PARTS.headVertical,
  },
} as const;

export const CNC_HEAD_VISIBLE_COLOR = 0xb8c0c8;
export const CNC_HEAD_VISIBLE_EMISSIVE = 0x000000;
export const CNC_HEAD_VISIBLE_METALNESS = 0.3;
export const CNC_HEAD_VISIBLE_ROUGHNESS = 0.6;

export const CNC_DEBUG_PART_CANDIDATES = {
  head: [
    "CNC_Machine_with_Doors_mesh124",
    "CNC_Machine_with_Doors_mesh173",
    "Torus",
    "Laser_Beam",
  ],
  gantry: [
    CNC_FIXED_REFERENCE_PARTS.backPanel,
    CNC_FIXED_REFERENCE_PARTS.headVertical,
    CNC_FIXED_REFERENCE_PARTS.topLimit,
    CNC_FIXED_REFERENCE_PARTS.bottomLimit,
  ],
  workspace: [
    CNC_MOVING_PARTS.workspace,
    "CNC_Machine_with_Doors_mesh105",
    "CNC_Machine_with_Doors_mesh112",
  ],
} as const;

export const CNC_SURFACE_PART = CNC_MOVING_PARTS.workspace;
