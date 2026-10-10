import { describe, expect, it, vi } from 'vitest';
import { required } from '../lib/assert';
import { PointerLockController } from './pointer-lock';

function deferred() {
  let resolve: (() => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {
    promise,
    resolve: () => required(resolve, 'Missing resolve')(),
    reject: (error: Error) => required(reject, 'Missing reject')(error),
  };
}

function fixture(delayedUnlock = false) {
  let locked = false;
  const requests: ReturnType<typeof deferred>[] = [];
  const request = vi.fn(() => {
    const next = deferred();
    requests.push(next);
    return next.promise;
  });
  const onChange = vi.fn<(owner: object, locked: boolean) => void>();
  const focus = vi.fn();
  const release = vi.fn(() => {
    if (!delayedUnlock) unlock();
  });
  const pointer = new PointerLockController(
    { request, release, focus, isLocked: () => locked },
    onChange,
  );
  function unlock() {
    locked = false;
    pointer.handleChange();
  }
  function acquire(index: number) {
    locked = true;
    pointer.handleChange();
    required(requests[index], 'Missing request').resolve();
  }
  return { pointer, requests, request, release, onChange, focus, unlock, acquire };
}

describe('pointer lock ownership', () => {
  it('cancels a request before it reaches the native API', async () => {
    const { pointer, request } = fixture();
    const owner = {};
    const pending = pointer.request(owner);
    pointer.release(owner);
    expect(await pending).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('releases a delayed acquisition after the user switches to controls', async () => {
    const f = fixture();
    const owner = {};
    const pending = f.pointer.request(owner);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.pointer.release(owner);
    f.acquire(0);
    expect(await pending).toBe(false);
    expect(f.pointer.owns(owner)).toBe(false);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.onChange).not.toHaveBeenCalled();
    expect(f.focus).not.toHaveBeenCalled();
  });

  it('serializes owners so an old result cannot release the newer session lock', async () => {
    const f = fixture();
    const oldOwner = {},
      newOwner = {};
    const old = f.pointer.request(oldOwner);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.pointer.release(oldOwner);
    const next = f.pointer.request(newOwner);
    f.acquire(0);
    expect(await old).toBe(false);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    f.acquire(1);
    expect(await next).toBe(true);
    f.pointer.release(oldOwner);
    expect(f.pointer.owns(newOwner)).toBe(true);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.onChange).toHaveBeenCalledExactlyOnceWith(newOwner, true);
  });

  it('skips obsolete queued owners and grants the latest request', async () => {
    const f = fixture();
    const first = f.pointer.request({});
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    const skipped = f.pointer.request({});
    const latestOwner = {};
    const latest = f.pointer.request(latestOwner);
    f.acquire(0);
    expect(await first).toBe(false);
    expect(await skipped).toBe(false);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    f.acquire(1);
    expect(await latest).toBe(true);
    expect(f.pointer.owns(latestOwner)).toBe(true);
  });

  it('shares repeated requests from the same owner', async () => {
    const f = fixture();
    const owner = {};
    const first = f.pointer.request(owner);
    expect(f.pointer.request(owner)).toBe(first);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.acquire(0);
    expect(await first).toBe(true);
    expect(await f.pointer.request(owner)).toBe(true);
    expect(f.request).toHaveBeenCalledTimes(1);
  });

  it('waits for native unlock acknowledgement before requesting for a new owner', async () => {
    const f = fixture(true);
    const oldOwner = {};
    const old = f.pointer.request(oldOwner);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.acquire(0);
    await old;
    f.pointer.release(oldOwner);
    const next = f.pointer.request({});
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(f.request).toHaveBeenCalledTimes(1);
    f.unlock();
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    f.acquire(1);
    expect(await next).toBe(true);
  });

  it('suppresses a stale failure and allows the next owner to acquire', async () => {
    const f = fixture();
    const oldOwner = {};
    const old = f.pointer.request(oldOwner);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.pointer.release(oldOwner);
    const next = f.pointer.request({});
    required(f.requests[0], 'Missing request').reject(new Error('Late denial'));
    expect(await old).toBe(false);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    f.acquire(1);
    expect(await next).toBe(true);
  });

  it('reports a current failure and permits a retry', async () => {
    const f = fixture();
    const owner = {};
    const pending = f.pointer.request(owner);
    const failure = expect(pending).rejects.toThrow('Denied');
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    required(f.requests[0], 'Missing request').reject(new Error('Denied'));
    await failure;
    const retry = f.pointer.request(owner);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    f.acquire(1);
    expect(await retry).toBe(true);
  });

  it('reports native loss once and clears ownership', async () => {
    const f = fixture();
    const owner = {};
    const pending = f.pointer.request(owner);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.acquire(0);
    await pending;
    f.unlock();
    f.unlock();
    expect(f.pointer.owns(owner)).toBe(false);
    expect(f.onChange.mock.calls).toEqual([
      [owner, true],
      [owner, false],
    ]);
  });

  it('cleans up late acquisition after disposal and rejects further requests', async () => {
    const f = fixture();
    const owner = {};
    const pending = f.pointer.request(owner);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.pointer.dispose();
    f.acquire(0);
    expect(await pending).toBe(false);
    expect(await f.pointer.request({})).toBe(false);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.onChange).not.toHaveBeenCalled();
  });

  it('settles a queued request when disposal removes the unlock listener', async () => {
    const f = fixture(true);
    const owner = {};
    const first = f.pointer.request(owner);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.acquire(0);
    await first;
    f.pointer.release(owner);
    const queued = f.pointer.request({});
    f.pointer.dispose();
    expect(await queued).toBe(false);
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(f.pointer.owns(owner)).toBe(false);
  });

  it('settles late acquisition after disposal without requiring native events', async () => {
    let locked = false;
    const native = deferred();
    const request = vi.fn(() => native.promise);
    const release = vi.fn();
    const onChange = vi.fn();
    const pointer = new PointerLockController(
      { request, release, focus: vi.fn(), isLocked: () => locked },
      onChange,
    );
    const pending = pointer.request({});
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    pointer.dispose();
    locked = true;
    native.resolve();
    expect(await pending).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
