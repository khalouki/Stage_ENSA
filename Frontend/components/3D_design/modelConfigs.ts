import * as THREE from "three";

export type ModelRenderContext = "lab" | "simulation";

type ModelVisibilityConfig = {
  hiddenNodeNames?: string[];
  scaleMultipliersByContext?: Partial<Record<ModelRenderContext, number>>;
};

const modelVisibilityConfigs: Record<string, ModelVisibilityConfig> = {
  "/models/CNC.glb": {
    scaleMultipliersByContext: {
      lab: 1.15,
    },
  },
};

export function applyModelVisibilityConfig(scene: THREE.Object3D, modelPath: string) {
  const config = modelVisibilityConfigs[modelPath];

  if (!config?.hiddenNodeNames?.length) {
    return;
  }

  const hiddenNodeNames = new Set(config.hiddenNodeNames);
  const foundNodeNames = new Set<string>();

  scene.traverse((child) => {
    if (!hiddenNodeNames.has(child.name)) {
      return;
    }

    child.visible = false;
    foundNodeNames.add(child.name);
    console.log(`[MachineModel] Hiding node "${child.name}" for model "${modelPath}"`);
  });

  hiddenNodeNames.forEach((nodeName) => {
    if (foundNodeNames.has(nodeName)) {
      return;
    }

    console.warn(`[MachineModel] Configured hidden node "${nodeName}" was not found in model "${modelPath}"`);
  });
}

export function getModelScaleMultiplier(modelPath: string, context: ModelRenderContext): number {
  return modelVisibilityConfigs[modelPath]?.scaleMultipliersByContext?.[context] ?? 1;
}
