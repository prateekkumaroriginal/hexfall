import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('../config/gameplay');
  vi.resetModules();
});

describe('simulation config integration', () => {
  it('keeps orc health, damage, and movement independent when slime stats change', async () => {
    vi.resetModules();
    vi.doMock('../config/gameplay', async (importOriginal) => {
      const config = await importOriginal<typeof import('../config/gameplay')>();
      return {
        ...config,
        SLIME: {
          ...config.SLIME,
          health: 11,
          damage: 37,
          baseSpeedUnitsPerSecond: 8,
          speedPerWaveUnitsPerSecond: 0.9,
        },
      };
    });
    const { Simulation, blankInput } = await import('./simulation');
    const slime = new Simulation(() => 0.2);
    const orc = new Simulation(() => 0.8);
    for (const sim of [slime, orc]) {
      sim.reset();
      sim.wave = 2;
      sim.remaining = 1;
      sim.spawn();
      sim.spawnCooldown = 100;
      Object.assign(sim.enemies[0], { x: 0, z: -10, spawnRemaining: 0 });
    }
    expect(slime.enemies[0].hp).toBe(11);
    expect(orc.enemies[0].hp).toBe(4);
    for (const sim of [slime, orc]) sim.step(0.1, blankInput());
    expect(slime.enemies[0].z + 10).toBeCloseTo((8 + 2 * 0.9) * 0.1);
    expect(orc.enemies[0].z + 10).toBeCloseTo((0.837 + 2 * 0.0496) * 0.1);

    Object.assign(orc.enemies[0], { x: orc.x, z: orc.z - 1.5, windup: 0.01 });
    orc.step(0.02, blankInput());
    expect(orc.hp).toBe(82);
    Object.assign(slime.enemies[0], { x: slime.x, z: slime.z - 1, windup: 0.01 });
    slime.step(0.02, blankInput());
    expect(slime.hp).toBe(63);
  });

  it('uses configured player health, healing, spell damage, and first-wave composition', async () => {
    vi.resetModules();
    vi.doMock('../config/gameplay', async (importOriginal) => {
      const config = await importOriginal<typeof import('../config/gameplay')>();
      return {
        ...config,
        PLAYER: { ...config.PLAYER, maxHealth: 200, healingPerKill: 7, healingPerWave: 23 },
        STAFF: { ...config.STAFF, damage: 3 },
        WAVES: { ...config.WAVES, firstWave: { slimes: 2, orcs: 2 } },
      };
    });
    const { Simulation, blankInput } = await import('./simulation');
    const sim = new Simulation(() => 0.2);
    expect(sim.hp).toBe(200);
    sim.reset();
    expect(sim.hp).toBe(200);
    sim.hp = 180;
    sim.kill(sim.enemies[0]);
    expect(sim.hp).toBe(187);
    sim.hp = 199;
    sim.kill(sim.enemies[0]);
    expect(sim.hp).toBe(200);
    sim.hp = 150;
    sim.waveWait = 0;
    sim.step(1 / 60, blankInput());
    expect(sim.hp).toBe(173);
    expect(sim.remaining).toBe(4);
    for (let i = 0; i < 4; i++) sim.spawn();
    expect(sim.enemies.filter((e) => e.active).map((e) => e.kind)).toEqual([0, 0, 1, 1]);

    for (const enemy of sim.enemies) enemy.active = false;
    const orc = sim.enemies[0];
    Object.assign(orc, { active: true, kind: 1, hp: 4, x: 0, z: 3, windup: 0, cooldown: 100 });
    Object.assign(sim.projectiles[0], {
      active: true,
      x: 0,
      y: 1.35,
      z: 4.5,
      vx: 0,
      vy: 0,
      vz: -30,
      life: 2,
    });
    sim.step(0.05, blankInput());
    expect(orc.hp).toBe(1);
    expect(orc.active).toBe(true);
  });
});
