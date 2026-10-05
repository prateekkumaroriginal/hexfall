import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatureRenderer } from './creatures';
import { Simulation, MAX_ENEMIES } from './simulation';
import { loadTripoOrcAsset, TripoOrcRenderer, TRIPO_ORC_URL } from './tripo-orc';
import { ORC_STRIDE_LENGTH } from './tripo-orc-animation';

const file = readFileSync(new URL('../../public/models/tripo-orc-rigged.glb', import.meta.url));
const jsonLength = file.readUInt32LE(12);
const gltf = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
// Parse the actual rig/clips in Node; image decoding is covered by browser rendering.
const noImages = { ...gltf, images: [], textures: [], materials: [{ pbrMetallicRoughness: {} }] };
const json = Buffer.from(JSON.stringify(noImages));
const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
const bin = file.subarray(20 + jsonLength);
const header = Buffer.alloc(20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + padded.length + bin.length, 8);
header.writeUInt32LE(padded.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const bytes = Buffer.concat([header, padded, bin]);
const assetPromise = new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  '',
);
afterEach(() => vi.restoreAllMocks());

describe('rigged Tripo orc', () => {
  it('ships weighted bones and baked idle, walk, and punch clips with the PBR maps', () => {
    expect(file.readUInt32LE(8)).toBe(file.length);
    expect(gltf.skins).toHaveLength(1);
    expect(gltf.skins[0].joints).toHaveLength(17);
    expect(gltf.animations.map((a: { name: string }) => a.name).sort()).toEqual([
      'Idle',
      'Punch',
      'Walk',
    ]);
    const primitive = gltf.meshes[0].primitives[0];
    expect(primitive.attributes).toHaveProperty('JOINTS_0');
    expect(primitive.attributes).toHaveProperty('WEIGHTS_0');
    expect(gltf.accessors[primitive.indices].count / 3).toBeGreaterThan(119000);
    expect(gltf.accessors[primitive.indices].count / 3).toBeLessThanOrEqual(120000);
    expect(gltf.images).toHaveLength(3);
    expect(gltf.materials[0].pbrMetallicRoughness).toHaveProperty('baseColorTexture');
    expect(gltf.materials[0].pbrMetallicRoughness).toHaveProperty('metallicRoughnessTexture');
    expect(gltf.materials[0]).toHaveProperty('normalTexture');
    expect(gltf.meshes[0].extras.targetNames).toEqual(['Blink', 'JawOpen', 'BrowTense']);
    expect(primitive.targets).toHaveLength(3);
  });
  it('plants the stance foot in world space, lifts the swing foot, and keeps limb lengths fixed', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    let planted: THREE.Vector3 | undefined;
    let lengths: number[] | undefined;
    for (const phase of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
      enemy.z = phase * ORC_STRIDE_LENGTH;
      renderer.update(0, enemy, 0, phase * Math.PI * 2, 1);
      const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
      const position = (name: string) =>
        mesh.skeleton.bones
          .find((bone) => bone.name === name)!
          .getWorldPosition(new THREE.Vector3());
      const ankle = position('leftFoot');
      const measures = [
        position('leftThigh').distanceTo(position('leftShin')),
        position('leftShin').distanceTo(ankle),
      ];
      if (!lengths) lengths = measures;
      measures.forEach((length, i) => expect(length).toBeCloseTo(lengths![i], 5));
      // The ankle is fixed during flat support; heel/toe roll moves it around the contact.
      if (phase >= 0.125 && phase <= 0.375) {
        planted ??= ankle.clone();
        expect(ankle.distanceTo(planted)).toBeLessThan(0.00001);
      } else if (phase === 0.75) expect(ankle.y).toBeGreaterThan(planted!.y + 0.15);
      const rightAnkle = position('rightFoot');
      expect(Math.abs(rightAnkle.x - ankle.x)).toBeCloseTo(0.6, 5);
      expect(mesh.geometry.getAttribute('orcSkin')).toBeUndefined();
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      expect(material.onBeforeCompile.toString()).not.toContain('orcDeform');
    }
    renderer.dispose();
  });
  it('has longer leg proportions while keeping its neck upright at close range', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    for (const distance of [0, 0.5, 2, 20]) {
      for (const attacking of [false, true]) {
        enemy.cooldown = attacking ? 1.25 : 0;
        renderer.update(0, enemy, 0, 1.5, 1, distance);
        const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
        const index = mesh.skeleton.bones.findIndex((bone) => bone.name === 'head');
        const skin = new THREE.Matrix4().multiplyMatrices(
          mesh.skeleton.bones[index].matrixWorld,
          mesh.skeleton.boneInverses[index],
        );
        const up = new THREE.Vector3(0, 1, 0).transformDirection(skin);
        expect(Math.abs(up.x)).toBeLessThan(0.00001);
        expect(up.y).toBeGreaterThan(0.995);
        const restPosition = (name: string) =>
          new THREE.Vector3().setFromMatrixPosition(
            mesh.skeleton.boneInverses[mesh.skeleton.bones.findIndex((bone) => bone.name === name)]
              .clone()
              .invert(),
          );
        expect(restPosition('leftThigh').distanceTo(restPosition('leftShin'))).toBeGreaterThan(0.6);
        expect(restPosition('leftShin').distanceTo(restPosition('leftFoot'))).toBeGreaterThan(0.49);
        const primitive = gltf.meshes[0].primitives[0];
        expect(gltf.accessors[primitive.attributes.POSITION].max[1]).toBeLessThan(2.93);
      }
    }
    renderer.dispose();
  });
  it('rolls from heel contact to toe push-off with a full stride and moving hips/shoulders', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    const samples: {
      ankle: THREE.Vector3;
      toe: THREE.Vector3;
      pelvis: THREE.Vector3;
      shoulder: THREE.Vector3;
      head: THREE.Quaternion;
    }[] = [];
    for (const phase of [0, 0.25, 0.58, 0.75, 1]) {
      renderer.update(0, enemy, 0, phase * Math.PI * 2, 1);
      const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
      const bone = (name: string) => mesh.skeleton.bones.find((bone) => bone.name === name)!;
      const footIndex = mesh.skeleton.bones.findIndex((bone) => bone.name === 'leftFoot');
      const skin = new THREE.Matrix4().multiplyMatrices(
        bone('leftFoot').matrixWorld,
        mesh.skeleton.boneInverses[footIndex],
      );
      const origin = new THREE.Vector3(-0.48, 0.18, 0.12).applyMatrix4(skin);
      const toe = new THREE.Vector3(-0.48, 0.18, 1.12).applyMatrix4(skin).sub(origin).normalize();
      samples.push({
        ankle: bone('leftFoot').getWorldPosition(new THREE.Vector3()),
        toe,
        pelvis: bone('pelvis').getWorldPosition(new THREE.Vector3()),
        shoulder: bone('leftUpperArm').getWorldPosition(new THREE.Vector3()),
        head: bone('head').getWorldQuaternion(new THREE.Quaternion()),
      });
    }
    expect(samples[0].toe.y).toBeGreaterThan(0.2);
    expect(Math.abs(samples[1].toe.y)).toBeLessThan(0.00001);
    expect(samples[2].toe.y).toBeLessThan(-0.4);
    expect(samples[0].ankle.z - samples[2].ankle.z).toBeGreaterThan(0.6);
    expect(samples[1].pelvis.distanceTo(samples[0].pelvis)).toBeGreaterThan(0.04);
    expect(samples[1].shoulder.distanceTo(samples[0].shoulder)).toBeGreaterThan(0.05);
    expect(samples[1].head.angleTo(samples[0].head)).toBeLessThan(0.00001);
    expect(samples[4].ankle.distanceTo(samples[0].ankle)).toBeLessThan(0.00001);
    renderer.dispose();
  });
  it('plants the heel and toe contacts while the foot rolls over them', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    for (const [phases, pivot] of [
      [[0, 2 / 48, 4 / 48], new THREE.Vector3(-0.48, 0, -0.01)],
      [[22 / 48, 24 / 48, 26 / 48, 28 / 48], new THREE.Vector3(-0.48, 0, 0.48)],
    ] as const) {
      let planted: THREE.Vector3 | undefined;
      for (const phase of phases) {
        enemy.z = phase * ORC_STRIDE_LENGTH;
        renderer.update(0, enemy, 0, phase * Math.PI * 2, 1);
        const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
        const index = mesh.skeleton.bones.findIndex((bone) => bone.name === 'leftFoot');
        const skin = new THREE.Matrix4().multiplyMatrices(
          mesh.skeleton.bones[index].matrixWorld,
          mesh.skeleton.boneInverses[index],
        );
        const contact = pivot.clone().applyMatrix4(skin);
        planted ??= contact.clone();
        expect(contact.distanceTo(planted)).toBeLessThan(0.00001);
        expect(Math.abs(contact.y)).toBeLessThan(0.00001);
      }
    }
    renderer.dispose();
  });
  it('shares geometry across pooled skeletons, hides culled enemies, and releases resources', async () => {
    const asset = await assetPromise;
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(asset);
    const scene = new THREE.Scene(),
      creatures = new CreatureRenderer(scene),
      sim = new Simulation();
    const slime = scene.getObjectByName('creature-slime:gel');
    await creatures.loadTripoOrc();
    sim.enemies.forEach((e, i) =>
      Object.assign(e, { active: true, kind: 1, x: i % 8, z: -Math.floor(i / 8) * 3 }),
    );
    creatures.update(sim.enemies, 0, 0, 9);
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(MAX_ENEMIES);
    expect(new Set(meshes.map((mesh) => mesh.geometry)).size).toBe(1);
    expect(new Set(meshes.map((mesh) => mesh.skeleton)).size).toBe(MAX_ENEMIES);
    expect(scene.getObjectByName('creature-slime:gel')).toBe(slime);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
    camera.position.set(0, 1.6, 9);
    camera.lookAt(0, 1.6, 20);
    creatures.update(sim.enemies, 0.1, 0, 9, camera);
    expect(scene.children.filter((o) => o.name.startsWith('orc-')).every((o) => !o.visible)).toBe(
      true,
    );
    const dispose = vi.spyOn(meshes[0].geometry, 'dispose');
    creatures.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(scene.children.some((o) => o.name.startsWith('orc-'))).toBe(false);
  });
  it('keeps the corrected face upright while both eyes track the player at every bearing', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    for (const angle of [0, Math.PI / 2, -Math.PI / 3]) {
      for (let frame = 0; frame < 60; frame++) {
        const phase = frame < 30 ? 0 : 1.5;
        const walking = Number(frame >= 30);
        const distance = [0.5, 2, 20][frame % 3];
        renderer.update(0, enemy, angle, phase, walking, distance);
        const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
        const index = mesh.skeleton.bones.findIndex((bone) => bone.name === 'head');
        const transform = new THREE.Matrix4().multiplyMatrices(
          mesh.skeleton.bones[index].matrixWorld,
          mesh.skeleton.boneInverses[index],
        );
        const facing = new THREE.Vector3(0, 0, 1).transformDirection(transform);
        expect(
          facing.distanceTo(new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle))),
        ).toBeLessThan(0.00001);
        expect(new THREE.Vector3(0, 1, 0).transformDirection(transform).y).toBeCloseTo(1, 6);
        const centers = mesh.userData.orc_eye_centers;
        expect(centers[1]).toBeCloseTo(centers[4], 6);
        expect(centers[2]).toBeCloseTo(centers[5], 6);
        const root = scene.getObjectByName('orc-0')!;
        const target = root.localToWorld(new THREE.Vector3(0, 1.6, distance));
        for (const eyeIndex of [0, 1]) {
          const eye = scene.getObjectByName(`orc-eye-0-${eyeIndex}`)!;
          const direction = new THREE.Vector3(0, 0, 1).transformDirection(eye.matrixWorld);
          const aim = target.clone().sub(eye.getWorldPosition(new THREE.Vector3())).normalize();
          expect(direction.distanceTo(aim)).toBeLessThan(0.00001);
        }
      }
    }
    renderer.dispose();
  });
  it('blinks and breathes independently per orc, freezes when paused, and closes its mouth during attacks', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    const mesh = (slot: number) =>
      scene.getObjectByName(`creature-orc-${slot}`) as THREE.SkinnedMesh;
    const value = (slot: number, name: string) =>
      mesh(slot).morphTargetInfluences![mesh(slot).morphTargetDictionary![name]];
    renderer.update(0, enemy, 0, 0, 0, 2, 0);
    expect(value(0, 'Blink')).toBe(0);
    const restingJaw = value(0, 'JawOpen');
    renderer.update(0, enemy, 0, 0, 0, 2, 1.9);
    expect(value(0, 'Blink')).toBeCloseTo(1);
    expect(scene.getObjectByName('creature-orc-eye-0-0')!.visible).toBe(false);
    expect(value(0, 'JawOpen')).not.toBe(restingJaw);
    renderer.update(1, enemy, 0, 0, 0, 2, 1.9);
    expect(value(1, 'Blink')).toBe(0);
    expect(scene.getObjectByName('creature-orc-eye-1-0')!.visible).toBe(true);
    expect(value(0, 'Blink')).toBeCloseTo(1);
    expect(mesh(0).morphTargetInfluences).not.toBe(mesh(1).morphTargetInfluences);
    const frozen = [...mesh(0).morphTargetInfluences!];
    renderer.update(0, enemy, 0, 0, 0, 2, 1.9);
    expect(mesh(0).morphTargetInfluences).toEqual(frozen);
    enemy.windup = 0.1;
    renderer.update(0, enemy, 0, 0, 0, 2, 2.1);
    expect(value(0, 'JawOpen')).toBe(0);
    expect(value(0, 'BrowTense')).toBeGreaterThan(0.7);
    enemy.windup = 0;
    enemy.cooldown = 1.25;
    renderer.update(0, enemy, 0, 0, 0, 2, 2.2);
    expect(value(0, 'JawOpen')).toBe(0);
    enemy.cooldown = 1.1;
    renderer.update(0, enemy, 0, 0, 0, 2, 2.35);
    expect(value(0, 'JawOpen')).toBe(0);
    const geometry = mesh(0).geometry;
    const positions = geometry.getAttribute('position');
    for (const target of geometry.morphAttributes.position!) {
      let moving = 0;
      let bodyDelta = 0;
      for (let i = 0; i < target.count; i++) {
        const delta =
          Math.abs(target.getX(i)) + Math.abs(target.getY(i)) + Math.abs(target.getZ(i));
        if (positions.getY(i) < 2.1) bodyDelta = Math.max(bodyDelta, delta);
        if (delta > 0.00001) moving++;
      }
      expect(bodyDelta).toBe(0);
      expect(moving).toBeGreaterThan(25);
    }
    renderer.dispose();
  });
  it('raises a fist with a straight wrist, slams down at the melee hit, and barely moves the free arm', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    renderer.update(0, enemy, 0, 0, 0);
    const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
    const point = (name: string) =>
      mesh.skeleton.bones.find((b) => b.name === name)!.getWorldPosition(new THREE.Vector3());
    const restHand = point('rightHand');
    const freeHand = point('leftHand');
    const lengths = ['left', 'right'].map((side) => [
      point(`${side}UpperArm`).distanceTo(point(`${side}Forearm`)),
      point(`${side}Forearm`).distanceTo(point(`${side}Hand`)),
    ]);
    enemy.windup = 0.2;
    renderer.update(0, enemy, 0, 0, 0);
    const guard = point('rightHand');
    // Wrist at eye height puts the fist above the face without over-folding the elbow.
    expect(guard.y).toBeGreaterThan(2.4);
    expect(guard.x).toBeGreaterThan(0.6);
    expect(point('leftHand').distanceTo(freeHand)).toBeLessThan(0.025);
    enemy.windup = 0;
    enemy.cooldown = 1.25;
    renderer.update(0, enemy, 0, 0, 0);
    expect(point('rightHand').z).toBeGreaterThan(guard.z + 0.15);
    expect(point('rightHand').y).toBeCloseTo(1.57, 2);
    expect(guard.y - point('rightHand').y).toBeGreaterThan(0.85);
    expect(point('rightHand').x).toBeCloseTo(0.38, 2);
    const positions = mesh.geometry.getAttribute('position');
    const joints = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    const handIndex = mesh.skeleton.bones.findIndex((bone) => bone.name === 'leftHand');
    const fistVertices: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      let handWeight = 0;
      for (let j = 0; j < 4; j++)
        if (joints.getComponent(i, j) === handIndex) handWeight += weights.getComponent(i, j);
      if (handWeight > 0.65 && positions.getY(i) < 1.2) fistVertices.push(i);
    }
    expect(fistVertices.length).toBeGreaterThan(50);
    let lastY = Infinity;
    for (const time of [0.2, 0.35, 0.4, 0.45, 0.5, 0.55, 0.58, 0.65, 0.75, 0.85]) {
      enemy.windup = time < 0.55 ? 0.55 - time : 0;
      enemy.cooldown = time >= 0.55 ? 1.8 - time : 0;
      renderer.update(0, enemy, 0, 0, 0, 2);
      if (time >= 0.4 && time <= 0.55) {
        expect(point('rightHand').y).toBeLessThan(lastY);
        lastY = point('rightHand').y;
      }
      const leftHand = point('leftHand'),
        shoulder = point('leftUpperArm');
      expect(leftHand.distanceTo(freeHand)).toBeLessThan(0.025);
      const fist = new THREE.Box3();
      for (const index of fistVertices)
        fist.expandByPoint(mesh.getVertexPosition(index, new THREE.Vector3()));
      expect(fist.max.y).toBeLessThan(shoulder.y - 0.15);
      for (const [i, side] of ['left', 'right'].entries()) {
        expect(point(`${side}UpperArm`).distanceTo(point(`${side}Forearm`))).toBeCloseTo(
          lengths[i][0],
          4,
        );
        expect(point(`${side}Forearm`).distanceTo(point(`${side}Hand`))).toBeCloseTo(
          lengths[i][1],
          4,
        );
      }
    }
    enemy.cooldown = 0.8;
    renderer.update(0, enemy, 0, 0, 0);
    expect(point('rightHand').distanceTo(restHand)).toBeLessThan(0.00001);
    renderer.dispose();
  });
  it('gives the free fist a tiny sway through attack blends and restores its walk afterward', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    renderer.update(0, enemy, 0, 1.2, 1, 2, 0.4);
    const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
    const positions = mesh.geometry.getAttribute('position'),
      joints = mesh.geometry.getAttribute('skinIndex'),
      weights = mesh.geometry.getAttribute('skinWeight');
    const leftHand = mesh.skeleton.bones.findIndex((bone) => bone.name === 'leftHand');
    const sample: { index: number; position: THREE.Vector3 }[] = [];
    for (let i = 0; i < positions.count; i++) {
      let handWeight = 0;
      for (let j = 0; j < 4; j++)
        if (joints.getComponent(i, j) === leftHand) handWeight += weights.getComponent(i, j);
      if (handWeight > 0.999 && positions.getY(i) < 1.13 && positions.getX(i) < -0.65)
        sample.push({ index: i, position: mesh.getVertexPosition(i, new THREE.Vector3()) });
    }
    expect(sample.length).toBeGreaterThan(500);
    let largestSway = 0;
    for (const time of [0, 0.04, 0.12, 0.2, 0.35, 0.55, 0.7, 0.9, 0.99]) {
      enemy.windup = time < 0.55 ? 0.55 - time : 0;
      enemy.cooldown = time >= 0.55 ? 1.8 - time : 0;
      renderer.update(0, enemy, 0, 1.2 + time, 1, 2, 0.4 + time);
      for (const point of sample) {
        const sway = mesh
          .getVertexPosition(point.index, new THREE.Vector3())
          .distanceTo(point.position);
        largestSway = Math.max(largestSway, sway);
        expect(sway).toBeLessThan(0.025);
      }
    }
    expect(largestSway).toBeGreaterThan(0.005);
    enemy.windup = 0;
    enemy.cooldown = 0;
    renderer.update(0, enemy, 0, 3, 1, 2, 2);
    const freshScene = new THREE.Scene(),
      fresh = new TripoOrcRenderer(freshScene, await assetPromise);
    fresh.update(0, enemy, 0, 3, 1, 2, 2);
    const baseline = freshScene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
    for (const point of sample)
      expect(
        mesh
          .getVertexPosition(point.index, new THREE.Vector3())
          .distanceTo(baseline.getVertexPosition(point.index, new THREE.Vector3())),
      ).toBeLessThan(0.00001);
    fresh.dispose();
    renderer.dispose();
  });
  it('keeps the front armor spike rigid with its plate throughout a punch', async () => {
    const scene = new THREE.Scene();
    const renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    renderer.update(0, enemy, 0, 0, 0);
    const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
    const p = mesh.geometry.getAttribute('position');
    const plate = mesh.skeleton.bones.findIndex((bone) => bone.name === 'leftShoulderPlate');
    const spike: number[] = [];
    // The front spike overlaps the diagonal strap in the imported mesh's UV colors.
    for (let i = 0; i < p.count; i++)
      if (
        p.getX(i) > -0.49 &&
        p.getX(i) < -0.34 &&
        p.getY(i) > 2.18 &&
        p.getY(i) < 2.36 &&
        p.getZ(i) > 0.36
      )
        spike.push(i);
    expect(spike.length).toBeGreaterThan(30);
    for (const time of [0, 0.12, 0.35, 0.5, 0.55, 0.7, 0.9]) {
      enemy.windup = time < 0.55 ? 0.55 - time : 0;
      enemy.cooldown = time >= 0.55 ? 1.8 - time : 0;
      renderer.update(0, enemy, 0, 0, 0);
      const transform = mesh.skeleton.bones[plate].matrixWorld
        .clone()
        .multiply(mesh.skeleton.boneInverses[plate]);
      for (const i of spike) {
        const expected = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(transform);
        expect(mesh.getVertexPosition(i, new THREE.Vector3()).distanceTo(expected)).toBeLessThan(
          0.00001,
        );
      }
    }
    renderer.dispose();
  });
  it('isolates the inner collar from arm motion and preserves the fist at the raised peak', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    renderer.update(0, enemy, 0, 0, 0);
    const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
    const p = mesh.geometry.getAttribute('position'),
      j = mesh.geometry.getAttribute('skinIndex'),
      w = mesh.geometry.getAttribute('skinWeight');
    const armGroups = mesh.skeleton.bones
      .map((b, i) => (/Arm|Hand/.test(b.name) ? i : -1))
      .filter((i) => i >= 0);
    let collar = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 2.02 && p.getY(i) < 2.2 && p.getX(i) > 0.15 && p.getX(i) < 0.38) {
        let armWeight = 0;
        for (let k = 0; k < 4; k++)
          if (armGroups.includes(j.getComponent(i, k))) armWeight += w.getComponent(i, k);
        expect(armWeight).toBeLessThan(0.00001);
        collar++;
      }
    }
    expect(collar).toBeGreaterThan(100);
    enemy.windup = 0.2;
    renderer.update(0, enemy, 0, 0, 0, 1.5);
    const bone = (name: string) => mesh.skeleton.bones.find((b) => b.name === name)!;
    const skin = (name: string) =>
      new THREE.Matrix4().multiplyMatrices(
        bone(name).matrixWorld,
        mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(bone(name))],
      );
    const hand = skin('rightHand'),
      forearm = skin('rightForearm');
    const restPoint = (name: string) =>
      new THREE.Vector3().setFromMatrixPosition(
        mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(bone(name))].clone().invert(),
      );
    const hingeNormal = restPoint('rightForearm')
      .sub(restPoint('rightUpperArm'))
      .cross(restPoint('rightHand').sub(restPoint('rightForearm')))
      .normalize();
    expect(
      hingeNormal
        .clone()
        .transformDirection(skin('rightUpperArm'))
        .dot(hingeNormal.clone().transformDirection(forearm)),
    ).toBeGreaterThan(0.5);
    expect(
      new THREE.Quaternion()
        .setFromRotationMatrix(hand)
        .normalize()
        .angleTo(new THREE.Quaternion().setFromRotationMatrix(forearm).normalize()),
    ).toBeLessThan(0.00001);
    let fist = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 1.13 && p.getY(i) > 0.75 && p.getX(i) > 0.7 && p.getX(i) < 1.05) {
        const expected = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(hand);
        expect(mesh.getVertexPosition(i, new THREE.Vector3()).distanceTo(expected)).toBeLessThan(
          0.00001,
        );
        fist++;
      }
    }
    expect(fist).toBeGreaterThan(1000);
    renderer.dispose();
  });
  it('keeps the forearm core rigid throughout the slam instead of stretching it back to the torso', async () => {
    const scene = new THREE.Scene();
    const renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    renderer.update(0, enemy, 0, 0, 0);
    const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
    const positions = mesh.geometry.getAttribute('position');
    const forearm = mesh.skeleton.bones.findIndex((b) => b.name === 'rightForearm');
    const core: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      if (
        positions.getX(i) > 0.7 &&
        positions.getX(i) < 1.0 &&
        positions.getY(i) > 1.3 &&
        positions.getY(i) < 1.5
      )
        core.push(i);
    }
    expect(core.length).toBeGreaterThan(100);
    for (const time of [0.15, 0.35, 0.5, 0.55, 0.7, 0.9]) {
      enemy.windup = time < 0.55 ? 0.55 - time : 0;
      enemy.cooldown = time >= 0.55 ? 1.8 - time : 0;
      renderer.update(0, enemy, 0, 0, 0);
      const skin = new THREE.Matrix4().multiplyMatrices(
        mesh.skeleton.bones[forearm].matrixWorld,
        mesh.skeleton.boneInverses[forearm],
      );
      for (const index of core) {
        const expected = new THREE.Vector3()
          .fromBufferAttribute(positions, index)
          .applyMatrix4(skin);
        expect(
          mesh.getVertexPosition(index, new THREE.Vector3()).distanceTo(expected),
        ).toBeLessThan(0.00001);
      }
    }
    renderer.dispose();
  });
  it('returns the punching arm without wrist flips or torn shoulder triangles', async () => {
    const scene = new THREE.Scene();
    const renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    renderer.update(0, enemy, 0, 0, 0);
    const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
    const bones = ['rightUpperArm', 'rightForearm', 'rightHand'].map((name) =>
      mesh.skeleton.bones.find((bone) => bone.name === name)!,
    );
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.index!;
    const edges: [number, number, number][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < indices.count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = indices.getX(i + k),
          b = indices.getX(i + ((k + 1) % 3));
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (
          positions.getX(a) < 0.5 ||
          positions.getX(b) < 0.5 ||
          positions.getY(a) < 1.45 ||
          positions.getY(a) > 2.3
        )
          continue;
        const length = new THREE.Vector3()
          .fromBufferAttribute(positions, a)
          .distanceTo(new THREE.Vector3().fromBufferAttribute(positions, b));
        if (length > 0.004) edges.push([a, b, length]);
      }
    }
    expect(edges.length).toBeGreaterThan(1000);
    let previous: THREE.Quaternion[] | undefined;
    for (let frame = 0; frame <= 100; frame++) {
      const time = frame / 100;
      enemy.windup = time < 0.55 ? 0.55 - time : 0;
      enemy.cooldown = time >= 0.55 ? 1.8 - time : 0;
      renderer.update(0, enemy, 0, 0, 0);
      const rotations = bones.map((bone) => bone.getWorldQuaternion(new THREE.Quaternion()));
      if (previous)
        rotations.forEach((rotation, i) => {
          // The old per-frame hinge sign switch jumped 117 degrees in 10 ms.
          expect(rotation.angleTo(previous![i])).toBeLessThan(THREE.MathUtils.degToRad(15));
        });
      previous = rotations;
      if (frame % 5 !== 0) continue;
      const vertices = new Map<number, THREE.Vector3>();
      const vertex = (index: number) => {
        if (!vertices.has(index))
          vertices.set(index, mesh.getVertexPosition(index, new THREE.Vector3()));
        return vertices.get(index)!;
      };
      let largestStretch = 0;
      for (const [a, b, length] of edges)
        largestStretch = Math.max(largestStretch, vertex(a).distanceTo(vertex(b)) / length);
      // Catch the narrow shoulder spikes that previously stretched 14–27x.
      expect(largestStretch).toBeLessThan(5);
    }
    renderer.dispose();
  });
  it('keeps the tracking eyes small and seated in the original sculpted sockets', async () => {
    const scene = new THREE.Scene();
    const renderer = new TripoOrcRenderer(scene, await assetPromise);
    const enemy = new Simulation().enemies[0];
    for (const time of [0, 0.15, 0.35, 0.5, 0.55, 0.7, 0.9]) {
      enemy.windup = time < 0.55 ? 0.55 - time : 0;
      enemy.cooldown = time >= 0.55 ? 1.8 - time : 0;
      renderer.update(0, enemy, 0, 0, 0, 1.35, 4);
      const body = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
      const centers = body.userData.orc_eye_centers as number[];
      for (const side of [0, 1]) {
        const group = scene.getObjectByName(`orc-eye-0-${side}`)!;
        const surface = scene.getObjectByName(`creature-orc-eye-0-${side}`) as THREE.Mesh;
        expect(surface.scale.x).toBeLessThanOrEqual(0.032);
        expect(surface.scale.z).toBeLessThanOrEqual(0.032);
        expect(
          group.position.distanceTo(new THREE.Vector3().fromArray(centers, side * 3)),
        ).toBeLessThan(0.02);
      }
    }
    // The source eye surface remains intact; it is not cut open for oversized globes.
    expect(gltf.accessors[gltf.meshes[0].primitives[0].indices].count / 3).toBeGreaterThan(119900);
    renderer.dispose();
  });
  it('binds the eye sockets entirely to the head so strikes cannot pull them away from the eyes', async () => {
    const scene = new THREE.Scene(),
      renderer = new TripoOrcRenderer(scene, await assetPromise);
    renderer.update(0, new Simulation().enemies[0], 0, 0, 0);
    const mesh = scene.getObjectByName('creature-orc-0') as THREE.SkinnedMesh;
    const position = mesh.geometry.getAttribute('position');
    const joints = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    const head = mesh.skeleton.bones.findIndex((bone) => bone.name === 'head');
    let socketVertices = 0;
    for (let i = 0; i < position.count; i++) {
      if (
        position.getY(i) > 2.32 &&
        position.getZ(i) > 0.26 &&
        Math.abs(position.getX(i) - 0.07) < 0.24
      ) {
        let headWeight = 0;
        for (let j = 0; j < 4; j++)
          if (joints.getComponent(i, j) === head) headWeight += weights.getComponent(i, j);
        expect(headWeight).toBeCloseTo(1, 6);
        socketVertices++;
      }
    }
    expect(socketVertices).toBeGreaterThan(1000);
    renderer.dispose();
  });
  it('rejects a missing animation and disposes a rig that loads after shutdown', async () => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({
      ...(await assetPromise),
      animations: [],
    });
    await expect(loadTripoOrcAsset()).rejects.toThrow('Missing orc Idle animation');
    let resolve!: (asset: Awaited<typeof assetPromise>) => void;
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const scene = new THREE.Scene(),
      creatures = new CreatureRenderer(scene);
    const loading = creatures.loadTripoOrc();
    creatures.dispose();
    resolve(await assetPromise);
    await loading;
    expect(scene.children.some((o) => o.name.startsWith('orc-'))).toBe(false);
    expect(TRIPO_ORC_URL).toContain('rigged');
  });
});
