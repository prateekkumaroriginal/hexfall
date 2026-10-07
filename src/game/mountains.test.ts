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
    expect(mountains.geometry.boundingBox!.max.y).toBeGreaterThan(40);
    expect(positions.count / 3).toBeLessThan(15000);
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
      expect(hits[0].distance).toBeLessThan(50);
    }
  } finally {
    mountains.geometry.dispose();
    (mountains.material as THREE.Material).dispose();
  }
});
