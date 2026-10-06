import {
  COMBAT,
  HIT_FEEDBACK,
  ORC,
  PLAYER,
  SLIME,
  SLIME_BIRTH,
  STAFF,
  WAVES,
} from '../config/gameplay';
import { MAX_ENEMIES, MAX_PROJECTILES } from '../config/runtime';
import { ARENA_HALF_WIDTH, ARENA_HALF_DEPTH, WALL_HEIGHT } from '../config/world';
import { WORLD_OBSTACLES } from './world';
export type Projectile = {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
};
// A puddle spreads first, then rises into the full creature. Shared by rendering and hit detection.
export function slimeSpawnScale(remaining: number, vertical = false) {
  const progress = Math.max(0, Math.min(1, 1 - remaining / SLIME.spawnDurationSeconds));
  const spread = Math.min(1, progress / SLIME_BIRTH.spreadEndProgress);
  const rise = Math.max(
    0,
    (progress - SLIME_BIRTH.spreadEndProgress) / (1 - SLIME_BIRTH.spreadEndProgress),
  );
  const growth = rise * rise * (3 - 2 * rise);
  return Math.max(
    SLIME_BIRTH.minimumScale,
    spread *
      spread *
      (3 - 2 * spread) *
      (vertical
        ? SLIME_BIRTH.initialHeightScale + (1 - SLIME_BIRTH.initialHeightScale) * growth
        : SLIME_BIRTH.initialWidthScale - (SLIME_BIRTH.initialWidthScale - 1) * growth),
  );
}
const TRACE_DIRECTION_EPSILON = 0.0001;
export type Phase = 'ready' | 'playing' | 'paused' | 'dead' | 'won';
export type Input = { forward: number; strafe: number; fire: boolean; yaw: number; pitch: number };
export type Enemy = {
  active: boolean;
  x: number;
  z: number;
  hp: number;
  kind: number;
  cooldown: number;
  windup: number;
  phase: number;
  flash: number;
  spawnRemaining: number;
};
export type Snapshot = {
  phase: Phase;
  hp: number;
  wave: number;
  kills: number;
  score: number;
  time: number;
  alive: number;
  remaining: number;
  hit: number;
  hurt: number;
  waveWait: number;
};
export const blankInput = (): Input => ({ forward: 0, strafe: 0, fire: false, yaw: 0, pitch: 0 });
export class Simulation {
  phase: Phase = 'ready';
  x: number = PLAYER.spawn.x;
  z: number = PLAYER.spawn.z;
  hp: number = PLAYER.maxHealth;
  wave = 0;
  kills = 0;
  score = 0;
  time = 0;
  invulnerable = 0;
  shootCooldown = 0;
  hit = 0;
  hurt = 0;
  remaining = 0;
  spawnCooldown = 0;
  waveWait: number = WAVES.initialReadyWaitSeconds;
  enemies: Enemy[] = Array.from({ length: MAX_ENEMIES }, () => ({
    active: false,
    x: 0,
    z: 0,
    hp: 0,
    kind: 0,
    cooldown: 0,
    windup: 0,
    phase: 0,
    flash: 0,
    spawnRemaining: 0,
  }));
  projectiles: Projectile[] = Array.from({ length: MAX_PROJECTILES }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
  }));
  private traceTarget: Enemy | undefined;
  private traceDistance = 0;
  private traceBlocked = false;
  constructor(private random: () => number = Math.random) {}
  get alive() {
    let n = 0;
    for (const e of this.enemies) if (e.active) n++;
    return n;
  }
  reset() {
    this.x = PLAYER.spawn.x;
    this.z = PLAYER.spawn.z;
    this.hp = PLAYER.maxHealth;
    this.wave = 0;
    this.kills = 0;
    this.score = 0;
    this.time = 0;
    this.invulnerable = this.shootCooldown = this.hit = this.hurt = 0;
    this.remaining = 0;
    this.spawnCooldown = 0;
    this.waveWait = WAVES.firstWaveWaitSeconds;
    for (const e of this.enemies) {
      e.active = false;
      e.spawnRemaining = 0;
    }
    for (const p of this.projectiles) p.active = false;
    this.phase = 'playing';
  }
  snapshot(): Snapshot {
    return {
      phase: this.phase,
      hp: this.hp,
      wave: this.wave,
      kills: this.kills,
      score: this.score,
      time: this.time,
      alive: this.alive,
      remaining: this.remaining,
      hit: this.hit,
      hurt: this.hurt,
      waveWait: this.waveWait,
    };
  }
  cast(input: Input) {
    const cp = Math.cos(input.pitch),
      sp = Math.sin(input.pitch),
      sy = Math.sin(input.yaw),
      cy = Math.cos(input.yaw);
    const rx = -sy * cp,
      ry = sp,
      rz = -cy * cp;
    this.trace(this.x, PLAYER.eyeHeightUnits, this.z, rx, ry, rz, STAFF.aimRangeUnits);
    const aim = Math.max(STAFF.minimumAimDistanceUnits, this.traceDistance);
    const p = this.projectiles.find((p) => !p.active);
    if (!p) return;
    const muzzle = STAFF.muzzleOffsetUnits;
    p.x = this.x + cy * muzzle.right - sy * sp * muzzle.down + rx * muzzle.forward;
    p.y = PLAYER.eyeHeightUnits - cp * muzzle.down + ry * muzzle.forward;
    p.z = this.z - sy * muzzle.right - cy * sp * muzzle.down + rz * muzzle.forward;
    p.x = Math.max(
      -ARENA_HALF_WIDTH + STAFF.projectileWallInsetUnits,
      Math.min(ARENA_HALF_WIDTH - STAFF.projectileWallInsetUnits, p.x),
    );
    p.z = Math.max(
      -ARENA_HALF_DEPTH + STAFF.projectileWallInsetUnits,
      Math.min(ARENA_HALF_DEPTH - STAFF.projectileWallInsetUnits, p.z),
    );
    const dx = this.x + rx * aim - p.x,
      dy = PLAYER.eyeHeightUnits + ry * aim - p.y,
      dz = this.z + rz * aim - p.z;
    const distance = Math.hypot(dx, dy, dz) || 1;
    p.vx = (dx / distance) * STAFF.projectileSpeedUnitsPerSecond;
    p.vy = (dy / distance) * STAFF.projectileSpeedUnitsPerSecond;
    p.vz = (dz / distance) * STAFF.projectileSpeedUnitsPerSecond;
    p.active = true;
    p.life = STAFF.projectileLifetimeSeconds;
  }
  private trace(
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
    range: number,
  ) {
    let closest = range;
    let blocked = false;
    let target: Enemy | undefined;
    // Trunks and boulders occlude spells. Intersect both the side and caps of each cylinder.
    const a = rx * rx + rz * rz;
    for (const p of WORLD_OBSTACLES) {
      const ox = x - p.x,
        oz = z - p.z;
      const c = ox * ox + oz * oz - p.radius * p.radius;
      if (c <= 0 && y >= 0 && y <= p.height) {
        closest = 0;
        blocked = true;
        continue;
      }
      if (a > TRACE_DIRECTION_EPSILON) {
        const b = ox * rx + oz * rz;
        const discriminant = b * b - a * c;
        if (discriminant >= 0) {
          const t = (-b - Math.sqrt(discriminant)) / a;
          if (t >= 0 && t <= closest && y + ry * t >= 0 && y + ry * t <= p.height) {
            closest = t;
            blocked = true;
          }
        }
      }
      if (Math.abs(ry) > TRACE_DIRECTION_EPSILON) {
        for (const cap of [0, p.height]) {
          const t = (cap - y) / ry;
          if (t >= 0 && t <= closest && (ox + rx * t) ** 2 + (oz + rz * t) ** 2 <= p.radius ** 2) {
            closest = t;
            blocked = true;
          }
        }
      }
    }
    for (const e of this.enemies) {
      if (!e.active) continue;
      // Ellipsoid hit volumes match the broad orc and low slime silhouettes.
      const width = e.kind ? 1 : slimeSpawnScale(e.spawnRemaining),
        height = e.kind ? 1 : slimeSpawnScale(e.spawnRemaining, true);
      const hitbox = (e.kind ? ORC : SLIME).hitboxRadiiUnits;
      const sx = hitbox.x * width,
        sy = hitbox.y * height,
        sz = hitbox.z * width;
      const ox = (x - e.x) / sx,
        oy = (y - sy) / sy,
        oz = (z - e.z) / sz;
      const dx = rx / sx,
        dy = ry / sy,
        dz = rz / sz;
      const qa = dx * dx + dy * dy + dz * dz,
        qb = ox * dx + oy * dy + oz * dz,
        qc = ox * ox + oy * oy + oz * oz - 1;
      const disc = qb * qb - qa * qc;
      if (disc < 0) continue;
      const t = Math.max(0, (-qb - Math.sqrt(disc)) / qa);
      if (t < closest && (-qb + Math.sqrt(disc)) / qa >= 0) {
        closest = t;
        target = e;
        blocked = true;
      }
    }
    if (ry < 0) {
      const ground = -y / ry;
      if (ground >= 0 && ground < closest) {
        closest = ground;
        blocked = true;
        target = undefined;
      }
    }
    for (const axis of [0, 1]) {
      const velocity = axis === 0 ? rx : rz,
        origin = axis === 0 ? x : z,
        limit = axis === 0 ? ARENA_HALF_WIDTH : ARENA_HALF_DEPTH;
      if (Math.abs(velocity) < TRACE_DIRECTION_EPSILON) continue;
      const t = ((velocity > 0 ? limit : -limit) - origin) / velocity;
      if (t >= 0 && t < closest && y + ry * t < WALL_HEIGHT) {
        closest = t;
        blocked = true;
        target = undefined;
      }
    }
    this.traceTarget = target;
    this.traceDistance = closest;
    this.traceBlocked = blocked;
  }
  private advanceProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      const travel = STAFF.projectileSpeedUnitsPerSecond * dt;
      this.trace(
        p.x,
        p.y,
        p.z,
        p.vx / STAFF.projectileSpeedUnitsPerSecond,
        p.vy / STAFF.projectileSpeedUnitsPerSecond,
        p.vz / STAFF.projectileSpeedUnitsPerSecond,
        travel,
      );
      p.x += (p.vx / STAFF.projectileSpeedUnitsPerSecond) * this.traceDistance;
      p.y += (p.vy / STAFF.projectileSpeedUnitsPerSecond) * this.traceDistance;
      p.z += (p.vz / STAFF.projectileSpeedUnitsPerSecond) * this.traceDistance;
      p.life -= dt;
      if (this.traceBlocked) {
        p.active = false;
        if (this.traceTarget) {
          const e = this.traceTarget;
          e.hp -= STAFF.damage;
          e.flash = HIT_FEEDBACK.enemyFlashSeconds;
          this.hit = HIT_FEEDBACK.hitIndicatorSeconds;
          if (e.hp <= 0) this.kill(e);
        }
      } else if (p.life <= 0 || Math.hypot(p.x, p.z) > STAFF.projectileCleanupDistanceUnits)
        p.active = false;
    }
  }
  spawn() {
    const e = this.enemies.find((e) => !e.active);
    if (!e) return;
    const side = Math.min(3, Math.floor(this.random() * 4));
    const along = this.random() * 2 - 1;
    let x =
      side < 2
        ? (side === 0 ? -1 : 1) * (ARENA_HALF_WIDTH - WAVES.spawnEdgeInsetUnits)
        : along * (ARENA_HALF_WIDTH - WAVES.spawnAlongInsetUnits);
    let z =
      side >= 2
        ? (side === 2 ? -1 : 1) * (ARENA_HALF_DEPTH - WAVES.spawnEdgeInsetUnits)
        : along * (ARENA_HALF_DEPTH - WAVES.spawnAlongInsetUnits);
    const kind =
      this.wave === 1
        ? this.remaining <= WAVES.firstWave.orcs
          ? 1
          : 0
        : this.wave > 1 && this.random() > 1 - WAVES.laterWaveOrcProbability
          ? 1
          : 0;
    const stats = kind ? ORC : SLIME;
    const radius = stats.collisionRadiusUnits;
    const initialAlong = side < 2 ? z : x;
    // Keep birth puddles and orcs out of trunks, including trees beside the spawn edges.
    for (
      let attempt = 0;
      WORLD_OBSTACLES.some(
        (p) => Math.hypot(x - p.x, z - p.z) < p.radius + radius + WAVES.spawnObstacleClearanceUnits,
      );
      attempt++
    ) {
      if (attempt >= WAVES.spawnRelocationAttempts) return;
      const offset =
        Math.ceil((attempt + 1) / 2) * WAVES.spawnRelocationStepUnits * (attempt % 2 ? -1 : 1);
      if (side < 2)
        z = Math.max(
          -ARENA_HALF_DEPTH + WAVES.spawnAlongInsetUnits,
          Math.min(ARENA_HALF_DEPTH - WAVES.spawnAlongInsetUnits, initialAlong + offset),
        );
      else
        x = Math.max(
          -ARENA_HALF_WIDTH + WAVES.spawnAlongInsetUnits,
          Math.min(ARENA_HALF_WIDTH - WAVES.spawnAlongInsetUnits, initialAlong + offset),
        );
    }
    Object.assign(e, {
      active: true,
      x,
      z,
      hp: stats.health,
      kind,
      cooldown: 0,
      windup: 0,
      phase: this.random() * Math.PI * 2,
      flash: 0,
      spawnRemaining: stats.spawnDurationSeconds,
    });
    this.remaining--;
  }
  kill(e: Enemy) {
    e.active = false;
    this.kills++;
    this.score += (e.kind ? ORC : SLIME).killScore;
    this.hp = Math.min(PLAYER.maxHealth, this.hp + PLAYER.healingPerKill);
  }
  damage(amount: number) {
    if (this.invulnerable > 0 || this.phase !== 'playing') return;
    this.hp = Math.max(0, this.hp - amount);
    this.hurt = HIT_FEEDBACK.hurtIndicatorSeconds;
    this.invulnerable = PLAYER.invulnerabilitySeconds;
    if (this.hp === 0) this.phase = 'dead';
  }
  step(dt: number, input: Input) {
    if (this.phase !== 'playing') return;
    this.time += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shootCooldown -= dt;
    this.hit = Math.max(0, this.hit - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    const f = input.forward;
    const len = Math.hypot(f, input.strafe) || 1;
    const speed = PLAYER.movementSpeedUnitsPerSecond;
    this.x += ((-Math.sin(input.yaw) * f + Math.cos(input.yaw) * input.strafe) / len) * speed * dt;
    this.z += ((-Math.cos(input.yaw) * f - Math.sin(input.yaw) * input.strafe) / len) * speed * dt;
    this.x = Math.max(
      -ARENA_HALF_WIDTH + PLAYER.wallMarginUnits,
      Math.min(ARENA_HALF_WIDTH - PLAYER.wallMarginUnits, this.x),
    );
    this.z = Math.max(
      -ARENA_HALF_DEPTH + PLAYER.wallMarginUnits,
      Math.min(ARENA_HALF_DEPTH - PLAYER.wallMarginUnits, this.z),
    );
    for (const p of WORLD_OBSTACLES) {
      const dx = this.x - p.x,
        dz = this.z - p.z,
        d = Math.hypot(dx, dz),
        r = p.radius + PLAYER.collisionRadiusUnits;
      if (d < r) {
        this.x = p.x + (d ? dx / d : 1) * r;
        this.z = p.z + (d ? dz / d : 0) * r;
      }
    }
    // Keep the first-person camera outside the orc's torso during melee.
    for (const enemy of this.enemies) {
      if (!enemy.active || !enemy.kind || enemy.spawnRemaining > 0) continue;
      const dx = this.x - enemy.x,
        dz = this.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      if (distance < ORC.playerSeparationUnits) {
        this.x = enemy.x + (distance ? dx / distance : 0) * ORC.playerSeparationUnits;
        this.z = enemy.z + (distance ? dz / distance : 1) * ORC.playerSeparationUnits;
      }
    }
    if (input.fire && this.shootCooldown <= 0) {
      this.shootCooldown = STAFF.fireIntervalSeconds;
      this.cast(input);
    }
    this.advanceProjectiles(dt);
    if (this.remaining === 0 && this.alive === 0) {
      this.waveWait -= dt;
      if (this.waveWait <= 0) {
        if (this.wave === WAVES.total) {
          this.phase = 'won';
          return;
        }
        this.wave++;
        this.remaining =
          this.wave === 1
            ? WAVES.firstWave.slimes + WAVES.firstWave.orcs
            : WAVES.laterWaveEnemyCount.base + this.wave * WAVES.laterWaveEnemyCount.perWave;
        this.hp = Math.min(PLAYER.maxHealth, this.hp + PLAYER.healingPerWave);
        this.waveWait = WAVES.clearWaitSeconds;
      }
    } else {
      this.spawnCooldown -= dt;
      if (this.remaining > 0 && this.spawnCooldown <= 0) {
        this.spawn();
        this.spawnCooldown = Math.max(
          WAVES.spawnIntervalSeconds.minimum,
          WAVES.spawnIntervalSeconds.base - this.wave * WAVES.spawnIntervalSeconds.reductionPerWave,
        );
      }
    }
    for (const e of this.enemies) {
      if (!e.active) continue;
      e.flash = Math.max(0, e.flash - dt);
      if (e.spawnRemaining > 0) {
        e.spawnRemaining = Math.max(0, e.spawnRemaining - dt);
        continue;
      }
      const dx = this.x - e.x,
        dz = this.z - e.z,
        d = Math.hypot(dx, dz) || 1;
      e.cooldown = Math.max(0, e.cooldown - dt);
      const stats = e.kind ? ORC : SLIME;
      const reach = stats.attackReachUnits;
      if (e.windup > 0) {
        e.windup = Math.max(0, e.windup - dt);
        if (e.windup === 0) {
          if (d < reach + COMBAT.meleeImpactToleranceUnits) this.damage(stats.damage);
          e.cooldown = stats.attackCooldownSeconds;
        }
      } else if (d < reach && e.cooldown === 0) {
        e.windup = stats.attackWindupSeconds;
      }
      let vx = dx / d,
        vz = dz / d;
      // Steer around trunks and boulders.
      for (const p of WORLD_OBSTACLES) {
        const px = p.x - e.x,
          pz = p.z - e.z,
          pd = Math.hypot(px, pz);
        if (pd < COMBAT.obstacleSteeringDistanceUnits && px * vx + pz * vz > 0) {
          const side = vx * pz - vz * px >= 0 ? -1 : 1;
          vx += (-pz / (pd || 1)) * side * COMBAT.obstacleSteeringStrength;
          vz += (px / (pd || 1)) * side * COMBAT.obstacleSteeringStrength;
        }
      }
      const moveLength = Math.hypot(vx, vz) || 1;
      const movementSpeed =
        stats.baseSpeedUnitsPerSecond + this.wave * stats.speedPerWaveUnitsPerSecond;
      const recoveringPunch =
        e.kind && e.cooldown > stats.attackCooldownSeconds - stats.punchRecoverySeconds;
      const standOff = stats.stoppingDistanceUnits;
      const speed = e.windup > 0 || recoveringPunch || d < standOff ? 0 : movementSpeed;
      e.x += (vx / moveLength) * speed * dt;
      e.z += (vz / moveLength) * speed * dt;
    }
    // Bounded pair separation keeps melee crowds from occupying the same point.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (!a.active || a.spawnRemaining > 0) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (!b.active || b.spawnRemaining > 0) continue;
        const dx = b.x - a.x,
          dz = b.z - a.z,
          d = Math.hypot(dx, dz);
        if (d < COMBAT.crowdSeparationDistanceUnits) {
          const push = Math.min(
              (COMBAT.crowdSeparationDistanceUnits - d) * COMBAT.crowdSeparationShare,
              dt * COMBAT.crowdSeparationSpeedUnitsPerSecond,
            ),
            nx = d ? dx / d : 1,
            nz = d ? dz / d : 0;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
        }
      }
    }
    for (const e of this.enemies)
      if (e.active) {
        for (const p of WORLD_OBSTACLES) {
          const dx = e.x - p.x,
            dz = e.z - p.z,
            d = Math.hypot(dx, dz);
          const radius = p.radius + (e.kind ? ORC : SLIME).collisionRadiusUnits;
          if (d < radius) {
            const inward = Math.hypot(p.x, p.z) || 1;
            e.x = p.x + (d ? dx / d : -p.x / inward) * radius;
            e.z = p.z + (d ? dz / d : -p.z / inward) * radius;
            // Slide to the circle/wall intersection instead of clamping back into the trunk.
            const limitX = ARENA_HALF_WIDTH - COMBAT.enemyWallMarginUnits;
            const limitZ = ARENA_HALF_DEPTH - COMBAT.enemyWallMarginUnits;
            if (Math.abs(e.x) > limitX) {
              e.x = Math.sign(e.x) * limitX;
              e.z =
                p.z +
                Math.sign(dz || -p.z || 1) *
                  Math.sqrt(Math.max(0, radius * radius - (e.x - p.x) ** 2));
            }
            if (Math.abs(e.z) > limitZ) {
              e.z = Math.sign(e.z) * limitZ;
              e.x =
                p.x +
                Math.sign(dx || -p.x || 1) *
                  Math.sqrt(Math.max(0, radius * radius - (e.z - p.z) ** 2));
            }
          }
        }
        e.x = Math.max(
          -ARENA_HALF_WIDTH + COMBAT.enemyWallMarginUnits,
          Math.min(ARENA_HALF_WIDTH - COMBAT.enemyWallMarginUnits, e.x),
        );
        e.z = Math.max(
          -ARENA_HALF_DEPTH + COMBAT.enemyWallMarginUnits,
          Math.min(ARENA_HALF_DEPTH - COMBAT.enemyWallMarginUnits, e.z),
        );
      }
  }
}
