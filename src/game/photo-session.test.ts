import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { required } from '../lib/assert';
import { PHOTO_MODE } from '../config/photo-mode';
import { PointerLockController } from './pointer-lock';
import { PhotoSession } from './photo-session';
import type { PhotoSnapshot } from './photo-mode';

afterEach(() => vi.useRealTimers());

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {
    promise,
    resolve: (value: T) => required(resolve, 'Missing resolve')(value),
    reject: (error: Error) => required(reject, 'Missing reject')(error),
  };
}

function fixture() {
  let locked = false;
  let notify: (owner: object, locked: boolean) => void = () => {};
  const requests: ReturnType<typeof deferred<void>>[] = [];
  const request = vi.fn(() => {
    const next = deferred<void>();
    requests.push(next);
    return next.promise;
  });
  const pointer = new PointerLockController(
    {
      request,
      release: () => {
        locked = false;
        pointer.handleChange();
      },
      focus: () => {},
      isLocked: () => locked,
    },
    (owner, value) => notify(owner, value),
  );
  const gameplay = new THREE.PerspectiveCamera(60, 16 / 9);
  gameplay.position.set(2, 1.6, 8);
  const image = new Blob(['frame'], { type: 'image/png' });
  const capture = vi
    .fn<(camera: THREE.PerspectiveCamera) => Promise<Blob>>()
    .mockResolvedValue(image);
  const download = vi.fn<(image: Blob) => void>();
  const onUpdate = vi.fn<(snapshot: PhotoSnapshot | null) => void>();
  const onCameraChange = vi.fn<(camera: THREE.PerspectiveCamera) => void>();
  const onExit = vi.fn(() => session.close());
  const hooks = { capture, download, onUpdate, onCameraChange, onExit };
  const session = new PhotoSession(gameplay, pointer, hooks);
  notify = (owner, value) => {
    if (owner === session) session.pointerLockChanged(value);
  };
  function acquire(index: number) {
    locked = true;
    pointer.handleChange();
    required(requests[index], 'Missing request').resolve();
  }
  function unlock() {
    locked = false;
    pointer.handleChange();
  }
  const snapshot = () => required(onUpdate.mock.calls.at(-1)?.[0], 'Missing snapshot');
  return {
    session,
    pointer,
    gameplay,
    image,
    hooks,
    requests,
    request,
    capture,
    download,
    onUpdate,
    onExit,
    snapshot,
    acquire,
    unlock,
  };
}

function key(code: string) {
  return {
    code,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    target: null,
    preventDefault: vi.fn(),
  };
}

describe('photo session lifecycle', () => {
  it('honors returning to controls during a delayed mouse-lock request', async () => {
    const f = fixture();
    const pending = f.session.enableMouseLook();
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.session.releaseCursor();
    f.acquire(0);
    await pending;
    expect(f.snapshot()).toMatchObject({
      mouseLook: false,
      controlsHidden: false,
      failed: false,
      message: '',
    });
    expect(f.onExit).not.toHaveBeenCalled();
  });

  it('does not let an old result release the new gameplay owner', async () => {
    const f = fixture();
    const pending = f.session.enableMouseLook();
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.session.close();
    const gameplayOwner = {};
    const gameplay = f.pointer.request(gameplayOwner);
    f.acquire(0);
    await pending;
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    f.acquire(1);
    expect(await gameplay).toBe(true);
    expect(f.pointer.owns(gameplayOwner)).toBe(true);
    expect(f.onUpdate).toHaveBeenLastCalledWith(null);
  });

  it('preserves the latest look intent when controls are toggled during acquisition', async () => {
    const f = fixture();
    const old = f.session.enableMouseLook();
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.session.releaseCursor();
    const latest = f.session.enableMouseLook();
    f.acquire(0);
    await old;
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    f.acquire(1);
    await latest;
    expect(f.snapshot()).toMatchObject({ mouseLook: true, failed: false });
  });

  it('releases a pending request on Tab and closes on native Escape loss', async () => {
    const f = fixture();
    const pending = f.session.enableMouseLook();
    const tab = key('Tab');
    f.session.keyDown(tab);
    await pending;
    expect(tab.preventDefault).toHaveBeenCalled();
    expect(f.snapshot().mouseLook).toBe(false);
    const retry = f.session.enableMouseLook();
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.acquire(0);
    await retry;
    f.unlock();
    expect(f.onExit).toHaveBeenCalledOnce();
    expect(f.onUpdate).toHaveBeenLastCalledWith(null);
  });

  it('shows a recoverable lock error and accepts a later retry', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const pending = f.session.enableMouseLook();
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    required(f.requests[0], 'Missing request').reject(new Error('Denied'));
    await pending;
    expect(f.snapshot()).toMatchObject({ mouseLook: false, controlsHidden: false, failed: true });
    vi.advanceTimersByTime(PHOTO_MODE.MESSAGE_DURATION_MILLISECONDS);
    expect(f.snapshot().message).toBe('');
    const retry = f.session.enableMouseLook();
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    f.acquire(1);
    await retry;
    expect(f.snapshot().mouseLook).toBe(true);
    f.session.close();
  });

  it('moves independently, flushes height changes, and clears held keys on release', () => {
    const f = fixture();
    const playerPosition = f.gameplay.position.clone();
    f.session.keyDown(key('KeyE'));
    f.session.step(0.1);
    expect(f.onUpdate).not.toHaveBeenCalled();
    f.session.flushSnapshot();
    expect(f.snapshot().height).toBeGreaterThan(playerPosition.y);
    const updates = f.onUpdate.mock.calls.length;
    f.session.flushSnapshot();
    expect(f.onUpdate).toHaveBeenCalledTimes(updates);
    f.session.releaseCursor();
    const height = f.session.camera.position.y;
    f.session.step(0.1);
    expect(f.session.camera.position.y).toBe(height);
    expect(f.gameplay.position.equals(playerPosition)).toBe(true);
    f.session.resetCamera();
    expect(f.session.camera.position.equals(playerPosition)).toBe(true);
  });

  it('prevents duplicate captures and expires a successful notification', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const encoded = deferred<Blob>();
    f.capture.mockReturnValue(encoded.promise);
    const pending = f.session.capture();
    await f.session.capture();
    expect(f.capture).toHaveBeenCalledOnce();
    expect(f.snapshot().saving).toBe(true);
    encoded.resolve(f.image);
    await pending;
    expect(f.download).toHaveBeenCalledExactlyOnceWith(f.image);
    expect(f.snapshot()).toMatchObject({ saving: false, message: 'Photo saved', failed: false });
    vi.advanceTimersByTime(PHOTO_MODE.MESSAGE_DURATION_MILLISECONDS);
    expect(f.snapshot().message).toBe('');
  });

  it('recovers from a failed encode, expires its message, and permits another capture', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.capture.mockRejectedValueOnce(new Error('Encoding failed'));
    await f.session.capture();
    expect(f.snapshot()).toMatchObject({ saving: false, failed: true });
    expect(f.download).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PHOTO_MODE.MESSAGE_DURATION_MILLISECONDS);
    expect(f.snapshot()).toMatchObject({ message: '', failed: false });
    await f.session.capture();
    expect(f.download).toHaveBeenCalledOnce();
    f.session.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an unfinished capture without updating a newer session', async () => {
    const f = fixture();
    const encoded = deferred<Blob>();
    f.capture.mockReturnValueOnce(encoded.promise);
    const pending = f.session.capture();
    f.session.close();
    const next = new PhotoSession(f.gameplay, f.pointer, f.hooks);
    next.updateControls({ fieldOfView: 40 });
    const snapshot = f.snapshot();
    encoded.resolve(f.image);
    await pending;
    expect(f.snapshot()).toEqual(snapshot);
    expect(f.download).not.toHaveBeenCalled();
    next.close();
  });

  it('keeps an older timer from clearing a new capture notification', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.session.capture();
    vi.advanceTimersByTime(2000);
    await f.session.capture();
    vi.advanceTimersByTime(1000);
    expect(f.snapshot().message).toBe('Photo saved');
    vi.advanceTimersByTime(2000);
    expect(f.snapshot().message).toBe('');
    f.session.close();
  });
});
