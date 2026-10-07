import * as THREE from 'three';

// A shared 512px paint layer supplies the reference's embedded bubbles. It is
// generated once, mipmapped, and used by every slime without another draw call.
export function slimePaint() {
  const size = 512,
    pixels = new Uint8Array(size * size * 4);
  const spots = [
    [0.36, 0.43, 0.022],
    [0.39, 0.6, 0.016],
    [0.32, 0.63, 0.025],
    [0.37, 0.24, 0.03],
    [0.3, 0.37, 0.018],
    [0.27, 0.52, 0.014],
    [0.63, 0.38, 0.028],
    [0.66, 0.55, 0.019],
    [0.6, 0.64, 0.016],
    [0.68, 0.25, 0.024],
    [0.72, 0.43, 0.013],
    [0.23, 0.22, 0.025],
    [0.81, 0.37, 0.021],
    [0.87, 0.56, 0.025],
    [0.12, 0.49, 0.019],
    [0.09, 0.27, 0.022],
    [0.95, 0.36, 0.018],
  ];
  const shades = new Float64Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      shades[y * size + x] =
        0.94 + Math.sin(u * 51 + Math.sin(v * 33)) * Math.sin(v * 47 + u * 29) * 0.023;
    }
  // Evaluate bubbles only inside their paint bounds, avoiding millions of
  // unnecessary distance checks during initial game loading.
  for (const [su, sv, r] of spots) {
    const minX = Math.max(0, Math.floor((su - r * 1.15) * size));
    const maxX = Math.min(size - 1, Math.ceil((su + r * 1.15) * size));
    const minY = Math.max(0, Math.floor((sv - r * 3.3 * 1.15) * size));
    const maxY = Math.min(size - 1, Math.ceil((sv + r * 3.3 * 1.15) * size));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const dx = (x / size - su) / r,
          dy = (y / size - sv) / (r * 3.3),
          d = Math.hypot(dx, dy);
        if (d >= 1.15) continue;
        const mask = 1 - THREE.MathUtils.smoothstep(d, 0.84, 1.15);
        const ring = Math.exp(-(((d - 0.82) / 0.13) ** 2));
        shades[y * size + x] *= 1 + mask * (-0.11 + ring * (dy > 0 ? 0.12 : 0));
      }
  }
  for (let i = 0; i < shades.length; i++) {
    const shade = shades[i],
      pixel = i * 4;
    pixels[pixel] = Math.round(255 * Math.min(1, shade));
    pixels[pixel + 1] = Math.round(255 * Math.min(1, shade * 1.025));
    pixels[pixel + 2] = Math.round(255 * Math.min(1, shade * 0.91));
    pixels[pixel + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
