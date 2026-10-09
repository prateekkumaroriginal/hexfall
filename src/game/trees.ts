import { at, required } from '../lib/assert';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREE_LAYOUT } from './world';
import { TREES } from '../config/world';
function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
// Blend overlapping foliage volumes into a single sculpted crown. There are no leaf cards.
function sculptCanopy(seed: number, spread: number) {
  const random = randomSource(seed);
  const lobes = [
    { center: new THREE.Vector3(0, 5.35, 0), size: new THREE.Vector3(2.15, 1.75, 2.05) },
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7 + random() * 0.25;
    const reach = 1.55 + random() * 0.45;
    lobes.push({
      center: new THREE.Vector3(Math.cos(a) * reach, 4.85 + random() * 0.75, Math.sin(a) * reach),
      size: new THREE.Vector3(1.2 + random() * 0.35, 1.15 + random() * 0.3, 1.2 + random() * 0.3),
    });
  }
  lobes.push({
    center: new THREE.Vector3(-0.35, 6.55, 0.1),
    size: new THREE.Vector3(1.55, 1.15, 1.45),
  });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996;
    const reach = 2.2 + random() * 0.35;
    lobes.push({
      center: new THREE.Vector3(Math.cos(a) * reach, 4.65 + random() * 1.7, Math.sin(a) * reach),
      size: new THREE.Vector3(0.7 + random() * 0.3, 0.7 + random() * 0.25, 0.7 + random() * 0.3),
    });
  }
  const field = (x: number, y: number, z: number) => {
    let d = 100;
    for (const lobe of lobes) {
      const px = (x / spread - lobe.center.x) / lobe.size.x;
      const py = (y - lobe.center.y) / lobe.size.y;
      const pz = (z / spread - lobe.center.z) / lobe.size.z;
      const k0 = Math.hypot(px, py, pz);
      const k1 = Math.hypot(px / lobe.size.x, py / lobe.size.y, pz / lobe.size.z);
      const next = k1 < 0.0001 ? -Math.min(...lobe.size.toArray()) : (k0 * (k0 - 1)) / k1;
      const h = Math.max(0.32 - Math.abs(d - next), 0) / 0.32;
      d = Math.min(d, next) - h * h * 0.08;
    }
    const tufts = Math.sin(x * 5.8 + Math.sin(z * 3.2)) * Math.sin(y * 5.4 - z * 4.1);
    return d + Math.sin(x * 3.8 + z * 0.8) * Math.sin(y * 3.6 - z * 2.7) * 0.12 + tufts * 0.055;
  };
  const gradient = (p: THREE.Vector3) =>
    new THREE.Vector3(
      field(p.x + 0.025, p.y, p.z) - field(p.x - 0.025, p.y, p.z),
      field(p.x, p.y + 0.025, p.z) - field(p.x, p.y - 0.025, p.z),
      field(p.x, p.y, p.z + 0.025) - field(p.x, p.y, p.z - 0.025),
    ).normalize();
  const step = 0.4;
  const min = new THREE.Vector3(-4.5 * spread, 3.1, -4.5 * spread);
  const nx = Math.ceil((9 * spread) / step),
    ny = Math.ceil((8.2 - min.y) / step),
    nz = nx;
  const samples: {
    p: THREE.Vector3;
    d: number;
  }[] = [];
  const id = (x: number, y: number, z: number) => (z * (ny + 1) + y) * (nx + 1) + x;
  for (let z = 0; z <= nz; z++)
    for (let y = 0; y <= ny; y++)
      for (let x = 0; x <= nx; x++) {
        const p = new THREE.Vector3(min.x + x * step, min.y + y * step, min.z + z * step);
        samples.push({ p, d: field(p.x, p.y, p.z) });
      }
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const edgeVertices = new Map<string, number>();
  const points: THREE.Vector3[] = [];
  const lower = new THREE.Color('#2f703a'),
    middle = new THREE.Color('#519330'),
    upper = new THREE.Color('#a0bf4a');
  const vertex = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const cached = edgeVertices.get(key);
    if (cached !== undefined) return cached;
    const sa = at(samples, a),
      sb = at(samples, b);
    const p = sa.p.clone().lerp(sb.p, sa.d / (sa.d - sb.d));
    const n = gradient(p);
    const t = THREE.MathUtils.clamp((p.y - 3.8) / 3.65, 0, 1);
    const color =
      t < 0.5 ? lower.clone().lerp(middle, t * 2) : middle.clone().lerp(upper, (t - 0.5) * 2);
    // Broad painted shading and cavity darkening give the crown depth without tiny details.
    const open = THREE.MathUtils.clamp(
      field(p.x + n.x * 0.45, p.y + n.y * 0.45, p.z + n.z * 0.45) / 0.45,
      0,
      1,
    );
    const wash = Math.sin(p.x * 2.8 + Math.sin(p.z * 2.1)) * Math.sin(p.y * 3.1 - p.z * 1.3);
    color.multiplyScalar((0.8 + open * 0.2) * (0.92 + wash * 0.14));
    const index = points.length;
    points.push(p);
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
    colors.push(color.r, color.g, color.b);
    edgeVertices.set(key, index);
    return index;
  };
  const triangle = (a: number, b: number, c: number) => {
    const normal = at(points, b)
      .clone()
      .sub(at(points, a))
      .cross(at(points, c).clone().sub(at(points, a)));
    const expected = new THREE.Vector3(
      at(normals, a * 3),
      at(normals, a * 3 + 1),
      at(normals, a * 3 + 2),
    );
    if (normal.dot(expected) < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  const tetrahedra = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ] as const;
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
        ] as const;
        if (
          corners.every((i) => at(samples, i).d >= 0) ||
          corners.every((i) => at(samples, i).d < 0)
        )
          continue;
        for (const tetra of tetrahedra) {
          const inside = tetra.map((i) => corners[i]).filter((i) => at(samples, i).d < 0);
          const outside = tetra.map((i) => corners[i]).filter((i) => at(samples, i).d >= 0);
          if (!inside.length || !outside.length) continue;
          if (inside.length === 1) {
            const a = at(inside, 0);
            triangle(
              vertex(a, at(outside, 0)),
              vertex(a, at(outside, 1)),
              vertex(a, at(outside, 2)),
            );
          } else if (outside.length === 1) {
            const a = at(outside, 0);
            triangle(vertex(at(inside, 0), a), vertex(at(inside, 1), a), vertex(at(inside, 2), a));
          } else {
            const a = vertex(at(inside, 0), at(outside, 0)),
              b = vertex(at(inside, 0), at(outside, 1));
            const c = vertex(at(inside, 1), at(outside, 0)),
              d = vertex(at(inside, 1), at(outside, 1));
            triangle(a, b, c);
            triangle(b, d, c);
          }
        }
      }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
function buildTree(seed: number, spread: number) {
  const random = randomSource(seed);
  const wood: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  // Radius follows the curved branch and narrows all the way to its tip.
  const branch = (points: THREE.Vector3[], base: number, tip: number, segments: number) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const positions: number[] = [];
    const uv: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const sides = 12;
    const length = curve.getLength();
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const center = curve.getPoint(t);
      const tangent = curve.getTangent(t).normalize();
      const axis = Math.abs(tangent.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up;
      const normal = new THREE.Vector3().crossVectors(tangent, axis).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, normal);
      const radius = THREE.MathUtils.lerp(base, tip, t);
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const r = radius * (1 + Math.sin(a * 3 + t * 5) * 0.09 + Math.cos(a * 6 - t * 3) * 0.035);
        const p = center
          .clone()
          .addScaledVector(normal, Math.cos(a) * r)
          .addScaledVector(binormal, Math.sin(a) * r);
        positions.push(p.x, p.y, p.z);
        uv.push(k / sides, t * length * 0.65);
        tint.set('#79512f').lerp(new THREE.Color('#b48750'), Math.max(0, Math.sin(a + 0.8)) * 0.45);
        tint.multiplyScalar(
          (0.8 + Math.min(p.y / 5, 1) * 0.2) * (0.91 + Math.sin(a * 6 - t * 3) * 0.09),
        );
        colors.push(tint.r, tint.g, tint.b);
        if (j < segments && k < sides) {
          const n = j * (sides + 1) + k;
          indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    wood.push(g);
  };
  const trunkTop = new THREE.Vector3(0.18, 4.8, -0.12);
  branch(
    [
      new THREE.Vector3(0, -0.08, 0),
      new THREE.Vector3(-0.12, 1.4, 0.08),
      new THREE.Vector3(0.12, 2.9, 0),
      trunkTop,
    ],
    0.58,
    0.12,
    9,
  );
  // A few long bark grooves and oval knots keep the trunk readable at close range.
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.08, 0),
    new THREE.Vector3(-0.12, 1.4, 0.08),
    new THREE.Vector3(0.12, 2.9, 0),
    trunkTop,
  ]);
  const addWoodDetail = (geometry: THREE.BufferGeometry, shade: string) => {
    const color = new THREE.Color(shade);
    const colors: number[] = [];
    for (let i = 0; i < geometry.getAttribute('position').count; i++)
      colors.push(color.r, color.g, color.b);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    wood.push(geometry);
  };
  for (let i = 0; i < 8; i++) {
    const points: THREE.Vector3[] = [];
    for (let j = 0; j <= 9; j++) {
      const t = 0.07 + j * 0.074;
      const a = (i * Math.PI) / 4 + Math.sin(t * 7 + i) * 0.045;
      const radius =
        THREE.MathUtils.lerp(0.58, 0.12, t) *
        (1 + Math.sin(a * 3 + t * 5) * 0.09 + Math.cos(a * 6 - t * 3) * 0.035);
      const p = trunkCurve.getPoint(t);
      p.x += Math.cos(a) * radius;
      p.z += Math.sin(a) * radius;
      points.push(p);
    }
    addWoodDetail(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 9, 0.012, 4, false),
      i % 3 ? '#69432a' : '#af7d46',
    );
  }
  for (const [y, angle] of [
    [1.4, 0.7],
    [2.05, 3.9],
  ] as const) {
    const center = trunkCurve.getPoint(y / 4.8);
    const radius = THREE.MathUtils.lerp(0.58, 0.12, y / 4.8);
    const knot = new THREE.TorusGeometry(0.075, 0.016, 5, 14);
    knot.scale(0.85, 1.45, 1);
    knot.rotateY(angle);
    knot.translate(
      center.x + Math.sin(angle) * radius,
      center.y,
      center.z + Math.cos(angle) * radius,
    );
    addWoodDetail(knot, '#5d3b23');
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + random() * 0.25;
    branch(
      [
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(Math.cos(a) * 0.5, 0.13, Math.sin(a) * 0.5),
        new THREE.Vector3(Math.cos(a) * 1.05, -0.03, Math.sin(a) * 1.05),
      ],
      0.19,
      0.02,
      3,
    );
  }
  for (let i = 0; i < 5; i++) {
    const a = i * 2.39996 + random() * 0.4;
    const y = 2.25 + i * 0.26;
    const reach = spread * (1.55 + random() * 0.35);
    const fork = new THREE.Vector3(
      Math.cos(a) * reach * 0.55,
      y + 0.85,
      Math.sin(a) * reach * 0.55,
    );
    const end = new THREE.Vector3(Math.cos(a) * reach, y + 2.15, Math.sin(a) * reach);
    branch([new THREE.Vector3(0, y - 0.4, 0), fork, end], 0.24 - i * 0.018, 0.07, 7);
  }
  const trunk = required(mergeGeometries(wood));
  const canopy = sculptCanopy(seed + 31, spread);
  for (const g of wood) g.dispose();
  trunk.computeBoundingSphere();
  canopy.computeBoundingSphere();
  return { trunk, canopy };
}
export class TreeRenderer {
  private batches: {
    trunk: THREE.InstancedMesh;
    canopy: THREE.InstancedMesh;
  }[] = [];
  private trees: {
    matrix: THREE.Matrix4;
    tint: THREE.Color;
    bounds: THREE.Sphere;
    variant: number;
  }[] = [];
  private wind = { value: 0 };
  constructor(scene: THREE.Scene) {
    const bark = new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true });
    const foliage = new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true });
    foliage.onBeforeCompile = (shader) => {
      shader.uniforms['treeTime'] = this.wind;
      shader.vertexShader = 'uniform float treeTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec3 treeOrigin = instanceMatrix[3].xyz;
        float phase = treeTime * 1.25 + treeOrigin.x * .7 + treeOrigin.z * .4;
        float bend = smoothstep(3.0, 7.5, position.y);
        transformed.x += sin(phase) * bend * .045;
        transformed.z += cos(phase * .8) * bend * .025;
      `,
      );
      // Gentle ambient fill preserves the painted greens under the solid canopy.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        outgoingLight += diffuseColor.rgb * .25;
        #include <opaque_fragment>
      `,
      );
    };
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
      const bounds = required(at(this.batches, variant).canopy.geometry.boundingSphere).clone();
      bounds.applyMatrix4(dummy.matrix);
      bounds.radius += 0.12;
      // Include the roots and lower trunk in the same conservative culling volume.
      bounds.union(new THREE.Sphere(new THREE.Vector3(x, 0.5, z), 1.4));
      this.trees.push({
        matrix: dummy.matrix.clone(),
        bounds,
        variant,
        tint: new THREE.Color().setHSL(tree.hue, tree.saturation, tree.lightness),
      });
    }
  }
  update(time: number, frustum: THREE.Frustum) {
    this.wind.value = time;
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
