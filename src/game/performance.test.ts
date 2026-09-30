import { describe, expect, it } from 'vitest';
import { AdaptiveResolution, renderPixelRatio } from './performance';

describe('render budgets', () => {
  it('caps a 4K high-DPI display to the balanced pixel budget', () => {
    const ratio = renderPixelRatio(3840, 2160, 2, 'balanced', 1);
    expect(3840 * 2160 * ratio ** 2).toBeCloseTo(1280 * 720);
  });
  it('does not supersample small displays on balanced', () => {
    expect(renderPixelRatio(800, 600, 2, 'balanced', 1)).toBe(1);
  });
  it('reacts to actual 10 FPS frame intervals without going below its floor', () => {
    const adaptive = new AdaptiveResolution();
    for (let i = 0; i < 10; i++) adaptive.sample(100);
    expect(adaptive.scale).toBe(.65);
    for (let i = 0; i < 100; i++) adaptive.sample(100);
    expect(adaptive.scale).toBe(.5);
  });
  it('recovers slowly after sustained good frames', () => {
    const adaptive = new AdaptiveResolution();
    for (let i = 0; i < 10; i++) adaptive.sample(100);
    for (let i = 0; i < 252; i++) adaptive.sample(16);
    expect(adaptive.scale).toBeCloseTo(.7);
  });
});
