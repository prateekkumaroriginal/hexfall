import { chromium } from '@playwright/test';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startPreview } from './browser-test-server.mjs';

await mkdir('local-artifacts', { recursive: true });
const externalUrl = process.env['LOADING_TEST_URL'];
const preview = externalUrl ? null : await startPreview();
let browser;
try {
  browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: { width: 1536, height: 702 },
    deviceScaleFactor: 1.25,
  });
  page.setDefaultTimeout(30_000);
  const errors = [],
    warnings = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text());
  });
  await page.addInitScript(() => {
    window.runtimeShaderChanges = 0;
    const shaderSource = WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource = function (...args) {
      if (window.firstArenaFrame) window.runtimeShaderChanges++;
      return shaderSource.apply(this, args);
    };
    localStorage.setItem(
      'hexfall.settings.v1',
      JSON.stringify({
        quality: 'high',
        renderScale: 1,
        fieldOfView: 90,
        sensitivity: 1,
        sound: false,
      }),
    );
    const inspect = () => {
      const canvas = document.querySelector('canvas.game-canvas');
      if (canvas && getComputedStyle(canvas).visibility !== 'hidden') {
        window.firstArenaFrame = {
          width: canvas.width,
          height: canvas.height,
          error: canvas.getContext('webgl2').getError(),
          playEnabled: !document.querySelector('button:disabled'),
        };
      } else requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const requested = new Set();
  await page.route('**/textures/**', async (route) => {
    requested.add(new URL(route.request().url()).pathname);
    await gate;
    await route.continue();
  });
  await page.goto(externalUrl ?? preview.url, { waitUntil: 'domcontentloaded' });
  await page.locator('canvas.game-canvas').waitFor({ state: 'attached' });
  const loading = page.getByRole('button', { name: 'LOADING', exact: true });
  assert.equal(await loading.isDisabled(), true);
  assert.equal(
    await page.locator('canvas.game-canvas').evaluate((c) => getComputedStyle(c).visibility),
    'hidden',
  );
  assert.equal(await page.evaluate(() => window.firstArenaFrame ?? null), null);
  release();
  const play = page.getByRole('button', { name: 'PLAY', exact: true });
  await play.waitFor();
  assert.equal(await play.isEnabled(), true);
  await page.waitForFunction(() => !!window.firstArenaFrame);
  assert.deepEqual(
    await page.evaluate(() => ({
      width: window.firstArenaFrame.width,
      height: window.firstArenaFrame.height,
      error: window.firstArenaFrame.error,
    })),
    { width: 1920, height: 877, error: 0 },
  );
  assert.equal(requested.size, 8);
  await page.screenshot({ path: 'local-artifacts/loading-cold-menu.png' });
  await page.unroute('**/textures/**');

  for (let i = 0; i < 2; i++) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await play.waitFor();
    await page.waitForFunction(() => !!window.firstArenaFrame);
    assert.equal(await page.evaluate(() => window.firstArenaFrame.error), 0);
  }
  await play.click();
  await page.waitForFunction(() => !!document.pointerLockElement);
  await page.waitForTimeout(5000);
  assert.equal(await page.evaluate(() => window.runtimeShaderChanges), 0);
  await page.keyboard.press('p');
  await page.getByRole('heading', { name: 'Paused', exact: true }).waitFor();
  await page.getByRole('button', { name: 'EXIT TO MENU', exact: true }).click();
  await play.waitFor();

  await page.route('**/textures/trees/leaves-color.png', (route) => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('alert').filter({ hasText: 'The arena textures could not load.' }).waitFor();
  assert.equal(await loading.isDisabled(), true);
  assert.equal(await page.evaluate(() => window.firstArenaFrame ?? null), null);
  await page.unroute('**/textures/trees/leaves-color.png');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await play.waitFor();
  await page.waitForFunction(() => !!window.firstArenaFrame);
  assert.equal(await page.evaluate(() => window.firstArenaFrame.error), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    warnings.filter((m) => /GL_INVALID|THREE\.WebGL|shader error/i.test(m)),
    [],
  );
  console.log(
    JSON.stringify(
      {
        result: 'passed',
        checks: [
          'no incomplete arena while textures are delayed',
          'all eight environment maps arrive before PLAY',
          'High and 100% render scale retained at 1920x877',
          'no texture-size errors on cold or repeated loads',
          'pointer lock, pause and return to menu',
          'no shader compilation during first enemy spawns',
          'failed leaf download stays loading with a useful error',
          'reload recovers from failed download',
          'no uncaught errors or WebGL warnings',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  if (preview) {
    const stopped = preview.server.exitCode === null ? once(preview.server, 'exit') : null;
    preview.server.kill();
    if (stopped) await stopped;
  }
}
