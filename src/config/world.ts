export const ARENA_HALF_WIDTH = 16;
export const ARENA_HALF_DEPTH = 20;
export const WALL_HEIGHT = 10;

export const BOULDERS = {
  collisionHeightUnits: 2.1,
  layout: [
    { x: -9, z: -11, radius: 1.05 },
    { x: 10, z: -9, radius: 1.15 },
    { x: -11, z: 6, radius: 1.0 },
    { x: 10, z: 12, radius: 1.1 },
    { x: -4, z: -15, radius: 0.85 },
    { x: 5, z: 3, radius: 0.9 },
  ],
} as const;

export const TREES = {
  seed: 671,
  count: 20,
  variants: 3,
  edgeInsetUnits: 1.8,
  alongXLimitUnits: 13.7,
  alongXSpanUnits: 14,
  alongZSpanUnits: 17,
  positionJitterUnits: 1.4,
  scale: { min: 0.82, variation: 0.36 },
  scaleX: { min: 0.9, variation: 0.2 },
  scaleY: { min: 0.95, variation: 0.18 },
  hue: { min: 0.22, variation: 0.025 },
  saturation: { min: 0.16, variation: 0.12 },
  lightness: { min: 0.78, variation: 0.1 },
  trunkRadiusUnits: 0.5,
  trunkHeightUnits: 3.4,
} as const;

export const ENVIRONMENT_SEED = 471;
