import * as THREE from 'three';
import { PHOTO_MODE } from '../config/photo-mode';
import { ARENA_HALF_DEPTH, ARENA_HALF_WIDTH } from '../config/world';
import { verticalFieldOfView } from './camera';

export class PhotoCamera {
  readonly camera: THREE.PerspectiveCamera;
  fieldOfView: number = PHOTO_MODE.FIELD_OF_VIEW.DEFAULT;
  private origin: THREE.Vector3;
  private rotation: THREE.Euler;
  private movement = new THREE.Vector3();

  constructor(gameplayCamera: THREE.PerspectiveCamera) {
    // Copy only the camera. The gameplay camera and its lights remain in place.
    this.camera = new THREE.PerspectiveCamera().copy(gameplayCamera, false);
    this.camera.rotation.reorder('YXZ');
    this.origin = this.camera.position.clone();
    this.rotation = this.camera.rotation.clone();
    this.resize(gameplayCamera.aspect);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.fov = verticalFieldOfView(this.fieldOfView, aspect);
    this.camera.updateProjectionMatrix();
  }

  setFieldOfView(value: number) {
    if (!Number.isFinite(value)) return;
    this.fieldOfView = THREE.MathUtils.clamp(
      value,
      PHOTO_MODE.FIELD_OF_VIEW.MIN,
      PHOTO_MODE.FIELD_OF_VIEW.MAX,
    );
    this.resize(this.camera.aspect);
  }

  setHeight(value: number) {
    if (!Number.isFinite(value)) return;
    this.camera.position.y = THREE.MathUtils.clamp(
      value,
      PHOTO_MODE.HEIGHT_UNITS.MIN,
      PHOTO_MODE.HEIGHT_UNITS.MAX,
    );
  }

  look(horizontal: number, vertical: number) {
    this.camera.rotation.y -= horizontal;
    this.camera.rotation.x = THREE.MathUtils.clamp(
      this.camera.rotation.x - vertical,
      -PHOTO_MODE.PITCH_LIMIT_RADIANS,
      PHOTO_MODE.PITCH_LIMIT_RADIANS,
    );
  }

  move(dt: number, forward: number, strafe: number, vertical: number, fast: boolean) {
    const yaw = this.camera.rotation.y;
    this.movement.set(
      -Math.sin(yaw) * forward + Math.cos(yaw) * strafe,
      vertical,
      -Math.cos(yaw) * forward - Math.sin(yaw) * strafe,
    );
    this.movement.divideScalar(Math.max(1, this.movement.length()));
    const speed =
      PHOTO_MODE.MOVEMENT_SPEED_UNITS_PER_SECOND * (fast ? PHOTO_MODE.FAST_MOVEMENT_MULTIPLIER : 1);
    this.camera.position.addScaledVector(this.movement, speed * dt);
    const position = this.camera.position;
    position.x = THREE.MathUtils.clamp(
      position.x,
      -ARENA_HALF_WIDTH - PHOTO_MODE.ARENA_MARGIN_UNITS,
      ARENA_HALF_WIDTH + PHOTO_MODE.ARENA_MARGIN_UNITS,
    );
    position.z = THREE.MathUtils.clamp(
      position.z,
      -ARENA_HALF_DEPTH - PHOTO_MODE.ARENA_MARGIN_UNITS,
      ARENA_HALF_DEPTH + PHOTO_MODE.ARENA_MARGIN_UNITS,
    );
    this.setHeight(position.y);
  }

  reset() {
    this.camera.position.copy(this.origin);
    this.camera.rotation.copy(this.rotation);
    this.setFieldOfView(PHOTO_MODE.FIELD_OF_VIEW.DEFAULT);
  }
}
