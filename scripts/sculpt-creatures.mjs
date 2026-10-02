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
const bodyLobes = [
  ellipsoid([0, 1.035, 0], [0.445, 0.2, 0.25], 2.4),
  ellipsoid([0, 1.35, -0.045], [0.365, 0.42, 0.225], 2.5),
  ellipsoid([0, 1.77, -0.06], [0.57, 0.34, 0.29], 2.1),
  ellipsoid([0, 2.025, -0.04], [0.28, 0.18, 0.23]),
  ellipsoid([0, 2.16, 0.005], [0.205, 0.17, 0.205]),
];
for (const side of [-1, 1]) {
  bodyLobes.push(
    ellipsoid([side * 0.29, 1.86, 0.195], [0.302, 0.19, 0.15], 2.3, side * 0.16),
    ellipsoid([side * 0.45, 1.98, -0.055], [0.26, 0.16, 0.23], 2.2, side * -0.3),
    ellipsoid([side * 0.335, 1.55, 0.035], [0.13, 0.29, 0.19], 2.3, side * -0.23),
    ellipsoid([side * 0.28, 1.86, -0.29], [0.27, 0.25, 0.125], 2.1, side * -0.3),
    ellipsoid([side * 0.17, 2.06, -0.12], [0.235, 0.19, 0.17], 2.3, side * -0.5),
  );
  for (const [y, z, width] of [
    [1.59, 0.235, 0.145],
    [1.43, 0.227, 0.135],
    [1.28, 0.218, 0.12],
  ])
    bodyLobes.push(ellipsoid([side * 0.145, y, z], [width, 0.098, 0.105], 2.6, side * -0.08));
}
const bodyUnion = union(bodyLobes, 0.035);
// Recess the sternum and the spaces between muscle blocks into the continuous skin.
const bodyCuts = [
  ellipsoid([0, 1.79, 0.365], [0.026, 0.23, 0.05]),
  ellipsoid([0, 1.43, 0.342], [0.019, 0.28, 0.026]),
  ...[1.355, 1.515].map((y) => ellipsoid([0, y, 0.339], [0.29, 0.014, 0.025], 2.5)),
];
const bodyField = (x, y, z) => {
  let d = bodyUnion(x, y, z);
  for (const cut of bodyCuts) d = -blend(-d, cut(x, y, z), 0.008);
  return d;
};
const headLobes = [
  ellipsoid([0, 2.47, -0.035], [0.315, 0.275, 0.265], 2.3),
  ellipsoid([0, 2.175, 0.13], [0.285, 0.15, 0.25], 2.7),
  ellipsoid([0, 2.08, 0.29], [0.235, 0.112, 0.165], 2.5),
  ellipsoid([-0.105, 2.095, 0.345], [0.145, 0.079, 0.09], 2.6),
  ellipsoid([0.105, 2.095, 0.345], [0.145, 0.079, 0.09], 2.6),
  ellipsoid([0, 2.225, 0.355], [0.23, 0.065, 0.075], 3.0),
  ellipsoid([0, 2.365, 0.31], [0.096, 0.14, 0.13], 2.3),
  ellipsoid([0, 2.315, 0.422], [0.12, 0.073, 0.11], 2.4),
  ellipsoid([-0.089, 2.285, 0.415], [0.062, 0.047, 0.082]),
  ellipsoid([0.089, 2.285, 0.415], [0.062, 0.047, 0.082]),
  ellipsoid([0, 2.486, 0.25], [0.041, 0.052, 0.075], 2.5),
];
for (const side of [-1, 1])
  headLobes.push(
    ellipsoid([side * 0.245, 2.33, 0.19], [0.107, 0.122, 0.14], 2.7, side * -0.22),
    ellipsoid([side * 0.168, 2.453, 0.26], [0.15, 0.071, 0.102], 2.9, side * 0.32),
  );
const headUnion = union(headLobes, 0.032);
const nostrils = [-1, 1].map((side) =>
  ellipsoid([side * 0.078, 2.282, 0.505], [0.027, 0.019, 0.036]),
);
const sockets = [-1, 1].map((side) =>
  ellipsoid([side * 0.165, 2.406, 0.28], [0.105, 0.044, 0.087], 2.4, side * 0.18),
);
const cheekCuts = [-1, 1].map((side) =>
  ellipsoid([side * 0.22, 2.251, 0.365], [0.068, 0.082, 0.044], 2, side * -0.4),
);
const lipCut = ellipsoid([0, 2.166, 0.454], [0.212, 0.03, 0.042], 2.2);
const headField = (x, y, z) => {
  let d = headUnion(x, y, z);
  for (const hole of [...sockets, ...nostrils, ...cheekCuts, lipCut])
    d = -blend(-d, hole(x, y, z), 0.012);
  return d;
};
const hairMass = union(
  [
    ellipsoid([0, 2.705, -0.07], [0.218, 0.087, 0.185], 2.3),
    ellipsoid([-0.115, 2.742, 0.08], [0.114, 0.067, 0.103], 2.2, 0.35),
    ellipsoid([0.02, 2.723, 0.105], [0.112, 0.075, 0.084], 2.2, -0.4),
    ellipsoid([0.125, 2.7, 0.052], [0.105, 0.07, 0.099], 2.2, -0.38),
    ellipsoid([0.005, 2.79, -0.08], [0.077, 0.09, 0.078]),
    ellipsoid([0.035, 2.87, -0.105], [0.102, 0.095, 0.085], 2.1, 0.32),
    ellipsoid([-0.04, 2.944, -0.145], [0.108, 0.046, 0.078], 2.1, 0.25),
    ellipsoid([-0.13, 2.9, -0.163], [0.051, 0.043, 0.053], 2.0, -0.5),
    ellipsoid([0, 2.68, -0.255], [0.097, 0.135, 0.082], 2.2),
    ellipsoid([0, 2.56, -0.29], [0.067, 0.12, 0.063], 2.3),
    ellipsoid([-0.005, 2.475, -0.277], [0.029, 0.062, 0.037], 2.1),
  ],
  0.025,
);
const hairField = (x, y, z) =>
  hairMass(x, y, z) + 0.0025 * Math.sin(x * 125 + y * 17) * Math.sin(z * 28 + y * 8);
const armLobes = [
  ellipsoid([0.025, -0.13, -0.015], [0.27, 0.26, 0.25], 2.3),
  ellipsoid([0.1, -0.365, 0.075], [0.205, 0.255, 0.19], 2.3, -0.12),
  ellipsoid([0.09, -0.345, -0.11], [0.21, 0.245, 0.125], 2.5, -0.12),
  ellipsoid([0.18, -0.58, 0.07], [0.146, 0.12, 0.155], 2.6),
  ellipsoid([0.2, -0.735, 0.155], [0.175, 0.205, 0.17], 2.4, -0.15),
  ellipsoid([0.21, -0.965, 0.265], [0.135, 0.145, 0.13], 2.4),
  ellipsoid([0.21, -1.095, 0.305], [0.18, 0.12, 0.16], 3.6),
  ellipsoid([0.055, -1.04, 0.381], [0.096, 0.066, 0.084], 2.6, -0.55),
];
for (let finger = 0; finger < 4; finger++) {
  const x = 0.21 + (finger - 1.5) * 0.083;
  const offset = [0.018, 0, -0.01, 0.012][finger];
  armLobes.push(
    ellipsoid([x, -1.045 + offset, 0.437], [0.043, 0.057, 0.047], 3),
    ellipsoid([x, -1.127 + offset, 0.415], [0.041, 0.06, 0.052], 3),
  );
}
const armField = union([union(armLobes.slice(0, 8), 0.06), union(armLobes.slice(8), 0.012)], 0.014);
const legField = union(
  [
    ellipsoid([0, -0.13, -0.025], [0.24, 0.265, 0.235], 2.3),
    ellipsoid([0.055, -0.215, 0.085], [0.175, 0.255, 0.182], 2.6, -0.13),
    ellipsoid([-0.095, -0.32, 0.085], [0.104, 0.163, 0.14], 2.4, 0.17),
    ellipsoid([0, -0.43, 0.1], [0.158, 0.125, 0.132], 2.7),
    ellipsoid([0, -0.585, -0.015], [0.145, 0.22, 0.158], 2.3),
  ],
  0.05,
);
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
  hair: [hairField, [-0.28, 2.38, -0.41], [0.28, 3.1, 0.24], 0.016, 1250],
  torso: [bodyField, [-0.82, 0.8, -0.5], [0.82, 2.36, 0.53], 0.028, 3200],
  head: [headField, [-0.42, 1.93, -0.38], [0.42, 2.83, 0.59], 0.017, 2600],
  rightArm: [armField, [-0.34, -1.27, -0.31], [0.45, 0.18, 0.51], 0.021, 1600],
  leftArm: [
    (x, y, z) => armField(-x, y, z),
    [-0.45, -1.27, -0.31],
    [0.34, 0.18, 0.51],
    0.021,
    1600,
  ],
  leg: [legField, [-0.31, -0.85, -0.3], [0.31, 0.2, 0.33], 0.026, 1050],
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
