import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBlenderOrcGeometries } from './creature-blender';
import data from './orc-blender-data.json';

describe('Blender orc export', () => {
  it('decodes complete painted batches with valid indices and nonzero triangle areas', () => {
    const groups = buildBlenderOrcGeometries();
    let triangles = 0;
    expect(groups.size).toBe(19);
    for (const [key, geometries] of groups) {
      expect(Object.keys(data.pivots)).toContain(key.split(':')[0]);
      for (const geometry of geometries) {
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        const colors = geometry.getAttribute('color');
        const uv = geometry.getAttribute('uv');
        expect([normals.count, colors.count, uv.count]).toEqual([
          positions.count,
          positions.count,
          positions.count,
        ]);
        let invalidNormals = 0,
          invalidColors = 0,
          invalidTriangles = 0;
        for (let i = 0; i < positions.count; i++) {
          const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
          if (!Number.isFinite(length) || Math.abs(length - 1) > 0.015) invalidNormals++;
          for (const value of [colors.getX(i), colors.getY(i), colors.getZ(i)]) {
            if (!Number.isFinite(value) || value < 0 || value > 1) invalidColors++;
          }
        }
        const indices = geometry.getIndex()!;
        expect(indices.array).toBeInstanceOf(Uint32Array);
        expect(indices.count % 3).toBe(0);
        for (let i = 0; i < indices.count; i += 3) {
          const a = indices.getX(i),
            b = indices.getX(i + 1),
            c = indices.getX(i + 2);
          if (Math.max(a, b, c) >= positions.count) invalidTriangles++;
          const ux = positions.getX(b) - positions.getX(a);
          const uy = positions.getY(b) - positions.getY(a);
          const uz = positions.getZ(b) - positions.getZ(a);
          const vx = positions.getX(c) - positions.getX(a);
          const vy = positions.getY(c) - positions.getY(a);
          const vz = positions.getZ(c) - positions.getZ(a);
          const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
          if (!Number.isFinite(area) || area === 0) invalidTriangles++;
        }
        expect({ invalidNormals, invalidColors, invalidTriangles }, key).toEqual({
          invalidNormals: 0,
          invalidColors: 0,
          invalidTriangles: 0,
        });
        triangles += indices.count / 3;
        geometry.dispose();
      }
    }
    expect(triangles).toBe(data.triangles);
  }, 30000);

  it('ships a painted GLB with the same triangle count and five game joints', () => {
    const file = readFileSync(new URL('../../public/models/orc.glb', import.meta.url));
    expect(file.toString('ascii', 0, 4)).toBe('glTF');
    expect(file.readUInt32LE(4)).toBe(2);
    expect(file.readUInt32LE(8)).toBe(file.length);
    const jsonSize = file.readUInt32LE(12);
    const gltf = JSON.parse(file.toString('utf8', 20, 20 + jsonSize));
    let triangles = 0;
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        expect(primitive.attributes).toHaveProperty('COLOR_0');
        expect(primitive.attributes).toHaveProperty('JOINTS_0');
        expect(primitive.attributes).toHaveProperty('WEIGHTS_0');
        triangles += gltf.accessors[primitive.indices].count / 3;
      }
    }
    expect(triangles).toBe(data.triangles);
    for (const skin of gltf.skins) {
      expect(skin.joints.map((index: number) => gltf.nodes[index].name).sort()).toEqual(
        Object.keys(data.pivots).sort(),
      );
    }
    expect(gltf.skins.length).toBeGreaterThan(0);
  });
});
