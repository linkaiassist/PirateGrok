import * as THREE from "three";
import { AudioBus } from "./audio";
import {
  ANCHOR,
  CELL,
  CHART,
  CRATES,
  CUTLASS_SPAWN,
  EXIT,
  FLASK,
  FLINTLOCK_SPAWN,
  HEIGHT,
  PEDESTALS,
  PILLARS,
  PLAQUE,
  SAILOR,
  SEAM,
  SPAWN,
  TIDE_ORDER,
  TORCHES,
  assertLevel,
  cellBlocks,
  cellCenter,
  createLevel,
  holdAllows,
  inChapel,
  inHold,
  type Blocker,
} from "./map";
import { buildMapMesh, disposeObject } from "./mesh";
import { makeTextures, type TexSet } from "./textures";
import { LOOK_RAD, type AttackKind, type Bridge, type LookStep, type Mode, type Snapshot } from "./types";

const QUICK = { wind: 0.14, active: 0.12, rec: 0.28, dmg: 16, range: 2.2, arc: Math.cos(0.92) };
const HEAVY = { wind: 0.5, active: 0.16, rec: 0.4, dmg: 34, range: 2.5, arc: Math.cos(1.05) };
const HP_MAX = 100;
const CUTLASS_HP = 90;
const FLINT_HP = 44;
const CUTLASS_WIND = 0.7;
const CUTLASS_RECOVER = 0.95;
const FLINT_WIND = 0.9;
const FLINT_RECOVER = 1.35;
const GLANCE = 6;

type Kind = "cutlass" | "flintlock";
type AiMode = "idle" | "chase" | "telegraph" | "recover" | "stagger" | "dead";

type Enemy = {
  kind: Kind;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  max: number;
  mode: AiMode;
  t: number;
  cooldown: number;
  staggerDur: number;
  flash: number;
  aware: boolean;
  homeX: number;
  homeZ: number;
  sprite: THREE.Sprite;
  mark: THREE.Sprite;
  bar: THREE.Sprite;
  barCanvas: HTMLCanvasElement;
  barTex: THREE.CanvasTexture;
  shownHp: number;
  sheets: { idle: THREE.Texture; attack: THREE.Texture; death: THREE.Texture };
  sheet: THREE.Texture;
};

type Gate = {
  id: Blocker["id"];
  mesh: THREE.Group;
  anim: number;
  opening: boolean;
};

type Aabb = { minX: number; maxX: number; minZ: number; maxZ: number };

type Attack = { kind: AttackKind | null; t: number; swung: boolean };

export type GameOptions = {
  canvas: HTMLCanvasElement;
  hurt: HTMLElement;
  cross: HTMLElement;
  root: HTMLElement;
  bridge: Bridge;
  onSnapshot: (snap: Snapshot) => void;
  onReady: (error?: string) => void;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getPitch: () => number;
      getSpeed: () => number;
      getPos: () => { x: number; z: number };
      setKeys: (codes: string[]) => void;
      setYaw: (yaw: number) => void;
      teleport: (x: number, z: number) => void;
    };
    __ashwake?: {
      teleport: (x: number, z: number) => void;
      enemies: () => { kind: Kind; hp: number; mode: AiMode; x: number; z: number }[];
      flags: () => {
        hp: number;
        hasKey: boolean;
        puzzle: boolean;
        secret: boolean;
        chart: boolean;
        sailor: boolean;
        sailorStep: number;
        hold: boolean;
      };
      pokeLook: (dx: number, dy: number) => void;
      setLook: (h: LookStep, v: LookStep) => void;
      use: () => void;
      strike: (kind: AttackKind) => void;
      block: (on: boolean) => void;
    };
  }
}

function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        resolve(tex);
      },
      undefined,
      () => reject(new Error(`Missing sprite ${url}`)),
    );
  });
}

function prepSheet(tex: THREE.Texture) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(0.5, 0.5);
  tex.offset.set(0, 0.5);
  return tex;
}

function setFrame(tex: THREE.Texture, frame: number) {
  const col = frame % 2;
  const row = Math.floor(frame / 2);
  tex.offset.set(col * 0.5, (1 - row) * 0.5);
}

function angDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function circleAabb(x: number, z: number, rad: number, box: Aabb) {
  const cx = Math.max(box.minX, Math.min(x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < rad * rad;
}

function makeDoor(span: number, axis: "x" | "z") {
  const group = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0xe0b070 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x2c3138 });
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(axis === "x" ? span * 0.94 : 0.18, 2.25, axis === "z" ? span * 0.94 : 0.18),
    wood,
  );
  slab.position.y = 1.12;
  group.add(slab);
  for (const y of [0.55, 1.15, 1.75]) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(axis === "x" ? span * 0.98 : 0.24, 0.1, axis === "z" ? span * 0.98 : 0.24),
      iron,
    );
    band.position.y = y;
    group.add(band);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 5, 8), iron);
  ring.position.set(axis === "z" ? 0.14 : 0, 1.15, axis === "x" ? 0.14 : 0);
  group.add(ring);
  return group;
}

function makeBarSprite() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 8;
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(0.85, 0.11, 1);
  sprite.center.set(0.5, 0);
  sprite.visible = false;
  return { canvas, tex, sprite };
}

function drawBar(enemy: Enemy) {
  const ctx = enemy.barCanvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#140e0c";
  ctx.fillRect(0, 0, 64, 8);
  ctx.fillStyle = "#c4553a";
  ctx.fillRect(1, 1, Math.max(0, (62 * enemy.hp) / enemy.max), 6);
  enemy.barTex.needsUpdate = true;
  enemy.shownHp = enemy.hp;
}

export function startGame(opts: GameOptions): () => void {
  assertLevel();
  const { canvas, hurt, cross, root, bridge, onSnapshot, onReady } = opts;
  void cross;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x4a3c32, 1);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x4a3c32);
  scene.fog = new THREE.FogExp2(0x4a3c32, 0.028);
  scene.add(new THREE.AmbientLight(0xfff4e6, 0.86));
  scene.add(new THREE.HemisphereLight(0xffe7c8, 0x8a6244, 0.5));

  const yawPivot = new THREE.Group();
  const pitchPivot = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(78, 1, 0.08, 80);
  pitchPivot.add(camera);
  yawPivot.add(pitchPivot);
  scene.add(yawPivot);
  const fill = new THREE.PointLight(0xfff1e0, 0.4, 9, 2);
  fill.position.set(0, 0.05, -0.2);
  camera.add(fill);

  const weaponScene = new THREE.Scene();
  weaponScene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const weaponKey = new THREE.DirectionalLight(0xfff0dd, 1.15);
  weaponKey.position.set(-0.4, 1.2, 0.6);
  weaponScene.add(weaponKey);
  const weaponCamera = new THREE.PerspectiveCamera(78, 1, 0.05, 10);
  const weapon = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0xb7b1a6 });
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0xe7e1d4 });
  const copperMat = new THREE.MeshLambertMaterial({ color: 0x6e8c74 });
  const wrapMat = new THREE.MeshLambertMaterial({ color: 0x6a3b28 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.1, 0.56), steel);
  blade.position.set(0, 0.06, -0.32);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.115, 0.48), edgeMat);
  edge.position.set(0.02, 0.06, -0.3);
  const guardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), copperMat);
  guardMesh.position.set(0, 0.02, -0.02);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.042, 0.18), wrapMat);
  grip.position.set(0, -0.01, 0.1);
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), copperMat);
  pommel.position.set(0, -0.01, 0.2);
  weapon.add(blade, edge, guardMesh, grip, pommel);
  weapon.position.set(0.32, -0.3, -0.5);
  weapon.rotation.set(0.48, 0.12, 0.1);
  weaponScene.add(weapon);

  const tex = makeTextures();
  const bang = document.createElement("canvas");
  bang.width = 32;
  bang.height = 32;
  const bangCtx = bang.getContext("2d");
  if (!bangCtx) throw new Error("Canvas 2D unavailable");
  bangCtx.fillStyle = "#140e0c";
  bangCtx.fillRect(10, 0, 12, 32);
  bangCtx.fillStyle = "#ffd78a";
  bangCtx.fillRect(13, 2, 6, 18);
  bangCtx.fillRect(13, 24, 6, 6);
  const bangTex = new THREE.CanvasTexture(bang);
  bangTex.magFilter = THREE.NearestFilter;
  bangTex.minFilter = THREE.NearestFilter;
  bangTex.colorSpace = THREE.SRGBColorSpace;
  let grid: string[][] = [];
  let blockers: Blocker[] = [];
  let mapRoot = new THREE.Group();
  scene.add(mapRoot);

  const props: Aabb[] = [];
  const woodMat = new THREE.MeshLambertMaterial({ map: tex.wood });
  const stoneMat = new THREE.MeshLambertMaterial({ map: tex.stone });
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x6a6258 });
  for (const crate of CRATES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.92, 0.92), woodMat);
    mesh.position.set(crate.x, 0.46, crate.z);
    mesh.rotation.y = 0.2;
    scene.add(mesh);
    props.push({ minX: crate.x - 0.48, maxX: crate.x + 0.48, minZ: crate.z - 0.48, maxZ: crate.z + 0.48 });
  }
  const lane = { x: 12.05, z: 22.85 };
  const pile = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.15, 0.9), woodMat);
  pile.position.set(lane.x, 0.58, lane.z);
  pile.rotation.y = 0.08;
  scene.add(pile);
  props.push({ minX: lane.x - 0.78, maxX: lane.x + 0.78, minZ: lane.z - 0.48, maxZ: lane.z + 0.48 });
  const ropeMat = new THREE.MeshLambertMaterial({ color: 0xd2b07a });
  const beamMat = new THREE.MeshLambertMaterial({ color: 0x6b442c });
  const clothMat = new THREE.MeshLambertMaterial({ color: 0xc4553a });
  for (const pillar of PILLARS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, HEIGHT, 0.55), woodMat);
    mesh.position.set(pillar.x, HEIGHT / 2, pillar.z);
    scene.add(mesh);
    props.push({ minX: pillar.x - 0.32, maxX: pillar.x + 0.32, minZ: pillar.z - 0.32, maxZ: pillar.z + 0.32 });
  }
  const addBarrel = (x: number, z: number, tip = 0) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 8), woodMat);
    group.add(body);
    for (const y of [-0.22, 0.18]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.028, 4, 8), metalMat);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = y;
      group.add(hoop);
    }
    group.position.set(x, tip ? 0.28 : 0.36, z);
    group.rotation.z = tip;
    scene.add(group);
    if (!tip) props.push({ minX: x - 0.36, maxX: x + 0.36, minZ: z - 0.36, maxZ: z + 0.36 });
  };
  for (const spot of [
    cellCenter(1, 20),
    cellCenter(2, 20),
    cellCenter(1, 7),
    cellCenter(12, 7),
    cellCenter(21, 8),
    cellCenter(12, 3),
  ]) {
    addBarrel(spot.x, spot.z);
  }
  addBarrel(18.4, cellCenter(9, 18).z, 1.15);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.35), clothMat);
  cloth.position.set(17.6, 0.04, cellCenter(8, 18).z);
  cloth.rotation.y = 0.4;
  scene.add(cloth);
  const addBeam = (x: number, z: number, len: number, alongX: boolean) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.22, 0.2, alongX ? 0.22 : len), beamMat);
    mesh.position.set(x, HEIGHT - 0.18, z);
    scene.add(mesh);
  };
  addBeam(10, cellCenter(5, 18).z, 14, true);
  addBeam(10, cellCenter(5, 19).z, 14, true);
  addBeam(7, cellCenter(6, 9).z, 10, true);
  addBeam(cellCenter(19, 10).x, cellCenter(19, 10).z, 8, false);
  addBeam(cellCenter(8, 2).x, cellCenter(8, 2).z, 10, true);
  const addCoil = (x: number, z: number) => {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 10), ropeMat);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(x, 0.08, z);
    scene.add(coil);
  };
  addCoil(cellCenter(8, 20).x, cellCenter(8, 20).z);
  addCoil(cellCenter(3, 12).x, cellCenter(3, 12).z);
  const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 5), ropeMat);
  hang.position.set(cellCenter(3, 18).x, 2.05, cellCenter(3, 18).z);
  scene.add(hang);
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.055, 6, 12), woodMat);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6), metalMat);
  hub.rotation.x = Math.PI / 2;
  wheel.add(rim, hub);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.92, 0.04), woodMat);
    spoke.rotation.z = (i / 6) * Math.PI;
    wheel.add(spoke);
  }
  wheel.position.set(cellCenter(8, 16).x, 1.45, 17 * CELL + 0.14);
  scene.add(wheel);
  const peg = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.7, 0.14),
    new THREE.MeshLambertMaterial({ color: 0xe2a04a, emissive: 0xe2a04a, emissiveIntensity: 0.45 }),
  );
  peg.position.set(SEAM.x + 0.16, 1.25, SEAM.z);
  scene.add(peg);
  const anchor = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.07, 6, 8), metalMat);
  ring.rotation.x = Math.PI / 2;
  const shank = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), metalMat);
  shank.position.y = 0.15;
  anchor.add(ring, shank);
  anchor.position.set(ANCHOR.x, 0.42, ANCHOR.z);
  scene.add(anchor);
  props.push({ minX: ANCHOR.x - 0.42, maxX: ANCHOR.x + 0.42, minZ: ANCHOR.z - 0.42, maxZ: ANCHOR.z + 0.42 });

  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.15, 0.08),
    new THREE.MeshBasicMaterial({ map: tex.notice }),
  );
  plaque.position.set(PLAQUE.x, 1.2, PLAQUE.z);
  scene.add(plaque);

  const chartStand = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.7), woodMat);
  chartStand.position.set(CHART.x, 0.38, CHART.z);
  const chartSheet = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.55),
    new THREE.MeshBasicMaterial({ map: tex.chart }),
  );
  chartSheet.rotation.x = -Math.PI / 2;
  chartSheet.position.set(CHART.x, 0.78, CHART.z);
  scene.add(chartStand, chartSheet);

  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.42), stoneMat);
    step.position.set(EXIT.x, 0.12 + i * 0.18, EXIT.z + 0.62 - i * 0.28);
    scene.add(step);
  }
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.08, 0.4),
    new THREE.MeshLambertMaterial({ color: 0xe2a04a, emissive: 0xe2a04a, emissiveIntensity: 0.35 }),
  );
  hatch.position.set(EXIT.x, 0.86, EXIT.z - 0.15);
  scene.add(hatch);

  const mural = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 2.35), new THREE.MeshBasicMaterial({ map: tex.mural }));
  mural.position.set(23 * CELL - 0.08, 1.4, cellCenter(22, 10).z);
  mural.rotation.y = -Math.PI / 2;
  scene.add(mural);

  const flask = new THREE.Group();
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.28, 6), new THREE.MeshLambertMaterial({ color: 0x6ea67a }));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 6), copperMat);
  neck.position.y = 0.18;
  flask.add(bottle, neck);
  flask.position.set(FLASK.x, 0.2, FLASK.z);
  flask.visible = false;
  scene.add(flask);

  const lights: THREE.PointLight[] = [];
  TORCHES.forEach((torch, index) => {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), metalMat);
    hook.position.set(torch.x, 2.05, torch.z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), metalMat);
    frame.position.set(torch.x, 1.72, torch.z);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.18, 0.14),
      new THREE.MeshLambertMaterial({ color: 0xffd38a, emissive: 0xff9a3c, emissiveIntensity: 0.95 }),
    );
    glass.position.set(torch.x, 1.72, torch.z);
    const flame = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex.flame, transparent: true, depthWrite: false, color: 0xffd7a0 }),
    );
    flame.position.set(torch.x, 1.95, torch.z);
    flame.scale.set(0.22, 0.32, 1);
    scene.add(hook, frame, glass, flame);
    const light = new THREE.PointLight(0xffc48a, 3.4, 14, 1.5);
    light.position.set(torch.x, 1.75, torch.z);
    scene.add(light);
    lights.push(light);
    void index;
  });

  const pedestalMeshes: { id: (typeof TIDE_ORDER)[number]; mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial }[] = [];
  for (const ped of PEDESTALS) {
    const color = ped.id === "flood" ? 0xe2a04a : ped.id === "ebb" ? 0x6d8f80 : 0xd5c4a8;
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.05 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.85, 6), stoneMat);
    base.position.set(ped.x, 0.42, ped.z);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 6), mat);
    top.position.set(ped.x, 0.88, ped.z);
    const iconMap = ped.id === "flood" ? tex.flood : ped.id === "ebb" ? tex.ebb : tex.slack;
    const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: iconMap }));
    icon.rotation.x = -Math.PI / 2;
    icon.position.set(ped.x, 0.94, ped.z);
    scene.add(base, top, icon);
    pedestalMeshes.push({ id: ped.id, mesh: top, mat });
  }

  const mainDoor = { x: 6 * CELL, z: 5.5 * CELL };
  const sideDoor = cellCenter(18, 5);
  const loopDoor = { x: 10.5 * CELL, z: 16 * CELL };
  const gates: Gate[] = [];

  function placeGate(id: Blocker["id"], x: number, z: number, span: number, axis: "x" | "z") {
    const mesh = makeDoor(span, axis);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    gates.push({ id, mesh, anim: 0, opening: false });
  }
  placeGate("vaultMain", mainDoor.x, mainDoor.z, 3.6, "x");
  placeGate("vaultSide", sideDoor.x, sideDoor.z, 1.7, "x");
  placeGate("returnLoop", loopDoor.x, loopDoor.z, 3.6, "z");

  const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xe2a04a });
  const sparks = Array.from({ length: 20 }, () => {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0, vx: 0, vy: 0, vz: 0 };
  });

  const audio = new AudioBus();
  const keys = new Set<string>();
  let forced: Set<string> | null = null;
  let holdQuick = false;
  let holdHeavy = false;
  let mouseX = 0;
  let mouseY = 0;
  let raf = 0;
  let running = true;
  let time = 0;
  let mode: Mode = "start";
  let ready = false;
  let x = SPAWN.x;
  let z = SPAWN.z;
  let yaw = SPAWN.yaw;
  let pitch = 0;
  let vx = 0;
  let vz = 0;
  let hp = HP_MAX;
  let iframes = 0;
  let shake = 0;
  let hurtAmt = 0;
  let bob = 0;
  let stepDist = 0;
  let attack: Attack = { kind: null, t: 0, swung: false };
  let blockWas = false;
  let blockStart = -10;
  let toast = "";
  let toastT = 0;
  let readPlaque = false;
  let heardSailor = false;
  let sailorStep = 0;
  let holdClear = false;
  let shouted = false;
  let reachedHold = false;
  let seenChapel = false;
  let inVault = false;
  let secretOpen = false;
  let flaskTaken = false;
  let tide = 0;
  const lit = new Set<string>();
  let puzzleSolved = false;
  let hasKey = false;
  let readChart = false;
  let shieldHint = false;
  let blockHint = false;
  let tradeHint = false;
  let counterHint = false;
  let aimHint = false;
  let coverHint = false;
  let objective = "Find the sailor in the stores.";
  let prompt: string | null = null;
  let enemyNear = false;
  let blocking = false;
  let lastSnap = "";
  let sailorSprite: THREE.Sprite | null = null;
  let sailorSheet: THREE.Texture | null = null;
  const enemies: Enemy[] = [];
  let interactLatch = false;

  function say(text: string) {
    toast = text;
    toastT = 2.5;
  }

  function objectiveText() {
    if (sailorStep === 0 && !reachedHold) return "Find the sailor in the stores.";
    if (sailorStep === 1 && !reachedHold) return "Hear the sailor out.";
    if (inVault && !readChart) return "Read the chart.";
    if (!holdClear && !seenChapel && !inVault) {
      if (!reachedHold) {
        return sailorStep >= 2
          ? "Clear the hold. The pistol's key opens the chart room."
          : "The hold is taken. Go carefully.";
      }
      return "Pistol in the back. Blade in front. Crates stop a ball.";
    }
    if (!hasKey && !puzzleSolved) {
      return seenChapel ? "Shrine order: flood, ebb, slack." : "Chart room is barred. Key, or the tide door.";
    }
    if (!readChart) {
      if (!hasKey && puzzleSolved) return "Tide door is open. Reach the chart.";
      const main = blockers.find((b) => b.id === "vaultMain");
      if (hasKey && main && !main.open) return "Unlock the chart-room door.";
      return "Read the chart.";
    }
    return "Climb the companionway.";
  }

  function refreshObjective() {
    objective = objectiveText();
  }

  function publish() {
    const snap: Snapshot = {
      mode,
      ready,
      hp,
      hpMax: HP_MAX,
      objective,
      prompt: mode === "play" ? prompt : null,
      toast: toastT > 0 ? toast : null,
      hasKey,
      tide,
      enemyNear,
      blocking,
    };
    const key = JSON.stringify(snap);
    if (key === lastSnap) return;
    lastSnap = key;
    onSnapshot(snap);
  }

  function setMode(next: Mode) {
    mode = next;
    if (next !== "play") {
      vx = 0;
      vz = 0;
      if (document.pointerLockElement) document.exitPointerLock();
    }
    root.classList.toggle("is-locked", document.pointerLockElement === canvas);
    publish();
  }

  function rebuildMap() {
    scene.remove(mapRoot);
    disposeObject(mapRoot);
    mapRoot = buildMapMesh(grid, tex);
    scene.add(mapRoot);
  }

  function loadLayout() {
    const level = createLevel();
    grid = level.grid;
    blockers = level.blockers;
    for (const gate of gates) {
      gate.opening = false;
      gate.anim = 0;
      gate.mesh.position.y = 0;
    }
    rebuildMap();
  }

  function solidAt(col: number, row: number) {
    return cellBlocks(grid, blockers, col, row);
  }

  function bodyBlocked(px: number, pz: number, rad: number, ignore?: Enemy) {
    const c0 = Math.floor((px - rad) / CELL);
    const c1 = Math.floor((px + rad) / CELL);
    const r0 = Math.floor((pz - rad) / CELL);
    const r1 = Math.floor((pz + rad) / CELL);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (!solidAt(col, row)) continue;
        if (circleAabb(px, pz, rad, { minX: col * CELL, maxX: (col + 1) * CELL, minZ: row * CELL, maxZ: (row + 1) * CELL })) {
          return true;
        }
      }
    }
    for (const prop of props) if (circleAabb(px, pz, rad, prop)) return true;
    for (const enemy of enemies) {
      if (enemy === ignore || enemy.mode === "dead") continue;
      const dx = px - enemy.x;
      const dz = pz - enemy.z;
      if (dx * dx + dz * dz < (rad + 0.42) * (rad + 0.42)) return true;
    }
    const sx = px - SAILOR.x;
    const sz = pz - SAILOR.z;
    if (sx * sx + sz * sz < (rad + 0.34) * (rad + 0.34)) return true;
    return false;
  }

  function playerBlocked(px: number, pz: number) {
    return bodyBlocked(px, pz, 0.32);
  }

  function burst(px: number, py: number, pz: number) {
    let left = 6;
    for (const spark of sparks) {
      if (spark.life > 0 || left <= 0) continue;
      spark.life = 0.28;
      spark.mesh.visible = true;
      spark.mesh.position.set(px, py, pz);
      spark.vx = (Math.random() - 0.5) * 2.4;
      spark.vy = 1.2 + Math.random();
      spark.vz = (Math.random() - 0.5) * 2.4;
      left--;
    }
  }

  function hurtPlayer(amount: number) {
    if (iframes > 0 || hp <= 0 || mode !== "play") return;
    hp = Math.max(0, hp - amount);
    iframes = 0.55;
    shake = Math.min(1, shake + 0.55);
    hurtAmt = 1;
    audio.pain();
    if (hp <= 0) setMode("dead");
  }

  function grantKey() {
    if (hasKey) return;
    hasKey = true;
    say("The flintlock drops a rusted key.");
    refreshObjective();
  }

  function openSecret() {
    if (secretOpen) return;
    secretOpen = true;
    for (const [col, row] of [
      [3, 14],
      [3, 15],
      [1, 14],
      [2, 14],
      [1, 15],
      [2, 15],
    ] as const) {
      grid[row]![col] = ".";
    }
    flask.visible = true;
    rebuildMap();
    audio.secret();
    say("A smuggler's niche. The vial names the tide.");
  }

  function drink() {
    if (flaskTaken) return;
    flaskTaken = true;
    flask.visible = false;
    hp = Math.min(HP_MAX, hp + 40);
    audio.heal();
    say("Salt vial. Flood, then ebb, then slack. Health returns.");
  }

  function readPlaqueNow() {
    readPlaque = true;
    audio.mark();
    say("The board says the shrine keeps flood, then ebb, then slack.");
    refreshObjective();
  }

  function talkSailor() {
    heardSailor = true;
    audio.mark();
    if (sailorStep <= 0) {
      sailorStep = 1;
      say("Sailor: They cut me and took the hold. Mutineers are tearing it apart for something the captain hid.");
    } else if (sailorStep === 1) {
      sailorStep = 2;
      say(
        holdClear
          ? "Sailor: You quieted them. The pistol's key opens the chart room. Go."
          : "Sailor: Chart room is past them. The pistol has the key. Crates stop a ball, not a blade.",
      );
    } else if (holdClear && sailorStep < 3) {
      sailorStep = 3;
      say("Sailor: I'll live. Get that chart before another of them does.");
    }
    refreshObjective();
  }

  function noteHold() {
    if (holdClear || enemies.length < 2) return;
    if (enemies.some((enemy) => enemy.mode !== "dead")) return;
    holdClear = true;
    say("From the stores: the hold is quiet. The chart room is next.");
    refreshObjective();
  }

  function activate(id: (typeof TIDE_ORDER)[number]) {
    if (puzzleSolved) return;
    if (id !== TIDE_ORDER[tide]) {
      tide = 0;
      lit.clear();
      audio.fail();
      say("Wrong mark. The pedestals go dark.");
      return;
    }
    tide += 1;
    lit.add(id);
    audio.mark();
    if (tide >= 3) {
      puzzleSolved = true;
      for (const gate of gates) {
        if (gate.id === "vaultSide" || gate.id === "returnLoop") gate.opening = true;
      }
      audio.solve();
      say("Tide doors open. A side door, and a shortcut behind you.");
      refreshObjective();
    }
  }

  function readChartNow() {
    if (readChart) return;
    readChart = true;
    refreshObjective();
    setMode("clue");
  }

  function climb() {
    if (!readChart) {
      say("The chart is still unread.");
      return;
    }
    audio.secret();
    setMode("won");
  }

  function useDoor(id: Blocker["id"]) {
    const blocker = blockers.find((b) => b.id === id);
    const gate = gates.find((g) => g.id === id);
    if (!blocker || !gate || blocker.open || gate.opening) return;
    if (id === "vaultMain") {
      if (!hasKey) {
        say("Barred. The pistol's key opens it.");
        audio.fail();
        return;
      }
      gate.opening = true;
      say("The rusted key turns.");
      refreshObjective();
      return;
    }
    say(id === "vaultSide" ? "Sealed. The shrine marks may open it." : "A shortcut, still barred.");
    audio.clink();
  }

  function nearestUse(): { label: string; act: () => void } | null {
    let best: { d: number; label: string; act: () => void } | null = null;
    const consider = (px: number, pz: number, range: number, label: string, act: () => void, ok = true) => {
      if (!ok) return;
      const dx = x - px;
      const dz = z - pz;
      const d = Math.hypot(dx, dz);
      if (d > range) return;
      if (!best || d < best.d) best = { d, label, act };
    };
    consider(SAILOR.x, SAILOR.z, 1.7, sailorStep === 1 ? "Listen" : "Speak to sailor", talkSailor, sailorStep < 2 || (holdClear && sailorStep < 3));
    consider(PLAQUE.x, PLAQUE.z, 1.8, "Read board", readPlaqueNow, !readPlaque);
    consider(SEAM.x, SEAM.z, 1.65, "Examine marked plank", openSecret, !secretOpen);
    consider(FLASK.x, FLASK.z, 1.5, "Take salt vial", drink, secretOpen && !flaskTaken);
    for (const ped of PEDESTALS) {
      const name = ped.id === "flood" ? "Flood mark" : ped.id === "ebb" ? "Ebb mark" : "Slack mark";
      consider(ped.x, ped.z, 1.6, `Activate ${name}`, () => activate(ped.id), !puzzleSolved);
    }
    consider(CHART.x, CHART.z, 1.8, "Read chart", readChartNow, !readChart);
    consider(EXIT.x, EXIT.z, 1.8, readChart ? "Climb companionway" : "Chart still unread", climb);
    const main = blockers.find((b) => b.id === "vaultMain");
    consider(
      mainDoor.x,
      mainDoor.z,
      2.15,
      hasKey ? "Unlock chart-room door" : "Chart-room door is barred",
      () => useDoor("vaultMain"),
      !!main && !main.open,
    );
    const side = blockers.find((b) => b.id === "vaultSide");
    consider(sideDoor.x, sideDoor.z, 2.1, "Tide door is sealed", () => useDoor("vaultSide"), !!side && !side.open);
    const loop = blockers.find((b) => b.id === "returnLoop");
    consider(loopDoor.x, loopDoor.z, 2.1, "Shortcut is barred", () => useDoor("returnLoop"), !!loop && !loop.open);
    return best;
  }

  function forwardOf(angle: number) {
    return { x: -Math.sin(angle), z: -Math.cos(angle) };
  }

  function inFront(ex: number, ez: number, angle: number, tx: number, tz: number, minDot: number) {
    const dx = tx - ex;
    const dz = tz - ez;
    const dist = Math.hypot(dx, dz) || 1;
    const f = forwardOf(angle);
    return (f.x * dx + f.z * dz) / dist > minDot;
  }

  function los(ax: number, az: number) {
    const dx = x - ax;
    const dz = z - az;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (CELL * 0.45)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const col = Math.floor((ax + dx * t) / CELL);
      const row = Math.floor((az + dz * t) / CELL);
      if (solidAt(col, row)) return false;
    }
    return true;
  }

  function face(enemy: Enemy, tx: number, tz: number, rate: number, dt: number) {
    const desired = Math.atan2(-(tx - enemy.x), -(tz - enemy.z));
    const delta = angDelta(enemy.yaw, desired);
    const max = rate * dt;
    enemy.yaw += Math.max(-max, Math.min(max, delta));
  }

  function moveEnemy(enemy: Enemy, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - enemy.x;
    const dz = tz - enemy.z;
    const dist = Math.hypot(dx, dz) || 1;
    const allow = holdAllows;
    const stepX = (dx / dist) * speed * dt;
    const stepZ = (dz / dist) * speed * dt;
    const nx = enemy.x + stepX;
    if (allow(nx, enemy.z) && !bodyBlocked(nx, enemy.z, 0.4, enemy) && Math.hypot(nx - x, enemy.z - z) > 0.78) {
      enemy.x = nx;
    }
    const nz = enemy.z + stepZ;
    if (allow(enemy.x, nz) && !bodyBlocked(enemy.x, nz, 0.4, enemy) && Math.hypot(enemy.x - x, nz - z) > 0.78) {
      enemy.z = nz;
    }
  }

  function killEnemy(enemy: Enemy) {
    enemy.mode = "dead";
    enemy.t = 0;
    enemy.hp = 0;
    audio.fall();
    if (enemy.kind === "flintlock") grantKey();
    noteHold();
  }

  function playerStrike(spec: typeof QUICK, kind: AttackKind) {
    const facing = forwardOf(yaw);
    let connected = false;
    for (const enemy of enemies) {
      if (enemy.mode === "dead") continue;
      const dx = enemy.x - x;
      const dz = enemy.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > spec.range || dist < 0.05) continue;
      if ((facing.x * dx + facing.z * dz) / dist < spec.arc) continue;
      const open = enemy.mode === "recover" || enemy.mode === "stagger";
      const aiming = enemy.kind === "flintlock" && enemy.mode === "telegraph";
      const reloading = enemy.kind === "flintlock" && enemy.mode === "recover";
      const glance = enemy.kind === "cutlass" && kind === "quick" && !open;
      const dmg = glance ? GLANCE : spec.dmg;
      enemy.hp -= dmg;
      enemy.flash = glance ? 0.08 : 0.16;
      burst(enemy.x, 1.2, enemy.z);
      shake = Math.min(1, shake + (kind === "heavy" ? 0.28 : 0.12));
      if (glance) audio.clink();
      else audio.hit();
      connected = true;
      if (enemy.hp <= 0) {
        killEnemy(enemy);
        continue;
      }
      if (glance) {
        if (!tradeHint) {
          tradeHint = true;
          say(enemy.mode === "telegraph" ? "He swings through it. Block, then hit." : "A light cut won't stop him. Block the swing.");
        }
        continue;
      }
      const interrupt = kind === "heavy" && enemy.mode === "telegraph";
      if (open || aiming || reloading || interrupt) {
        enemy.mode = "stagger";
        enemy.t = 0;
        enemy.staggerDur = kind === "heavy" || aiming ? 1.05 : 0.85;
        if (open && !counterHint) {
          counterHint = true;
          say("He's open. That one staggers him.");
        } else if (aiming && !aimHint) {
          aimHint = true;
          say("You caught him aiming. The shot's gone.");
        } else if (interrupt && !aimHint) {
          aimHint = true;
          say("The heavy stops his swing.");
        }
      }
    }
    if (!connected) audio.whiff();
  }

  function enemyStrike(enemy: Enemy, damage: number, reach: number) {
    const dist = Math.hypot(x - enemy.x, z - enemy.z);
    if (dist > reach || !inFront(enemy.x, enemy.z, enemy.yaw, x, z, 0.25)) return;
    const facingPlayer = inFront(x, z, yaw, enemy.x, enemy.z, 0.15);
    if (blocking && facingPlayer && enemy.kind === "cutlass") {
      const perfect = time - blockStart < 0.18;
      enemy.mode = "stagger";
      enemy.t = 0;
      enemy.staggerDur = perfect ? 1.55 : 1.4;
      enemy.flash = 0.2;
      burst(enemy.x, 1.35, enemy.z);
      if (perfect) {
        audio.perfect();
        say("Perfect block. He's open.");
      } else {
        audio.block();
        if (!blockHint) {
          blockHint = true;
          say("Blocked. Strike while he's open.");
        }
      }
      return;
    }
    hurtPlayer(damage);
  }

  function segHits(ax: number, az: number, bx: number, bz: number, box: Aabb) {
    let tmin = 0;
    let tmax = 1;
    const slabs: [number, number, number, number][] = [
      [bx - ax, box.minX, box.maxX, ax],
      [bz - az, box.minZ, box.maxZ, az],
    ];
    for (const [d, min, max, origin] of slabs) {
      if (Math.abs(d) < 1e-8) {
        if (origin < min || origin > max) return false;
        continue;
      }
      let t1 = (min - origin) / d;
      let t2 = (max - origin) / d;
      if (t1 > t2) {
        const swap = t1;
        t1 = t2;
        t2 = swap;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    return true;
  }

  function coverBetween(ax: number, az: number) {
    for (const box of props) {
      if (segHits(ax, az, x, z, box)) return true;
    }
    return false;
  }

  function fireShot(enemy: Enemy) {
    audio.shot();
    burst(enemy.x, 1.45, enemy.z);
    const dist = Math.hypot(x - enemy.x, z - enemy.z);
    const aimed = dist < 12 && inFront(enemy.x, enemy.z, enemy.yaw, x, z, 0.62);
    if (!aimed || !los(enemy.x, enemy.z)) {
      audio.whiff();
      return;
    }
    if (coverBetween(enemy.x, enemy.z)) {
      audio.whiff();
      if (!coverHint) {
        coverHint = true;
        say("The crate stops the ball.");
      }
      return;
    }
    if (blocking) {
      if (!shieldHint) {
        shieldHint = true;
        say("The ball punches past a blade. Use the crates.");
      }
    }
    burst(x, 1.2, z);
    hurtPlayer(18);
  }

  function updateEnemy(enemy: Enemy, dt: number) {
    if (enemy.mode === "dead") {
      enemy.t += dt;
      return;
    }
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.flash = Math.max(0, enemy.flash - dt);
    const engaged = inHold(x, z);
    if (enemy.mode === "stagger") {
      enemy.t += dt;
      if (enemy.t >= enemy.staggerDur) {
        enemy.mode = "chase";
        enemy.cooldown = 0.34;
      }
      return;
    }
    if (enemy.mode === "telegraph") {
      const wind = enemy.kind === "flintlock" ? FLINT_WIND : CUTLASS_WIND;
      face(enemy, x, z, enemy.kind === "flintlock" ? 0.85 : 2.1, dt);
      if (enemy.kind === "cutlass" && engaged) moveEnemy(enemy, x, z, 0.7, dt);
      enemy.t += dt;
      if (enemy.t >= wind) {
        enemy.mode = "recover";
        enemy.t = 0;
        if (!engaged) return;
        if (enemy.kind === "flintlock") fireShot(enemy);
        else enemyStrike(enemy, 28, 1.9);
      }
      return;
    }
    if (enemy.mode === "recover") {
      enemy.t += dt;
      const rec = enemy.kind === "flintlock" ? FLINT_RECOVER : CUTLASS_RECOVER;
      if (enemy.t >= rec) {
        enemy.mode = "chase";
        enemy.cooldown = enemy.kind === "flintlock" ? 0.45 : 0.35;
      }
      return;
    }
    if (!engaged) {
      enemy.mode = "idle";
      enemy.aware = false;
      face(enemy, enemy.homeX, enemy.homeZ, 1.6, dt);
      if (Math.hypot(enemy.homeX - enemy.x, enemy.homeZ - enemy.z) > 0.25) {
        moveEnemy(enemy, enemy.homeX, enemy.homeZ, 1.7, dt);
      }
      return;
    }
    enemy.aware = true;
    const dist = Math.hypot(x - enemy.x, z - enemy.z);
    const see = los(enemy.x, enemy.z);
    if (enemy.kind === "cutlass") {
      enemy.mode = "chase";
      face(enemy, x, z, 3.1, dt);
      if (dist < 1.7 && enemy.cooldown <= 0 && see) {
        enemy.mode = "telegraph";
        enemy.t = 0;
        audio.warn(false);
        return;
      }
      if (dist > 1.35) moveEnemy(enemy, x, z, 2.35, dt);
      return;
    }
    enemy.mode = "chase";
    face(enemy, x, z, 1.5, dt);
    const covered = !see || coverBetween(enemy.x, enemy.z);
    if (dist < 11 && dist > 3.2 && enemy.cooldown <= 0 && see && !covered) {
      enemy.mode = "telegraph";
      enemy.t = 0;
      audio.warn(true);
      return;
    }
    if (covered && dist > 3.2 && dist < 11) {
      const dx = x - enemy.x;
      const dz = z - enemy.z;
      const side = Math.sin(time * 1.4) >= 0 ? 1 : -1;
      moveEnemy(enemy, enemy.x - dz * side, enemy.z + dx * side, 1.55, dt);
      return;
    }
    if (dist < 4.4) {
      moveEnemy(enemy, enemy.x * 2 - x, enemy.z * 2 - z, 1.7, dt);
      return;
    }
    if (dist > 7.2) moveEnemy(enemy, x, z, 1.45, dt);
  }

  function syncSprite(enemy: Enemy) {
    let sheet = enemy.sheets.idle;
    let frame = Math.floor(time * 6) % 4;
    if (enemy.mode === "dead") {
      sheet = enemy.sheets.death;
      frame = Math.min(3, Math.floor(enemy.t * 6));
    } else if (enemy.mode === "telegraph") {
      sheet = enemy.sheets.attack;
      const wind = enemy.kind === "flintlock" ? FLINT_WIND : CUTLASS_WIND;
      frame = enemy.t < wind * 0.62 ? 0 : 1;
    } else if (enemy.mode === "recover") {
      sheet = enemy.sheets.attack;
      frame = enemy.kind === "flintlock" ? 3 : 2;
    } else if (enemy.mode === "stagger") {
      sheet = enemy.sheets.death;
      frame = 0;
    }
    const mat = enemy.sprite.material as THREE.SpriteMaterial;
    if (enemy.sheet !== sheet) {
      enemy.sheet = sheet;
      mat.map = sheet;
      mat.needsUpdate = true;
    }
    setFrame(sheet, frame);
    if (enemy.flash > 0) mat.color.setRGB(1.4, 1.2, 0.85);
    else if (enemy.mode === "telegraph") mat.color.setRGB(1.45, 0.72, 0.28);
    else if (enemy.mode === "recover") mat.color.setRGB(1.45, 1.25, 0.62);
    else mat.color.setRGB(1.12, 1.08, 1.02);
    enemy.sprite.position.set(enemy.x, 0, enemy.z);
    enemy.mark.visible = enemy.mode === "telegraph";
    enemy.mark.position.set(enemy.x, 2.34, enemy.z);
    const markMat = enemy.mark.material as THREE.SpriteMaterial;
    markMat.color.set(enemy.kind === "flintlock" ? 0xfff1c2 : 0xe2a04a);
    markMat.opacity = 0.55 + Math.sin(time * 16) * 0.45;
    if (enemy.aware || enemy.hp < enemy.max) {
      enemy.bar.visible = enemy.mode !== "dead";
      enemy.bar.position.set(enemy.x, 2.16, enemy.z);
      if (enemy.shownHp !== enemy.hp) drawBar(enemy);
    } else enemy.bar.visible = false;
  }

  function held(code: string) {
    if (forced) return forced.has(code);
    return keys.has(code);
  }

  function applyLook() {
    if (mode !== "play") {
      mouseX = 0;
      mouseY = 0;
      bridge.lookDx = 0;
      bridge.lookDy = 0;
      return;
    }
    const h = LOOK_RAD[bridge.lookH] ?? LOOK_RAD.med;
    const v = LOOK_RAD[bridge.lookV] ?? LOOK_RAD.med;
    const mouse = 0.00215 / LOOK_RAD.med;
    yaw -= mouseX * mouse * h + bridge.lookDx * h;
    pitch -= mouseY * mouse * v + bridge.lookDy * v;
    mouseX = 0;
    mouseY = 0;
    bridge.lookDx = 0;
    bridge.lookDy = 0;
    pitch = Math.max(-1.15, Math.min(1.15, pitch));
  }

  function update(dt: number) {
    if (bridge.pause && mode === "play") {
      bridge.pause = false;
      setMode("pause");
    } else bridge.pause = false;
    if (bridge.resume && mode === "pause") {
      bridge.resume = false;
      setMode("play");
    } else bridge.resume = false;
    if (bridge.dismissClue && mode === "clue") {
      bridge.dismissClue = false;
      setMode("play");
    } else bridge.dismissClue = false;
    if (bridge.restart) {
      bridge.restart = false;
      reset();
    }
    if (bridge.start && mode === "start" && ready) {
      bridge.start = false;
      setMode("play");
      audio.resume();
      if (!shouted) {
        shouted = true;
        say("From the stores: mutineers have the hold!");
      }
    } else if (mode !== "start") bridge.start = false;

    if (sailorSheet) setFrame(sailorSheet, Math.floor(time * 4) % 4);

    applyLook();
    toastT = Math.max(0, toastT - dt);
    hurtAmt = Math.max(0, hurtAmt - dt * 1.7);
    hurt.style.opacity = String(hurtAmt * 0.72);
    shake = Math.max(0, shake - dt * 1.7);

    for (const ped of pedestalMeshes) {
      ped.mat.emissiveIntensity = lit.has(ped.id) ? 1.15 : 0.4;
    }
    for (const gate of gates) {
      if (!gate.opening) continue;
      gate.anim = Math.min(1, gate.anim + dt / 0.75);
      gate.mesh.position.y = gate.anim * 2.85;
      if (gate.anim > 0.62) {
        const blocker = blockers.find((b) => b.id === gate.id);
        if (blocker && !blocker.open) {
          blocker.open = true;
          audio.gate();
          refreshObjective();
        }
      }
    }
    for (const spark of sparks) {
      if (spark.life <= 0) continue;
      spark.life -= dt;
      spark.vy -= dt * 5;
      spark.mesh.position.x += spark.vx * dt;
      spark.mesh.position.y += spark.vy * dt;
      spark.mesh.position.z += spark.vz * dt;
      if (spark.life <= 0) spark.mesh.visible = false;
    }
    lights.forEach((light, i) => {
      light.intensity = 3.1 + Math.sin(time * 7 + i) * 0.35;
    });

    if (mode !== "play") {
      blocking = false;
      enemyNear = false;
      prompt = null;
      for (const enemy of enemies) syncSprite(enemy);
      publish();
      return;
    }

    iframes = Math.max(0, iframes - dt);
    const wantHeavy = holdHeavy || held("Digit2") || bridge.queueAttack === "heavy";
    const wantQuick = holdQuick || held("Space") || held("Digit1") || bridge.queueAttack === "quick";
    bridge.queueAttack = null;
    blocking = (held("KeyF") || bridge.blocking) && !attack.kind;
    if (blocking && !blockWas) blockStart = time;
    blockWas = blocking;

    if (!attack.kind && (wantHeavy || wantQuick)) {
      attack = { kind: wantHeavy ? "heavy" : "quick", t: 0, swung: false };
    }
    if (attack.kind) {
      attack.t += dt;
      const spec = attack.kind === "heavy" ? HEAVY : QUICK;
      if (!attack.swung && attack.t >= spec.wind) {
        attack.swung = true;
        if (attack.kind === "heavy") audio.heavy();
        else audio.slash();
        playerStrike(spec, attack.kind);
      }
      if (attack.t >= spec.wind + spec.active + spec.rec) attack = { kind: null, t: 0, swung: false };
    }

    let ix = 0;
    let iz = 0;
    if (held("KeyD") || held("ArrowRight")) ix += 1;
    if (held("KeyA") || held("ArrowLeft")) ix -= 1;
    if (held("KeyW") || held("ArrowUp")) iz += 1;
    if (held("KeyS") || held("ArrowDown")) iz -= 1;
    ix += bridge.joyX;
    iz += bridge.joyY;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) {
      ix /= mag;
      iz /= mag;
    }
    const speed = blocking ? 1.45 : attack.kind === "heavy" && attack.t < HEAVY.wind ? 1.85 : 3.55;
    const fwd = forwardOf(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const wishX = fwd.x * iz + rx * ix;
    const wishZ = fwd.z * iz + rz * ix;
    const k = 1 - Math.exp(-12 * dt);
    vx += (wishX * speed - vx) * k;
    vz += (wishZ * speed - vz) * k;
    const ox = x;
    const oz = z;
    const nx = x + vx * dt;
    if (!playerBlocked(nx, z)) x = nx;
    else vx = 0;
    const nz = z + vz * dt;
    if (!playerBlocked(x, nz)) z = nz;
    else vz = 0;
    const moved = Math.hypot(x - ox, z - oz);
    if (moved > 0.002 && !reduce) {
      bob += moved * 2.1;
      stepDist += moved;
      if (stepDist > 1.35) {
        stepDist = 0;
        audio.foot();
      }
    }

    const use = nearestUse();
    const interact = bridge.queueInteract || held("KeyE");
    bridge.queueInteract = false;
    if (interact && !interactLatch && use) use.act();
    interactLatch = interact;
    const useKey = window.matchMedia("(pointer: fine)").matches && window.innerWidth >= 860;
    prompt = use ? (useKey ? `${use.label}  [E]` : use.label) : null;

    if (!reachedHold && inHold(x, z)) {
      reachedHold = true;
      refreshObjective();
    }
    if (!seenChapel && inChapel(x, z)) {
      seenChapel = true;
      if (!puzzleSolved) say("The shrine mural shows the tide order.");
      refreshObjective();
    }
    const vaultNow = Math.floor(z / CELL) <= 4 && Math.floor(z / CELL) >= 1;
    if (vaultNow !== inVault) {
      inVault = vaultNow;
      refreshObjective();
    }

    let near = false;
    const facing = forwardOf(yaw);
    for (const enemy of enemies) {
      updateEnemy(enemy, dt);
      syncSprite(enemy);
      if (enemy.mode === "dead") continue;
      const dx = enemy.x - x;
      const dz = enemy.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.35 && (facing.x * dx + facing.z * dz) / (dist || 1) > 0.2) near = true;
    }
    enemyNear = near;

    const sway = ix * 0.04;
    let rxPose = 0.48;
    let ryPose = 0.12;
    let rzPose = 0.1;
    if (blocking) {
      rxPose = 0.95;
      ryPose = 0;
      rzPose = -0.4;
    }
    if (attack.kind) {
      const spec = attack.kind === "heavy" ? HEAVY : QUICK;
      if (attack.kind === "quick") {
        rxPose = attack.t < spec.wind ? 0.95 : attack.t < spec.wind + spec.active ? -0.75 : 0.48;
        rzPose = 0.35;
      } else if (attack.t < spec.wind) {
        rxPose = 1.3;
        ryPose = -0.5;
      } else if (attack.t < spec.wind + spec.active) {
        rxPose = 0.15;
        ryPose = 0.75;
      }
    }
    const blend = 1 - Math.exp(-16 * dt);
    weapon.rotation.x += (rxPose - weapon.rotation.x) * blend;
    weapon.rotation.y += (ryPose - weapon.rotation.y) * blend;
    weapon.rotation.z += (rzPose - weapon.rotation.z) * blend;
    weapon.position.x = 0.32 + sway;
    weapon.position.y = -0.3 + Math.sin(bob) * (reduce ? 0 : 0.015);
    publish();
  }

  function render() {
    const bobY = reduce ? 0 : Math.sin(bob) * 0.03;
    const sx = Math.sin(time * 43) * shake * 0.035;
    const sy = Math.cos(time * 37) * shake * 0.02;
    yawPivot.position.set(x, 1.52 + bobY + sy, z);
    yawPivot.rotation.y = yaw;
    pitchPivot.rotation.x = pitch;
    camera.position.x = sx;
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(weaponScene, weaponCamera);
  }

  function reset() {
    loadLayout();
    x = SPAWN.x;
    z = SPAWN.z;
    yaw = SPAWN.yaw;
    pitch = 0;
    vx = 0;
    vz = 0;
    hp = HP_MAX;
    iframes = 0;
    shake = 0;
    hurtAmt = 0;
    attack = { kind: null, t: 0, swung: false };
    readPlaque = false;
    heardSailor = false;
    sailorStep = 0;
    holdClear = false;
    shouted = false;
    reachedHold = false;
    seenChapel = false;
    inVault = false;
    secretOpen = false;
    flaskTaken = false;
    flask.visible = false;
    tide = 0;
    lit.clear();
    puzzleSolved = false;
    hasKey = false;
    readChart = false;
    shieldHint = false;
    blockHint = false;
    tradeHint = false;
    counterHint = false;
    aimHint = false;
    coverHint = false;
    toastT = 0;
    for (const enemy of enemies) {
      enemy.x = enemy.homeX;
      enemy.z = enemy.homeZ;
      enemy.yaw = 0;
      enemy.hp = enemy.max;
      enemy.mode = "idle";
      enemy.t = 0;
      enemy.cooldown = 0.4;
      enemy.aware = false;
      enemy.flash = 0;
      enemy.bar.visible = false;
      enemy.shownHp = -1;
    }
    objective = "Find the sailor in the stores.";
    setMode("play");
    shouted = true;
    say("From the stores: mutineers have the hold!");
  }

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    const coarse = window.matchMedia("(pointer: coarse)").matches || w < 860;
    const factor = coarse ? 0.8 : 0.52;
    const bw = Math.max(320, Math.floor(w * factor));
    const bh = Math.max(200, Math.floor(h * factor));
    renderer.setPixelRatio(1);
    renderer.setSize(bw, bh, false);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    camera.aspect = bw / bh;
    camera.updateProjectionMatrix();
    weaponCamera.aspect = bw / bh;
    weaponCamera.updateProjectionMatrix();
  }

  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const frozen = mode === "pause" || mode === "dead" || mode === "won" || mode === "clue";
    if (!frozen) time += dt;
    update(dt);
    render();
    raf = requestAnimationFrame(frame);
  }

  let last = performance.now();
  const ac = new AbortController();
  const signal = ac.signal;
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code === "Escape") {
        if (mode === "play") setMode("pause");
        else if (mode === "pause") setMode("play");
      }
      if (event.repeat) {
        keys.add(event.code);
        return;
      }
      keys.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    },
    { signal },
  );
  window.addEventListener("keyup", (event) => keys.delete(event.code), { signal });
  window.addEventListener(
    "blur",
    () => {
      keys.clear();
      holdQuick = false;
      holdHeavy = false;
    },
    { signal },
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) keys.clear();
    },
    { signal },
  );
  window.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    mouseX += event.movementX;
    mouseY += event.movementY;
  }, { signal });
  window.addEventListener(
    "mousedown",
    (event) => {
      if (document.pointerLockElement !== canvas || mode !== "play") return;
      if (event.button === 0) holdQuick = true;
      if (event.button === 2) holdHeavy = true;
    },
    { signal },
  );
  window.addEventListener(
    "mouseup",
    (event) => {
      if (event.button === 0) holdQuick = false;
      if (event.button === 2) holdHeavy = false;
    },
    { signal },
  );
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
  document.addEventListener(
    "pointerlockchange",
    () => {
      root.classList.toggle("is-locked", document.pointerLockElement === canvas);
      if (!document.pointerLockElement) {
        holdQuick = false;
        holdHeavy = false;
      }
    },
    { signal },
  );
  window.addEventListener(
    "pointerdown",
    () => {
      audio.resume();
    },
    { signal },
  );
  const observer = new ResizeObserver(() => resize());
  if (canvas.parentElement) observer.observe(canvas.parentElement);
  resize();
  loadLayout();
  refreshObjective();
  publish();
  raf = requestAnimationFrame(frame);

  void (async () => {
    try {
      const [cIdle, cAtk, cDie, wIdle, wAtk, wDie, sailorTex] = await Promise.all([
        loadTexture("/sprites/cutlass-idle.png"),
        loadTexture("/sprites/cutlass-attack.png"),
        loadTexture("/sprites/cutlass-death.png"),
        loadTexture("/sprites/flintlock-idle.png"),
        loadTexture("/sprites/flintlock-attack.png"),
        loadTexture("/sprites/flintlock-death.png"),
        loadTexture("/sprites/sailor-idle.png"),
      ]);
      const bases = {
        cutlass: { idle: prepSheet(cIdle), attack: prepSheet(cAtk), death: prepSheet(cDie) },
        flintlock: { idle: prepSheet(wIdle), attack: prepSheet(wAtk), death: prepSheet(wDie) },
      };
      const spawn = (kind: Kind, px: number, pz: number, max: number) => {
        const base = bases[kind];
        const sheets = {
          idle: prepSheet(base.idle.clone()),
          attack: prepSheet(base.attack.clone()),
          death: prepSheet(base.death.clone()),
        };
        const material = new THREE.SpriteMaterial({
          map: sheets.idle,
          alphaTest: 0.45,
          transparent: false,
          depthWrite: true,
          fog: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.center.set(0.5, 0.1);
        sprite.scale.set(kind === "flintlock" ? 1.62 : 1.5, kind === "flintlock" ? 2.5 : 2.28, 1);
        scene.add(sprite);
        const mark = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: bangTex,
            transparent: true,
            depthWrite: false,
            fog: false,
            color: 0xe2a04a,
          }),
        );
        mark.center.set(0.5, 0);
        mark.scale.set(0.4, 0.36, 1);
        mark.visible = false;
        scene.add(mark);
        const bar = makeBarSprite();
        scene.add(bar.sprite);
        const enemy: Enemy = {
          kind,
          x: px,
          z: pz,
          yaw: 0,
          hp: max,
          max,
          mode: "idle",
          t: 0,
          cooldown: 0.6,
          staggerDur: 0.4,
          flash: 0,
          aware: false,
          homeX: px,
          homeZ: pz,
          sprite,
          mark,
          bar: bar.sprite,
          barCanvas: bar.canvas,
          barTex: bar.tex,
          shownHp: -1,
          sheets,
          sheet: sheets.idle,
        };
        enemies.push(enemy);
        syncSprite(enemy);
      };
      if (!running) return;
      sailorSheet = prepSheet(sailorTex);
      const sailorMat = new THREE.SpriteMaterial({
        map: sailorSheet,
        alphaTest: 0.45,
        transparent: false,
        depthWrite: true,
        fog: false,
      });
      sailorSprite = new THREE.Sprite(sailorMat);
      sailorSprite.center.set(0.5, 0.1);
      sailorSprite.scale.set(1.28, 1.95, 1);
      sailorSprite.position.set(SAILOR.x, 0, SAILOR.z);
      scene.add(sailorSprite);
      spawn("cutlass", CUTLASS_SPAWN.x, CUTLASS_SPAWN.z, CUTLASS_HP);
      spawn("flintlock", FLINTLOCK_SPAWN.x, FLINTLOCK_SPAWN.z, FLINT_HP);
      ready = true;
      onReady();
      publish();
    } catch (error) {
      onReady(error instanceof Error ? error.message : "Sprites failed to load");
    }
  })();

  const qa = import.meta.env.DEV || new URLSearchParams(location.search).has("qa");
  if (qa) {
    window.__controlsTest = {
      getYaw: () => yaw,
      getPitch: () => pitch,
      getSpeed: () => Math.hypot(vx, vz),
      getPos: () => ({ x, z }),
      setKeys: (codes) => {
        forced = new Set(codes);
      },
      setYaw: (value) => {
        yaw = value;
      },
      teleport: (px, pz) => {
        x = px;
        z = pz;
        vx = 0;
        vz = 0;
      },
    };
    window.__ashwake = {
      teleport: (px, pz) => {
        x = px;
        z = pz;
        vx = 0;
        vz = 0;
      },
      enemies: () => enemies.map((enemy) => ({ kind: enemy.kind, hp: enemy.hp, mode: enemy.mode, x: enemy.x, z: enemy.z })),
      flags: () => ({
        hp,
        hasKey,
        puzzle: puzzleSolved,
        secret: secretOpen,
        chart: readChart,
        sailor: heardSailor,
        sailorStep,
        hold: holdClear,
      }),
      pokeLook: (dx, dy) => {
        bridge.lookDx += dx;
        bridge.lookDy += dy;
      },
      setLook: (h, v) => {
        bridge.lookH = h;
        bridge.lookV = v;
      },
      use: () => {
        bridge.queueInteract = true;
      },
      strike: (kind) => {
        bridge.queueAttack = kind;
      },
      block: (on) => {
        bridge.blocking = on;
      },
    };
  }

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ac.abort();
    observer.disconnect();
    if (window.__controlsTest) delete window.__controlsTest;
    if (window.__ashwake) delete window.__ashwake;
    disposeObject(scene);
    disposeObject(weaponScene);
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
