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
  renderScale: number;
  fieldOfView: number;
  sensitivity: number;
  sound: boolean;
};

const defaultSettings: Settings = {
  quality: DEFAULT_SETTINGS.QUALITY,
  renderScale: DEFAULT_SETTINGS.RENDER_SCALE,
  fieldOfView: DEFAULT_SETTINGS.FIELD_OF_VIEW,
  sensitivity: DEFAULT_SETTINGS.SENSITIVITY,
  sound: DEFAULT_SETTINGS.SOUND,
};

export function parseSettings(value: string | null): Settings {
  try {
    const s = JSON.parse(value || 'null');
    if (
      !s ||
      !QUALITY_OPTIONS.includes(s.quality) ||
      typeof s.sensitivity !== 'number' ||
      !(s.sensitivity >= SENSITIVITY_SETTINGS.MIN && s.sensitivity <= SENSITIVITY_SETTINGS.MAX) ||
      typeof s.sound !== 'boolean'
    ) {
      return defaultSettings;
    }
    return {
      quality: s.quality,
      sensitivity: s.sensitivity,
      sound: s.sound,
      fieldOfView:
        typeof s.fieldOfView === 'number' &&
        s.fieldOfView >= FIELD_OF_VIEW_SETTINGS.MIN &&
        s.fieldOfView <= FIELD_OF_VIEW_SETTINGS.MAX
          ? s.fieldOfView
          : FIELD_OF_VIEW_SETTINGS.DEFAULT,
      renderScale: RENDER_SCALE_SETTINGS.OPTIONS.some((option) => option.VALUE === s.renderScale)
        ? s.renderScale
        : RENDER_SCALE_SETTINGS.DEFAULT,
    };
  } catch {
    return defaultSettings;
  }
}
