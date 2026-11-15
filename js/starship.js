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

// ---- Ship outer mould line -------------------------------------------------
// A tangent ogive that is cut short and closed with a sphere cap, giving the blunt rounded tip.
const NOSE_BASE = 38.0;                       // where the barrel ends and the nose starts
const NOSE_LEN = DIM.ship - NOSE_BASE;
const NOSE_VIRTUAL = NOSE_LEN * 1.18;
const RHO = (R * R + NOSE_VIRTUAL * NOSE_VIRTUAL) / (2 * R);
const ogive = (x) => Math.sqrt(RHO * RHO - x * x) + R - RHO;

const CAP = (() => {
  const at = (xj) => {
    const alpha = Math.atan(xj / Math.sqrt(RHO * RHO - xj * xj)); // cone half-angle at the join
    const rs = ogive(xj) / Math.cos(alpha);
    return { xj, rs, xc: xj - rs * Math.sin(alpha), top: xj + rs * (1 - Math.sin(alpha)) };
  };
  let lo = 0, hi = NOSE_VIRTUAL * 0.999;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).top < NOSE_LEN) lo = mid; else hi = mid;
  }
  return at(lo);
})();

export function shipRadius(y) {
  if (y <= NOSE_BASE) return R;
  const x = y - NOSE_BASE;
  if (x <= CAP.xj) return ogive(x);
  return Math.sqrt(Math.max(0, CAP.rs * CAP.rs - (x - CAP.xc) * (x - CAP.xc)));
}

// How far round from the heat shield's centreline the tiles reach, in degrees, at a given height.
function tileHalfWidth(y) {
  if (y <= NOSE_BASE) return 100;
  const t = (y - NOSE_BASE) / NOSE_LEN;
  if (t < 0.8) return 100 + (t / 0.8) * 45;
  return Math.min(180, 145 + ((t - 0.8) / 0.12) * 35);
}

// ---- Textures ----------------------------------------------------------------
// Bare stainless: stacked welded rings that each catch the light a little differently.
function paintSteel(g, W, H, heightM, seed, ribs = []) {
  const r = rng(seed);
  const pxm = H / heightM;
  g.fillStyle = '#d6d9dc';
  g.fillRect(0, 0, W, H);
  for (let y0 = 0; y0 < heightM; y0 += RING) {
    const h = RING * pxm, top = H - (y0 + RING) * pxm;
    const c = Math.round(194 + r() * 24);
    g.fillStyle = `rgb(${c},${c + 2},${c + 5})`;
    g.fillRect(0, top, W, h + 1);
    for (let k = 0; k < 5; k++) {
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.08})` : `rgba(30,36,48,${r() * 0.08})`;
      g.fillRect(r() * W, top, W * (0.05 + r() * 0.2), h);
    }
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(0, top + h - 5, W, 2);
    g.fillStyle = 'rgba(28,32,40,0.55)';
    g.fillRect(0, top + h - 2, W, 2);
    g.fillStyle = 'rgba(28,32,40,0.38)';
    g.fillRect(r() * W, top, 2, h);
  }
  for (let i = 0; i < 600; i++) {
    const a = r() * 0.07;
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(35,40,52,${a})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 2, H * (0.05 + r() * 0.3));
  }
  // Closely ribbed sections (stringers showing through the skin).
  g.fillStyle = 'rgba(24,28,34,0.14)';
  for (const [y0, y1] of ribs) {
    for (let y = y0; y < y1; y += 0.3) g.fillRect(0, H - y * pxm, W, 1.5);
  }
}

function hexPattern(g, radius, stroke) {
  // Seamless tile of pointy-top hexagons.
  const w = Math.round(Math.sqrt(3) * radius), h = Math.round(3 * radius);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.strokeStyle = stroke;
  x.lineWidth = 1;
  const hex = (cx, cy) => {
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      x.lineTo(cx + (Math.cos(a) * w) / Math.sqrt(3), cy + (Math.sin(a) * h) / 3);
    }
    x.closePath();
    x.stroke();
  };
  for (const [cx, cy] of [[0, 0], [w, 0], [w / 2, h / 2], [0, h], [w, h]]) hex(cx, cy);
  return g.createPattern(c, 'repeat');
}

// The ship's whole skin in one image: u runs round the hull (heat-shield centreline in the middle),
// v runs from the engine skirt to the nose tip. Returns colour plus a roughness/metalness map.
function makeShipTextures() {
  const W = 1024, H = 2048;
  const pxm = H / DIM.ship;
  const ROW = 10, STEP = 12;
  const rows = [];
  for (let i = 0, top = H - ROW; top > -ROW; top -= ROW, i++) {
    const y = (H - top - ROW / 2) / pxm;
    const hw = tileHalfWidth(y);
    const px = hw >= 180 ? W / 2 : Math.round(((hw / 360) * W) / STEP) * STEP + (i % 2 ? STEP / 2 : 0);
    rows.push([W / 2 - px, top, px * 2, ROW + 0.5]);
  }

  const color = canvasTexture(W, H, (g) => {
    paintSteel(g, W, H, DIM.ship, 11, [[0, 4.2]]);
    // Nose gores.
    g.fillStyle = 'rgba(28,32,40,0.3)';
    for (let i = 0; i < 12; i++) g.fillRect((i / 12) * W, 0, 2, H - NOSE_BASE * pxm);
    // Leeward vents.
    g.fillStyle = '#1b1d21';
    for (const [u, y] of [[0.07, 27.5], [0.93, 27.5], [0.03, 7.5]]) {
      g.beginPath();
      g.ellipse(u * W, H - y * pxm, 0.42 * (W / (Math.PI * 2 * R)), 0.42 * pxm, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Heat shield.
    const region = new Path2D();
    for (const [x, y, w, h] of rows) region.rect(x, y, w, h);
    g.fillStyle = '#131417';
    g.fill(region);
    g.save();
    g.clip(region);
    const r = rng(33);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(r() * 30);
      g.fillStyle = `rgba(${v + 18},${v + 18},${v + 22},0.5)`;
      g.fillRect(Math.floor((r() * W) / STEP) * STEP, Math.floor((r() * H) / ROW) * ROW, STEP * (1 + Math.floor(r() * 3)), ROW * (1 + Math.floor(r() * 3)));
    }
    g.fillStyle = hexPattern(g, 7, 'rgba(150,155,165,0.2)');
    g.fillRect(0, 0, W, H);
    g.restore();
  });

  // Green = roughness, blue = metalness.
  const surface = canvasTexture(W / 4, H / 4, (g, w, h) => {
    g.fillStyle = 'rgb(0,92,224)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgb(0,212,10)';
    for (const [x, y, rw, rh] of rows) g.fillRect(x / 4, y / 4, rw / 4, rh / 4 + 0.5);
  });
  surface.colorSpace = THREE.NoColorSpace;
  return { color, surface };
}

function makeBoosterTexture(heightM) {
  return canvasTexture(1024, 2048, (g, w, h) => paintSteel(g, w, h, heightM, 5, [[0, 6], [heightM - 5.5, heightM]]));
}

// Small repeating tile pattern for the flaps (their UVs are in metres).
function makeFlapTileTexture() {
  const t = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#141518';
    g.fillRect(0, 0, w, h);
    g.fillStyle = hexPattern(g, 18.475, 'rgba(150,155,165,0.22)');
    g.save();
    g.scale(1, h / 110) ;
    g.fillRect(0, 0, w, 110);
    g.restore();
  });
  t.repeat.set(1.1, 1.1);
  return t;
}

// Grid fin seen from above: a diagonal lattice inside a frame with clipped corners.
// (The frame material on the box's sides is hidden where the corners are cut, which is fine at this size.)
function makeLatticeTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const c = 58; // corner cut
    const outline = new Path2D();
    outline.moveTo(c, 6); outline.lineTo(w - c, 6); outline.lineTo(w - 6, c);
    outline.lineTo(w - 6, h - c); outline.lineTo(w - c, h - 6); outline.lineTo(c, h - 6);
    outline.lineTo(6, h - c); outline.lineTo(6, c);
    outline.closePath();
    g.save();
    g.clip(outline);
    g.strokeStyle = '#c3c7cc';
    g.lineWidth = 6;
    for (let i = -w; i < w * 2; i += 30) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke();
    }
    g.restore();
    g.strokeStyle = '#c9cdd2';
    g.lineWidth = 12;
    g.stroke(outline);
  }, false);
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
  const plainSteel = new THREE.MeshStandardMaterial({ color: 0xb4b9bf, metalness: 0.88, roughness: 0.4 });
  const flapTiles = new THREE.MeshStandardMaterial({ map: makeFlapTileTexture(), metalness: 0.05, roughness: 0.82 });
  const hingeMat = new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0.1, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.6, roughness: 0.55, side: THREE.DoubleSide });
  const bellMat = new THREE.MeshStandardMaterial({ color: 0x4a4744, metalness: 0.75, roughness: 0.45, side: THREE.DoubleSide });

  const rocket = new THREE.Group();
  rocket.name = 'starship';

  // ======================= Super Heavy booster =======================
  const booster = new THREE.Group();
  const SKIRT = 1.55;                // engine bells poke out below this
  const TRUSS_H = 2.9;               // integrated hot-stage truss
  const TANK_TOP = DIM.booster - TRUSS_H;

  const bodyH = TANK_TOP - SKIRT;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, bodyH, 64, 1, true),
    new THREE.MeshStandardMaterial({ map: makeBoosterTexture(bodyH), metalness: 0.88, roughness: 0.36 }),
  );
  body.position.y = SKIRT + bodyH / 2;
  booster.add(body);

  const basePlate = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 40), dark);
  basePlate.rotation.x = Math.PI / 2;
  basePlate.position.y = SKIRT + 0.45;
  booster.add(basePlate);

  // 33 Raptors: 3 centre, 10 middle, 20 outer.
  booster.add(engineCluster(bellMat, [
    { ring: 0.78, count: 3, exit: 0.65, throat: 0.28, height: 2.0 },
    { ring: 2.2, count: 10, exit: 0.65, throat: 0.28, height: 2.0 },
    { ring: 3.84, count: 20, exit: 0.6, throat: 0.28, height: 2.0 },
  ]));

  // Forward dome, visible through the open truss.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R - 0.05, 40, 10, 0, TAU, 0, Math.PI / 2),
    plainSteel,
  );
  dome.scale.y = 0.2;
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
    const N = 22;
    const y0 = TANK_TOP + 0.3, y1 = DIM.booster - 0.3, rr = R - 0.18;
    const struts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 8), flangeMat, N * 2);
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

  // Three large fixed grid fins in a T layout: an opposite pair plus one on the heat-shield side.
  {
    const lattice = new THREE.MeshStandardMaterial({
      map: makeLatticeTexture(), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.45,
    });
    const frame = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.8, roughness: 0.45 });
    const FIN_Y = TANK_TOP - 3.8;
    const finGeo = new THREE.BoxGeometry(4.0, 0.5, 4.6);
    for (const deg of [50, 230, 320]) {
      const fin = new THREE.Mesh(finGeo, [frame, frame, lattice, lattice, frame, frame]);
      fin.position.set(0, FIN_Y, R + 4.6 / 2 - 0.3);
      booster.add(atAzimuth(rad(deg), fin));
      const root = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.8), plainSteel);
      root.position.set(0, FIN_Y, R + 0.25);
      booster.add(atAzimuth(rad(deg), root));
    }
  }

  // External raceway down the side.
  {
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.45, 56, 0.3), plainSteel);
    rw.position.set(0, 3.5 + 28, R + 0.12);
    booster.add(atAzimuth(rad(196), rw));
  }

  rocket.add(booster);

  // ============================ Ship ============================
  const ship = new THREE.Group();
  ship.position.y = DIM.booster;

  const N = 208; // evenly spaced in height so the skin texture maps without stretching
  const profile = [];
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * DIM.ship;
    profile.push(new THREE.Vector2(shipRadius(y), y));
  }
  const skin = makeShipTextures();
  const hull = new THREE.Mesh(
    // Starting the sweep on the leeward side puts the heat shield's centreline at u = 0.5.
    new THREE.LatheGeometry(profile, 72, Math.PI, TAU),
    new THREE.MeshStandardMaterial({
      map: skin.color, roughnessMap: skin.surface, metalnessMap: skin.surface, roughness: 1, metalness: 1,
    }),
  );
  ship.add(hull);

  const shipBase = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 40), dark);
  shipBase.rotation.x = Math.PI / 2;
  shipBase.position.y = 0.2;
  ship.add(shipBase);

  // Six Raptors (3 sea-level, 3 vacuum) hanging into the hot-stage truss.
  const shipEngines = engineCluster(bellMat, [
    { ring: 0.78, count: 3, exit: 0.65, throat: 0.28, height: 1.6 },
    { ring: 2.9, count: 3, exit: 1.15, throat: 0.3, height: 1.9, phase: Math.PI / 3 },
  ]);
  shipEngines.position.y = -1.7;
  ship.add(shipEngines);

  // Aft flaps: tall and fairly narrow, at 90 degrees either side of the heat shield's centreline.
  const E = 0.25; // how far flap roots are buried in the hull
  const aft = [
    [R - E, 0.6], [R + 3.1, 0.6], [R + 3.1, 8.0], [R + 0.6, 13.2], [R - E, 13.4],
  ];
  // Forward flaps: smaller, on the nose, swept toward the leeward side.
  const yb = NOSE_BASE + 1.2, yt = yb + 6.4;
  const fwd = [
    [shipRadius(yb) - E, yb],
    [shipRadius(yb) + 2.5, yb],
    [shipRadius(yb) + 2.5, yb + 2.5],
    [shipRadius(yt) + 0.45, yt],
  ];
  for (let i = 0; i < 6; i++) {
    const y = yt + (yb - yt) * (i / 6);
    fwd.push([shipRadius(y) - E, y]);
  }
  for (const sgn of [1, -1]) {
    ship.add(makeFlap(aft, rad(90 * sgn), 0.6, flapTiles, plainSteel));
    ship.add(makeFlap(fwd, rad(118 * sgn), 0.4, flapTiles, plainSteel));
    // Hinge fairing along the aft flap's root.
    const hinge = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 12.2, 4, 10), hingeMat);
    hinge.position.set(0, 0.6 + 6.4, R + 0.2);
    ship.add(atAzimuth(rad(90 * sgn), hinge));
  }

  // Leeward raceway.
  {
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.45, 31, 0.3), plainSteel);
    rw.position.set(0, 2.5 + 15.5, R + 0.12);
    ship.add(atAzimuth(rad(180), rw));
  }

  rocket.add(ship);
  return rocket;
}
