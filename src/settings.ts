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

export function parseSettings(value: string | null): Settings {
  try {
    const s = JSON.parse(value || 'null');
    if (
      !s ||
      !QUALITY_OPTIONS.includes(s.quality) ||
      typeof s.sensitivity !== 'number' ||
      !(s.sensitivity >= SENSITIVITY_SETTINGS.min && s.sensitivity <= SENSITIVITY_SETTINGS.max) ||
      typeof s.sound !== 'boolean'
    ) {
      return DEFAULT_SETTINGS;
    }
    return {
      quality: s.quality,
      sensitivity: s.sensitivity,
      sound: s.sound,
      fieldOfView:
        typeof s.fieldOfView === 'number' &&
        s.fieldOfView >= FIELD_OF_VIEW_SETTINGS.min &&
        s.fieldOfView <= FIELD_OF_VIEW_SETTINGS.max
          ? s.fieldOfView
          : FIELD_OF_VIEW_SETTINGS.default,
      renderScale: RENDER_SCALE_SETTINGS.options.some((option) => option.value === s.renderScale)
        ? s.renderScale
        : RENDER_SCALE_SETTINGS.default,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
