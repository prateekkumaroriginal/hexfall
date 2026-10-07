import { QUALITY_PRESETS } from '../config/rendering';

export type Quality = keyof typeof QUALITY_PRESETS;

export function renderPixelRatio(
  width: number,
  height: number,
  deviceRatio: number,
  quality: Quality,
  scale: number,
) {
  const { PIXEL_BUDGET: budget, PIXEL_RATIO_CAP: cap } = QUALITY_PRESETS[quality];
  return Math.min(deviceRatio, cap, Math.sqrt(budget / Math.max(1, width * height))) * scale;
}
