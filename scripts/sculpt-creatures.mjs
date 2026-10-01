// Author and bake the concept sculptures offline. No marching or decimation runs in the game.
import * as THREE from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { writeFile } from 'node:fs/promises';

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
  ellipsoid([0, 1.35, -0.025], [0.37, 0.42, 0.23], 2.5),
  ellipsoid([0, 1.77, -0.06], [0.62, 0.34, 0.3], 2.3),
  ellipsoid([0, 2.025, -0.04], [0.28, 0.18, 0.23]),
  ellipsoid([0, 2.16, -0.025], [0.195, 0.16, 0.185]),
];
for (const side of [-1, 1]) {
  bodyLobes.push(
    ellipsoid([side * 0.3, 1.84, 0.25], [0.3, 0.185, 0.16], 2.8, side * 0.04),
    ellipsoid([side * 0.45, 1.98, -0.055], [0.26, 0.16, 0.23], 2.2, side * -0.3),
    ellipsoid([side * 0.36, 1.6, -0.14], [0.18, 0.28, 0.19], 2.3, side * 0.15),
    ellipsoid([side * 0.28, 1.86, -0.29], [0.3, 0.25, 0.115], 2.4),
  );
  for (const [y, z, width] of [
    [1.59, 0.26, 0.14],
    [1.43, 0.252, 0.135],
    [1.28, 0.233, 0.12],
  ])
    bodyLobes.push(ellipsoid([side * 0.14, y, z], [width, 0.095, 0.076], 2.7));
}
const bodyField = union(bodyLobes, 0.048);
const headLobes = [
  ellipsoid([0, 2.47, -0.035], [0.32, 0.29, 0.265], 2.3),
  ellipsoid([0, 2.175, 0.13], [0.3, 0.16, 0.25], 3.4),
  ellipsoid([0, 2.075, 0.22], [0.225, 0.108, 0.135], 3.0),
  ellipsoid([0, 2.225, 0.355], [0.23, 0.065, 0.075], 3.0),
  ellipsoid([0, 2.355, 0.275], [0.088, 0.15, 0.12], 2.7),
  ellipsoid([0, 2.275, 0.382], [0.09, 0.049, 0.06], 2.5),
];
for (const side of [-1, 1])
  headLobes.push(
    ellipsoid([side * 0.255, 2.31, 0.175], [0.105, 0.145, 0.115], 2.6, side * -0.16),
    ellipsoid([side * 0.165, 2.475, 0.248], [0.165, 0.075, 0.078], 2.8, side * 0.2),
  );
const headUnion = union(headLobes, 0.032);
const sockets = [-1, 1].map((side) => ellipsoid([side * 0.165, 2.414, 0.25], [0.11, 0.06, 0.073]));
const headField = (x, y, z) => {
  let d = headUnion(x, y, z);
  for (const hole of sockets) d = -blend(-d, hole(x, y, z), 0.012);
  return d;
};
const armLobes = [
  ellipsoid([0.025, -0.13, -0.015], [0.27, 0.26, 0.25], 2.3),
  ellipsoid([0.1, -0.365, 0.075], [0.205, 0.255, 0.19], 2.3, -0.12),
  ellipsoid([0.09, -0.345, -0.11], [0.21, 0.245, 0.125], 2.5, -0.12),
  ellipsoid([0.18, -0.58, 0.07], [0.165, 0.12, 0.17], 2.6),
  ellipsoid([0.2, -0.735, 0.155], [0.175, 0.205, 0.17], 2.4, -0.15),
  ellipsoid([0.21, -0.965, 0.265], [0.135, 0.145, 0.13], 2.4),
  ellipsoid([0.21, -1.095, 0.305], [0.18, 0.12, 0.16], 3.6),
  ellipsoid([0.025, -1.06, 0.335], [0.075, 0.093, 0.09], 2.5, -0.3),
];
for (let finger = 0; finger < 4; finger++) {
  const x = 0.21 + (finger - 1.5) * 0.083;
  armLobes.push(
    ellipsoid([x, -1.055, 0.421], [0.044, 0.045, 0.047], 2.6),
    ellipsoid([x, -1.135, 0.382], [0.043, 0.055, 0.056], 3),
  );
}
const armField = union(armLobes, 0.035);
const legField = union(
  [
    ellipsoid([0, -0.13, -0.025], [0.24, 0.265, 0.235], 2.3),
    ellipsoid([0, -0.23, 0.065], [0.19, 0.27, 0.175], 2.4),
    ellipsoid([0, -0.43, 0.1], [0.158, 0.125, 0.132], 2.7),
    ellipsoid([0, -0.585, -0.015], [0.145, 0.22, 0.158], 2.3),
  ],
  0.05,
);
const slimeLobes = [ellipsoid([0, 0.55, 0], [1.02, 0.79, 0.92], 2.1)];
for (let i = 0; i < 7; i++) {
  const a = (i * Math.PI * 2) / 7;
  slimeLobes.push(
    ellipsoid([Math.sin(a) * 0.8, 0.103, Math.cos(a) * 0.74], [0.35, 0.092, 0.31], 2.5),
  );
}
for (const side of [-1, 1])
  slimeLobes.push(ellipsoid([side * 0.355, 1.002, 0.68], [0.21, 0.068, 0.075], 2.8, side * 0.2));
slimeLobes.push(ellipsoid([0, 0.315, 0.885], [0.31, 0.042, 0.055], 2.8));
const slimeUnion = union(slimeLobes, 0.105);
const slimeSockets = [-1, 1].map((side) =>
  ellipsoid([side * 0.35, 0.824, 0.802], [0.18, 0.184, 0.12]),
);
const mouth = ellipsoid([0, 0.415, 0.903], [0.285, 0.11, 0.095], 2.4);
const slimeField = (x, y, z) => {
  let d = Math.max(slimeUnion(x, y, z), 0.046 - y);
  for (const hole of [...slimeSockets, mouth]) d = -blend(-d, hole(x, y, z), 0.022);
  return d;
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
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const originalVertices = positions.length / 3;
  if (originalVertices > vertexLimit)
    geometry = new SimplifyModifier().modify(geometry, originalVertices - vertexLimit);
  const p = geometry.getAttribute('position'),
    normal = new Float32Array(p.count * 3),
    ao = new Uint8Array(p.count),
    point = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i);
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
  torso: [bodyField, [-0.82, 0.8, -0.5], [0.82, 2.36, 0.53], 0.038, 2300],
  head: [headField, [-0.42, 1.93, -0.38], [0.42, 2.83, 0.5], 0.022, 1900],
  rightArm: [armField, [-0.34, -1.27, -0.31], [0.45, 0.18, 0.5], 0.024, 1350],
  leftArm: [(x, y, z) => armField(-x, y, z), [-0.45, -1.27, -0.31], [0.34, 0.18, 0.5], 0.024, 1350],
  leg: [legField, [-0.31, -0.85, -0.3], [0.31, 0.2, 0.33], 0.033, 800],
  slime: [slimeField, [-1.23, 0.02, -1.14], [1.23, 1.44, 1.14], 0.045, 2200],
};
const packed = {};
for (const [name, definition] of Object.entries(definitions)) {
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
  const encode = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  packed[name] = {
    positions: encode(positions),
    normals: encode(normals),
    ao: encode(ao),
    indices: encode(new Uint16Array(geometry.index.array)),
  };
  console.log(
    `${name}: ${originalVertices} -> ${p.count} vertices, ${geometry.index.count / 3} triangles, ${(performance.now() - start).toFixed(0)} ms bake`,
  );
}
await writeFile('src/game/creature-sculpt-data.json', JSON.stringify(packed, null, 2) + '\n');
