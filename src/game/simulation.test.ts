import { describe, expect, it } from 'vitest';
import { blankInput, SLIME_HEALTH, SLIME_SPAWN_DURATION, ORC_HEALTH, OBSTACLES, MAX_PROJECTILES, ARENA_HALF_WIDTH, ARENA_HALF_DEPTH, Simulation } from './simulation';

const advance = (sim: Simulation, seconds: number, input = blankInput()) => { for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60, input); };
describe('combat simulation', () => {
  it('does not simulate before start or while paused', () => {
    const sim = new Simulation(); advance(sim, 3); expect(sim.time).toBe(0);
    sim.reset(); advance(sim, 1); sim.phase = 'paused'; const snapshot = sim.snapshot(); advance(sim, 2); expect(sim.snapshot()).toEqual(snapshot);
  });
  it('normalizes diagonal movement and keeps the player within the arena', () => {
    const a = new Simulation(), b = new Simulation(); a.reset(); b.reset();
    advance(a, .5, { ...blankInput(), forward: 1 }); advance(b, .5, { ...blankInput(), forward: 1, strafe: 1 });
    expect(Math.hypot(b.x, b.z - 9)).toBeCloseTo(Math.hypot(a.x, a.z - 9));
    advance(a, 20, { ...blankInput(), strafe: 1 }); expect(a.x).toBeLessThanOrEqual(ARENA_HALF_WIDTH - .45);
  });
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])('contains movement and stops spells at wall facing %f', yaw => {
    const sim = new Simulation(); sim.reset(); sim.remaining = 1; sim.spawnCooldown = 1000;
    advance(sim, 10, { ...blankInput(), forward: 1, yaw });
    expect(Math.abs(sim.x)).toBeLessThanOrEqual(ARENA_HALF_WIDTH - .45);
    expect(Math.abs(sim.z)).toBeLessThanOrEqual(ARENA_HALF_DEPTH - .45);
    sim.cast({ ...blankInput(), yaw }); advance(sim, .2);
    expect(sim.projectiles.some(p => p.active)).toBe(false);
  });
  it.each([.1, .35, .6, .85])('spawns inside rectangular boundary on side %f', random => {
    const sim = new Simulation(() => random); sim.remaining = 1; sim.spawn();
    const e = sim.enemies[0];
    expect(Math.abs(e.x)).toBeLessThan(ARENA_HALF_WIDTH);
    expect(Math.abs(e.z)).toBeLessThan(ARENA_HALF_DEPTH);
    expect(Math.abs(e.x) === ARENA_HALF_WIDTH - .8 || Math.abs(e.z) === ARENA_HALF_DEPTH - .8).toBe(true);
  });
  it('spawns orcs with exactly twice slime health', () => {
    const slime = new Simulation(() => 0.2), orc = new Simulation(() => 0.8);
    slime.wave = orc.wave = 2; slime.remaining = orc.remaining = 1; slime.spawn(); orc.spawn();
    expect(slime.enemies[0].hp).toBe(SLIME_HEALTH); expect(orc.enemies[0].hp).toBe(ORC_HEALTH);
    expect(orc.enemies[0].hp).toBe(slime.enemies[0].hp * 2);
  });
  it.each([1, 2, 3, 4, 5])('slows slimes by 22.5%% and keeps orcs 20%% slower in wave %i', wave => {
    const travel = [0, 1].map(kind => {
      const sim = new Simulation(); sim.reset(); sim.wave = wave; sim.remaining = 1; sim.spawnCooldown = 100;
      Object.assign(sim.enemies[0], { active: true, x: 0, z: -10, hp: kind ? 6 : 3, kind });
      advance(sim, 1); return sim.enemies[0].z + 10;
    });
    expect(travel[0]).toBeCloseTo((1.35 + wave * .08) * .775);
    expect(travel[1]).toBeCloseTo(travel[0] * .8);
  });
  it('keeps forming slimes stationary and harmless until their birth finishes', () => {
    const sim = new Simulation(() => .2); sim.reset(); sim.remaining = 1; sim.spawn(); sim.spawnCooldown = 100;
    const e = sim.enemies[0]; e.x = sim.x; e.z = sim.z - 1;
    const position = [e.x, e.z];
    advance(sim, SLIME_SPAWN_DURATION - .1);
    expect([e.x, e.z]).toEqual(position); expect(e.windup).toBe(0); expect(sim.hp).toBe(100); expect(sim.alive).toBe(1);
    advance(sim, .2); expect(e.spawnRemaining).toBe(0); expect(e.windup).toBeGreaterThan(0); expect(sim.hp).toBe(100);
    advance(sim, .5); expect(sim.hp).toBe(90);
  });
  it('freezes slime formation while paused and restarts it when a pool slot is reused', () => {
    const sim = new Simulation(() => .2); sim.reset(); sim.remaining = 1; sim.spawn(); sim.spawnCooldown = 100;
    advance(sim, .4); const remaining = sim.enemies[0].spawnRemaining;
    sim.phase = 'paused'; advance(sim, 2); expect(sim.enemies[0].spawnRemaining).toBe(remaining);
    sim.phase = 'playing'; advance(sim, .4); expect(sim.enemies[0].spawnRemaining).toBeLessThan(remaining);
    sim.kill(sim.enemies[0]); sim.remaining = 1; sim.spawn(); expect(sim.enemies[0].spawnRemaining).toBe(SLIME_SPAWN_DURATION);
    sim.reset(); expect(sim.enemies[0].spawnRemaining).toBe(0); expect(sim.alive).toBe(0);
  });
  it('matches projectile hits to the growing slime instead of an invisible full-size body', () => {
    const sim = new Simulation(); sim.reset(); sim.remaining = 1; sim.spawnCooldown = 100;
    const e = sim.enemies[0];
    Object.assign(e, { active: true, x: 0, z: 3, hp: 3, kind: 0, spawnRemaining: SLIME_SPAWN_DURATION * .7 });
    const shot = sim.projectiles[0];
    Object.assign(shot, { active: true, x: 0, y: 1, z: 5, vx: 0, vy: 0, vz: -30, life: 2 });
    advance(sim, .1); expect(e.hp).toBe(3);
    Object.assign(shot, { active: true, x: 0, y: .07, z: 5, vx: 0, vy: 0, vz: -30, life: 2 });
    advance(sim, .1); expect(e.hp).toBe(2);
  });
  it.each([0, 1])('enemy kind %i pursues the player without dealing ranged damage', kind => {
    const sim = new Simulation(); sim.reset(); sim.remaining = 1; sim.spawnCooldown = 100;
    Object.assign(sim.enemies[0], { active: true, x: 0, z: -10, hp: 6, kind });
    advance(sim, 2); expect(sim.enemies[0].z).toBeGreaterThan(-10); expect(sim.hp).toBe(100); expect(sim.projectiles.some(p => p.active)).toBe(false);
  });
  it.each([0, 1])('enemy kind %i deals melee damage only after a wind-up', kind => {
    const sim = new Simulation(); sim.reset(); sim.remaining = 1; sim.spawnCooldown = 100;
    Object.assign(sim.enemies[0], { active: true, x: 0, z: 8, hp: 6, kind });
    advance(sim, 0.2); expect(sim.hp).toBe(100);
    advance(sim, 0.5); expect(sim.hp).toBe(kind ? 82 : 90);
    advance(sim, 0.2); expect(sim.hp).toBe(kind ? 82 : 90);
  });
  it('lets the player dodge a committed melee attack', () => {
    const sim = new Simulation(); sim.reset(); sim.remaining = 1; sim.spawnCooldown = 100;
    Object.assign(sim.enemies[0], { active: true, x: 0, z: 8, hp: 6, kind: 1 });
    advance(sim, 0.2); sim.x = 5; advance(sim, 0.5); expect(sim.hp).toBe(100);
  });
  it('damages and kills enemies with travelling spell projectiles', () => {
    const sim = new Simulation(); sim.reset(); sim.remaining = 1; sim.spawnCooldown = 100;
    Object.assign(sim.enemies[0], { active: true, x: 0, z: 3, hp: 3, kind: 0, cooldown: 100 });
    advance(sim, 0.8, { ...blankInput(), fire: true, pitch: -0.12 });
    expect(sim.kills).toBe(1); expect(sim.score).toBe(100);
  });
  it('blocks spells with boulders', () => {
    const sim = new Simulation(); sim.reset(); const p = OBSTACLES[0]; sim.x = p.x; sim.z = p.z + 4;
    Object.assign(sim.enemies[0], { active: true, x: p.x, z: p.z - 4, hp: 6, kind: 1 });
    sim.remaining = 1; sim.spawnCooldown = 100; sim.cast(blankInput()); advance(sim, .3); expect(sim.enemies[0].hp).toBe(6); expect(sim.projectiles.some(p => p.active)).toBe(false);
  });
  it('hits only the nearest enemy along the crosshair', () => {
    const sim = new Simulation(); sim.reset();
    Object.assign(sim.enemies[0], { active: true, x: 0, z: 3, hp: 6, kind: 1 });
    Object.assign(sim.enemies[1], { active: true, x: 0, z: 0, hp: 6, kind: 1 });
    sim.remaining = 1; sim.spawnCooldown = 100; sim.cast(blankInput()); expect(sim.enemies[0].hp).toBe(6); advance(sim, .2); expect(sim.enemies[0].hp).toBe(5); expect(sim.enemies[1].hp).toBe(6);
  });
  it('applies damage immunity and allows restarting after death', () => {
    const sim = new Simulation(); sim.reset(); sim.damage(20); sim.damage(20); expect(sim.hp).toBe(80);
    advance(sim, 0.6); sim.damage(100); expect(sim.phase).toBe('dead');
    sim.reset(); expect(sim.hp).toBe(100); expect(sim.phase).toBe('playing'); expect(sim.time).toBe(0);
  });
  it('bounds projectile allocation, expires misses, and clears shots on reset', () => {
    const sim = new Simulation(); sim.reset();
    for (let i = 0; i < MAX_PROJECTILES + 10; i++) sim.cast({ ...blankInput(), pitch: 0.8 });
    expect(sim.projectiles.filter(p => p.active)).toHaveLength(MAX_PROJECTILES);
    advance(sim, 2.1); expect(sim.projectiles.some(p => p.active)).toBe(false);
    sim.cast(blankInput()); expect(sim.projectiles.some(p => p.active)).toBe(true);
    sim.reset(); expect(sim.projectiles.some(p => p.active)).toBe(false);
  });
  it('stops downward projectiles at the ground', () => {
    const sim = new Simulation(); sim.reset(); sim.cast({ ...blankInput(), pitch: -0.8 });
    advance(sim, 0.2); expect(sim.projectiles.some(p => p.active)).toBe(false);
  });
  it('does not let a muzzle inside a boulder shoot through it', () => {
    const sim = new Simulation(); sim.reset();
    const boulder = OBSTACLES[0];
    Object.assign(sim.projectiles[0], { active: true, x: boulder.x, y: 1, z: boulder.z, vx: 0, vy: 0, vz: -30, life: 2 });
    advance(sim, 1 / 60); expect(sim.projectiles[0].active).toBe(false);
  });
  it('finishes after five cleared waves', () => {
    const sim = new Simulation(); sim.reset();
    for (let wave = 1; wave <= 5; wave++) { sim.waveWait = 0; sim.step(1 / 60, blankInput()); expect(sim.wave).toBe(wave); expect(sim.remaining).toBe(7 + wave * 5); sim.remaining = 0; }
    sim.waveWait = 0; sim.step(1 / 60, blankInput()); expect(sim.phase).toBe('won');
  });
});
