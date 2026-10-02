import * as THREE from 'three';
import { sculptedGeometry } from './creature-sculpt';

export type CreatureBone = 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'slime';
export type CreatureSurface = 'skin' | 'iron' | 'leather' | 'ivory' | 'dark' | 'eye' | 'gel';
type XYZ = [number, number, number];
type Ring = [y: number, width: number, depth: number, x?: number, z?: number];
type Sculpt = (x: number, y: number, z: number, angle: number) => XYZ;

const gaussian = (value: number) => Math.exp(-value * value);

// A forged plate has a rounded crown and a shaped rim. Intermediate rings keep
// the crown curved instead of triangulating the whole panel as a flat shield.
function crownedPlate(outline: XYZ[], center: XYZ) {
  const positions = [...center];
  const indices: number[] = [];
  const sides = outline.length;
  for (let ring = 1; ring <= 3; ring++) {
    const r = ring / 3;
    for (const point of outline)
      positions.push(
        center[0] + (point[0] - center[0]) * r,
        center[1] + (point[1] - center[1]) * r,
        center[2] + (point[2] - center[2]) * r * r,
      );
    for (let j = 0; j < sides; j++) {
      const next = (j + 1) % sides;
      const a = 1 + (ring - 1) * sides + j;
      const b = 1 + (ring - 1) * sides + next;
      if (ring === 1) indices.push(0, b, a);
      else indices.push(a - sides, b, a, a - sides, b - sides, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      positions.flatMap((_, i) =>
        i % 3 === 0 ? [positions[i] * 1.4 + 0.5, positions[i + 1] * 1.4 + 0.5] : [],
      ),
      2,
    ),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Continuous ring surfaces replace stacks of intersecting spheres. All authoring runs once.
function loft(rings: Ring[], sides: number, sculpt?: Sculpt) {
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let row = 0; row < rings.length; row++) {
    const [y, width, depth, cx = 0, cz = 0] = rings[row];
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const x = cx + Math.sin(angle) * width,
        z = cz + Math.cos(angle) * depth;
      positions.push(...(sculpt ? sculpt(x, y, z, angle) : [x, y, z]));
      uv.push(j / sides, row / (rings.length - 1));
      if (row < rings.length - 1 && j < sides) {
        const a = row * (sides + 1) + j,
          b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  for (const row of [0, rings.length - 1]) {
    const [y, , , x = 0, z = 0] = rings[row],
      center = positions.length / 3;
    positions.push(x, y, z);
    uv.push(0.5, row ? 1 : 0);
    for (let j = 0; j < sides; j++) {
      const a = row * (sides + 1) + j;
      indices.push(center, row ? a : a + 1, row ? a + 1 : a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Match normals across the UV seam, including the asymmetrical sculpted surfaces.
  const normals = geometry.getAttribute('normal');
  const normal = new THREE.Vector3();
  for (let row = 0; row < rings.length; row++) {
    const first = row * (sides + 1),
      last = first + sides;
    normal
      .set(
        normals.getX(first) + normals.getX(last),
        normals.getY(first) + normals.getY(last),
        normals.getZ(first) + normals.getZ(last),
      )
      .normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  return geometry;
}

export function buildCreatureGeometries() {
  const groups = new Map<string, THREE.BufferGeometry[]>();
  const headParts = new Set<THREE.BufferGeometry>();
  let authoringHead = false;
  const add = (
    bone: CreatureBone,
    surface: CreatureSurface,
    geometry: THREE.BufferGeometry,
    color: string,
    position: XYZ = [0, 0, 0],
    scale: XYZ = [1, 1, 1],
    rotation: XYZ = [0, 0, 0],
  ) => {
    if (bone === 'slime' && surface !== 'gel') {
      position = [position[0], position[1] - 0.2, position[2] + 0.055];
    }
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      ),
    );
    const p = geometry.getAttribute('position'),
      n = geometry.getAttribute('normal');
    const sculptShade = geometry.getAttribute('sculptShade');
    // Extruded plates are non-indexed; normalize them before merging with ring surfaces.
    if (!geometry.index) geometry.setIndex(Array.from({ length: p.count }, (_, i) => i));
    const colors = new Float32Array(p.count * 3),
      base = new THREE.Color(color),
      tint = new THREE.Color();
    const highlight = new THREE.Color(
      surface === 'gel'
        ? '#99c749'
        : surface === 'skin'
          ? '#8e9864'
          : surface === 'iron'
            ? '#8b949f'
            : '#8b755a',
    );
    const shade = new THREE.Color(
      surface === 'gel' ? '#285d2a' : surface === 'skin' ? '#34452f' : '#242321',
    );
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
      } else if (surface === 'skin') {
        const light = Math.max(0, n.getY(i) * 0.7 + n.getZ(i) * 0.25);
        tint.lerp(highlight, light * 0.2).lerp(shade, Math.max(0, -n.getY(i)) * 0.35);
        if (authoringHead) {
          const browY = 2.453 + 0.32 * (Math.abs(x) - 0.168);
          const brow =
            gaussian((Math.abs(x) - 0.175) / 0.15) *
            gaussian((y - browY) / 0.072) *
            THREE.MathUtils.smoothstep(z, 0.24, 0.32);
          tint.lerp(new THREE.Color('#3d4c30'), brow * 0.78);
          const socket = gaussian((Math.abs(x) - 0.165) / 0.115) * gaussian((y - 2.409) / 0.053);
          const muzzle = gaussian((Math.abs(x) - 0.17) / 0.06) * gaussian((y - 2.23) / 0.12);
          tint.lerp(
            shade,
            (socket * 0.4 + muzzle * 0.24) * THREE.MathUtils.smoothstep(z, 0.24, 0.34),
          );
        }
        if (bone === 'body') {
          const pec =
            gaussian((Math.abs(x) - 0.28) / 0.23) *
            gaussian((y - 1.74) / 0.11) *
            Math.max(0, n.getZ(i));
          const midline = gaussian(x / 0.04) * gaussian((y - 1.6) / 0.32) * Math.max(0, n.getZ(i));
          const abdomen =
            gaussian((Math.abs(x) - 0.16) / 0.15) *
            (gaussian((y - 1.31) / 0.025) +
              gaussian((y - 1.45) / 0.025) +
              gaussian((y - 1.58) / 0.025)) *
            Math.max(0, n.getZ(i));
          tint.lerp(shade, pec * 0.46 + midline * 0.38 + abdomen * 0.24);
        }
      } else if (surface === 'dark' && geometry.userData.hair) {
        const strand = Math.sin(x * 125 + y * 17 + z * 8);
        tint.lerp(
          new THREE.Color('#4b4039'),
          Math.max(0, n.getY(i)) * 0.18 + Math.max(0, strand - 0.45) * 0.14,
        );
      } else if (surface === 'ivory' && geometry.userData.horn) {
        const uv = geometry.getAttribute('uv');
        const t = uv.getX(i),
          angle = uv.getY(i) * Math.PI * 2;
        tint.lerp(new THREE.Color('#9d7f50'), (1 - t) * (1 - t) * 0.55);
        tint.multiplyScalar(0.96 + 0.04 * Math.sin(angle * 7 + t * 3));
      } else if (surface === 'iron' || surface === 'leather') {
        const wash = Math.sin(x * 9 + y * 5) * Math.cos(z * 8 - y * 3);
        tint.multiplyScalar(0.94 + wash * 0.055);
        tint.lerp(highlight, Math.max(0, n.getY(i)) * (surface === 'iron' ? 0.22 : 0.1));
      }
      if (sculptShade) tint.multiplyScalar(0.25 + sculptShade.getX(i) * 0.75);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute('sculptShade');
    if (authoringHead) headParts.add(geometry);
    const key = `${bone}:${surface}`,
      parts = groups.get(key) ?? [];
    parts.push(geometry);
    groups.set(key, parts);
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
    if (surface === 'skin' || surface === 'ivory' || surface === 'dark') {
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
  const band = (
    bone: CreatureBone,
    surface: CreatureSurface,
    color: string,
    y: number,
    rx: number,
    rz: number,
    height: number,
    x = 0,
    z = 0,
  ) =>
    add(
      bone,
      surface,
      loft(
        [
          [y - height / 2, rx, rz, x, z],
          [y + height / 2, rx, rz, x, z],
        ],
        16,
      ),
      color,
    );
  const plate = (
    bone: CreatureBone,
    surface: CreatureSurface,
    color: string,
    outline: XYZ[],
    thickness: number,
  ) => {
    const shape = new THREE.Shape();
    outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.014,
      bevelThickness: 0.014,
    });
    add(bone, surface, geometry, color, [0, 0, outline[0][2]]);
  };
  const skin = '#6b7a49',
    leather = '#40312a',
    metal = '#3e434d',
    edge = '#6b6860',
    ivory = '#d9c79d';

  const torso = sculptedGeometry('torso');
  add('body', 'skin', torso, skin);

  for (const side of [-1, 1])
    oval(
      'body',
      'skin',
      '#697944',
      [side * 0.34, 1.81, 0.365],
      [0.024, 0.013, 0.007],
      [0, 0, 0],
      10,
      6,
    );
  authoringHead = true;
  const head = sculptedGeometry('head');
  add('body', 'skin', head, '#72804e');
  const faceFitMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const faceFitMesh = new THREE.Mesh(head, faceFitMaterial);
  faceFitMesh.updateMatrixWorld();
  const faceRay = new THREE.Raycaster();
  const faceDepth = (x: number, y: number) => {
    faceRay.set(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
    return faceRay.intersectObject(faceFitMesh, false)[0]?.point.z ?? 0.3;
  };
  const faceLine = (color: string, points: [number, number][], radius: number) =>
    tube(
      'body',
      'skin',
      color,
      points.map(([x, y]) => [x, y, faceDepth(x, y) + 0.003] as XYZ),
      radius,
      radius * 0.35,
      8,
      5,
    );
  // A downturned mouth, rolled lower lip and central chin cleft.
  tube(
    'body',
    'dark',
    '#303221',
    [
      [-0.21, 2.155, 0.455],
      [-0.12, 2.19, 0.46],
      [0, 2.198, 0.46],
      [0.12, 2.19, 0.46],
      [0.21, 2.155, 0.455],
    ],
    0.013,
    0.009,
    12,
    5,
  );
  tube(
    'body',
    'skin',
    '#758250',
    [
      [-0.2, 2.124, 0.418],
      [-0.11, 2.155, 0.454],
      [0, 2.151, 0.469],
      [0.11, 2.155, 0.454],
      [0.2, 2.124, 0.418],
    ],
    0.04,
    0.018,
    14,
    7,
  );
  tube(
    'body',
    'skin',
    '#60733e',
    [
      [0, 2.1, 0.368],
      [0, 2.068, 0.361],
    ],
    0.005,
    0.002,
    3,
    4,
  );
  for (const side of [-1, 1]) {
    oval(
      'body',
      'dark',
      '#283323',
      [side * 0.163, 2.406, 0.294],
      [0.104, 0.045, 0.022],
      [0, side * 0.16, side * 0.18],
    );
    oval(
      'body',
      'eye',
      '#d6a43e',
      [side * 0.162, 2.401, 0.307],
      [0.071, 0.027, 0.012],
      [0, side * 0.16, side * 0.18],
    );
    oval(
      'body',
      'dark',
      '#1c2418',
      [side * 0.16, 2.4, 0.319],
      [0.014, 0.022, 0.005],
      [0, 0, 0],
      8,
      6,
    );
    oval(
      'body',
      'dark',
      '#36402b',
      [side * 0.078, 2.282, 0.492],
      [0.025, 0.016, 0.01],
      [0, 0, 0],
      8,
      6,
    );
    tube(
      'body',
      'ivory',
      ivory,
      [
        [side * 0.2, 2.132, 0.427],
        [side * 0.222, 2.205, 0.497],
        [side * 0.207, 2.287, 0.492],
      ],
      0.068,
      0.002,
      9,
      9,
    );
    const ear = loft(
      [
        [2.3, 0.028, 0.04, side * 0.32, 0],
        [2.37, 0.1, 0.065, side * 0.37, -0.005],
        [2.46, 0.115, 0.047, side * 0.415, -0.015],
        [2.53, 0.078, 0.023, side * 0.462, -0.03],
        [2.555, 0.005, 0.003, side * 0.554, -0.045],
      ],
      16,
    );
    add('body', 'skin', ear, skin);
    plate(
      'body',
      'skin',
      '#596431',
      [
        [side * 0.34, 2.365, 0.049],
        [side * 0.41, 2.49, 0.049],
        [side * 0.512, 2.53, 0.049],
        [side * 0.455, 2.405, 0.049],
      ],
      0.003,
    );
    oval(
      'body',
      'dark',
      '#3b4527',
      [side * 0.376, 2.399, 0.057],
      [0.035, 0.055, 0.01],
      [0, 0, side * -0.4],
      12,
      8,
    );
    tube(
      'body',
      'skin',
      '#81904e',
      [
        [side * 0.34, 2.35, 0.062],
        [side * 0.375, 2.39, 0.076],
        [side * 0.41, 2.45, 0.06],
      ],
      0.014,
      0.006,
      5,
      5,
    );
    faceLine(
      '#aa9364',
      [
        [side * 0.247, 2.401],
        [side * 0.263, 2.364],
        [side * 0.278, 2.322],
      ],
      0.005,
    );
    if (side > 0)
      faceLine(
        '#aa9364',
        [
          [0.278, 2.38],
          [0.293, 2.352],
          [0.302, 2.322],
        ],
        0.0035,
      );
    tube(
      'body',
      'skin',
      '#52643a',
      [
        [side * 0.095, 2.269, 0.398],
        [side * 0.133, 2.239, 0.407],
        [side * 0.16, 2.204, 0.412],
      ],
      0.005,
      0.002,
      5,
      4,
    );
    tube(
      'body',
      'ivory',
      ivory,
      [
        [side * 0.105, 2.184, 0.476],
        [side * 0.108, 2.208, 0.471],
      ],
      0.016,
      0.002,
      3,
      5,
    );
  }
  faceLine(
    '#ac9567',
    [
      [0.224, 2.575],
      [0.22, 2.53],
      [0.208, 2.48],
    ],
    0.0045,
  );
  faceFitMaterial.dispose();
  const hair = sculptedGeometry('hair');
  hair.userData.hair = true;
  add('body', 'dark', hair, '#211e1c');
  const hairMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const hairMesh = new THREE.Mesh(hair, hairMaterial);
  hairMesh.updateMatrixWorld();
  for (let strand = 0; strand < 5; strand++) {
    const points: XYZ[] = [];
    for (let step = 0; step <= 6; step++) {
      const t = step / 6;
      const x = (strand - 2) * 0.027 + Math.sin(t * Math.PI) * 0.037 - t * t * 0.025;
      const y = 2.81 + t * 0.202;
      faceRay.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
      const hit = faceRay.intersectObject(hairMesh, false)[0];
      if (hit) points.push([x, y, hit.point.z + 0.001]);
    }
    if (points.length > 1) tube('body', 'dark', '#51463c', points, 0.003, 0.0005, 6, 3);
  }
  hairMaterial.dispose();
  authoringHead = false;
  band('body', 'leather', leather, 1.115, 0.49, 0.3, 0.22);
  for (let panel = 0; panel < 10; panel++) {
    const apron = panel === 9;
    const angle = apron ? 0 : (panel * Math.PI * 2) / 9;
    const length = apron ? 0.59 : 0.47 - Math.abs(Math.sin(angle)) * 0.13 + (panel % 2) * 0.035;
    const halfAngle = apron ? 0.3 : 0.37;
    const shape = (u: number, t: number, offset = 0): XYZ => {
      const a = angle + (u * 2 - 1) * halfAngle * (apron ? 1 : 0.82 + t * 0.18);
      const flare = Math.pow(1 - t, 0.7);
      const rx = 0.48 + flare * (apron ? 0.04 : 0.15);
      const rz =
        0.31 + flare * (Math.cos(a) < 0 ? 0.16 : 0.09) + (apron ? 0.018 + flare * 0.05 : 0);
      const fold = Math.sin(u * Math.PI * 2 + panel * 0.6) * 0.023 * (1 - t);
      const hem =
        (1 - t) ** 4 * (0.009 * Math.cos(u * Math.PI * 2) + 0.006 * Math.sin(panel * 1.7));
      return [
        Math.sin(a) * (rx + fold + offset),
        1.025 - length * (1 - t) + hem,
        Math.cos(a) * (rz + fold + offset),
      ];
    };
    const positions: number[] = [],
      indices: number[] = [],
      uv: number[] = [];
    const rows = 5,
      columns = 6,
      stride = columns + 1;
    for (let row = 0; row <= rows; row++)
      for (let column = 0; column <= columns; column++) {
        positions.push(...shape(column / columns, row / rows));
        uv.push(column / columns, row / rows);
        if (row < rows && column < columns) {
          const k = row * stride + column;
          indices.push(k, k + 1, k + stride, k + 1, k + stride + 1, k + stride);
        }
      }
    const geometry = new THREE.BufferGeometry();
    // Close the leather's back and hem so overlapping panels have real thickness.
    const frontCount = positions.length / 3;
    const frontIndices = indices.slice();
    for (let row = 0; row <= rows; row++)
      for (let column = 0; column <= columns; column++) {
        positions.push(...shape(column / columns, row / rows, -0.022));
        uv.push(column / columns, row / rows);
      }
    for (let i = 0; i < frontIndices.length; i += 3)
      indices.push(
        frontIndices[i] + frontCount,
        frontIndices[i + 2] + frontCount,
        frontIndices[i + 1] + frontCount,
      );
    const perimeter = [
      ...Array.from({ length: columns }, (_, i) => i),
      ...Array.from({ length: rows }, (_, i) => i * stride + columns),
      ...Array.from({ length: columns }, (_, i) => frontCount - 1 - i),
      ...Array.from({ length: rows }, (_, i) => (rows - i) * stride),
    ];
    for (let i = 0; i < perimeter.length; i++) {
      const a = perimeter[i],
        b = perimeter[(i + 1) % perimeter.length];
      indices.push(a, a + frontCount, b, b, a + frontCount, b + frontCount);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    add('body', 'leather', geometry, panel % 2 ? '#49342a' : '#382c26');
    for (const u of [0.025, 0.975]) {
      tube(
        'body',
        'leather',
        '#65513b',
        Array.from({ length: 7 }, (_, row) => shape(u, row / 6, 0.004)),
        0.006,
        0.005,
        6,
        4,
      );
      for (let stitch = 1; stitch < 7; stitch++)
        tube(
          'body',
          'leather',
          '#816748',
          [
            shape(u === 0.025 ? 0.07 : 0.93, stitch / 8, 0.009),
            shape(u === 0.025 ? 0.07 : 0.93, stitch / 8 + 0.025, 0.009),
          ],
          0.0025,
          0.0025,
          1,
          3,
        );
    }
    tube(
      'body',
      'leather',
      '#65513b',
      Array.from({ length: 7 }, (_, column) => shape(column / 6, 0.015, 0.004)),
      0.006,
      0.006,
      6,
      4,
    );
  }
  plate(
    'body',
    'iron',
    '#b29a62',
    [
      [-0.118, 1.25, 0.313],
      [0.118, 1.25, 0.313],
      [0.118, 0.99, 0.313],
      [-0.118, 0.99, 0.313],
    ],
    0.025,
  );
  plate(
    'body',
    'leather',
    '#3a2b22',
    [
      [-0.079, 1.21, 0.358],
      [0.079, 1.21, 0.358],
      [0.079, 1.032, 0.358],
      [-0.079, 1.032, 0.358],
    ],
    0.004,
  );
  tube(
    'body',
    'iron',
    '#c4ac75',
    [
      [-0.02, 1.12, 0.365],
      [0.055, 1.12, 0.365],
    ],
    0.012,
    0.012,
    1,
    4,
  );
  // Project the strap onto the baked sculpture once, including the chest and abs.
  const strapPath = new THREE.SplineCurve([
    new THREE.Vector2(-0.44, 2.09),
    new THREE.Vector2(-0.34, 1.855),
    new THREE.Vector2(-0.16, 1.66),
    new THREE.Vector2(0.025, 1.45),
    new THREE.Vector2(0.24, 1.22),
  ]);
  const fittingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const fittingMesh = new THREE.Mesh(torso, fittingMaterial);
  fittingMesh.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const torsoDepth = (x: number, y: number, front: boolean) => {
    ray.set(new THREE.Vector3(x, y, front ? 2 : -2), new THREE.Vector3(0, 0, front ? -1 : 1));
    const hit = ray.intersectObject(fittingMesh, false)[0];
    return (hit?.point.z ?? (front ? 0.23 : -0.23)) + (front ? 0.025 : -0.025);
  };
  for (const front of [true, false]) {
    const positions: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    const segments = 48;
    for (let row = 0; row <= segments; row++) {
      const t = row / segments,
        point = strapPath.getPoint(t),
        tangent = strapPath.getTangent(t);
      for (const side of [-1, 1]) {
        const x = point.x - tangent.y * side * 0.067;
        const y = point.y + tangent.x * side * 0.067;
        positions.push(x, y, torsoDepth(x, y, front));
        uv.push(side < 0 ? 0 : 1, t);
      }
      if (row < segments) {
        const a = row * 2;
        indices.push(
          ...(front
            ? [a, a + 2, a + 1, a + 1, a + 2, a + 3]
            : [a, a + 1, a + 2, a + 1, a + 3, a + 2]),
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    add('body', 'leather', geometry, '#44302a');
  }
  for (const t of [0.37]) {
    const point = strapPath.getPoint(t),
      tangent = strapPath.getTangent(t);
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    const corners = [
      [-0.078, -0.034],
      [0.078, -0.034],
      [0.078, 0.034],
      [-0.078, 0.034],
    ].map(
      ([w, h]) =>
        new THREE.Vector2(
          point.x + normal.x * w + tangent.x * h,
          point.y + normal.y * w + tangent.y * h,
        ),
    );
    for (let i = 0; i < 4; i++) {
      const p = corners[i],
        q = corners[(i + 1) % 4];
      tube(
        'body',
        'iron',
        '#c3a56e',
        [
          [p.x, p.y, torsoDepth(p.x, p.y, true) + 0.014],
          [q.x, q.y, torsoDepth(q.x, q.y, true) + 0.014],
        ],
        0.013,
        0.013,
        2,
        4,
      );
    }
  }
  for (const edgeSide of [-1, 1]) {
    const edgePoints = Array.from({ length: 13 }, (_, i): XYZ => {
      const point = strapPath.getPoint(i / 12),
        tangent = strapPath.getTangent(i / 12);
      const x = point.x - tangent.y * edgeSide * 0.067;
      const y = point.y + tangent.x * edgeSide * 0.067;
      return [x, y, torsoDepth(x, y, true) + 0.003];
    });
    tube('body', 'leather', '#66513e', edgePoints, 0.007, 0.006, 12, 3);
    for (let stitch = 1; stitch < 19; stitch++) {
      const t = stitch / 20,
        point = strapPath.getPoint(t),
        tangent = strapPath.getTangent(t);
      const x = point.x - tangent.y * edgeSide * 0.052,
        y = point.y + tangent.x * edgeSide * 0.052;
      const qx = x + tangent.x * 0.017,
        qy = y + tangent.y * 0.017;
      tube(
        'body',
        'leather',
        '#7c6245',
        [
          [x, y, torsoDepth(x, y, true) + 0.004],
          [qx, qy, torsoDepth(qx, qy, true) + 0.004],
        ],
        0.0025,
        0.0025,
        1,
        3,
      );
    }
  }
  fittingMaterial.dispose();
  authoringHead = true;
  band('body', 'leather', '#85532f', 2.785, 0.093, 0.089, 0.055, 0, -0.07);
  authoringHead = false;
  for (let rivet = 1; rivet < 12; rivet++) {
    const a = (rivet * Math.PI * 2) / 12;
    oval(
      'body',
      'iron',
      '#b2a18a',
      [Math.sin(a) * 0.496, 1.115, Math.cos(a) * 0.313],
      [0.014, 0.016, 0.009],
      [0, a, 0],
      8,
      5,
    );
  }
  for (const x of [-0.29, 0.29])
    oval('body', 'iron', '#aa9870', [x, 1.115, 0.212], [0.016, 0.016, 0.009], [0, x, 0], 8, 6);
  for (const side of [-1, 1]) {
    const arm: CreatureBone = side < 0 ? 'leftArm' : 'rightArm';
    const leg: CreatureBone = side < 0 ? 'leftLeg' : 'rightLeg';
    add(arm, 'skin', sculptedGeometry(side < 0 ? 'leftArm' : 'rightArm'), skin);
    add(
      arm,
      'leather',
      loft(
        [
          [-0.95, 0.19, 0.245, side * 0.21, 0.24],
          [-0.89, 0.207, 0.26, side * 0.21, 0.22],
          [-0.69, 0.244, 0.28, side * 0.2, 0.145],
          [-0.6, 0.256, 0.282, side * 0.19, 0.105],
        ],
        16,
      ),
      '#3c2b25',
    );
    // A second fitted front panel overlaps the cuff, with a reinforced fastening seam.
    add(
      arm,
      'leather',
      crownedPlate(
        [
          [side * 0.21 - 0.15, -0.91, 0.469],
          [side * 0.21 + 0.16, -0.91, 0.469],
          [side * 0.19 + 0.18, -0.63, 0.381],
          [side * 0.19 - 0.17, -0.63, 0.381],
        ],
        [side * 0.2, -0.77, 0.473],
      ),
      '#493128',
    );
    for (let stitch = 0; stitch < 5; stitch++) {
      const y = -0.91 + stitch * 0.043;
      tube(
        arm,
        'leather',
        '#806246',
        [
          [side * 0.2 - 0.028, y, 0.475],
          [side * 0.2 + 0.01, y + 0.01, 0.475],
        ],
        0.0035,
        0.0035,
        1,
        3,
      );
    }
    band(arm, 'leather', '#6f5038', -0.94, 0.207, 0.261, 0.045, side * 0.21, 0.24);
    band(arm, 'leather', '#6f5038', -0.615, 0.266, 0.294, 0.048, side * 0.19, 0.11);
    for (const y of [-0.65, -0.9])
      oval(
        arm,
        'iron',
        '#c2a470',
        [side * 0.29, y, y < -0.8 ? 0.475 : 0.423],
        [0.018, 0.018, 0.009],
        [0, 0, 0],
        8,
        5,
      );
    oval(
      arm,
      'skin',
      '#6d7b4b',
      [side * 0.088, -1.044, 0.448],
      [0.092, 0.05, 0.057],
      [0, 0, side * -0.52],
      12,
      8,
    );
    oval(
      arm,
      'skin',
      '#899164',
      [side * 0.08, -1.052, 0.493],
      [0.025, 0.019, 0.005],
      [0, 0, side * -0.52],
      10,
      6,
    );
    for (let finger = 0; finger < 3; finger++) {
      const x = side * (0.21 + (finger - 1) * 0.083);
      tube(
        arm,
        'skin',
        '#3c502e',
        [
          [x, -1.088, 0.485],
          [x, -1.126, 0.491],
          [x, -1.161, 0.463],
        ],
        0.004,
        0.002,
        4,
        4,
      );
    }
    const big = side < 0,
      rx = big ? 0.345 : 0.29,
      rz = big ? 0.34 : 0.28;
    const armor = loft(
      [
        [-0.14, rx * 1.03, rz],
        [-0.08, rx, rz],
        [0.04, rx * 0.93, rz * 0.94],
        [0.14, rx * 0.73, rz * 0.76],
        [0.205, rx * 0.43, rz * 0.44],
        [0.23, 0.02, 0.02],
      ],
      20,
      (x, y, z, angle) => [
        x + side * 0.025,
        y - (big ? 0.1 * Math.max(0, Math.cos(angle)) ** 4 * Math.max(0, -y / 0.14) : 0),
        z,
      ],
    );
    add(arm, 'iron', armor, big ? '#3d4049' : '#454751');
    if (big)
      add(
        arm,
        'iron',
        loft(
          [
            [-0.255, rx * 0.95, rz * 0.85],
            [-0.2, rx * 1.05, rz * 0.94],
            [-0.12, rx * 0.98, rz * 0.9],
          ],
          16,
        ),
        '#485258',
      );

    add(
      arm,
      'iron',
      loft(
        [
          [-0.15, rx * 1.04, rz * 1.01],
          [-0.13, rx * 1.035, rz * 1.008],
        ],
        20,
        (x, y, z, angle) => [
          x + side * 0.025,
          y - (big ? 0.1 * Math.max(0, Math.cos(angle)) ** 4 : 0),
          z,
        ],
      ),
      edge,
    );
    if (big) {
      const outline: XYZ[] = [
        [-0.365, -0.105, 0.13],
        [-0.29, 0.11, 0.24],
        [-0.09, 0.19, 0.21],
        [0.145, 0.145, 0.21],
        [0.23, -0.065, 0.3],
        [0.17, -0.225, 0.34],
        [-0.035, -0.255, 0.35],
        [-0.245, -0.185, 0.28],
      ];
      const plateGeometry = crownedPlate(outline, [-0.045, -0.015, 0.439]);
      add(arm, 'iron', plateGeometry, '#34353e');
      for (let j = 0; j < outline.length; j++)
        tube(
          arm,
          'iron',
          '#79746a',
          [outline[j], outline[(j + 1) % outline.length]],
          0.014,
          0.014,
          2,
          5,
        );
      for (const pos of [
        [0.155, -0.17, 0.384],
        [-0.12, -0.175, 0.377],
        [0.12, 0.11, 0.31],
      ] as XYZ[])
        oval(arm, 'iron', '#b0a086', pos, [0.022, 0.022, 0.014], [0, 0, 0], 9, 6);
    }
    // Sparse raised wear lines stay in the existing armor batch.
    tube(
      arm,
      'iron',
      '#89918a',
      [
        [-rx * 0.45, -0.015, rz * 0.92],
        [-rx * 0.28, 0.015, rz * 0.97],
      ],
      0.004,
      0.001,
      2,
      3,
    );
    for (let scratch = 0; scratch < 2; scratch++) {
      const x = -rx * 0.62 + scratch * rx * 0.19,
        y = 0.02 + (scratch % 3) * 0.038;
      const z = rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) * (1 - y * 1.35);
      tube(
        arm,
        'iron',
        scratch % 2 ? '#656963' : '#30383c',
        [
          [x, y, z + 0.008],
          [x + 0.018, y + 0.022, z - 0.007],
        ],
        0.0026,
        0.001,
        1,
        3,
      );
    }
    for (const a of [-0.75, 0, 0.75])
      oval(
        arm,
        'iron',
        '#b0a388',
        [Math.sin(a) * rx, -0.065, Math.cos(a) * rz],
        [0.02, 0.02, 0.012],
        [0, a, 0],
        8,
        6,
      );
    if (big)
      for (let i = 0; i < 2; i++)
        tube(
          arm,
          'ivory',
          ivory,
          [
            [-0.16 + i * 0.22, 0.18, 0.025],
            [-0.19 + i * 0.22, 0.3, 0.01],
            [-0.255 + i * 0.21, 0.39 + i * 0.06, -0.03],
          ],
          0.08,
          0.002,
          6,
          6,
        );
    if (big)
      tube(
        arm,
        'ivory',
        ivory,
        [
          [0.145, -0.065, 0.41],
          [0.155, 0.03, 0.465],
          [0.12, 0.15, 0.445],
        ],
        0.05,
        0.002,
        7,
        7,
      );
    const thigh = sculptedGeometry('leg');
    const thighPositions = thigh.getAttribute('position');
    for (let vertex = 0; vertex < thighPositions.count; vertex++) {
      const taper = 1.13 - 0.2 * THREE.MathUtils.smoothstep(thighPositions.getY(vertex), -0.4, 0.1);
      const bootClearance =
        1 - 0.2 * (1 - THREE.MathUtils.smoothstep(thighPositions.getY(vertex), -0.52, -0.42));
      thighPositions.setX(vertex, thighPositions.getX(vertex) * taper * bootClearance);
      thighPositions.setZ(vertex, thighPositions.getZ(vertex) * bootClearance);
    }
    thigh.computeVertexNormals();
    add(leg, 'skin', thigh, skin);
    add(
      leg,
      'leather',
      loft(
        [
          [-0.96, 0.19, 0.27, 0, 0.15],
          [-0.92, 0.225, 0.34, 0, 0.14],
          [-0.82, 0.225, 0.32, 0, 0.12],
          [-0.73, 0.19, 0.225, 0, 0.05],
          [-0.56, 0.2, 0.21],
          [-0.42, 0.21, 0.21],
        ],
        16,
      ),
      '#352b26',
    );
    band(leg, 'leather', '#624933', -0.445, 0.232, 0.235, 0.078);
    band(leg, 'leather', '#624933', -0.66, 0.23, 0.252, 0.075, 0, 0.012);
    band(leg, 'leather', '#624933', -0.71, 0.206, 0.244, 0.066, 0, 0.045);
    add(
      leg,
      'iron',
      crownedPlate(
        [
          [-0.135, -0.38, 0.224],
          [0.13, -0.385, 0.224],
          [0.185, -0.51, 0.224],
          [0.12, -0.64, 0.224],
          [-0.115, -0.645, 0.224],
          [-0.18, -0.51, 0.224],
        ],
        [0, -0.515, 0.333],
      ),
      metal,
    );

    oval(leg, 'iron', '#3e4149', [0, -0.84, 0.28], [0.23, 0.133, 0.221], [0, 0, 0], 20, 10);
    add(
      leg,
      'leather',
      loft(
        [
          [-0.973, 0.218, 0.34, 0, 0.14],
          [-0.938, 0.227, 0.35, 0, 0.14],
        ],
        20,
      ),
      '#342c25',
    );
    band(leg, 'leather', '#514536', -0.934, 0.229, 0.352, 0.026, 0, 0.14);
    add(
      leg,
      'leather',
      new THREE.BoxGeometry(0.38, 0.062, 0.023),
      '#58402e',
      [0, -0.745, 0.292],
      [1, 1, 1],
      [0.32, 0, side * 0.25],
    );
    for (const y of [-0.735, -0.815]) {
      band(leg, 'leather', '#58402e', y, 0.206, 0.252, 0.079, 0, 0.045);
      oval(leg, 'iron', '#ba985c', [0.135, y, 0.235], [0.015, 0.015, 0.008], [0, 0.4, 0], 8, 5);
    }
    tube(
      leg,
      'iron',
      '#78736b',
      [
        [-0.135, -0.39, 0.235],
        [-0.175, -0.51, 0.235],
        [-0.11, -0.64, 0.235],
        [0.115, -0.635, 0.235],
        [0.18, -0.51, 0.235],
        [0.13, -0.395, 0.235],
      ],
      0.009,
      0.009,
      12,
      4,
    );
  }

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
  // Proportions measured against the front concept: higher waist, longer legs,
  // compact head. Apply after strap fitting so every fitted detail follows its skin.
  for (const [key, geometries] of groups) {
    if (key.startsWith('slime:')) for (const geometry of geometries) geometry.scale(0.851, 1, 1);
    if (key.startsWith('body:'))
      for (const geometry of geometries) {
        if (headParts.has(geometry))
          geometry.scale(0.77, 0.75, 0.87).translate(0, 2.76 * (1 - 0.75), 0);
        else geometry.scale(1, 0.8, 1).translate(0, 0.44, 0);
      }
    if (key.startsWith('leftLeg:') || key.startsWith('rightLeg:')) {
      const side = key.startsWith('leftLeg:') ? -1 : 1;
      const stance = new THREE.Matrix4().set(
        1,
        -side * 0.22,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
      );
      for (const geometry of geometries) {
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        const normal = new THREE.Vector3();
        for (let i = 0; i < positions.count; i++) {
          const t = THREE.MathUtils.clamp((positions.getY(i) + 0.82) / 0.15, 0, 1);
          const scale = 1 + (1 - t * t * (3 - 2 * t)) * 0.15;
          const derivative = -6 * t * (1 - t);
          normal
            .set(
              normals.getX(i) / scale,
              normals.getY(i) - (positions.getX(i) * derivative * normals.getX(i)) / scale,
              normals.getZ(i),
            )
            .normalize();
          normals.setXYZ(i, normal.x, normal.y, normal.z);
          positions.setX(i, positions.getX(i) * scale);
        }
        geometry.scale(1, 1.2, 1).applyMatrix4(stance);
      }
    }
  }
  return groups;
}
