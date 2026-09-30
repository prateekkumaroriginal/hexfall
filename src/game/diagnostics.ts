// Keep only the latest 15 seconds of gameplay, including after opening Pause.
// Work stays outside React and allocates only once per second.
export class FrameDiagnostics {
  private elapsed = 0;
  private frames = 0;
  private cpu = 0;
  private worst = 0;
  private windows: { elapsed: number; frames: number; cpu: number; worst: number }[] = [];

  record(frameMs: number, cpuMs: number) {
    if (frameMs <= 0) return;
    this.elapsed += frameMs; this.frames++; this.cpu += cpuMs;
    this.worst = Math.max(this.worst, frameMs);
    if (this.elapsed >= 1000) {
      this.windows.push({ elapsed: this.elapsed, frames: this.frames, cpu: this.cpu, worst: this.worst });
      if (this.windows.length > 15) this.windows.shift();
      this.elapsed = this.frames = this.cpu = this.worst = 0;
    }
  }

  summary() {
    const all = [...this.windows, { elapsed: this.elapsed, frames: this.frames, cpu: this.cpu, worst: this.worst }];
    const frames = all.reduce((sum, w) => sum + w.frames, 0);
    const elapsed = all.reduce((sum, w) => sum + w.elapsed, 0);
    const round = (n: number) => Math.round(n * 10) / 10;
    return {
      sampledSeconds: round(elapsed / 1000),
      fps: frames ? round(frames * 1000 / elapsed) : null,
      averageFrameMs: frames ? round(elapsed / frames) : null,
      worstFrameMs: frames ? round(Math.max(...all.map(w => w.worst))) : null,
      // CPU time includes command submission, not asynchronous GPU completion.
      averageCpuSubmissionMs: frames ? round(all.reduce((sum, w) => sum + w.cpu, 0) / frames) : null,
    };
  }
}
