import * as THREE from 'three';

const prepared = new WeakSet<THREE.MeshStandardMaterial>();

/** Correct the imported skin finish without changing armor, UVs, or the rig. */
export function prepareOrcSkinMaterial(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial) || prepared.has(material)) return;
  prepared.add(material);
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.vertexShader = `varying vec3 orcRestPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\norcRestPosition = position;',
    );
    shader.fragmentShader = `varying vec3 orcRestPosition;\n${shader.fragmentShader}`
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Green skin only: leather, metal, tusks, and hair retain their PBR maps.
        float orcSkin = smoothstep(diffuseColor.r * 1.005, diffuseColor.r * 1.15, diffuseColor.g)
          * smoothstep(diffuseColor.b * 1.1, diffuseColor.b * 1.5, diffuseColor.g);
        // Use bind-pose coordinates so the correction follows the animated arm.
        float orcArm = smoothstep(0.48, 0.78, orcRestPosition.x)
          * smoothstep(0.65, 0.85, orcRestPosition.y)
          * (1.0 - smoothstep(2.05, 2.3, orcRestPosition.y));
        // Lift the darker arm albedo toward the torso's olive tone, retaining detail.
        vec3 orcArmColor = pow(max(diffuseColor.rgb, vec3(0.0001)), vec3(0.8))
          * vec3(1.1, 1.0, 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, orcArmColor, orcSkin * orcArm);
        roughnessFactor = mix(roughnessFactor, max(roughnessFactor, 0.72), orcSkin);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - orcSkin;',
      );
  };
  material.customProgramCacheKey = () => 'orc-skin-finish-v1';
  material.needsUpdate = true;
}
