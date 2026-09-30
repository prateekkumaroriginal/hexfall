import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAX_ENEMIES, SLIME_SPAWN_DURATION, slimeSpawnScale } from './simulation';
import type { Enemy } from './simulation';

type Bone = 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'slime';
type Surface = 'skin' | 'iron' | 'leather' | 'ivory' | 'dark' | 'eye' | 'gel';
type Part = { bone: Bone; mesh: THREE.InstancedMesh };
type XYZ = [number, number, number];

// Model parts are authored once, merged by material and joint, and instanced for the horde.
// No per-enemy meshes, textures, animation mixers, or allocations in the update loop.
export class CreatureRenderer {
  private parts: Part[] = [];
  private frustum = new THREE.Frustum();
  private viewProjection = new THREE.Matrix4();
  private bounds = new THREE.Sphere(new THREE.Vector3(), 2);
  private shadows: THREE.InstancedMesh;
  private spawnBubbles: THREE.InstancedMesh;
  private root = new THREE.Object3D();
  private joint = new THREE.Object3D();
  private matrix = new THREE.Matrix4();
  private tint = new THREE.Color();
  private transforms: Record<Bone, THREE.Matrix4> = {
    body: new THREE.Matrix4(),
    leftArm: new THREE.Matrix4(),
    rightArm: new THREE.Matrix4(),
    leftLeg: new THREE.Matrix4(),
    rightLeg: new THREE.Matrix4(),
    slime: new THREE.Matrix4(),
  };
  constructor(scene: THREE.Scene) {
    const shadowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 shadowUv;
        void main() {
          shadowUv=uv;
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: `
        varying vec2 shadowUv;
        void main() {
          float r=length((shadowUv-0.5)*2.0);
          float a=(1.0-smoothstep(0.15,1.0,r))*0.3;
          gl_FragColor=vec4(0.025,0.035,0.02,a);
        }
      `,
    });
    this.shadows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2.6, 2.2).rotateX(-Math.PI / 2),
      shadowMaterial,
      MAX_ENEMIES,
    );
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    scene.add(this.shadows);
    this.spawnBubbles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshStandardMaterial({
        color: '#83b650',
        roughness: 0.2,
        emissive: '#385f24',
        emissiveIntensity: 0.2,
      }),
      MAX_ENEMIES * 5,
    );
    this.spawnBubbles.name = 'slime-spawn-bubbles';
    this.spawnBubbles.count = 0;
    this.spawnBubbles.frustumCulled = false;
    this.spawnBubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.spawnBubbles);
    const material: Record<Surface, THREE.Material> = {
      skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }),
      iron: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.72, roughness: 0.4 }),
      leather: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
      ivory: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }),
      dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      eye: new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: '#f7ab37',
        emissiveIntensity: 0.65,
        roughness: 0.22,
      }),
      gel: new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.17,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      }),
    };
    const groups = new Map<string, THREE.BufferGeometry[]>();
    const add = (
      bone: Bone,
      surface: Surface,
      geo: THREE.BufferGeometry,
      color: string,
      pos: XYZ = [0, 0, 0],
      scale: XYZ = [1, 1, 1],
      rotation: XYZ = [0, 0, 0],
    ) => {
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(...pos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      );
      geo.applyMatrix4(transform);
      const p = geo.getAttribute('position'),
        colors = new Float32Array(p.count * 3),
        base = new THREE.Color(color),
        c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const mottling = Math.sin(x * 33 + Math.sin(z * 17)) * Math.sin(y * 41 + z * 13);
        const shade = 0.91 + mottling * (surface === 'skin' || surface === 'gel' ? 0.075 : 0.035);
        c.copy(base).multiplyScalar(shade);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const key = `${bone}:${surface}`;
      const list = groups.get(key) ?? [];
      list.push(geo);
      groups.set(key, list);
    };
    const orb = (
      bone: Bone,
      surface: Surface,
      color: string,
      pos: XYZ,
      scale: XYZ,
      rot: XYZ = [0, 0, 0],
    ) => add(bone, surface, new THREE.SphereGeometry(1, 16, 10), color, pos, scale, rot);
    const band = (
      bone: Bone,
      surface: Surface,
      color: string,
      pos: XYZ,
      radius: number,
      length: number,
      scale: XYZ = [1, 1, 1],
      rot: XYZ = [0, 0, 0],
    ) =>
      add(
        bone,
        surface,
        new THREE.CylinderGeometry(radius, radius * 1.04, length, 16),
        color,
        pos,
        scale,
        rot,
      );
    const curve = (bone: Bone, surface: Surface, color: string, points: XYZ[], radius: number) => {
      const spline = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
      add(bone, surface, new THREE.TubeGeometry(spline, 12, radius, 6, false), color);
    };
    const horn = (bone: Bone, color: string, points: XYZ[], radius: number) => {
      const spline = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
      const frames = spline.computeFrenetFrames(12, false),
        positions: number[] = [],
        indices: number[] = [],
        uv: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const p = spline.getPointAt(i / 12),
          r = radius * Math.pow(1 - i / 12, 0.75) + 0.002;
        for (let j = 0; j <= 10; j++) {
          const a = (j / 10) * Math.PI * 2;
          const v = p
            .clone()
            .addScaledVector(frames.normals[i], Math.cos(a) * r)
            .addScaledVector(frames.binormals[i], Math.sin(a) * r);
          positions.push(v.x, v.y, v.z);
          uv.push(j / 10, i / 12);
          if (i < 12 && j < 10) {
            const k = i * 11 + j;
            indices.push(k, k + 1, k + 11, k + 1, k + 12, k + 11);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(indices);
      g.computeVertexNormals();
      add(bone, 'ivory', g, color);
    };
    const skin = '#658061',
      lightSkin = '#78936d',
      shadowSkin = '#4b654f';
    const metal = '#566169',
      edge = '#91958c',
      leather = '#46352b',
      bone = '#d9cbaa';

    // Orc torso: tapered waist, broad ribcage, trapezius, overlapping pectorals and abdominal planes.
    const torsoProfile = [
      new THREE.Vector2(0.32, 0.92),
      new THREE.Vector2(0.4, 1.1),
      new THREE.Vector2(0.38, 1.3),
      new THREE.Vector2(0.48, 1.52),
      new THREE.Vector2(0.65, 1.75),
      new THREE.Vector2(0.69, 1.91),
      new THREE.Vector2(0.5, 2.02),
      new THREE.Vector2(0.23, 2.14),
      new THREE.Vector2(0.18, 2.2),
    ];
    const profileCurve = new THREE.SplineCurve(torsoProfile);
    const torso = new THREE.LatheGeometry(profileCurve.getPoints(28), 28);
    add('body', 'skin', torso, skin, [0, 0, 0], [1, 1, 0.58]);
    for (const side of [-1, 1]) {
      orb(
        'body',
        'skin',
        lightSkin,
        [side * 0.29, 1.8, 0.27],
        [0.33, 0.2, 0.12],
        [0, 0, side * 0.1],
      );
      orb(
        'body',
        'skin',
        skin,
        [side * 0.35, 1.98, -0.02],
        [0.35, 0.16, 0.27],
        [0, 0, side * -0.3],
      );
      for (let i = 0; i < 3; i++)
        orb(
          'body',
          'skin',
          i % 2 ? skin : lightSkin,
          [side * 0.13, 1.26 + i * 0.15, 0.24],
          [0.145, 0.1, 0.085],
        );
    }
    // A forward-set face with a heavy jaw, eye sockets, sloping brows, nose and lower tusks.
    orb('body', 'skin', skin, [0, 2.34, 0.04], [0.37, 0.43, 0.32]);
    orb('body', 'skin', lightSkin, [0, 2.12, 0.18], [0.32, 0.2, 0.3]);
    orb('body', 'skin', shadowSkin, [0, 2.04, 0.25], [0.25, 0.1, 0.22]);
    orb('body', 'dark', '#1e2821', [0, 2.14, 0.456], [0.22, 0.035, 0.022]);
    orb('body', 'skin', lightSkin, [0, 2.31, 0.345], [0.105, 0.145, 0.11]);
    for (const side of [-1, 1]) {
      orb('body', 'skin', lightSkin, [side * 0.07, 2.25, 0.388], [0.078, 0.06, 0.06]);
      orb('body', 'dark', '#233126', [side * 0.07, 2.233, 0.437], [0.028, 0.017, 0.012]);
      orb(
        'body',
        'skin',
        shadowSkin,
        [side * 0.255, 2.26, 0.27],
        [0.105, 0.15, 0.085],
        [0, 0, side * 0.2],
      );
      orb(
        'body',
        'dark',
        '#1d2b22',
        [side * 0.158, 2.405, 0.301],
        [0.13, 0.08, 0.065],
        [0, 0, side * 0.12],
      );
      orb('body', 'eye', '#efc15b', [side * 0.16, 2.4, 0.35], [0.07, 0.041, 0.027]);
      orb('body', 'dark', '#171c15', [side * 0.16, 2.4, 0.374], [0.012, 0.027, 0.007]);
      orb(
        'body',
        'skin',
        shadowSkin,
        [side * 0.159, 2.469, 0.313],
        [0.17, 0.06, 0.084],
        [0, 0, side * 0.22],
      );
      // Elongated ears with inset ear cartilage.
      orb(
        'body',
        'skin',
        skin,
        [side * 0.41, 2.4, 0.015],
        [0.26, 0.105, 0.055],
        [0, side * -0.25, side * 0.4],
      );
      orb(
        'body',
        'skin',
        shadowSkin,
        [side * 0.43, 2.415, 0.065],
        [0.17, 0.055, 0.015],
        [0, 0, side * 0.4],
      );
      horn(
        'body',
        bone,
        [
          [side * 0.195, 2.075, 0.411],
          [side * 0.225, 2.2, 0.52],
          [side * 0.19, 2.34, 0.51],
        ],
        0.057,
      );
    }
    // Brow scar, iron nose ring, topknot and braided beard.
    curve(
      'body',
      'skin',
      '#a0a180',
      [
        [0.19, 2.54, 0.296],
        [0.21, 2.47, 0.369],
        [0.23, 2.39, 0.344],
      ],
      0.013,
    );
    add('body', 'iron', new THREE.TorusGeometry(0.048, 0.012, 6, 16), '#b6a879', [0, 2.21, 0.459]);
    orb('body', 'dark', '#262c27', [0, 2.68, -0.01], [0.19, 0.15, 0.2]);
    curve(
      'body',
      'dark',
      '#252d28',
      [
        [0, 2.72, 0],
        [0.015, 2.85, -0.05],
        [0.04, 2.79, -0.2],
      ],
      0.07,
    );
    for (const side of [-1, 0, 1])
      curve(
        'body',
        'dark',
        '#293229',
        [
          [side * 0.055, 2.015, 0.345],
          [side * 0.045, 1.94, 0.36],
          [side * 0.025, 1.89, 0.33],
        ],
        0.035,
      );

    // Belt, layered leather skirt, diagonal harness, buckle, rivets.
    band('body', 'leather', leather, [0, 1.13, 0], 0.43, 0.18, [1, 1, 0.69]);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add(
        'body',
        'leather',
        new THREE.CylinderGeometry(0.43, 0.52, 0.38, 4, 1, true, -0.26, 0.52),
        i % 2 ? '#514032' : '#372b25',
        [0, 0.88, 0],
        [1, 1, 0.7],
        [0, a, 0],
      );
    }
    add(
      'body',
      'iron',
      new THREE.TorusGeometry(0.105, 0.025, 4, 4),
      '#a19775',
      [0, 1.13, 0.31],
      [1.2, 0.8, 1],
      [0, 0, Math.PI / 4],
    );
    curve(
      'body',
      'leather',
      '#372e26',
      [
        [-0.49, 1.99, 0.23],
        [-0.2, 1.71, 0.417],
        [0.11, 1.42, 0.316],
        [0.36, 1.18, 0.17],
      ],
      0.062,
    );
    for (let i = 0; i < 7; i++) {
      const a = -1.3 + i * 0.43;
      orb(
        'body',
        'iron',
        edge,
        [Math.sin(a) * 0.434, 1.14, Math.cos(a) * 0.307],
        [0.024, 0.024, 0.016],
      );
    }

    for (const side of [-1, 1]) {
      const arm: Bone = side === -1 ? 'leftArm' : 'rightArm';
      const leg: Bone = side === -1 ? 'leftLeg' : 'rightLeg';
      // Arm origin is the shoulder, with a bent elbow and knuckled closed hand.
      orb(arm, 'skin', skin, [side * 0.06, -0.12, 0], [0.28, 0.32, 0.27]);
      orb(
        arm,
        'skin',
        lightSkin,
        [side * 0.14, -0.38, 0.075],
        [0.205, 0.32, 0.23],
        [0, 0, side * 0.14],
      );
      orb(arm, 'skin', skin, [side * 0.19, -0.63, 0.09], [0.19, 0.17, 0.19]);
      orb(arm, 'skin', skin, [side * 0.2, -0.8, 0.19], [0.175, 0.28, 0.18], [-0.28, 0, 0]);
      orb(arm, 'skin', lightSkin, [side * 0.22, -1.02, 0.27], [0.18, 0.2, 0.17]);
      for (let finger = 0; finger < 4; finger++) {
        orb(
          arm,
          'skin',
          skin,
          [side * 0.22 + (finger - 1.5) * 0.072, -1.09, 0.37],
          [0.045, 0.085, 0.06],
        );
        orb(
          arm,
          'skin',
          lightSkin,
          [side * 0.22 + (finger - 1.5) * 0.072, -1.02, 0.385],
          [0.047, 0.045, 0.033],
        );
      }
      orb(
        arm,
        'skin',
        lightSkin,
        [side * 0.06, -0.97, 0.34],
        [0.075, 0.1, 0.06],
        [0, 0, side * -0.6],
      );
      band(arm, 'leather', leather, [side * 0.2, -0.86, 0.2], 0.19, 0.28, [1, 1, 1], [-0.28, 0, 0]);
      for (const y of [-0.74, -0.96])
        band(arm, 'iron', edge, [side * 0.2, y, 0.2 + (-y - 0.86) * 0.28], 0.197, 0.035);
      // Asymmetric shoulder armor has a rolled rim and bone spikes.
      const pauldron = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
      add(
        arm,
        'iron',
        pauldron,
        metal,
        [side * 0.035, -0.02, 0],
        [side < 0 ? 0.4 : 0.32, 0.26, 0.35],
      );
      add(
        arm,
        'iron',
        new THREE.TorusGeometry(side < 0 ? 0.37 : 0.3, 0.025, 6, 24),
        edge,
        [side * 0.035, -0.08, 0],
        [1, 0.91, 1],
        [Math.PI / 2, 0, 0],
      );
      if (side < 0)
        for (let i = 0; i < 3; i++)
          horn(
            arm,
            bone,
            [
              [-0.1 + i * 0.13, 0.17, 0],
              [-0.19 + i * 0.13, 0.35, -0.03],
              [-0.24 + i * 0.13, 0.47, -0.05],
            ],
            0.07,
          );
      // Legs have separate thighs, knees, calves, wrapped boots and toe caps.
      orb(leg, 'skin', skin, [0, -0.2, 0], [0.245, 0.31, 0.23]);
      orb(leg, 'skin', lightSkin, [0, -0.4, 0.065], [0.18, 0.16, 0.19]);
      orb(leg, 'leather', '#342d27', [0, -0.64, 0.015], [0.18, 0.26, 0.19]);
      orb(leg, 'leather', '#2f2924', [0, -0.86, 0.15], [0.22, 0.12, 0.34]);
      orb(leg, 'iron', metal, [0, -0.52, 0.177], [0.16, 0.22, 0.065]);
      for (const y of [-0.45, -0.72])
        band(leg, 'leather', '#806947', [0, y, 0.015], 0.188, 0.047, [1, 1, 1.03]);
      orb(leg, 'iron', metal, [0, -0.84, 0.35], [0.205, 0.09, 0.15]);
    }

    // Sculpted gel body: flattened underside, asymmetry, lobed skirt and a raised crown.
    const blob = new THREE.SphereGeometry(1, 40, 28);
    const positions = blob.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i),
        a = Math.atan2(z, x);
      const lower = Math.max(0, -y),
        ripple = 1 + Math.cos(a * 5 + 0.4) * 0.085 * (1 - Math.abs(y));
      const width = (1 + lower * 0.34) * ripple;
      positions.setXYZ(
        i,
        x * width * 1.06 + 0.025 * (y + 1) ** 2,
        Math.max(0.055, 0.6 + y * 0.72) + Math.max(0, y) ** 4 * 0.17,
        z * width * 0.95,
      );
    }
    blob.computeVertexNormals();
    add('slime', 'gel', blob, '#539637');
    // Low puddle lobes meet the sculpted skirt rather than floating under it.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      orb(
        'slime',
        'gel',
        '#478132',
        [Math.sin(a) * 0.74, 0.1, Math.cos(a) * 0.66],
        [0.42, 0.12, 0.36],
      );
    }
    for (const side of [-1, 1]) {
      orb(
        'slime',
        'gel',
        '#3b6b2c',
        [side * 0.35, 0.86, 0.88],
        [0.24, 0.23, 0.13],
        [0, side * 0.12, side * -0.14],
      );
      orb('slime', 'dark', '#152f1b', [side * 0.35, 0.84, 0.968], [0.165, 0.175, 0.055]);
      orb('slime', 'eye', '#e3cc60', [side * 0.35, 0.86, 1.014], [0.105, 0.13, 0.037]);
      orb('slime', 'dark', '#162b1b', [side * 0.35, 0.86, 1.052], [0.027, 0.095, 0.013]);
      orb('slime', 'ivory', '#e2edb7', [side * 0.35 - 0.025, 0.906, 1.061], [0.02, 0.028, 0.01]);
      curve(
        'slime',
        'gel',
        '#4b832c',
        [
          [side * 0.16, 1.02, 0.915],
          [side * 0.34, 1.085, 0.93],
          [side * 0.54, 0.97, 0.865],
        ],
        0.065,
      );
    }
    orb('slime', 'dark', '#182b17', [0, 0.42, 1.062], [0.32, 0.145, 0.043]);
    curve(
      'slime',
      'gel',
      '#72aa43',
      [
        [-0.33, 0.43, 1.035],
        [0, 0.285, 1.07],
        [0.33, 0.43, 1.035],
      ],
      0.036,
    );
    for (const x of [-0.22, -0.09, 0.09, 0.22])
      horn(
        'slime',
        '#d6e5a0',
        [
          [x, 0.51, 1.098],
          [x, 0.45, 1.114],
          [x * 0.97, 0.398, 1.1],
        ],
        0.032,
      );
    // Glossy inclusions and bumps break the uniform silhouette without transparency overdraw.
    for (let i = 0; i < 12; i++) {
      const a = i * 2.39996,
        y = 0.3 + (i % 4) * 0.19,
        r = 0.87 - y * 0.13;
      orb(
        'slime',
        'gel',
        i % 2 ? '#6ca546' : '#447a37',
        [Math.sin(a) * r, y, Math.cos(a) * r],
        [0.08 + (i % 3) * 0.025, 0.065, 0.075],
      );
    }

    for (const [key, geometries] of groups) {
      const [bone, surface] = key.split(':') as [Bone, Surface];
      const merged = mergeGeometries(geometries);
      if (!merged) throw new Error(`Failed to build creature part ${key}`);
      for (const g of geometries) g.dispose();
      const mesh = new THREE.InstancedMesh(merged, material[surface], MAX_ENEMIES);
      mesh.name = `creature-${key}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      this.parts.push({ bone, mesh });
    }
  }
  update(enemies: Enemy[], time: number, playerX: number, playerZ: number, camera?: THREE.Camera) {
    if (camera) {
      camera.updateMatrixWorld();
      this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.viewProjection);
    }
    let slimes = 0,
      orcs = 0,
      shadows = 0,
      bubbles = 0;
    for (const e of enemies) {
      if (!e.active) continue;
      this.bounds.center.set(e.x, 1.4, e.z);
      if (camera && !this.frustum.intersectsSphere(this.bounds)) continue;
      const angle = Math.atan2(playerX - e.x, playerZ - e.z),
        stride = time * (e.kind ? 6 : 3) + e.phase;
      const attacking = e.windup > 0;
      const birthWidth = e.kind ? 1 : slimeSpawnScale(e.spawnRemaining),
        birthHeight = e.kind ? 1 : slimeSpawnScale(e.spawnRemaining, true);
      this.joint.position.set(e.x, 0.065, e.z);
      this.joint.rotation.set(0, angle, 0);
      this.joint.scale.setScalar(e.kind ? 0.8 : birthWidth);
      this.joint.updateMatrix();
      this.shadows.setMatrixAt(shadows++, this.joint.matrix);
      this.root.position.set(e.x, 0, e.z);
      this.root.rotation.set(0, angle, 0);
      this.root.scale.set(1, 1, 1);
      if (e.kind) {
        this.root.position.y = Math.abs(Math.sin(stride)) * 0.035;
        this.root.rotation.z = Math.sin(stride) * 0.015;
        this.root.updateMatrix();
        this.transforms.body.copy(this.root.matrix);
        for (const side of [-1, 1]) {
          const arm: Bone = side < 0 ? 'leftArm' : 'rightArm',
            leg: Bone = side < 0 ? 'leftLeg' : 'rightLeg';
          const swing = attacking ? 0 : Math.sin(stride) * side * 0.42;
          const attack =
            attacking && side > 0 ? -1.7 * Math.sin((1 - e.windup / 0.55) * Math.PI) : 0;
          this.joint.position.set(side * 0.66, 1.94, 0);
          this.joint.rotation.set(-swing * 0.7 + attack, 0, side * 0.04);
          this.joint.scale.set(1, 1, 1);
          this.joint.updateMatrix();
          this.transforms[arm].multiplyMatrices(this.root.matrix, this.joint.matrix);
          this.joint.position.set(side * 0.28, 0.98, 0);
          this.joint.rotation.set(swing, 0, side * -0.055);
          this.joint.updateMatrix();
          this.transforms[leg].multiplyMatrices(this.root.matrix, this.joint.matrix);
        }
      } else {
        const bounce = Math.sin(stride),
          windup = attacking ? Math.sin((1 - e.windup / 0.4) * Math.PI) : 0;
        this.root.position.x += Math.sin(angle) * windup * 0.2;
        this.root.position.z += Math.cos(angle) * windup * 0.2;
        this.root.position.y = Math.max(0, bounce) * 0.1 * birthHeight;
        this.root.scale.set(
          (1 + bounce * 0.07 + windup * 0.12) * birthWidth,
          (1 - bounce * 0.09 - windup * 0.16) * birthHeight,
          (1 + bounce * 0.04) * birthWidth,
        );
        this.root.rotation.z = Math.sin(stride * 0.5) * 0.04 * birthHeight;
        this.root.updateMatrix();
        this.transforms.slime.copy(this.root.matrix);
        if (e.spawnRemaining > 0) {
          const progress = 1 - e.spawnRemaining / SLIME_SPAWN_DURATION;
          for (let i = 0; i < 5; i++) {
            const a = e.phase + (i * Math.PI * 2) / 5,
              cycle = (progress * 2.5 + i * 0.2) % 1;
            const pulse = Math.sin(cycle * Math.PI),
              size = pulse * Math.sin(progress * Math.PI);
            this.joint.position.set(
              e.x + Math.sin(a) * 0.65 * birthWidth,
              0.08 + pulse * 0.5 * birthWidth,
              e.z + Math.cos(a) * 0.65 * birthWidth,
            );
            this.joint.rotation.set(0, 0, 0);
            this.joint.scale.setScalar(size);
            this.joint.updateMatrix();
            this.spawnBubbles.setMatrixAt(bubbles++, this.joint.matrix);
          }
        }
      }
      const index = e.kind ? orcs++ : slimes++;
      this.tint.setRGB(e.flash > 0 ? 1.7 : 1, e.flash > 0 ? 1.35 : 1, e.flash > 0 ? 1.2 : 1);
      for (const p of this.parts) {
        if ((p.bone === 'slime') === (e.kind === 0)) {
          this.matrix.copy(this.transforms[p.bone]);
          p.mesh.setMatrixAt(index, this.matrix);
          p.mesh.setColorAt(index, this.tint);
        }
      }
    }
    this.shadows.count = shadows;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.spawnBubbles.count = bubbles;
    this.spawnBubbles.instanceMatrix.needsUpdate = true;
    for (const p of this.parts) {
      p.mesh.count = p.bone === 'slime' ? slimes : orcs;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
}
