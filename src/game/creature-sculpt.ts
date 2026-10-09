import { at, required } from '../lib/assert';
import * as THREE from 'three';
import data from './creature-sculpt-data.json';
// Quantized offline sculptures decode once when the shared creature batches are built.
// Normals and cavity shading are baked, so the game never evaluates a sculpting field.
export function sculptedGeometry(name: keyof typeof data) {
  const source = data[name];
  const bytes = (encoded: string) => Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const positions = new Int16Array(bytes(source.positions).buffer);
  const normals = new Int8Array(bytes(source.normals).buffer);
  const ao = bytes(source.ao);
  const vertices = new Float32Array(positions.length);
  const unitNormals = new Float32Array(normals.length);
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let i = 0; i < positions.length; i++) {
    vertices[i] = at(positions, i) / 10000;
    unitNormals[i] = at(normals, i) / 127;
  }
  for (let i = 0; i < vertices.length / 3; i++) {
    uv[i * 2] = Math.atan2(at(vertices, i * 3), at(vertices, i * 3 + 2)) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = at(vertices, i * 3 + 1) / 1.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(unitNormals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('sculptShade', new THREE.BufferAttribute(ao, 1, true));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(bytes(source.indices).buffer), 1));
  {
    // Split every cylindrical UV seam so skin planes and bubble paint cannot
    // stretch across the back-facing triangles of the sculptures.
    const indices = Array.from(required(geometry.index).array);
    const attributes = Object.fromEntries(
      Object.entries(geometry.attributes).map(([key, value]) => [key, Array.from(value.array)]),
    );
    const duplicates = new Map<number, number>();
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const face = indices.slice(triangle, triangle + 3);
      const us = face.map((i) => at(uv, i * 2));
      if (Math.max(...us) - Math.min(...us) <= 0.5) continue;
      face.forEach((index, corner) => {
        if (at(uv, index * 2) >= 0.5) return;
        let duplicate = duplicates.get(index);
        if (duplicate === undefined) {
          duplicate = required(attributes['position']).length / 3;
          for (const [key, attribute] of Object.entries(geometry.attributes)) {
            const values = required(attributes[key]);
            for (let c = 0; c < attribute.itemSize; c++)
              values.push(at(attribute.array, index * attribute.itemSize + c));
          }
          required(attributes['uv'])[duplicate * 2] =
            at(required(attributes['uv']), duplicate * 2) + 1;
          duplicates.set(index, duplicate);
        }
        indices[triangle + corner] = duplicate;
      });
    }
    for (const [key, attribute] of Object.entries(geometry.attributes)) {
      geometry.setAttribute(
        key,
        key === 'sculptShade'
          ? new THREE.Uint8BufferAttribute(required(attributes[key]), attribute.itemSize, true)
          : new THREE.Float32BufferAttribute(required(attributes[key]), attribute.itemSize),
      );
    }
    geometry.setIndex(indices);
  }
  return geometry;
}
