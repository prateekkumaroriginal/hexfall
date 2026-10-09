import { isInstancedMesh } from './three-types';
import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('../config/world');
  vi.resetModules();
});

it('renders a fourth configured tree variant and a larger tree count', async () => {
  vi.doMock('../config/world', async (importOriginal) => {
    const config = await importOriginal<typeof import('../config/world')>();
    return {
      ...config,
      TREES: {
        ...config.TREES,
        COUNT: 24,
        VARIANTS: [
          { SEED: 419, SPREAD: 1.03 },
          { SEED: 546, SPREAD: 0.9 },
          { SEED: 673, SPREAD: 1.12 },
          { SEED: 800, SPREAD: 1.05 },
        ],
      },
    };
  });
  const { TreeRenderer } = await import('./trees');
  const { TREE_LAYOUT } = await import('./world');
  const scene = new THREE.Scene();
  try {
    const renderer = new TreeRenderer(scene);
    const camera = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, 150);
    camera.position.set(0, 30, 50);
    camera.lookAt(0, 3, 0);
    camera.updateMatrixWorld();
    renderer.update(
      0,
      new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      ),
    );
    expect(TREE_LAYOUT).toHaveLength(24);
    expect(new Set(TREE_LAYOUT.map((tree) => tree.variant))).toEqual(new Set([0, 1, 2, 3]));
    for (let variant = 0; variant < 4; variant++) {
      for (const name of ['branching-tree-trunks', 'broadleaf-canopies']) {
        const batch = scene.getObjectByName(`${name}-${variant}`) as THREE.InstancedMesh;
        expect(batch.count).toBe(TREE_LAYOUT.filter((tree) => tree.variant === variant).length);
        expect(batch.instanceMatrix.count).toBeGreaterThanOrEqual(batch.count);
      }
    }
  } finally {
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (isInstancedMesh(object)) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
        }
        object.dispose();
      }
    });
    for (const material of materials) material.dispose();
  }
});
