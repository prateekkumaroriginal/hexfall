import * as THREE from 'three';
import { MAX_ENEMIES } from '../config/runtime';
import { ORC_ANIMATION } from '../config/rendering';
import type { Enemy } from './simulation';

// Fixed slots track every enemy, including culled ones. Phase follows travel, not wall time.
export class OrcLocomotion {
  private initialized = new Uint8Array(MAX_ENEMIES);
  private x = new Float64Array(MAX_ENEMIES);
  private z = new Float64Array(MAX_ENEMIES);
  private time = new Float64Array(MAX_ENEMIES);
  private phases = new Float64Array(MAX_ENEMIES);
  private walking = new Float32Array(MAX_ENEMIES);
  phase = 0;
  walk = 0;
  reset(slot: number) {
    this.initialized[slot] = 0;
  }
  update(slot: number, enemy: Enemy, time: number) {
    const elapsed = time - this.time[slot];
    const distance = Math.hypot(enemy.x - this.x[slot], enemy.z - this.z[slot]);
    if (
      !this.initialized[slot] ||
      elapsed < 0 ||
      distance > ORC_ANIMATION.TELEPORT_RESET_DISTANCE_UNITS
    ) {
      this.phases[slot] = 0;
      this.walking[slot] = 0;
      this.initialized[slot] = 1;
    } else if (elapsed > 0) {
      this.phases[slot] =
        (this.phases[slot] + (distance * Math.PI * 2) / ORC_ANIMATION.STRIDE_LENGTH_UNITS) %
        (Math.PI * 2);
      const target =
        enemy.windup > 0
          ? 0
          : THREE.MathUtils.clamp(
              distance / elapsed / ORC_ANIMATION.FULL_WALK_BLEND_SPEED_UNITS_PER_SECOND,
              0,
              1,
            );
      this.walking[slot] +=
        (target - this.walking[slot]) *
        Math.min(1, elapsed * ORC_ANIMATION.WALK_BLEND_RATE_PER_SECOND);
    }
    this.x[slot] = enemy.x;
    this.z[slot] = enemy.z;
    this.time[slot] = time;
    this.phase = this.phases[slot];
    this.walk = this.walking[slot];
  }
}
