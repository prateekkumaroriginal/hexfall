import { required, at } from '../lib/assert';
import * as THREE from 'three';
import { expect, it } from 'vitest';
import { buildMountains } from './mountains';
import { ARENA_HALF_WIDTH, ARENA_HALF_DEPTH } from '../config/world';
it('encloses every approach without placing mountain geometry inside the arena', () => {
  const scene = new THREE.Scene();
  const mountains = buildMountains(scene);
  try {
    expect(scene.children).toHaveLength(1);
    const positions = mountains.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      expect(
        Math.abs(positions.getX(i)) >= ARENA_HALF_WIDTH - 1e-5 ||
          Math.abs(positions.getZ(i)) >= ARENA_HALF_DEPTH - 1e-5,
      ).toBe(true);
    }
    for (const name of ['position', 'normal', 'color']) {
      expect(Array.from(mountains.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(
        true,
      );
    }
    mountains.geometry.computeBoundingBox();
    expect(required(mountains.geometry.boundingBox).max.y).toBeGreaterThan(40);
    const triangles = (mountains.geometry.index?.count ?? positions.count) / 3;
    expect(triangles).toBeLessThan(40000);
    // Coincident vertices must share their lighting, including ring seams and rock edges.
    const normals = mountains.geometry.getAttribute('normal');
    const sharedNormals = new Map<string, THREE.Vector3>();
    const normal = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      const key = [positions.getX(i), positions.getY(i), positions.getZ(i)]
        .map((value) => Math.round(value * 10000))
        .join(',');
      normal.fromBufferAttribute(normals, i);
      const previous = sharedNormals.get(key);
      if (previous) expect(normal.dot(previous)).toBeGreaterThan(0.999);
      else sharedNormals.set(key, normal.clone());
    }
    mountains.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    for (let i = 0; i < 72; i++) {
      const angle = (i * Math.PI * 2) / 72;
      raycaster.set(
        new THREE.Vector3(0, 1.6, 0),
        new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
      );
      const hits = raycaster.intersectObject(mountains);
      expect(hits.length).toBeGreaterThan(0);
      expect(at(hits, 0).distance).toBeLessThan(50);
    }
  } finally {
    mountains.geometry.dispose();
    (mountains.material as THREE.Material).dispose();
  }
});
