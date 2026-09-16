import test from 'node:test';
import assert from 'node:assert/strict';
import { breathAt, sneezeAt, createRoute, landingPlatform, isSlick, zoneAt, springForce, launchSpeed, SUMMIT } from '../src/physics.js';

test('breathing has a readable inhale, rest, exhale, rest cycle', () => {
  assert.equal(breathAt(2).phase, 'INHALE'); assert.ok(breathAt(2).flow > 0);
  assert.equal(breathAt(6).phase, 'REST'); assert.equal(breathAt(6).flow, 0);
  assert.equal(breathAt(9).phase, 'EXHALE'); assert.ok(breathAt(9).flow < 0);
  assert.equal(breathAt(13).phase, 'REST');
  assert.equal(breathAt(58).big, true); assert.ok(breathAt(58).flow > breathAt(2).flow * 2);
});
test('sneezes have a grace period, long warning, short blast, and cooldown', () => {
  assert.equal(sneezeAt(50).phase, 'none'); assert.equal(sneezeAt(52).phase, 'warning');
  assert.equal(sneezeAt(56).phase, 'warning'); assert.equal(sneezeAt(57).phase, 'blast');
  assert.equal(sneezeAt(59).phase, 'none'); assert.equal(sneezeAt(126).phase, 'none'); assert.equal(sneezeAt(127).phase, 'warning');
});
test('all six zones form one reachable climb with regular safe checkpoints', () => {
  const route = createRoute(); assert.equal(route.at(-1).y, SUMMIT);
  assert.equal(new Set(route.map(p => zoneAt(p.y))).size, 6);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    assert.ok(b.y - a.y <= 1.5); assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < 3);
    if (b.checkpoint) assert.equal(b.slick, false);
  }
  assert.equal(route.filter(p => p.checkpoint).length, 8);
});
test('landing is swept vertically, rejects upward motion and missed ledges', () => {
  const pads = [{ x: 0, y: 3, z: 0, radius: 1 }, { x: 0, y: 1, z: 0, radius: 1 }];
  assert.equal(landingPlatform(pads, 4, { x: 0, y: .5, z: 0 }, -6), pads[0]);
  assert.equal(landingPlatform(pads, 4, { x: 0, y: .5, z: 0 }, 6), null);
  assert.equal(landingPlatform(pads, 4, { x: 2, y: .5, z: 0 }, -6), null);
});
test('slickness alternates; tethers only pull and slingshots remain bounded', () => {
  const pad = { slick: true, index: 0 };
  assert.equal(isSlick(pad, 2), true); assert.equal(isSlick(pad, 7), false);
  assert.equal(isSlick({ slick: false }, 2), false);
  assert.equal(springForce(.5, 2), 0); assert.equal(springForce(99, 2), 24);
  assert.equal(launchSpeed(0), 0); assert.equal(launchSpeed(20), 10);
});
