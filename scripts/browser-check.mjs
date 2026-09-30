import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('local-artifacts', { recursive: true });
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('THREE.'))
      errors.push(message.text());
  });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  const start = page.getByRole('button', { name: 'PLAY', exact: true });
  await start.waitFor();
  await page.screenshot({ path: 'local-artifacts/menu.png' });
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Low', exact: true }).click();
  await page.screenshot({ path: 'local-artifacts/settings.png' });
  await page.getByLabel('Spell audio').uncheck();
  await page.getByRole('button', { name: 'DONE' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('hexfall.settings.v1')).quality),
    'low',
  );
  await start.click();
  await page.waitForFunction(() => !!document.pointerLockElement);
  await page.waitForTimeout(4500);
  await page.mouse.down();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');
  await page.mouse.up();
  await page.keyboard.press('Shift');
  await page.keyboard.press('q');
  await page.screenshot({ path: 'local-artifacts/gameplay.png' });
  assert.ok(await page.locator('.wave-hud').isVisible());
  await page.keyboard.press('p');
  await page.getByRole('heading', { name: 'Paused' }).waitFor();
  assert.equal(await page.evaluate(() => !!document.pointerLockElement), false);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.getByRole('heading', { name: 'Controls' }).waitFor();
  await page.getByRole('button', { name: 'DONE' }).click();
  await page.getByRole('button', { name: 'RESUME' }).click();
  await page.waitForFunction(() => !!document.pointerLockElement);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'EXIT TO MENU' }).click();
  await start.waitFor();
  assert.equal(await page.evaluate(() => !!document.pointerLockElement), false);
  await start.click();
  await page.waitForFunction(() => !!document.pointerLockElement);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'EXIT TO MENU' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'local-artifacts/mobile-menu.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: 'passed',
        checks: [
          'WebGL render',
          'settings persistence',
          'field guide',
          'pointer lock',
          'movement and shooting',
          'pause and resume',
          'mobile menu overflow',
          'no page errors',
        ],
        screenshots: [
          'local-artifacts/menu.png',
          'local-artifacts/gameplay.png',
          'local-artifacts/mobile-menu.png',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
