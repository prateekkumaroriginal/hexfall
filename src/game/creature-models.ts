import * as THREE from 'three';
import { sculptedGeometry } from './creature-sculpt';

export type CreatureBone = 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'slime';
export type CreatureSurface = 'skin' | 'iron' | 'leather' | 'ivory' | 'dark' | 'eye' | 'gel';
type XYZ = [number, number, number];
type Ring = [y: number, width: number, depth: number, x?: number, z?: number];
type Sculpt = (x: number, y: number, z: number, angle: number) => XYZ;

const gaussian = (value: number) => Math.exp(-value * value);

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
  const add = (
    bone: CreatureBone,
    surface: CreatureSurface,
    geometry: THREE.BufferGeometry,
    color: string,
    position: XYZ = [0, 0, 0],
    scale: XYZ = [1, 1, 1],
    rotation: XYZ = [0, 0, 0],
  ) => {
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
      surface === 'gel' ? '#a3ca43' : surface === 'skin' ? '#9ca868' : '#c4ad86',
    );
    const shade = new THREE.Color(
      surface === 'gel' ? '#285d2a' : surface === 'skin' ? '#435438' : '#292c29',
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
        const browY = 1.002 + 0.2 * (Math.abs(x) - 0.355);
        const brow =
          gaussian((Math.abs(x) - 0.355) / 0.205) *
          gaussian((y - browY) / 0.043) *
          THREE.MathUtils.smoothstep(z, 0.58, 0.76);
        tint.lerp(shade, brow * 0.36);
      } else if (surface === 'skin') {
        const light = Math.max(0, n.getY(i) * 0.7 + n.getZ(i) * 0.25);
        tint.lerp(highlight, light * 0.3).lerp(shade, Math.max(0, -n.getY(i)) * 0.22);
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
          tint.lerp(shade, pec * 0.36 + midline * 0.22 + abdomen * 0.16);
        }
      } else if (surface === 'iron' || surface === 'leather') {
        const wash = Math.sin(x * 9 + y * 5) * Math.cos(z * 8 - y * 3);
        tint.multiplyScalar(0.94 + wash * 0.055);
        tint.lerp(highlight, Math.max(0, n.getY(i)) * (surface === 'iron' ? 0.22 : 0.1));
      }
      if (sculptShade) tint.multiplyScalar(sculptShade.getX(i));
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
  const skin = '#6d8053',
    leather = '#584031',
    metal = '#505b62',
    edge = '#9c9b86',
    ivory = '#d9c79d';

  const torso = sculptedGeometry('torso');
  add('body', 'skin', torso, skin);

  const head = sculptedGeometry('head');
  add('body', 'skin', head, '#80905b');
  oval('body', 'dark', '#293524', [0, 2.174, 0.465], [0.22, 0.022, 0.018]);
  for (const side of [-1, 1]) {
    oval(
      'body',
      'dark',
      '#283323',
      [side * 0.163, 2.443, 0.269],
      [0.109, 0.055, 0.022],
      [0, side * 0.16, side * 0.1],
    );
    oval('body', 'eye', '#d5b653', [side * 0.162, 2.438, 0.291], [0.073, 0.033, 0.014]);
    oval(
      'body',
      'dark',
      '#1c2418',
      [side * 0.16, 2.438, 0.305],
      [0.018, 0.028, 0.006],
      [0, 0, 0],
      8,
      6,
    );
    tube(
      'body',
      'skin',
      '#667544',
      [
        [side * 0.065, 2.463, 0.313],
        [side * 0.17, 2.497, 0.302],
        [side * 0.29, 2.528, 0.226],
      ],
      0.057,
      0.033,
    );
    oval(
      'body',
      'dark',
      '#36402b',
      [side * 0.052, 2.265, 0.458],
      [0.024, 0.014, 0.011],
      [0, 0, 0],
      8,
      6,
    );
    tube(
      'body',
      'ivory',
      ivory,
      [
        [side * 0.21, 2.125, 0.432],
        [side * 0.238, 2.215, 0.525],
        [side * 0.212, 2.335, 0.535],
      ],
      0.058,
      0.002,
      9,
      7,
    );
    const ear = loft(
      [
        [2.345, 0.06, 0.045, side * 0.33, 0],
        [2.405, 0.12, 0.045, side * 0.43, 0],
        [2.465, 0.125, 0.025, side * 0.51, -0.015],
        [2.525, 0.01, 0.005, side * 0.67, -0.025],
      ],
      12,
    );
    add('body', 'skin', ear, skin);
    tube(
      'body',
      'skin',
      '#54663b',
      [
        [side * 0.4, 2.394, 0.042],
        [side * 0.49, 2.437, 0.037],
        [side * 0.59, 2.488, 0.015],
      ],
      0.012,
      0.003,
      5,
      4,
    );
  }
  tube(
    'body',
    'skin',
    '#b1a274',
    [
      [0.235, 2.555, 0.206],
      [0.23, 2.515, 0.265],
      [0.222, 2.477, 0.282],
    ],
    0.008,
    0.006,
    4,
    4,
  );
  add(
    'body',
    'dark',
    loft(
      [
        [2.64, 0.15, 0.17, 0, -0.04],
        [2.72, 0.16, 0.14, 0, -0.03],
        [2.79, 0.1, 0.12, 0.015, -0.055],
        [2.88, 0.065, 0.1, 0.035, -0.1],
        [2.87, 0.025, 0.035, 0.05, -0.23],
      ],
      12,
    ),
    '#293329',
  );
  for (let strand = 0; strand < 4; strand++)
    tube(
      'body',
      'dark',
      strand % 2 ? '#302b25' : '#403a31',
      [
        [-0.09 + strand * 0.045, 2.77, -0.04],
        [-0.1 + strand * 0.065, 2.88, -0.04],
        [-0.06 + strand * 0.055, 2.96, -0.13],
        [0.01 + strand * 0.04, 2.92, -0.24],
      ],
      0.048,
      0.027,
      8,
      6,
    );
  band('body', 'leather', leather, 1.115, 0.407, 0.281, 0.16);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const panel = new THREE.CylinderGeometry(0.42, 0.51, 0.36, 3, 2, true, -0.34, 0.68);
    add(
      'body',
      'leather',
      panel,
      i % 2 ? '#654733' : '#513729',
      [0, 0.865, 0],
      [1, 1, 0.65],
      [0, angle, 0],
    );
  }
  for (const angle of [0, Math.PI / 4, -Math.PI / 4, Math.PI]) {
    for (let i = 0; i < 6; i++) {
      const y = 0.72 + i * 0.047,
        r = 0.505 - (y - 0.685) * 0.25;
      const x = Math.sin(angle - 0.26) * r,
        z = Math.cos(angle - 0.26) * r * 0.65;
      tube(
        'body',
        'leather',
        '#ac875e',
        [
          [x, y, z],
          [x + Math.cos(angle) * 0.018, y + 0.012, z - Math.sin(angle) * 0.012],
        ],
        0.003,
        0.003,
        1,
        3,
      );
    }
  }
  plate(
    'body',
    'iron',
    '#b29a62',
    [
      [-0.11, 1.2, 0.305],
      [0.11, 1.2, 0.305],
      [0.11, 1.035, 0.305],
      [-0.11, 1.035, 0.305],
    ],
    0.025,
  );
  plate(
    'body',
    'leather',
    '#3a2b22',
    [
      [-0.073, 1.167, 0.35],
      [0.073, 1.167, 0.35],
      [0.073, 1.07, 0.35],
      [-0.073, 1.07, 0.35],
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
    new THREE.Vector2(-0.5, 2.005),
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
        const x = point.x - tangent.y * side * 0.053;
        const y = point.y + tangent.x * side * 0.053;
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
    add('body', 'leather', geometry, '#62432d');
  }
  for (const t of [0.23, 0.48]) {
    const point = strapPath.getPoint(t),
      tangent = strapPath.getTangent(t);
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    const corners = [
      [-0.064, -0.027],
      [0.064, -0.027],
      [0.064, 0.027],
      [-0.064, 0.027],
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
        0.009,
        0.009,
        2,
        4,
      );
    }
  }
  fittingMaterial.dispose();
  band('body', 'iron', '#aa8b54', 2.745, 0.122, 0.123, 0.03, 0, -0.04);
  for (const x of [-0.29, 0.29])
    oval('body', 'iron', '#aa9870', [x, 1.115, 0.212], [0.016, 0.016, 0.009], [0, x, 0], 8, 6);
  for (const side of [-1, 1]) {
    const arm: CreatureBone = side < 0 ? 'leftArm' : 'rightArm';
    const leg: CreatureBone = side < 0 ? 'leftLeg' : 'rightLeg';
    add(arm, 'skin', sculptedGeometry(side < 0 ? 'leftArm' : 'rightArm'), skin);
    band(arm, 'leather', leather, -0.81, 0.206, 0.218, 0.26, side * 0.2, 0.18);
    for (let stitch = 0; stitch < 5; stitch++) {
      const y = -0.91 + stitch * 0.043;
      tube(
        arm,
        'leather',
        '#ac8756',
        [
          [side * 0.2 - 0.028, y, 0.402],
          [side * 0.2 + 0.01, y + 0.01, 0.402],
        ],
        0.0035,
        0.0035,
        1,
        3,
      );
    }
    for (const y of [-0.94, -0.68])
      band(arm, 'iron', '#8c8269', y, 0.21, 0.223, 0.025, side * 0.2, 0.18);
    const big = side < 0,
      rx = big ? 0.4 : 0.31,
      rz = big ? 0.36 : 0.29;
    const armor = loft(
      [
        [-0.18, rx * 0.96, rz * 0.97],
        [-0.14, rx, rz],
        [-0.07, rx * 1.04, rz * 1.03],
        [0.04, rx, rz],
        [0.08, rx * 0.96, rz * 0.96],
        [0.2, rx * 0.68, rz * 0.7],
        [0.25, 0.09, 0.08],
      ],
      10,
      (x, y, z, angle) => [
        x + side * 0.025,
        y - (big ? 0.08 * Math.max(0, Math.cos(angle)) ** 4 * Math.max(0, -y / 0.18) : 0),
        z,
      ],
    );
    const forged = armor.toNonIndexed();
    forged.computeVertexNormals();
    armor.dispose();
    add(arm, 'iron', forged, big ? '#414950' : '#4b555b');
    if (big)
      add(
        arm,
        'iron',
        loft(
          [
            [-0.27, rx * 0.95, rz * 0.85],
            [-0.21, rx * 1.05, rz * 0.94],
            [-0.12, rx * 0.98, rz * 0.9],
          ],
          10,
        ),
        '#485258',
      );

    add(
      arm,
      'iron',
      loft(
        [
          [-0.19, rx * 0.965, rz * 0.98],
          [-0.17, rx * 0.98, rz * 0.99],
        ],
        10,
        (x, y, z, angle) => [
          x + side * 0.025,
          y - (big ? 0.08 * Math.max(0, Math.cos(angle)) ** 4 : 0),
          z,
        ],
      ),
      edge,
    );
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
    for (let scratch = 0; scratch < 7; scratch++) {
      const x = -rx * 0.62 + scratch * rx * 0.19,
        y = 0.02 + (scratch % 3) * 0.038;
      const z = rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) * (1 - y * 1.35);
      tube(
        arm,
        'iron',
        scratch % 2 ? '#9c9c88' : '#303d41',
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
      for (let i = 0; i < 3; i++)
        tube(
          arm,
          'ivory',
          ivory,
          [
            [-0.17 + i * 0.14, 0.19, 0],
            [-0.22 + i * 0.14, 0.33, -0.025],
            [-0.27 + i * 0.14, 0.5 - i * 0.035, -0.06],
          ],
          0.065,
          0.002,
          6,
          6,
        );
    add(leg, 'skin', sculptedGeometry('leg'), skin);
    add(
      leg,
      'leather',
      loft(
        [
          [-0.96, 0.18, 0.26, 0, 0.15],
          [-0.92, 0.22, 0.33, 0, 0.14],
          [-0.82, 0.22, 0.32, 0, 0.12],
          [-0.73, 0.17, 0.21, 0, 0.05],
          [-0.56, 0.18, 0.19],
          [-0.42, 0.185, 0.195],
        ],
        16,
      ),
      '#43342b',
    );
    band(leg, 'leather', '#8b6846', -0.44, 0.194, 0.203, 0.045);
    band(leg, 'leather', '#8b6846', -0.71, 0.18, 0.224, 0.04, 0, 0.045);
    plate(
      leg,
      'iron',
      metal,
      [
        [-0.13, -0.43, 0.203],
        [0.13, -0.43, 0.203],
        [0.15, -0.54, 0.203],
        [0.1, -0.67, 0.203],
        [-0.1, -0.67, 0.203],
        [-0.15, -0.54, 0.203],
      ],
      0.028,
    );
    oval(leg, 'iron', metal, [0, -0.835, 0.32], [0.208, 0.08, 0.15], [0, 0, 0], 12, 6);
  }

  // The dome, scalloped base, eye recesses and brows are one baked sculpture.
  const slime = sculptedGeometry('slime');
  add('slime', 'gel', slime, '#6aa337');
  for (const side of [-1, 1]) {
    const yaw = side * 0.28;
    oval(
      'slime',
      'dark',
      '#21381b',
      [side * 0.35, 0.824, 0.782],
      [0.173, 0.18, 0.027],
      [0, yaw, side * 0.09],
      16,
      10,
    );
    oval(
      'slime',
      'eye',
      '#e5c75e',
      [side * 0.35, 0.824, 0.808],
      [0.127, 0.141, 0.022],
      [0, yaw, 0],
      16,
      10,
    );
    oval(
      'slime',
      'dark',
      '#18271b',
      [side * 0.35 + 0.013, 0.824, 0.835],
      [0.025, 0.105, 0.008],
      [0, yaw, 0],
      8,
      8,
    );
    oval(
      'slime',
      'ivory',
      '#f5edbe',
      [side * 0.35 - 0.028, 0.88, 0.84],
      [0.023, 0.031, 0.008],
      [0, yaw, 0],
      8,
      6,
    );
  }
  oval('slime', 'dark', '#20351a', [0, 0.415, 0.839], [0.28, 0.104, 0.02], [0, 0, 0], 16, 8);
  for (const side of [-1, 1])
    tube(
      'slime',
      'ivory',
      '#e1d7ab',
      [
        [side * 0.145, 0.482, 0.883],
        [side * 0.147, 0.43, 0.896],
        [side * 0.13, 0.371, 0.89],
      ],
      0.035,
      0.001,
      5,
      5,
    );
  return groups;
}
