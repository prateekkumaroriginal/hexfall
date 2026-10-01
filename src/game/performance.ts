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
