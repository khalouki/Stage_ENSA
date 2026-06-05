import * as THREE from "three";

const LASER_BEAM_NAME = "Laser_Beam";
const LASER_COLOR = 0x00ccff;
const LASER_BASE_OPACITY = 0.75;

export type CncLaserEffect = {
  laserBeam: THREE.Mesh | null;
  pulseTime: number;
  baseScale: THREE.Vector3;
  dispose: () => void;
};

function applyLaserMaterial(mesh: THREE.Mesh) {
  const material = new THREE.MeshStandardMaterial({
    color: LASER_COLOR,
    emissive: LASER_COLOR,
    emissiveIntensity: 1.6,
    transparent: true,
    opacity: LASER_BASE_OPACITY,
    roughness: 0.18,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  mesh.material = material;
}

export function createCncLaserEffect(): CncLaserEffect {
  return {
    laserBeam: null,
    pulseTime: 0,
    baseScale: new THREE.Vector3(1, 1, 1),
    dispose: () => {},
  };
}

export function attachCncLaserBeamMesh(effect: CncLaserEffect | null, model: THREE.Object3D) {
  if (!effect) return;

  const laserBeam = model.getObjectByName(LASER_BEAM_NAME);
  if (!(laserBeam instanceof THREE.Mesh)) {
    effect.laserBeam = null;
    return;
  }

  laserBeam.visible = false;
  laserBeam.renderOrder = 20;
  applyLaserMaterial(laserBeam);

  effect.laserBeam = laserBeam;
  effect.baseScale.copy(laserBeam.scale);
}

export function updateCncLaserEffect(
  effect: CncLaserEffect | null,
  cutting: boolean,
  dt: number,
) {
  if (!effect?.laserBeam) return;

  const laserBeam = effect.laserBeam;
  laserBeam.visible = cutting;
  if (!cutting) {
    laserBeam.scale.copy(effect.baseScale);
    return;
  }

  effect.pulseTime += dt;
  const pulse = 0.86 + Math.sin(effect.pulseTime * 44) * 0.08 + Math.sin(effect.pulseTime * 97) * 0.04;
  const material = laserBeam.material as THREE.MeshStandardMaterial;
  material.opacity = LASER_BASE_OPACITY + pulse * 0.08;
  material.emissiveIntensity = 1.35 + pulse * 0.35;

  laserBeam.scale.copy(effect.baseScale);
  laserBeam.scale.y = effect.baseScale.y * (0.96 + pulse * 0.08);
}
