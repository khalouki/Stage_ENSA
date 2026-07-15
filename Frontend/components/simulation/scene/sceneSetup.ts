import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { COLOR_TOOL } from "@/components/simulation/scene/sceneConstants";

const EDITOR_BACKGROUND = 0xf3f4f6;
const EDITOR_GROUND = 0xeff1f4;
const EDITOR_GRID_MAJOR = 0xc9d0d8;
const EDITOR_GRID_MINOR = 0xdde2e8;
const MAX_RENDERER_PIXEL_RATIO = 1.75;
const SHADOW_MAP_SIZE = 1024;

export type SceneSetupResult = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  toolGroup: THREE.Group;
  toolLight: THREE.PointLight;
  resizeObserver: ResizeObserver;
};

export function createSimulationScene(
  container: HTMLDivElement,
): SceneSetupResult {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(EDITOR_BACKGROUND);
  scene.fog = new THREE.FogExp2(EDITOR_BACKGROUND, 0.00055);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(EDITOR_BACKGROUND);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_RENDERER_PIXEL_RATIO));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 5000);
  camera.position.set(120, 100, 160);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.enableRotate = true;
  controls.screenSpacePanning = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.minDistance = 10;
  controls.maxDistance = 800;
  controls.target.set(0, 0, 0);

  const ambient = new THREE.HemisphereLight(0xffffff, 0xdde3ea, 1.35);
  ambient.name = "hemisphereMain";
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.name = "dirMain";
  sun.position.set(70, 130, 95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 800;
  sun.shadow.camera.left = -200;
  sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const grid = new THREE.GridHelper(400, 40, EDITOR_GRID_MAJOR, EDITOR_GRID_MINOR);
  grid.name = "gridHelper";
  scene.add(grid);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({
      color: EDITOR_GROUND,
      roughness: 1,
      metalness: 0,
    }),
  );
  ground.name = "ground";
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  const axes = new THREE.AxesHelper(20);
  axes.position.set(-5, 0.2, -5);
  scene.add(axes);

  const toolGroup = new THREE.Group();
  toolGroup.name = "toolHead";
  toolGroup.visible = false;

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 10, 16),
    new THREE.MeshStandardMaterial({ color: 0x778899, metalness: 0.9, roughness: 0.15 }),
  );
  shaft.name = "toolShaft";
  shaft.userData.toolVisualRole = "printerGeneratedVisual";
  shaft.position.y = 5;
  shaft.castShadow = true;
  toolGroup.add(shaft);

  const bit = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 5, 16),
    new THREE.MeshStandardMaterial({
      color: COLOR_TOOL,
      emissive: COLOR_TOOL,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.1,
    }),
  );
  bit.name = "toolBit";
  bit.userData.toolVisualRole = "printerGeneratedVisual";
  bit.rotation.x = Math.PI;
  bit.position.y = -1;
  bit.castShadow = true;
  toolGroup.add(bit);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.4, 8, 32),
    new THREE.MeshBasicMaterial({ color: COLOR_TOOL, transparent: true, opacity: 0.5 }),
  );
  ring.name = "toolRing";
  ring.userData.toolVisualRole = "printerGeneratedVisual";
  ring.position.y = -1.5;
  toolGroup.add(ring);

  const toolLight = new THREE.PointLight(COLOR_TOOL, 0, 60, 2);
  toolLight.name = "toolLight";
  toolLight.userData.toolVisualRole = "toolLight";
  toolLight.position.y = 0.2;
  toolGroup.add(toolLight);

  const cncFallbackMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 18, 18),
    new THREE.MeshBasicMaterial({
      color: 0x39d0ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  cncFallbackMarker.name = "cncFallbackMarker";
  cncFallbackMarker.userData.toolVisualRole = "cncFallbackMarker";
  cncFallbackMarker.visible = false;
  toolGroup.add(cncFallbackMarker);

  scene.add(toolGroup);

  const resizeObserver = new ResizeObserver(() => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_RENDERER_PIXEL_RATIO));
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  resizeObserver.observe(container);

  return {
    scene,
    renderer,
    camera,
    controls,
    toolGroup,
    toolLight,
    resizeObserver,
  };
}
