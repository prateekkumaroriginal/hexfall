import * as THREE from 'three';
import { MAX_ENEMIES } from '../config/runtime';
import { ORC_ANIMATION } from '../config/rendering';
import type { Enemy } from './simulation';
import { at } from '../lib/assert';

// Fixed slots track every enemy, including culled ones. Phase follows travel, not wall time.
export class OrcLocomotion {
  private slots = Array.from({ length: MAX_ENEMIES }, () => ({
    initialized: false,
    x: 0,
    z: 0,
    time: 0,
    phase: 0,
    walking: 0,
  }));
  phase = 0;
  walk = 0;
  reset(slot: number) {
    at(this.slots, slot).initialized = false;
  }
  update(slot: number, enemy: Enemy, time: number) {
    const state = at(this.slots, slot);
    const elapsed = time - state.time;
    const distance = Math.hypot(enemy.x - state.x, enemy.z - state.z);
    if (
      !state.initialized ||
      elapsed < 0 ||
      distance > ORC_ANIMATION.TELEPORT_RESET_DISTANCE_UNITS
    ) {
      state.phase = 0;
      state.walking = 0;
      state.initialized = true;
    } else if (elapsed > 0) {
      state.phase =
        (state.phase + (distance * Math.PI * 2) / ORC_ANIMATION.STRIDE_LENGTH_UNITS) %
        (Math.PI * 2);
      const target =
        enemy.windup > 0
          ? 0
          : THREE.MathUtils.clamp(
              distance / elapsed / ORC_ANIMATION.FULL_WALK_BLEND_SPEED_UNITS_PER_SECOND,
              0,
              1,
            );
      state.walking +=
        (target - state.walking) * Math.min(1, elapsed * ORC_ANIMATION.WALK_BLEND_RATE_PER_SECOND);
      // Preserve the existing Float32 blend precision without parallel buffers.
      state.walking = Math.fround(state.walking);
    }
    state.x = enemy.x;
    state.z = enemy.z;
    state.time = time;
    this.phase = state.phase;
    this.walk = state.walking;
  }
}
