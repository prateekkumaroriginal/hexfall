import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('saved settings', () => {
  it('defaults to 100% render scale without a saved record', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null).renderScale).toBe(1);
  });

  it('adds 100% render scale to old records and keeps existing preferences', () => {
    const saved = { quality: 'high', sensitivity: 1.5, sound: false };
    expect(parseSettings(JSON.stringify(saved))).toEqual({ ...saved, renderScale: 1 });
  });

  it.each([0.25, 0.5, 0.75, 1])('restores the selected render scale %s', (renderScale) => {
    const saved = { ...DEFAULT_SETTINGS, renderScale };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
  });

  it.each([0, 0.49, 0.65, 1.01, '0.75', null])('rejects invalid render scale %j', (renderScale) => {
    const saved = { quality: 'high', sensitivity: 1.5, sound: false, renderScale };
    expect(parseSettings(JSON.stringify(saved))).toEqual({ ...saved, renderScale: 1 });
  });

  it.each(['{', 'null', '[]', '{}'])('falls back to defaults for an invalid record %s', (value) => {
    expect(parseSettings(value)).toEqual(DEFAULT_SETTINGS);
  });
});
