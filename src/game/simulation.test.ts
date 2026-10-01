import { describe, expect, it } from 'vitest';
import {
  blankInput,
  SLIME_HEALTH,
  SLIME_SPAWN_DURATION,
  ORC_HEALTH,
  OBSTACLES,
  TREE_OBSTACLES,
  WORLD_OBSTACLES,
  MAX_PROJECTILES,
  ARENA_HALF_WIDTH,
  ARENA_HALF_DEPTH,
  Simulation,
} from './simulation';

const advance = (sim: Simulation, seconds: number, input = blankInput()) => {
  for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60, input);
};
describe('combat simulation', () => {
  it('does not simulate before start or while paused', () => {
    const sim = new Simulation();
    advance(sim, 3);
    expect(sim.time).toBe(0);
    sim.reset();
    advance(sim, 1);
    sim.phase = 'paused';
    const snapshot = sim.snapshot();
    advance(sim, 2);
    expect(sim.snapshot()).toEqual(snapshot);
  });
  it('normalizes diagonal movement and keeps the player within the arena', () => {
    const a = new Simulation(),
      b = new Simulation();
    a.reset();
    b.reset();
    advance(a, 0.5, { ...blankInput(), forward: 1 });
    advance(b, 0.5, { ...blankInput(), forward: 1, strafe: 1 });
    expect(Math.hypot(b.x, b.z - 9)).toBeCloseTo(Math.hypot(a.x, a.z - 9));
    advance(a, 20, { ...blankInput(), strafe: 1 });
    expect(a.x).toBeLessThanOrEqual(ARENA_HALF_WIDTH - 0.45);
  });
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])(
    'contains movement and stops spells at wall facing %f',
    (yaw) => {
      const sim = new Simulation();
      sim.reset();
      sim.remaining = 1;
      sim.spawnCooldown = 1000;
      advance(sim, 10, { ...blankInput(), forward: 1, yaw });
      expect(Math.abs(sim.x)).toBeLessThanOrEqual(ARENA_HALF_WIDTH - 0.45);
      expect(Math.abs(sim.z)).toBeLessThanOrEqual(ARENA_HALF_DEPTH - 0.45);
      sim.cast({ ...blankInput(), yaw });
      advance(sim, 0.2);
      expect(sim.projectiles.some((p) => p.active)).toBe(false);
    },
  );
  it.each([0.1, 0.35, 0.6, 0.85])('spawns inside rectangular boundary on side %f', (random) => {
    const sim = new Simulation(() => random);
    sim.remaining = 1;
    sim.spawn();
    const e = sim.enemies[0];
    expect(Math.abs(e.x)).toBeLessThan(ARENA_HALF_WIDTH);
    expect(Math.abs(e.z)).toBeLessThan(ARENA_HALF_DEPTH);
    expect(
      Math.abs(e.x) === ARENA_HALF_WIDTH - 0.8 || Math.abs(e.z) === ARENA_HALF_DEPTH - 0.8,
    ).toBe(true);
  });
  it('spawns orcs with exactly twice slime health', () => {
    const slime = new Simulation(() => 0.2),
      orc = new Simulation(() => 0.8);
    slime.wave = orc.wave = 2;
    slime.remaining = orc.remaining = 1;
    slime.spawn();
    orc.spawn();
    expect(slime.enemies[0].hp).toBe(SLIME_HEALTH);
    expect(orc.enemies[0].hp).toBe(ORC_HEALTH);
    expect(orc.enemies[0].hp).toBe(slime.enemies[0].hp * 2);
  });
  it('kills a spawned slime with two spell hits', () => {
    const sim = new Simulation(() => 0.2);
    sim.reset();
    sim.remaining = 1;
    sim.spawn();
    sim.spawnCooldown = 100;
    const slime = sim.enemies[0];
    Object.assign(slime, { x: 0, z: 3, spawnRemaining: 0, cooldown: 100 });
    expect(slime.hp).toBe(2);
    for (let hit = 1; hit <= 2; hit++) {
      Object.assign(sim.projectiles[0], {
        active: true,
        x: 0,
        y: 0.8,
        z: 4.5,
        vx: 0,
        vy: 0,
        vz: -30,
        life: 2,
      });
      advance(sim, 0.05);
      expect(slime.hp).toBe(2 - hit);
      expect(slime.active).toBe(hit < 2);
    }
    expect(sim.kills).toBe(1);
  });
  it.each([1, 2, 3, 4, 5])(
    'slows slimes by 22.5%% and keeps orcs 20%% slower in wave %i',
    (wave) => {
      const travel = [0, 1].map((kind) => {
        const sim = new Simulation();
        sim.reset();
        sim.wave = wave;
        sim.remaining = 1;
        sim.spawnCooldown = 100;
        Object.assign(sim.enemies[0], { active: true, x: 0, z: -10, hp: kind ? 6 : 3, kind });
        advance(sim, 1);
        return sim.enemies[0].z + 10;
      });
      expect(travel[0]).toBeCloseTo((1.35 + wave * 0.08) * 0.775);
      expect(travel[1]).toBeCloseTo(travel[0] * 0.8);
    },
  );
  it('keeps forming slimes stationary and harmless until their birth finishes', () => {
    const sim = new Simulation(() => 0.2);
    sim.reset();
    sim.remaining = 1;
    sim.spawn();
    sim.spawnCooldown = 100;
    const e = sim.enemies[0];
    e.x = sim.x;
    e.z = sim.z - 1;
    const position = [e.x, e.z];
    advance(sim, SLIME_SPAWN_DURATION - 0.1);
    expect([e.x, e.z]).toEqual(position);
    expect(e.windup).toBe(0);
    expect(sim.hp).toBe(100);
    expect(sim.alive).toBe(1);
    advance(sim, 0.2);
    expect(e.spawnRemaining).toBe(0);
    expect(e.windup).toBeGreaterThan(0);
    expect(sim.hp).toBe(100);
    advance(sim, 0.5);
    expect(sim.hp).toBe(90);
  });
  it('freezes slime formation while paused and restarts it when a pool slot is reused', () => {
    const sim = new Simulation(() => 0.2);
    sim.reset();
    sim.remaining = 1;
    sim.spawn();
    sim.spawnCooldown = 100;
    advance(sim, 0.4);
    const remaining = sim.enemies[0].spawnRemaining;
    sim.phase = 'paused';
    advance(sim, 2);
    expect(sim.enemies[0].spawnRemaining).toBe(remaining);
    sim.phase = 'playing';
    advance(sim, 0.4);
    expect(sim.enemies[0].spawnRemaining).toBeLessThan(remaining);
    sim.kill(sim.enemies[0]);
    sim.remaining = 1;
    sim.spawn();
    expect(sim.enemies[0].spawnRemaining).toBe(SLIME_SPAWN_DURATION);
    sim.reset();
    expect(sim.enemies[0].spawnRemaining).toBe(0);
    expect(sim.alive).toBe(0);
  });
  it('matches projectile hits to the growing slime instead of an invisible full-size body', () => {
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    const e = sim.enemies[0];
    Object.assign(e, {
      active: true,
      x: 0,
      z: 3,
      hp: 3,
      kind: 0,
      spawnRemaining: SLIME_SPAWN_DURATION * 0.7,
    });
    const shot = sim.projectiles[0];
    Object.assign(shot, { active: true, x: 0, y: 1, z: 5, vx: 0, vy: 0, vz: -30, life: 2 });
    advance(sim, 0.1);
    expect(e.hp).toBe(3);
    Object.assign(shot, { active: true, x: 0, y: 0.07, z: 5, vx: 0, vy: 0, vz: -30, life: 2 });
    advance(sim, 0.1);
    expect(e.hp).toBe(2);
  });
  it.each([0, 1])('enemy kind %i pursues the player without dealing ranged damage', (kind) => {
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    Object.assign(sim.enemies[0], { active: true, x: 0, z: -10, hp: 6, kind });
    advance(sim, 2);
    expect(sim.enemies[0].z).toBeGreaterThan(-10);
    expect(sim.hp).toBe(100);
    expect(sim.projectiles.some((p) => p.active)).toBe(false);
  });
  it.each([0, 1])('enemy kind %i deals melee damage only after a wind-up', (kind) => {
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    Object.assign(sim.enemies[0], { active: true, x: 0, z: 8, hp: 6, kind });
    advance(sim, 0.2);
    expect(sim.hp).toBe(100);
    advance(sim, 0.5);
    expect(sim.hp).toBe(kind ? 82 : 90);
    advance(sim, 0.2);
    expect(sim.hp).toBe(kind ? 82 : 90);
  });
  it('lets the player dodge a committed melee attack', () => {
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    Object.assign(sim.enemies[0], { active: true, x: 0, z: 8, hp: 6, kind: 1 });
    advance(sim, 0.2);
    sim.x = 5;
    advance(sim, 0.5);
    expect(sim.hp).toBe(100);
  });
  it('damages and kills enemies with travelling spell projectiles', () => {
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    Object.assign(sim.enemies[0], { active: true, x: 0, z: 3, hp: 3, kind: 0, cooldown: 100 });
    advance(sim, 0.8, { ...blankInput(), fire: true, pitch: -0.12 });
    expect(sim.kills).toBe(1);
    expect(sim.score).toBe(100);
  });
  it('blocks spells with boulders', () => {
    const sim = new Simulation();
    sim.reset();
    const p = OBSTACLES[0];
    sim.x = p.x;
    sim.z = p.z + 4;
    Object.assign(sim.enemies[0], { active: true, x: p.x, z: p.z - 4, hp: 6, kind: 1 });
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    sim.cast(blankInput());
    advance(sim, 0.3);
    expect(sim.enemies[0].hp).toBe(6);
    expect(sim.projectiles.some((p) => p.active)).toBe(false);
  });
  it.each([8, 9, 10, 11])(
    'blocks player movement at tree %i and allows sliding around it',
    (index) => {
      const tree = TREE_OBSTACLES[index];
      const sim = new Simulation();
      sim.reset();
      sim.remaining = 1;
      sim.spawnCooldown = 100;
      sim.x = tree.x;
      sim.z = tree.z + (tree.z > 0 ? -3 : 3);
      const toward = { ...blankInput(), forward: tree.z > 0 ? -1 : 1 };
      advance(sim, 0.6, toward);
      expect(Math.hypot(sim.x - tree.x, sim.z - tree.z)).toBeGreaterThanOrEqual(
        tree.radius + 0.4 - 1e-8,
      );
      expect(Math.sign(sim.z - tree.z)).toBe(tree.z > 0 ? -1 : 1);
      const before = sim.z;
      advance(sim, 0.4, { ...toward, strafe: tree.x > 0 ? -1 : 1 });
      expect(Math.abs(sim.x - tree.x)).toBeGreaterThan(tree.radius + 0.4);
      expect(Math.abs(sim.z - before)).toBeGreaterThan(0.2);
      expect(Math.abs(sim.x)).toBeLessThanOrEqual(ARENA_HALF_WIDTH - 0.45);
      expect(Math.abs(sim.z)).toBeLessThanOrEqual(ARENA_HALF_DEPTH - 0.45);
    },
  );
  it('stops a fast spell at a thin trunk before an enemy behind it', () => {
    const tree = TREE_OBSTACLES[8];
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    Object.assign(sim.enemies[0], { active: true, kind: 1, hp: 6, x: tree.x - 1.2, z: tree.z });
    Object.assign(sim.projectiles[0], {
      active: true,
      x: tree.x + 3,
      y: 1.6,
      z: tree.z,
      vx: -30,
      vy: 0,
      vz: 0,
      life: 2,
    });
    sim.step(0.2, blankInput());
    expect(sim.projectiles[0].active).toBe(false);
    expect(sim.projectiles[0].x).toBeCloseTo(tree.x + tree.radius);
    expect(sim.enemies[0].hp).toBe(6);
  });
  it('blocks spells starting inside a trunk and vertical spells entering its top', () => {
    const tree = TREE_OBSTACLES[10];
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    Object.assign(sim.projectiles[0], {
      active: true,
      x: tree.x,
      y: 1.6,
      z: tree.z,
      vx: 0,
      vy: 0,
      vz: 30,
      life: 2,
    });
    Object.assign(sim.projectiles[1], {
      active: true,
      x: tree.x,
      y: tree.height + 1,
      z: tree.z,
      vx: 0,
      vy: -30,
      vz: 0,
      life: 2,
    });
    sim.step(0.1, blankInput());
    expect(sim.projectiles[0].active).toBe(false);
    expect(sim.projectiles[0].z).toBe(tree.z);
    expect(sim.projectiles[1].active).toBe(false);
    expect(sim.projectiles[1].y).toBeCloseTo(tree.height);
  });
  it.each([0, 1])(
    'keeps enemy kind %i outside trunks after movement and crowd separation',
    (kind) => {
      const tree = TREE_OBSTACLES[10];
      const sim = new Simulation();
      sim.reset();
      sim.remaining = 1;
      sim.spawnCooldown = 100;
      sim.x = tree.x + 2;
      sim.z = tree.z + 2;
      for (let i = 0; i < 3; i++)
        Object.assign(sim.enemies[i], {
          active: true,
          kind,
          hp: 6,
          x: tree.x + i * 0.1,
          z: tree.z,
        });
      for (let i = 0; i < 120; i++) {
        sim.step(1 / 60, blankInput());
        for (const enemy of sim.enemies.filter((e) => e.active)) {
          expect(Math.hypot(enemy.x - tree.x, enemy.z - tree.z)).toBeGreaterThanOrEqual(
            tree.radius + (kind ? 0.65 : 0.85) - 1e-8,
          );
        }
      }
    },
  );
  it('moves a spawn along the edge when its initial point overlaps a tree', () => {
    const tree = TREE_OBSTACLES[10];
    const values = [0.6, (tree.x / (ARENA_HALF_WIDTH - 1.5) + 1) / 2, 0.2];
    const sim = new Simulation(() => values.shift() ?? 0.2);
    sim.remaining = 1;
    sim.spawn();
    const enemy = sim.enemies[0];
    expect(enemy.active).toBe(true);
    expect(enemy.z).toBe(-ARENA_HALF_DEPTH + 0.8);
    expect(sim.remaining).toBe(0);
    for (const obstacle of WORLD_OBSTACLES)
      expect(Math.hypot(enemy.x - obstacle.x, enemy.z - obstacle.z)).toBeGreaterThanOrEqual(
        obstacle.radius + 0.85,
      );
  });
  it('keeps an enemy between a trunk and the wall clear of both', () => {
    const tree = TREE_OBSTACLES[9];
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    const enemy = sim.enemies[0];
    Object.assign(enemy, { active: true, kind: 0, hp: 3, x: ARENA_HALF_WIDTH - 0.6, z: tree.z });
    for (let i = 0; i < 60; i++) {
      sim.step(1 / 60, blankInput());
      expect(Math.hypot(enemy.x - tree.x, enemy.z - tree.z)).toBeGreaterThanOrEqual(
        tree.radius + 0.85 - 1e-8,
      );
      expect(Math.abs(enemy.x)).toBeLessThanOrEqual(ARENA_HALF_WIDTH - 0.6);
      expect(Math.abs(enemy.z)).toBeLessThanOrEqual(ARENA_HALF_DEPTH - 0.6);
    }
  });
  it('hits only the nearest enemy along the crosshair', () => {
    const sim = new Simulation();
    sim.reset();
    Object.assign(sim.enemies[0], { active: true, x: 0, z: 3, hp: 6, kind: 1 });
    Object.assign(sim.enemies[1], { active: true, x: 0, z: 0, hp: 6, kind: 1 });
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    sim.cast(blankInput());
    expect(sim.enemies[0].hp).toBe(6);
    advance(sim, 0.2);
    expect(sim.enemies[0].hp).toBe(5);
    expect(sim.enemies[1].hp).toBe(6);
  });
  it('applies damage immunity and allows restarting after death', () => {
    const sim = new Simulation();
    sim.reset();
    sim.damage(20);
    sim.damage(20);
    expect(sim.hp).toBe(80);
    advance(sim, 0.6);
    sim.damage(100);
    expect(sim.phase).toBe('dead');
    sim.reset();
    expect(sim.hp).toBe(100);
    expect(sim.phase).toBe('playing');
    expect(sim.time).toBe(0);
  });
  it('bounds projectile allocation, expires misses, and clears shots on reset', () => {
    const sim = new Simulation();
    sim.reset();
    for (let i = 0; i < MAX_PROJECTILES + 10; i++) sim.cast({ ...blankInput(), pitch: 0.8 });
    expect(sim.projectiles.filter((p) => p.active)).toHaveLength(MAX_PROJECTILES);
    advance(sim, 2.1);
    expect(sim.projectiles.some((p) => p.active)).toBe(false);
    sim.cast(blankInput());
    expect(sim.projectiles.some((p) => p.active)).toBe(true);
    sim.reset();
    expect(sim.projectiles.some((p) => p.active)).toBe(false);
  });
  it('stops downward projectiles at the ground', () => {
    const sim = new Simulation();
    sim.reset();
    sim.cast({ ...blankInput(), pitch: -0.8 });
    advance(sim, 0.2);
    expect(sim.projectiles.some((p) => p.active)).toBe(false);
  });
  it('does not let a muzzle inside a boulder shoot through it', () => {
    const sim = new Simulation();
    sim.reset();
    const boulder = OBSTACLES[0];
    Object.assign(sim.projectiles[0], {
      active: true,
      x: boulder.x,
      y: 1,
      z: boulder.z,
      vx: 0,
      vy: 0,
      vz: -30,
      life: 2,
    });
    advance(sim, 1 / 60);
    expect(sim.projectiles[0].active).toBe(false);
  });
  it('finishes after five cleared waves', () => {
    const sim = new Simulation();
    sim.reset();
    for (let wave = 1; wave <= 5; wave++) {
      sim.waveWait = 0;
      sim.step(1 / 60, blankInput());
      expect(sim.wave).toBe(wave);
      expect(sim.remaining).toBe(7 + wave * 5);
      sim.remaining = 0;
    }
    sim.waveWait = 0;
    sim.step(1 / 60, blankInput());
    expect(sim.phase).toBe('won');
  });
});
