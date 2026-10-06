export const QUALITY_PRESETS = {
  low: {
    label: 'Low',
    pixelBudget: 960 * 540,
    pixelRatioCap: 1,
    grassDensity: 0.65,
    grassRadiusUnits: 25,
  },
  balanced: {
    label: 'Balanced',
    pixelBudget: 1280 * 720,
    pixelRatioCap: 1,
    grassDensity: 0.85,
    grassRadiusUnits: 32,
  },
  high: {
    label: 'High',
    pixelBudget: 1920 * 1080,
    pixelRatioCap: 1.5,
    grassDensity: 1,
    grassRadiusUnits: 32,
  },
} as const;

export const QUALITY_OPTIONS = ['low', 'balanced', 'high'] as const;

export const CAMERA = {
  nearClipUnits: 0.08,
  farClipUnits: 500,
  referenceAspect: 16 / 9,
  staffReferenceVerticalFovDegrees: 78,
  movementBobRadiansPerSecond: 12,
  movementBobAmplitudeUnits: 0.025,
} as const;

export const GRASS = {
  perTile: 700,
  initialDensityScale: 0.8,
  initialRadiusUnits: 25,
  tileSizeUnits: 8,
  tileX: { min: -2, maxExclusive: 2, centerOffsetUnits: 4 },
  tileZ: { min: -2, maxExclusive: 3 },
  visibilityPaddingUnits: 6,
  nearDistanceUnits: 10,
  middleDistanceUnits: 20,
  nearDensity: 1,
  middleDensity: 0.7,
  farDensity: 0.42,
} as const;

export const SLIME_ANIMATION = {
  birthBubblePeriodSeconds: 0.56,
  birthBubblesPerEnemy: 5,
} as const;

export const ORC_ANIMATION = {
  // A full left-to-left stride. Each step advances half this distance.
  strideLengthUnits: 1.4,
  teleportResetDistanceUnits: 2,
  fullWalkBlendSpeedUnitsPerSecond: 0.55,
  walkBlendRatePerSecond: 14,
} as const;

export const SPELL_AUDIO = {
  startFrequencyHz: 700,
  endFrequencyHz: 140,
  frequencyRampSeconds: 0.1,
  startGain: 0.045,
  endGain: 0.001,
  gainRampSeconds: 0.12,
  durationSeconds: 0.13,
} as const;
