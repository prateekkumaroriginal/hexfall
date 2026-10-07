export const SETTINGS_STORAGE_KEY = 'hexfall.settings.v1';

export const FIELD_OF_VIEW_SETTINGS = { MIN: 75, MAX: 110, DEFAULT: 90, STEP: 1 } as const;

export const SENSITIVITY_SETTINGS = { MIN: 0.3, MAX: 2.5, DEFAULT: 1, STEP: 0.1 } as const;

export const AIM_SETTINGS = {
  RADIANS_PER_MOUSE_PIXEL: 0.002,
  PITCH_LIMIT_RADIANS: 1.3,
} as const;

export const RENDER_SCALE_SETTINGS = {
  OPTIONS: [
    { VALUE: 0.25, LABEL: '25%' },
    { VALUE: 0.5, LABEL: '50%' },
    { VALUE: 0.75, LABEL: '75%' },
    { VALUE: 1, LABEL: '100%' },
  ],
  DEFAULT: 1,
  LABELS: {
    NAME: 'Render scale',
    DESCRIPTION:
      '100% keeps the full resolution for the selected render quality. Lower values can improve frame rate.',
  },
} as const;

export const DEFAULT_SETTINGS = {
  QUALITY: 'balanced',
  RENDER_SCALE: RENDER_SCALE_SETTINGS.DEFAULT,
  FIELD_OF_VIEW: FIELD_OF_VIEW_SETTINGS.DEFAULT,
  SENSITIVITY: SENSITIVITY_SETTINGS.DEFAULT,
  SOUND: true,
} as const;
