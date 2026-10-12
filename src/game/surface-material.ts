import * as THREE from 'three';
import type { PackedSurfaceTextures } from './texture-packing';

// Both maps use the same packed texture, UV channel and transform. Reuse its RGB fetch.
export function reusePackedSurfaceSample(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <aomap_fragment>',
    THREE.ShaderChunk.aomap_fragment.replace('texture2D( aoMap, vAoMapUv ).r', 'texelRoughness.r'),
  );
}

export function usePackedSurfaceMaterial(
  material: THREE.MeshStandardMaterial,
  textures: PackedSurfaceTextures,
) {
  material.map = material.roughnessMap = textures.color;
  material.normalMap = material.aoMap = textures.normal;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <roughnessmap_fragment>',
        THREE.ShaderChunk.roughnessmap_fragment.replace('texelRoughness.g', 'texelRoughness.a'),
      )
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
          'vec4 packedNormalSample = texture2D( normalMap, vNormalMapUv );\nvec3 mapN = packedNormalSample.xyz * 2.0 - 1.0;',
        ),
      )
      .replace(
        '#include <aomap_fragment>',
        THREE.ShaderChunk.aomap_fragment.replace(
          'texture2D( aoMap, vAoMapUv ).r',
          'packedNormalSample.a',
        ),
      );
  };
  material.customProgramCacheKey = () => 'color-roughness-normal-occlusion-v1';
  material.needsUpdate = true;
}

// Opaque imported creatures use the same UVs for all four maps. Keep their skin finish hooks.
export function applyPackedMetallicSurfaceMaterial(
  material: THREE.MeshStandardMaterial,
  textures: PackedSurfaceTextures,
) {
  const compile = material.onBeforeCompile.bind(material),
    key = material.customProgramCacheKey();
  material.map = material.roughnessMap = textures.color;
  material.normalMap = material.metalnessMap = textures.normal;
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <roughnessmap_fragment>',
        THREE.ShaderChunk.roughnessmap_fragment
          .replace('texture2D( roughnessMap, vRoughnessMapUv )', 'sampledDiffuseColor')
          .replace('texelRoughness.g', 'texelRoughness.a'),
      )
      .replace(
        '#include <metalnessmap_fragment>',
        THREE.ShaderChunk.metalnessmap_fragment
          .replace(
            'vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );',
            'vec4 packedOrcNormal = texture2D( normalMap, vNormalMapUv );\nvec4 texelMetalness = packedOrcNormal;',
          )
          .replace('texelMetalness.b', 'texelMetalness.a'),
      )
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'texture2D( normalMap, vNormalMapUv ).xyz',
          'packedOrcNormal.xyz',
        ),
      );
  };
  material.customProgramCacheKey = () => `${key}:color-roughness-normal-metallic-v1`;
  material.needsUpdate = true;
}

const prepared = new WeakSet<THREE.MeshStandardMaterial>();
const pointLighting = THREE.ShaderChunk.lights_fragment_begin.replace(
  '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
  '\t\tif ( directLight.visible ) { RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight ); }',
);

export function skipInactivePointLighting(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial) || prepared.has(material)) return;
  prepared.add(material);
  const compile = material.onBeforeCompile.bind(material),
    key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    // Beyond the point light's cutoff its contribution is exactly zero.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      pointLighting,
    );
  };
  material.customProgramCacheKey = () => `${key}:inactive-point-light-v1`;
  material.needsUpdate = true;
}
