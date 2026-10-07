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
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { CreatureRenderer } = await import('/src/game/creatures.ts');
    const { Simulation } = await import('/src/game/simulation.ts');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#232a28');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1400, 1000);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;width:100%;height:100%';
    document.body.appendChild(canvas);
    scene.add(new THREE.HemisphereLight('#d1e1e0', '#302820', 2.4));
    const key = new THREE.DirectionalLight('#ffe6c4', 3);
    key.position.set(3, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#aacde2', 3);
    rim.position.set(-3, 3, -2);
    scene.add(rim);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: '#333d37', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    scene.add(ground);
    const creatures = new CreatureRenderer(scene),
      sim = new Simulation();
    await creatures.loadOrc();
    Object.assign(sim.enemies[0], { active: true, kind: 0, x: -1.65, z: 0, hp: 3, phase: 0 });
    Object.assign(sim.enemies[1], { active: true, kind: 1, x: 1.25, z: 0, hp: 6, phase: 0 });
    const camera = new THREE.PerspectiveCamera(38, 1.4, 0.1, 50);
    camera.position.set(3.8, 3.1, 9);
    camera.lookAt(0, 1.3, 0);
    creatures.update(sim.enemies, 0.15, 0, 12);
    renderer.render(scene, camera);
    window.creaturePreview = { scene, renderer, camera, creatures, sim };
  });
  await page.screenshot({ path: 'local-artifacts/creatures.png' });
  const stats = await page.evaluate(() => {
    const { renderer, scene } = window.creaturePreview;
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      parts: scene.children.filter((o) => o.name.startsWith('creature-')).length,
    };
  });
  const crowd = await page.evaluate(() => {
    const { renderer, scene, camera, creatures, sim } = window.creaturePreview;
    for (let i = 0; i < sim.enemies.length; i++)
      Object.assign(sim.enemies[i], {
        active: true,
        kind: i % 2,
        x: ((i % 8) - 3.5) * 2.6,
        z: -Math.floor(i / 8) * 3,
        phase: i * 0.7,
      });
    camera.position.set(12, 12, 20);
    camera.lookAt(0, 0, -5);
    creatures.update(sim.enemies, 1, 0, 20);
    renderer.render(scene, camera);
    return {
      enemies: sim.enemies.length,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  });
  await page.screenshot({ path: 'local-artifacts/creature-crowd.png' });
  assert.deepEqual(errors, []);
  assert.ok(
    crowd.calls <= stats.calls + 72,
    'Each visible orc has one skinned body draw and two shared-geometry eye draws',
  );
  console.log(
    JSON.stringify({ errors, stats, crowd, screenshot: 'local-artifacts/creatures.png' }, null, 2),
  );
} finally {
  await browser.close();
}
