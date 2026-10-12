import * as THREE from 'three';
import { at, required } from '../lib/assert';

export type PackedSurfaceTextures = { color: THREE.DataTexture; normal: THREE.DataTexture };
type SurfaceImage = HTMLImageElement | ImageBitmap;

// Preserve every color/normal byte. Store surface values in unused alpha channels.
export function packSurfacePixels(
  color: Uint8ClampedArray,
  normal: Uint8ClampedArray,
  surface: Uint8ClampedArray,
  width: number,
  height: number,
  flipY: boolean,
  normalAlphaChannel: 0 | 2 = 0,
) {
  const length = width * height * 4;
  if (width < 1 || height < 1 || [color, normal, surface].some((data) => data.length !== length))
    throw new Error('Surface texture dimensions do not match');
  const packedColor = new Uint8Array(length),
    packedNormal = new Uint8Array(length);
  for (let y = 0; y < height; y++) {
    const outputRow = (flipY ? height - 1 - y : y) * width * 4;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4,
        target = outputRow + x * 4;
      for (let channel = 0; channel < 3; channel++) {
        packedColor[target + channel] = at(color, source + channel);
        packedNormal[target + channel] = at(normal, source + channel);
      }
      packedColor[target + 3] = at(surface, source + 1);
      packedNormal[target + 3] = at(surface, source + normalAlphaChannel);
    }
  }
  return { color: packedColor, normal: packedNormal };
}

export function packSurfaceTextures(
  color: THREE.Texture,
  normal: THREE.Texture,
  surface: THREE.Texture,
  normalAlphaChannel: 0 | 2 = 0,
): PackedSurfaceTextures {
  const image = color.image as SurfaceImage;
  const width = image.width,
    height = image.height;
  if (
    [normal, surface].some((texture) => {
      const other = texture.image as SurfaceImage;
      return other.width !== width || other.height !== height || texture.flipY !== color.flipY;
    })
  )
    throw new Error('Surface texture dimensions or orientation do not match');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = required(
    canvas.getContext('2d', { willReadFrequently: true }),
    'Failed to read surface textures',
  );
  const read = (texture: THREE.Texture) => {
    context.clearRect(0, 0, width, height);
    context.drawImage(texture.image as SurfaceImage, 0, 0);
    return context.getImageData(0, 0, width, height).data;
  };
  const pixels = packSurfacePixels(
    read(color),
    read(normal),
    read(surface),
    width,
    height,
    color.flipY,
    normalAlphaChannel,
  );
  const create = (data: Uint8Array, source: THREE.Texture) => {
    const texture = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.colorSpace = source.colorSpace;
    texture.wrapS = source.wrapS;
    texture.wrapT = source.wrapT;
    texture.magFilter = source.magFilter;
    texture.minFilter = source.minFilter;
    texture.anisotropy = source.anisotropy;
    texture.generateMipmaps = source.generateMipmaps;
    texture.channel = source.channel;
    texture.offset.copy(source.offset);
    texture.repeat.copy(source.repeat);
    texture.center.copy(source.center);
    texture.rotation = source.rotation;
    texture.matrixAutoUpdate = source.matrixAutoUpdate;
    texture.matrix.copy(source.matrix);
    texture.needsUpdate = true;
    return texture;
  };
  return { color: create(pixels.color, color), normal: create(pixels.normal, normal) };
}
