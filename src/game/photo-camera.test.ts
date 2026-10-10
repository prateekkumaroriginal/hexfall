import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PhotoCamera } from './photo-camera';

describe('photo camera', () => {
  it('moves and frames a shot without changing the gameplay camera or its children', () => {
    const gameplay = new THREE.PerspectiveCamera(60, 16 / 9);
    gameplay.position.set(3, 1.6, 9);
    gameplay.rotation.set(0.2, 0.7, 0, 'YXZ');
    const light = new THREE.PointLight();
    gameplay.add(light);
    const position = gameplay.position.clone();
    const rotation = gameplay.quaternion.clone();
    const photo = new PhotoCamera(gameplay);
    photo.look(0.5, -0.3);
    photo.move(1, 1, 1, 1, false);
    photo.setFieldOfView(40);
    expect(photo.camera.position.equals(position)).toBe(false);
    expect(gameplay.position.equals(position)).toBe(true);
    expect(gameplay.quaternion.equals(rotation)).toBe(true);
    expect(gameplay.fov).toBe(60);
    expect(light.parent).toBe(gameplay);
    expect(photo.camera.children).toHaveLength(0);
  });

  it('keeps diagonal travel at the same speed and movement level when looking up', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9);
    camera.position.y = 2;
    const straight = new PhotoCamera(camera);
    const diagonal = new PhotoCamera(camera);
    straight.look(0, -1);
    straight.move(0.1, 1, 0, 0, false);
    diagonal.move(0.1, 1, 1, 0, false);
    expect(straight.camera.position.y).toBe(2);
    expect(straight.camera.position.distanceTo(camera.position)).toBeCloseTo(
      diagonal.camera.position.distanceTo(camera.position),
    );
  });

  it('restores the entry view after reframing and resizing', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9);
    camera.position.set(-2, 1.6, 7);
    camera.rotation.set(0.1, -0.4, 0, 'YXZ');
    const photo = new PhotoCamera(camera);
    const projection = photo.camera.projectionMatrix.clone();
    photo.move(1, 1, 0, 0, true);
    photo.look(0.5, 0.5);
    photo.setHeight(5);
    photo.setFieldOfView(35);
    photo.resize(1);
    photo.reset();
    photo.resize(16 / 9);
    expect(photo.camera.position.equals(camera.position)).toBe(true);
    expect(photo.camera.quaternion.angleTo(camera.quaternion)).toBeCloseTo(0);
    expect(photo.camera.projectionMatrix.equals(projection)).toBe(true);
  });
});
