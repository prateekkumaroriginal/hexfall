import { required, at } from '../lib/assert';
import * as THREE from 'three';
import { TreeRenderer } from './trees';
import { ENVIRONMENT_SEED } from '../config/world';
import { GRASS, QUALITY_PRESETS } from '../config/rendering';
import type { Quality } from './performance';
import { buildMountains } from './mountains';
import { loadMountainRockTextures } from './mountain-material';
import { loadTreeTextures } from './tree-material';
import { buildRocks } from './rocks';
import { isMesh } from './three-types';
import { packSurfaceTextures } from './texture-packing';
import { usePackedSurfaceMaterial } from './surface-material';
import { GrassOrder } from './grass-order';
function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
function paintTexture(kind: 'grass' | 'ground', random: () => number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = required(canvas.getContext('2d'), `Failed to create ${kind} texture canvas`);
  if (kind === 'ground') {
    const data = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const noise =
          Math.sin(x * 0.13 + Math.sin(y * 0.07) * 2) * Math.cos(y * 0.09) * 0.5 + random() * 0.5;
        const i = (y * 256 + x) * 4;
        const base = [66, 85, 43];
        for (let c = 0; c < 3; c++) data.data[i + c] = at(base, c) + noise * 22;
        data.data[i + 3] = 255;
      }
    ctx.putImageData(data, 0, 0);
    for (let i = 0; i < 6500; i++) {
      const x = random() * 256,
        y = random() * 256;
      ctx.strokeStyle = `rgba(${70 + random() * 50},${95 + random() * 50},${35 + random() * 30},.55)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + random() * 5 - 2, y - random() * 9);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 24; i++) {
      const x = 15 + random() * 225,
        tipX = x + (random() - 0.5) * 65,
        tipY = 8 + random() * 125;
      const gradient = ctx.createLinearGradient(0, 256, 0, tipY);
      gradient.addColorStop(0, '#23321b');
      gradient.addColorStop(0.45, '#547634');
      gradient.addColorStop(1, i % 3 ? '#91a95c' : '#b3b879');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x - 2, 256);
      ctx.quadraticCurveTo(x - 3, 130, tipX, tipY);
      ctx.quadraticCurveTo(x + 5, 165, x + 3, 256);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (kind === 'ground') {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}
export class Environment {
  readonly ready: Promise<void>;
  readonly depthScene = new THREE.Scene();
  private grassTiles: {
    mesh: THREE.InstancedMesh;
    x: number;
    z: number;
    order: GrassOrder;
  }[] = [];
  private qualityScale: number = GRASS.INITIAL_DENSITY_SCALE;
  private grassRadius: number = GRASS.INITIAL_RADIUS_UNITS;
  private frustum = new THREE.Frustum();
  private projection = new THREE.Matrix4();
  private trees: TreeRenderer;
  private textures: THREE.Texture[] = [];
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private skyTarget?: THREE.WebGLCubeRenderTarget;
  private wind = { value: 0 };
  private skyTime = { value: 0 };
  private disposed = false;
  constructor(scene: THREE.Scene) {
    const loading = new THREE.LoadingManager();
    this.ready = new Promise<void>((resolve, reject) => {
      loading.onLoad = resolve;
      loading.onError = (url) => {
        reject(new Error('The arena textures could not load. Reload the page to try again.'));
        console.error(`Arena texture failed: ${url}`);
      };
    });
    const random = randomSource(ENVIRONMENT_SEED),
      dummy = new THREE.Object3D();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { time: this.skyTime },
        vertexShader: `
          varying vec3 direction;
          void main() {
            direction=position;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
          }
        `,
        fragmentShader: `
          varying vec3 direction;
          uniform float time;
          float hash(vec2 p) {
            return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
          }
          float noise(vec2 p) {
            vec2 i=floor(p),f=fract(p);
            f=f*f*(3.0-2.0*f);
            return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
          }
          float fbm(vec2 p) {
            float n=0.0,a=0.5;
            for(int i=0;i<5;i++) {
              n+=a*noise(p);
              p=p*2.03+17.1;
              a*=0.5;
            }
            return n;
          }
          void main() {
            vec3 d=normalize(direction);
            float h=max(d.y,0.0);
            vec3 sky=mix(vec3(0.67,0.81,0.88),vec3(0.16,0.43,0.72),pow(h,0.5));
            float sun=dot(d,normalize(vec3(-0.5,0.65,-0.4)));
            sky+=vec3(1.0,0.83,0.52)*pow(max(sun,0.0),180.0)*0.45;
            if(d.y>0.02) {
              vec2 p=d.xz/(d.y+0.18)*2.5+vec2(time*0.008,0.0);
              float n=fbm(p);
              float cloud=smoothstep(0.48,0.69,n)*smoothstep(0.025,0.2,d.y);
              vec3 white=mix(vec3(0.63,0.71,0.76),vec3(1.0,0.98,0.91),smoothstep(0.48,0.8,n));
              sky=mix(sky,white,cloud*0.95);
            }
            gl_FragColor=vec4(sky,1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    sky.name = 'daylight-sky-and-clouds';
    sky.renderOrder = 100;
    this.sky = sky;
    scene.add(sky);
    const groundMap = paintTexture('ground', random),
      grassMap = paintTexture('grass', random);
    this.textures.push(groundMap, grassMap);
    const mountainRock = loadMountainRockTextures(loading);
    this.textures.push(mountainRock.color, mountainRock.normal, mountainRock.surface);
    groundMap.repeat.set(20, 24);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 48, 1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: groundMap, color: '#afbe92' }),
    );
    ground.position.y = -0.06;
    ground.name = 'valley-floor';
    ground.renderOrder = 1;
    scene.add(ground);
    // A clump contains many painted blades on three crossed cards, six triangles total.
    const blade = new THREE.BufferGeometry(),
      positions: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    for (let j = 0; j < 3; j++) {
      const a = (j * Math.PI) / 3,
        c = Math.cos(a) * 0.34,
        q = Math.sin(a) * 0.34,
        k = j * 4;
      positions.push(-c, 0, -q, c, 0, q, -c, 0.52, -q, c, 0.52, q);
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    blade.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    blade.setIndex(indices);
    const grassMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { time: this.wind, atlas: { value: grassMap } },
      vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying float shade;
        void main() {
          vUv=uv;
          vec4 p=modelMatrix*instanceMatrix*vec4(position,1.0);
          shade=.85+.15*sin(p.x*.57+p.z*.37);
          p.x+=sin(p.x*.4+p.z*.3+time*1.7)*uv.y*uv.y*.065;
          gl_Position=projectionMatrix*viewMatrix*p;
        }
      `,
      fragmentShader: `
        uniform sampler2D atlas;
        varying vec2 vUv;
        varying float shade;
        void main() {
          vec4 c=texture2D(atlas,vUv);
          if(c.a<.45)discard;
          gl_FragColor=vec4(c.rgb*shade,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    for (let tx = GRASS.TILE_X.MIN; tx < GRASS.TILE_X.MAX_EXCLUSIVE; tx++)
      for (let tz = GRASS.TILE_Z.MIN; tz < GRASS.TILE_Z.MAX_EXCLUSIVE; tz++) {
        const cx = tx * GRASS.TILE_SIZE_UNITS + GRASS.TILE_X.CENTER_OFFSET_UNITS,
          cz = tz * GRASS.TILE_SIZE_UNITS;
        const mesh = new THREE.InstancedMesh(blade, grassMat, GRASS.PER_TILE);
        mesh.name = `grass-tile-${tx}-${tz}`;
        mesh.position.set(cx, 0, cz);
        for (let i = 0; i < GRASS.PER_TILE; i++) {
          const x = (random() - 0.5) * GRASS.TILE_SIZE_UNITS,
            z = (random() - 0.5) * GRASS.TILE_SIZE_UNITS;
          dummy.position.set(x, -0.055, z);
          dummy.rotation.set(0, random() * 6.28, 0);
          dummy.scale.setScalar(0.55 + random() * 0.5);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.computeBoundingSphere();
        if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.2;
        scene.add(mesh);
        this.grassTiles.push({ mesh, x: cx, z: cz, order: new GrassOrder(mesh.instanceMatrix) });
      }
    const treeTextures = loadTreeTextures(loading);
    this.textures.push(
      treeTextures.barkColor,
      treeTextures.barkNormal,
      treeTextures.barkSurface,
      treeTextures.leavesColor,
      treeTextures.leavesNormal,
    );
    this.trees = new TreeRenderer(scene, treeTextures);
    const rocks = buildRocks(scene, mountainRock);
    const mountains = buildMountains(scene, mountainRock);
    // Resolve overlapping rock surfaces before their expensive texture and lighting passes.
    // Geometry and transforms are shared; visible detail stays identical.
    for (const rock of [rocks, mountains]) {
      const material = new THREE.MeshBasicMaterial({
        colorWrite: false,
        side: rock.material.side,
        toneMapped: false,
      });
      const depth = new THREE.Mesh(rock.geometry, material);
      depth.name = `${rock.name}-depth`;
      depth.matrixAutoUpdate = false;
      depth.matrix.copy(rock.matrix);
      this.depthScene.add(depth);
    }
    this.ready = this.ready.then(() => {
      if (this.disposed) return;
      const sources = [mountainRock.color, mountainRock.normal, mountainRock.surface];
      const packed = packSurfaceTextures(
        mountainRock.color,
        mountainRock.normal,
        mountainRock.surface,
      );
      mountainRock.packed = packed;
      usePackedSurfaceMaterial(rocks.material, packed);
      this.textures.splice(2, 3, packed.color, packed.normal);
      for (const source of sources) {
        source.dispose();
        source.source.data = null;
      }
    });
  }
  prepareTextures(renderer: THREE.WebGLRenderer) {
    // WebGL texture storage is immutable. Allocate only after final image sizes are known.
    for (const texture of this.textures) renderer.initTexture(texture);
  }
  bakeSky(renderer: THREE.WebGLRenderer) {
    const parent = required(this.sky.parent, 'Sky must be attached before baking'),
      bakeScene = new THREE.Scene();
    bakeScene.add(this.sky);
    this.skyTarget = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: false });
    const cube = new THREE.CubeCamera(0.1, 500, this.skyTarget);
    cube.update(renderer, bakeScene);
    parent.add(this.sky);
    this.sky.material.dispose();
    this.sky.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { sky: { value: this.skyTarget.texture } },
      vertexShader: `
        varying vec3 direction;
        void main() {
          direction=position;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform samplerCube sky;
        varying vec3 direction;
        void main() {
          gl_FragColor=textureCube(sky,normalize(direction));
          #include <colorspace_fragment>
        }
      `,
      toneMapped: false,
    });
  }
  setQuality(quality: Quality) {
    this.qualityScale = QUALITY_PRESETS[quality].GRASS_DENSITY;
    this.grassRadius = QUALITY_PRESETS[quality].GRASS_RADIUS_UNITS;
  }
  update(time: number, camera: THREE.Camera) {
    this.wind.value = time;
    this.sky.rotation.y = time * 0.0004;
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const forwardX = -at(camera.matrixWorld.elements, 8),
      forwardZ = -at(camera.matrixWorld.elements, 10);
    for (const tile of this.grassTiles) {
      const d = Math.hypot(tile.x - camera.position.x, tile.z - camera.position.z);
      tile.mesh.visible = d < this.grassRadius + GRASS.VISIBILITY_PADDING_UNITS;
      const density =
        d < GRASS.NEAR_DISTANCE_UNITS
          ? GRASS.NEAR_DENSITY
          : d < GRASS.MIDDLE_DISTANCE_UNITS
            ? GRASS.MIDDLE_DENSITY
            : GRASS.FAR_DENSITY;
      tile.mesh.count = Math.floor(GRASS.PER_TILE * this.qualityScale * density);
      if (tile.mesh.visible)
        tile.order.update(tile.mesh.instanceMatrix, tile.mesh.count, forwardX, forwardZ);
    }
    this.trees.update(time, this.frustum);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const object of this.depthScene.children) {
      if (isMesh(object)) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    }
    this.skyTarget?.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
