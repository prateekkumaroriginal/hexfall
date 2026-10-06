import { ARENA_HALF_WIDTH, ARENA_HALF_DEPTH, BOULDERS, TREES } from '../config/world';

function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

// Rendering and physics use the same deterministic layout and trunk dimensions.
const random = randomSource(TREES.seed);
export const TREE_LAYOUT = Array.from({ length: TREES.count }, (_, i) => {
  const side = i % 4;
  const along = (Math.floor(i / 4) - 2) / 2;
  const x =
    side < 2
      ? (side === 0 ? -1 : 1) * (ARENA_HALF_WIDTH - TREES.edgeInsetUnits)
      : Math.max(
          -TREES.alongXLimitUnits,
          Math.min(
            TREES.alongXLimitUnits,
            along * TREES.alongXSpanUnits + (random() - 0.5) * TREES.positionJitterUnits,
          ),
        );
  const z =
    side >= 2
      ? (side === 2 ? -1 : 1) * (ARENA_HALF_DEPTH - TREES.edgeInsetUnits)
      : along * TREES.alongZSpanUnits + (random() - 0.5) * TREES.positionJitterUnits;
  const yaw = random() * Math.PI * 2;
  const scale = TREES.scale.min + random() * TREES.scale.variation;
  const scaleX = scale * (TREES.scaleX.min + random() * TREES.scaleX.variation);
  const scaleY = scale * (TREES.scaleY.min + random() * TREES.scaleY.variation);
  const scaleZ = scale;
  const hue = TREES.hue.min + random() * TREES.hue.variation;
  const saturation = TREES.saturation.min + random() * TREES.saturation.variation;
  const lightness = TREES.lightness.min + random() * TREES.lightness.variation;
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
    variant: i % TREES.variants,
    radius: TREES.trunkRadiusUnits * Math.max(scaleX, scaleZ),
    height: TREES.trunkHeightUnits * scaleY,
  };
});

export const TREE_OBSTACLES = TREE_LAYOUT.map(({ x, z, radius, height }) => ({
  x,
  z,
  radius,
  height,
}));
export const WORLD_OBSTACLES = [
  ...BOULDERS.layout.map((p) => ({ ...p, height: BOULDERS.collisionHeightUnits })),
  ...TREE_OBSTACLES,
];
