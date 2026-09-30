export type Quality = 'low' | 'balanced' | 'high';

export function renderPixelRatio(
  width: number,
  height: number,
  deviceRatio: number,
  quality: Quality,
  scale: number,
) {
  const budget = quality === 'low' ? 960 * 540 : quality === 'high' ? 1920 * 1080 : 1280 * 720;
  const cap = quality === 'high' ? 1.5 : 1;
  return Math.min(deviceRatio, cap, Math.sqrt(budget / Math.max(1, width * height))) * scale;
}

// Hysteresis prevents resolution bouncing up and down during combat.
export class AdaptiveResolution {
  scale = 1;
  private elapsed = 0;
  private frames = 0;
  private goodWindows = 0;
  sample(frameMs: number) {
    this.elapsed += frameMs;
    this.frames++;
    if (this.elapsed < 1000) return false;
    const average = this.elapsed / this.frames,
      previous = this.scale;
    if (average > 25) {
      this.scale = Math.max(0.5, this.scale * (average > 42 ? 0.65 : 0.85));
      this.goodWindows = 0;
    } else if (average < 17.5) {
      if (++this.goodWindows >= 4) {
        this.scale = Math.min(1, this.scale + 0.05);
        this.goodWindows = 0;
      }
    } else this.goodWindows = 0;
    this.elapsed = 0;
    this.frames = 0;
    return this.scale !== previous;
  }
  clearWindow() {
    this.elapsed = 0;
    this.frames = 0;
    this.goodWindows = 0;
  }
}
