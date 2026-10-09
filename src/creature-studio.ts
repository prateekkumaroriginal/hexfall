import { assign } from './lib/assign';
import { isInstancedMesh, isMesh, isSkinnedMesh } from './game/three-types';
import { at, required } from './lib/assert';
import * as THREE from 'three';
import { CreatureRenderer } from './game/creatures';
import { Simulation } from './game/simulation';
const scene = new THREE.Scene();
scene.background = null;
document.body.style.background =
  'radial-gradient(ellipse at 46% 38%, #373932 0%, #272923 60%, #191b19 100%)';
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#ececda', '#444836', 1.15));
const key = new THREE.DirectionalLight('#fff2db', 3.1);
key.position.set(-3, 5, 5);
scene.add(key);
const rim = new THREE.DirectionalLight('#c3ddeb', 1.3);
rim.position.set(3, 3, -3);
scene.add(rim);
const creatures = new CreatureRenderer(scene);
await creatures.loadOrc();
const sim = new Simulation();
sim.enemies.forEach((enemy) => {
  enemy.active = false;
});
assign(at(sim.enemies, 0), {
  active: true,
  id: 'orc',
  x: 0,
  z: 0,
  phase: 0,
  spawnRemaining: 0,
});
const camera = new THREE.OrthographicCamera();
let view = 'front';
creatures.update(sim.enemies, 0, 0, 10);
const parts: THREE.Mesh[] = [];
scene.traverse((o) => {
  if (isMesh(o) && o.name.startsWith('creature-')) parts.push(o);
});
function visible(part: THREE.Mesh) {
  if (isInstancedMesh(part)) return part.count > 0;
  for (let o: THREE.Object3D | null = part; o; o = o.parent) if (!o.visible) return false;
  return true;
}
function partMatrix(part: THREE.Mesh, matrix: THREE.Matrix4) {
  if (isInstancedMesh(part)) part.getMatrixAt(0, matrix);
  else matrix.copy(part.matrixWorld);
}
const materials = new Set(
  parts
    .flatMap((part) => (Array.isArray(part.material) ? part.material : [part.material]))
    .filter(
      (material): material is THREE.MeshStandardMaterial =>
        material instanceof THREE.MeshStandardMaterial,
    ),
);
const original = new Map(
  [...materials].map((m) => [m, { map: m.map, vertexColors: m.vertexColors }]),
);
let clay = false;
let metrics: object = {};
let compare = false;
const referenceCanvas = document.createElement('canvas');
referenceCanvas.style.cssText = 'position:absolute;right:0;top:0;pointer-events:none;display:none';
document.body.append(referenceCanvas);
const references = [new Image(), new Image()];
at(references, 0).src = '/local-artifacts/enemy-concepts/slime-concept.png';
at(references, 1).src = '/local-artifacts/enemy-concepts/orc-concept.png';
references.forEach((image) => {
  image.onload = () => render();
  image.onerror = () => render();
});
const compareButton = document.createElement('button');
compareButton.textContent = 'Concept comparison';
required(document.querySelector('nav')).append(compareButton);
compareButton.onclick = () => {
  compare = !compare;
  render();
};
const exportButton = document.createElement('button');
exportButton.textContent = 'Export measurements';
required(document.querySelector('nav')).append(exportButton);
exportButton.onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `creature-${at(sim.enemies, 0).id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function render() {
  const orc = at(sim.enemies, 0).id === 'orc';
  const viewportWidth = compare ? Math.floor(innerWidth / 2) : innerWidth;
  const height =
    view === 'face'
      ? orc
        ? 1
        : 1.2
      : Math.max(orc ? 3.4 : 1.8, ((orc ? 2.35 : 2.7) * innerHeight) / viewportWidth);
  const center = new THREE.Vector3(0, view === 'face' ? (orc ? 2.44 : 0.75) : orc ? 1.48 : 0.7, 0);
  const angle =
    view === 'side' ? Math.PI / 2 : view === 'rear' ? Math.PI : view === 'quarter' ? 0.42 : 0;
  camera.position
    .copy(center)
    .add(
      new THREE.Vector3(
        Math.sin(angle) * 8,
        view === 'quarter' ? 0.75 : orc || view === 'front' ? 0 : 0.35,
        Math.cos(angle) * 8,
      ),
    );
  camera.lookAt(center);
  key.position.set(
    -3 * Math.cos(angle) + 5 * Math.sin(angle),
    5,
    3 * Math.sin(angle) + 5 * Math.cos(angle),
  );
  rim.position.set(
    3 * Math.cos(angle) - 3 * Math.sin(angle),
    3,
    -3 * Math.sin(angle) - 3 * Math.cos(angle),
  );
  const width = compare ? Math.floor(innerWidth / 2) : innerWidth;
  const aspect = width / innerHeight;
  camera.left = (-height * aspect) / 2;
  camera.right = (height * aspect) / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.near = 0.1;
  camera.far = 30;
  camera.updateProjectionMatrix();
  renderer.setSize(width, innerHeight);
  creatures.update(sim.enemies, 0, 0, 10);
  renderer.render(scene, camera);
  const projected = new THREE.Box2();
  const projectedPoint = new THREE.Vector3();
  const projectedMatrix = new THREE.Matrix4();
  for (const part of parts.filter(visible)) {
    partMatrix(part, projectedMatrix);
    const vertices = part.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      part.getVertexPosition(i, projectedPoint).applyMatrix4(projectedMatrix).project(camera);
      projected.expandByPoint(new THREE.Vector2(projectedPoint.x, projectedPoint.y));
    }
  }
  referenceCanvas.style.display = compare ? 'block' : 'none';
  if (compare) {
    referenceCanvas.width = width;
    referenceCanvas.height = innerHeight;
    const ctx = required(referenceCanvas.getContext('2d'));
    ctx.fillStyle = '#272923';
    ctx.fillRect(0, 0, width, innerHeight);
    const source = at(references, orc ? 1 : 0);
    const crop: [number, number, number, number] = orc
      ? view === 'rear'
        ? [1190, 128, 278, 453]
        : view === 'face'
          ? [841, 669, 306, 282]
          : view === 'quarter'
            ? [125, 45, 675, 925]
            : [810, 128, 305, 451]
      : view === 'side'
        ? [1085, 428, 378, 235]
        : view === 'quarter'
          ? [125, 185, 795, 445]
          : [1066, 99, 382, 233];
    if (source.complete && source.naturalWidth) {
      const h =
        view === 'face'
          ? (innerHeight * 1.05) / height
          : ((projected.max.y - projected.min.y) * innerHeight) / 2;
      const w = (h * crop[2]) / crop[3];
      const top =
        view === 'face' ? (innerHeight - h) / 2 : ((1 - projected.max.y) * innerHeight) / 2;
      ctx.drawImage(source, crop[0], crop[1], crop[2], crop[3], (width - w) / 2, top, w, h);
    }
    ctx.fillStyle = '#e4ddbf';
    ctx.font = '14px system-ui';
    const missingView = (orc && view === 'side') || (!orc && view === 'rear');
    ctx.fillText(
      source.naturalWidth
        ? `CONCEPT · ${missingView ? 'front shown; this angle is absent from the sheet' : view}`
        : 'Reference image missing from local-artifacts/enemy-concepts/',
      20,
      innerHeight - 22,
    );
  }
  const bounds = new THREE.Box3();
  for (const part of parts.filter(visible)) {
    const matrix = new THREE.Matrix4();
    partMatrix(part, matrix);
    part.geometry.computeBoundingBox();
    if (isSkinnedMesh(part)) {
      part.computeBoundingBox();
      bounds.union(required(part.boundingBox).clone().applyMatrix4(matrix));
    } else bounds.union(required(part.geometry.boundingBox).clone().applyMatrix4(matrix));
  }
  required(document.querySelector('#stats')).textContent =
    `${renderer.info.render.triangles.toLocaleString()} triangles · ${renderer.info.render.calls} calls\nBounds ${bounds
      .getSize(new THREE.Vector3())
      .toArray()
      .map((n) => n.toFixed(3))
      .join(' × ')} m`;
  const size = bounds.getSize(new THREE.Vector3());
  const profile = Array.from({ length: 12 }, () => ({ minX: Infinity, maxX: -Infinity }));
  const position = new THREE.Vector3(),
    matrix = new THREE.Matrix4();
  for (const part of parts.filter(visible)) {
    partMatrix(part, matrix);
    const vertices = part.geometry.getAttribute('position');
    const world = new Float32Array(vertices.count * 3);
    for (let i = 0; i < vertices.count; i++) {
      part.getVertexPosition(i, position).applyMatrix4(matrix);
      position.toArray(world, i * 3);
    }
    const indices = required(part.geometry.index);
    // Intersect triangles with horizontal planes. Vertex-only bins miss the
    // silhouette where the decimator left long triangles on smooth surfaces.
    for (let t = 0; t < indices.count; t += 3) {
      const ids = [indices.getX(t), indices.getX(t + 1), indices.getX(t + 2)];
      const ys = ids.map((id) => at(world, id * 3 + 1));
      const firstBand = Math.max(
        0,
        Math.ceil(((Math.min(...ys) - bounds.min.y) * 12) / size.y - 0.5 - 1e-9),
      );
      const lastBand = Math.min(
        11,
        Math.floor(((Math.max(...ys) - bounds.min.y) * 12) / size.y - 0.5 + 1e-9),
      );
      // Most sculpt triangles span none of the twelve measurement planes.
      // Visit only intersecting planes while retaining the exact edge test.
      for (let band = firstBand; band <= lastBand; band++) {
        const y = bounds.min.y + ((band + 0.5) * size.y) / 12;
        for (let edge = 0; edge < 3; edge++) {
          const a = at(ids, edge) * 3,
            b = at(ids, (edge + 1) % 3) * 3;
          const ay = at(world, a + 1),
            by = at(world, b + 1);
          if (ay < y === by < y || ay === by) continue;
          const ax = at(world, a);
          const x = ax + ((at(world, b) - ax) * (y - ay)) / (by - ay);
          const entry = at(profile, band);
          entry.minX = Math.min(entry.minX, x);
          entry.maxX = Math.max(entry.maxX, x);
        }
      }
    }
  }
  metrics = {
    id: orc ? 'orc' : 'slime',
    pose: 'neutral',
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() },
    widthToHeight: size.x / size.y,
    projectedWidthToHeight:
      ((projected.max.x - projected.min.x) * width) /
      ((projected.max.y - projected.min.y) * innerHeight),
    // Actual geometry widths, not a claim of pixel equivalence to painted artwork.
    frontWidthsFromFeetToCrown: profile.map((band) => (band.maxX - band.minX) / size.y),
    triangles: renderer.info.render.triangles,
    calls: renderer.info.render.calls,
    sharedGeometryBytes: parts.reduce(
      (sum, part) =>
        sum +
        Object.values(part.geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0) +
        (part.geometry.index?.array.byteLength ?? 0),
      0,
    ),
  };
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(
  (button) =>
    (button.onclick = () => {
      view = required(button.dataset['view']);
      render();
    }),
);
const creatureSelect = required(document.querySelector<HTMLSelectElement>('#id'));
creatureSelect.onchange = () => {
  const id = creatureSelect.value;
  if (id !== 'orc' && id !== 'slime') throw new Error(`Unknown creature ${id}`);
  at(sim.enemies, 0).id = id;
  render();
};
required(document.querySelector<HTMLButtonElement>('#clay')).onclick = () => {
  clay = !clay;
  materials.forEach((m) => {
    m.map = clay ? null : required(original.get(m)).map;
    m.vertexColors = !clay;
    m.color.set(clay ? '#a7a28e' : '#ffffff');
    m.needsUpdate = true;
  });
  render();
};
required(document.querySelector<HTMLButtonElement>('#wire')).onclick = () => {
  materials.forEach((m) => {
    m.wireframe = !m.wireframe;
  });
  render();
};
window.addEventListener('resize', render);
Object.assign(window, {
  creatureStudio: { scene, renderer, camera, creatures, sim, render, measure: () => metrics },
});
render();
