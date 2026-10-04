import * as THREE from 'three';
import data from './orc-blender-data.json';

// Exported by Blender from the editable asset, already expressed in each joint's local frame.
// The game decodes these shared buffers once and never rebuilds or simplifies the orc.
export const ORC_JOINT_PIVOTS = data.pivots;

export function buildBlenderOrcGeometries() {
  const groups = new Map<string, THREE.BufferGeometry[]>();
  const bytes = (source: string) => Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  for (const [key, source] of Object.entries(data.batches)) {
    const packedPositions = new Int16Array(bytes(source.positions).buffer);
    const packedUV = new Int16Array(bytes(source.uv).buffer);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        Array.from(packedPositions, (v) => v / 10000),
        3,
      ),
    );
    geometry.setAttribute(
      'normal',
      new THREE.Int8BufferAttribute(new Int8Array(bytes(source.normals).buffer), 3, true),
    );
    geometry.setAttribute('color', new THREE.Uint8BufferAttribute(bytes(source.colors), 3, true));
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        Array.from(packedUV, (v) => v / 10000),
        2,
      ),
    );
    const indices = bytes(source.indices).buffer;
    geometry.setIndex(
      (data as { indexComponentType?: number }).indexComponentType === 5125
        ? new THREE.Uint32BufferAttribute(new Uint32Array(indices), 1)
        : new THREE.Uint16BufferAttribute(new Uint16Array(indices), 1),
    );
    // Match the slime's float attributes for the existing merge and inspection paths.
    for (const name of ['normal', 'color']) {
      const attribute = geometry.getAttribute(name);
      const values = Array.from({ length: attribute.count * 3 }, (_, i) =>
        i % 3 === 0
          ? attribute.getX(Math.floor(i / 3))
          : i % 3 === 1
            ? attribute.getY(Math.floor(i / 3))
            : attribute.getZ(Math.floor(i / 3)),
      );
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, 3));
    }
    groups.set(key, [geometry]);
  }
  return groups;
}
