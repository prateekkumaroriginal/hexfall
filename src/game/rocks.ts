import * as THREE from 'three';
import { reusePackedSurfaceSample } from './surface-material';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { at, required } from '../lib/assert';
import { BOULDERS, ENVIRONMENT_SEED, ARENA_HALF_WIDTH, ARENA_HALF_DEPTH } from '../config/world';
import type { MountainRockTextures } from './mountain-material';

function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function buildRock(variant: number) {
  const source = new THREE.IcosahedronGeometry(1, 4);
  source.deleteAttribute('uv');
  source.deleteAttribute('normal');
  const positions = source.getAttribute('position');
  const random = randomSource(713 + variant * 291);
  const planes = [
    {
      normal: new THREE.Vector3(0.12 + variant * 0.12, 1, -0.16).normalize(),
      distance: 0.67 + variant * 0.04,
    },
    { normal: new THREE.Vector3(1, 0.09, 0.12).normalize(), distance: 0.75 },
    { normal: new THREE.Vector3(-1, 0.14, -0.07).normalize(), distance: 0.72 + variant * 0.035 },
    { normal: new THREE.Vector3(0.11, 0.08, 1).normalize(), distance: 0.73 },
    { normal: new THREE.Vector3(-0.06, 0.2, -1).normalize(), distance: 0.78 },
    ...Array.from({ length: 3 }, () => ({
      normal: new THREE.Vector3(
        random() * 2 - 1,
        random() * 1.3 - 0.25,
        random() * 2 - 1,
      ).normalize(),
      distance: 0.67 + random() * 0.14,
    })),
  ];
  const p = new THREE.Vector3();
  let widest = 0;
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const weathering = Math.sin(p.x * 7 + variant * 2.1) * Math.sin(p.y * 5 - p.z * 6) * 0.035;
    p.multiplyScalar(0.98 + weathering);
    // Broad fracture planes have rounded transitions instead of individual triangular faces.
    for (const plane of planes) {
      const excess = p.dot(plane.normal) - plane.distance;
      if (excess > -0.04)
        p.addScaledVector(
          plane.normal,
          -(Math.max(0, excess + 0.04) ** 2) / (Math.max(0, excess + 0.04) + 0.04),
        );
    }
    p.x *= 0.94 + variant * 0.035;
    p.z *= 0.91 - variant * 0.035;
    p.x += Math.max(0, p.y) * (variant === 1 ? 0.15 : -0.08);
    p.y = Math.max(-0.66, p.y * (0.78 + variant * 0.055));
    widest = Math.max(widest, Math.hypot(p.x, p.z));
    positions.setXYZ(i, p.x, p.y, p.z);
  }
  const colors: number[] = [];
  const color = new THREE.Color(),
    moss = new THREE.Color('#68764d');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / widest,
      y = positions.getY(i),
      z = positions.getZ(i) / widest;
    positions.setXYZ(i, x, y, z);
    const patches = (Math.sin(x * 4 + variant) * Math.sin(z * 5 - y * 3) + 1) * 0.5;
    color.set(variant === 1 ? '#d1c6ae' : '#c1c5bb');
    color.multiplyScalar(0.88 + patches * 0.12);
    color.lerp(moss, (1 - THREE.MathUtils.smoothstep(y, -0.55, 0.08)) * (0.24 + patches * 0.35));
    colors.push(color.r, color.g, color.b);
  }
  source.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const smooth = mergeVertices(source);
  source.dispose();
  smooth.computeVertexNormals();
  // Keep the shared lighting when splitting only the UV seam for photographic detail.
  const geometry = smooth.toNonIndexed();
  smooth.dispose();
  const pAttribute = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < pAttribute.count; i += 3) {
    const triangle = Array.from({ length: 3 }, (_, j) => {
      p.fromBufferAttribute(pAttribute, i + j);
      return [
        0.5 + Math.atan2(p.z, p.x) / (Math.PI * 2),
        0.5 + Math.asin(THREE.MathUtils.clamp(p.y / p.length(), -1, 1)) / Math.PI,
      ];
    });
    const wrap =
      Math.max(...triangle.map((t) => at(t, 0))) - Math.min(...triangle.map((t) => at(t, 0))) > 0.5;
    for (const t of triangle) {
      const u = at(t, 0);
      uv.push(
        (u + (wrap && u < 0.5 ? 1 : 0)) * 3.3 + variant * 0.37,
        at(t, 1) * 1.8 + variant * 0.23,
      );
    }
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const indexed = mergeVertices(geometry);
  geometry.dispose();
  indexed.computeBoundingBox();
  return indexed;
}

export function buildRocks(scene: THREE.Scene, textures?: MountainRockTextures) {
  const shapes = [buildRock(0), buildRock(1), buildRock(2)];
  const parts: THREE.BufferGeometry[] = [];
  const dummy = new THREE.Object3D();
  const random = randomSource(ENVIRONMENT_SEED + 83);
  const add = (variant: number, radius: number) => {
    dummy.updateMatrix();
    const part = at(shapes, variant).clone().applyMatrix4(dummy.matrix);
    const uv = part.getAttribute('uv');
    const offset = random() * 4;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * radius + offset, uv.getY(i) * radius + offset * 0.37);
    parts.push(part);
  };
  for (const [i, boulder] of BOULDERS.LAYOUT.entries()) {
    dummy.position.set(boulder.X, 0.72, boulder.Z);
    dummy.rotation.set(0, i * 0.7, 0);
    dummy.scale.set(boulder.RADIUS, 1.3, boulder.RADIUS);
    add(i % shapes.length, boulder.RADIUS);
  }
  for (let i = BOULDERS.LAYOUT.length; i < 46; i++) {
    const side = i % 4,
      along = random() * 2 - 1;
    const x =
      side < 2
        ? (side === 0 ? -1 : 1) * (ARENA_HALF_WIDTH + random() * 2)
        : along * ARENA_HALF_WIDTH;
    const z =
      side >= 2
        ? (side === 2 ? -1 : 1) * (ARENA_HALF_DEPTH + random() * 2)
        : along * ARENA_HALF_DEPTH;
    const size = 0.4 + random() * 1.1;
    dummy.position.set(x, size * 0.32 - 0.06, z);
    dummy.rotation.set(random() * 0.12, random() * Math.PI * 2, random() * 0.12);
    dummy.scale.set(size, size * 0.7, size * (0.8 + random() * 0.2));
    add(i % shapes.length, size);
  }
  for (const shape of shapes) shape.dispose();
  const geometry = required(mergeGeometries(parts), 'Failed to merge valley rock geometry');
  for (const part of parts) part.dispose();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    ...(textures && {
      map: textures.color,
      normalMap: textures.normal,
      roughnessMap: textures.surface,
      aoMap: textures.surface,
      normalScale: new THREE.Vector2(1.2, 1.2),
      aoMapIntensity: 1.15,
    }),
  });
  const rocks = new THREE.Mesh(geometry, material);
  if (textures) {
    material.onBeforeCompile = reusePackedSurfaceSample;
    material.customProgramCacheKey = () => 'packed-rock-surface-v1';
  }
  rocks.name = 'valley-boulders';
  scene.add(rocks);
  return rocks;
}
