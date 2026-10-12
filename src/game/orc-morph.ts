import * as THREE from 'three';

const prepared = new WeakSet<THREE.MeshStandardMaterial>();

// Most vertices have no facial offset. Skip only offsets that are exactly zero in every pose.
export function prepareOrcMorphGeometry(geometry: THREE.BufferGeometry) {
  if (!geometry.morphTargetsRelative || geometry.hasAttribute('orcMorphActive')) return false;
  const position = geometry.getAttribute('position');
  const offsets = [
    ...(geometry.morphAttributes.position ?? []),
    ...(geometry.morphAttributes.normal ?? []),
  ];
  if (!position || !offsets.length) return false;
  const active = new Uint8Array(position.count);
  for (const attribute of offsets) {
    if (attribute.count !== position.count || attribute.itemSize !== 3)
      throw new Error('Orc morph dimensions do not match its vertices');
    for (let i = 0; i < position.count; i++) {
      if (attribute.getX(i) !== 0 || attribute.getY(i) !== 0 || attribute.getZ(i) !== 0)
        active[i] = 1;
    }
  }
  geometry.setAttribute('orcMorphActive', new THREE.Uint8BufferAttribute(active, 1));
  return true;
}

export function prepareOrcMorphMaterial(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial) || prepared.has(material)) return;
  prepared.add(material);
  const compile = material.onBeforeCompile.bind(material),
    key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.vertexShader = `attribute float orcMorphActive;\n${shader.vertexShader}`
      .replace(
        '#include <morphnormal_vertex>',
        'if (orcMorphActive > 0.5) {\n#include <morphnormal_vertex>\n}',
      )
      .replace(
        '#include <morphtarget_vertex>',
        'if (orcMorphActive > 0.5) {\n#include <morphtarget_vertex>\n}',
      );
  };
  material.customProgramCacheKey = () => `${key}:zero-morph-offsets-v1`;
  material.needsUpdate = true;
}
