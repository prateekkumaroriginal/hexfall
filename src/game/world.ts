export const ARENA_HALF_WIDTH = 16;
export const ARENA_HALF_DEPTH = 20;
export const WALL_HEIGHT = 10;

function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

// Rendering and physics use the same deterministic layout and trunk dimensions.
const random = randomSource(671);
export const TREE_LAYOUT = Array.from({ length: 20 }, (_, i) => {
  const side = i % 4;
  const along = (Math.floor(i / 4) - 2) / 2;
  const x =
    side < 2
      ? (side === 0 ? -1 : 1) * (ARENA_HALF_WIDTH - 1.8)
      : Math.max(-13.7, Math.min(13.7, along * 14 + (random() - 0.5) * 1.4));
  const z =
    side >= 2
      ? (side === 2 ? -1 : 1) * (ARENA_HALF_DEPTH - 1.8)
      : along * 17 + (random() - 0.5) * 1.4;
  const yaw = random() * Math.PI * 2;
  const scale = 0.82 + random() * 0.36;
  const scaleX = scale * (0.9 + random() * 0.2);
  const scaleY = scale * (0.95 + random() * 0.18);
  const scaleZ = scale;
  const hue = 0.22 + random() * 0.025;
  const saturation = 0.16 + random() * 0.12;
  const lightness = 0.78 + random() * 0.1;
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
    variant: i % 3,
    radius: 0.5 * Math.max(scaleX, scaleZ),
    height: 3.4 * scaleY,
  };
});
