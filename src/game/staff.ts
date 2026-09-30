import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildStaff(group: THREE.Group): THREE.Mesh {
  const wood = new THREE.MeshStandardMaterial({ color: '#4d3020', roughness: .78, fog: false });
  const bronze = new THREE.MeshStandardMaterial({ color: '#aa8245', metalness: .78, roughness: .3, fog: false });
  const leather = new THREE.MeshStandardMaterial({ color: '#292723', roughness: .92, fog: false });
  const cloth = new THREE.MeshStandardMaterial({ color: '#253f4a', roughness: 1, fog: false });
  const glow = new THREE.MeshStandardMaterial({ color: '#8aedd1', emissive: '#35b799', emissiveIntensity: .85, fog: false });
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (g: THREE.BufferGeometry, m: THREE.Material, p: [number,number,number] = [0,0,0], s: [number,number,number] = [1,1,1], r: [number,number,number] = [0,0,0]) => {
    g.scale(...s); g.rotateX(r[0]);g.rotateY(r[1]);g.rotateZ(r[2]);g.translate(...p);const baked=g.index?g.toNonIndexed():g;if(baked!==g)g.dispose();const list=parts.get(m)??[];list.push(baked);parts.set(m,list);
  };
  const tube=(points:THREE.Vector3[],radius:number,m:THREE.Material,segments=36)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,radius,8,false),m);
  tube([new THREE.Vector3(0,-1.4,0),new THREE.Vector3(-.018,-.6,.01),new THREE.Vector3(.018,.2,0),new THREE.Vector3(0,.82,0)],.065,wood);
  // Carved grain follows the shaft, with small ridges rather than a plain cylinder.
  for(let strand=0;strand<7;strand++) {
    const points:THREE.Vector3[]=[];
    for(let i=0;i<=22;i++){const y=-1.35+i*.092,a=strand/7*Math.PI*2+Math.sin(y*2)*.2;points.push(new THREE.Vector3(Math.sin(a)*.064,y,Math.cos(a)*.064));}
    tube(points,.007,wood,28);
  }
  for(const y of [-1.35,-.57,.18,.62,.76]) {
    add(new THREE.CylinderGeometry(.086,.089,.07,16),bronze,[0,y,0]);
    for(const offset of [-.037,.037]) add(new THREE.TorusGeometry(.084,.009,6,20),bronze,[0,y+offset,0],[1,1,1],[Math.PI/2,0,0]);
  }
  const wrap:THREE.Vector3[]=[];
  for(let i=0;i<=220;i++){const a=i/220*Math.PI*2*11;wrap.push(new THREE.Vector3(Math.cos(a)*.074,-.51+i/220*.63,Math.sin(a)*.074));}
  tube(wrap,.012,leather,220);
  // Three curved bronze branches cradle the faceted spell crystal.
  for(let j=0;j<3;j++) {
    const points:THREE.Vector3[]=[];
    for(let i=0;i<=18;i++){const t=i/18,a=j/3*Math.PI*2+t*.5,r=.08+Math.sin(t*Math.PI)*.2;points.push(new THREE.Vector3(Math.cos(a)*r,.68+t*.68,Math.sin(a)*r));}
    tube(points,.024,bronze,24);
    add(new THREE.SphereGeometry(.034,10,8),bronze,points[18].toArray() as [number,number,number]);
  }
  add(new THREE.TorusGeometry(.21,.014,8,32),bronze,[0,.94,0],[1,1,1],[Math.PI/2,.2,0]);
  add(new THREE.TorusGeometry(.27,.012,8,32),bronze,[0,1.09,0],[1,1,1],[.35,0,.2]);
  // Inlaid runes and a small gem on the collar.
  for(let i=0;i<5;i++) {
    const y=.28+i*.065;
    add(new THREE.BoxGeometry(.006,.034,.005),glow,[-.025,y,.066],[1,1,1],[0,0,-.6]);
    add(new THREE.BoxGeometry(.006,.028,.005),glow,[0,y,.069],[1,1,1],[0,0,.5]);
  }
  add(new THREE.OctahedronGeometry(.055),glow,[0,.71,.093],[.6,1,.45]);
  add(new THREE.SphereGeometry(.09,16,10),bronze,[0,-1.41,0],[1,.7,1]);
  // Gloved palm and fingers around the grip; robe sleeve and stitched cuff.
  add(new THREE.SphereGeometry(1,16,12),leather,[.105,-.28,.045],[.105,.15,.085]);
  for(let i=0;i<4;i++) {
    const y=-.19-i*.057;
    tube([new THREE.Vector3(.13,y,.09),new THREE.Vector3(.035,y,.12),new THREE.Vector3(-.065,y,.07),new THREE.Vector3(-.075,y,.0)],.026,leather,12);
  }
  tube([new THREE.Vector3(.13,-.35,.055),new THREE.Vector3(.15,-.2,.12),new THREE.Vector3(.04,-.16,.1)],.037,leather,12);
  add(new THREE.CylinderGeometry(.115,.19,.6,16),cloth,[.18,-.58,.24],[1,1,1],[.83,0,-.13]);
  add(new THREE.CylinderGeometry(.14,.14,.1,16),bronze,[.13,-.4,.1],[1,1,1],[.83,0,-.13]);
  for(let i=0;i<8;i++){const a=i/8*6.28;add(new THREE.SphereGeometry(.012,6,4),bronze,[.18+Math.cos(a)*.175,-.75,.39+Math.sin(a)*.15]);}
  for(const [material,geometries] of parts){const merged=mergeGeometries(geometries)!;for(const g of geometries)g.dispose();group.add(new THREE.Mesh(merged,material));}
  const crystal=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0,-.27),new THREE.Vector2(.14,-.13),new THREE.Vector2(.15,.13),new THREE.Vector2(0,.3)],6),new THREE.MeshStandardMaterial({color:'#87e8da',emissive:'#19ac91',emissiveIntensity:.6,roughness:.18,metalness:.25,fog:false}));
  crystal.position.y=1.1;group.add(crystal);
  group.position.set(.55,-.68,-1.15);group.scale.setScalar(.65);group.rotation.set(.15,0,-.15);
  return crystal;
}
