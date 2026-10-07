import { readFile, writeFile } from 'node:fs/promises';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

// Keep the downloaded original intact. This copy retains its PBR images and UV seams.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-orc.mjs <source.glb>');
const file = await readFile(source);
const jsonLength = file.readUInt32LE(12);
const gltf = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
const binary = file.subarray(28 + jsonLength);
await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const decoded = new Map();
function attribute(index, components) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  if (!decoded.has(accessor.bufferView)) {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (ext) {
      const bytes = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(
        bytes,
        ext.count,
        ext.byteStride,
        binary.subarray(ext.byteOffset, ext.byteOffset + ext.byteLength),
        ext.mode,
        ext.filter,
      );
      decoded.set(accessor.bufferView, bytes);
    } else {
      decoded.set(
        accessor.bufferView,
        binary.subarray(view.byteOffset, view.byteOffset + view.byteLength),
      );
    }
  }
  const bytes = decoded.get(accessor.bufferView);
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = { 5120: 1, 5125: 4, 5126: 4 }[accessor.componentType];
  if (!size) throw new Error(`Unsupported accessor component ${accessor.componentType}`);
  const result =
    accessor.componentType === 5125
      ? new Uint32Array(accessor.count * components)
      : new Float32Array(accessor.count * components);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < components; c++) {
      const offset =
        (accessor.byteOffset ?? 0) + i * (view.byteStride ?? size * components) + c * size;
      result[i * components + c] =
        accessor.componentType === 5126
          ? data.getFloat32(offset, true)
          : accessor.componentType === 5125
            ? data.getUint32(offset, true)
            : Math.max(-1, data.getInt8(offset) / 127);
    }
  }
  return result;
}
if (gltf.meshes.length !== 1 || gltf.meshes[0].primitives.length !== 1 || gltf.skins?.length) {
  throw new Error('This importer expects a single static mesh');
}
const primitive = gltf.meshes[0].primitives[0];
const positions = attribute(primitive.attributes.POSITION, 3);
const normals = attribute(primitive.attributes.NORMAL, 3);
const uv = attribute(primitive.attributes.TEXCOORD_0, 2);
const indices = attribute(primitive.indices, 1);
// The supplied GLB reconstructed all five studies in the concept sheet.
// Weld UV-seam duplicates for connectivity, then retain the largest complete figure.
const parents = Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
const find = (i) => {
  while (parents[i] !== i) {
    parents[i] = parents[parents[i]];
    i = parents[i];
  }
  return i;
};
const join = (a, b) => {
  parents[find(a)] = find(b);
};
const weld = new Map();
for (let i = 0; i < parents.length; i++) {
  const key = Array.from(positions.subarray(i * 3, i * 3 + 3), (v) => Math.round(v * 1e6)).join(
    ',',
  );
  if (weld.has(key)) join(i, weld.get(key));
  else weld.set(key, i);
}
for (let i = 0; i < indices.length; i += 3) {
  join(indices[i], indices[i + 1]);
  join(indices[i], indices[i + 2]);
}
const components = new Map();
for (let i = 0; i < indices.length; i += 3) {
  const root = find(indices[i]);
  components.set(root, (components.get(root) ?? 0) + 1);
}
const largest = [...components].sort((a, b) => b[1] - a[1])[0][0];
const selected = [];
for (let i = 0; i < indices.length; i += 3) {
  if (find(indices[i]) === largest) selected.push(indices[i], indices[i + 1], indices[i + 2]);
}
const figureIndices = Uint32Array.from(selected);
MeshoptSimplifier.useExperimentalFeatures = true;
const attributes = new Float32Array((positions.length / 3) * 5);
for (let i = 0; i < positions.length / 3; i++) {
  attributes.set(normals.subarray(i * 3, i * 3 + 3), i * 5);
  attributes.set(uv.subarray(i * 2, i * 2 + 2), i * 5 + 3);
}
const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(
  figureIndices,
  positions,
  3,
  attributes,
  5,
  [0.1, 0.1, 0.1, 1, 1],
  null,
  120000 * 3,
  0.025,
);
const [remap, count] = MeshoptSimplifier.compactMesh(simplified);
const compact = (values, size) => {
  const result = new Float32Array(count * size);
  for (let i = 0; i < remap.length; i++) {
    if (remap[i] !== 0xffffffff)
      result.set(values.subarray(i * size, i * size + size), remap[i] * size);
  }
  return result;
};
const outputPositions = compact(positions, 3);
const outputNormals = compact(normals, 3);
const outputUV = compact(uv, 2);
const chunks = [],
  views = [];
let offset = 0;
const append = (bytes, target) => {
  const padding = (4 - (offset % 4)) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    offset += padding;
  }
  const index = views.length;
  views.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: bytes.byteLength,
    ...(target ? { target } : {}),
  });
  chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  offset += bytes.byteLength;
  return index;
};
for (const image of gltf.images) {
  const view = gltf.bufferViews[image.bufferView];
  image.bufferView = append(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength));
}
const min = [Infinity, Infinity, Infinity],
  max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < outputPositions.length; i++) {
  min[i % 3] = Math.min(min[i % 3], outputPositions[i]);
  max[i % 3] = Math.max(max[i % 3], outputPositions[i]);
}
gltf.accessors = [
  {
    bufferView: append(outputPositions, 34962),
    componentType: 5126,
    count,
    type: 'VEC3',
    min,
    max,
  },
  { bufferView: append(outputNormals, 34962), componentType: 5126, count, type: 'VEC3' },
  { bufferView: append(outputUV, 34962), componentType: 5126, count, type: 'VEC2' },
  {
    bufferView: append(simplified, 34963),
    componentType: 5125,
    count: simplified.length,
    type: 'SCALAR',
  },
];
primitive.attributes = { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 };
primitive.indices = 3;
gltf.bufferViews = views;
delete gltf.extensionsUsed;
delete gltf.extensionsRequired;
gltf.asset.generator = 'Hexfall orc importer, meshoptimizer attribute-aware simplification';
for (const [collection, name] of [
  ['nodes', 'OrcNode'],
  ['meshes', 'OrcMesh'],
  ['materials', 'OrcMaterial'],
  ['images', 'OrcTexture'],
]) {
  gltf[collection]?.forEach((item, index) => {
    item.name = `${name}${index}`;
  });
}
gltf.extras = {
  sourceTriangles: indices.length / 3,
  sourceFigures: components.size,
  selectedFigureTriangles: figureIndices.length / 3,
  triangles: simplified.length / 3,
  simplificationError: error,
};
const bin = Buffer.concat([...chunks, Buffer.alloc((4 - (offset % 4)) % 4)]);
gltf.buffers = [{ byteLength: bin.length }];
const json = Buffer.from(JSON.stringify(gltf));
const paddedJSON = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
const header = Buffer.alloc(20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + paddedJSON.length + bin.length, 8);
header.writeUInt32LE(paddedJSON.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(bin.length);
binHeader.writeUInt32LE(0x004e4942, 4);
await writeFile(
  new URL('../public/models/orc-source.glb', import.meta.url),
  Buffer.concat([header, paddedJSON, binHeader, bin]),
);
console.log(
  JSON.stringify({
    ...gltf.extras,
    vertices: count,
    bytes: header.length + paddedJSON.length + binHeader.length + bin.length,
  }),
);
