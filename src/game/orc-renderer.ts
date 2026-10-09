import { isGroup, isMesh, isSkinnedMesh } from './three-types';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateOrcAsset, validateOrcRig } from './orc-rig';
import type { OrcAsset } from './orc-rig';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createOrcEyeGeometry, OrcEyes } from './orc-eyes';
import { OrcFreeArm } from './orc-free-arm';
import { prepareOrcSkinMaterial } from './orc-material';
import type { Enemy } from './simulation';
import { ORC, PLAYER } from '../config/gameplay';
import { ORC_ANIMATION } from '../config/rendering';

export const ORC_MODEL_URL = '/models/orc-rigged.glb';
export const ORC_MODEL_HEIGHT = 2.9;

function blinkPulse(time: number, center: number, duration: number) {
  const t = (time - center) / duration + 0.5;
  return t > 0 && t < 1 ? Math.sin(t * Math.PI) ** 2 : 0;
}

export async function loadOrcAsset() {
  const asset = await new GLTFLoader().loadAsync(ORC_MODEL_URL);
  return validateOrcAsset(asset);
}

type Orc = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  punch: THREE.AnimationAction;
  eyes: OrcEyes;
  freeArm: OrcFreeArm;
  influences: number[];
  blink: number;
  jaw: number;
  brow: number;
};

// Geometry and textures are shared. Each pooled orc has its own skeleton and pose.
export class OrcRenderer {
  private orcs: (Orc | undefined)[] = [];
  private eyeGeometry = createOrcEyeGeometry();
  private eyeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  private eyeTarget = new THREE.Vector3();
  constructor(
    private scene: THREE.Scene,
    private asset: OrcAsset,
  ) {
    validateOrcRig(asset.scene);
    asset.scene.traverse((object) => {
      if (isSkinnedMesh(object))
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          prepareOrcSkinMaterial(material);
    });
  }
  beginFrame() {
    for (const orc of this.orcs) if (orc) orc.root.visible = false;
  }
  update(
    slot: number,
    enemy: Enemy,
    angle: number,
    phase: number,
    walking: number,
    targetDistance = Infinity,
    time = 0,
  ) {
    let orc = this.orcs[slot];
    if (!orc) {
      const root = clone(this.asset.scene);
      if (!isGroup(root)) throw new Error('Invalid cloned orc root');
      const rig = validateOrcRig(root);
      root.name = `orc-${slot}`;
      root.traverse((object) => {
        if (isSkinnedMesh(object)) {
          object.name = `creature-orc-${slot}`;
          object.frustumCulled = false;
        }
      });
      const mixer = new THREE.AnimationMixer(root);
      const action = (name: keyof OrcAsset['clips']) =>
        mixer.clipAction(this.asset.clips[name]).play();
      orc = {
        root,
        mixer,
        idle: action('Idle'),
        walk: action('Walk'),
        punch: action('Punch'),
        eyes: new OrcEyes(rig, slot, this.eyeGeometry, this.eyeMaterial),
        freeArm: new OrcFreeArm(root, rig.freeArm),
        influences: rig.influences,
        blink: rig.expressions.Blink,
        jaw: rig.expressions.JawOpen,
        brow: rig.expressions.BrowTense,
      };
      this.orcs[slot] = orc;
      this.scene.add(root);
    }
    orc.root.visible = true;
    orc.root.position.set(enemy.x, 0, enemy.z);
    orc.root.rotation.set(0, angle, 0);
    const attacking =
      enemy.windup > 0 || enemy.cooldown > ORC.ATTACK_COOLDOWN_SECONDS - ORC.PUNCH_RECOVERY_SECONDS;
    orc.freeArm.capture(attacking);
    orc.freeArm.restore();
    const punchDuration = orc.punch.getClip().duration;
    const impactTime = ORC_ANIMATION.PUNCH_IMPACT_SECONDS;
    // Map each gameplay phase onto the clip so the strike always matches damage.
    const attackTime =
      enemy.windup > 0
        ? THREE.MathUtils.clamp(1 - enemy.windup / ORC.ATTACK_WINDUP_SECONDS, 0, 1) * impactTime
        : impactTime +
          THREE.MathUtils.clamp(
            (ORC.ATTACK_COOLDOWN_SECONDS - enemy.cooldown) /
              Math.max(ORC.PUNCH_RECOVERY_SECONDS, Number.EPSILON),
            0,
            1,
          ) *
            (punchDuration - impactTime);
    const attackWeight = attacking
      ? THREE.MathUtils.smoothstep(attackTime, 0, ORC_ANIMATION.PUNCH_BLEND_IN_SECONDS) *
        (1 -
          THREE.MathUtils.smoothstep(
            attackTime,
            ORC_ANIMATION.PUNCH_BLEND_OUT_SECONDS,
            punchDuration,
          ))
      : 0;
    const walkWeight = walking * (1 - attackWeight);
    orc.idle.setEffectiveWeight((1 - walking) * (1 - attackWeight));
    orc.walk.setEffectiveWeight(walkWeight);
    orc.idle.time = (time + slot * 0.37) % orc.idle.getClip().duration;
    orc.walk.time = (phase / (Math.PI * 2)) * orc.walk.getClip().duration;
    orc.punch.setEffectiveWeight(attackWeight);
    orc.punch.time = THREE.MathUtils.clamp(attackTime, 0, punchDuration - 0.001);
    orc.mixer.update(0);
    orc.freeArm.apply(attackTime);
    // Simulation time freezes breathing/blinks while paused. Each orc has its own rhythm.
    const expressionTime = time + slot * 0.73;
    const blinkTime = expressionTime % 9.1;
    const exertion =
      enemy.windup > 0
        ? THREE.MathUtils.smoothstep(attackTime, 0, 0.45)
        : 1 - THREE.MathUtils.smoothstep(attackTime, impactTime, impactTime + 0.2);
    const influences = orc.influences;
    const blink = Math.max(
      blinkPulse(blinkTime, 1.9, 0.18),
      blinkPulse(blinkTime, 6.25, 0.16),
      blinkPulse(blinkTime, 6.51, 0.14) * 0.75,
    );
    influences[orc.blink] = blink;
    // Keep the jaw closed through the wind-up, strike, and recovery.
    influences[orc.jaw] = attacking ? 0 : 0.035 + 0.025 * Math.sin(expressionTime * 1.7);
    influences[orc.brow] = 0.1 + 0.05 * Math.sin(expressionTime * 0.9) + 0.65 * exertion;
    orc.root.updateMatrixWorld(true);
    this.eyeTarget.set(
      0,
      PLAYER.EYE_HEIGHT_UNITS,
      Number.isFinite(targetDistance) ? targetDistance : 10000,
    );
    orc.root.localToWorld(this.eyeTarget);
    orc.eyes.update(this.eyeTarget, blink);
    orc.root.updateMatrixWorld(true);
  }
  dispose() {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    const skeletons = new Set<THREE.Skeleton>();
    geometries.add(this.eyeGeometry);
    materials.add(this.eyeMaterial);
    const collect = (root: THREE.Object3D) =>
      root.traverse((object) => {
        if (isMesh(object)) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
          if (isSkinnedMesh(object)) skeletons.add(object.skeleton);
        }
      });
    collect(this.asset.scene);
    for (const orc of this.orcs) {
      if (!orc) continue;
      orc.mixer.stopAllAction();
      orc.mixer.uncacheRoot(orc.root);
      collect(orc.root);
      orc.root.removeFromParent();
    }
    const textures = new Set<THREE.Texture>();
    for (const material of materials) {
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    for (const skeleton of skeletons) skeleton.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) {
      texture.dispose();
      const data: unknown = texture.source.data;
      if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) data.close();
    }
    this.orcs = [];
  }
}
