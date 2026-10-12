import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareOrcMorphGeometry } from './orc-morph';

function geometry() {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  result.morphTargetsRelative = true;
  return result;
}

describe('orc morph work', () => {
  it('keeps even the smallest nonzero position or normal offset active', () => {
    const mesh = geometry();
    const positions = new THREE.Float32BufferAttribute([0, -0, 0, 0, 1e-12, 0, 0, 0, 0], 3);
    const normals = new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, -1e-12, 0, 0], 3);
    mesh.morphAttributes.position = [positions];
    mesh.morphAttributes.normal = [normals];
    const before = positions.array.slice();
    expect(prepareOrcMorphGeometry(mesh)).toBe(true);
    expect(Array.from(mesh.getAttribute('orcMorphActive').array)).toEqual([0, 1, 1]);
    expect(positions.array).toEqual(before);
    expect(mesh.getAttribute('position').count).toBe(3);
    expect(prepareOrcMorphGeometry(mesh)).toBe(false);
  });
  it('retains normal morph processing for absolute targets', () => {
    const mesh = geometry();
    mesh.morphTargetsRelative = false;
    mesh.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(9), 3)];
    expect(prepareOrcMorphGeometry(mesh)).toBe(false);
    expect(mesh.hasAttribute('orcMorphActive')).toBe(false);
  });
  it('rejects malformed offsets instead of silently omitting an expression', () => {
    const mesh = geometry();
    mesh.morphAttributes.normal = [new THREE.Float32BufferAttribute([0, 0, 0], 3)];
    expect(() => prepareOrcMorphGeometry(mesh)).toThrow(/dimensions/);
  });
});
