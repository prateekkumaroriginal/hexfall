export const ARENA_HALF_WIDTH = 16;
export const ARENA_HALF_DEPTH = 20;
export const WALL_HEIGHT = 10;
export const MAX_ENEMIES = 48;
export const MAX_PROJECTILES = 96;
export const PROJECTILE_SPEED = 30;
export type Projectile = { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number };
export const SLIME_HEALTH = 3;
export const SLIME_SPEED = 1.04625;
export const SLIME_SPAWN_DURATION = 1.4;
export const ORC_HEALTH = SLIME_HEALTH * 2;
// A puddle spreads first, then rises into the full creature. Shared by rendering and hit detection.
export function slimeSpawnScale(remaining: number, vertical = false) {
  const progress = Math.max(0, Math.min(1, 1 - remaining / SLIME_SPAWN_DURATION));
  const spread = Math.min(1, progress / .3);
  const rise = Math.max(0, (progress - .3) / .7);
  const growth = rise * rise * (3 - 2 * rise);
  return Math.max(.001, spread * spread * (3 - 2 * spread) * (vertical ? .06 + .94 * growth : 1.18 - .18 * growth));
}
export const OBSTACLES = [
  { x: -9, z: -11, radius: 1.05 }, { x: 10, z: -9, radius: 1.15 },
  { x: -11, z: 6, radius: 1.0 }, { x: 10, z: 12, radius: 1.1 },
  { x: -4, z: -15, radius: .85 }, { x: 5, z: 3, radius: .9 },
];
export type Phase = 'ready' | 'playing' | 'paused' | 'dead' | 'won';
export type Input = { forward: number; strafe: number; fire: boolean; yaw: number; pitch: number };
export type Enemy = { active: boolean; x: number; z: number; hp: number; kind: number; cooldown: number; windup: number; phase: number; flash: number; spawnRemaining: number };
export type Snapshot = { phase: Phase; hp: number; wave: number; kills: number; score: number; time: number; alive: number; remaining: number; hit: number; hurt: number; waveWait: number };
export const blankInput = (): Input => ({ forward: 0, strafe: 0, fire: false, yaw: 0, pitch: 0 });
export class Simulation {
  phase: Phase = 'ready';
  x = 0; z = 9; hp = 100; wave = 0; kills = 0; score = 0; time = 0;
  invulnerable = 0; shootCooldown = 0; hit = 0; hurt = 0;
  remaining = 0; spawnCooldown = 0; waveWait = 2;
  enemies: Enemy[] = Array.from({ length: MAX_ENEMIES }, () => ({ active: false, x: 0, z: 0, hp: 0, kind: 0, cooldown: 0, windup: 0, phase: 0, flash: 0, spawnRemaining: 0 }));
  projectiles: Projectile[] = Array.from({ length: MAX_PROJECTILES }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
  private traceTarget: Enemy | undefined;
  private traceDistance = 0;
  private traceBlocked = false;
  constructor(private random: () => number = Math.random) {}
  get alive() { let n = 0; for (const e of this.enemies) if (e.active) n++; return n; }
  reset() {
    this.x = 0; this.z = 9; this.hp = 100; this.wave = 0; this.kills = 0; this.score = 0; this.time = 0;
    this.invulnerable = this.shootCooldown = this.hit = this.hurt = 0;
    this.remaining = 0; this.spawnCooldown = 0; this.waveWait = 1.5;
    for (const e of this.enemies) { e.active = false; e.spawnRemaining = 0; }
    for (const p of this.projectiles) p.active = false;
    this.phase = 'playing';
  }
  snapshot(): Snapshot { return { phase: this.phase, hp: this.hp, wave: this.wave, kills: this.kills, score: this.score, time: this.time, alive: this.alive, remaining: this.remaining, hit: this.hit, hurt: this.hurt, waveWait: this.waveWait }; }
  cast(input: Input) {
    const cp = Math.cos(input.pitch), sp = Math.sin(input.pitch), sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
    const rx = -sy * cp, ry = sp, rz = -cy * cp;
    this.trace(this.x, 1.6, this.z, rx, ry, rz, 40);
    const aim = Math.max(1.5, this.traceDistance);
    const p = this.projectiles.find(p => !p.active); if (!p) return;
    p.x = this.x + cy * .65 + sy * sp * .04 + rx * 1.04;
    p.y = 1.6 + cp * .04 + ry * 1.04;
    p.z = this.z - sy * .65 + cy * sp * .04 + rz * 1.04;
    p.x = Math.max(-ARENA_HALF_WIDTH + .01, Math.min(ARENA_HALF_WIDTH - .01, p.x));
    p.z = Math.max(-ARENA_HALF_DEPTH + .01, Math.min(ARENA_HALF_DEPTH - .01, p.z));
    const dx = this.x + rx * aim - p.x, dy = 1.6 + ry * aim - p.y, dz = this.z + rz * aim - p.z;
    const distance = Math.hypot(dx, dy, dz) || 1;
    p.vx = dx / distance * PROJECTILE_SPEED; p.vy = dy / distance * PROJECTILE_SPEED; p.vz = dz / distance * PROJECTILE_SPEED;
    p.active = true; p.life = 2;
  }
  private trace(x: number, y: number, z: number, rx: number, ry: number, rz: number, range: number) {
    let closest = range;
    let blocked = false;
    let target: Enemy | undefined;
    // Boulders occlude the spell. Solve the horizontal ray/cylinder intersection.
    const a = rx * rx + rz * rz;
    if (a > 0.0001) for (const p of OBSTACLES) {
      const ox = x - p.x, oz = z - p.z;
      const b = ox * rx + oz * rz, c = ox * ox + oz * oz - p.radius * p.radius;
      if (c <= 0 && y >= 0 && y <= 2.1) { closest = 0; blocked = true; continue; }
      const discriminant = b * b - a * c;
      if (discriminant >= 0) {
        const t = (-b - Math.sqrt(discriminant)) / a;
        if (t >= 0 && t <= closest && y + ry * t >= 0 && y + ry * t <= 2.1) { closest = t; blocked = true; }
      }
    }
    for (const e of this.enemies) {
      if (!e.active) continue;
      // Ellipsoid hit volumes match the broad orc and low slime silhouettes.
      const width = e.kind ? 1 : slimeSpawnScale(e.spawnRemaining), height = e.kind ? 1 : slimeSpawnScale(e.spawnRemaining, true);
      const sx = e.kind ? 0.75 : 1.05 * width, sy = e.kind ? 1.35 : 0.8 * height, sz = e.kind ? 0.6 : 0.95 * width;
      const ox = (x - e.x) / sx, oy = (y - (e.kind ? 1.35 : 0.8 * height)) / sy, oz = (z - e.z) / sz;
      const dx = rx / sx, dy = ry / sy, dz = rz / sz;
      const qa = dx * dx + dy * dy + dz * dz, qb = ox * dx + oy * dy + oz * dz, qc = ox * ox + oy * oy + oz * oz - 1;
      const disc = qb * qb - qa * qc;
      if (disc < 0) continue;
      const t = Math.max(0, (-qb - Math.sqrt(disc)) / qa);
      if (t < closest && (-qb + Math.sqrt(disc)) / qa >= 0) { closest = t; target = e; blocked = true; }
    }
    if (ry < 0) { const ground = -y / ry; if (ground >= 0 && ground < closest) { closest = ground; blocked = true; target = undefined; } }
    for (const axis of [0, 1]) {
      const velocity = axis === 0 ? rx : rz, origin = axis === 0 ? x : z, limit = axis === 0 ? ARENA_HALF_WIDTH : ARENA_HALF_DEPTH;
      if (Math.abs(velocity) < .0001) continue;
      const t = ((velocity > 0 ? limit : -limit) - origin) / velocity;
      if (t >= 0 && t < closest && y + ry * t < WALL_HEIGHT) { closest = t; blocked = true; target = undefined; }
    }
    this.traceTarget = target; this.traceDistance = closest; this.traceBlocked = blocked;
  }
  private advanceProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      const travel = PROJECTILE_SPEED * dt;
      this.trace(p.x, p.y, p.z, p.vx / PROJECTILE_SPEED, p.vy / PROJECTILE_SPEED, p.vz / PROJECTILE_SPEED, travel);
      p.x += p.vx / PROJECTILE_SPEED * this.traceDistance; p.y += p.vy / PROJECTILE_SPEED * this.traceDistance; p.z += p.vz / PROJECTILE_SPEED * this.traceDistance;
      p.life -= dt;
      if (this.traceBlocked) {
        p.active = false;
        if (this.traceTarget) { const e = this.traceTarget; e.hp--; e.flash = .14; this.hit = .1; if (e.hp <= 0) this.kill(e); }
      } else if (p.life <= 0 || Math.hypot(p.x, p.z) > 55) p.active = false;
    }
  }
  spawn() {
    const e = this.enemies.find(e => !e.active);
    if (!e) return;
    const side = Math.min(3, Math.floor(this.random() * 4));
    const along = this.random() * 2 - 1;
    const x = side < 2 ? (side === 0 ? -1 : 1) * (ARENA_HALF_WIDTH - .8) : along * (ARENA_HALF_WIDTH - 1.5);
    const z = side >= 2 ? (side === 2 ? -1 : 1) * (ARENA_HALF_DEPTH - .8) : along * (ARENA_HALF_DEPTH - 1.5);
    const kind = this.wave > 1 && this.random() > 0.6 ? 1 : 0;
    Object.assign(e, { active: true, x, z, hp: kind ? ORC_HEALTH : SLIME_HEALTH, kind, cooldown: 0, windup: 0, phase: this.random() * Math.PI * 2, flash: 0, spawnRemaining: kind ? 0 : SLIME_SPAWN_DURATION });
    this.remaining--;
  }
  kill(e: Enemy) { e.active = false; this.kills++; this.score += e.kind ? 250 : 100; this.hp = Math.min(100, this.hp + 1); }
  damage(amount: number) {
    if (this.invulnerable > 0 || this.phase !== 'playing') return;
    this.hp = Math.max(0, this.hp - amount); this.hurt = 0.35; this.invulnerable = 0.5;
    if (this.hp === 0) this.phase = 'dead';
  }
  step(dt: number, input: Input) {
    if (this.phase !== 'playing') return;
    this.time += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shootCooldown -= dt; this.hit = Math.max(0, this.hit - dt); this.hurt = Math.max(0, this.hurt - dt);
    const f = input.forward;
    const len = Math.hypot(f, input.strafe) || 1;
    const speed = 7;
    this.x += (-Math.sin(input.yaw) * f + Math.cos(input.yaw) * input.strafe) / len * speed * dt;
    this.z += (-Math.cos(input.yaw) * f - Math.sin(input.yaw) * input.strafe) / len * speed * dt;
    this.x = Math.max(-ARENA_HALF_WIDTH + .45, Math.min(ARENA_HALF_WIDTH - .45, this.x));
    this.z = Math.max(-ARENA_HALF_DEPTH + .45, Math.min(ARENA_HALF_DEPTH - .45, this.z));
    for (const p of OBSTACLES) {
      const dx = this.x - p.x, dz = this.z - p.z, d = Math.hypot(dx, dz), r = p.radius + 0.4;
      if (d < r) { this.x = p.x + (d ? dx / d : 1) * r; this.z = p.z + (d ? dz / d : 0) * r; }
    }
    if (input.fire && this.shootCooldown <= 0) {
      this.shootCooldown = 0.13;
      this.cast(input);
    }
    this.advanceProjectiles(dt);
    if (this.remaining === 0 && this.alive === 0) {
      this.waveWait -= dt;
      if (this.waveWait <= 0) {
        if (this.wave === 5) { this.phase = 'won'; return; }
        this.wave++; this.remaining = 7 + this.wave * 5; this.hp = Math.min(100, this.hp + 15); this.waveWait = 3;
      }
    } else {
      this.spawnCooldown -= dt;
      if (this.remaining > 0 && this.spawnCooldown <= 0) { this.spawn(); this.spawnCooldown = Math.max(0.4, 1.1 - this.wave * 0.1); }
    }
    for (const e of this.enemies) {
      if (!e.active) continue;
      e.flash = Math.max(0, e.flash - dt);
      if (e.spawnRemaining > 0) { e.spawnRemaining = Math.max(0, e.spawnRemaining - dt); continue; }
      const dx = this.x - e.x, dz = this.z - e.z, d = Math.hypot(dx, dz) || 1;
      e.cooldown = Math.max(0, e.cooldown - dt);
      const reach = e.kind ? 1.65 : 1.25;
      if (e.windup > 0) {
        e.windup = Math.max(0, e.windup - dt);
        if (e.windup === 0) { if (d < reach + 0.2) this.damage(e.kind ? 18 : 10); e.cooldown = e.kind ? 1.25 : 0.9; }
      } else if (d < reach && e.cooldown === 0) {
        e.windup = e.kind ? 0.55 : 0.4;
      }
      let vx = dx / d, vz = dz / d;
      // Steer around boulders instead of walking directly into them.
      for (const p of OBSTACLES) {
        const px = p.x - e.x, pz = p.z - e.z, pd = Math.hypot(px, pz);
        if (pd < 3.2 && px * vx + pz * vz > 0) {
          const side = vx * pz - vz * px >= 0 ? -1 : 1;
          vx += -pz / (pd || 1) * side * 1.8; vz += px / (pd || 1) * side * 1.8;
        }
      }
      const moveLength = Math.hypot(vx, vz) || 1;
      const slimeSpeed = SLIME_SPEED + this.wave * 0.062;
      const speed = e.windup > 0 || d < reach * 0.65 ? 0 : slimeSpeed * (e.kind ? .8 : 1);
      e.x += vx / moveLength * speed * dt; e.z += vz / moveLength * speed * dt;
      for (const p of OBSTACLES) { const ex = e.x - p.x, ez = e.z - p.z, ed = Math.hypot(ex, ez); if (ed < 1.9) { e.x = p.x + (ed ? ex / ed : 1) * 1.9; e.z = p.z + (ed ? ez / ed : 0) * 1.9; } }
    }
    // Bounded pair separation keeps melee crowds from occupying the same point.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i]; if (!a.active || a.spawnRemaining > 0) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j]; if (!b.active || b.spawnRemaining > 0) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d < 1.3) { const push = Math.min((1.3 - d) * 0.5, dt * 1.5), nx = d ? dx / d : 1, nz = d ? dz / d : 0; a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push; }
      }
    }
    for (const e of this.enemies) if (e.active) {
      e.x = Math.max(-ARENA_HALF_WIDTH + .6, Math.min(ARENA_HALF_WIDTH - .6, e.x));
      e.z = Math.max(-ARENA_HALF_DEPTH + .6, Math.min(ARENA_HALF_DEPTH - .6, e.z));
    }
  }
}
