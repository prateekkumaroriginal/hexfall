export interface PointerLockPort {
  request(): Promise<void>;
  release(): void;
  isLocked(): boolean;
  focus(): void;
}

type LockRequest = { owner: object };

// Gameplay and photo mode share one canvas. Serialize native requests so a late
// result can only release its own lock, before the next owner starts acquiring.
export class PointerLockController {
  private intent: LockRequest | null = null;
  private intentResult: Promise<boolean> | null = null;
  private pending: LockRequest | null = null;
  private owner: object | null = null;
  private queue = Promise.resolve();
  private unlocking: Promise<void> | null = null;
  private finishUnlock: (() => void) | null = null;
  private disposed = false;

  constructor(
    private port: PointerLockPort,
    private onChange: (owner: object, locked: boolean) => void,
  ) {}

  owns(owner: object) {
    return this.owner === owner && this.port.isLocked();
  }

  request(owner: object): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.owns(owner)) return Promise.resolve(true);
    if (this.intent?.owner === owner && this.intentResult) return this.intentResult;
    if (this.owner) this.release(this.owner);
    const request = { owner };
    this.intent = request;
    const result = this.queue.then(() => this.acquire(request));
    this.intentResult = result;
    // A rejected request must not prevent later owners from using the queue.
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  release(owner: object) {
    if (this.intent?.owner === owner) {
      this.intent = null;
      this.intentResult = null;
    }
    if (this.owner === owner) {
      this.owner = null;
      void this.unlockNative();
      this.onChange(owner, false);
    } else if (this.pending?.owner === owner && this.port.isLocked()) {
      void this.unlockNative();
    }
  }

  handleChange() {
    if (!this.port.isLocked()) {
      const owner = this.owner;
      this.owner = null;
      this.completeUnlock();
      if (owner) {
        if (this.intent?.owner === owner) {
          this.intent = null;
          this.intentResult = null;
        }
        this.onChange(owner, false);
      }
    } else if (!this.disposed && this.pending && this.intent === this.pending) {
      this.assignOwner(this.pending.owner);
    } else if (!this.owner) {
      // A canceled native request may still succeed. Never expose that lock to
      // the UI, and finish releasing it before another request reaches the API.
      void this.unlockNative();
    }
  }

  dispose() {
    this.disposed = true;
    this.intent = null;
    this.intentResult = null;
    this.owner = null;
    void this.unlockNative();
  }

  private async acquire(request: LockRequest) {
    await this.unlocking;
    if (this.disposed || this.intent !== request) return false;
    this.pending = request;
    try {
      await this.port.request();
      if (this.disposed || this.intent !== request) {
        await this.unlockNative();
        return false;
      }
      if (!this.port.isLocked()) {
        this.intent = null;
        this.intentResult = null;
        return false;
      }
      this.assignOwner(request.owner);
      return true;
    } catch (error) {
      if (this.disposed || this.intent !== request) return false;
      this.intent = null;
      this.intentResult = null;
      throw error;
    } finally {
      this.pending = null;
    }
  }

  private assignOwner(owner: object) {
    if (this.owner === owner) return;
    this.owner = owner;
    this.port.focus();
    this.onChange(owner, true);
  }

  private unlockNative(): Promise<void> {
    // Disposal removes the native event listener. Release without awaiting an
    // acknowledgement, and let canceled queued requests finish.
    if (this.disposed) {
      this.completeUnlock();
      if (this.port.isLocked()) this.port.release();
      return Promise.resolve();
    }
    if (this.unlocking) return this.unlocking;
    if (!this.port.isLocked()) return Promise.resolve();
    const result = new Promise<void>((resolve) => {
      this.finishUnlock = resolve;
    });
    this.unlocking = result;
    this.port.release();
    if (!this.port.isLocked()) this.completeUnlock();
    return result;
  }

  private completeUnlock() {
    const finish = this.finishUnlock;
    this.finishUnlock = null;
    this.unlocking = null;
    finish?.();
  }
}
