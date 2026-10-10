import type * as THREE from 'three';
import { PHOTO_MODE } from '../config/photo-mode';
import { PhotoCamera } from './photo-camera';
import type { PhotoControls, PhotoSnapshot } from './photo-mode';
import type { PointerLockController } from './pointer-lock';

interface PhotoSessionHooks {
  onUpdate(snapshot: PhotoSnapshot | null): void;
  onExit(): void;
  onCameraChange(camera: THREE.PerspectiveCamera): void;
  capture(camera: THREE.PerspectiveCamera): Promise<Blob>;
  download(image: Blob): void;
}

type Notice = { kind: 'success' | 'error'; message: string };
type PhotoKeyEvent = Pick<
  KeyboardEvent,
  'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat' | 'target' | 'preventDefault'
>;
const movementKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);

export class PhotoSession {
  private view: PhotoCamera;
  private controls = { grid: false, showStaff: false, controlsHidden: false };
  private keys = new Set<string>();
  private pointerIntent: 'controls' | 'look' = 'controls';
  private lookRequest = 0;
  private active = true;
  private heightChanged = false;
  private saving = false;
  private notice: Notice | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    gameplayCamera: THREE.PerspectiveCamera,
    private pointer: PointerLockController,
    private hooks: PhotoSessionHooks,
  ) {
    this.view = new PhotoCamera(gameplayCamera);
  }

  get camera() {
    return this.view.camera;
  }
  get showStaff() {
    return this.controls.showStaff;
  }
  get mouseLook() {
    return this.pointerIntent === 'look' && this.pointer.owns(this);
  }

  enter() {
    if (!this.active) return;
    this.emit();
    void this.enableMouseLook();
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.lookRequest++;
    this.keys.clear();
    this.clearNotice();
    this.pointer.release(this);
    this.hooks.onUpdate(null);
  }

  async enableMouseLook() {
    if (!this.active || this.mouseLook) return;
    const request = ++this.lookRequest;
    this.pointerIntent = 'look';
    this.keys.clear();
    try {
      const locked = await this.pointer.request(this);
      if (!this.active || this.lookRequest !== request) return;
      if (!locked) throw new Error('Mouse capture did not complete');
      this.emit();
    } catch {
      if (!this.active || this.lookRequest !== request) return;
      this.pointerIntent = 'controls';
      this.controls.controlsHidden = false;
      this.setNotice('Mouse capture was blocked. Click the scene to try again.', 'error');
      this.emit();
    }
  }

  releaseCursor() {
    if (!this.active) return;
    this.lookRequest++;
    this.pointerIntent = 'controls';
    this.keys.clear();
    this.controls.controlsHidden = false;
    this.pointer.release(this);
    this.emit();
  }

  pointerLockChanged(locked: boolean) {
    if (!this.active) return;
    if (!locked && this.pointerIntent === 'look') this.hooks.onExit();
    else this.emit();
  }

  updateControls(controls: Partial<PhotoControls>) {
    if (!this.active) return;
    if (controls.fieldOfView !== undefined) {
      this.view.setFieldOfView(controls.fieldOfView);
      this.hooks.onCameraChange(this.camera);
    }
    if (controls.height !== undefined) this.view.setHeight(controls.height);
    if (controls.grid !== undefined) this.controls.grid = controls.grid;
    if (controls.showStaff !== undefined) this.controls.showStaff = controls.showStaff;
    if (controls.controlsHidden !== undefined) {
      this.controls.controlsHidden = controls.controlsHidden;
      if (controls.controlsHidden) void this.enableMouseLook();
      else this.releaseCursor();
    }
    this.emit();
  }

  resetCamera() {
    if (!this.active) return;
    this.keys.clear();
    this.view.reset();
    this.hooks.onCameraChange(this.camera);
    this.emit();
  }

  resize(aspect: number) {
    this.view.resize(aspect);
  }

  look(horizontal: number, vertical: number) {
    if (this.active && this.mouseLook) this.view.look(horizontal, vertical);
  }

  keyDown(event: PhotoKeyEvent) {
    if (!this.active) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.hooks.onExit();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === 'Tab' && this.pointerIntent === 'look') {
      event.preventDefault();
      if (!event.repeat) this.releaseCursor();
      return;
    }
    if (event.code === 'KeyH') {
      event.preventDefault();
      if (!event.repeat) this.updateControls({ controlsHidden: !this.controls.controlsHidden });
      return;
    }
    if (
      event.target &&
      event.target instanceof HTMLElement &&
      event.target.closest('input, select, textarea, [contenteditable="true"]')
    )
      return;
    if (event.code === 'Enter') {
      if (event.target && event.target instanceof HTMLElement && event.target.closest('button'))
        return;
      event.preventDefault();
      if (!event.repeat) void this.capture();
    } else if (movementKeys.has(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
    }
  }

  keyUp(code: string) {
    this.keys.delete(code);
  }

  step(dt: number) {
    if (!this.active) return;
    const oldHeight = this.camera.position.y;
    this.view.move(
      dt,
      Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
        Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')),
      Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
        Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')),
      Number(this.keys.has('KeyE')) - Number(this.keys.has('KeyQ')),
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    );
    this.heightChanged ||= oldHeight !== this.camera.position.y;
  }

  flushSnapshot() {
    if (this.heightChanged) this.emit();
  }

  async capture() {
    if (!this.active || this.saving) return;
    this.saving = true;
    this.clearNotice();
    this.emit();
    try {
      const image = await this.hooks.capture(this.camera);
      if (!this.active) return;
      this.hooks.download(image);
      this.setNotice('Photo saved', 'success');
    } catch {
      if (!this.active) return;
      this.setNotice('The photo could not be captured. Try again.', 'error');
    } finally {
      this.saving = false;
      if (this.active) this.emit();
    }
  }

  private clearNotice() {
    clearTimeout(this.noticeTimer);
    this.noticeTimer = undefined;
    this.notice = null;
  }

  private setNotice(message: string, kind: Notice['kind']) {
    this.clearNotice();
    this.notice = { kind, message };
    this.noticeTimer = setTimeout(() => {
      this.clearNotice();
      this.emit();
    }, PHOTO_MODE.MESSAGE_DURATION_MILLISECONDS);
  }

  private emit() {
    if (!this.active) return;
    this.heightChanged = false;
    this.hooks.onUpdate({
      ...this.controls,
      fieldOfView: this.view.fieldOfView,
      height: Number(this.camera.position.y.toFixed(1)),
      mouseLook: this.mouseLook,
      saving: this.saving,
      message: this.notice?.message ?? '',
      failed: this.notice?.kind === 'error',
    });
  }
}
