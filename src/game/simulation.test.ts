import { assign } from '../lib/assign';
import { at, required } from '../lib/assert';
import { describe, expect, it } from 'vitest';
import { blankInput, Simulation } from './simulation';
import { ORC, SLIME } from '../config/gameplay';
import { MAX_PROJECTILES } from '../config/runtime';
import { ARENA_HALF_WIDTH, ARENA_HALF_DEPTH, BOULDERS } from '../config/world';
import { TREE_OBSTACLES, WORLD_OBSTACLES } from './world';
const advance = (sim: Simulation, seconds: number, input = blankInput()) => {
  for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60, input);
};
describe('combat simulation', () => {
  it('keeps the orc planted through punch recovery, then resumes pursuit', () => {
    const sim = new Simulation();
    sim.reset();
    sim.waveWait = 1000;
    const orc = at(sim.enemies, 0);
    assign(orc, {
      active: true,
      id: 'orc',
      hp: ORC.HEALTH,
      x: sim.x,
      z: sim.z - 1.5,
      windup: 0,
      cooldown: ORC.ATTACK_COOLDOWN_SECONDS,
    });
    const start = { x: orc.x, z: orc.z };
    advance(sim, ORC.PUNCH_RECOVERY_SECONDS - 0.05);
    expect(orc.x).toBe(start.x);
    expect(orc.z).toBe(start.z);
    advance(sim, 0.1);
    expect(Math.hypot(orc.x - start.x, orc.z - start.z)).toBeGreaterThan(0.01);
  });
  it.each([0.1, 0.9])('starts with exactly one slime and one orc for random %f', (random) => {
    const sim = new Simulation(() => random);
    sim.reset();
    sim.waveWait = 0;
    sim.step(1 / 60, blankInput());
    expect(sim.wave).toBe(1);
    expect(sim.remaining).toBe(2);
    advance(sim, 2.1);
    const enemies = sim.enemies.filter((enemy) => enemy.active);
    expect(enemies.map((enemy) => enemy.id).sort()).toEqual(['orc', 'slime']);
    expect(sim.remaining).toBe(0);
    expect(sim.wave).toBe(1);
    expect(required(enemies.find((enemy) => enemy.id === 'slime')).hp).toBe(SLIME.HEALTH);
    expect(required(enemies.find((enemy) => enemy.id === 'orc')).hp).toBe(ORC.HEALTH);
  });
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
    // Test movement without random enemy spawns influencing player separation.
    a.waveWait = b.waveWait = 1000;
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
    const e = at(sim.enemies, 0);
    expect(Math.abs(e.x)).toBeLessThan(ARENA_HALF_WIDTH);
    expect(Math.abs(e.z)).toBeLessThan(ARENA_HALF_DEPTH);
    expect(
      Math.abs(e.x) === ARENA_HALF_WIDTH - 0.8 || Math.abs(e.z) === ARENA_HALF_DEPTH - 0.8,
    ).toBe(true);
  });
  it('spawns each enemy with its own configured health', () => {
    const slime = new Simulation(() => 0.2),
      orc = new Simulation(() => 0.8);
    slime.wave = orc.wave = 2;
    slime.remaining = orc.remaining = 1;
    slime.spawn();
    orc.spawn();
    expect(at(slime.enemies, 0).hp).toBe(SLIME.HEALTH);
    expect(at(orc.enemies, 0).hp).toBe(ORC.HEALTH);
    expect(at(slime.enemies, 0).hp).toBe(2);
    expect(at(orc.enemies, 0).hp).toBe(4);
  });
  it('kills a spawned slime with two spell hits', () => {
    const sim = new Simulation(() => 0.2);
    sim.reset();
    sim.remaining = 1;
    sim.spawn();
    sim.spawnCooldown = 100;
    const slime = at(sim.enemies, 0);
    assign(slime, { x: 0, z: 3, spawnRemaining: 0, cooldown: 100 });
    expect(slime.hp).toBe(2);
    for (let hit = 1; hit <= 2; hit++) {
      assign(at(sim.projectiles, 0), {
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
  it.each([1, 2, 3, 4, 5])('preserves movement speed for each species in wave %i', (wave) => {
    const travel = (['slime', 'orc'] as const).map((id) => {
      const sim = new Simulation();
      sim.reset();
      sim.wave = wave;
      sim.remaining = 1;
      sim.spawnCooldown = 100;
      assign(at(sim.enemies, 0), {
        active: true,
        x: 0,
        z: -10,
        hp: id === 'orc' ? 6 : 3,
        id,
      });
      advance(sim, 1);
      return at(sim.enemies, 0).z + 10;
    });
    expect(travel[0]).toBeCloseTo(1.04625 + wave * 0.062);
    expect(travel[1]).toBeCloseTo(0.837 + wave * 0.0496);
  });
  it('keeps forming slimes stationary and harmless until their birth finishes', () => {
    const sim = new Simulation(() => 0.2);
    sim.reset();
    sim.remaining = 1;
    sim.spawn();
    sim.spawnCooldown = 100;
    const e = at(sim.enemies, 0);
    e.x = sim.x;
    e.z = sim.z - 1;
    const position = [e.x, e.z];
    advance(sim, SLIME.SPAWN_DURATION_SECONDS - 0.1);
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
    const remaining = at(sim.enemies, 0).spawnRemaining;
    sim.phase = 'paused';
    advance(sim, 2);
    expect(at(sim.enemies, 0).spawnRemaining).toBe(remaining);
    sim.phase = 'playing';
    advance(sim, 0.4);
    expect(at(sim.enemies, 0).spawnRemaining).toBeLessThan(remaining);
    sim.kill(at(sim.enemies, 0));
    sim.remaining = 1;
    sim.spawn();
    expect(at(sim.enemies, 0).spawnRemaining).toBe(SLIME.SPAWN_DURATION_SECONDS);
    sim.reset();
    expect(at(sim.enemies, 0).spawnRemaining).toBe(0);
    expect(sim.alive).toBe(0);
  });
  it('matches projectile hits to the growing slime instead of an invisible full-size body', () => {
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    const e = at(sim.enemies, 0);
    assign(e, {
      active: true,
      x: 0,
      z: 3,
      hp: 3,
      id: 'slime',
      spawnRemaining: SLIME.SPAWN_DURATION_SECONDS * 0.7,
    });
    const shot = at(sim.projectiles, 0);
    assign(shot, { active: true, x: 0, y: 1, z: 5, vx: 0, vy: 0, vz: -30, life: 2 });
    advance(sim, 0.1);
    expect(e.hp).toBe(3);
    assign(shot, { active: true, x: 0, y: 0.07, z: 5, vx: 0, vy: 0, vz: -30, life: 2 });
    advance(sim, 0.1);
    expect(e.hp).toBe(2);
  });
  it.each(['slime', 'orc'] as const)(
    'enemy id %s pursues the player without dealing ranged damage',
    (id) => {
      const sim = new Simulation();
      sim.reset();
      sim.remaining = 1;
      sim.spawnCooldown = 100;
      assign(at(sim.enemies, 0), { active: true, x: 0, z: -10, hp: 6, id });
      advance(sim, 2);
      expect(at(sim.enemies, 0).z).toBeGreaterThan(-10);
      expect(sim.hp).toBe(100);
      expect(sim.projectiles.some((p) => p.active)).toBe(false);
    },
  );
  it.each(['slime', 'orc'] as const)(
    'enemy id %s deals melee damage only after a wind-up',
    (id) => {
      const sim = new Simulation();
      sim.reset();
      sim.remaining = 1;
      sim.spawnCooldown = 100;
      assign(at(sim.enemies, 0), { active: true, x: 0, z: 8, hp: 6, id });
      advance(sim, 0.2);
      expect(sim.hp).toBe(100);
      advance(sim, 0.5);
      expect(sim.hp).toBe(id === 'orc' ? 82 : 90);
      advance(sim, 0.2);
      expect(sim.hp).toBe(id === 'orc' ? 82 : 90);
    },
  );
  it('lets the player dodge a committed melee attack', () => {
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    assign(at(sim.enemies, 0), { active: true, x: 0, z: 8, hp: 6, id: 'orc' });
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
    assign(at(sim.enemies, 0), {
      active: true,
      x: 0,
      z: 3,
      hp: 3,
      id: 'slime',
      cooldown: 100,
    });
    advance(sim, 0.8, { ...blankInput(), fire: true, pitch: -0.12 });
    expect(sim.kills).toBe(1);
    expect(sim.score).toBe(100);
  });
  it('blocks spells with boulders', () => {
    const sim = new Simulation();
    sim.reset();
    const p = BOULDERS.LAYOUT[0];
    sim.x = p.X;
    sim.z = p.Z + 4;
    assign(at(sim.enemies, 0), { active: true, x: p.X, z: p.Z - 4, hp: 6, id: 'orc' });
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    sim.cast(blankInput());
    advance(sim, 0.3);
    expect(at(sim.enemies, 0).hp).toBe(6);
    expect(sim.projectiles.some((p) => p.active)).toBe(false);
  });
  it.each([8, 9, 10, 11])(
    'blocks player movement at tree %i and allows sliding around it',
    (index) => {
      const tree = at(TREE_OBSTACLES, index);
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
    const tree = at(TREE_OBSTACLES, 8);
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    assign(at(sim.enemies, 0), {
      active: true,
      id: 'orc',
      hp: 6,
      x: tree.x - 1.2,
      z: tree.z,
    });
    assign(at(sim.projectiles, 0), {
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
    expect(at(sim.projectiles, 0).active).toBe(false);
    expect(at(sim.projectiles, 0).x).toBeCloseTo(tree.x + tree.radius);
    expect(at(sim.enemies, 0).hp).toBe(6);
  });
  it('blocks spells starting inside a trunk and vertical spells entering its top', () => {
    const tree = at(TREE_OBSTACLES, 10);
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    assign(at(sim.projectiles, 0), {
      active: true,
      x: tree.x,
      y: 1.6,
      z: tree.z,
      vx: 0,
      vy: 0,
      vz: 30,
      life: 2,
    });
    assign(at(sim.projectiles, 1), {
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
    expect(at(sim.projectiles, 0).active).toBe(false);
    expect(at(sim.projectiles, 0).z).toBe(tree.z);
    expect(at(sim.projectiles, 1).active).toBe(false);
    expect(at(sim.projectiles, 1).y).toBeCloseTo(tree.height);
  });
  it.each(['slime', 'orc'] as const)(
    'keeps enemy id %s outside trunks after movement and crowd separation',
    (id) => {
      const tree = at(TREE_OBSTACLES, 10);
      const sim = new Simulation();
      sim.reset();
      sim.remaining = 1;
      sim.spawnCooldown = 100;
      sim.x = tree.x + 2;
      sim.z = tree.z + 2;
      for (let i = 0; i < 3; i++)
        assign(at(sim.enemies, i), {
          active: true,
          id,
          hp: 6,
          x: tree.x + i * 0.1,
          z: tree.z,
        });
      for (let i = 0; i < 120; i++) {
        sim.step(1 / 60, blankInput());
        for (const enemy of sim.enemies.filter((e) => e.active)) {
          expect(Math.hypot(enemy.x - tree.x, enemy.z - tree.z)).toBeGreaterThanOrEqual(
            tree.radius + (id === 'orc' ? 0.65 : 0.85) - 1e-8,
          );
        }
      }
    },
  );
  it('moves a spawn along the edge when its initial point overlaps a tree', () => {
    const tree = at(TREE_OBSTACLES, 10);
    const values = [0.6, (tree.x / (ARENA_HALF_WIDTH - 1.5) + 1) / 2, 0.2];
    const sim = new Simulation(() => values.shift() ?? 0.2);
    sim.remaining = 1;
    sim.spawn();
    const enemy = at(sim.enemies, 0);
    expect(enemy.active).toBe(true);
    expect(enemy.z).toBe(-ARENA_HALF_DEPTH + 0.8);
    expect(sim.remaining).toBe(0);
    for (const obstacle of WORLD_OBSTACLES)
      expect(Math.hypot(enemy.x - obstacle.x, enemy.z - obstacle.z)).toBeGreaterThanOrEqual(
        obstacle.radius + 0.85,
      );
  });
  it('keeps an enemy between a trunk and the wall clear of both', () => {
    const tree = at(TREE_OBSTACLES, 9);
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    const enemy = at(sim.enemies, 0);
    assign(enemy, {
      active: true,
      id: 'slime',
      hp: 3,
      x: ARENA_HALF_WIDTH - 0.6,
      z: tree.z,
    });
    for (let i = 0; i < 60; i++) {
      sim.step(1 / 60, blankInput());
      expect(Math.hypot(enemy.x - tree.x, enemy.z - tree.z)).toBeGreaterThanOrEqual(
        tree.radius + 0.85 - 1e-8,
      );
      expect(Math.abs(enemy.x)).toBeLessThanOrEqual(ARENA_HALF_WIDTH - 0.6);
      expect(Math.abs(enemy.z)).toBeLessThanOrEqual(ARENA_HALF_DEPTH - 0.6);
    }
  });
  it('keeps the camera outside an orc while allowing retreat and melee damage', () => {
    const sim = new Simulation();
    sim.reset();
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    const orc = at(sim.enemies, 0);
    assign(orc, { active: true, id: 'orc', hp: 6, x: 0, z: 7.5 });
    const input = { ...blankInput(), forward: 1 };
    for (let i = 0; i < 40; i++) {
      sim.step(1 / 60, input);
      expect(Math.hypot(sim.x - orc.x, sim.z - orc.z)).toBeGreaterThan(1.3);
    }
    expect(sim.hp).toBeLessThan(100);
    const before = sim.z;
    sim.step(1 / 60, { ...input, forward: -1 });
    expect(sim.z).toBeGreaterThan(before);
  });
  it('hits only the nearest enemy along the crosshair', () => {
    const sim = new Simulation();
    sim.reset();
    assign(at(sim.enemies, 0), { active: true, x: 0, z: 3, hp: 6, id: 'orc' });
    assign(at(sim.enemies, 1), { active: true, x: 0, z: 0, hp: 6, id: 'orc' });
    sim.remaining = 1;
    sim.spawnCooldown = 100;
    sim.cast(blankInput());
    expect(at(sim.enemies, 0).hp).toBe(6);
    advance(sim, 0.2);
    expect(at(sim.enemies, 0).hp).toBe(5);
    expect(at(sim.enemies, 1).hp).toBe(6);
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
    const boulder = BOULDERS.LAYOUT[0];
    assign(at(sim.projectiles, 0), {
      active: true,
      x: boulder.X,
      y: 1,
      z: boulder.Z,
      vx: 0,
      vy: 0,
      vz: -30,
      life: 2,
    });
    advance(sim, 1 / 60);
    expect(at(sim.projectiles, 0).active).toBe(false);
  });
  it('finishes after five cleared waves', () => {
    const sim = new Simulation();
    sim.reset();
    for (let wave = 1; wave <= 5; wave++) {
      sim.waveWait = 0;
      sim.step(1 / 60, blankInput());
      expect(sim.wave).toBe(wave);
      expect(sim.remaining).toBe(wave === 1 ? 2 : 7 + wave * 5);
      sim.remaining = 0;
    }
    sim.waveWait = 0;
    sim.step(1 / 60, blankInput());
    expect(sim.phase).toBe('won');
  });
});
