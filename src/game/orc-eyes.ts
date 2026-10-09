import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { required } from '../lib/assert';
import type { OrcRig } from './orc-rig';

// One shared vertex-colored mesh per eye, including the iris and pupil.
export function createOrcEyeGeometry() {
  const globe = new THREE.SphereGeometry(1, 24, 16);
  const iris = new THREE.SphereGeometry(1.012, 24, 4, 0, Math.PI * 2, 0, 0.35);
  const pupil = new THREE.SphereGeometry(1.018, 20, 3, 0, Math.PI * 2, 0, 0.23);
  iris.rotateX(Math.PI / 2);
  pupil.rotateX(Math.PI / 2);
  for (const [geometry, color] of [
    [globe, '#a98d18'],
    [iris, '#544813'],
    [pupil, '#0d100c'],
  ] as const) {
    const tint = new THREE.Color(color);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const combined = required(mergeGeometries([globe, iris, pupil]), 'Failed to build orc eyes');
  for (const geometry of [globe, iris, pupil]) geometry.dispose();
  return combined;
}

export class OrcEyes {
  private eyes: { group: THREE.Group; surface: THREE.Mesh }[] = [];
  constructor(
    rig: Pick<OrcRig, 'head' | 'headInverse' | 'eyeCenters'>,
    slot: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
  ) {
    const anchor = new THREE.Group();
    anchor.name = `orc-eye-anchor-${slot}`;
    anchor.matrixAutoUpdate = false;
    anchor.matrix.copy(rig.headInverse);
    rig.head.add(anchor);
    const centers = rig.eyeCenters;
    for (let eyeIndex = 0; eyeIndex < 2; eyeIndex++) {
      const eye = new THREE.Group();
      eye.name = `orc-eye-${slot}-${eyeIndex}`;
      eye.position.fromArray(centers, eyeIndex * 3);
      // Recess spherical eyes beneath the sculpted brows and eyelids.
      eye.position.z -= 0.016;
      eye.position.y += 0.006;
      const surface = new THREE.Mesh(geometry, material);
      surface.name = `creature-orc-eye-${slot}-${eyeIndex}`;
      surface.scale.setScalar(0.03);
      surface.frustumCulled = false;
      eye.add(surface);
      anchor.add(eye);
      this.eyes.push({ group: eye, surface });
    }
  }
  update(target: THREE.Vector3, blink: number) {
    for (const { group, surface } of this.eyes) {
      group.lookAt(target);
      surface.scale.y = 0.03 * Math.max(0.01, 1 - blink);
      surface.visible = blink < 0.97;
    }
  }
}
