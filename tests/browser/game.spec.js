import { test, expect } from '@playwright/test';

test('title, guide, desktop input, real climb, pause and recovery work', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  await page.screenshot({ path: 'artifacts/title.png' });
  await expect(page.locator('h1')).toHaveText('BOOGER.');
  await page.getByRole('button', { name: 'How to be a booger' }).click();
  await expect(page.locator('#help')).toBeVisible(); await page.locator('#close-help').click();
  await page.locator('#play').click(); await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.state.platform)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.state.pollen)).toBeGreaterThan(0);
  await page.keyboard.down('KeyE');
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.hands[0].holding)).toBe(true);
  await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(650);
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.hands[0].charge)).toBeGreaterThan(.2);
  await page.keyboard.up('KeyE'); await page.keyboard.up('ShiftLeft');
  await expect(page.locator('#announcement-title')).toHaveText('SNOT ROCKET.');
  await page.keyboard.press('KeyR');
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.state.platform)).toBe(0);
  await page.keyboard.press('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.snapshot().thread)).toBe(true);
  await page.keyboard.press('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.snapshot().thread)).toBe(false);
  await page.screenshot({ path: 'artifacts/playing.png' });
  await page.keyboard.press('Escape'); await expect(page.locator('#pause-screen')).toBeVisible();
  const paused = await page.evaluate(() => window.__BOOGER__.state.time); await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__BOOGER__.state.time)).toBe(paused);
  await page.locator('#resume').click(); await expect(page.locator('#hud')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the whole route is traversable using the shipped desktop climbing mechanic', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 750 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#play').click();
  // Real animation frames and keyboard input: no teleporting or bypassing collisions.
  for (let i = 1; i <= 64; i++) {
    await page.keyboard.press('Space');
    if (i < 64) await expect.poll(() => page.evaluate(() => window.__BOOGER__.state.platform), { timeout: 7000, intervals: [100] }).toBeGreaterThanOrEqual(i);
    else await expect(page.locator('#ending')).toBeVisible({ timeout: 7000 });
    if (i === 10) expect(await page.evaluate(() => window.__BOOGER__.state.checkpoint)).toBe(10);
    // Wait at a safe sanctuary and hold through a complete, real-time sneeze.
    // Poll simulation time: software rendering can run slower than wall time.
    if (i === 20) {
      await page.keyboard.down('KeyE');
      await expect.poll(() => page.evaluate(() => window.__BOOGER__.hands[0].holding)).toBe(true);
      await expect.poll(() => page.evaluate(() => window.__BOOGER__.state.time), { timeout: 90000 }).toBeGreaterThan(59);
      await expect.poll(() => page.evaluate(() => window.__BOOGER__.state.sneezes)).toBeGreaterThan(0);
      await page.keyboard.up('KeyE');
    }
  }
  await expect(page.locator('#ending')).toBeVisible();
  await expect(page.locator('.end-subtitle')).toHaveText('THE NOSE REMEMBERS.');
  await page.screenshot({ path: 'artifacts/ending.png' });
  await page.locator('#restart').click(); await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('Space'); await expect.poll(() => page.evaluate(() => window.__BOOGER__.state.platform)).toBe(1);
  expect(errors).toEqual([]);
});

test('sneeze anchoring, timed slippery holds, and the one-off finger event', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 750 });
  await page.goto('/'); await page.locator('#play').click();
  await page.keyboard.down('KeyE');
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.hands[0].holding)).toBe(true);
  await page.evaluate(() => { window.__BOOGER__.state.time = 52.1; });
  await expect(page.locator('#hazard')).toContainText('GRAB A HOLD');
  await page.evaluate(() => { window.__BOOGER__.state.time = 56.8; });
  await expect(page.locator('#hazard')).toContainText('ACHOOO');
  const anchoredHeight = await page.evaluate(() => window.__BOOGER__.rig.position.y);
  await page.waitForTimeout(350);
  expect(Math.abs(await page.evaluate(() => window.__BOOGER__.rig.position.y) - anchoredHeight)).toBeLessThan(.1);
  await page.keyboard.up('KeyE');
  await page.evaluate(() => { window.__BOOGER__.state.time = 57; });
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.velocity.y)).toBeLessThan(-1);
  await page.keyboard.press('KeyR');
  await page.evaluate(() => {
    const g = window.__BOOGER__; g.state.time = 3; g.state.fingerDone = false; g.state.fingerStart = -1;
    const p = g.world.platforms[25]; g.rig.position.set(p.x, p.y, p.z); g.state.platform = 25; g.state.checkpoint = 20;
    g.camera.lookAt(p.x, p.y - .2, p.z); g.velocity.set(0, 0, 0);
  });
  await page.keyboard.down('KeyE');
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.hands[0].holding)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.hands[0].holding), { timeout: 7000 }).toBe(false);
  await page.keyboard.up('KeyE');
  await expect(page.locator('#announcement-title')).toHaveText('A slippery situation.');
  await page.evaluate(() => { const g = window.__BOOGER__; g.state.time = 20; g.state.fingerStart = 15; });
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.world.finger.visible)).toBe(true);
  await page.evaluate(() => { window.__BOOGER__.state.time += 15; });
  await expect.poll(() => page.evaluate(() => window.__BOOGER__.world.finger.visible)).toBe(false);
});
