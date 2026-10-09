import { isBone, isSkinnedMesh } from './three-types';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { at, required } from '../lib/assert';
import { ORC_ANIMATION } from '../config/rendering';

type BoneBinding = { bone: THREE.Bone; parent: THREE.Object3D };
export type OrcRig = {
  face: THREE.SkinnedMesh;
  head: THREE.Bone;
  headInverse: THREE.Matrix4;
  eyeCenters: readonly [number, number, number, number, number, number];
  freeArm: readonly [BoneBinding, BoneBinding, BoneBinding];
  expressions: { Blink: number; JawOpen: number; BrowTense: number };
  influences: number[];
};
export type OrcAsset = {
  scene: THREE.Group;
  clips: { Idle: THREE.AnimationClip; Walk: THREE.AnimationClip; Punch: THREE.AnimationClip };
};

function boneBinding(bones: readonly THREE.Bone[], name: string): BoneBinding {
  const bone = bones.find((candidate) => candidate.name === name);
  if (!isBone(bone)) throw new Error(`Missing orc ${name} bone`);
  return { bone, parent: required(bone.parent, `Missing orc ${name} parent`) };
}

function coordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Invalid orc eye landmarks');
  return value;
}

export function validateOrcRig(root: THREE.Group): OrcRig {
  const faces: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if (isSkinnedMesh(object)) faces.push(object);
  });
  const face = required(
    faces.find((mesh) => {
      const dictionary = mesh.morphTargetDictionary;
      return (
        dictionary &&
        ['Blink', 'JawOpen', 'BrowTense'].every((name) => dictionary[name] !== undefined)
      );
    }),
    'Missing orc face with Blink, JawOpen and BrowTense poses',
  );
  const dictionary = required(face.morphTargetDictionary, 'Missing orc face pose dictionary');
  const influences = required(face.morphTargetInfluences, 'Missing orc pose influences');
  const expression = (name: string) => {
    const index = dictionary[name];
    if (index === undefined || !Number.isInteger(index) || index < 0 || index >= influences.length)
      throw new Error(`Invalid orc ${name} pose`);
    const influence = influences[index];
    if (typeof influence !== 'number' || !Number.isFinite(influence))
      throw new Error(`Invalid orc ${name} influence`);
    return index;
  };
  const headIndex = face.skeleton.bones.findIndex((bone) => bone.name === 'head');
  const head = required(face.skeleton.bones[headIndex], 'Missing orc head bone');
  const headInverse = required(face.skeleton.boneInverses[headIndex], 'Missing orc head inverse');
  if (!headInverse.elements.every(Number.isFinite)) throw new Error('Invalid orc head inverse');
  const metadata: Record<string, unknown> = face.userData;
  const landmarks = metadata['orc_eye_centers'];
  if (!Array.isArray(landmarks) || landmarks.length !== 6)
    throw new Error('Missing orc eye landmarks');
  const centers: unknown[] = landmarks;
  return {
    face,
    head,
    headInverse,
    eyeCenters: [
      coordinate(at(centers, 0)),
      coordinate(at(centers, 1)),
      coordinate(at(centers, 2)),
      coordinate(at(centers, 3)),
      coordinate(at(centers, 4)),
      coordinate(at(centers, 5)),
    ],
    freeArm: [
      boneBinding(face.skeleton.bones, 'leftUpperArm'),
      boneBinding(face.skeleton.bones, 'leftForearm'),
      boneBinding(face.skeleton.bones, 'leftHand'),
    ],
    expressions: {
      Blink: expression('Blink'),
      JawOpen: expression('JawOpen'),
      BrowTense: expression('BrowTense'),
    },
    influences,
  };
}

export function validateOrcAsset(asset: GLTF): OrcAsset {
  const clip = (name: keyof OrcAsset['clips']) => {
    const animation = required(
      asset.animations.find((animation) => animation.name === name),
      `Missing orc ${name} animation`,
    );
    if (!Number.isFinite(animation.duration) || animation.duration <= 0)
      throw new Error(`Invalid orc ${name} animation duration`);
    return animation;
  };
  const clips = { Idle: clip('Idle'), Walk: clip('Walk'), Punch: clip('Punch') };
  if (
    clips.Punch.duration <=
    Math.max(
      ORC_ANIMATION.PUNCH_IMPACT_SECONDS,
      ORC_ANIMATION.PUNCH_BLEND_IN_SECONDS,
      ORC_ANIMATION.PUNCH_BLEND_OUT_SECONDS,
    )
  )
    throw new Error('Orc Punch animation is too short for configured impact and blend times');
  validateOrcRig(asset.scene);
  return { scene: asset.scene, clips };
}
