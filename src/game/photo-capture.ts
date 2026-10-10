import type * as THREE from 'three';
import { PHOTO_MODE } from '../config/photo-mode';

export async function capturePhotoFrame(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  render: () => void,
  restore: () => void,
): Promise<Blob> {
  if (renderer.getContext().isContextLost()) throw new Error('Graphics context lost');
  const aspect = camera.aspect;
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('Invalid camera aspect ratio');
  const width = Math.max(
    1,
    Math.round(
      Math.min(PHOTO_MODE.CAPTURE_MAX_WIDTH_PIXELS, PHOTO_MODE.CAPTURE_MAX_HEIGHT_PIXELS * aspect),
    ),
  );
  const height = Math.max(
    1,
    Math.min(PHOTO_MODE.CAPTURE_MAX_HEIGHT_PIXELS, Math.round(width / aspect)),
  );
  const image = document.createElement('canvas');
  image.width = width;
  image.height = height;
  const context = image.getContext('2d');
  if (!context) throw new Error('Image capture unavailable');
  // Copy before WebGL clears its buffer. Restore the live canvas even if drawing
  // fails; encoding finishes without holding the renderer at capture resolution.
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    render();
    context.drawImage(renderer.domElement, 0, 0);
  } finally {
    restore();
  }
  return new Promise<Blob>((resolve, reject) => {
    image.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
}

export function downloadPhoto(image: Blob) {
  const url = URL.createObjectURL(image);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `hexfall-${new Date().toISOString().replaceAll(':', '-')}.png`;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), PHOTO_MODE.DOWNLOAD_URL_LIFETIME_MILLISECONDS);
  }
}
