import { CAMERA } from '../config/rendering';

// The setting is horizontal FOV at 16:9. Wider windows keep that horizontal
// angle; narrower windows keep the vertical angle instead of stretching it.
export function verticalFieldOfView(horizontalDegrees: number, aspect: number): number {
  return (
    (2 *
      Math.atan(
        Math.tan((horizontalDegrees * Math.PI) / 360) / Math.max(CAMERA.REFERENCE_ASPECT, aspect),
      ) *
      180) /
    Math.PI
  );
}
