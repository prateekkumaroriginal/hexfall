import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('local-artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/environment-check', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<body style="margin:0"><div id="host" style="width:100vw;height:100vh"></div></body>',
    }),
  );
  await page.goto('http://localhost:5173/environment-check');
  await page.evaluate(async () => {
    const { Engine } = await import('/src/game/engine.ts');
    window.engine = new Engine(
      document.querySelector('#host'),
      () => {},
      () => {},
      { quality: 'balanced', sensitivity: 1, sound: false },
    );
    cancelAnimationFrame(window.engine.frame);
  });
  for (const [name, x, z] of [
    ['north', 0, -20],
    ['east', 16, 0],
    ['south', 0, 20],
    ['west', -16, 0],
  ]) {
    await page.evaluate(
      ({ x, z }) => {
        const e = window.engine;
        e.camera.position.set(0, 1.6, 0);
        e.camera.lookAt(x, 3, z);
        e.environment.update(1, e.camera);
        e.renderer.render(e.scene, e.camera);
      },
      { x, z },
    );
    await page.screenshot({ path: `local-artifacts/valley-${name}.png` });
  }
  await page.evaluate(() => window.engine.dispose());
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Four valley views rendered without page errors.');
} finally {
  await browser.close();
}
