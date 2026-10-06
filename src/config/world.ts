export const ARENA_HALF_WIDTH = 16;
export const ARENA_HALF_DEPTH = 20;
export const WALL_HEIGHT = 10;

export const BOULDERS = {
  COLLISION_HEIGHT_UNITS: 2.1,
  LAYOUT: [
    { X: -9, Z: -11, RADIUS: 1.05 },
    { X: 10, Z: -9, RADIUS: 1.15 },
    { X: -11, Z: 6, RADIUS: 1.0 },
    { X: 10, Z: 12, RADIUS: 1.1 },
    { X: -4, Z: -15, RADIUS: 0.85 },
    { X: 5, Z: 3, RADIUS: 0.9 },
  ],
} as const;

export const TREES = {
  SEED: 671,
  COUNT: 20,
  VARIANTS: 3,
  EDGE_INSET_UNITS: 1.8,
  ALONG_X_LIMIT_UNITS: 13.7,
  ALONG_X_SPAN_UNITS: 14,
  ALONG_Z_SPAN_UNITS: 17,
  POSITION_JITTER_UNITS: 1.4,
  SCALE: { MIN: 0.82, VARIATION: 0.36 },
  SCALE_X: { MIN: 0.9, VARIATION: 0.2 },
  SCALE_Y: { MIN: 0.95, VARIATION: 0.18 },
  HUE: { MIN: 0.22, VARIATION: 0.025 },
  SATURATION: { MIN: 0.16, VARIATION: 0.12 },
  LIGHTNESS: { MIN: 0.78, VARIATION: 0.1 },
  TRUNK_RADIUS_UNITS: 0.5,
  TRUNK_HEIGHT_UNITS: 3.4,
} as const;

export const ENVIRONMENT_SEED = 471;
