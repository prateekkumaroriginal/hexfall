import * as THREE from 'three';
import { reusePackedSurfaceSample } from './surface-material';

export type TreeTextures = {
  barkColor: THREE.Texture;
  barkNormal: THREE.Texture;
  barkSurface: THREE.Texture;
  leavesColor: THREE.Texture;
  leavesNormal: THREE.Texture;
  ready: { value: number };
};

export function loadTreeTextures(manager?: THREE.LoadingManager): TreeTextures {
  const loader = new THREE.TextureLoader(manager);
  const ready = { value: 0 };
  let loaded = 0;
  const load = (name: string, colorSpace: THREE.ColorSpace) => {
    const texture = loader.load(
      `/textures/trees/${name}`,
      () => {
        if (++loaded === 5) ready.value = 1;
      },
      undefined,
      (error: unknown) => console.error(`Tree texture ${name} could not load.`, error),
    );
    texture.colorSpace = colorSpace;
    texture.anisotropy = 4;
    if (name.startsWith('bark')) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  };
  return {
    barkColor: load('bark-color.jpg', THREE.SRGBColorSpace),
    barkNormal: load('bark-normal.jpg', THREE.NoColorSpace),
    barkSurface: load('bark-surface.jpg', THREE.NoColorSpace),
    leavesColor: load('leaves-color.png', THREE.SRGBColorSpace),
    leavesNormal: load('leaves-normal.jpg', THREE.NoColorSpace),
    ready,
  };
}

export function createTreeMaterials(wind: { value: number }, textures?: TreeTextures) {
  const bark = new THREE.MeshStandardMaterial({
    roughness: 1,
    vertexColors: true,
    ...(textures && {
      map: textures.barkColor,
      normalMap: textures.barkNormal,
      roughnessMap: textures.barkSurface,
      aoMap: textures.barkSurface,
      normalScale: new THREE.Vector2(0.9, 0.9),
      aoMapIntensity: 1.2,
    }),
  });
  const foliage = new THREE.MeshStandardMaterial({
    roughness: 0.95,
    vertexColors: true,
    side: THREE.DoubleSide,
    alphaTest: 0.4,
    ...(textures && {
      map: textures.leavesColor,
      normalMap: textures.leavesNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
  });
  if (textures)
    bark.userData['treeTexturesReady'] = foliage.userData['treeTexturesReady'] = textures.ready;
  for (const [material, leaves] of [
    [bark, false],
    [foliage, true],
  ] as const) {
    material.onBeforeCompile = (shader) => {
      if (!leaves && textures) reusePackedSurfaceSample(shader);
      shader.uniforms['treeTime'] = wind;
      shader.vertexShader =
        `uniform float treeTime;\n${leaves ? 'attribute float leafFlex;\nvarying vec3 leafWorldNormal;\n' : ''}` +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec3 treeOrigin = instanceMatrix[3].xyz;
        float phase = treeTime * 1.15 + treeOrigin.x * .7 + treeOrigin.z * .4;
        float bend = smoothstep(2.3, 7.5, position.y);
        transformed.x += sin(phase) * bend * .05;
        transformed.z += cos(phase * .8) * bend * .03;
        ${leaves ? 'transformed.y += sin(treeTime * 2.4 + position.x * 4.1 + position.z * 3.3 + phase) * leafFlex * .012;' : ''}
      `,
      );
      if (leaves) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <defaultnormal_vertex>',
          '#include <defaultnormal_vertex>\nleafWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);',
        );
        shader.fragmentShader = 'varying vec3 leafWorldNormal;\n' + shader.fragmentShader;
        // Light passes through thin leaves, keeping the underside readable against the sky.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `
          float leafBacklight = pow(max(dot(-normalize(leafWorldNormal) * faceDirection, normalize(vec3(-18., 30., -15.))), 0.0), 2.0);
          outgoingLight += diffuseColor.rgb * (.12 + leafBacklight * .8);
          #include <opaque_fragment>
        `,
        );
      }
    };
    material.customProgramCacheKey = () =>
      leaves ? 'photographic-leaves-v1' : 'photographic-bark-v2';
  }
  return { bark, foliage };
}
