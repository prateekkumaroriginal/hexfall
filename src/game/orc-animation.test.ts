import { at } from '../lib/assert';
import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation';
import { OrcLocomotion } from './orc-animation';
import { ORC_ANIMATION } from '../config/rendering';
describe('orc locomotion', () => {
  it('advances the same gait for the same travel at different frame rates', () => {
    const pose = (frames: number) => {
      const animation = new OrcLocomotion();
      const enemy = at(new Simulation().enemies, 0);
      animation.update(0, enemy, 0);
      for (let frame = 1; frame <= frames; frame++) {
        enemy.z = frame / frames;
        animation.update(0, enemy, frame / frames);
      }
      return animation.phase;
    };
    expect(pose(30)).toBeCloseTo(
      ((2 * Math.PI) / ORC_ANIMATION.STRIDE_LENGTH_UNITS) % (2 * Math.PI),
    );
    expect(pose(60)).toBeCloseTo(pose(30));
  });
  it('settles when stopped, freezes when paused, and resets reused slots', () => {
    const animation = new OrcLocomotion();
    const enemy = at(new Simulation().enemies, 0);
    animation.update(0, enemy, 0);
    enemy.z = 0.3;
    animation.update(0, enemy, 0.3);
    expect(animation.walk).toBe(1);
    const phase = animation.phase;
    animation.update(0, enemy, 0.3);
    expect(animation.phase).toBe(phase);
    expect(animation.walk).toBe(1);
    animation.update(0, enemy, 0.5);
    expect(animation.walk).toBe(0);
    expect(animation.phase).toBe(phase);
    animation.reset(0);
    animation.update(0, enemy, 1);
    expect(animation.phase).toBe(0);
    expect(animation.walk).toBe(0);
    enemy.z += 100;
    animation.update(0, enemy, 1.1);
    expect(animation.phase).toBe(0);
    expect(animation.walk).toBe(0);
  });
});
