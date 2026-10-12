import { at, required } from '../lib/assert';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREE_LAYOUT } from './world';
import { TREES } from '../config/world';
import { createTreeMaterials } from './tree-material';
import type { TreeTextures } from './tree-material';

function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function buildTree(seed: number, spread: number) {
  const random = randomSource(seed);
  const wood: THREE.BufferGeometry[] = [];
  const positions: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  const branch = (
    points: THREE.Vector3[],
    base: number,
    tip: number,
    segments: number,
    sides = 10,
  ) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(segments, false);
    const p: number[] = [],
      u: number[] = [],
      c: number[] = [],
      index: number[] = [];
    const length = curve.getLength();
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const center = curve.getPointAt(t);
      const normal = at(frames.normals, j),
        binormal = at(frames.binormals, j);
      const radius = tip + (base - tip) * (1 - t) ** 1.1;
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const r = radius * (1 + Math.sin(a * 3 + t * 4 + seed) * 0.055);
        const point = center
          .clone()
          .addScaledVector(normal, Math.cos(a) * r)
          .addScaledVector(binormal, Math.sin(a) * r);
        p.push(point.x, point.y, point.z);
        // Consistent bark scale on the trunk and progressively smaller branches.
        u.push((k / sides) * Math.max(0.35, base * Math.PI * 2), t * length + seed * 0.017);
        const moss = 1 - THREE.MathUtils.smoothstep(point.y, 0, 0.9);
        tint.set('#e3ded3').lerp(new THREE.Color('#82906b'), moss * 0.5);
        c.push(tint.r, tint.g, tint.b);
        if (j < segments && k < sides) {
          const n = j * (sides + 1) + k;
          index.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    const normals = g.getAttribute('normal');
    for (let j = 0; j <= segments; j++) {
      const first = j * (sides + 1),
        last = first + sides;
      const n = new THREE.Vector3()
        .fromBufferAttribute(normals, first)
        .add(new THREE.Vector3().fromBufferAttribute(normals, last))
        .normalize();
      normals.setXYZ(first, n.x, n.y, n.z);
      normals.setXYZ(last, n.x, n.y, n.z);
    }
    wood.push(g);
    return curve;
  };
  const leaf = (origin: THREE.Vector3, direction: number, node: number) => {
    const length = 0.28 + random() * 0.14,
      width = length * (0.55 + random() * 0.13);
    const along = new THREE.Vector3(
      Math.cos(direction),
      random() * 0.85 - 0.3,
      Math.sin(direction),
    ).normalize();
    const across = new THREE.Vector3().crossVectors(up, along).normalize();
    const normal = new THREE.Vector3().crossVectors(along, across).normalize();
    across.applyAxisAngle(along, (random() - 0.5) * 1.5);
    normal.crossVectors(along, across).normalize();
    const center = origin.clone().addScaledVector(along, length * 0.4);
    const tile = Math.floor(random() * 8),
      first = positions.length / 3;
    const shade = 0.7 + node * 0.12 + random() * 0.15;
    for (const v of [0, 1]) {
      for (const u of [0, 1]) {
        const p = center
          .clone()
          .addScaledVector(along, (u - 0.5) * length)
          .addScaledVector(across, (v - 0.5) * width)
          .addScaledVector(normal, u * v * length * 0.035);
        positions.push(p.x, p.y, p.z);
        uv.push(((tile % 4) + u) / 4, 1 - (Math.floor(tile / 4) + 1 - v) / 2);
        colors.push(shade * (0.92 + random() * 0.06), shade, shade * 0.89);
      }
    }
    indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
  };
  branch(
    [
      new THREE.Vector3(0, -0.1, 0),
      new THREE.Vector3(-0.1, 1.6, 0.07),
      new THREE.Vector3(0.14, 3.4, -0.06),
      new THREE.Vector3(0.2, 5.2, -0.13),
      new THREE.Vector3(0.08, 6.7, 0.05),
    ],
    0.56,
    0.035,
    14,
    14,
  );
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + random() * 0.3;
    branch(
      [
        new THREE.Vector3(0, 0.45, 0),
        new THREE.Vector3(Math.cos(a) * 0.48, 0.1, Math.sin(a) * 0.48),
        new THREE.Vector3(Math.cos(a) * 1.05, -0.1, Math.sin(a) * 1.05),
      ],
      0.18,
      0.012,
      3,
      8,
    );
  }
  // Uneven limbs split into leaf-bearing twigs, leaving real gaps through the crown.
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.39996 + random() * 0.55;
    const height = 2.7 + i * 0.28;
    const reach = (2.1 + random() * 0.55 - i * 0.055) * spread;
    const limb = branch(
      [
        new THREE.Vector3(0.1, height, -0.05),
        new THREE.Vector3(
          Math.cos(angle) * reach * 0.48,
          height + 0.45,
          Math.sin(angle) * reach * 0.48,
        ),
        new THREE.Vector3(
          Math.cos(angle) * reach,
          height + 1.35 + random() * 0.45,
          Math.sin(angle) * reach,
        ),
      ],
      0.2 - i * 0.014,
      0.026,
      7,
    );
    for (let j = 0; j < 6; j++) {
      const origin = limb.getPointAt(0.38 + j * 0.115);
      const outward = angle + (j % 2 ? 1 : -1) * (0.45 + random() * 0.65);
      const twigReach = (0.8 + random() * 0.7) * spread;
      const tip = origin
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(outward) * twigReach,
            -0.1 + random() * 0.75,
            Math.sin(outward) * twigReach,
          ),
        );
      const middle = origin.clone().lerp(tip, 0.48);
      middle.y += 0.12;
      const twig = branch([origin, middle, tip], 0.048, 0.005, 4, 6);
      for (let spray = 0; spray < 3; spray++) {
        const start = twig.getPointAt(0.22 + spray * 0.34);
        const direction =
          outward +
          (spray === 2 ? (random() - 0.5) * 0.6 : (spray % 2 ? 1 : -1) * (0.9 + random() * 0.6));
        const length = (0.55 + random() * 0.55) * spread;
        const end = start
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(direction) * length,
              (random() - 0.4) * 0.65,
              Math.sin(direction) * length,
            ),
          );
        const sprig = branch(
          [start, start.clone().lerp(end, 0.5).addScaledVector(up, 0.08), end],
          0.016,
          0.0025,
          2,
          3,
        );
        for (let node = 0; node < 10; node++) {
          const t = 0.13 + node / 12;
          const p = sprig.getPointAt(t);
          for (const side of [-1, 1]) leaf(p, direction + side * (0.8 + random() * 0.75), t);
        }
      }
    }
  }
  const trunk = required(mergeGeometries(wood), 'Failed to merge tree trunk geometry');
  for (const g of wood) g.dispose();
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  canopy.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  canopy.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  canopy.setIndex(indices);
  canopy.computeVertexNormals();
  trunk.computeBoundingSphere();
  canopy.computeBoundingSphere();
  return { trunk, canopy };
}

export class TreeRenderer {
  private batches: { trunk: THREE.InstancedMesh; canopy: THREE.InstancedMesh }[] = [];
  private trees: {
    matrix: THREE.Matrix4;
    tint: THREE.Color;
    bounds: THREE.Sphere;
    variant: number;
  }[] = [];
  constructor(scene: THREE.Scene, textures?: TreeTextures) {
    const { bark, foliage } = createTreeMaterials(textures);
    const dummy = new THREE.Object3D();
    for (const [i, variant] of TREES.VARIANTS.entries()) {
      const geometry = buildTree(variant.SEED, variant.SPREAD);
      const trunk = new THREE.InstancedMesh(geometry.trunk, bark, TREE_LAYOUT.length);
      const canopy = new THREE.InstancedMesh(geometry.canopy, foliage, TREE_LAYOUT.length);
      trunk.name = `branching-tree-trunks-${i}`;
      canopy.name = `broadleaf-canopies-${i}`;
      for (const mesh of [trunk, canopy]) {
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);
      }
      this.batches.push({ trunk, canopy });
    }
    for (const tree of TREE_LAYOUT) {
      const { x, z, variant } = tree;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, tree.yaw, 0);
      dummy.scale.set(tree.scaleX, tree.scaleY, tree.scaleZ);
      dummy.updateMatrix();
      const bounds = required(
        at(this.batches, variant).canopy.geometry.boundingSphere,
        `Missing canopy bounds for tree variant ${variant}`,
      ).clone();
      bounds.applyMatrix4(dummy.matrix);
      bounds.radius += 0.15;
      bounds.union(new THREE.Sphere(new THREE.Vector3(x, 0.5, z), 1.4));
      this.trees.push({
        matrix: dummy.matrix.clone(),
        bounds,
        variant,
        tint: new THREE.Color().setHSL(tree.hue, tree.saturation, tree.lightness),
      });
    }
  }
  update(frustum: THREE.Frustum) {
    for (const { trunk, canopy } of this.batches) trunk.count = canopy.count = 0;
    for (const tree of this.trees) {
      if (!frustum.intersectsSphere(tree.bounds)) continue;
      const { trunk, canopy } = at(this.batches, tree.variant);
      trunk.setMatrixAt(trunk.count++, tree.matrix);
      canopy.setMatrixAt(canopy.count, tree.matrix);
      canopy.setColorAt(canopy.count++, tree.tint);
    }
    for (const { trunk, canopy } of this.batches) {
      trunk.instanceMatrix.needsUpdate = canopy.instanceMatrix.needsUpdate = true;
      if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    }
  }
}
