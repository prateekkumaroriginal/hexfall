import { describe, expect, it } from 'vitest';
import { packSurfacePixels } from './texture-packing';

describe('surface texture packing', () => {
  const color = new Uint8ClampedArray([11, 23, 47, 255, 89, 137, 251, 255]);
  const normal = new Uint8ClampedArray([127, 191, 253, 255, 131, 79, 241, 255]);
  const surface = new Uint8ClampedArray([0, 17, 255, 255, 193, 229, 0, 255]);
  it('keeps color and normal detail even when the packed alpha channel is zero', () => {
    const packed = packSurfacePixels(color, normal, surface, 2, 1, false);
    expect(Array.from(packed.color)).toEqual([11, 23, 47, 17, 89, 137, 251, 229]);
    expect(Array.from(packed.normal)).toEqual([127, 191, 253, 0, 131, 79, 241, 193]);
    expect(Array.from(surface)).toEqual([0, 17, 255, 255, 193, 229, 0, 255]);
  });
  it('matches the original image texture orientation on the GPU', () => {
    const packed = packSurfacePixels(color, normal, surface, 1, 2, true);
    expect(Array.from(packed.color)).toEqual([89, 137, 251, 229, 11, 23, 47, 17]);
    expect(Array.from(packed.normal)).toEqual([131, 79, 241, 193, 127, 191, 253, 0]);
  });
  it('preserves metallic values in the normal alpha channel for opaque creature maps', () => {
    const packed = packSurfacePixels(color, normal, surface, 2, 1, false, 2);
    expect(Array.from(packed.color)).toEqual([11, 23, 47, 17, 89, 137, 251, 229]);
    expect(Array.from(packed.normal)).toEqual([127, 191, 253, 255, 131, 79, 241, 0]);
  });
  it('rejects mismatched maps instead of silently changing their detail', () => {
    expect(() => packSurfacePixels(color, normal, surface.subarray(4), 2, 1, false)).toThrow(
      /dimensions/,
    );
    expect(() => packSurfacePixels(color, normal, surface, 0, 2, false)).toThrow(/dimensions/);
  });
});
