export const SETTINGS_STORAGE_KEY = 'hexfall.settings.v1';

export const FIELD_OF_VIEW_SETTINGS = { min: 75, max: 110, default: 90, step: 1 } as const;

export const SENSITIVITY_SETTINGS = { min: 0.3, max: 2.5, default: 1, step: 0.1 } as const;

export const AIM_SETTINGS = {
  radiansPerMousePixel: 0.002,
  pitchLimitRadians: 1.3,
} as const;

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

export const DEFAULT_SETTINGS = {
  quality: 'balanced',
  renderScale: RENDER_SCALE_SETTINGS.default,
  fieldOfView: FIELD_OF_VIEW_SETTINGS.default,
  sensitivity: SENSITIVITY_SETTINGS.default,
  sound: true,
} as const;
