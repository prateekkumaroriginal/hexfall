import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

async function startPreview() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const url = `http://127.0.0.1:${address.port}`;
  const server = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(address.port),
      '--strictPort',
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (data) => {
      output = (output + data).slice(-4000);
    });
  server.on('error', (error) => {
    output += error.message;
  });
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`Preview failed: ${output}`);
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return { url, server };
      } catch {
        /* The server is still starting. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Preview did not start: ${output}`);
  } catch (error) {
    server.kill();
    throw error;
  }
}

await mkdir('local-artifacts', { recursive: true });
const externalUrl = process.env['PHOTO_MODE_TEST_URL'];
const preview = externalUrl ? null : await startPreview();
let browser;
try {
  const channel =
    process.env['PHOTO_MODE_BROWSER_CHANNEL'] ??
    (process.platform === 'win32' ? 'msedge' : undefined);
  browser = await chromium.launch({
    ...(channel ? { channel } : {}),
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(10_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'hexfall.settings.v1',
      JSON.stringify({
        quality: 'low',
        renderScale: 0.25,
        fieldOfView: 100,
        sensitivity: 1,
        sound: false,
      }),
    ),
  );
  await page.goto(externalUrl ?? preview.url, { waitUntil: 'networkidle' });
  const settingsBefore = await page.evaluate(() => localStorage.getItem('hexfall.settings.v1'));
  const canvas = page.locator('canvas');
  const fieldOfView = page.getByRole('slider', { name: /Field of view/ });
  const height = page.getByRole('slider', { name: /Height/ });
  const paused = page.getByRole('heading', { name: 'Paused', exact: true });
  const photo = page.getByRole('heading', { name: 'PHOTO MODE', exact: true });
  const isLocked = async (locked) =>
    page.waitForFunction((expected) => (document.pointerLockElement !== null) === expected, locked);
  const capture = async (name, keyboard = false) => {
    const pending = page.waitForEvent('download');
    if (keyboard) await page.keyboard.press('Enter');
    else await page.getByRole('button', { name: 'CAPTURE' }).click();
    const download = await pending;
    assert.match(download.suggestedFilename(), /^hexfall-.*\.png$/);
    const path = `local-artifacts/${name}.png`;
    await download.saveAs(path);
    return readFile(path);
  };
  const checkButtonSizes = async () => {
    const hide = await page.getByRole('button', { name: 'Hide controls' }).boundingBox();
    const capture = await page.getByRole('button', { name: 'CAPTURE' }).boundingBox();
    assert.ok(hide && capture);
    assert.equal(capture.width, hide.width);
    assert.equal(capture.height, hide.height);
  };

  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await isLocked(true);
  await page.waitForTimeout(4500);
  const waveBefore = await page.locator('.wave-hud').innerText();
  await page.keyboard.down('ControlLeft');
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyP');
  await page.keyboard.up('ControlLeft');
  await paused.waitFor();
  await page.getByRole('button', { name: 'PHOTO MODE', exact: true }).click();
  await photo.waitFor();
  await isLocked(true);
  assert.equal(await page.getByText('Drag to look', { exact: true }).count(), 0);
  assert.equal(await page.getByText('World frozen', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'SAVE PNG' }).count(), 0);
  const entryHeight = Number(await height.inputValue());
  const entry = await capture('photo-mode-entry', true);

  // Compare exported pixels, rather than inspecting private camera fields.
  await page.mouse.move(455, 380, { steps: 5 });
  const turned = await capture('photo-mode-mouse-look', true);
  assert.notDeepEqual(turned, entry);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyE');
  await page.waitForFunction(
    (original) => Number(document.querySelector('#photo-camera-height')?.value) > original,
    entryHeight,
  );
  const moved = await capture('photo-mode-moved', true);
  assert.notDeepEqual(moved, turned);
  assert.equal(await canvas.evaluate((element) => getComputedStyle(element).outlineStyle), 'none');

  await page.keyboard.press('Tab');
  await isLocked(false);
  await photo.waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'photo-field-of-view');
  await page.mouse.move(550, 400);
  assert.deepEqual(await capture('photo-mode-cursor-free'), moved);
  await fieldOfView.fill('45');
  await height.fill('3.5');
  const framed = await capture('photo-mode-framed');
  await page.getByRole('checkbox', { name: 'Thirds grid', exact: true }).check();
  assert.deepEqual(await capture('photo-mode-grid-free-export'), framed);
  await page.getByRole('checkbox', { name: 'Show staff', exact: true }).check();
  assert.notDeepEqual(await capture('photo-mode-with-staff'), framed);
  await page.getByRole('checkbox', { name: 'Show staff', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  assert.equal(await fieldOfView.inputValue(), '75');
  assert.equal(Number(await height.inputValue()), entryHeight);
  await checkButtonSizes();
  const renderBefore = await canvas.evaluate((element) => [element.width, element.height]);
  const reset = await capture('photo-mode-capture');
  assert.deepEqual(reset, entry);
  const captureSize = [reset.readUInt32BE(16), reset.readUInt32BE(20)];
  assert.deepEqual(captureSize, [1728, 1080]);
  assert.ok(captureSize[0] > renderBefore[0]);
  assert.deepEqual(
    await canvas.evaluate((element) => [element.width, element.height]),
    renderBefore,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('hexfall.settings.v1')),
    settingsBefore,
  );

  await page.getByRole('button', { name: 'Hide controls' }).click();
  await isLocked(true);
  assert.equal(await page.locator('.photo-mode-controls').count(), 0);
  await page.waitForTimeout(600);
  assert.deepEqual(await capture('photo-mode-hidden-export', true), entry);
  await page.keyboard.press('KeyH');
  await isLocked(false);
  await page.getByText('Photo saved', { exact: true }).waitFor();
  await page.getByText('Photo saved', { exact: true }).waitFor({ state: 'hidden', timeout: 4500 });
  await page.screenshot({ path: 'local-artifacts/photo-mode-ui.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkButtonSizes();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'local-artifacts/photo-mode-narrow.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  await paused.waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'RESUME', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await isLocked(true);
  assert.equal(await page.locator('.wave-hud').innerText(), waveBefore);
  assert.equal(await page.getByRole('heading', { name: 'Get ready', exact: true }).count(), 0);
  await page.keyboard.press('F2');
  assert.equal(await page.locator('.photo-mode').count(), 0);
  await page.keyboard.press('KeyP');
  await paused.waitFor();
  await page.getByRole('button', { name: 'PHOTO MODE', exact: true }).click();
  await isLocked(true);
  await page.keyboard.press('KeyH');
  assert.equal(await page.locator('.photo-mode-controls').count(), 0);
  await page.keyboard.press('Escape');
  await paused.waitFor();

  // Browser-consumed Escape also reaches pause through pointerlockchange.
  await page.getByRole('button', { name: 'PHOTO MODE', exact: true }).click();
  await isLocked(true);
  await page.evaluate(() => document.exitPointerLock());
  await paused.waitFor();
  await page.getByRole('button', { name: 'PHOTO MODE', exact: true }).click();
  await isLocked(true);
  await page.keyboard.press('Tab');
  await isLocked(false);
  // Inject a single failure at the public canvas API, independent of the app's modules.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      HTMLCanvasElement.prototype.toBlob = original;
      callback(null);
    };
  });
  await page.getByRole('button', { name: 'CAPTURE' }).click();
  await page.getByRole('alert').filter({ hasText: 'could not be captured' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'CAPTURE' }).isEnabled(), true);
  await page.locator('.photo-mode-message').waitFor({ state: 'hidden', timeout: 4500 });
  await capture('photo-mode-retry');
  await canvas.click({ position: { x: 500, y: 350 } });
  await isLocked(true);
  await page.keyboard.press('Escape');
  await paused.waitFor();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: 'passed',
        target: externalUrl ?? 'production build',
        captureSize,
        checks: [
          'mouse look without dragging',
          'cursor release and keyboard control access',
          'movement and reset through exported pixels',
          'frozen scene across captures',
          'staff toggle and exports without grid or UI',
          'capture resolution and renderer restoration',
          'equal button sizes and no canvas border',
          'success and failure notice expiry',
          'capture retry',
          'responsive UI',
          'same run after resume',
          'Escape with hidden controls and native lock loss',
          'no entry shortcut or page errors',
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
