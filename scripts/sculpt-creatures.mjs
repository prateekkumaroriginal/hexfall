// Author and bake the concept sculptures offline. No marching or decimation runs in the game.
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
import { readFile, writeFile } from 'node:fs/promises';

const clamp = THREE.MathUtils.clamp;
const blend = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const ellipsoid = (center, size, power = 2, rotation = 0) => {
  const c = Math.cos(rotation),
    s = Math.sin(rotation),
    radius = Math.min(...size);
  return (x, y, z) => {
    const dx = x - center[0],
      dy = y - center[1];
    const px = Math.abs((dx * c + dy * s) / size[0]);
    const py = Math.abs((-dx * s + dy * c) / size[1]);
    const pz = Math.abs((z - center[2]) / size[2]);
    return (Math.pow(px ** power + py ** power + pz ** power, 1 / power) - 1) * radius;
  };
};
const union =
  (lobes, k = 0.055) =>
  (x, y, z) => {
    let d = 100;
    for (const field of lobes) d = blend(d, field(x, y, z), k);
    return d;
  };
const slimeLobes = [ellipsoid([0, 0.52, 0], [1.11, 0.81, 0.89], 2.0)];
const slimeBrows = union(
  [-1, 1].map((side) =>
    ellipsoid([side * 0.41, 0.81, 0.86], [0.235, 0.082, 0.08], 2.2, side * 0.32),
  ),
  0.025,
);
for (let i = 0; i < 5; i++) {
  const a = (i * Math.PI * 2) / 5;
  slimeLobes.push(ellipsoid([Math.sin(a) * 0.8, 0.11, Math.cos(a) * 0.74], [0.4, 0.09, 0.36], 2.5));
}
const slimeUnion = union(slimeLobes, 0.065);
const slimeSockets = [-1, 1].map((side) =>
  ellipsoid([side * 0.4, 0.664, 0.857], [0.22, 0.18, 0.14]),
);
const mouth = ellipsoid([0, 0.305, 0.958], [0.39, 0.087, 0.12], 2.2);
const slimeField = (x, y, z) => {
  const taper = 1.1 - Math.max(0, y) * 0.23;
  let d = Math.max(slimeUnion(x / taper, y, z), 0.035 - y);
  for (const hole of [...slimeSockets, mouth]) d = -blend(-d, hole(x, y, z), 0.018);
  return blend(d, slimeBrows(x, y, z), 0.038);
};

function sculpt(field, min, max, step, vertexLimit) {
  const cells = max.map((v, i) => Math.ceil((v - min[i]) / step));
  const [nx, ny, nz] = cells;
  const samples = [],
    positions = [],
    indices = [],
    edgeCache = new Map();
  const id = (x, y, z) => (z * (ny + 1) + y) * (nx + 1) + x;
  for (let z = 0; z <= nz; z++)
    for (let y = 0; y <= ny; y++)
      for (let x = 0; x <= nx; x++) {
        const p = new THREE.Vector3(min[0] + x * step, min[1] + y * step, min[2] + z * step);
        samples.push({ p, d: field(p.x, p.y, p.z) });
      }
  const gradient = (p) =>
    new THREE.Vector3(
      field(p.x + 0.002, p.y, p.z) - field(p.x - 0.002, p.y, p.z),
      field(p.x, p.y + 0.002, p.z) - field(p.x, p.y - 0.002, p.z),
      field(p.x, p.y, p.z + 0.002) - field(p.x, p.y, p.z - 0.002),
    ).normalize();
  const vertex = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeCache.has(key)) return edgeCache.get(key);
    const sa = samples[a],
      sb = samples[b],
      p = sa.p.clone().lerp(sb.p, sa.d / (sa.d - sb.d));
    const index = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    edgeCache.set(key, index);
    return index;
  };
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const triangle = (ia, ib, ic) => {
    a.fromArray(positions, ia * 3);
    b.fromArray(positions, ib * 3);
    c.fromArray(positions, ic * 3);
    if (b.clone().sub(a).cross(c.clone().sub(a)).dot(gradient(a)) < 0) indices.push(ia, ic, ib);
    else indices.push(ia, ib, ic);
  };
  const tetrahedra = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ];
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const corners = [
          id(x, y, z),
          id(x + 1, y, z),
          id(x + 1, y + 1, z),
          id(x, y + 1, z),
          id(x, y, z + 1),
          id(x + 1, y, z + 1),
          id(x + 1, y + 1, z + 1),
          id(x, y + 1, z + 1),
        ];
        if (corners.every((i) => samples[i].d >= 0) || corners.every((i) => samples[i].d < 0))
          continue;
        for (const t of tetrahedra) {
          const inside = t.map((i) => corners[i]).filter((i) => samples[i].d < 0),
            outside = t.map((i) => corners[i]).filter((i) => samples[i].d >= 0);
          if (!inside.length || !outside.length) continue;
          if (inside.length === 1) triangle(...outside.map((i) => vertex(inside[0], i)));
          else if (outside.length === 1) triangle(...inside.map((i) => vertex(outside[0], i)));
          else {
            const a = vertex(inside[0], outside[0]),
              b = vertex(inside[0], outside[1]),
              c = vertex(inside[1], outside[0]),
              d = vertex(inside[1], outside[1]);
            triangle(a, b, c);
            triangle(b, d, c);
          }
        }
      }
  // Weld coincident marching-tetrahedra corners before simplification. A
  // topology-preserving decimator must receive a clean, indexed surface.
  const welded = [],
    remap = [],
    unique = new Map(),
    cleanIndices = [],
    faces = new Set();
  for (let i = 0; i < positions.length; i += 3) {
    const key = positions
      .slice(i, i + 3)
      .map((v) => Math.round(v * 1e6))
      .join(',');
    let index = unique.get(key);
    if (index === undefined) {
      index = welded.length / 3;
      unique.set(key, index);
      welded.push(...positions.slice(i, i + 3));
    }
    remap.push(index);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const face = indices.slice(i, i + 3).map((v) => remap[v]);
    if (new Set(face).size < 3) continue;
    const key = [...face].sort((a, b) => a - b).join(',');
    if (faces.has(key)) continue;
    faces.add(key);
    cleanIndices.push(...face);
  }
  const sourcePositions = new Float32Array(welded);
  const originalVertices = positions.length / 3;
  const [reduced, error] = MeshoptSimplifier.simplify(
    new Uint32Array(cleanIndices),
    sourcePositions,
    3,
    (vertexLimit * 2 - 4) * 3,
    0.01,
    ['LockBorder'],
  );
  const [vertexRemap, vertexCount] = MeshoptSimplifier.compactMesh(reduced);
  const compactPositions = new Float32Array(vertexCount * 3);
  for (let old = 0; old < vertexRemap.length; old++)
    if (vertexRemap[old] !== 0xffffffff)
      compactPositions.set(sourcePositions.subarray(old * 3, old * 3 + 3), vertexRemap[old] * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(compactPositions, 3));
  geometry.setIndex(new THREE.BufferAttribute(reduced, 1));
  geometry.userData.simplificationError = error;
  const p = geometry.getAttribute('position'),
    normal = new Float32Array(p.count * 3),
    ao = new Uint8Array(p.count),
    point = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i);
    // Edge collapses place vertices on chords inside curved surfaces. Project
    // them back to the authored field before calculating normals and cavities.
    for (let iteration = 0; iteration < 5; iteration++) {
      const distance = field(point.x, point.y, point.z);
      if (Math.abs(distance) < 0.00005) break;
      const e = 0.001;
      const derivative = new THREE.Vector3(
        field(point.x + e, point.y, point.z) - field(point.x - e, point.y, point.z),
        field(point.x, point.y + e, point.z) - field(point.x, point.y - e, point.z),
        field(point.x, point.y, point.z + e) - field(point.x, point.y, point.z - e),
      ).multiplyScalar(1 / (2 * e));
      const slope = derivative.lengthSq();
      if (slope < 0.0001) break;
      derivative.multiplyScalar(distance / slope).clampLength(0, step * 0.65);
      point.sub(derivative);
    }
    p.setXYZ(i, point.x, point.y, point.z);
    const n = gradient(point);
    normal.set(n.toArray(), i * 3);
    const e = 0.003;
    const slope = Math.max(
      0.1,
      Math.hypot(
        field(point.x + e, point.y, point.z) - field(point.x - e, point.y, point.z),
        field(point.x, point.y + e, point.z) - field(point.x, point.y - e, point.z),
        field(point.x, point.y, point.z + e) - field(point.x, point.y, point.z - e),
      ) /
        (2 * e),
    );
    let cavity = 0;
    for (const distance of [0.055, 0.12])
      cavity +=
        clamp(
          field(point.x + n.x * distance, point.y + n.y * distance, point.z + n.z * distance) /
            (distance * slope),
          0,
          1,
        ) * 0.5;
    ao[i] = Math.round((0.52 + cavity * 0.48) * 255);
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  return { geometry, ao, originalVertices };
}
const definitions = {
  slime: [slimeField, [-1.35, 0.02, -1.2], [1.35, 1.44, 1.2], 0.026, 4800],
};
const selectedArg = process.argv.find((arg) => arg.startsWith('--only='));
const selected = selectedArg ? new Set(selectedArg.slice(7).split(',')) : null;
if (selected)
  for (const name of selected)
    if (!(name in definitions)) throw new Error(`Unknown sculpture: ${name}`);
const packed = selected
  ? JSON.parse(await readFile('src/game/creature-sculpt-data.json', 'utf8'))
  : {};
for (const [name, definition] of Object.entries(definitions)) {
  if (selected && !selected.has(name)) continue;
  const start = performance.now();
  const { geometry, ao, originalVertices } = sculpt(...definition),
    p = geometry.getAttribute('position'),
    n = geometry.getAttribute('normal');
  const positions = new Int16Array(p.count * 3),
    normals = new Int8Array(p.count * 3);
  for (let i = 0; i < p.count; i++)
    for (let c = 0; c < 3; c++) {
      positions[i * 3 + c] = Math.round(p.array[i * 3 + c] * 10000);
      normals[i * 3 + c] = Math.round(clamp(n.array[i * 3 + c], -1, 1) * 127);
    }
  // Quantization can collapse an extremely short edge. Weld that pair and
  // remove its two collapsed faces before writing, then audit the actual payload.
  const quantizedVertices = new Map(),
    vertexRemap = [],
    outPositions = [],
    outNormals = [],
    outAo = [];
  for (let vertex = 0; vertex < p.count; vertex++) {
    const xyz = Array.from(positions.subarray(vertex * 3, vertex * 3 + 3));
    const key = xyz.join(',');
    let target = quantizedVertices.get(key);
    if (target === undefined) {
      target = outAo.length;
      quantizedVertices.set(key, target);
      outPositions.push(...xyz);
      outNormals.push(...normals.subarray(vertex * 3, vertex * 3 + 3));
      outAo.push(ao[vertex]);
    }
    vertexRemap.push(target);
  }
  const outIndices = [],
    edges = new Map();
  for (let face = 0; face < geometry.index.count; face += 3) {
    const ids = [0, 1, 2].map((corner) => vertexRemap[geometry.index.getX(face + corner)]);
    if (new Set(ids).size < 3) continue;
    const [a, b, c] = ids.map((vertex) => new THREE.Vector3().fromArray(outPositions, vertex * 3));
    if (b.sub(a).cross(c.sub(a)).lengthSq() === 0)
      throw new Error(`${name}: zero-area quantized face`);
    outIndices.push(...ids);
    for (let edge = 0; edge < 3; edge++) {
      const a = ids[edge],
        b = ids[(edge + 1) % 3],
        key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const record = edges.get(key) ?? { count: 0, direction: 0, faces: [] };
      record.count++;
      record.direction += a < b ? 1 : -1;
      record.faces.push({ face: outIndices.length / 3 - 1, direction: a < b ? 1 : -1 });
      edges.set(key, record);
    }
  }
  if ([...edges.values()].some((edge) => edge.count !== 2))
    throw new Error(`${name}: baked surface is not closed`);
  // A gradient at a tetrahedron corner can choose the wrong winding near a
  // socket saddle. Propagate orientation across shared edges, then orient each
  // connected component outward using signed volume.
  const orientation = new Int8Array(outIndices.length / 3);
  for (let seed = 0; seed < orientation.length; seed++) {
    if (orientation[seed]) continue;
    const pending = [seed],
      component = [];
    orientation[seed] = 1;
    while (pending.length) {
      const face = pending.pop();
      component.push(face);
      const ids = outIndices.slice(face * 3, face * 3 + 3);
      for (let edge = 0; edge < 3; edge++) {
        const a = ids[edge],
          b = ids[(edge + 1) % 3],
          key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const neighbor = edges.get(key).faces.find((entry) => entry.face !== face);
        const required = -orientation[face] * (a < b ? 1 : -1) * neighbor.direction;
        if (!orientation[neighbor.face]) {
          orientation[neighbor.face] = required;
          pending.push(neighbor.face);
        } else if (orientation[neighbor.face] !== required)
          throw new Error(`${name}: non-orientable surface`);
      }
    }
    let volume = 0;
    for (const face of component) {
      const [a, b, c] = outIndices
        .slice(face * 3, face * 3 + 3)
        .map((vertex) =>
          new THREE.Vector3().fromArray(outPositions, vertex * 3).multiplyScalar(0.0001),
        );
      volume += a.dot(b.cross(c)) * orientation[face];
    }
    for (const face of component)
      if (orientation[face] * (volume < 0 ? -1 : 1) < 0) {
        const b = outIndices[face * 3 + 1];
        outIndices[face * 3 + 1] = outIndices[face * 3 + 2];
        outIndices[face * 3 + 2] = b;
      }
  }
  const encode = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  packed[name] = {
    positions: encode(new Int16Array(outPositions)),
    normals: encode(new Int8Array(outNormals)),
    ao: encode(new Uint8Array(outAo)),
    indices: encode(new Uint16Array(outIndices)),
  };
  console.log(
    `${name}: ${originalVertices} -> ${outAo.length} vertices, ${outIndices.length / 3} triangles, closed surface, ${(performance.now() - start).toFixed(0)} ms bake`,
  );
}
await writeFile('src/game/creature-sculpt-data.json', JSON.stringify(packed, null, 2) + '\n');
