export const MAX_ENEMIES = 48;
export const MAX_PROJECTILES = 96;

export const RUNTIME = {
  simulationHz: 60,
  gameplayRenderHz: 60,
  menuRenderHz: 30,
  frameSchedulingToleranceMilliseconds: 0.75,
  maximumFrameDeltaSeconds: 0.1,
  hudIntervalSeconds: 0.1,
  fpsSampleIntervalSeconds: 1,
  diagnosticWindowMilliseconds: 1000,
  diagnosticHistoryWindows: 15,
} as const;
