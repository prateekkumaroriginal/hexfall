import type { Quality } from './game/performance';

export const SETTINGS_STORAGE_KEY = 'hexfall.settings.v1';

export const RENDER_SCALE_SETTINGS = {
  options: [
    { value: 0.25, label: '25%' },
    { value: 0.5, label: '50%' },
    { value: 0.75, label: '75%' },
    { value: 1, label: '100%' },
  ],
  default: 1,
  labels: {
    name: 'Render scale',
    description:
      '100% keeps the full resolution for the selected render quality. Lower values can improve frame rate.',
  },
} as const;

export type Settings = {
  quality: Quality;
  renderScale: number;
  sensitivity: number;
  sound: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  quality: 'balanced',
  renderScale: RENDER_SCALE_SETTINGS.default,
  sensitivity: 1,
  sound: true,
};

export function parseSettings(value: string | null): Settings {
  try {
    const s = JSON.parse(value || 'null');
    if (
      !s ||
      !['low', 'balanced', 'high'].includes(s.quality) ||
      typeof s.sensitivity !== 'number' ||
      !(s.sensitivity >= 0.3 && s.sensitivity <= 2.5) ||
      typeof s.sound !== 'boolean'
    ) {
      return DEFAULT_SETTINGS;
    }
    return {
      quality: s.quality,
      sensitivity: s.sensitivity,
      sound: s.sound,
      renderScale: RENDER_SCALE_SETTINGS.options.some((option) => option.value === s.renderScale)
        ? s.renderScale
        : RENDER_SCALE_SETTINGS.default,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
