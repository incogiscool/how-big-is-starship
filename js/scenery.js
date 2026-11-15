// Everything that stands next to the rocket to give it scale:
// a ruler, a person, a bus, well-known tall things, and a stand-in world for when there is no camera.
import * as THREE from '../vendor/three.module.min.js';
import { DIM } from './starship.js';

const TAU = Math.PI * 2;

export const COMPARE = [
  { id: 'none', name: 'Nothing', note: 'Just the rocket' },
  { id: 'liberty', name: 'Statue of Liberty', height: 93, offset: 36 },
  { id: 'bigben', name: 'Big Ben', height: 96, offset: 24 },
  { id: 'saturn', name: 'Saturn V', height: 110.6, offset: 23 },
  { id: 'falcon', name: 'Falcon 9', height: 70, offset: 19 },
];

const feet = (m) => Math.round(m * 3.28084);
const matte = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.8, ...extra });

// Text that keeps the same size on screen however far away it is.
export function makeLabel(text, { size = 0.034, color = '#ffffff', bg = 'rgba(10,14,20,0.68)' } = {}) {
  const font = '600 46px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const c = document.createElement('canvas');
  let g = c.getContext('2d');
  g.font = font;
  const padX = 26, h = 84;
  c.width = Math.ceil(g.measureText(text).width) + padX * 2;
  c.height = h;
  g = c.getContext('2d');
  g.font = font;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, c.width, h, 26);
  g.fill();
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, padX, h / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true, fog: false, toneMapped: false,
  }));
  sprite.scale.set((size * c.width) / h, size, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function squareTaper(sideTop, sideBottom, height, material) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(sideTop / Math.SQRT2, sideBottom / Math.SQRT2, height, 4),
    material,
  );
  m.rotation.y = Math.PI / 4;
  return m;
}

function stack(group, segments) {
  // segments: [yBottom, yTop, radiusBottom, radiusTop, material]
  for (const [y0, y1, r0, r1, material] of segments) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 32), material);
    m.position.y = (y0 + y1) / 2;
    group.add(m);
  }
}

function bells(group, material, positions, exit, throat, height) {
  for (const [x, z] of positions) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(throat, exit, height, 16, 1, true), material);
    m.position.set(x, height / 2, z);
    group.add(m);
  }
}

function buildLiberty() {
  const g = new THREE.Group();
  const stone = matte(0xb9ad98);
  const copper = matte(0x7db3a2, { roughness: 0.65 });
  const gold = matte(0xe2b53c, { metalness: 0.6, roughness: 0.35 });

  const fort = new THREE.Mesh(new THREE.CylinderGeometry(22, 24, 8, 11), stone);
  fort.position.y = 4;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), stone);
  plinth.position.y = 13;
  const shaft = squareTaper(12, 16, 29, stone);
  shaft.position.y = 32.5;
  g.add(fort, plinth, shaft);

  const F = 47; // feet of the statue
  const robe = new THREE.Mesh(new THREE.LatheGeometry([
    [3.9, 0], [3.7, 6], [3.2, 14], [2.9, 20], [3.3, 24], [2.5, 26.4], [1.2, 27.4], [1.2, 28.6],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 24), copper);
  robe.position.y = F;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.9, 20, 14), copper);
  head.scale.y = 1.25;
  head.position.y = F + 30.6;
  g.add(robe, head);

  for (let i = 0; i < 7; i++) {
    const a = ((i - 3) / 3) * 1.25;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 3, 6), copper);
    spike.position.set(Math.sin(a) * 2.6, F + 32.2 + Math.cos(a) * 1.6, 0.6);
    spike.rotation.z = -a * 0.8;
    g.add(spike);
  }

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.25, 14, 10), copper);
  arm.position.set(-3.5, F + 31.5, 0);
  arm.rotation.z = 0.12;
  const torch = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.45, 4.4, 10), copper);
  torch.position.set(-4.3, F + 40.6, 0);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), gold);
  flame.scale.y = 1.5;
  flame.position.set(-4.3, F + 44.3, 0);
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.8, 0.7), copper);
  tablet.position.set(3.1, F + 19.5, 1.2);
  tablet.rotation.z = -0.2;
  g.add(arm, torch, flame, tablet);
  return g;
}

function buildBigBen() {
  const g = new THREE.Group();
  const stone = matte(0xc4a66c);
  const slate = matte(0x3d4249, { roughness: 0.6 });
  const face = matte(0xf4efdc, { roughness: 0.5 });
  const add = (mesh, y) => { mesh.position.y = y; g.add(mesh); return mesh; };

  add(new THREE.Mesh(new THREE.BoxGeometry(12, 58, 12), stone), 29);
  add(new THREE.Mesh(new THREE.BoxGeometry(13.6, 11, 13.6), stone), 63.5);
  add(new THREE.Mesh(new THREE.BoxGeometry(12, 6, 12), stone), 72);
  add(squareTaper(7, 12.4, 9, slate), 79.5);
  add(new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), stone), 86);
  add(squareTaper(0.1, 5.6, 8, slate), 92);

  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i * Math.PI) / 2;
    const ring = new THREE.Mesh(new THREE.CircleGeometry(4.1, 32), slate);
    ring.position.set(0, 63.5, 6.86);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(3.45, 32), face);
    dial.position.set(0, 63.5, 6.92);
    pivot.add(ring, dial);
    g.add(pivot);
  }
  return g;
}

function buildSaturnV() {
  const g = new THREE.Group();
  const white = matte(0xf1f1ec, { roughness: 0.55 });
  const black = matte(0x1c1c1f, { roughness: 0.6 });
  const silver = matte(0xc4c8cd, { metalness: 0.7, roughness: 0.4 });
  const B = 3; // first-stage body starts above the engine bells
  stack(g, [
    [B, 42.1, 5.03, 5.03, white],
    [42.1, 66.9, 5.03, 5.03, white],
    [66.9, 72.6, 5.03, 3.3, white],
    [72.6, 84.4, 3.3, 3.3, white],
    [84.4, 92.9, 3.3, 1.95, white],
    [92.9, 100.3, 1.95, 1.95, silver],
    [100.3, 103.7, 1.95, 0.45, silver],
    [103.7, 108.6, 0.33, 0.33, white],
    [108.6, 110.6, 0.33, 0.05, white],
    // roll-pattern bands
    [B, 8.5, 5.13, 5.13, black],
    [30.5, 33.5, 5.13, 5.13, black],
    [39.5, 44.5, 5.13, 5.13, black],
    [64.5, 66.9, 5.13, 5.13, black],
    [78, 79.2, 3.4, 3.4, black],
  ]);
  bells(g, black, [[0, 0], [3.2, 3.2], [-3.2, 3.2], [3.2, -3.2], [-3.2, -3.2]], 1.85, 0.6, 3.6);
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = Math.PI / 4 + (i * Math.PI) / 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.5, 3.4), white);
    fin.position.set(0, B + 2.75, 5.03 + 1.5);
    pivot.add(fin);
    g.add(pivot);
  }
  return g;
}

function buildFalcon9() {
  const g = new THREE.Group();
  const white = matte(0xf2f2ee, { roughness: 0.5 });
  const black = matte(0x1c1c1f, { roughness: 0.6 });
  const r = 1.83;
  stack(g, [
    [1.4, 42.6, r, r, white],
    [42.6, 49.3, r + 0.01, r + 0.01, black],
    [49.3, 56, r, r, white],
    [56, 57.3, r, 2.6, white],
    [57.3, 63.6, 2.6, 2.6, white],
  ]);
  const nose = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    nose.push(new THREE.Vector2(2.6 * Math.cos((t * Math.PI) / 2) ** 0.75, 63.6 + 6.4 * Math.sin((t * Math.PI) / 2)));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(nose, 32), white));
  const ring = [];
  for (let i = 0; i < 8; i++) ring.push([Math.sin((i / 8) * TAU) * 1.25, Math.cos((i / 8) * TAU) * 1.25]);
  bells(g, black, [[0, 0], ...ring], 0.45, 0.18, 1.6);
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = Math.PI / 4 + (i * Math.PI) / 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 9.5, 0.3), black);
    leg.position.set(0, 1.4 + 4.75, r + 0.12);
    pivot.add(leg);
    g.add(pivot);
  }
  return g;
}

const BUILDERS = { liberty: buildLiberty, bigben: buildBigBen, saturn: buildSaturnV, falcon: buildFalcon9 };

// Returns a group standing on y = 0 with a floating name tag, or null for "none".
export function buildCompare(id) {
  const info = COMPARE.find((c) => c.id === id);
  if (!info || !BUILDERS[id]) return null;
  const g = BUILDERS[id]();
  g.position.x = info.offset;
  const label = makeLabel(`${info.name} · ${Math.round(info.height)} m`);
  label.center.set(0.5, 0);
  label.position.y = info.height + 3;
  g.add(label);
  return g;
}

export function buildGuides() {
  const g = new THREE.Group();
  const line = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false, toneMapped: false });

  // Ruler: one mast and a tick every 25 m. `bars` get widened with distance so they never vanish.
  const ruler = new THREE.Group();
  ruler.position.x = -13;
  const bars = [];
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1, DIM.total, 1), line);
  mast.position.y = DIM.total / 2;
  bars.push({ mesh: mast, axis: 'xz' });
  ruler.add(mast);
  const marks = [25, 50, 75, 100, DIM.total];
  for (const y of [0, ...marks]) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1), line);
    tick.position.set(-1.5, y, 0);
    bars.push({ mesh: tick, axis: 'yz' });
    ruler.add(tick);
  }
  for (const y of marks) {
    const top = y === DIM.total;
    const label = makeLabel(top ? `${Math.round(y)} m · ${DIM.totalFt} ft` : `${y} m`, { size: top ? 0.036 : 0.028 });
    label.center.set(1, 0.5);
    label.position.set(-4.5, y, 0);
    ruler.add(label);
  }
  g.add(ruler);

  // A 1.75 m person.
  const person = new THREE.Group();
  const skin = matte(0xff5a1f, { emissive: 0xff5a1f, emissiveIntensity: 0.35 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.0, 4, 10), skin);
  torso.position.y = 0.74;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.position.y = 1.61;
  const personLabel = makeLabel('Person', { size: 0.024 });
  personLabel.center.set(-0.15, 0);
  personLabel.position.y = 2.6;
  person.add(torso, head, personLabel);
  person.position.set(-6.5, 0, 7);
  g.add(person);

  // A 12 m city bus.
  const bus = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(12, 2.9, 2.55), matte(0xf2b705, { roughness: 0.5 }));
  shell.position.y = 0.3 + 1.45;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(11.4, 1.0, 2.6), matte(0x1f2a33, { roughness: 0.3 }));
  glass.position.y = 2.25;
  const busLabel = makeLabel('Bus', { size: 0.024 });
  busLabel.center.set(1, 0);
  busLabel.position.y = 4.4;
  bus.add(shell, glass, busLabel);
  bus.position.set(-17, 0, 9);
  g.add(bus);

  g.userData.setDistance = (d) => {
    const w = THREE.MathUtils.clamp(d * 0.0016, 0.22, 3);
    for (const { mesh, axis } of bars) {
      if (axis === 'xz') mesh.scale.set(w, 1, w);
      else mesh.scale.set(1, w, w);
    }
  };
  return g;
}

// Soft dark patch that sits under the rocket so it reads as standing on the ground.
export function buildContactShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(15, 40),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.05;
  return mesh;
}

export const SKY = { zenith: 0x3f78d8, horizon: 0xc9d8e8, ground: 0x7c8571 };

function skyDome(radius, groundColor) {
  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const zen = new THREE.Color(SKY.zenith), hor = new THREE.Color(SKY.horizon), gnd = new THREE.Color(groundColor);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius;
    if (y >= 0) c.copy(hor).lerp(zen, Math.pow(y, 0.55));
    else c.copy(hor).lerp(gnd, Math.min(1, -y * 6));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

// Image-based lighting: a plain daytime sky, so the steel has something to reflect.
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.add(skyDome(50, 0x57534a));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  return tex;
}

// Stand-in surroundings for when there is no camera: sky, plus a field with a 50 m grid.
export function buildDemoWorld() {
  const g = new THREE.Group();
  const sky = skyDome(11000, SKY.ground);
  sky.renderOrder = -10;
  g.add(sky);

  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#7c8571';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${40 + Math.random() * 60},${60 + Math.random() * 50},${30 + Math.random() * 40},0.10)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 6, 6);
  }
  x.strokeStyle = 'rgba(255,255,255,0.28)';
  x.lineWidth = 2;
  x.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  const SIZE = 20000;
  tex.repeat.set(SIZE / 50, SIZE / 50);
  tex.offset.set(0.5, 0.5); // keep grid lines from running straight through the viewer
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  g.add(ground);
  return g;
}
