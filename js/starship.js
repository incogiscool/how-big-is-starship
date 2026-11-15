// Procedural Starship V3 (Super Heavy + Ship), built to real dimensions in metres.
// Origin is the centre of the booster's base; +Y is up; the heat-shield side faces +Z.
import * as THREE from '../vendor/three.module.min.js';

export const DIM = {
  total: 124.4,   // full stack
  booster: 72.3,  // Super Heavy including the integrated hot-stage truss
  ship: 52.1,     // upper stage
  radius: 4.5,    // 9 m diameter
  totalFt: 408,
};

const R = DIM.radius;
const RING = 1.83; // height of one steel ring section
const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;

// Small seeded RNG so the textures look the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// One texture tile = one welded ring: brushed streaks, panel tone shifts, weld seam.
function makeSteelTexture() {
  return canvasTexture(512, 128, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = '#dcdfe2';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(50,60,78,${r() * 0.1})`;
      g.fillRect((i * w) / 8, 0, w / 8, h);
    }
    for (let i = 0; i < 260; i++) {
      const a = r() * 0.09;
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(35,40,52,${a})`;
      g.fillRect(r() * w, 0, 1 + r() * 3, h);
    }
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(0, h - 9, w, 3);
    g.fillStyle = 'rgba(28,32,40,0.6)';
    g.fillRect(0, h - 5, w, 4);
  });
}

function makeTileTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(21);
    g.fillStyle = '#17191c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      const v = 18 + Math.floor(r() * 26);
      g.fillStyle = `rgba(${v},${v},${v + 3},0.55)`;
      g.fillRect(Math.floor(r() * 16) * 16, Math.floor(r() * 16) * 16, 16, 16);
    }
  });
}

function makeLatticeTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#c3c7cc';
    g.lineWidth = 7;
    for (let i = -w; i < w * 2; i += 36) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke();
    }
    g.lineWidth = 20;
    g.strokeRect(10, 10, w - 20, h - 20);
  }, false);
}

// ---- Ship outer mould line -------------------------------------------------
const NOSE_BASE = 34.5;                       // where the barrel ends and the nose starts
const NOSE_LEN = DIM.ship - NOSE_BASE;
const NOSE_VIRTUAL = NOSE_LEN * 1.07;         // ogive is cut short, then rounded off
const RHO = (R * R + NOSE_VIRTUAL * NOSE_VIRTUAL) / (2 * R);
const CAP = 0.5;

function ogive(y) {
  const x = y - NOSE_BASE;
  return Math.max(0, Math.sqrt(RHO * RHO - x * x) + R - RHO);
}

export function shipRadius(y) {
  if (y <= NOSE_BASE) return R;
  const capStart = DIM.ship - CAP;
  if (y <= capStart) return ogive(y);
  const k = Math.min(1, (y - capStart) / CAP);
  return ogive(capStart) * Math.sqrt(Math.max(0, 1 - k * k));
}

// A flap is a thin plate lying in the plane through the rocket's axis at azimuth phi.
// The face that looks toward the heat-shield side is tiled; the other is bare steel.
function makeFlap(outline, phi, thickness, tileMat, steelMat) {
  const shape = new THREE.Shape(outline.map(([r, y]) => new THREE.Vector2(r, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness / 2, bevelEnabled: false });
  const windwardFirst = Math.sin(phi) > 0;
  const a = new THREE.Mesh(geo, windwardFirst ? tileMat : steelMat);
  const b = new THREE.Mesh(geo, windwardFirst ? steelMat : tileMat);
  b.position.z = -thickness / 2;
  const g = new THREE.Group();
  g.add(a, b);
  g.rotation.y = phi - Math.PI / 2;
  return g;
}

function atAzimuth(phi, child) {
  const g = new THREE.Group();
  g.rotation.y = phi;
  g.add(child);
  return g;
}

function engineCluster(material, bells) {
  // bells: [{ ring radius, count, exit radius, throat radius, height, phase }]
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  for (const b of bells) {
    const geo = new THREE.CylinderGeometry(b.throat, b.exit, b.height, 18, 1, true);
    const mesh = new THREE.InstancedMesh(geo, material, b.count);
    for (let i = 0; i < b.count; i++) {
      const a = (i / b.count) * TAU + (b.phase || 0);
      m.makeTranslation(Math.sin(a) * b.ring, b.height / 2, Math.cos(a) * b.ring);
      mesh.setMatrixAt(i, m);
    }
    group.add(mesh);
  }
  return group;
}

export function buildStarship() {
  const steelTex = makeSteelTexture();
  const steel = (repX, repY) => {
    const map = steelTex.clone();
    map.repeat.set(repX, repY);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, metalness: 0.88, roughness: 0.36 });
  };
  const plainSteel = new THREE.MeshStandardMaterial({ color: 0xcfd3d7, metalness: 0.85, roughness: 0.42 });
  const tileTex = makeTileTexture();
  tileTex.repeat.set(10, 26);
  const tiles = new THREE.MeshStandardMaterial({ map: tileTex, metalness: 0.05, roughness: 0.82 });
  const flapTiles = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, metalness: 0.05, roughness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.6, roughness: 0.55, side: THREE.DoubleSide });
  const bellMat = new THREE.MeshStandardMaterial({ color: 0x4a4744, metalness: 0.75, roughness: 0.45, side: THREE.DoubleSide });

  const rocket = new THREE.Group();
  rocket.name = 'starship';

  // ======================= Super Heavy booster =======================
  const booster = new THREE.Group();
  const SKIRT = 1.0;                 // engine bells poke out below this
  const TRUSS_H = 2.6;               // integrated hot-stage truss
  const TANK_TOP = DIM.booster - TRUSS_H;

  const bodyH = TANK_TOP - SKIRT;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, bodyH, 56, 1, true),
    steel(4, bodyH / RING),
  );
  body.position.y = SKIRT + bodyH / 2;
  booster.add(body);

  const basePlate = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 40), dark);
  basePlate.rotation.x = Math.PI / 2;
  basePlate.position.y = SKIRT + 0.45;
  booster.add(basePlate);

  // 33 Raptors: 3 centre, 10 middle, 20 outer.
  booster.add(engineCluster(bellMat, [
    { ring: 0.76, count: 3, exit: 0.62, throat: 0.24, height: 1.5 },
    { ring: 2.15, count: 10, exit: 0.62, throat: 0.24, height: 1.5 },
    { ring: 3.82, count: 20, exit: 0.58, throat: 0.24, height: 1.5 },
  ]));

  // Forward dome, visible through the open truss.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R - 0.05, 40, 10, 0, TAU, 0, Math.PI / 2),
    plainSteel,
  );
  dome.scale.y = 0.22;
  dome.position.y = TANK_TOP;
  booster.add(dome);

  // Hot-stage truss: two flanges joined by a zig-zag of struts.
  const flangeGeo = new THREE.CylinderGeometry(R, R, 0.3, 56, 1, true);
  const flangeMat = new THREE.MeshStandardMaterial({ color: 0xb4b8bd, metalness: 0.85, roughness: 0.45, side: THREE.DoubleSide });
  for (const y of [TANK_TOP + 0.15, DIM.booster - 0.15]) {
    const f = new THREE.Mesh(flangeGeo, flangeMat);
    f.position.y = y;
    booster.add(f);
  }
  {
    const N = 20;
    const y0 = TANK_TOP + 0.3, y1 = DIM.booster - 0.3, rr = R - 0.18;
    const struts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 8), flangeMat, N * 2);
    const up = new THREE.Vector3(0, 1, 0), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    const dir = new THREE.Vector3(), mid = new THREE.Vector3();
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), m = new THREE.Matrix4();
    const place = (i, a0, a1) => {
      p0.set(Math.sin(a0) * rr, y0, Math.cos(a0) * rr);
      p1.set(Math.sin(a1) * rr, y1, Math.cos(a1) * rr);
      dir.subVectors(p1, p0);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      mid.addVectors(p0, p1).multiplyScalar(0.5);
      m.compose(mid, q, s.set(1, len, 1));
      struts.setMatrixAt(i, m);
    };
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, half = TAU / N / 2;
      place(i * 2, a, a + half);
      place(i * 2 + 1, a + 2 * half, a + half);
    }
    booster.add(struts);
  }

  // Three large fixed grid fins in a T layout, set lower than on earlier boosters.
  {
    const lattice = new THREE.MeshStandardMaterial({
      map: makeLatticeTexture(), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.45,
    });
    const frame = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.8, roughness: 0.45 });
    const finGeo = new THREE.BoxGeometry(4.4, 0.55, 5.0);
    for (const deg of [60, 240, 150]) {
      const fin = new THREE.Mesh(finGeo, [frame, frame, lattice, lattice, frame, frame]);
      fin.position.set(0, 63.2, R + 5.0 / 2 - 0.35);
      booster.add(atAzimuth(rad(deg), fin));
      const root = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.9), plainSteel);
      root.position.set(0, 63.2, R + 0.25);
      booster.add(atAzimuth(rad(deg), root));
    }
  }

  // External raceway down the side.
  {
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.75, 56, 0.4), plainSteel);
    rw.position.set(0, 3.5 + 28, R + 0.12);
    booster.add(atAzimuth(rad(196), rw));
  }

  rocket.add(booster);

  // ============================ Ship ============================
  const ship = new THREE.Group();
  ship.position.y = DIM.booster;

  const N = 112;
  const profile = [];
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * DIM.ship;
    profile.push(new THREE.Vector2(shipRadius(y), y));
  }
  const SHIELD = 200; // degrees of the circumference covered by heat-shield tiles
  const shield = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 26, rad(-SHIELD / 2), rad(SHIELD)),
    tiles,
  );
  const back = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 22, rad(SHIELD / 2), rad(360 - SHIELD)),
    steel(2, DIM.ship / RING),
  );
  ship.add(shield, back);

  const shipBase = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 40), dark);
  shipBase.rotation.x = Math.PI / 2;
  shipBase.position.y = 0.2;
  ship.add(shipBase);

  // Six Raptors (3 sea-level, 3 vacuum) hanging into the hot-stage truss.
  const shipEngines = engineCluster(bellMat, [
    { ring: 0.76, count: 3, exit: 0.62, throat: 0.24, height: 1.4 },
    { ring: 2.9, count: 3, exit: 1.15, throat: 0.3, height: 1.7, phase: Math.PI / 3 },
  ]);
  shipEngines.position.y = -1.5;
  ship.add(shipEngines);

  // Aft flaps: big, at 90 degrees either side of the heat shield's centreline.
  const E = 0.25; // how far flap roots are buried in the hull
  const aft = [
    [R - E, 0.8], [8.9, 0.8], [8.9, 5.2], [6.7, 9.6], [R - E, 11.0],
  ];
  // Forward flaps: smaller, on the nose, swept toward the leeward side.
  const yb = 36.4, yt = 45.6;
  const fwd = [
    [shipRadius(yb) - E, yb],
    [shipRadius(yb) + 3.3, yb],
    [shipRadius(yb) + 3.3, yb + 2.4],
    [shipRadius(yt) + 1.0, yt],
  ];
  for (let i = 0; i <= 6; i++) {
    const y = yt + (yb - yt) * (i / 6);
    fwd.push([shipRadius(y) - E, y]);
  }
  fwd.pop();
  for (const sgn of [1, -1]) {
    ship.add(makeFlap(aft, rad(90 * sgn), 0.6, flapTiles, plainSteel));
    ship.add(makeFlap(fwd, rad(118 * sgn), 0.45, flapTiles, plainSteel));
  }

  // Leeward raceway.
  {
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.75, 31, 0.4), plainSteel);
    rw.position.set(0, 2.5 + 15.5, R + 0.12);
    ship.add(atAzimuth(rad(180), rw));
  }

  rocket.add(ship);
  return rocket;
}
