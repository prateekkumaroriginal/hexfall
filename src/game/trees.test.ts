import * as THREE from 'three';
import { expect, it } from 'vitest';
import { TreeRenderer } from './trees';
import { TREE_LAYOUT } from './world';
import { TREE_OBSTACLES } from './simulation';

it('renders every trunk at its shared collision position and scale', () => {
  const scene = new THREE.Scene();
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
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  try {
    for (let variant = 0; variant < 3; variant++) {
      const trunks = scene.getObjectByName(
        `branching-tree-trunks-${variant}`,
      ) as THREE.InstancedMesh;
      const trees = TREE_LAYOUT.filter((tree) => tree.variant === variant);
      expect(trunks.count).toBe(trees.length);
      trees.forEach((tree, i) => {
        trunks.getMatrixAt(i, matrix);
        matrix.decompose(position, rotation, scale);
        expect(position.x).toBeCloseTo(tree.x);
        expect(position.z).toBeCloseTo(tree.z);
        expect(scale.x).toBeCloseTo(tree.scaleX);
        expect(scale.y).toBeCloseTo(tree.scaleY);
        expect(scale.z).toBeCloseTo(tree.scaleZ);
        expect(TREE_OBSTACLES[TREE_LAYOUT.indexOf(tree)]).toEqual({
          x: tree.x,
          z: tree.z,
          radius: tree.radius,
          height: tree.height,
        });
      });
    }
  } finally {
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(material);
        object.dispose();
      }
    });
    for (const material of materials) material.dispose();
  }
});
