import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OBSTACLES, ARENA_HALF_WIDTH, ARENA_HALF_DEPTH } from './simulation';

const GRASS_PER_TILE = 700;
function randomSource(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }; }

function paintTexture(kind: 'grass' | 'leaves' | 'ground' | 'rock', random: () => number) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  if (kind === 'ground' || kind === 'rock') {
    const data = ctx.createImageData(256, 256);
    for (let y=0;y<256;y++) for(let x=0;x<256;x++) {
      const noise = Math.sin(x*.13+Math.sin(y*.07)*2)*Math.cos(y*.09)*.5+random()*.5;
      const i=(y*256+x)*4;
      const base=kind==='rock'?[135,140,133]:[66,85,43];
      for(let c=0;c<3;c++)data.data[i+c]=base[c]+noise*(kind==='rock'?30:22);
      data.data[i+3]=255;
    }
    ctx.putImageData(data,0,0);
    for(let i=0;i<(kind==='rock'?260:6500);i++){
      const x=random()*256,y=random()*256;
      ctx.strokeStyle=kind==='rock'?'rgba(42,48,42,.2)':`rgba(${70+random()*50},${95+random()*50},${35+random()*30},.55)`;
      ctx.lineWidth=kind==='rock'?.5:1;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*5-2,y-(kind==='rock'?random()*35:random()*9));ctx.stroke();
    }
  } else if(kind==='grass') {
    for(let i=0;i<24;i++) {
      const x=15+random()*225, tipX=x+(random()-.5)*65, tipY=8+random()*125;
      const gradient=ctx.createLinearGradient(0,256,0,tipY);gradient.addColorStop(0,'#23321b');gradient.addColorStop(.45,'#547634');gradient.addColorStop(1,i%3?'#91a95c':'#b3b879');ctx.fillStyle=gradient;
      ctx.beginPath();ctx.moveTo(x-2,256);ctx.quadraticCurveTo(x-3,130,tipX,tipY);ctx.quadraticCurveTo(x+5,165,x+3,256);ctx.fill();
    }
  } else {
    // A branching spray with open gaps, not a circular cutout.
    for(let branch=0;branch<9;branch++) {
      const y=225-branch*22,side=branch%2?1:-1;
      ctx.strokeStyle='#6d6841';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(128,250);ctx.lineTo(128+side*75,y-30);ctx.stroke();
      for(let j=0;j<18;j++) {
        const t=j/18,x=128+side*t*78+(random()-.5)*25,ly=250+(y-280)*t+(random()-.5)*22;
        ctx.fillStyle=`hsl(${78+random()*25},${22+random()*15}%,${30+random()*22}%)`;
        ctx.beginPath();ctx.ellipse(x,ly,5+random()*5,2+random()*2,side*.6+random(),0,6.28);ctx.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  if(kind==='ground'||kind==='rock'){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;}
  return texture;
}


export class Environment {
  private grassTiles: { mesh: THREE.InstancedMesh; x: number; z: number }[] = [];
  private qualityScale = .8;
  private grassRadius = 25;
  private frustum = new THREE.Frustum();
  private projection = new THREE.Matrix4();
  private treeData: { matrix: THREE.Matrix4; bounds: THREE.Sphere }[] = [];
  private trunks: THREE.InstancedMesh;
  private canopy: THREE.InstancedMesh;
  private textures: THREE.Texture[] = [];
  private sky: THREE.Mesh;
  private skyTarget?: THREE.WebGLCubeRenderTarget;
  private wind = { value: 0 };
  private skyTime = { value: 0 };
  constructor(scene: THREE.Scene) {
    const random = randomSource(471), dummy = new THREE.Object3D(), color = new THREE.Color();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: { time: this.skyTime },
      vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec3 direction; uniform float time;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
        float fbm(vec2 p){float n=0.0,a=0.5;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+17.1;a*=0.5;}return n;}
        void main(){vec3 d=normalize(direction);float h=max(d.y,0.0);
          vec3 sky=mix(vec3(0.67,0.81,0.88),vec3(0.16,0.43,0.72),pow(h,0.5));
          float sun=dot(d,normalize(vec3(-0.5,0.65,-0.4)));sky+=vec3(1.0,0.83,0.52)*pow(max(sun,0.0),180.0)*0.45;
          if(d.y>0.02){vec2 p=d.xz/(d.y+0.18)*2.5+vec2(time*0.008,0.0);float n=fbm(p);float cloud=smoothstep(0.48,0.69,n)*smoothstep(0.025,0.2,d.y);vec3 white=mix(vec3(0.63,0.71,0.76),vec3(1.0,0.98,0.91),smoothstep(0.48,0.8,n));sky=mix(sky,white,cloud*0.95);}
          gl_FragColor=vec4(sky,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    sky.name = 'daylight-sky-and-clouds'; sky.renderOrder = 100; this.sky = sky; scene.add(sky);

    const groundMap=paintTexture('ground',random),grassMap=paintTexture('grass',random),leafMap=paintTexture('leaves',random),rockMap=paintTexture('rock',random);
    this.textures.push(groundMap,grassMap,leafMap,rockMap);groundMap.repeat.set(20,24);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(40,48,1,1).rotateX(-Math.PI/2),new THREE.MeshLambertMaterial({map:groundMap,color:'#afbe92'}));ground.position.y=-.06;ground.name='valley-floor';scene.add(ground);

    // A clump contains many painted blades on three crossed cards, six triangles total.
    const blade=new THREE.BufferGeometry(),positions:number[]=[],uv:number[]=[],indices:number[]=[];
    for(let j=0;j<3;j++) {
      const a=j*Math.PI/3,c=Math.cos(a)*.34,q=Math.sin(a)*.34,k=j*4;
      positions.push(-c,0,-q,c,0,q,-c,.52,-q,c,.52,q);uv.push(0,0,1,0,0,1,1,1);indices.push(k,k+1,k+2,k+1,k+3,k+2);
    }
    blade.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));blade.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));blade.setIndex(indices);
    const grassMat=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{time:this.wind,atlas:{value:grassMap}},
      vertexShader:`uniform float time;varying vec2 vUv;varying float shade;void main(){vUv=uv;vec4 p=modelMatrix*instanceMatrix*vec4(position,1.0);shade=.85+.15*sin(p.x*.57+p.z*.37);p.x+=sin(p.x*.4+p.z*.3+time*1.7)*uv.y*uv.y*.065;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`uniform sampler2D atlas;varying vec2 vUv;varying float shade;void main(){vec4 c=texture2D(atlas,vUv);if(c.a<.45)discard;gl_FragColor=vec4(c.rgb*shade,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    for(let tx=-2;tx<2;tx++)for(let tz=-2;tz<3;tz++){
      const cx=tx*8+4,cz=tz*8;const mesh=new THREE.InstancedMesh(blade,grassMat,GRASS_PER_TILE);
      mesh.name=`grass-tile-${tx}-${tz}`;mesh.position.set(cx,0,cz);
      for(let i=0;i<GRASS_PER_TILE;i++){
        const x=(random()-.5)*8,z=(random()-.5)*8;
        dummy.position.set(x,-.055,z);dummy.rotation.set(0,random()*6.28,0);dummy.scale.setScalar(.55+random()*.5);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.computeBoundingSphere();if(mesh.boundingSphere)mesh.boundingSphere.radius+=.2;scene.add(mesh);this.grassTiles.push({mesh,x:cx,z:cz});
    }

    const branches:THREE.BufferGeometry[]=[],foliage:THREE.BufferGeometry[]=[];
    branches.push(new THREE.CylinderGeometry(.12,.32,4.8,7,1).translate(0,2.4,0));
    for(let j=0;j<10;j++){
      const a=j*2.39996,y=2.3+j*.28,reach=1.15+random()*1.15;
      const end=new THREE.Vector3(Math.cos(a)*reach,y+.85,Math.sin(a)*reach);
      const path=new THREE.CatmullRomCurve3([new THREE.Vector3(0,y-.7,0),new THREE.Vector3(end.x*.5,y,end.z*.5),end]);
      branches.push(new THREE.TubeGeometry(path,4,.09,5,false));
      for(let plane=0;plane<12;plane++){
        const card=new THREE.PlaneGeometry(1.25,1.55);card.rotateY(a+plane*2.399);card.rotateX((random()-.5)*1.5);card.translate(end.x+(random()-.5)*2,end.y+random()*1.2,end.z+(random()-.5)*2);foliage.push(card);
      }
    }
    const branchGeo=mergeGeometries(branches)!,leafGeo=mergeGeometries(foliage)!;for(const g of [...branches,...foliage])g.dispose();
    this.trunks=new THREE.InstancedMesh(branchGeo,new THREE.MeshLambertMaterial({color:'#54483b'}),20);
    this.canopy=new THREE.InstancedMesh(leafGeo,new THREE.MeshLambertMaterial({map:leafMap,alphaTest:.45,side:THREE.DoubleSide,color:'#c6d4ad'}),20);
    this.trunks.name='branching-tree-trunks';this.canopy.name='broadleaf-canopies';
    for(let i=0;i<20;i++){
      const side=i%4,along=(Math.floor(i/4)-2)/2;
      const x=side<2?(side===0?-1:1)*16.4:along*14;
      const z=side>=2?(side===2?-1:1)*20.4:along*17;
      dummy.position.set(x,0,z);dummy.rotation.set(0,random()*6.28,0);dummy.scale.setScalar(.8+random()*.5);dummy.updateMatrix();
      this.treeData.push({matrix:dummy.matrix.clone(),bounds:new THREE.Sphere(new THREE.Vector3(x,3.5,z),5.5)});
    }
    for(const mesh of [this.trunks,this.canopy]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}

    const rockGeo=new THREE.IcosahedronGeometry(1,2);
    const rp=rockGeo.getAttribute('position'),rc=[];
    for(let i=0;i<rp.count;i++){
      const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i);
      const warp=1+Math.sin(x*7+z*4)*.12+Math.cos(y*9-z*3)*.09;
      rp.setXYZ(i,x*warp+Math.max(0,y)*.18,Math.max(-.62,y*warp*.75),z*warp*.85);
      color.set(y<-.15?'#777b67':'#b4afa1');color.multiplyScalar(.9+.1*Math.sin(x*14+y*11+z*8));rc.push(color.r,color.g,color.b);
    }
    rockGeo.setAttribute('color',new THREE.Float32BufferAttribute(rc,3));rockGeo.computeVertexNormals();
    const rockMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true,bumpMap:rockMap,bumpScale:.12});
    const rocks=new THREE.InstancedMesh(rockGeo,rockMat,46);rocks.name='valley-boulders';let rockCount=0;
    for(const p of OBSTACLES){dummy.position.set(p.x,.72,p.z);dummy.rotation.set(0,rockCount*.7,0);dummy.scale.set(p.radius,1.3,p.radius);dummy.updateMatrix();rocks.setMatrixAt(rockCount++,dummy.matrix);}
    while(rockCount<46){const side=rockCount%4,along=random()*2-1;const x=side<2?(side===0?-1:1)*(16+random()*2):along*16,z=side>=2?(side===2?-1:1)*(20+random()*2):along*20;const size=.4+random()*1.1;dummy.position.set(x,size*.35,z);dummy.rotation.set(random(),random()*6.28,0);dummy.scale.set(size,size*.7,size*.8);dummy.updateMatrix();rocks.setMatrixAt(rockCount++,dummy.matrix);}rocks.computeBoundingSphere();scene.add(rocks);

    // Continuous rectangular ridge. Every perimeter sample starts at the same collision boundary.
    const wallPositions:number[]=[],wallUv:number[]=[],wallColors:number[]=[],wallIndices:number[]=[];
    const segments=128,rows=8;
    for(let row=0;row<=rows;row++)for(let i=0;i<=segments;i++){
      const t=row/rows,along=i/segments*4,side=Math.min(3,Math.floor(along)),u=along-side;
      const baseX=side===0?-ARENA_HALF_WIDTH+u*ARENA_HALF_WIDTH*2:side===1?ARENA_HALF_WIDTH:side===2?ARENA_HALF_WIDTH-u*ARENA_HALF_WIDTH*2:-ARENA_HALF_WIDTH;
      const baseZ=side===0?-ARENA_HALF_DEPTH:side===1?-ARENA_HALF_DEPTH+u*ARENA_HALF_DEPTH*2:side===2?ARENA_HALF_DEPTH:ARENA_HALF_DEPTH-u*ARENA_HALF_DEPTH*2;
      const phase=i/segments*Math.PI*2,peak=18+Math.sin(phase*5+.4)*4+Math.cos(phase*9)*2.5;
      const outward=.65+t*10+(Math.sin(phase*19+t*8)*.7+Math.sin(phase*31)*.25)*Math.sin(t*Math.PI);
      const nx=baseX/ARENA_HALF_WIDTH,nz=baseZ/ARENA_HALF_DEPTH,n=Math.hypot(nx,nz);
      const y=row===0?-.1:Math.pow(t,.74)*peak+Math.sin(phase*23+t*15)*.55*Math.sin(t*Math.PI);
      wallPositions.push(baseX+nx/n*outward,y,baseZ+nz/n*outward);wallUv.push(i/segments*18,t*4);
      const snow=y>19.5+Math.sin(phase*13)*1.2;
      color.set(snow?'#b8c6bf':row<2?'#697455':row<4?'#797e6d':'#8a9190');color.multiplyScalar(.84+.16*Math.sin(phase*11+t*4));wallColors.push(color.r,color.g,color.b);
      if(row<rows&&i<segments){const k=row*(segments+1)+i;wallIndices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2);}
    }
    const wallGeo=new THREE.BufferGeometry();wallGeo.setAttribute('position',new THREE.Float32BufferAttribute(wallPositions,3));wallGeo.setAttribute('uv',new THREE.Float32BufferAttribute(wallUv,2));wallGeo.setAttribute('color',new THREE.Float32BufferAttribute(wallColors,3));wallGeo.setIndex(wallIndices);wallGeo.computeVertexNormals();
    const walls=new THREE.Mesh(wallGeo,new THREE.MeshLambertMaterial({map:rockMap,vertexColors:true,side:THREE.DoubleSide}));walls.name='enclosing-mountain-walls';scene.add(walls);
  }

  bakeSky(renderer: THREE.WebGLRenderer) {
    const parent = this.sky.parent!, bakeScene = new THREE.Scene();
    bakeScene.add(this.sky); this.skyTarget = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: false });
    const cube = new THREE.CubeCamera(.1, 500, this.skyTarget);
    cube.update(renderer, bakeScene); parent.add(this.sky);
    (this.sky.material as THREE.Material).dispose();
    this.sky.material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: { sky: { value: this.skyTarget.texture } },
      vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform samplerCube sky;varying vec3 direction;void main(){gl_FragColor=textureCube(sky,normalize(direction));\n#include <colorspace_fragment>\n}',
      toneMapped: false,
    });
  }
  setQuality(quality: 'low'|'balanced'|'high') { this.qualityScale=quality==='low'?.65:quality==='high'?1:.85; this.grassRadius=quality==='low'?25:32; }
  update(time: number, camera: THREE.Camera) {
    this.wind.value=time; this.sky.rotation.y=time*.0004;
    camera.updateMatrixWorld(); this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projection);
    for(const tile of this.grassTiles){
      const d=Math.hypot(tile.x-camera.position.x,tile.z-camera.position.z);
      tile.mesh.visible=d<this.grassRadius+6;
      const density=d<10?1:d<20?.7:.42;
      tile.mesh.count=Math.floor(GRASS_PER_TILE*this.qualityScale*density);
    }
    let near=0,trunks=0;
    for(const tree of this.treeData){
      if(!this.frustum.intersectsSphere(tree.bounds))continue;
      this.trunks.setMatrixAt(trunks++,tree.matrix);
      this.canopy.setMatrixAt(near++,tree.matrix);
    }
    this.trunks.count=trunks;this.canopy.count=near;
    for(const mesh of [this.trunks,this.canopy])mesh.instanceMatrix.needsUpdate=true;
  }
  dispose(){this.skyTarget?.dispose();for(const texture of this.textures)texture.dispose();}
}
