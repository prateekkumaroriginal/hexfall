import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { verticalFieldOfView } from './camera';

describe('field of view', () => {
  it.each([16 / 9, 1917 / 873, 32 / 9])(
    'keeps the selected horizontal angle on wide aspect %s',
    (aspect) => {
      const camera = new THREE.PerspectiveCamera(
        verticalFieldOfView(90, aspect),
        aspect,
        0.08,
        500,
      );
      // A ray 45 degrees to the side must land at the edge for a 90-degree view.
      expect(new THREE.Vector3(1, 0, -1).project(camera).x).toBeCloseTo(1);
      expect(new THREE.Vector3(-1, 0, -1).project(camera).x).toBeCloseTo(-1);
    },
  );

  it.each([4 / 3, 1, 9 / 16])('preserves vertical coverage in narrower aspect %s', (aspect) => {
    expect(verticalFieldOfView(90, aspect)).toBeCloseTo(58.7155, 4);
  });

  it('shows more of the arena when the setting increases', () => {
    const narrow = new THREE.PerspectiveCamera(verticalFieldOfView(75, 16 / 9), 16 / 9);
    const wide = new THREE.PerspectiveCamera(verticalFieldOfView(110, 16 / 9), 16 / 9);
    const target = new THREE.Vector3(1, 0, -1);
    expect(target.clone().project(narrow).x).toBeGreaterThan(1);
    expect(target.clone().project(wide).x).toBeLessThan(1);
  });
});
