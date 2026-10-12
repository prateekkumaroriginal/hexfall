import * as THREE from 'three';
import { expect, it } from 'vitest';
import { BOULDERS } from '../config/world';
import { buildRocks } from './rocks';

it('keeps each visible boulder body inside its shared collision footprint', () => {
  const scene = new THREE.Scene();
  const rocks = buildRocks(scene);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  try {
    rocks.updateMatrixWorld();
    for (const boulder of BOULDERS.LAYOUT) {
      ray.set(new THREE.Vector3(boulder.X, 5, boulder.Z), down);
      const centerHits = ray.intersectObject(rocks);
      expect(centerHits.length).toBeGreaterThan(0);
      expect(centerHits[0]?.point.y).toBeGreaterThan(1);
      expect(centerHits[0]?.point.y).toBeLessThanOrEqual(BOULDERS.COLLISION_HEIGHT_UNITS);
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8;
        for (const radius of [boulder.RADIUS * 0.4, boulder.RADIUS + 0.02]) {
          ray.set(
            new THREE.Vector3(
              boulder.X + Math.cos(angle) * radius,
              5,
              boulder.Z + Math.sin(angle) * radius,
            ),
            down,
          );
          expect(ray.intersectObject(rocks).length > 0).toBe(radius < boulder.RADIUS);
        }
      }
    }
    for (const name of ['position', 'normal', 'uv', 'color']) {
      expect(Array.from(rocks.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    }
    expect((rocks.geometry.index?.count ?? 0) / 3).toBeLessThan(30000);
    expect(scene.children).toHaveLength(1);
  } finally {
    rocks.geometry.dispose();
    rocks.material.dispose();
  }
});
