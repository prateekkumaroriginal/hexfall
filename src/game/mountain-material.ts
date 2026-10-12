import * as THREE from 'three';
import type { PackedSurfaceTextures } from './texture-packing';

export type MountainRockTextures = {
  color: THREE.Texture;
  normal: THREE.Texture;
  surface: THREE.Texture;
  ready: { value: number };
  packed?: PackedSurfaceTextures;
};

export function loadMountainRockTextures(manager?: THREE.LoadingManager): MountainRockTextures {
  const loader = new THREE.TextureLoader(manager);
  const ready = { value: 0 };
  let loaded = 0;
  const load = (name: string, colorSpace: THREE.ColorSpace) => {
    const texture = loader.load(
      `/textures/mountains/${name}.jpg`,
      () => {
        loaded++;
        if (loaded === 3) ready.value = 1;
      },
      undefined,
      (error: unknown) => console.error(`Mountain rock texture ${name} could not load.`, error),
    );
    texture.colorSpace = colorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  };
  return {
    color: load('rock-color', THREE.SRGBColorSpace),
    normal: load('rock-normal', THREE.NoColorSpace),
    surface: load('rock-ao-roughness', THREE.NoColorSpace),
    ready,
  };
}

export function createMountainMaterial(textures?: MountainRockTextures) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  if (!textures) return material;
  material.userData['rockTexturesReady'] = textures.ready;
  material.onBeforeCompile = (shader) => {
    const packed = textures.packed;
    shader.uniforms['mountainRockColor'] = { value: packed?.color ?? textures.color };
    shader.uniforms['mountainRockNormal'] = { value: packed?.normal ?? textures.normal };
    if (!packed) shader.uniforms['mountainRockSurface'] = { value: textures.surface };
    shader.uniforms['mountainRockReady'] = textures.ready;
    const varyings = 'varying vec3 mountainPosition;\nvarying vec3 mountainSurfaceNormal;\n';
    shader.vertexShader = varyings + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <defaultnormal_vertex>',
      `
      #include <defaultnormal_vertex>
      mountainSurfaceNormal = inverseTransformDirection(transformedNormal, viewMatrix);
    `,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec4 mountainVertex = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mountainVertex = instanceMatrix * mountainVertex;
      #endif
      mountainPosition = (modelMatrix * mountainVertex).xyz;
    `,
    );
    shader.fragmentShader =
      varyings +
      `
      uniform sampler2D mountainRockColor;
      uniform sampler2D mountainRockNormal;
      ${packed ? '' : 'uniform sampler2D mountainRockSurface;'}
      uniform float mountainRockReady;
      float mountainHash(vec3 p) {
        p = fract(p * .1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float mountainNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(mountainHash(i), mountainHash(i + vec3(1, 0, 0)), f.x),
              mix(mountainHash(i + vec3(0, 1, 0)), mountainHash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(mountainHash(i + vec3(0, 0, 1)), mountainHash(i + vec3(1, 0, 1)), f.x),
              mix(mountainHash(i + vec3(0, 1, 1)), mountainHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      vec4 rockSample(sampler2D map, vec2 uv, float weight) {
        // Compute gradients before branching so mipmaps and anisotropy match the full blend.
        vec2 dx = dFdx(uv), dy = dFdy(uv);
        if (weight == 0.0) return vec4(0.0);
        return textureGrad(map, uv, dx, dy);
      }
      vec4 rockProjection(sampler2D map, vec2 uvX, vec2 uvY, vec2 uvZ, vec3 weights) {
        return rockSample(map, uvX, weights.x) * weights.x
          + rockSample(map, uvY, weights.y) * weights.y
          + rockSample(map, uvZ, weights.z) * weights.z;
      }
      vec3 rockNormalProjection(vec3 sampledNormal, float weight, vec2 axisSign, int axis,
          float strength, vec3 surfaceNormal) {
        if (weight == 0.0) return vec3(0.0);
        vec3 detail = sampledNormal * 2.0 - 1.0;
        detail.xy *= axisSign * strength;
        detail = normalize(detail);
        vec3 worldNormal;
        if (axis == 0) worldNormal = vec3(detail.z * surfaceNormal.x,
          detail.y + surfaceNormal.y, detail.x + surfaceNormal.z);
        else if (axis == 1) worldNormal = vec3(detail.x + surfaceNormal.x,
          detail.z * surfaceNormal.y, detail.y + surfaceNormal.z);
        else worldNormal = vec3(detail.x + surfaceNormal.x,
          detail.y + surfaceNormal.y, detail.z * surfaceNormal.z);
        return worldNormal * weight;
      }
    ` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec3 rockSurfaceNormal = normalize(mountainSurfaceNormal);
      vec3 rockAxisSign = step(vec3(0.0), rockSurfaceNormal) * 2.0 - 1.0;
      vec3 rockWeights = max(abs(rockSurfaceNormal) - .2, 0.0);
      rockWeights *= rockWeights;
      rockWeights *= rockWeights;
      rockWeights /= rockWeights.x + rockWeights.y + rockWeights.z;
      float rockMass = mountainNoise(mountainPosition * .06 + 17.0);
      vec3 rockPosition = mountainPosition * .22 + vec3(rockMass * .45, rockMass * .25, rockMass * -.3);
      vec2 rockUvX = rockPosition.zy * vec2(-rockAxisSign.x, 1.0);
      vec2 rockUvY = rockPosition.xz * vec2(-rockAxisSign.y, 1.0);
      vec2 rockUvZ = rockPosition.xy * vec2(rockAxisSign.z, 1.0);
      vec3 rockSurface = vec3(1.0);
      vec4 rockNormalX = vec4(0.0), rockNormalY = vec4(0.0), rockNormalZ = vec4(0.0);
      if (mountainRockReady > .5) {
        vec4 colorAndRoughness = rockProjection(mountainRockColor, rockUvX, rockUvY, rockUvZ, rockWeights);
        vec3 rockColor = colorAndRoughness.rgb;
        rockNormalX = rockSample(mountainRockNormal, rockUvX, rockWeights.x);
        rockNormalY = rockSample(mountainRockNormal, rockUvY, rockWeights.y);
        rockNormalZ = rockSample(mountainRockNormal, rockUvZ, rockWeights.z);
        ${
          packed
            ? `rockSurface = vec3(
          rockNormalX.a * rockWeights.x + rockNormalY.a * rockWeights.y + rockNormalZ.a * rockWeights.z,
          colorAndRoughness.a, 1.0);`
            : 'rockSurface = rockProjection(mountainRockSurface, rockUvX, rockUvY, rockUvZ, rockWeights).rgb;'
        }
        float tintLuminance = max(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722)), .03);
        vec3 rockTint = mix(vec3(1.0), diffuseColor.rgb / tintLuminance, .25);
        diffuseColor.rgb = rockColor * rockTint * (.85 + rockMass * .3);
      }
      float snowLine = 27.0 + (rockMass - .5) * 5.0;
      float snowCover = smoothstep(snowLine - 1.0, snowLine + 2.5, mountainPosition.y)
        * smoothstep(.08, .52, max(rockSurfaceNormal.y, 0.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.79, .85, .86), snowCover);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor *= mix(max(.65, rockSurface.g), 1.0, snowCover);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      if (mountainRockReady > .5) {
        float reliefStrength = mix(1.5, .08, snowCover);
        // Blend each projection with the surface normal before combining the axes.
        vec3 rockWorldNormal = normalize(
          rockNormalProjection(rockNormalX.rgb, rockWeights.x, vec2(-rockAxisSign.x, 1.0),
            0, reliefStrength, rockSurfaceNormal)
          + rockNormalProjection(rockNormalY.rgb, rockWeights.y, vec2(-rockAxisSign.y, 1.0),
            1, reliefStrength, rockSurfaceNormal)
          + rockNormalProjection(rockNormalZ.rgb, rockWeights.z, vec2(rockAxisSign.z, 1.0),
            2, reliefStrength, rockSurfaceNormal));
        rockWorldNormal = normalize(mix(rockWorldNormal, rockSurfaceNormal, snowCover * .95));
        normal = normalize(mat3(viewMatrix) * rockWorldNormal) * faceDirection;
      }
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `
      #include <aomap_fragment>
      float rockOcclusion = mix(pow(rockSurface.r, 1.4), 1.0, snowCover);
      reflectedLight.indirectDiffuse *= rockOcclusion;
      reflectedLight.indirectSpecular *= rockOcclusion;
    `,
    );
  };
  material.customProgramCacheKey = () =>
    textures.packed ? 'photographic-rock-triplanar-packed-v4' : 'photographic-rock-triplanar-v4';
  return material;
}
