import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAX_ENEMIES, SLIME_SPAWN_DURATION, slimeSpawnScale } from './simulation';
import type { Enemy } from './simulation';
import { buildCreatureGeometries } from './creature-models';
import type { CreatureBone, CreatureSurface } from './creature-models';
import { slimePaint, surfacePaint } from './creature-paint';

type Bone = CreatureBone;
type Surface = CreatureSurface;
type Part = { bone: Bone; mesh: THREE.InstancedMesh };

// Preserve the original 2.5 pulses per 1.4 seconds independently of birth duration.
const SLIME_BIRTH_BUBBLE_PERIOD = 0.56;

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
      skin: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.84,
        map: surfacePaint('skin'),
      }),
      iron: new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.35,
        roughness: 0.64,
        map: surfacePaint('iron'),
      }),
      leather: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        map: surfacePaint('leather'),
      }),
      ivory: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }),
      dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      eye: new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: '#f7ab37',
        emissiveIntensity: 0.18,
        roughness: 0.22,
      }),
      gel: new THREE.MeshPhysicalMaterial({
        map: slimePaint(),
        vertexColors: true,
        roughness: 0.17,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      }),
    };
    // Material disposal is shared by the existing scene cleanup path.
    for (const surface of ['skin', 'iron', 'leather', 'gel'] as const) {
      material[surface].addEventListener('dispose', () => {
        (material[surface] as THREE.MeshStandardMaterial).map?.dispose();
      });
    }
    const groups = buildCreatureGeometries();

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
          const elapsed = SLIME_SPAWN_DURATION - e.spawnRemaining,
            progress = elapsed / SLIME_SPAWN_DURATION;
          for (let i = 0; i < 5; i++) {
            const a = e.phase + (i * Math.PI * 2) / 5,
              cycle = (elapsed / SLIME_BIRTH_BUBBLE_PERIOD + i * 0.2) % 1;
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
