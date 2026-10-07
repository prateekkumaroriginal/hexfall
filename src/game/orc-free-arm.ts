import * as THREE from 'three';

// Keep the incoming free-arm pose with a tiny shoulder sway during attacks.
// Saved matrices are relative to the orc, so turning toward the player still works.
export class OrcFreeArm {
  private bones: THREE.Bone[];
  private poses = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
  private animated = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
  private inverseRoot = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private motion = new THREE.Matrix4();
  private pivot = new THREE.Vector3();
  private rotatedPivot = new THREE.Vector3();
  private sway = new THREE.Euler();
  private holding = false;
  private applied = false;

  constructor(private root: THREE.Group) {
    this.bones = ['leftUpperArm', 'leftForearm', 'leftHand'].map(
      (name) => root.getObjectByName(name) as THREE.Bone,
    );
  }

  restore() {
    if (!this.applied) return;
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      this.animated[i].decompose(bone.position, bone.quaternion, bone.scale);
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
    for (let i = 0; i < this.bones.length; i++)
      this.poses[i].multiplyMatrices(this.inverseRoot, this.bones[i].matrixWorld);
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
    this.pivot.setFromMatrixPosition(this.poses[0]);
    this.motion.makeRotationFromEuler(this.sway);
    this.rotatedPivot.copy(this.pivot).applyMatrix4(this.motion);
    this.motion.setPosition(this.rotatedPivot.subVectors(this.pivot, this.rotatedPivot));
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < this.bones.length; i++) this.animated[i].copy(this.bones[i].matrix);
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      this.local
        .copy(bone.parent!.matrixWorld)
        .invert()
        .multiply(this.root.matrixWorld)
        .multiply(this.motion)
        .multiply(this.poses[i]);
      this.local.decompose(bone.position, bone.quaternion, bone.scale);
      bone.updateMatrix();
      bone.updateMatrixWorld(true);
    }
    this.applied = true;
  }
}
