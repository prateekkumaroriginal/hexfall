import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route('**/performance-check', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"><div id="host" style="width:100vw;height:100vh"></div></body></html>' }));
  await page.goto('http://localhost:5173/performance-check');
  const result = await page.evaluate(async () => {
    const { Engine } = await import('/src/game/engine.ts');
    const engine = new Engine(document.getElementById('host'), () => {}, () => {}, { quality: 'balanced', sensitivity: 1, sound: false });
    cancelAnimationFrame(engine.frame);
    engine.camera.position.set(0, 1.6, 9); engine.camera.lookAt(0, 1.6, -10); engine.staff.visible = true;
    const renderer = engine.renderer, gl = renderer.getContext(), result = [];
    const grass = engine.scene.children.filter(o => o.name.includes('grass'));
    const trees = engine.scene.children.filter(o => /canop|trunk/.test(o.name));
    const sky = engine.scene.getObjectByName('daylight-sky-and-clouds');
    for (const enemies of [0, 24]) {
      engine.sim.enemies.forEach((e, i) => Object.assign(e, { active: i < enemies, kind: i % 2, x: (i % 6 - 2.5) * 3, z: -Math.floor(i / 6) * 3, phase: i }));
      engine.syncMeshes();
      if (engine.environment.update.length > 1) engine.environment.update(1, engine.camera);
      const grassVisibility = grass.map(o => o.visible);
      for (const variant of ['full', 'no grass', 'no trees', 'no sky']) {
        grass.forEach((o, i) => { o.visible = variant !== 'no grass' && grassVisibility[i]; });
        trees.forEach(o => { o.visible = variant !== 'no trees'; });
        sky.visible = variant !== 'no sky';
        for (let i = 0; i < 3; i++) { renderer.render(engine.scene, engine.camera); gl.finish(); }
        const times = [];
        for (let i = 0; i < 12; i++) { const start = performance.now(); renderer.render(engine.scene, engine.camera); gl.finish(); times.push(performance.now() - start); }
        times.sort((a, b) => a - b);
        result.push({ enemies, variant, medianRenderMs: +times[6].toFixed(2), triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, pixels: renderer.domElement.width * renderer.domElement.height });
      }
    }
    engine.dispose(); return result;
  });
  console.log(JSON.stringify(result, null, 2));
  await writeFile(process.argv[2] || 'artifacts/performance.json', JSON.stringify(result, null, 2));
} finally { await browser.close(); }
