import { required, at } from '../lib/assert';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA_HALF_WIDTH, ARENA_HALF_DEPTH } from '../config/world';
type RidgeProfile = readonly (readonly [outward: number, height: number])[];
const CLIFF_PROFILE: RidgeProfile = [
  [0.08, -0.14],
  [0.8, 0.65],
  [2.1, 1.3],
  [2.8, 3.6],
  [4.6, 4.1],
  [5.1, 6.4],
  [7.3, 6.9],
  [9.5, 11],
  [13, 14.5],
  [17, 19],
  [21, 17],
  [27, 11.5],
  [33, 4.5],
  [39, -0.2],
];
const SUMMIT_PROFILE: RidgeProfile = [
  [23, -0.2],
  [28, 9],
  [34, 19],
  [42, 32],
  [49, 22],
  [57, 9],
  [65, -0.2],
];
function peak(phase: number, center: number, width: number) {
  const distance = Math.min(Math.abs(phase - center), 1 - Math.abs(phase - center));
  return Math.pow(Math.max(0, 1 - distance / width), 0.85);
}
function buildRidge(profile: RidgeProfile, segments: number, distant: boolean) {
  const vertices: THREE.Vector3[] = [];
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const stone = new THREE.Color('#6c7773'),
    warmStone = new THREE.Color('#8d8070');
  const highStone = new THREE.Color('#81919b'),
    distantStone = new THREE.Color('#65849e');
  const grass = new THREE.Color('#68764a'),
    snow = new THREE.Color('#e0e9e5');
  const stride = segments + 1;
  for (let row = 0; row < profile.length; row++) {
    for (let i = 0; i <= segments; i++) {
      // Repeat the first perimeter sample exactly to close the ring at the north-west corner.
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
      const [baseOutward, baseHeight] = at(profile, row);
      const interior = row > 0 && row < profile.length - 1;
      const flutes =
        Math.sin(angle * 19 + row * 0.08) * 0.8 + Math.sin(angle * 31 - row * 0.06) * 0.35;
      const buttress = Math.pow((Math.sin(angle * 13 + 0.8) + 1) / 2, 3);
      const outward = Math.max(
        0.08,
        baseOutward + (interior ? flutes + buttress * (distant ? 2 : -2.3) : 0),
      );
      const nx = x / ARENA_HALF_WIDTH,
        nz = z / ARENA_HALF_DEPTH,
        length = Math.hypot(nx, nz);
      const skyline = distant
        ? -3 +
          peak(phase, 0.125, 0.065) * 15 +
          peak(phase, 0.375, 0.055) * 11 +
          peak(phase, 0.625, 0.065) * 14 +
          peak(phase, 0.875, 0.06) * 17 +
          Math.sin(angle * 17) * 2.2
        : Math.sin(angle * 7 + 0.4) * 2 +
          peak(phase, 0.19, 0.035) * 6 +
          peak(phase, 0.48, 0.04) * 4.5 +
          peak(phase, 0.72, 0.035) * 5.5;
      const lift = distant
        ? Math.max(0, baseHeight / 32)
        : THREE.MathUtils.smoothstep(baseHeight, 6, 19);
      const height =
        baseHeight + skyline * lift + (interior ? Math.sin(angle * 23 + row * 1.7) * 0.32 : 0);
      vertices.push(
        new THREE.Vector3(x + (nx / length) * outward, height, z + (nz / length) * outward),
      );
    }
  }
  const triangle = (a: number, b: number, c: number) => indices.push(a, b, c);
  for (let row = 0; row < profile.length - 1; row++) {
    for (let i = 0; i < segments; i++) {
      const a = row * stride + i,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      if ((row + i) % 2) {
        triangle(a, b, d);
        triangle(a, d, c);
      } else {
        triangle(a, b, c);
        triangle(b, d, c);
      }
    }
  }
  for (const p of vertices) positions.push(p.x, p.y, p.z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  // Join shading across the duplicated seam as well as closing the geometry.
  for (let row = 0; row < profile.length; row++) {
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
    const slope = normals.getY(i);
    const phase = Math.atan2(p.z, p.x);
    const strata = Math.sin(p.y * 1.4 + Math.sin(phase * 9) * 0.55) * 0.5 + 0.5;
    const color = distant
      ? distantStone.clone().lerp(highStone, 0.3 + strata * 0.2)
      : stone
          .clone()
          .lerp(warmStone, strata * 0.3)
          .lerp(highStone, THREE.MathUtils.smoothstep(p.y, 10, 24) * 0.5);
    const snowLine = (distant ? 26 : 25) + Math.sin(phase * 11) * 1.5;
    const snowCover =
      THREE.MathUtils.smoothstep(p.y, snowLine, snowLine + 3) *
      THREE.MathUtils.smoothstep(slope, 0.25, 0.6);
    if (snowCover > 0) color.lerp(snow, snowCover);
    else if (!distant && p.y < 8)
      color.lerp(grass, THREE.MathUtils.smoothstep(slope, 0.55, 0.85) * 0.7);
    color.multiplyScalar(0.94 + Math.sin(phase * 21 + p.y * 0.3) * 0.035);
    colors.push(color.r, color.g, color.b);
  });
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sculpted = geometry.toNonIndexed();
  geometry.dispose();
  const p = sculpted.getAttribute('position'),
    n = sculpted.getAttribute('normal');
  const face = new THREE.Vector3(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    face.copy(b).sub(a).cross(c.sub(a)).normalize();
    for (let j = 0; j < 3; j++) {
      a.fromBufferAttribute(n, i + j)
        .lerp(face, distant ? 0.08 : 0.18)
        .normalize();
      n.setXYZ(i + j, a.x, a.y, a.z);
    }
  }
  return sculpted;
}
function buildOutcrops() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 20; i++) {
    const side = i % 4,
      along = (Math.floor(i / 4) - 2) / 2.4;
    const outward = 3.6;
    const x =
      side < 2 ? (side === 0 ? -1 : 1) * (ARENA_HALF_WIDTH + outward) : along * ARENA_HALF_WIDTH;
    const z =
      side >= 2 ? (side === 2 ? -1 : 1) * (ARENA_HALF_DEPTH + outward) : along * ARENA_HALF_DEPTH;
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    geometry.deleteAttribute('uv');
    const p = geometry.getAttribute('position');
    const colors: number[] = [];
    for (let j = 0; j < p.count; j++) {
      const px = p.getX(j),
        py = p.getY(j),
        pz = p.getZ(j);
      const warp = 1 + Math.sin(px * 4 + py * 3 + i) * 0.08;
      p.setXYZ(
        j,
        px * warp * (2.35 + Math.sin(i * 7) * 0.25) + x,
        py * (4.5 + Math.cos(i * 3) * 0.8) + 3.6,
        pz * warp * 2.45 + z,
      );
      const color = new THREE.Color('#758078').lerp(new THREE.Color('#98a09a'), (py + 1) * 0.3);
      if (py < -0.4) color.lerp(new THREE.Color('#596c43'), 0.45);
      color.multiplyScalar(0.93 + Math.sin(px * 4 + pz * 3 + i) * 0.07);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    parts.push(geometry);
  }
  const geometry = required(mergeGeometries(parts), 'Failed to merge mountain outcrop geometry');
  for (const part of parts) part.dispose();
  return geometry;
}
export function buildMountains(scene: THREE.Scene) {
  const cliffs = buildRidge(CLIFF_PROFILE, 192, false);
  const summits = buildRidge(SUMMIT_PROFILE, 160, true);
  const outcrops = buildOutcrops();
  const geometry = required(
    mergeGeometries([cliffs, summits, outcrops]),
    'Failed to merge mountain geometry',
  );
  cliffs.dispose();
  summits.dispose();
  outcrops.dispose();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
    flatShading: false,
  });
  // Broad rock strata rather than the old stretched, repeating texture.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 mountainPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nmountainPosition = position;',
    );
    shader.fragmentShader =
      `
      varying vec3 mountainPosition;
      float rockRelief(vec3 p) {
        float planes = sin(p.x * 1.3 + sin(p.z * .7) * 2.0) * sin(p.y * .95 + sin(p.x * .4));
        float seams = sin(p.y * 4.0 + sin(p.x * .35 + p.z * .4) * 3.0);
        return planes * .09 + seams * .012;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float band = sin(mountainPosition.y * 2.1 + sin(mountainPosition.x * .3 + mountainPosition.z * .35) * 3.0);
      diffuseColor.rgb *= .93 + smoothstep(-.5, .7, band) * .07 + rockRelief(mountainPosition) * .4;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      vec3 rockDx = dFdx(-vViewPosition), rockDy = dFdy(-vViewPosition);
      vec3 rockR1 = cross(rockDy, normal), rockR2 = cross(normal, rockDx);
      float rockDet = dot(rockDx, rockR1);
      float relief = rockRelief(mountainPosition);
      vec3 rockGradient = sign(rockDet) * (dFdx(relief) * rockR1 + dFdy(relief) * rockR2);
      normal = normalize(abs(rockDet) * normal - rockGradient);
    `,
    );
  };
  const mountain = new THREE.Mesh(geometry, material);
  mountain.name = 'enclosing-mountain-walls';
  scene.add(mountain);
  return mountain;
}
