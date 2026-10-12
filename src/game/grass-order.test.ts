import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GrassOrder } from './grass-order';
import { at } from '../lib/assert';

function fixture() {
  const matrices = new Float32Array(4 * 16);
  for (const [i, z] of [4, -3, 8, -9].entries()) {
    const matrix = new THREE.Matrix4().makeTranslation(i, -0.055, z);
    matrix.scale(new THREE.Vector3(1 + i * 0.1, 1 + i * 0.2, 1 + i * 0.3));
    matrix.toArray(matrices, i * 16);
  }
  const attribute = new THREE.InstancedBufferAttribute(matrices, 16);
  return { attribute, original: matrices.slice(), order: new GrassOrder(attribute) };
}

describe('grass drawing order', () => {
  it('reorders complete transforms and keeps exactly the same active clumps', () => {
    const { attribute, original, order } = fixture();
    order.update(attribute, 3, 0, -1);
    for (const [destination, source] of [2, 0, 1].entries())
      expect(Array.from(attribute.array.slice(destination * 16, destination * 16 + 16))).toEqual(
        Array.from(original.slice(source * 16, source * 16 + 16)),
      );
  });
  it('preserves density selection when turning, moving or changing quality', () => {
    const { attribute, original, order } = fixture();
    order.update(attribute, 4, 0, 1);
    order.update(attribute, 2, 0, 1);
    expect(Array.from(attribute.array.slice(0, 32))).toEqual([
      ...original.slice(16, 32),
      ...original.slice(0, 16),
    ]);
    order.update(attribute, 0, 0, -1);
    order.update(attribute, 4, 0, -1);
    for (const [destination, source] of [2, 0, 1, 3].entries())
      expect(Array.from(attribute.array.slice(destination * 16, destination * 16 + 16))).toEqual(
        Array.from(original.slice(source * 16, source * 16 + 16)),
      );
  });
  it('avoids rewriting GPU buffers when only time advances', () => {
    const { attribute, order } = fixture();
    order.update(attribute, 3, 0, -1);
    const version = attribute.version;
    order.update(attribute, 3, 0, -1);
    expect(attribute.version).toBe(version);
  });
  it('matches a full sort through small turns, sudden reversals and density changes', () => {
    const matrices = new Float32Array(100 * 16);
    for (let i = 0; i < 100; i++)
      new THREE.Matrix4()
        .makeTranslation((i * 17) % 19, 0, (i * 13) % 23)
        .toArray(matrices, i * 16);
    const original = matrices.slice();
    const attribute = new THREE.InstancedBufferAttribute(matrices, 16);
    const order = new GrassOrder(attribute);
    for (const [count, angle] of [
      [100, 0],
      [100, 0.001],
      [100, 0.002],
      [100, 0.6],
      [100, Math.PI],
      [48, -0.001],
      [100, -1.7],
    ] as const) {
      const x = Math.sin(angle),
        z = Math.cos(angle);
      const depth = (i: number) => at(original, i * 16 + 12) * x + at(original, i * 16 + 14) * z;
      const indices = Array.from({ length: count }, (_, i) => i).sort(
        (a, b) => depth(a) - depth(b) || a - b,
      );
      order.update(attribute, count, x, z);
      for (const [destination, source] of indices.entries())
        expect(attribute.array.slice(destination * 16, destination * 16 + 16)).toEqual(
          original.slice(source * 16, source * 16 + 16),
        );
    }
  });
});
