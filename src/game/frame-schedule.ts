// Keep the target cadence through small RAF jitter without changing elapsed simulation time.
export class FrameSchedule {
  private next = 0;
  private interval = 0;
  constructor(private tolerance: number) {}
  reset() {
    this.next = this.interval = 0;
  }
  due(now: number, hz: number) {
    const interval = 1000 / hz;
    if (this.interval !== interval) {
      this.interval = interval;
      this.next = now;
    }
    if (now + this.tolerance < this.next) return false;
    // Skip missed deadlines instead of rendering a burst after a slow frame or tab suspension.
    this.next += (Math.floor((now + this.tolerance - this.next) / interval) + 1) * interval;
    return true;
  }
}
