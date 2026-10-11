import * as THREE from 'three';

export type MountainRockTextures = {
  color: THREE.Texture;
  normal: THREE.Texture;
  surface: THREE.Texture;
  ready: { value: number };
};

export function loadMountainRockTextures(): MountainRockTextures {
  const loader = new THREE.TextureLoader();
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
    shader.uniforms['mountainRockColor'] = { value: textures.color };
    shader.uniforms['mountainRockNormal'] = { value: textures.normal };
    shader.uniforms['mountainRockSurface'] = { value: textures.surface };
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
      uniform sampler2D mountainRockSurface;
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
      vec3 rockProjection(sampler2D map, vec2 uvX, vec2 uvY, vec2 uvZ, vec3 weights) {
        return texture2D(map, uvX).rgb * weights.x
          + texture2D(map, uvY).rgb * weights.y
          + texture2D(map, uvZ).rgb * weights.z;
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
      if (mountainRockReady > .5) {
        vec3 rockColor = rockProjection(mountainRockColor, rockUvX, rockUvY, rockUvZ, rockWeights);
        rockSurface = rockProjection(mountainRockSurface, rockUvX, rockUvY, rockUvZ, rockWeights);
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
        vec3 rockNormalX = texture2D(mountainRockNormal, rockUvX).xyz * 2.0 - 1.0;
        vec3 rockNormalY = texture2D(mountainRockNormal, rockUvY).xyz * 2.0 - 1.0;
        vec3 rockNormalZ = texture2D(mountainRockNormal, rockUvZ).xyz * 2.0 - 1.0;
        float reliefStrength = mix(1.5, .08, snowCover);
        rockNormalX.xy *= vec2(-rockAxisSign.x, 1.0) * reliefStrength;
        rockNormalY.xy *= vec2(-rockAxisSign.y, 1.0) * reliefStrength;
        rockNormalZ.xy *= vec2(rockAxisSign.z, 1.0) * reliefStrength;
        rockNormalX = normalize(rockNormalX);
        rockNormalY = normalize(rockNormalY);
        rockNormalZ = normalize(rockNormalZ);
        // Blend each projection with the surface normal before combining the axes.
        vec3 rockWorldX = vec3(rockNormalX.z * rockSurfaceNormal.x,
          rockNormalX.y + rockSurfaceNormal.y, rockNormalX.x + rockSurfaceNormal.z);
        vec3 rockWorldY = vec3(rockNormalY.x + rockSurfaceNormal.x,
          rockNormalY.z * rockSurfaceNormal.y, rockNormalY.y + rockSurfaceNormal.z);
        vec3 rockWorldZ = vec3(rockNormalZ.x + rockSurfaceNormal.x,
          rockNormalZ.y + rockSurfaceNormal.y, rockNormalZ.z * rockSurfaceNormal.z);
        vec3 rockWorldNormal = normalize(rockWorldX * rockWeights.x
          + rockWorldY * rockWeights.y + rockWorldZ * rockWeights.z);
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
  material.customProgramCacheKey = () => 'photographic-rock-triplanar-v1';
  return material;
}
