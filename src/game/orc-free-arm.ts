import * as THREE from 'three';
import type { OrcRig } from './orc-rig';

// Keep the incoming free-arm pose with a tiny shoulder sway during attacks.
// Saved matrices are relative to the orc, so turning toward the player still works.
export class OrcFreeArm {
  private joints: {
    bone: THREE.Bone;
    parent: THREE.Object3D;
    pose: THREE.Matrix4;
    animated: THREE.Matrix4;
  }[];
  private shoulderPose: THREE.Matrix4;
  private inverseRoot = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private motion = new THREE.Matrix4();
  private pivot = new THREE.Vector3();
  private rotatedPivot = new THREE.Vector3();
  private sway = new THREE.Euler();
  private holding = false;
  private applied = false;

  constructor(
    private root: THREE.Group,
    bindings: OrcRig['freeArm'],
  ) {
    this.shoulderPose = new THREE.Matrix4();
    this.joints = bindings.map(({ bone, parent }, i) => ({
      bone,
      parent,
      pose: i === 0 ? this.shoulderPose : new THREE.Matrix4(),
      animated: new THREE.Matrix4(),
    }));
  }

  restore() {
    if (!this.applied) return;
    for (const { bone, animated } of this.joints) {
      animated.decompose(bone.position, bone.quaternion, bone.scale);
      bone.updateMatrix();
    }
    this.applied = false;
  }

  capture(attacking: boolean) {
    if (!attacking) {
      this.holding = false;
      return;
    }
    if (this.holding) return;
    this.root.updateMatrixWorld(true);
    this.inverseRoot.copy(this.root.matrixWorld).invert();
    for (const { bone, pose } of this.joints)
      pose.multiplyMatrices(this.inverseRoot, bone.matrixWorld);
    this.holding = true;
  }

  apply(attackTime: number) {
    if (!this.holding) return;
    const t = THREE.MathUtils.clamp(attackTime, 0, 1);
    const envelope = Math.sin(Math.PI * t) ** 2;
    const impact = Math.exp(-(((t - 0.55) / 0.12) ** 2));
    this.sway.set(
      envelope * (0.012 * Math.sin(2 * Math.PI * t) + 0.009 * impact),
      0,
      envelope * 0.005 * Math.sin(Math.PI * t),
    );
    this.pivot.setFromMatrixPosition(this.shoulderPose);
    this.motion.makeRotationFromEuler(this.sway);
    this.rotatedPivot.copy(this.pivot).applyMatrix4(this.motion);
    this.motion.setPosition(this.rotatedPivot.subVectors(this.pivot, this.rotatedPivot));
    this.root.updateMatrixWorld(true);
    for (const { bone, animated } of this.joints) animated.copy(bone.matrix);
    for (const { bone, parent, pose } of this.joints) {
      this.local
        .copy(parent.matrixWorld)
        .invert()
        .multiply(this.root.matrixWorld)
        .multiply(this.motion)
        .multiply(pose);
      this.local.decompose(bone.position, bone.quaternion, bone.scale);
      bone.updateMatrix();
      bone.updateMatrixWorld(true);
    }
    this.applied = true;
  }
}
