// How big is Starship? — camera feed underneath, true-scale rocket drawn on top,
// with the phone's orientation sensors steering the virtual camera.
import * as THREE from '../vendor/three.module.min.js';
import { buildStarship, DIM } from './starship.js';
import {
  COMPARE, SKY, buildCompare, buildGuides, buildContactShadow, buildDemoWorld, makeEnvironment,
} from './scenery.js';

const $ = (sel) => document.querySelector(sel);
const clamp = THREE.MathUtils.clamp;
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;

const MIN_D = 30, MAX_D = 2000;
const EYE = 1.6;        // eye height of someone standing, metres
const STOREY = 3.1;     // metres per floor
const LONG_FOV = 66;    // field of view along the long side of a typical phone's main camera

const state = {
  mode: 'idle',         // 'camera' | 'demo'
  sensors: false,       // true once real orientation readings arrive
  heading: 0,           // compass-like bearing of the rocket from the viewer, radians
  distance: 200,
  floor: 0,
  aspect: rad(140),     // which side of the rocket faces the viewer
  compare: 'none',
  guides: true,
  trim: 1,
  lookYaw: 0,           // drag-to-look fallback when there are no sensors
  lookPitch: 0.28,
};

const video = $('#cam');
const canvas = $('#gl');

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
scene.environment = makeEnvironment(renderer);
scene.fog = new THREE.FogExp2(SKY.horizon, 0.00022);

const camera = new THREE.PerspectiveCamera(60, 1, 3, 15000);
camera.rotation.order = 'YXZ';

// "site" is the patch of ground the rocket stands on. In its local frame +X is the viewer's
// right and +Z points back toward the viewer, so everything on it keeps facing the same way.
const site = new THREE.Group();
scene.add(site);

const rocket = buildStarship();
site.add(rocket);
site.add(buildContactShadow());

const guides = buildGuides();
site.add(guides);

const sun = new THREE.DirectionalLight(0xfff4e2, 3.2);
sun.position.set(-120, 260, 210);
site.add(sun, sun.target);
site.add(new THREE.HemisphereLight(0xdfe9ff, 0x6b665c, 0.55));

const demoWorld = buildDemoWorld();
demoWorld.visible = false;
scene.add(demoWorld);

let compareObject = null;
function setCompare(id) {
  state.compare = id;
  if (compareObject) {
    site.remove(compareObject);
    compareObject.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
    });
  }
  compareObject = buildCompare(id);
  if (compareObject) site.add(compareObject);
  for (const b of $('#compare-list').children) b.setAttribute('aria-pressed', String(b.dataset.id === id));
}

function eyeHeight() {
  return EYE + state.floor * STOREY;
}

function layout() {
  const { heading: h, distance: d } = state;
  site.position.set(Math.sin(h) * d, 0, -Math.cos(h) * d);
  site.rotation.y = -h;
  rocket.rotation.y = state.aspect;
  guides.visible = state.guides;
  guides.userData.setDistance(d);
  camera.position.set(0, eyeHeight(), 0);
}

// ---------------------------------------------------------------- field of view
// The virtual camera must see exactly as wide as the part of the video that is on screen,
// otherwise the rocket would be drawn at the wrong size.
function updateProjection() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const tanLong = Math.tan(rad(LONG_FOV) / 2);
  const vw = video.videoWidth, vh = video.videoHeight;
  let tanV;
  if (state.mode === 'camera' && vw && vh) {
    const tanVideoV = vh >= vw ? tanLong : (tanLong * vh) / vw;
    const cover = Math.max(w / vw, h / vh);
    tanV = (tanVideoV * h) / (vh * cover);
  } else {
    tanV = h >= w ? tanLong : (tanLong * h) / w;
  }
  camera.fov = deg(2 * Math.atan(tanV / state.trim));
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', updateProjection);
video.addEventListener('resize', updateProjection);
video.addEventListener('loadedmetadata', updateProjection);

// ---------------------------------------------------------------- orientation sensors
const ori = { alpha: 0, beta: 90, gamma: 0 };
let needsPlacement = false;
let cameraFailed = false;

function onOrientation(e) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  ori.alpha = e.alpha; ori.beta = e.beta; ori.gamma = e.gamma;
  if (!state.sensors) {
    state.sensors = true;
    needsPlacement = true;
    if (!cameraFailed) toast('Drag to slide it sideways · pinch to change the distance', 5000);
  }
}

const _zee = new THREE.Vector3(0, 0, 1);
const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2); // camera looks out of the back of the phone
const targetQ = new THREE.Quaternion();

function deviceQuaternion(out) {
  const screenAngle = rad(screen.orientation?.angle ?? window.orientation ?? 0);
  _euler.set(rad(ori.beta), rad(ori.alpha), -rad(ori.gamma), 'YXZ');
  return out.setFromEuler(_euler).multiply(_q1).multiply(_q0.setFromAxisAngle(_zee, -screenAngle));
}

const _v = new THREE.Vector3();
function placeInFront() {
  _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
  if (Math.hypot(_v.x, _v.z) < 0.25) {
    // Phone is pointing almost straight up or down: use the direction its top edge points instead.
    const lookingUp = _v.y > 0;
    _v.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (lookingUp) _v.negate();
  }
  state.heading = Math.atan2(_v.x, -_v.z);
}

// ---------------------------------------------------------------- gestures
const pointers = new Map();
let pinch = null;

function pinchState() {
  const [a, b] = [...pointers.values()];
  return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pinch = pointers.size === 2 ? pinchState() : null;
  closeSheets();
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  const radPerPx = rad(camera.fov) / window.innerHeight;

  if (pointers.size === 1) {
    if (state.sensors) {
      state.heading += dx * radPerPx;           // slide the rocket around you
    } else {
      state.lookYaw += dx * radPerPx;           // no sensors: drag the view instead
      state.lookPitch = clamp(state.lookPitch + dy * radPerPx, -1.2, 1.5);
    }
  } else if (pointers.size === 2 && pinch) {
    const now = pinchState();
    if (now.dist > 10 && pinch.dist > 10) setDistance((state.distance * pinch.dist) / now.dist);
    let da = now.angle - pinch.angle;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    state.aspect -= da;                          // twist to turn the rocket
    pinch = now;
  }
});

function releasePointer(e) {
  pointers.delete(e.pointerId);
  pinch = null;
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setDistance(state.distance * Math.exp(e.deltaY * 0.0012));
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault()); // stop iOS page zoom

// ---------------------------------------------------------------- controls
const distanceInput = $('#distance');
const sliderToMetres = (v) => MIN_D * Math.pow(MAX_D / MIN_D, v / 1000);
const metresToSlider = (d) => (1000 * Math.log(d / MIN_D)) / Math.log(MAX_D / MIN_D);

function formatDistance(d) {
  const metres = d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${Math.round(d)} m`;
  const ft = d * 3.28084;
  const imperial = ft >= 5280 ? `${(ft / 5280).toFixed(2)} mi` : `${Math.round(ft / 10) * 10} ft`;
  return `${metres} away · ${imperial}`;
}

function setDistance(d, fromSlider = false) {
  state.distance = clamp(d, MIN_D, MAX_D);
  if (!fromSlider) distanceInput.value = metresToSlider(state.distance);
  $('#distance-value').textContent = formatDistance(state.distance);
}
distanceInput.addEventListener('input', () => setDistance(sliderToMetres(+distanceInput.value), true));

$('#btn-place').addEventListener('click', () => {
  placeInFront();
  toast('Starship is now straight ahead of you.');
});

const sheets = { compare: $('#sheet-compare'), options: $('#sheet-options') };
const sheetButtons = { compare: $('#btn-compare'), options: $('#btn-options') };
function closeSheets() {
  for (const k in sheets) { sheets[k].hidden = true; sheetButtons[k].setAttribute('aria-expanded', 'false'); }
}
for (const k in sheets) {
  sheetButtons[k].addEventListener('click', () => {
    const open = sheets[k].hidden;
    closeSheets();
    $('#toast').hidden = true;
    sheets[k].hidden = !open;
    sheetButtons[k].setAttribute('aria-expanded', String(open));
  });
}

for (const c of COMPARE) {
  const b = document.createElement('button');
  b.dataset.id = c.id;
  const name = document.createElement('b');
  name.textContent = c.name;
  const note = document.createElement('small');
  note.textContent = c.height ? `${Math.round(c.height)} m · ${Math.round(c.height * 3.28084)} ft` : c.note;
  b.append(name, note);
  b.addEventListener('click', () => { setCompare(c.id); closeSheets(); });
  $('#compare-list').append(b);
}

function setFloor(n) {
  state.floor = clamp(n, 0, 120);
  $('#floor-value').textContent = state.floor === 0 ? 'Ground' : `Floor ${state.floor}`;
  $('#floor-note').textContent = state.floor === 0
    ? 'Standing on the ground'
    : `About ${Math.round(eyeHeight())} m above the ground`;
}
$('#floor-up').addEventListener('click', () => setFloor(state.floor + 1));
$('#floor-down').addEventListener('click', () => setFloor(state.floor - 1));
$('#guides').addEventListener('change', (e) => { state.guides = e.target.checked; });
$('#trim').addEventListener('input', (e) => {
  state.trim = e.target.value / 100;
  $('#trim-value').textContent = `${e.target.value}%`;
  updateProjection();
});

let toastTimer = 0;
function toast(message, ms = 3200) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = true;           // restart the entrance animation
  void el.offsetWidth;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------------------------------------------------------------- off-screen helpers
const seek = $('#seek'), lookup = $('#lookup');
const _mid = new THREE.Vector3(), _top = new THREE.Vector3(), _cam = new THREE.Vector3();

function updateIndicators() {
  const w = window.innerWidth, h = window.innerHeight;
  _mid.set(site.position.x, DIM.total * 0.45, site.position.z);
  _cam.copy(_mid).applyMatrix4(camera.matrixWorldInverse);
  const inFront = _cam.z < 0;
  _mid.project(camera);
  const onScreen = inFront && Math.abs(_mid.x) < 0.95 && Math.abs(_mid.y) < 0.95;

  if (onScreen) {
    seek.hidden = true;
    _top.set(site.position.x, DIM.total, site.position.z).project(camera);
    lookup.hidden = !(_top.y > 1.02);
  } else {
    lookup.hidden = true;
    let dx = _cam.x, dy = _cam.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const reach = Math.min(w, h) / 2 - 64;
    seek.hidden = false;
    seek.style.transform = `translate(${w / 2 + dx * reach - 22}px, ${h / 2 - dy * reach - 30}px)`;
    seek.style.setProperty('--angle', `${deg(Math.atan2(dx, dy))}deg`);
  }
}

// ---------------------------------------------------------------- match the rocket's brightness to the camera
const probe = document.createElement('canvas');
probe.width = probe.height = 16;
const probeCtx = probe.getContext('2d', { willReadFrequently: true });
let exposureTarget = 1;

function sampleCameraBrightness() {
  if (state.mode !== 'camera' || video.readyState < 2) return;
  try {
    probeCtx.drawImage(video, 0, 0, 16, 16);
    const px = probeCtx.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const luma = sum / (256 * 255);
    exposureTarget = clamp(0.25 + 1.5 * luma, 0.25, 1.1);
  } catch { /* tainted or not ready: keep the last value */ }
}
setInterval(sampleCameraBrightness, 600);

// ---------------------------------------------------------------- photo
function drawVideoCover(ctx, w, h) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  const s = Math.max(w / vw, h / vh);
  ctx.drawImage(video, (w - vw * s) / 2, (h - vh * s) / 2, vw * s, vh * s);
}

async function takePhoto() {
  const w = canvas.width, h = canvas.height;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  if (state.mode === 'camera') drawVideoCover(ctx, w, h);
  renderer.render(scene, camera);           // the drawing buffer is only valid right after a render
  ctx.drawImage(canvas, 0, 0);

  const pad = Math.round(w * 0.035), size = Math.round(Math.max(w, h) * 0.02);
  ctx.font = `600 ${size}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = '#fff';
  ctx.fillText(`Starship · 124 m tall · shown ${Math.round(state.distance)} m away`, pad, h - pad);

  const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.92));
  if (!blob) return toast('Could not save the photo.');
  const file = new File([blob], 'starship.jpg', { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'How big is Starship?' }); return; } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'starship.jpg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Photo saved.');
}
$('#btn-shot').addEventListener('click', takePhoto);

// ---------------------------------------------------------------- start-up
async function start(wantCamera) {
  $('#start').disabled = true;

  // iOS only grants motion access from inside a tap, so ask before anything else is awaited.
  const DOE = window.DeviceOrientationEvent;
  let motion = 'granted';
  if (DOE && typeof DOE.requestPermission === 'function') {
    try { motion = await DOE.requestPermission(); } catch { motion = 'denied'; }
  }
  window.addEventListener('deviceorientation', onOrientation);

  let cameraError = null;
  if (wantCamera) {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      video.srcObject = stream;
      await video.play();
      state.mode = 'camera';
    } catch (err) {
      cameraError = err;
      cameraFailed = true;
    }
  }
  if (state.mode !== 'camera') {
    state.mode = 'demo';
    video.hidden = true;
    demoWorld.visible = true;
  }

  $('#intro').hidden = true;
  $('#hud').hidden = false;
  updateProjection();
  navigator.wakeLock?.request('screen').catch(() => {});

  if (cameraError) {
    const denied = cameraError.name === 'NotAllowedError';
    toast(denied
      ? 'Camera access was blocked, so here is a simulated field instead. Allow the camera in your browser settings and reload to use the real view.'
      : 'No camera available, so here is a simulated field instead.', 6500);
  }

  // Give the sensors a moment to report in; otherwise fall back to drag-to-look.
  setTimeout(() => {
    if (!state.sensors && !cameraError) {
      toast(motion === 'denied' && wantCamera
        ? 'Motion access was blocked, so drag to look around instead.'
        : 'Drag to look around · pinch or scroll to change the distance', 6000);
    }
  }, 1400);
}

$('#start').addEventListener('click', () => start(true));
$('#start-demo').addEventListener('click', () => start(false));

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (state.sensors) {
    deviceQuaternion(targetQ);
    if (needsPlacement) camera.quaternion.copy(targetQ);
    else camera.quaternion.slerp(targetQ, 1 - Math.exp(-dt * 18));
  } else {
    camera.rotation.set(state.lookPitch, state.lookYaw, 0);
  }
  if (needsPlacement) {
    placeInFront();
    needsPlacement = false;
  }

  layout();
  camera.updateMatrixWorld();
  if (state.mode !== 'idle') updateIndicators();

  const exposure = state.mode === 'camera' ? exposureTarget : 1;
  renderer.toneMappingExposure += (exposure - renderer.toneMappingExposure) * Math.min(1, dt * 3);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

setDistance(state.distance);
setFloor(0);
setCompare('none');
updateProjection();
requestAnimationFrame(frame);

// Handy for debugging from the console.
window.__starship = { state, camera, scene };
