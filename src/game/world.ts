import { ARENA_HALF_WIDTH, ARENA_HALF_DEPTH, BOULDERS, TREES } from '../config/world';

function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

// Rendering and physics use the same deterministic layout and trunk dimensions.
const random = randomSource(TREES.SEED);
export const TREE_LAYOUT = Array.from({ length: TREES.COUNT }, (_, i) => {
  const side = i % 4;
  const along = (Math.floor(i / 4) - 2) / 2;
  const x =
    side < 2
      ? (side === 0 ? -1 : 1) * (ARENA_HALF_WIDTH - TREES.EDGE_INSET_UNITS)
      : Math.max(
          -TREES.ALONG_X_LIMIT_UNITS,
          Math.min(
            TREES.ALONG_X_LIMIT_UNITS,
            along * TREES.ALONG_X_SPAN_UNITS + (random() - 0.5) * TREES.POSITION_JITTER_UNITS,
          ),
        );
  const z =
    side >= 2
      ? (side === 2 ? -1 : 1) * (ARENA_HALF_DEPTH - TREES.EDGE_INSET_UNITS)
      : along * TREES.ALONG_Z_SPAN_UNITS + (random() - 0.5) * TREES.POSITION_JITTER_UNITS;
  const yaw = random() * Math.PI * 2;
  const scale = TREES.SCALE.MIN + random() * TREES.SCALE.VARIATION;
  const scaleX = scale * (TREES.SCALE_X.MIN + random() * TREES.SCALE_X.VARIATION);
  const scaleY = scale * (TREES.SCALE_Y.MIN + random() * TREES.SCALE_Y.VARIATION);
  const scaleZ = scale;
  const hue = TREES.HUE.MIN + random() * TREES.HUE.VARIATION;
  const saturation = TREES.SATURATION.MIN + random() * TREES.SATURATION.VARIATION;
  const lightness = TREES.LIGHTNESS.MIN + random() * TREES.LIGHTNESS.VARIATION;
  return {
    x,
    z,
    yaw,
    scaleX,
    scaleY,
    scaleZ,
    hue,
    saturation,
    lightness,
    variant: i % TREES.VARIANTS.length,
    radius: TREES.TRUNK_RADIUS_UNITS * Math.max(scaleX, scaleZ),
    height: TREES.TRUNK_HEIGHT_UNITS * scaleY,
  };
});

export const TREE_OBSTACLES = TREE_LAYOUT.map(({ x, z, radius, height }) => ({
  x,
  z,
  radius,
  height,
}));
export const WORLD_OBSTACLES = [
  ...BOULDERS.LAYOUT.map((p) => ({
    x: p.X,
    z: p.Z,
    radius: p.RADIUS,
    height: BOULDERS.COLLISION_HEIGHT_UNITS,
  })),
  ...TREE_OBSTACLES,
];
