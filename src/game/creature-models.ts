import * as THREE from 'three';
import { sculptedGeometry } from './creature-sculpt';

export type CreatureBone = 'slime';
export type CreatureSurface = 'ivory' | 'dark' | 'eye' | 'gel';
type XYZ = [number, number, number];

const gaussian = (value: number) => Math.exp(-value * value);

export function buildCreatureGeometries() {
  const groups = new Map<string, THREE.BufferGeometry[]>();
  const faceRay = new THREE.Raycaster();
  const add = (
    bone: CreatureBone,
    surface: CreatureSurface,
    geometry: THREE.BufferGeometry,
    color: string,
    position: XYZ = [0, 0, 0],
    scale: XYZ = [1, 1, 1],
    rotation: XYZ = [0, 0, 0],
  ) => {
    if (surface !== 'gel') position = [position[0], position[1] - 0.2, position[2] + 0.055];
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      ),
    );
    const p = geometry.getAttribute('position'),
      n = geometry.getAttribute('normal');
    if (!geometry.index) geometry.setIndex(Array.from({ length: p.count }, (_, i) => i));
    const colors = new Float32Array(p.count * 3);
    const base = new THREE.Color(color),
      tint = new THREE.Color();
    const highlight = new THREE.Color('#99c749'),
      shade = new THREE.Color('#285d2a');
    const sculptShade = geometry.getAttribute('sculptShade');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      tint.copy(base);
      if (surface === 'gel') {
        const height = THREE.MathUtils.clamp(y / 1.5, 0, 1);
        tint.lerp(shade, (1 - height) * 0.4).lerp(highlight, height * 0.4);
        const patches = Math.sin(x * 8 + Math.cos(y * 7)) * Math.cos(z * 9 - y * 5);
        tint.lerp(shade, Math.max(0, patches - 0.45) * 0.3);
        const browY = 0.81 + 0.32 * (Math.abs(x) - 0.41);
        const brow =
          gaussian((Math.abs(x) - 0.41) / 0.22) *
          gaussian((y - browY) / 0.052) *
          THREE.MathUtils.smoothstep(z, 0.58, 0.76);
        tint.lerp(shade, brow * 0.36);
        if (geometry.userData.paintHighlight) tint.set('#dff0b5');
      } else if (surface === 'ivory' && geometry.userData.horn) {
        const uv = geometry.getAttribute('uv');
        const t = uv.getX(i),
          angle = uv.getY(i) * Math.PI * 2;
        tint.lerp(new THREE.Color('#9d7f50'), (1 - t) * (1 - t) * 0.55);
        tint.multiplyScalar(0.96 + 0.04 * Math.sin(angle * 7 + t * 3));
      }
      if (sculptShade) tint.multiplyScalar(0.25 + sculptShade.getX(i) * 0.75);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute('sculptShade');
    const key = `${bone}:${surface}`,
      parts = groups.get(key) ?? [];
    parts.push(geometry);
    groups.set(key, parts);
    // Keep the authoring normal attribute used above explicit for geometry validation.
    if (n.count !== p.count) throw new Error('Slime normal buffer does not match positions');
  };
  const oval = (
    bone: CreatureBone,
    surface: CreatureSurface,
    color: string,
    position: XYZ,
    scale: XYZ,
    rotation: XYZ = [0, 0, 0],
    sides = 12,
    rows = 8,
  ) =>
    add(bone, surface, new THREE.SphereGeometry(1, sides, rows), color, position, scale, rotation);
  const tube = (
    bone: CreatureBone,
    surface: CreatureSurface,
    color: string,
    points: XYZ[],
    radius: number,
    tip = radius,
    segments = 8,
    sides = 6,
  ) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const geometry = new THREE.TubeGeometry(curve, segments, radius, sides, false);
    geometry.userData.horn = surface === 'ivory';
    const p = geometry.getAttribute('position');
    for (let row = 0; row <= segments; row++) {
      const t = row / segments,
        center = curve.getPointAt(t);
      const factor = THREE.MathUtils.lerp(1, tip / radius, t);
      for (let side = 0; side <= sides; side++) {
        const i = row * (sides + 1) + side;
        p.setXYZ(
          i,
          center.x + (p.getX(i) - center.x) * factor,
          center.y + (p.getY(i) - center.y) * factor,
          center.z + (p.getZ(i) - center.z) * factor,
        );
      }
    }
    if (surface === 'ivory' || surface === 'dark') {
      const positions = Array.from(p.array),
        uv = Array.from(geometry.getAttribute('uv').array),
        indices = Array.from(geometry.index!.array);
      for (const end of [0, 1]) {
        const center = curve.getPointAt(end),
          target = curve.getTangentAt(end).multiplyScalar(end ? 1 : -1);
        const centerIndex = positions.length / 3;
        positions.push(center.x, center.y, center.z);
        uv.push(end, 0.5);
        for (let side = 0; side < sides; side++) {
          const a = end * segments * (sides + 1) + side,
            b = a + 1;
          const pa = new THREE.Vector3().fromArray(positions, a * 3).sub(center);
          const pb = new THREE.Vector3().fromArray(positions, b * 3).sub(center);
          indices.push(
            ...(pa.cross(pb).dot(target) > 0 ? [centerIndex, a, b] : [centerIndex, b, a]),
          );
        }
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geometry.setIndex(indices);
      // TubeGeometry's original normal buffer does not include the cap centers.
      geometry.deleteAttribute('normal');
    }
    geometry.computeVertexNormals();
    add(bone, surface, geometry, color);
  };
  // The dome, scalloped base, eye recesses and brows are one baked sculpture.
  const slime = sculptedGeometry('slime');
  add('slime', 'gel', slime, '#58992e');
  const gelFitMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const gelFit = new THREE.Mesh(slime, gelFitMaterial);
  gelFit.updateMatrixWorld();
  const glintPositions: number[] = [],
    glintIndices: number[] = [];
  const glintPoint = (u: number, v: number) => {
    const x = -0.35 + u * 0.2,
      y = 1.17 + u * 0.09 + v * 0.032;
    faceRay.set(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
    const hit = faceRay.intersectObject(gelFit, false)[0];
    if (!hit) throw new Error('Slime crown highlight extends beyond the sculpt');
    glintPositions.push(x, y, hit.point.z + 0.003);
  };
  glintPoint(0, 0);
  for (let ring = 1; ring <= 3; ring++) {
    for (let segment = 0; segment < 16; segment++) {
      const a = (segment * Math.PI * 2) / 16;
      glintPoint((Math.cos(a) * ring) / 3, (Math.sin(a) * ring) / 3);
    }
    for (let segment = 0; segment < 16; segment++) {
      const a = 1 + (ring - 1) * 16 + segment;
      const b = 1 + (ring - 1) * 16 + ((segment + 1) % 16);
      if (ring === 1) glintIndices.push(0, a, b);
      else glintIndices.push(a - 16, a, b, a - 16, b, b - 16);
    }
  }
  const glint = new THREE.BufferGeometry();
  glint.setAttribute('position', new THREE.Float32BufferAttribute(glintPositions, 3));
  glint.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Float32Array((glintPositions.length / 3) * 2), 2),
  );
  glint.setIndex(glintIndices);
  glint.computeVertexNormals();
  glint.userData.paintHighlight = true;
  add('slime', 'gel', glint, '#dff0b5');
  gelFitMaterial.dispose();
  for (const side of [-1, 1]) {
    const yaw = side * 0.28;
    oval(
      'slime',
      'dark',
      '#21381b',
      [side * 0.4, 0.864, 0.797],
      [0.23, 0.18, 0.027],
      [0, yaw, side * 0.09],
      16,
      10,
    );
    oval(
      'slime',
      'eye',
      '#edbe39',
      [side * 0.4, 0.864, 0.808],
      [0.185, 0.15, 0.022],
      [0, yaw, 0],
      16,
      10,
    );
    oval(
      'slime',
      'dark',
      '#18271b',
      [side * 0.4 + 0.013, 0.864, 0.835],
      [0.025, 0.083, 0.008],
      [0, yaw, 0],
      8,
      8,
    );
    oval(
      'slime',
      'ivory',
      '#f5edbe',
      [side * 0.4 - 0.028, 0.92, 0.84],
      [0.023, 0.031, 0.008],
      [0, yaw, 0],
      8,
      6,
    );
  }
  oval('slime', 'dark', '#20351a', [0, 0.505, 0.883], [0.38, 0.085, 0.02], [0, 0, 0], 16, 8);
  for (const side of [-1, 1])
    tube(
      'slime',
      'ivory',
      '#e1d7ab',
      [
        [side * 0.175, 0.572, 0.945],
        [side * 0.177, 0.52, 0.958],
        [side * 0.16, 0.461, 0.95],
      ],
      0.043,
      0.001,
      5,
      5,
    );
  for (const [key, geometries] of groups) {
    if (key.startsWith('slime:')) for (const geometry of geometries) geometry.scale(0.851, 1, 1);
  }
  return groups;
}
