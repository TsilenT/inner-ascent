import * as THREE from 'three';
import './style.css';
import { createWorld } from './world.js';
import { NoseAudio } from './audio.js';
import { SUMMIT, ZONES, clamp, zoneAt, breathAt, sneezeAt, isSlick, landingPlatform, springForce, launchSpeed, formatTime } from './physics.js';

const $ = id => document.getElementById(id);
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = v(0, 1, 0);
const canvas = $('world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  $('loading').classList.add('hidden'); $('error').classList.remove('hidden');
  $('error-message').textContent = 'This nose needs WebGL 2. Enable hardware acceleration in your browser, then try again.';
  throw error;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.xr.enabled = true;
renderer.xr.setFoveation(1);
renderer.xr.setFramebufferScaleFactor(.9);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x18271f);
scene.fog = new THREE.FogExp2(0x283b2a, .028);
const rig = new THREE.Group(); scene.add(rig);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .04, 105);
camera.rotation.order = 'YXZ'; rig.add(camera);
scene.add(new THREE.HemisphereLight(0xdcebc5, 0x293a28, 1.55));
const key = new THREE.PointLight(0xf5edc0, 48, 34, 1.6); scene.add(key);
const fill = new THREE.PointLight(0xa3d88b, 35, 25, 1.6); scene.add(fill);
const sun = new THREE.DirectionalLight(0xf9e6b7, .9); sun.position.set(2, 14, 5); scene.add(sun);
const world = createWorld(scene);
const audio = new NoseAudio();
const keys = new Set();
const velocity = v();
const ray = new THREE.Raycaster();
const temp = v(), temp2 = v(), cameraWorld = v(), forward = v(), right = v();
const q = new THREE.Quaternion();
const state = { mode: 'menu', time: 0, visualTime: 0, zone: 0, checkpoint: 0, pollen: 0, sneezes: 0, grounded: true, platform: 0, maxHeight: 0, fingerStart: -1, fingerDone: false, lastSneeze: 'none', threadCooldown: 0, announcementUntil: 0, warning: '', grips: 0, respawns: 0, wonAt: 0 };
let yaw = 0, pitch = 0, mantle = null, thread = null, lastTime = 0, uiTime = 0, helpReturn = 'menu', lastJump = -10, snapReady = true;
let aimed = null, pendingPointer = false, xrSupported = false;
const holdMat = new THREE.MeshStandardMaterial({ color: 0xc7e586, roughness: .2, emissive: 0xa6d764, emissiveIntensity: .15 });
const handGeo = new THREE.SphereGeometry(1, 14, 10);
const strandMat = new THREE.MeshBasicMaterial({ color: 0xd2f39b, transparent: true, opacity: .75 });
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
function makeHand() {
  const hand = new THREE.Group();
  const blob = new THREE.Mesh(handGeo, holdMat.clone()); blob.scale.set(.1, .09, .14); hand.add(blob);
  for (let i = 0; i < 3; i++) { const nub = new THREE.Mesh(handGeo, blob.material); nub.position.set((i - 1) * .064, 0, -.11); nub.scale.set(.045, .048, .07); hand.add(nub); }
  return hand;
}
const hands = [0, 1].map(i => {
  const desktop = makeHand(); desktop.position.set(i ? .3 : -.3, -.28, -.48); camera.add(desktop);
  const controller = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i); rig.add(controller, grip);
  const vrHand = makeHand(); grip.add(vrHand);
  const line = new THREE.Mesh(cylinder, strandMat.clone()); line.visible = false; scene.add(line);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe4ffae })); marker.visible = false; scene.add(marker);
  const pointer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v(), v(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xc9e893, transparent: true, opacity: .23 })); pointer.scale.z = 3; controller.add(pointer);
  return { desktop, controller, grip, vrHand, line, marker, pointer, holding: false, anchor: v(), local: v(), previousAnchor: v(), previousHand: v(), restOffset: v(), charge: 0, age: 0, object: null, source: null, lastJumpButton: false, lastResetButton: false, pullVelocity: v() };
});
const tetherLine = new THREE.Mesh(cylinder, new THREE.MeshBasicMaterial({ color: 0x9be5d5, transparent: true, opacity: .75 })); tetherLine.visible = false; scene.add(tetherLine);

// A readable panel actually rendered in the headset; DOM overlays alone don't work in VR.
const xrCanvas = document.createElement('canvas'); xrCanvas.width = 1024; xrCanvas.height = 512;
const xrContext = xrCanvas.getContext('2d'), xrTexture = new THREE.CanvasTexture(xrCanvas);
const xrPanel = new THREE.Mesh(new THREE.PlaneGeometry(.8, .4), new THREE.MeshBasicMaterial({ map: xrTexture, transparent: true, depthTest: false, depthWrite: false }));
xrPanel.position.set(0, -.4, -1.4); xrPanel.renderOrder = 10; camera.add(xrPanel); xrPanel.visible = false;

function announce(title, body, duration = 5) {
  $('announcement-title').textContent = title; $('announcement-body').textContent = body;
  $('announcement').classList.add('show'); state.announcementUntil = state.time + duration;
  state.message = `${title} | ${body}`;
}
function showMode() {
  for (const [id, shown] of [['menu', state.mode === 'menu'], ['hud', state.mode === 'playing'], ['pause-screen', state.mode === 'paused'], ['ending', state.mode === 'won']]) $(id).classList.toggle('hidden', !shown);
  hands.forEach(h => { h.desktop.visible = !renderer.xr.isPresenting && (state.mode === 'playing' || state.mode === 'paused'); });
}
function requestPointer() {
  if (renderer.xr.isPresenting || pendingPointer || document.pointerLockElement === canvas) return;
  pendingPointer = true;
  try { const result = canvas.requestPointerLock(); if (result?.catch) result.catch(() => {}).finally(() => { pendingPointer = false; }); else pendingPointer = false; } catch { pendingPointer = false; }
}
function alignToNext() {
  const p = world.platforms[Math.min(state.platform + 1, 64)];
  yaw = Math.atan2(-(p.x - rig.position.x), -(p.z - rig.position.z)); pitch = .08;
  rig.rotation.y = 0; camera.rotation.set(pitch, yaw, 0, 'YXZ');
}
function startGame() {
  audio.start(); keys.clear(); releaseAll(false); thread = null; mantle = null; lastJump = -10;
  Object.assign(state, { mode: 'playing', time: 0, zone: 0, checkpoint: 0, pollen: 0, sneezes: 0, sneezeAnchored: false, grounded: true, platform: 0, maxHeight: 0, fingerStart: -1, fingerDone: false, lastSneeze: 'none', threadCooldown: 0, respawns: 0, wonAt: 0 });
  for (const m of world.motes) m.taken = false;
  const first = world.platforms[0]; rig.position.set(first.x, first.y, first.z); velocity.set(0, 0, 0);
  rig.rotation.set(0, 0, 0); camera.position.set(0, renderer.xr.isPresenting ? 0 : 1.05, 0);
  if (!renderer.xr.isPresenting) alignToNext();
  $('help').classList.add('hidden'); showMode();
  announce('A very small beginning.', renderer.xr.isPresenting ? 'Grip a ledge and pull down. Trigger casts a mucus thread.' : 'Follow the glowing ledges. Tap SPACE to make your first climb.', 9);
}
function pauseGame() {
  if (state.mode !== 'playing' || renderer.xr.isPresenting) return;
  state.mode = 'paused'; keys.clear(); releaseAll(false); mantle = null; velocity.set(0, 0, 0);
  if (document.pointerLockElement) document.exitPointerLock(); showMode();
}
function resumeGame() { state.mode = 'playing'; showMode(); requestPointer(); audio.start(); }
function respawn() {
  releaseAll(false); thread = null; mantle = null; velocity.set(0, 0, 0);
  const p = world.platforms[state.checkpoint]; rig.position.set(p.x, p.y + .02, p.z); state.platform = p.index; state.grounded = true; state.respawns++;
  if (!renderer.xr.isPresenting) alignToNext();
  announce('Still a booger. Still a legend.', 'Back at your last sanctuary. Dignity mostly intact.', 4); audio.grab();
}
function win() {
  if (state.mode !== 'playing') return;
  state.mode = 'won'; state.wonAt = state.visualTime; releaseAll(false); thread = null; velocity.set(0, 0, 0); mantle = null;
  audio.win(); world.emit(world.golden.position, 180, 5);
  $('end-time').textContent = formatTime(state.time); $('end-pollen').textContent = state.pollen; $('end-sneezes').textContent = state.sneezes;
  try {
    const previous = Number(localStorage.getItem('booger-best')) || Infinity;
    const best = Math.min(previous, state.time); localStorage.setItem('booger-best', String(best));
    $('best-time').textContent = `PERSONAL BEST ${formatTime(best)}${state.time <= previous ? ' · A HISTORIC NOSE DAY' : ''}`;
  } catch { $('best-time').textContent = 'A HISTORIC NOSE DAY'; }
  if (document.pointerLockElement) document.exitPointerLock(); showMode();
}

function handWorld(h, out = v()) { return (renderer.xr.isPresenting ? h.grip : h.desktop).getWorldPosition(out); }
function aimFrom(h = null, range = 3.4) {
  scene.updateMatrixWorld(true);
  if (h && renderer.xr.isPresenting) { h.controller.getWorldPosition(temp); h.controller.getWorldQuaternion(q); temp2.set(0, 0, -1).applyQuaternion(q); }
  else { camera.getWorldPosition(temp); camera.getWorldDirection(temp2); }
  ray.set(temp, temp2); ray.near = .025; ray.far = range;
  return ray.intersectObjects(world.climbables, false)[0] || null;
}
function fallbackHold(range = 3) {
  // Aim assist finds nearby organic ledges, never an invisible point in empty air.
  camera.getWorldPosition(cameraWorld); camera.getWorldDirection(forward);
  let best = null, bestScore = Infinity;
  for (const p of world.platforms) {
    temp.set(p.x, p.y, p.z).sub(cameraWorld);
    const distance = temp.length(), dot = temp.clone().normalize().dot(forward);
    if (distance < range && dot > -.15 && distance - dot < bestScore) {
      bestScore = distance - dot; best = { object: p.cap, point: v(p.x, p.y, p.z), distance };
    }
  }
  return best;
}
function attach(h) {
  if (state.mode !== 'playing' || h.holding) return;
  const hit = aimFrom(h) || (!renderer.xr.isPresenting ? fallbackHold() : null);
  if (!hit) { audio.tone(75, .08, .04); return; }
  mantle = null; h.holding = true; h.object = hit.object; h.anchor.copy(hit.point); h.local.copy(hit.point); hit.object.worldToLocal(h.local);
  h.previousAnchor.copy(h.anchor); h.previousHand.copy(renderer.xr.isPresenting ? h.grip.position : h.desktop.position);
  h.restOffset.copy(h.anchor).sub(handWorld(h)); h.age = 0; h.charge = 0; h.pullVelocity.set(0, 0, 0);
  hit.object.userData.held = (hit.object.userData.held || 0) + 1;
  h.vrHand.children[0].material.emissiveIntensity = .8; h.desktop.children[0].material.emissiveIntensity = .8;
  velocity.set(0, 0, 0); audio.grab(); world.emit(hit.point, 7, .8); haptic(h, .45, 45);
  state.grips++;
  if (hit.object.userData.kind === 'hair') announce('A follicular leap of faith.', 'Hair holds sway with the breath. Stretch, then let go.', 3);
}
function release(h, launch = true) {
  if (!h.holding) return;
  if (launch && state.mode === 'playing') {
    if (h.charge > .17) {
      const direction = h.anchor.clone().sub(rig.position).normalize(); direction.y = Math.max(.48, direction.y); direction.normalize();
      velocity.copy(direction.multiplyScalar(launchSpeed(h.charge) + 2));
      audio.release(h.charge); world.emit(handWorld(h), 12, 2);
      announce('SNOT ROCKET.', 'An elegant solution to an undignified problem.', 2);
    } else if (renderer.xr.isPresenting) velocity.copy(h.pullVelocity).clampLength(0, 5);
    else audio.release();
  }
  h.object.userData.held = Math.max(0, (h.object.userData.held || 1) - 1);
  h.holding = false; h.object = null; h.line.visible = h.marker.visible = false; h.charge = 0;
  h.vrHand.children[0].material.emissiveIntensity = .15; h.desktop.children[0].material.emissiveIntensity = .15;
}
function releaseAll(launch) { hands.forEach(h => release(h, launch)); }
function haptic(h, intensity, duration) { try { h.source?.gamepad?.hapticActuators?.[0]?.pulse(intensity, duration)?.catch?.(() => {}); } catch { /* Optional hardware feature. */ } }
function castThread(h = null) {
  if (state.mode !== 'playing') return;
  if (thread) { thread = null; audio.release(); return; }
  if (state.time < state.threadCooldown) return;
  const hit = aimFrom(h, 8) || (!renderer.xr.isPresenting ? fallbackHold(5) : null);
  if (!hit) { announce('Nothing to stick to.', 'Aim at a ledge, hair, or the cavern wall.', 2); return; }
  const local = hit.object.worldToLocal(hit.point.clone());
  thread = { object: hit.object, local, anchor: hit.point.clone(), until: state.time + 4.5, rest: Math.max(1.1, hit.distance * .55) };
  state.threadCooldown = state.time + 6; audio.release(.6); if (h) haptic(h, .3, 40);
}
function nextLedge() {
  let result = null;
  for (const p of world.platforms) {
    const dy = p.y - rig.position.y, distance = Math.hypot(p.x - rig.position.x, p.z - rig.position.z);
    if (dy > .35 && dy <= 2.15 && distance < 3.9 && (!result || p.y < result.y)) result = p;
  }
  return result;
}
function jump() {
  if (state.mode !== 'playing' || mantle || state.time - lastJump < .35) return;
  const target = nextLedge();
  if (target && (state.grounded || hands.some(h => h.holding) || thread)) {
    releaseAll(false); thread = null;
    mantle = { from: rig.position.clone(), target, age: 0, duration: renderer.xr.isPresenting ? 1.6 : 1.15 };
    state.grounded = false; lastJump = state.time; audio.jump();
  } else if (state.grounded || hands.some(h => h.holding)) {
    releaseAll(false); velocity.y = 6.4; state.grounded = false; lastJump = state.time; audio.jump();
  }
}

function updateXR(dt) {
  if (!renderer.xr.isPresenting) return;
  const session = renderer.xr.getSession();
  if (session?.visibilityState === 'hidden') return;
  const held = hands.filter(h => h.holding);
  if (held.length) {
    const delta = v();
    for (const h of held) {
      const movement = h.previousHand.clone().sub(h.grip.position).applyQuaternion(rig.quaternion);
      delta.addScaledVector(movement, .76 / held.length);
      h.pullVelocity.lerp(movement.clone().divideScalar(Math.max(.001, dt)), .35);
      h.previousHand.copy(h.grip.position);
      h.object.localToWorld(h.anchor.copy(h.local));
      delta.addScaledVector(h.anchor.clone().sub(h.previousAnchor), 1 / held.length); h.previousAnchor.copy(h.anchor);
    }
    rig.position.add(delta.clampLength(0, .45));
    for (const h of held) {
      const stretch = h.anchor.clone().sub(handWorld(h)).sub(h.restOffset).length(); h.charge = clamp(stretch, 0, 1.5);
    }
  }
  for (const h of hands) {
    const gp = h.source?.gamepad; if (!gp) continue;
    const axes = gp.axes, x = axes[axes.length - 2] || 0, y = axes[axes.length - 1] || 0;
    if (h.source.handedness === 'left' && state.mode === 'playing' && !held.length && !mantle) {
      renderer.xr.getCamera().getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(forward, UP);
      const sx = Math.abs(x) > .18 ? x : 0, sy = Math.abs(y) > .18 ? y : 0;
      velocity.x += (forward.x * -sy + right.x * sx) * dt * 10; velocity.z += (forward.z * -sy + right.z * sx) * dt * 10;
    }
    if (h.source.handedness === 'right') {
      if (Math.abs(x) > .7 && snapReady) {
        releaseAll(false);
        renderer.xr.getCamera().getWorldPosition(temp); temp.sub(rig.position);
        const turn = -Math.sign(x) * Math.PI / 6; rig.rotation.y += turn;
        rig.position.add(temp).sub(temp.clone().applyAxisAngle(UP, turn)); snapReady = false;
      } else if (Math.abs(x) < .25) snapReady = true;
      const a = gp.buttons[4]?.pressed, b = gp.buttons[5]?.pressed;
      if (a && !h.lastJumpButton) { if (state.mode === 'won') startGame(); else jump(); }
      if (b && !h.lastResetButton && state.mode === 'playing') respawn();
      h.lastJumpButton = a; h.lastResetButton = b;
    }
  }
}

function updatePhysics(dt, breath, sneeze) {
  const previousY = rig.position.y;
  const held = hands.filter(h => h.holding);
  for (const h of held) {
    h.age += dt; h.object.localToWorld(h.anchor.copy(h.local));
    if (isSlick(h.object.userData.platform || {}, state.time) && h.age > 1.7) {
      release(h, false); announce('A slippery situation.', 'That hold is runny. Find a fresh patch.', 3); audio.release();
    }
  }
  const gripping = hands.some(h => h.holding);
  if (mantle) {
    // Comfort-friendly assisted pull, available equally on desktop and VR's A button.
    mantle.age += dt; const t = Math.min(1, mantle.age / mantle.duration), ease = t * t * (3 - 2 * t);
    const p = mantle.target; temp.set(p.x, p.y + .02, p.z);
    rig.position.lerpVectors(mantle.from, temp, ease); rig.position.y += Math.sin(t * Math.PI) * .5;
    velocity.set(0, 0, 0);
    if (sneeze.phase === 'blast' && sneeze.strength > .2) { mantle = null; velocity.y = -5; }
    else if (t === 1) { land(p); mantle = null; }
    return;
  }
  if (!renderer.xr.isPresenting) {
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(forward, UP);
    const dx = Number(keys.has('KeyD')) - Number(keys.has('KeyA')), dz = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    temp.copy(forward).multiplyScalar(dz).addScaledVector(right, dx).normalize();
    if (gripping) {
      velocity.set(0, 0, 0);
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) {
        const h = hands.find(h => h.holding); const away = rig.position.clone().sub(h.anchor); away.y = -.18; away.normalize();
        if (h.charge < 1.5) rig.position.addScaledVector(away, dt * .65);
        hands.forEach(h => { if (h.holding) h.charge = Math.min(1.5, h.charge + dt * .8); });
      } else {
        rig.position.addScaledVector(temp, dt * 1.1);
        if (keys.has('KeyW')) rig.position.y += dt * 1.15;
        for (const h of hands) if (h.holding) {
          rig.position.add(h.anchor.clone().sub(h.previousAnchor).multiplyScalar(1 / held.length)); h.previousAnchor.copy(h.anchor);
        }
      }
    } else {
      velocity.x += temp.x * dt * (state.grounded ? 22 : 11); velocity.z += temp.z * dt * (state.grounded ? 22 : 11);
    }
  }
  if (gripping) {
    velocity.set(0, 0, 0);
    for (const h of hands) if (h.holding && handWorld(h).distanceTo(h.anchor) > 6.5) release(h);
  } else {
    velocity.y -= 9.3 * dt;
    const airflow = breath.flow * (state.zone === 3 ? 5.5 : 1.9);
    if (!state.grounded) {
      velocity.y += airflow * dt;
      const p = world.platforms[Math.min(64, state.platform + 1)]; temp.set(p.x - rig.position.x, 0, p.z - rig.position.z).normalize();
      velocity.addScaledVector(temp, breath.flow * dt * (state.zone === 3 ? 2.2 : .35));
    }
    if (sneeze.phase === 'blast') { velocity.y -= sneeze.strength * 32 * dt; temp.copy(rig.position); temp.y = 0; temp.normalize(); velocity.addScaledVector(temp, sneeze.strength * 4 * dt); state.grounded = false; }
    if (thread) {
      thread.object.localToWorld(thread.anchor.copy(thread.local));
      temp.copy(thread.anchor).sub(rig.position).add(v(0, -.7, 0)); const distance = temp.length();
      velocity.addScaledVector(temp.normalize(), springForce(distance, thread.rest) * dt);
      if (state.time > thread.until || distance > 12) thread = null;
    }
    const damping = Math.exp(-(state.grounded ? 6.5 : 1.2) * dt); velocity.x *= damping; velocity.z *= damping;
    velocity.clampLength(0, 15); rig.position.addScaledVector(velocity, dt);
  }
  const radius = 8.45 + (state.zone === 4 ? 3.3 : 0), radial = Math.hypot(rig.position.x, rig.position.z);
  if (radial > radius) { rig.position.x *= radius / radial; rig.position.z *= radius / radial; velocity.x *= .25; velocity.z *= .25; }
  const landing = landingPlatform(world.platforms, previousY, rig.position, velocity.y);
  if (landing) { rig.position.y = landing.y; if (!state.grounded && velocity.y < -2) { audio.grab(); world.emit(rig.position, 8, 1.3); } land(landing); }
  else state.grounded = false;
  if (rig.position.y < world.platforms[state.checkpoint].y - 9 || rig.position.y < -3) respawn();
}

function land(p) {
  velocity.y = 0; state.grounded = true; state.platform = p.index;
  if (p.checkpoint && p.index > state.checkpoint) { state.checkpoint = p.index; audio.checkpoint(); world.emit(v(p.x, p.y + .15, p.z), 36, 2); announce('Sanctuary found.', 'Your progress is safe. Your life choices are another matter.', 4); }
}
function updateProgress(sneeze) {
  state.maxHeight = Math.max(state.maxHeight, rig.position.y);
  const zone = zoneAt(rig.position.y);
  if (zone !== state.zone) {
    state.zone = zone; announce(ZONES[zone][0], ZONES[zone][2], 6);
  }
  if (!state.fingerDone && (state.time > 23 || rig.position.y > 10)) {
    state.fingerDone = true; state.fingerStart = state.time; audio.rumble(); announce('Something has entered the chat.', 'THE GREAT PICKER APPROACHES. Higher ground seems wise.', 7);
  }
  const fingerAge = state.fingerStart < 0 ? -1 : state.time - state.fingerStart;
  if (fingerAge > 4 && fingerAge < 10 && rig.position.y < 4.5 && rig.position.distanceTo(world.finger.position) < 3.7 && !hands.some(h => h.holding)) {
    velocity.y = 5; velocity.z = -4;
  }
  if (sneeze.phase !== state.lastSneeze) {
    if (sneeze.phase === 'warning') { audio.rumble(); announce('Ah… ah…', 'SNEEZE INCOMING. GRAB SOMETHING AND HOLD ON.', 5); }
    if (sneeze.phase === 'blast') { audio.sneeze(); state.sneezeAnchored = hands.some(h => h.holding); if (state.sneezeAnchored) hands.forEach(h => haptic(h, .8, 150)); }
    if (state.lastSneeze === 'blast' && state.sneezeAnchored) state.sneezes++;
    state.lastSneeze = sneeze.phase;
  }
  if (sneeze.phase === 'blast' && !hands.some(h => h.holding)) state.sneezeAnchored = false;
  state.warning = sneeze.phase === 'warning' ? '⚠ AH… AH… GRAB A HOLD!' : sneeze.phase === 'blast' ? 'ACHOOO! HOLD TIGHT!' : '';
  for (const m of world.motes) {
    if (!m.taken && rig.position.distanceTo(m.mesh.position) < 1.4) { m.taken = true; state.pollen++; audio.pollen(); world.emit(m.mesh.position, 16, 1.5); }
  }
  camera.getWorldPosition(cameraWorld);
  if (cameraWorld.distanceTo(world.golden.position) < 1.65 || hands.some(h => handWorld(h).distanceTo(world.golden.position) < .65)) win();
}
function connectLine(line, a, b, width) {
  line.visible = true; line.position.copy(a).add(b).multiplyScalar(.5); temp.copy(b).sub(a);
  line.scale.set(width, temp.length(), width); line.quaternion.setFromUnitVectors(UP, temp.normalize());
}
function updateHands(time) {
  for (const [i, h] of hands.entries()) {
    const playing = state.mode === 'playing';
    h.desktop.visible = !renderer.xr.isPresenting && playing;
    if (!h.holding) { h.line.visible = h.marker.visible = false; h.desktop.position.y = -.28 + Math.sin(time * 2.3 + i) * .009; h.desktop.scale.set(1, 1, 1); }
    else {
      h.object.localToWorld(h.anchor.copy(h.local));
      const pos = handWorld(h); connectLine(h.line, pos, h.anchor, .018 / (1 + h.charge));
      h.line.material.color.setHex(h.charge > .5 ? 0xffe59a : 0xd2f39b);
      h.marker.visible = true; h.marker.position.copy(h.anchor); h.marker.scale.setScalar(1 + Math.sin(time * 8) * .15);
      h.desktop.scale.set(1 - h.charge * .15, 1 + h.charge * .15, 1 + h.charge * .4);
    }
    h.pointer.visible = renderer.xr.isPresenting && !h.holding && playing;
  }
  if (thread && state.mode === 'playing') {
    camera.getWorldPosition(temp2); temp2.y -= .25; connectLine(tetherLine, temp2, thread.anchor, .012);
  } else tetherLine.visible = false;
}
function drawXR(breath) {
  xrPanel.visible = renderer.xr.isPresenting;
  if (!xrPanel.visible) return;
  const x = xrContext;
  x.clearRect(0, 0, 1024, 512); x.fillStyle = 'rgba(14,30,22,.82)'; x.beginPath(); x.roundRect(10, 10, 1004, 492, 30); x.fill();
  x.textAlign = 'center'; x.fillStyle = '#deefac';
  if (state.mode === 'won') {
    x.font = 'bold 65px Arial'; x.fillText('YOU HAVE ASCENDED.', 512, 130); x.font = '30px monospace'; x.fillText('THE NOSE REMEMBERS.', 512, 200);
    x.font = '28px monospace'; x.fillText(`${formatTime(state.time)}  /  ${state.pollen} POLLEN`, 512, 290); x.fillText('Press A or either trigger to be reborn', 512, 400);
    xrPanel.position.set(0, 0, -1.7); xrPanel.scale.setScalar(1.8);
  } else {
    xrPanel.position.set(0, -.43, -1.4); xrPanel.scale.setScalar(1);
    x.font = '24px monospace'; x.fillText('BOOGER / INNER ASCENT', 512, 66);
    x.font = 'bold 42px Arial'; x.fillText(ZONES[state.zone][0], 512, 128);
    x.font = '30px monospace'; x.fillText(`${Math.max(0, Math.floor(rig.position.y))} / 96 M   ·   ${state.pollen} POLLEN`, 512, 187);
    x.fillStyle = state.warning ? '#ffce89' : '#d6f39a'; x.font = 'bold 31px monospace'; x.fillText(state.warning || `${breath.big ? 'BIG ' : ''}${breath.phase}`, 512, 253);
    x.fillStyle = '#384a30'; x.fillRect(220, 277, 584, 8); x.fillStyle = '#cce88f'; x.fillRect(220, 277, 584 * breath.progress, 8);
    x.font = '22px monospace'; x.fillStyle = '#dbe9c2';
    x.fillText(`${hands[0].holding ? 'LEFT: STUCK' : 'LEFT: FREE'}    ${hands[1].holding ? 'RIGHT: STUCK' : 'RIGHT: FREE'}`, 512, 334);
    x.font = '21px Arial';
    if (state.announcementUntil > state.time) {
      const text = state.message.split(' | '); x.fillText(text[0], 512, 395); x.font = '19px Arial'; x.fillText(text[1], 512, 432, 950);
    } else { x.fillText('Grip + pull to climb · Trigger: thread · A: climb assist', 512, 395); x.fillText('Left stick: move · Right stick: snap turn · B: sanctuary', 512, 435); }
  }
  xrTexture.needsUpdate = true;
}
function updateUI(breath) {
  $('height').textContent = Math.max(0, Math.floor(rig.position.y)); $('altitude-fill').style.height = `${clamp(rig.position.y / SUMMIT, 0, 1) * 100}%`;
  $('zone-name').textContent = ZONES[state.zone][0]; $('zone-subtitle').textContent = ZONES[state.zone][1];
  $('breath-label').textContent = `${breath.big ? 'DEEP ' : ''}${breath.phase}`;
  $('breath-fill').style.width = `${breath.progress * 100}%`; $('breath-orb').style.transform = `scale(${.8 + Math.abs(breath.flow) * .3})`;
  $('breath-tip').textContent = breath.phase === 'INHALE' ? 'Air rises. A good time to let go.' : breath.phase === 'EXHALE' ? 'Air falls. Find a hold and stay sticky.' : 'A quiet moment. Plan your next move.';
  $('pollen-count').textContent = String(state.pollen).padStart(2, '0');
  for (const [i, id] of ['left-status', 'right-status'].entries()) {
    const h = hands[i]; $(id).textContent = `${i ? 'R' : 'L'} · ${h.holding ? h.charge > .3 ? `STRETCH ${Math.round(h.charge / 1.5 * 100)}%` : 'STUCK' : 'FREE'}`; $(id).classList.toggle('active', h.holding);
  }
  $('thread-status').textContent = thread ? 'THREAD ATTACHED' : state.time < state.threadCooldown ? `THREAD ${Math.ceil(state.threadCooldown - state.time)}s` : 'THREAD READY';
  $('hazard').classList.toggle('hidden', !state.warning); $('hazard').textContent = state.warning;
  if (state.time > state.announcementUntil) $('announcement').classList.remove('show');
  if (!renderer.xr.isPresenting && state.mode === 'playing') {
    aimed = aimFrom() || fallbackHold(); $('crosshair').classList.toggle('targeted', !!aimed);
    $('target-hint').textContent = hands.some(h => h.holding) ? 'HOLD SHIFT TO STRETCH · RELEASE TO SLING' : aimed ? aimed.object.userData.kind === 'hair' ? 'GRAB HAIR · CLICK' : 'STICK · CLICK / E' : nextLedge() ? 'SPACE · CLIMB NEXT LEDGE' : '';
  }
  drawXR(breath);
}

// Desktop input. Pointer-lock refusal still leaves drag-to-look usable.
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape') { if (state.mode === 'playing') pauseGame(); return; }
  if (state.mode !== 'playing') return;
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') jump();
  if (e.code === 'KeyE') attach(hands[0]);
  if (e.code === 'KeyQ') castThread();
  if (e.code === 'KeyR') respawn();
  if (e.code === 'KeyM') toggleSound();
});
window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'KeyE') release(hands[0]); });
window.addEventListener('mousemove', e => {
  if (state.mode !== 'playing' || renderer.xr.isPresenting) return;
  if (document.pointerLockElement !== canvas && !(e.buttons & 1)) return;
  yaw -= e.movementX * .002; pitch = clamp(pitch - e.movementY * .002, -1.4, 1.4); camera.rotation.set(pitch, yaw, 0, 'YXZ');
});
canvas.addEventListener('mousedown', e => { if (state.mode !== 'playing') return; e.preventDefault(); requestPointer(); attach(hands[e.button === 2 ? 1 : 0]); });
window.addEventListener('mouseup', e => { if (e.button === 0) release(hands[0]); if (e.button === 2) release(hands[1]); });
window.addEventListener('contextmenu', e => { if (state.mode === 'playing') e.preventDefault(); });
document.addEventListener('pointerlockchange', () => { pendingPointer = false; if (!document.pointerLockElement && state.mode === 'playing' && !renderer.xr.isPresenting) pauseGame(); });
window.addEventListener('blur', () => { keys.clear(); if (!renderer.xr.isPresenting) pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !renderer.xr.isPresenting) pauseGame(); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pauseGame(); $('error-message').textContent = 'The graphics context took a breather. Reload to grow a fresh nose.'; $('error').classList.remove('hidden'); });

$('play').onclick = () => { startGame(); requestPointer(); };
$('pause').onclick = pauseGame; $('resume').onclick = resumeGame;
$('checkpoint').onclick = () => { respawn(); resumeGame(); };
$('restart-pause').onclick = $('restart').onclick = () => { startGame(); requestPointer(); };
function toggleSound() { audio.start(); const enabled = audio.toggle(); $('sound-menu').innerHTML = `SOUND ${enabled ? 'ON' : 'OFF'} <span>${enabled ? '◖))' : '◖×'}</span>`; $('sound-pause').textContent = `SOUND ${enabled ? 'ON' : 'OFF'} / toggle`; }
$('sound-menu').onclick = $('sound-pause').onclick = toggleSound;
$('how-to').onclick = () => { helpReturn = 'menu'; $('help').classList.remove('hidden'); $('close-help').focus(); };
$('pause-help').onclick = () => { helpReturn = 'paused'; $('help').classList.remove('hidden'); $('close-help').focus(); };
$('close-help').onclick = () => { $('help').classList.add('hidden'); (helpReturn === 'menu' ? $('how-to') : $('resume')).focus(); };

hands.forEach(h => {
  h.controller.addEventListener('connected', e => { h.source = e.data; });
  h.controller.addEventListener('disconnected', () => { release(h, false); h.source = null; });
  h.controller.addEventListener('squeezestart', () => attach(h));
  h.controller.addEventListener('squeezeend', () => release(h));
  h.controller.addEventListener('selectstart', () => { if (state.mode === 'won') startGame(); else castThread(h); });
});
async function checkXR() {
  if (!isSecureContext) { $('vr-note').textContent = 'HEADSET PLAY NEEDS HTTPS · DESKTOP IS READY'; return; }
  try { xrSupported = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch { xrSupported = false; }
  $('enter-vr').classList.toggle('available', xrSupported);
  $('vr-resume').classList.toggle('hidden', !xrSupported);
  if (xrSupported) $('vr-note').textContent = 'HEADSET DETECTED · YOUR TINY HANDS ARE READY';
}
$('vr-resume').onclick = $('enter-vr').onclick = async () => {
  if (!xrSupported) {
    $('vr-note').textContent = isSecureContext ? 'OPEN THIS PAGE IN YOUR QUEST BROWSER TO ENTER VR' : 'USE npm run dev:https OR USB PORT FORWARDING FOR VR';
    return;
  }
  try {
    audio.start();
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    await renderer.xr.setSession(session);
  } catch (error) { $('vr-note').textContent = `VR COULD NOT START: ${error.message}. DESKTOP IS READY.`; $('vr-resume').textContent = 'VR UNAVAILABLE · TRY AGAIN'; }
};
renderer.xr.addEventListener('sessionstart', () => {
  document.body.classList.add('xr'); if (document.pointerLockElement) document.exitPointerLock();
  if (state.mode === 'menu' || state.mode === 'won') startGame();
  else { state.mode = 'playing'; camera.position.set(0, 0, 0); showMode(); }
  hands.forEach(h => { h.desktop.visible = false; });
});
renderer.xr.addEventListener('sessionend', () => {
  document.body.classList.remove('xr'); releaseAll(false); keys.clear(); camera.position.set(0, 1.05, 0); alignToNext();
  if (state.mode === 'playing') state.mode = 'paused'; showMode();
});

function animate(milliseconds) {
  const dt = Math.min(.045, Math.max(.001, (milliseconds - (lastTime || milliseconds - 16)) / 1000)); lastTime = milliseconds;
  state.visualTime += dt;
  const active = state.mode === 'playing' && (!renderer.xr.isPresenting || renderer.xr.getSession()?.visibilityState !== 'hidden');
  if (active) state.time += dt;
  const breath = breathAt(state.mode === 'menu' ? state.visualTime : state.time), sneeze = sneezeAt(state.time);
  // A sneeze interrupts the normal rhythm: a rising, rapid intake, then an outward blast.
  if (state.mode !== 'menu' && sneeze.phase === 'warning') {
    breath.flow = .6 + sneeze.strength * 2.8; breath.phase = 'INHALE'; breath.big = true; breath.progress = sneeze.strength;
  } else if (state.mode !== 'menu' && sneeze.phase === 'blast') {
    breath.flow = -4 * sneeze.strength; breath.phase = 'EXHALE'; breath.big = true;
  }
  const fingerAge = state.fingerStart < 0 ? -1 : state.time - state.fingerStart;
  const slowMo = state.mode === 'won' && state.visualTime - state.wonAt < 5 ? .2 : 1;
  const worldTime = state.mode === 'menu' ? state.visualTime : state.mode === 'won' ? state.time + (state.visualTime - state.wonAt) * .2 : state.time;
  world.update(worldTime, state.mode === 'paused' ? 0 : dt * slowMo, breath, rig.position.y, state.mode, fingerAge);
  world.root.rotation.z = active && !renderer.xr.isPresenting && sneeze.phase === 'warning' ? Math.sin(state.time * 42) * .0015 * sneeze.strength : 0;
  if (state.mode === 'menu') {
    rig.position.set(0, 0, 0); camera.position.set(.2 + Math.sin(state.visualTime * .1) * .08, 5.6, 8); camera.lookAt(.1, 5, -1.5);
    key.position.set(1, 8, 5); fill.position.set(5, 4, -1);
  } else {
    if (active) {
      updateXR(dt);
      // Bounded substeps keep landings reliable even during a slow frame.
      const steps = Math.ceil(dt / (1 / 90)); for (let i = 0; i < steps; i++) updatePhysics(dt / steps, breath, sneeze);
      updateProgress(sneeze);
    }
    key.position.copy(rig.position).add(v(1, 6, 2)); fill.position.copy(rig.position).add(v(-3, 1, -3));
    const fogColor = new THREE.Color(state.zone === 4 ? 0x203e3b : state.zone === 2 ? 0x2c4237 : 0x283b2a); scene.fog.color.lerp(fogColor, dt);
    if (state.mode === 'won' && Math.random() < dt * 8) world.emit(world.golden.position, 12, 3);
  }
  updateHands(state.visualTime);
  if ((uiTime += dt) > .09) { updateUI(breath); uiTime = 0; }
  camera.updateWorldMatrix(true, false);
  // Listener uses a world-space proxy, including the tracked XR head pose.
  const listenerCamera = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  listenerCamera.getWorldPosition(cameraWorld);
  audio.update(breath, { position: cameraWorld, matrixWorld: listenerCamera.matrixWorld }, active);
  renderer.render(scene, camera);
}

showMode(); checkXR(); renderer.setAnimationLoop(animate); $('loading').classList.add('hidden');

// Development-only diagnostics: never exported by a production build.
if (import.meta.env.DEV) {
  window.__BOOGER__ = {
    state, rig, velocity, world, hands, renderer, camera,
    start: startGame, jump, respawn, attach: i => attach(hands[i]), release: i => release(hands[i]), castThread,
    snapshot: () => ({ mode: state.mode, y: rig.position.y, platform: state.platform, checkpoint: state.checkpoint, pollen: state.pollen, zone: state.zone, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, thread: !!thread, holding: hands.map(h => h.holding), charge: hands.map(h => h.charge) }),
  };
}
