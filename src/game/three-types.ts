import * as THREE from 'three';

// Three's instanceof declarations widen generic parameters to any.
// These guards retain its normal geometry, material and event types.
export function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh;
}
export function isSkinnedMesh(object: THREE.Object3D): object is THREE.SkinnedMesh {
  return object instanceof THREE.SkinnedMesh;
}
export function isInstancedMesh(object: THREE.Object3D): object is THREE.InstancedMesh {
  return object instanceof THREE.InstancedMesh;
}
export function isPoints(object: THREE.Object3D): object is THREE.Points {
  return object instanceof THREE.Points;
}
export function isGroup(object: THREE.Object3D): object is THREE.Group {
  return object instanceof THREE.Group;
}
export function isBone(object: THREE.Object3D | undefined): object is THREE.Bone {
  return object instanceof THREE.Bone;
}
