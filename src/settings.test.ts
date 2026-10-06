import { describe, expect, it } from 'vitest';
import { parseSettings } from './settings';

const defaultSettings = {
  quality: 'balanced',
  renderScale: 1,
  fieldOfView: 90,
  sensitivity: 1,
  sound: true,
};

describe('saved settings', () => {
  it('defaults to 100% render scale without a saved record', () => {
    expect(parseSettings(null)).toEqual(defaultSettings);
    expect(parseSettings(null).renderScale).toBe(1);
  });

  it('adds 100% render scale to old records and keeps existing preferences', () => {
    const saved = { quality: 'high', sensitivity: 1.5, sound: false };
    expect(parseSettings(JSON.stringify(saved))).toEqual({
      ...saved,
      renderScale: 1,
      fieldOfView: 90,
    });
  });

  it.each([0.25, 0.5, 0.75, 1])('restores the selected render scale %s', (renderScale) => {
    const saved = { ...defaultSettings, renderScale };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
  });

  it.each([0, 0.49, 0.65, 1.01, '0.75', null])('rejects invalid render scale %j', (renderScale) => {
    const saved = { quality: 'high', sensitivity: 1.5, sound: false, renderScale };
    expect(parseSettings(JSON.stringify(saved))).toEqual({
      ...saved,
      renderScale: 1,
      fieldOfView: 90,
    });
  });

  it.each(['{', 'null', '[]', '{}'])('falls back to defaults for an invalid record %s', (value) => {
    expect(parseSettings(value)).toEqual(defaultSettings);
  });

  it.each([75, 90, 110])('restores field of view %s', (fieldOfView) => {
    const saved = { ...defaultSettings, fieldOfView };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
  });

  it.each([0, 74, 111, '90', null])(
    'defaults invalid field of view %j without losing preferences',
    (fieldOfView) => {
      const saved = { ...defaultSettings, quality: 'high', sensitivity: 1.5, fieldOfView };
      expect(parseSettings(JSON.stringify(saved))).toEqual({ ...saved, fieldOfView: 90 });
    },
  );
});
