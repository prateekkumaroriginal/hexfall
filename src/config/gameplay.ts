export const PLAYER = {
  maxHealth: 100,
  movementSpeedUnitsPerSecond: 7,
  spawn: { x: 0, z: 9 },
  eyeHeightUnits: 1.6,
  invulnerabilitySeconds: 0.5,
  healingPerKill: 1,
  healingPerWave: 15,
  collisionRadiusUnits: 0.4,
  wallMarginUnits: 0.45,
} as const;

export const STAFF = {
  damage: 1,
  fireIntervalSeconds: 0.13,
  projectileSpeedUnitsPerSecond: 30,
  projectileLifetimeSeconds: 2,
  aimRangeUnits: 40,
  minimumAimDistanceUnits: 1.5,
  muzzleOffsetUnits: { right: 0.88, down: 0.14, forward: 1.04 },
  projectileWallInsetUnits: 0.01,
  projectileCleanupDistanceUnits: 55,
} as const;

// Each enemy owns its stats. Changing one species must not rebalance another.
export const SLIME = {
  health: 2,
  damage: 10,
  baseSpeedUnitsPerSecond: 1.04625,
  speedPerWaveUnitsPerSecond: 0.062,
  spawnDurationSeconds: 2.5,
  attackReachUnits: 1.25,
  attackWindupSeconds: 0.4,
  attackCooldownSeconds: 0.9,
  punchRecoverySeconds: 0,
  stoppingDistanceUnits: 0.8125,
  killScore: 100,
  collisionRadiusUnits: 0.85,
  hitboxRadiiUnits: { x: 1.05, y: 0.8, z: 0.95 },
} as const;

export const ORC = {
  health: 4,
  damage: 18,
  baseSpeedUnitsPerSecond: 0.837,
  speedPerWaveUnitsPerSecond: 0.0496,
  spawnDurationSeconds: 0,
  attackReachUnits: 1.65,
  attackWindupSeconds: 0.55,
  attackCooldownSeconds: 1.25,
  punchRecoverySeconds: 0.45,
  stoppingDistanceUnits: 1.45,
  killScore: 250,
  collisionRadiusUnits: 0.65,
  hitboxRadiiUnits: { x: 0.75, y: 1.35, z: 0.6 },
  playerSeparationUnits: 1.35,
} as const;

export const WAVES = {
  total: 5,
  firstWave: { slimes: 1, orcs: 1 },
  laterWaveEnemyCount: { base: 7, perWave: 5 },
  laterWaveOrcProbability: 0.4,
  initialReadyWaitSeconds: 2,
  firstWaveWaitSeconds: 1.5,
  clearWaitSeconds: 3,
  spawnIntervalSeconds: { base: 1.1, reductionPerWave: 0.1, minimum: 0.4 },
  spawnEdgeInsetUnits: 0.8,
  spawnAlongInsetUnits: 1.5,
  spawnObstacleClearanceUnits: 0.05,
  spawnRelocationAttempts: 24,
  spawnRelocationStepUnits: 1.5,
} as const;

export const COMBAT = {
  meleeImpactToleranceUnits: 0.2,
  obstacleSteeringDistanceUnits: 3.2,
  obstacleSteeringStrength: 1.8,
  crowdSeparationDistanceUnits: 1.3,
  crowdSeparationShare: 0.5,
  crowdSeparationSpeedUnitsPerSecond: 1.5,
  enemyWallMarginUnits: 0.6,
} as const;

export const HIT_FEEDBACK = {
  enemyFlashSeconds: 0.14,
  hitIndicatorSeconds: 0.1,
  hurtIndicatorSeconds: 0.35,
} as const;

// Birth growth is shared by rendering and collision volumes.
export const SLIME_BIRTH = {
  spreadEndProgress: 0.3,
  minimumScale: 0.001,
  initialHeightScale: 0.06,
  initialWidthScale: 1.18,
} as const;
