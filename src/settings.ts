import type { Quality } from './game/performance';
import { QUALITY_OPTIONS } from './config/rendering';
import {
  DEFAULT_SETTINGS,
  FIELD_OF_VIEW_SETTINGS,
  RENDER_SCALE_SETTINGS,
  SENSITIVITY_SETTINGS,
} from './config/settings';

export type Settings = {
  quality: Quality;
  renderScale: RenderScale;
  fieldOfView: number;
  sensitivity: number;
  sound: boolean;
};

export type RenderScale = (typeof RENDER_SCALE_SETTINGS.OPTIONS)[number]['VALUE'];

function isQuality(value: unknown): value is Quality {
  return QUALITY_OPTIONS.some((quality) => quality === value);
}

function isRenderScale(value: unknown): value is RenderScale {
  return RENDER_SCALE_SETTINGS.OPTIONS.some((option) => option.VALUE === value);
}

const defaultSettings: Settings = {
  quality: DEFAULT_SETTINGS.QUALITY,
  renderScale: DEFAULT_SETTINGS.RENDER_SCALE,
  fieldOfView: DEFAULT_SETTINGS.FIELD_OF_VIEW,
  sensitivity: DEFAULT_SETTINGS.SENSITIVITY,
  sound: DEFAULT_SETTINGS.SOUND,
};

export function parseSettings(value: string | null): Settings {
  if (value === null) return defaultSettings;
  try {
    const s: unknown = JSON.parse(value);
    if (
      typeof s !== 'object' ||
      s === null ||
      !('quality' in s) ||
      !isQuality(s.quality) ||
      !('sensitivity' in s) ||
      typeof s.sensitivity !== 'number' ||
      !(s.sensitivity >= SENSITIVITY_SETTINGS.MIN && s.sensitivity <= SENSITIVITY_SETTINGS.MAX) ||
      !('sound' in s) ||
      typeof s.sound !== 'boolean'
    ) {
      return defaultSettings;
    }
    return {
      quality: s.quality,
      sensitivity: s.sensitivity,
      sound: s.sound,
      fieldOfView:
        'fieldOfView' in s &&
        typeof s.fieldOfView === 'number' &&
        s.fieldOfView >= FIELD_OF_VIEW_SETTINGS.MIN &&
        s.fieldOfView <= FIELD_OF_VIEW_SETTINGS.MAX
          ? s.fieldOfView
          : FIELD_OF_VIEW_SETTINGS.DEFAULT,
      renderScale:
        'renderScale' in s && isRenderScale(s.renderScale)
          ? s.renderScale
          : RENDER_SCALE_SETTINGS.DEFAULT,
    };
  } catch {
    return defaultSettings;
  }
}
