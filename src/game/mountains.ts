import { required, at } from '../lib/assert';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA_HALF_WIDTH, ARENA_HALF_DEPTH } from '../config/world';
import { createMountainMaterial } from './mountain-material';
import type { MountainRockTextures } from './mountain-material';

type RidgeProfile = readonly (readonly [outward: number, height: number])[];
const CLIFF_PROFILE: RidgeProfile = [
  [0.08, -0.14],
  [1.3, 0.8],
  [3.4, 2.2],
  [5.8, 5.6],
  [8.2, 9.1],
  [11.6, 14.8],
  [16.8, 19],
  [21.5, 17],
  [27.5, 10.8],
  [34, 4],
  [40, -0.2],
];
const SUMMIT_PROFILE: RidgeProfile = [
  [23, -0.2],
  [29, 8.5],
  [35, 20],
  [42, 32],
  [50, 22],
  [59, 8],
  [68, -0.2],
];
const PROFILE_SUBDIVISIONS = 3;

function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const fx = fade(x - ix),
    fy = fade(y - iy),
    fz = fade(z - iz);
  const hash = (dx: number, dy: number, dz: number) => {
    let value =
      Math.imul(ix + dx, 374761393) ^
      Math.imul(iy + dy, 668265263) ^
      Math.imul(iz + dz, 2147483647);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
  const mix = THREE.MathUtils.lerp;
  return mix(
    mix(mix(hash(0, 0, 0), hash(1, 0, 0), fx), mix(hash(0, 1, 0), hash(1, 1, 0), fx), fy),
    mix(mix(hash(0, 0, 1), hash(1, 0, 1), fx), mix(hash(0, 1, 1), hash(1, 1, 1), fx), fy),
    fz,
  );
}

function peak(phase: number, center: number, width: number) {
  const distance = Math.min(Math.abs(phase - center), 1 - Math.abs(phase - center));
  return Math.exp(-3 * (distance / width) ** 2);
}

// Monotone cubic interpolation rounds the slopes without overshooting the valley floor.
function sampleProfile(profile: RidgeProfile, row: number): readonly [number, number] {
  const segment = Math.min(Math.floor(row / PROFILE_SUBDIVISIONS), profile.length - 2);
  const t = row / PROFILE_SUBDIVISIONS - segment;
  const [x0, y0] = at(profile, segment),
    [x1, y1] = at(profile, segment + 1);
  const secant = (i: number) => {
    const a = at(profile, i),
      b = at(profile, i + 1);
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  const tangent = (i: number) => {
    if (i === 0) return secant(0);
    if (i === profile.length - 1) return secant(i - 1);
    const before = secant(i - 1),
      after = secant(i);
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after);
  };
  const height =
    (2 * t ** 3 - 3 * t ** 2 + 1) * y0 +
    (t ** 3 - 2 * t ** 2 + t) * (x1 - x0) * tangent(segment) +
    (-2 * t ** 3 + 3 * t ** 2) * y1 +
    (t ** 3 - t ** 2) * (x1 - x0) * tangent(segment + 1);
  return [THREE.MathUtils.lerp(x0, x1, t), height];
}

function buildRidge(profile: RidgeProfile, segments: number, distant: boolean) {
  const vertices: THREE.Vector3[] = [];
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const stone = new THREE.Color('#77786e'),
    warmStone = new THREE.Color('#a1927d');
  const highStone = new THREE.Color('#969d9b'),
    distantStone = new THREE.Color('#838f98');
  const grass = new THREE.Color('#626d45');
  const stride = segments + 1;
  const rows = (profile.length - 1) * PROFILE_SUBDIVISIONS + 1;
  for (let row = 0; row < rows; row++) {
    const [baseOutward, baseHeight] = sampleProfile(profile, row);
    for (let i = 0; i <= segments; i++) {
      // Duplicate the first sample exactly, including its noise, to close the ring.
      const phase = i === segments ? 0 : i / segments;
      const side = Math.floor(phase * 4),
        u = phase * 4 - side;
      const x =
        side === 0
          ? -ARENA_HALF_WIDTH + u * ARENA_HALF_WIDTH * 2
          : side === 1
            ? ARENA_HALF_WIDTH
            : side === 2
              ? ARENA_HALF_WIDTH - u * ARENA_HALF_WIDTH * 2
              : -ARENA_HALF_WIDTH;
      const z =
        side === 0
          ? -ARENA_HALF_DEPTH
          : side === 1
            ? -ARENA_HALF_DEPTH + u * ARENA_HALF_DEPTH * 2
            : side === 2
              ? ARENA_HALF_DEPTH
              : ARENA_HALF_DEPTH - u * ARENA_HALF_DEPTH * 2;
      const angle = phase * Math.PI * 2;
      const interior = row > 0 && row < rows - 1;
      const broad = noise(x * 0.12 + 7, baseOutward * 0.035, z * 0.12) * 2 - 1;
      const warp = noise(x * 0.17, baseOutward * 0.08 + 19, z * 0.17) * 2;
      const erosion = noise(x * 0.52 + warp, baseOutward * 0.055, z * 0.52 - warp);
      const gullies = (1 - Math.abs(erosion * 2 - 1)) ** 3;
      const outward = Math.max(0.08, baseOutward + (interior ? broad * 1.2 + gullies * 1.8 : 0));
      const skyline = distant
        ? -3 +
          peak(phase, 0.125, 0.085) * 15 +
          peak(phase, 0.375, 0.07) * 11 +
          peak(phase, 0.625, 0.08) * 14 +
          peak(phase, 0.875, 0.075) * 17
        : peak(phase, 0.19, 0.055) * 6 +
          peak(phase, 0.48, 0.065) * 4.5 +
          peak(phase, 0.72, 0.055) * 5.5;
      const crestDetail =
        (noise(Math.cos(angle) * 9, 13, Math.sin(angle) * 9) - 0.5) * 5 +
        (noise(Math.cos(angle) * 18, 31, Math.sin(angle) * 18) - 0.5) * 1.2;
      const lift = distant
        ? Math.max(0, baseHeight / 32)
        : THREE.MathUtils.smoothstep(baseHeight, 4, 19);
      const weathering = interior
        ? ((noise(x * 0.65, baseOutward * 0.28, z * 0.65) - 0.5) * 0.9 - gullies * 1.3) *
          THREE.MathUtils.smoothstep(baseHeight, 0, 8)
        : 0;
      const height = baseHeight + (skyline + crestDetail) * lift + weathering;
      const radius = Math.hypot(x, z);
      // The foothills follow the arena; higher slopes gradually round its square corners.
      const roundedRadius = THREE.MathUtils.lerp(
        radius,
        Math.hypot(ARENA_HALF_WIDTH, ARENA_HALF_DEPTH) + 0.5,
        THREE.MathUtils.smoothstep(baseOutward, 0, 22),
      );
      const distance = roundedRadius + outward;
      vertices.push(new THREE.Vector3((x / radius) * distance, height, (z / radius) * distance));
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let i = 0; i < segments; i++) {
      const a = row * stride + i,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      if ((row + i) % 2) indices.push(a, b, d, a, d, c);
      else indices.push(a, b, c, b, d, c);
    }
  }
  for (const p of vertices) positions.push(p.x, p.y, p.z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  // Share the seam normal so lighting does not reveal the duplicated perimeter vertices.
  for (let row = 0; row < rows; row++) {
    const a = row * stride,
      b = a + segments;
    const n = new THREE.Vector3(
      normals.getX(a) + normals.getX(b),
      normals.getY(a) + normals.getY(b),
      normals.getZ(a) + normals.getZ(b),
    ).normalize();
    normals.setXYZ(a, n.x, n.y, n.z);
    normals.setXYZ(b, n.x, n.y, n.z);
  }
  vertices.forEach((p, i) => {
    const patches = noise(p.x * 0.13, p.y * 0.16, p.z * 0.13);
    const color = distant
      ? distantStone.clone().lerp(highStone, patches * 0.45)
      : stone
          .clone()
          .lerp(warmStone, patches * 0.55)
          .lerp(highStone, THREE.MathUtils.smoothstep(p.y, 12, 26) * 0.35);
    if (!distant && p.y < 8)
      color.lerp(grass, THREE.MathUtils.smoothstep(normals.getY(i), 0.55, 0.9) * 0.65);
    colors.push(color.r, color.g, color.b);
  });
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function buildOutcrops() {
  const parts: THREE.BufferGeometry[] = [];
  const stone = new THREE.Color('#828377'),
    paleStone = new THREE.Color('#a5a393'),
    moss = new THREE.Color('#616b47');
  for (let i = 0; i < 20; i++) {
    const side = i % 4,
      along = (Math.floor(i / 4) - 2) / 2.4;
    const outward = 3.2 + noise(i, 4, 2) * 1.1;
    const x =
      side < 2 ? (side === 0 ? -1 : 1) * (ARENA_HALF_WIDTH + outward) : along * ARENA_HALF_WIDTH;
    const z =
      side >= 2 ? (side === 2 ? -1 : 1) * (ARENA_HALF_DEPTH + outward) : along * ARENA_HALF_DEPTH;
    const source = new THREE.IcosahedronGeometry(1, 3);
    source.deleteAttribute('uv');
    source.deleteAttribute('normal');
    const p = source.getAttribute('position');
    const colors: number[] = [];
    for (let j = 0; j < p.count; j++) {
      const px = p.getX(j),
        py = p.getY(j),
        pz = p.getZ(j);
      const warp = 0.86 + noise(px * 2 + i * 7, py * 2, pz * 2) * 0.3;
      p.setXYZ(
        j,
        px * warp * (2.2 + noise(i, 8, 2) * 0.4) + x,
        py * warp * (1.8 + noise(i, 2, 8) * 1.2) + 1.1,
        pz * warp * 2.35 + z,
      );
      const color = stone.clone().lerp(paleStone, noise(px * 3, py * 3 + i, pz * 3) * 0.6);
      if (py < -0.35) color.lerp(moss, 0.4);
      colors.push(color.r, color.g, color.b);
    }
    source.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const geometry = mergeVertices(source);
    source.dispose();
    geometry.computeVertexNormals();
    parts.push(geometry);
  }
  const geometry = required(mergeGeometries(parts), 'Failed to merge mountain outcrop geometry');
  for (const part of parts) part.dispose();
  return geometry;
}

export function buildMountains(scene: THREE.Scene, textures?: MountainRockTextures) {
  const cliffs = buildRidge(CLIFF_PROFILE, 384, false);
  const summits = buildRidge(SUMMIT_PROFILE, 256, true);
  const outcrops = buildOutcrops();
  const geometry = required(
    mergeGeometries([cliffs, summits, outcrops]),
    'Failed to merge mountain geometry',
  );
  cliffs.dispose();
  summits.dispose();
  outcrops.dispose();
  geometry.computeBoundingSphere();
  const material = createMountainMaterial(textures);
  const mountain = new THREE.Mesh(geometry, material);
  mountain.name = 'enclosing-mountain-walls';
  scene.add(mountain);
  return mountain;
}
