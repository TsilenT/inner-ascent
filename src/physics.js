// Shared, deterministic rules. Units are meters and seconds, including in XR.
export const SUMMIT = 96;
export const ZONES = [
  ['Nostril Entrance', 'Every legend starts somewhere unfortunate.', 'Reach. Stick. Pull. You are remarkably adhesive.'],
  ['The Hair Forest', 'The trees are hairs. Try not to think about it.', 'Grab a hair and let it carry you.'],
  ['The Drip', 'A whole ocean, having a very slow day.', 'Blue holds go slick. Keep your little hands moving.'],
  ['The Wind Tunnel', 'You are small. The lungs are not.', 'Launch on the inhale. Hold tight on the exhale.'],
  ['The Sinus Cavern', 'A cathedral to questionable biology.', 'Breathe. Even a booger deserves a moment.'],
  ['The Final Ascent', 'Greatness is just a little farther up.', 'The golden one awaits. Make the nose proud.'],
];
export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export const zoneAt = y => clamp(Math.floor(Math.max(0, y) / 16), 0, 5);
export function seededRandom(seed = 13) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function breathAt(time) {
  const cycle = 14;
  const t = ((time % cycle) + cycle) % cycle;
  const big = Math.floor(time / cycle) % 5 === 4;
  let phase = 'REST', flow = 0, progress = 0;
  if (t < 5) { phase = 'INHALE'; flow = Math.sin(t / 5 * Math.PI); progress = t / 5; }
  else if (t < 6.5) { progress = (t - 5) / 1.5; }
  else if (t < 12) { phase = 'EXHALE'; flow = -Math.sin((t - 6.5) / 5.5 * Math.PI); progress = (t - 6.5) / 5.5; }
  else progress = (t - 12) / 2;
  return { phase, flow: flow * (big ? 2.25 : 1), big, progress, cycleProgress: t / cycle };
}
export function sneezeAt(time) {
  // A generous initial grace period and a 75 second cooldown between sneezes.
  if (time < 52) return { phase: 'none', strength: 0 };
  const t = (time - 52) % 75;
  if (t < 4.5) return { phase: 'warning', strength: t / 4.5 };
  if (t < 5.8) return { phase: 'blast', strength: Math.sin((t - 4.5) / 1.3 * Math.PI) };
  return { phase: 'none', strength: 0 };
}
export function routePoint(index) {
  const y = index * 1.5;
  const angle = index * .37;
  const r = 6 + Math.sin(index * .36) * .6;
  return { x: Math.sin(angle) * r, y, z: Math.cos(angle) * r };
}
export function createRoute() {
  return Array.from({ length: 65 }, (_, i) => ({
    ...routePoint(i), index: i, radius: i % 10 === 0 || i === 64 ? 1.75 : 1.18,
    checkpoint: i % 10 === 0 || i === 64,
    slick: i % 10 !== 0 && i !== 64 && ((i >= 23 && i < 32 && i % 3 !== 0) || (i > 53 && i % 4 === 0)),
    moving: i >= 24 && i < 30 && i % 2 === 0,
  }));
}
export function isSlick(platform, time) { return platform.slick && Math.sin(time * .65 + platform.index) > -.25; }
export function landingPlatform(platforms, previousY, position, velocityY) {
  if (velocityY > 0) return null;
  let found = null;
  for (const p of platforms) {
    if (previousY >= p.y - .08 && position.y <= p.y + .06 && Math.hypot(position.x - p.x, position.z - p.z) < p.radius + .16 && (!found || p.y > found.y)) found = p;
  }
  return found;
}
export function springForce(distance, rest, stiffness = 17) { return clamp((distance - rest) * stiffness, 0, 24); }
export function launchSpeed(stretch) { return clamp(stretch * 6.5, 0, 10); }
export function formatTime(seconds) { const s = Math.floor(seconds); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
