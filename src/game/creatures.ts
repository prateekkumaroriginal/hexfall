import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { slimeSpawnScale } from './simulation';
import { SLIME } from '../config/gameplay';
import { SLIME_ANIMATION } from '../config/rendering';
import { MAX_ENEMIES } from '../config/runtime';
import type { Enemy } from './simulation';
import { buildCreatureGeometries } from './creature-models';
import type { CreatureBone, CreatureSurface } from './creature-models';
import { slimePaint } from './creature-paint';
import { loadOrcAsset, OrcRenderer } from './orc-renderer';
import { OrcLocomotion } from './orc-animation';

type Bone = CreatureBone;
type Surface = CreatureSurface;
type Part = { bone: Bone; mesh: THREE.InstancedMesh };
// Slimes share instanced parts. OrcRenderer owns the rigged orc pool.
export class CreatureRenderer {
  private parts: Part[] = [];
  private disposed = false;
  private riggedOrcs?: OrcRenderer;
  private orcLoading?: Promise<void>;
  private orcLocomotion = new OrcLocomotion();
  private frustum = new THREE.Frustum();
  private viewProjection = new THREE.Matrix4();
  private bounds = new THREE.Sphere(new THREE.Vector3(), 2);
  private shadows: THREE.InstancedMesh;
  private spawnBubbles: THREE.InstancedMesh;
  private root = new THREE.Object3D();
  private joint = new THREE.Object3D();
  private matrix = new THREE.Matrix4();
  private tint = new THREE.Color();
  private slimeTransform = new THREE.Matrix4();
  constructor(private scene: THREE.Scene) {
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
      MAX_ENEMIES * SLIME_ANIMATION.BIRTH_BUBBLES_PER_ENEMY,
    );
    this.spawnBubbles.name = 'slime-spawn-bubbles';
    this.spawnBubbles.count = 0;
    this.spawnBubbles.frustumCulled = false;
    this.spawnBubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.spawnBubbles);
    const material: Record<Surface, THREE.Material> = {
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
        roughness: 0.63,
        metalness: 0,
        clearcoat: 0.18,
        clearcoatRoughness: 0.6,
      }),
    };
    // The engine disposes scene materials; release their shared texture with them.
    material.gel.addEventListener('dispose', () => {
      (material.gel as THREE.MeshStandardMaterial).map?.dispose();
    });
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
    const used = new Set(this.parts.map((part) => part.mesh.material));
    for (const unused of Object.values(material)) {
      if (!used.has(unused)) unused.dispose();
    }
  }
  loadOrc() {
    return (this.orcLoading ??= this.replaceOrc());
  }
  private async replaceOrc() {
    const imported = new OrcRenderer(this.scene, await loadOrcAsset());
    if (this.disposed) {
      imported.dispose();
      return;
    }
    this.riggedOrcs = imported;
  }
  // The engine disposes scene resources. Stop an outstanding load from adding new ones afterward.
  dispose() {
    this.disposed = true;
    this.riggedOrcs?.dispose();
  }
  update(enemies: Enemy[], time: number, playerX: number, playerZ: number, camera?: THREE.Camera) {
    this.riggedOrcs?.beginFrame();
    if (camera) {
      camera.updateMatrixWorld();
      this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.viewProjection);
    }
    let slimes = 0,
      shadows = 0,
      bubbles = 0;
    for (let slot = 0; slot < enemies.length; slot++) {
      const e = enemies[slot];
      if (!e.active) {
        this.orcLocomotion.reset(slot);
        continue;
      }
      if (e.kind && this.riggedOrcs) this.orcLocomotion.update(slot, e, time);
      this.bounds.center.set(e.x, 1.4, e.z);
      if (camera && !this.frustum.intersectsSphere(this.bounds)) continue;
      const angle = Math.atan2(playerX - e.x, playerZ - e.z),
        stride = time * 3 + e.phase;
      const attacking = e.windup > 0;
      if (e.kind && this.riggedOrcs) {
        this.riggedOrcs.update(
          slot,
          e,
          angle,
          this.orcLocomotion.phase,
          this.orcLocomotion.walk,
          Math.hypot(playerX - e.x, playerZ - e.z),
          time,
        );
      }
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
      if (!e.kind) {
        const bounce = Math.sin(stride),
          windup = attacking ? Math.sin((1 - e.windup / SLIME.ATTACK_WINDUP_SECONDS) * Math.PI) : 0;
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
        this.slimeTransform.copy(this.root.matrix);
        if (e.spawnRemaining > 0) {
          const elapsed = SLIME.SPAWN_DURATION_SECONDS - e.spawnRemaining,
            progress = elapsed / SLIME.SPAWN_DURATION_SECONDS;
          for (let i = 0; i < SLIME_ANIMATION.BIRTH_BUBBLES_PER_ENEMY; i++) {
            const a = e.phase + (i * Math.PI * 2) / SLIME_ANIMATION.BIRTH_BUBBLES_PER_ENEMY,
              cycle =
                (elapsed / SLIME_ANIMATION.BIRTH_BUBBLE_PERIOD_SECONDS +
                  i / SLIME_ANIMATION.BIRTH_BUBBLES_PER_ENEMY) %
                1;
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
      if (e.kind) continue;
      const index = slimes++;
      this.tint.setRGB(e.flash > 0 ? 1.7 : 1, e.flash > 0 ? 1.35 : 1, e.flash > 0 ? 1.2 : 1);
      for (const p of this.parts) {
        this.matrix.copy(this.slimeTransform);
        p.mesh.setMatrixAt(index, this.matrix);
        p.mesh.setColorAt(index, this.tint);
      }
    }
    this.shadows.count = shadows;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.spawnBubbles.count = bubbles;
    this.spawnBubbles.instanceMatrix.needsUpdate = true;
    for (const p of this.parts) {
      p.mesh.count = slimes;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
}
