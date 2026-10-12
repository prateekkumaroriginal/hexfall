import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { MeshoptEncoder } from 'meshoptimizer';

// Reorder complete triangles for the GPU cache. Leave all vertex, morph, rig and image bytes intact.
const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/optimize-orc.mjs <rigged.glb>');
const input = await readFile(path);
assert.equal(input.toString('ascii', 0, 4), 'glTF');
assert.equal(input.readUInt32LE(4), 2);
assert.equal(input.readUInt32LE(8), input.length);
const jsonLength = input.readUInt32LE(12);
assert.equal(input.readUInt32LE(16), 0x4e4f534a);
const gltf = JSON.parse(input.toString('utf8', 20, 20 + jsonLength));
assert.equal(input.readUInt32LE(24 + jsonLength), 0x004e4942);
assert.equal(gltf.meshes.length, 1);
assert.equal(gltf.meshes[0].primitives.length, 1);
const primitive = gltf.meshes[0].primitives[0];
assert.equal(primitive.mode ?? 4, 4);
const accessor = gltf.accessors[primitive.indices];
const view = gltf.bufferViews[accessor.bufferView];
assert.equal(accessor.componentType, 5125);
assert.equal(accessor.type, 'SCALAR');
assert.equal(accessor.sparse, undefined);
assert.equal(accessor.count % 3, 0);
assert.equal(view.buffer, 0);
assert.equal(view.byteStride, undefined);
assert.equal(view.extensions, undefined);
const start = 28 + jsonLength + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
const length = accessor.count * 4;
assert.ok(start + length <= input.length);
const indices = new Uint32Array(accessor.count);
for (let i = 0; i < indices.length; i++) indices[i] = input.readUInt32LE(start + i * 4);
const canonical = (a, b, c) =>
  a <= b && a <= c ? `${a},${b},${c}` : b <= c ? `${b},${c},${a}` : `${c},${a},${b}`;
const triangles = new Map();
for (let i = 0; i < indices.length; i += 3) {
  const values = Array.from(indices.subarray(i, i + 3));
  const key = canonical(...values);
  const record = triangles.get(key);
  if (record) record.remaining++;
  else triangles.set(key, { values, remaining: 1 });
}
await MeshoptEncoder.ready;
const [remap] = MeshoptEncoder.reorderMesh(indices, true, false);
const inverse = new Uint32Array(remap.length);
remap.forEach((to, from) => {
  if (to !== 0xffffffff) inverse[to] = from;
});
// Undo vertex renumbering, so sparse morphs, skin weights and every attribute stay byte-identical.
for (let i = 0; i < indices.length; i++) indices[i] = inverse[indices[i]];
for (let i = 0; i < indices.length; i += 3) {
  const key = canonical(indices[i], indices[i + 1], indices[i + 2]);
  const record = triangles.get(key);
  assert.ok(record && record.remaining > 0, 'Optimizer changed a triangle or its winding');
  record.remaining--;
  indices.set(record.values, i);
}
assert.ok([...triangles.values()].every((record) => record.remaining === 0));
const output = Buffer.from(input);
for (let i = 0; i < indices.length; i++) output.writeUInt32LE(indices[i], start + i * 4);
assert.ok(output.subarray(0, start).equals(input.subarray(0, start)));
assert.ok(output.subarray(start + length).equals(input.subarray(start + length)));
await writeFile(path, output);
console.log(
  JSON.stringify({
    path,
    bytes: output.length,
    triangles: indices.length / 3,
    changed: !output.equals(input),
    allTrianglesAndWindingPreserved: true,
    otherBytesUnchanged: true,
  }),
);
