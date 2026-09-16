import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRoute, seededRandom, zoneAt, isSlick, SUMMIT } from './physics.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const random = seededRandom(805);
const sphere = new THREE.SphereGeometry(1, 16, 12);
const pebble = new THREE.IcosahedronGeometry(1, 1);
const dummy = new THREE.Object3D();
const palette = [0x697151, 0x53694b, 0x507565, 0x4d6865, 0x315c61, 0x777050];
const mossColors = [0xb9cc76, 0xadc979, 0x81d6bc, 0xb0cf92, 0x8df0d9, 0xd7db8a];

function material(color, roughness = .5, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness, ...extra }); }
function organicTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d'), data = ctx.createImageData(256, 256);
  const noise = seededRandom(51);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const n = 115 + Math.sin(x * .13 + Math.sin(y * .06) * 3) * 20 + Math.sin(y * .12 + x * .03) * 15 + noise() * 40;
    const i = (y * 256 + x) * 4; data.data[i] = data.data[i + 1] = data.data[i + 2] = n; data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0); const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(8, 25); return texture;
}
function mesh(geometry, mat, position, scale, parent) {
  const m = new THREE.Mesh(geometry, mat);
  if (position) m.position.copy(position);
  if (scale) m.scale.copy(scale);
  if (parent) parent.add(m);
  return m;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(.12, 'rgba(255,255,220,.55)'); g.addColorStop(.4, 'rgba(255,255,220,.13)'); g.addColorStop(1, 'rgba(255,255,220,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const glowMap = glowTexture();
export function glow(color, size, parent, position) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size); if (position) s.position.copy(position); if (parent) parent.add(s); return s;
}
function curveMesh(points, radius, mat, parent, segments = 12) {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false), mat, null, null, parent);
}

export function makeBooger(color = 0xb4d959, size = 1) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: .21, metalness: .05, clearcoat: 1, clearcoatRoughness: .13, emissive: color, emissiveIntensity: .1 });
  const geo = new THREE.SphereGeometry(1, 36, 24), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + Math.sin(x * 5 + y * 3) * .055 + Math.cos(z * 5 - y * 4) * .045;
    p.setXYZ(i, x * f * (1 - y * .16), y * f * 1.12, z * f * .87);
  }
  geo.computeVertexNormals();
  mesh(geo, bodyMat, V(0, .1, 0), null, g);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.5;
    mesh(sphere, bodyMat, V(Math.sin(a) * .75, -.63, Math.cos(a) * .48), V(.4, .25, .38), g);
  }
  const eyeMat = material(0xf6f4d1, .25), pupilMat = material(0x15291d, .15);
  for (const side of [-1, 1]) {
    mesh(sphere, eyeMat, V(side * .3, .36, .74), V(.23, .27, .14), g);
    mesh(sphere, pupilMat, V(side * .3 + .025, .36, .855), V(.09, .13, .045), g);
    mesh(sphere, material(0xffffff, .1), V(side * .3 + .04, .4, .893), V(.029, .035, .02), g);
  }
  curveMesh([V(-.16, -.07, .85), V(0, -.14, .88), V(.18, -.06, .85)], .025, pupilMat, g, 8);
  const cheek = material(0x799f40, .3);
  [-1, 1].forEach(s => mesh(sphere, cheek, V(s * .5, .06, .76), V(.14, .07, .03), g));
  for (let i = 0; i < 15; i++) {
    const a = random() * Math.PI * 2, y = random() * 1.5 - .6, r = Math.sqrt(Math.max(.1, 1 - y * y)) * .93;
    mesh(sphere, material(0xd9ed9d, .2, { transparent: true, opacity: .38 }), V(Math.sin(a) * r, y, Math.cos(a) * r * .8), V(.045, .055, .035), g);
  }
  // Two little sticky arms; the player is this creature, never a human avatar.
  [-1, 1].forEach(s => {
    curveMesh([V(s * .7, 0, 0), V(s * 1.15, -.1, .14), V(s * 1.32, .12, .22)], .105, bodyMat, g);
    mesh(sphere, bodyMat, V(s * 1.32, .12, .22), V(.17, .19, .15), g);
  });
  g.scale.setScalar(size); g.userData.bodyMat = bodyMat; return g;
}

export function createWorld(scene) {
  const root = new THREE.Group(); scene.add(root);
  const climbables = [], hairs = [], strands = [], platforms = createRoute(), motes = [], pads = [];
  const wallMat = material(0xffffff, .38, { side: THREE.BackSide, vertexColors: true, bumpMap: organicTexture(), bumpScale: .2 });
  const wallGeo = new THREE.CylinderGeometry(10, 10, 116, 72, 100, true);
  wallGeo.translate(0, 51, 0);
  const p = wallGeo.attributes.position, colors = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), a = Math.atan2(p.getX(i), p.getZ(i));
    const cavern = y > 62 && y < 81 ? Math.sin((y - 62) / 19 * Math.PI) * 4 : 0;
    const radius = 9.1 + cavern + Math.sin(a * 7 + y * .25) * .55 + Math.sin(y * 1.3 + a * 3) * .24;
    p.setXYZ(i, Math.sin(a) * radius, y, Math.cos(a) * radius);
    const c = new THREE.Color(palette[zoneAt(y)]);
    c.multiplyScalar(.65 + (Math.sin(a * 13 + y * .8) * Math.sin(a * 7 - y * .9) + 1) * .2);
    colors.push(c.r, c.g, c.b);
  }
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); wallGeo.computeVertexNormals();
  const wall = mesh(wallGeo, wallMat, null, null, root); wall.userData.kind = 'wall'; climbables.push(wall);

  const rockMat = material(0x687054, .69), rocks = new THREE.InstancedMesh(pebble, rockMat, 530);
  for (let i = 0; i < 530; i++) {
    const y = random() * 110 - 4, a = random() * Math.PI * 2, r = 8.55 + (y > 64 && y < 80 ? Math.sin((y - 62) / 19 * Math.PI) * 3.8 : 0);
    dummy.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
    dummy.rotation.set(random() * 3, a, random() * 3); dummy.scale.set(.3 + random() * .85, .12 + random() * .45, .25 + random() * .9); dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix); rocks.setColorAt(i, new THREE.Color(palette[zoneAt(y)]).multiplyScalar(.7 + random() * .6));
  }
  root.add(rocks);
  // Organic folds are baked into one mesh to keep standalone headset draw calls low.
  const ribs = [];
  for (let y = -2; y < 108; y += 3.5) {
    const ring = [];
    for (let j = 0; j <= 64; j++) { const a = j / 64 * Math.PI * 2; const r = 8.85 + Math.sin(a * 5 + y) * .3 + (y > 62 && y < 81 ? Math.sin((y - 62) / 19 * Math.PI) * 3.7 : 0); ring.push(V(Math.sin(a) * r, y + Math.sin(a * 3 + y) * .5, Math.cos(a) * r)); }
    ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring), 64, .11 + random() * .14, 5, false));
  }
  mesh(mergeGeometries(ribs), material(0x637759, .3), null, null, root); ribs.forEach(g => g.dispose());

  const baseMat = material(0x3e503a, .6);
  platforms.forEach(pad => {
    const group = new THREE.Group(); group.position.set(pad.x, pad.y, pad.z); root.add(group);
    const capMat = new THREE.MeshPhysicalMaterial({ color: mossColors[zoneAt(pad.y)], roughness: .27, clearcoat: .7, emissive: mossColors[zoneAt(pad.y)], emissiveIntensity: pad.checkpoint ? .2 : .075 });
    const cap = mesh(sphere, capMat, V(0, -.15, 0), V(pad.radius, .25, pad.radius), group);
    cap.userData.kind = 'ledge'; cap.userData.platform = pad; climbables.push(cap);
    mesh(pebble, baseMat, V(0, -.55, 0), V(pad.radius * .99, .65, pad.radius * .98), group);
    const a = Math.atan2(pad.x, pad.z);
    mesh(pebble, baseMat, V(Math.sin(a) * 1.1, -.4, Math.cos(a) * 1.1), V(1.7, .35, 1.5), group);
    // A tiny luminous growth on each ledge marks the route without arrows in space.
    const bud = mesh(sphere, material(mossColors[zoneAt(pad.y)], .2, { emissive: mossColors[zoneAt(pad.y)], emissiveIntensity: 1.2 }), V(-.4, .18, .3), V(.1, .22, .1), group);
    if (pad.checkpoint) {
      glow(0xc5f08a, 3.2, group, V(0, .08, 0));
      const halo = mesh(new THREE.TorusGeometry(pad.radius * .86, .025, 5, 40), material(0xd5ed97, .5, { emissive: 0xd5ed97, emissiveIntensity: 1.6 }), V(0, .07, 0), null, group); halo.rotation.x = -Math.PI / 2;
    }
    pad.group = group; pad.cap = cap; pad.bud = bud; pad.base = { x: pad.x, y: pad.y, z: pad.z };
    if (pad.index % 2 === 1) {
      const mote = mesh(new THREE.OctahedronGeometry(.12), material(0xf1dc8b, .25, { emissive: 0xffdc71, emissiveIntensity: 1.8 }), V(pad.x, pad.y + .65, pad.z), null, root);
      const halo = glow(0xffdc7a, .9, mote); motes.push({ mesh: mote, halo, pad, taken: false });
    }
    pads.push(group);
  });

  const hairMat = material(0x282e1c, .4), tipMat = material(0x9ab878, .3, { emissive: 0x8fad61, emissiveIntensity: .16 });
  for (let i = 0; i < 78; i++) {
    const forest = i < 38, y = forest ? 1 + random() * 32 : 32 + random() * 66;
    const a = random() * Math.PI * 2, r = 7.5 + random() * .8, length = 3 + random() * 5;
    const group = new THREE.Group(); group.position.set(Math.sin(a) * r, y, Math.cos(a) * r); group.rotation.y = a; root.add(group);
    const hair = curveMesh([V(), V(.2, length * .35, -.4), V(.4, length * .7, -1.2), V(.15, length, -2.1)], .055 + random() * .04, hairMat, group, 16);
    hair.userData.kind = 'hair'; climbables.push(hair);
    mesh(sphere, tipMat, V(.15, length, -2.1), V(.09, .2, .09), group);
    hairs.push({ group, hair, phase: random() * 6, length, a });
  }

  const threadMat = new THREE.MeshPhysicalMaterial({ color: 0xbfddb1, transparent: true, opacity: .38, roughness: .18, clearcoat: 1 });
  for (let i = 0; i < 57; i++) {
    const y = 4 + random() * 100, a = random() * Math.PI * 2, r = 5.5 + random() * 2.3, len = 1.5 + random() * 5;
    const group = new THREE.Group(); group.position.set(Math.sin(a) * r, y, Math.cos(a) * r); root.add(group);
    curveMesh([V(), V(.08, -len * .5, 0), V(-.08, -len, .1)], .019 + random() * .025, threadMat, group, 8);
    mesh(sphere, threadMat, V(-.08, -len, .1), V(.07, .14, .07), group);
    strands.push({ group, phase: random() * 6 });
  }
  // THE DRIP: a vast hanging drop above a chain of moving, slippery shelves.
  const dripMat = new THREE.MeshPhysicalMaterial({ color: 0x7cbfa2, roughness: .1, metalness: .1, clearcoat: 1, transparent: true, opacity: .72 });
  const drip = mesh(sphere, dripMat, V(0, 42, 0), V(2.2, 4.5, 2.2), root);
  curveMesh([V(0, 51, 0), V(.2, 48, .1), V(0, 44, 0)], .23, dripMat, root);
  glow(0x95d7b8, 6, root, V(0, 40, 0));
  // SINUS CAVERN: a hanging constellation of translucent luminous growths.
  const crystals = [];
  for (let i = 0; i < 58; i++) {
    const a = random() * Math.PI * 2, r = 8 + random() * 3, y = 65 + random() * 15;
    dummy.position.set(Math.sin(a) * r, y, Math.cos(a) * r); dummy.scale.set(.12 + random() * .2, .6 + random() * 1.4, .14 + random() * .2); dummy.rotation.set(random(), a, random()); dummy.updateMatrix();
    const g = new THREE.IcosahedronGeometry(1, 0); g.applyMatrix4(dummy.matrix); crystals.push(g);
    if (i % 5 === 0) glow(0x70e6d1, 3, root, dummy.position);
  }
  mesh(mergeGeometries(crystals), material(0x94e9d2, .22, { emissive: 0x65cdbb, emissiveIntensity: .65 }), null, null, root); crystals.forEach(g => g.dispose());

  const final = platforms.at(-1);
  const golden = makeBooger(0xebc65f, .5); golden.position.set(final.x, SUMMIT + 1.05, final.z); root.add(golden);
  golden.userData.bodyMat.metalness = .65; golden.userData.bodyMat.emissiveIntensity = .5;
  glow(0xffdf76, 5, golden);
  const crown = new THREE.Group(); golden.add(crown);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mesh(new THREE.ConeGeometry(.09, .4, 5), material(0xffe58b, .2, { metalness: .6, emissive: 0xb98122, emissiveIntensity: .4 }), V(Math.sin(a) * .5, 1.17, Math.cos(a) * .5), null, crown); }

  // Entrance light and ridiculous finger encounter, kept deliberately non-anatomical.
  const floor = mesh(new THREE.CircleGeometry(10, 64), material(0x566044, .7), V(0, -.8, 0), null, root); floor.rotation.x = -Math.PI / 2;
  glow(0xe5d89e, 18, root, V(0, -.65, 0));
  const finger = new THREE.Group(); root.add(finger); finger.visible = false;
  const fingerMat = material(0xba9881, .65);
  const fingerBody = mesh(new THREE.CapsuleGeometry(1.35, 7, 6, 16), fingerMat, V(), null, finger); fingerBody.rotation.x = Math.PI / 2;
  mesh(sphere, material(0xe0c2a1, .35), V(0, .95, -2.9), V(.9, .16, 1.2), finger);
  const fingerShadow = mesh(new THREE.CircleGeometry(4, 32), new THREE.MeshBasicMaterial({ color: 0x10150e, transparent: true, opacity: 0, depthWrite: false }), V(0, -.6, 2), null, root); fingerShadow.rotation.x = -Math.PI / 2;

  // Foreground specimen is visible only in the title's live 3D diorama.
  const title = new THREE.Group(); root.add(title);
  const mascot = makeBooger(0xb9d865, 1.25); mascot.position.set(2.7, 4.5, 1); mascot.rotation.y = -.2; title.add(mascot);
  mesh(pebble, material(0x657649, .5), V(2.7, 2.62, 1), V(3.1, 1, 2.2), title);
  mesh(sphere, material(0x98b962, .22, { emissive: 0x6c9637, emissiveIntensity: .08 }), V(2.7, 3.01, 1), V(2.6, .23, 1.9), title);
  for (let i = 0; i < 12; i++) { const a = random() * 6.28; mesh(sphere, threadMat, V(2.7 + Math.sin(a) * 2, 2.45, 1 + Math.cos(a) * 1.5), V(.05, .11, .05), title); }

  const particleCount = 480, positions = new Float32Array(particleCount * 3), particleSeeds = [];
  for (let i = 0; i < particleCount; i++) { const a = random() * Math.PI * 2, r = random() * 8; positions.set([Math.sin(a) * r, random() * 40, Math.cos(a) * r], i * 3); particleSeeds.push(random()); }
  const particlesGeo = new THREE.BufferGeometry(); particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(particlesGeo, new THREE.PointsMaterial({ color: 0xe4f2bc, size: .11, map: glowMap, transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending })); root.add(particles);
  particles.frustumCulled = false;

  const burstPositions = new Float32Array(180 * 3), burstVelocity = [], burstLife = new Float32Array(180);
  const burstGeo = new THREE.BufferGeometry(); burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3));
  const burst = new THREE.Points(burstGeo, new THREE.PointsMaterial({ color: 0xeaf69e, size: .13, map: glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); burst.frustumCulled = false; root.add(burst);
  for (let i = 0; i < 180; i++) { burstPositions[i * 3 + 1] = -999; burstVelocity.push(V()); }
  let burstIndex = 0;
  function emit(at, count = 15, speed = 2) {
    for (let n = 0; n < count; n++) { const i = burstIndex++ % 180; burstPositions.set(at.toArray(), i * 3); burstVelocity[i].set((random() - .5) * speed, random() * speed, (random() - .5) * speed); burstLife[i] = 1 + random() * 1.4; }
    burstGeo.attributes.position.needsUpdate = true;
  }

  function update(time, dt, breath, playerY, mode, fingerAge) {
    title.visible = mode === 'menu';
    mascot.position.y = 4.5 + Math.sin(time * 1.7) * .045; mascot.scale.y = 1.25 + Math.sin(time * 1.7) * .025; mascot.rotation.z = Math.sin(time * .7) * .025;
    for (const h of hairs) { h.group.rotation.z = Math.sin(time * .75 + h.phase) * .04 + breath.flow * .065; h.group.rotation.x = Math.sin(time * .6 + h.phase) * .035 + (h.hair.userData.held ? .055 : 0); }
    for (const s of strands) { s.group.rotation.z = Math.sin(time + s.phase) * .02 + breath.flow * .07; }
    for (const pad of platforms) {
      if (pad.moving) { pad.x = pad.base.x + Math.sin(time * .65 + pad.index) * .35; pad.y = pad.base.y + Math.sin(time * .8 + pad.index) * .25; pad.group.position.set(pad.x, pad.y, pad.z); }
      pad.cap.material.color.setHex(isSlick(pad, time) ? 0x69bfd0 : mossColors[zoneAt(pad.y)]);
      const held = pad.cap.userData.held > 0;
      pad.cap.material.emissiveIntensity = held ? .85 : pad.checkpoint ? .24 : .085;
      pad.bud.scale.y = .22 + Math.sin(time * 2 + pad.index) * .035;
    }
    for (const m of motes) { m.mesh.visible = !m.taken; if (!m.taken) { m.mesh.position.set(m.pad.x, m.pad.y + .7 + Math.sin(time * 2 + m.pad.index) * .13, m.pad.z); m.mesh.rotation.y = time; } }
    drip.scale.y = 4.5 + Math.sin(time * .8) * .35; drip.rotation.z = breath.flow * .025;
    golden.rotation.y = Math.sin(time * .7) * .5; golden.position.y = SUMMIT + 1.05 + Math.sin(time * 1.7) * .15;
    const center = mode === 'menu' ? 8 : playerY;
    for (let i = 0; i < particleCount; i++) {
      const j = i * 3; positions[j + 1] += (breath.flow * (zoneAt(playerY) === 3 ? 3.5 : 1.4) + .06) * dt;
      positions[j] += Math.sin(time * .4 + particleSeeds[i] * 20) * dt * .065;
      if (positions[j + 1] < center - 15) positions[j + 1] += 38;
      if (positions[j + 1] > center + 23) positions[j + 1] -= 38;
    }
    particlesGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < 180; i++) if (burstLife[i] > 0) { burstLife[i] -= dt; const j = i * 3; burstVelocity[i].y -= dt * .4; burstPositions[j] += burstVelocity[i].x * dt; burstPositions[j + 1] += burstVelocity[i].y * dt; burstPositions[j + 2] += burstVelocity[i].z * dt; if (burstLife[i] <= 0) burstPositions[j + 1] = -999; }
    burstGeo.attributes.position.needsUpdate = true;
    finger.visible = fingerAge >= 3 && fingerAge < 12;
    if (fingerAge >= 0 && fingerAge < 12) {
      fingerShadow.material.opacity = Math.min(.85, fingerAge * .2) * (fingerAge > 9 ? (12 - fingerAge) / 3 : 1);
      finger.position.set(Math.sin(fingerAge) * .45, 2.2, 13 - Math.sin(Math.min(1, Math.max(0, (fingerAge - 3) / 7)) * Math.PI) * 11);
    } else fingerShadow.material.opacity = 0;
  }
  return { root, climbables, platforms, hairs, motes, golden, update, emit, title, finger, wall, particles };
}
