import { describe, expect, it } from 'vitest';
import { renderPixelRatio } from './performance';

describe('render budgets', () => {
  it('caps a 4K high-DPI display to the balanced pixel budget', () => {
    const ratio = renderPixelRatio(3840, 2160, 2, 'balanced', 1);
    expect(3840 * 2160 * ratio ** 2).toBeCloseTo(1280 * 720);
  });
  it('does not supersample small displays on balanced', () => {
    expect(renderPixelRatio(800, 600, 2, 'balanced', 1)).toBe(1);
  });
  it.each(['low', 'balanced', 'high'] as const)(
    'honors the selected render scale on %s quality',
    (quality) => {
      const full = renderPixelRatio(1440, 900, 4 / 3, quality, 1);
      expect(renderPixelRatio(1440, 900, 4 / 3, quality, 0.75)).toBeCloseTo(full * 0.75);
      expect(renderPixelRatio(1440, 900, 4 / 3, quality, 0.5)).toBeCloseTo(full * 0.5);
      expect(renderPixelRatio(1440, 900, 4 / 3, quality, 0.25)).toBeCloseTo(full * 0.25);
    },
  );
});
