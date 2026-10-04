import * as THREE from 'three';

// Hold the incoming free-arm pose across attack clips and their blends.
// Saved matrices are relative to the orc, so turning toward the player still works.
export class OrcFreeArm {
  private bones: THREE.Bone[];
  private poses = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
  private animated = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
  private inverseRoot = new THREE.Matrix4();
  private local = new THREE.Matrix4();
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

  apply() {
    if (!this.holding) return;
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < this.bones.length; i++) this.animated[i].copy(this.bones[i].matrix);
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      this.local
        .copy(bone.parent!.matrixWorld)
        .invert()
        .multiply(this.root.matrixWorld)
        .multiply(this.poses[i]);
      this.local.decompose(bone.position, bone.quaternion, bone.scale);
      bone.updateMatrix();
      bone.updateMatrixWorld(true);
    }
    this.applied = true;
  }
}
