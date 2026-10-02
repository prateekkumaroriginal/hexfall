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

// Shared paint swatches: broad brush variation, fine grain, and sparse worn cuts.
// White-based swatches multiply the authored vertex palette and baked cavities.
export function surfacePaint(surface: 'skin' | 'iron' | 'leather') {
  const size = 256,
    pixels = new Uint8Array(size * size * 4);
  let seed = 271;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const broad = Math.sin(x * 0.12 + Math.sin(y * 0.09) * 2) * Math.cos(y * 0.13 + x * 0.025);
      const grain = random();
      let value = 0.91 + broad * 0.025 + grain * 0.035;
      if (surface === 'skin') {
        // Smooth periodic washes leave the modeled muscles readable without
        // assigning unrelated hard polygons to the face and limbs.
        const u = (x / size) * Math.PI * 2,
          v = (y / size) * Math.PI * 2;
        value = 0.94 + Math.sin(u * 4 + Math.sin(v * 3)) * Math.cos(v * 5) * 0.028 + grain * 0.006;
      }
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(255 * Math.min(1, value));
      pixels[i + 1] = Math.round(255 * Math.min(1, value * (surface === 'leather' ? 0.97 : 1)));
      pixels[i + 2] = Math.round(
        255 * Math.min(1, value * (surface === 'skin' ? 0.96 : surface === 'leather' ? 0.9 : 1)),
      );
      // Alpha is a paint-wear mask for the opaque leather and iron shaders.
      pixels[i + 3] = surface === 'skin' ? 255 : 0;
    }
  if (surface !== 'skin')
    for (let mark = 0; mark < 24; mark++) {
      const x = random() * size,
        y = random() * size,
        length = 2 + random() * 10;
      for (let i = 0; i < length; i++) {
        const px = Math.floor(x + i * 0.48) % size,
          py = Math.floor(y + i * 0.82) % size;
        const index = (py * size + px) * 4;
        pixels[index] = surface === 'iron' ? 207 : 190;
        pixels[index + 1] = surface === 'iron' ? 196 : 155;
        pixels[index + 2] = surface === 'iron' ? 167 : 105;
        pixels[index + 3] = surface === 'iron' ? 38 : 20;
      }
    }
  if (surface === 'iron') {
    // A few short scuffs keep the charcoal plates' broad highlights dominant.
    for (let mark = 0; mark < 7; mark++) {
      let x = random() * size,
        y = random() * size;
      const length = 4 + Math.floor(random() * 12);
      const direction = random() < 0.5 ? -1 : 1;
      for (let step = 0; step < length; step++) {
        x += direction * (0.4 + random());
        y += 0.1 + random() * 0.7;
        for (let edge = 0; edge < 1; edge++) {
          const px = (Math.floor(x) + size) % size;
          const py = (Math.floor(y) + edge + size) % size;
          pixels[(py * size + px) * 4 + 3] = 35 + Math.floor(random() * 30);
        }
      }
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
