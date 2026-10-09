import { assign } from '../lib/assign';
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
import { at } from '../lib/assert';
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
  const progress = Math.max(0, Math.min(1, 1 - remaining / SLIME.SPAWN_DURATION_SECONDS));
  const spread = Math.min(1, progress / SLIME_BIRTH.SPREAD_END_PROGRESS);
  const rise = Math.max(
    0,
    (progress - SLIME_BIRTH.SPREAD_END_PROGRESS) / (1 - SLIME_BIRTH.SPREAD_END_PROGRESS),
  );
  const growth = rise * rise * (3 - 2 * rise);
  return Math.max(
    SLIME_BIRTH.MINIMUM_SCALE,
    spread *
      spread *
      (3 - 2 * spread) *
      (vertical
        ? SLIME_BIRTH.INITIAL_HEIGHT_SCALE + (1 - SLIME_BIRTH.INITIAL_HEIGHT_SCALE) * growth
        : SLIME_BIRTH.INITIAL_WIDTH_SCALE - (SLIME_BIRTH.INITIAL_WIDTH_SCALE - 1) * growth),
  );
}
const TRACE_DIRECTION_EPSILON = 0.0001;
export type Phase = 'ready' | 'playing' | 'paused' | 'dead' | 'won';
export type Input = { forward: number; strafe: number; fire: boolean; yaw: number; pitch: number };
export type EnemyId = 'slime' | 'orc';
export const ENEMY_STATS = { slime: SLIME, orc: ORC } satisfies Record<
  EnemyId,
  typeof SLIME | typeof ORC
>;
export type Enemy = {
  active: boolean;
  x: number;
  z: number;
  hp: number;
  id: EnemyId;
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
  x: number = PLAYER.SPAWN.X;
  z: number = PLAYER.SPAWN.Z;
  hp: number = PLAYER.MAX_HEALTH;
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
  waveWait: number = WAVES.INITIAL_READY_WAIT_SECONDS;
  enemies: Enemy[] = Array.from({ length: MAX_ENEMIES }, () => ({
    active: false,
    x: 0,
    z: 0,
    hp: 0,
    id: 'slime',
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
    this.x = PLAYER.SPAWN.X;
    this.z = PLAYER.SPAWN.Z;
    this.hp = PLAYER.MAX_HEALTH;
    this.wave = 0;
    this.kills = 0;
    this.score = 0;
    this.time = 0;
    this.invulnerable = this.shootCooldown = this.hit = this.hurt = 0;
    this.remaining = 0;
    this.spawnCooldown = 0;
    this.waveWait = WAVES.FIRST_WAVE_WAIT_SECONDS;
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
    this.trace(this.x, PLAYER.EYE_HEIGHT_UNITS, this.z, rx, ry, rz, STAFF.AIM_RANGE_UNITS);
    const aim = Math.max(STAFF.MINIMUM_AIM_DISTANCE_UNITS, this.traceDistance);
    const p = this.projectiles.find((p) => !p.active);
    if (!p) return;
    const muzzle = STAFF.MUZZLE_OFFSET_UNITS;
    p.x = this.x + cy * muzzle.RIGHT - sy * sp * muzzle.DOWN + rx * muzzle.FORWARD;
    p.y = PLAYER.EYE_HEIGHT_UNITS - cp * muzzle.DOWN + ry * muzzle.FORWARD;
    p.z = this.z - sy * muzzle.RIGHT - cy * sp * muzzle.DOWN + rz * muzzle.FORWARD;
    p.x = Math.max(
      -ARENA_HALF_WIDTH + STAFF.PROJECTILE_WALL_INSET_UNITS,
      Math.min(ARENA_HALF_WIDTH - STAFF.PROJECTILE_WALL_INSET_UNITS, p.x),
    );
    p.z = Math.max(
      -ARENA_HALF_DEPTH + STAFF.PROJECTILE_WALL_INSET_UNITS,
      Math.min(ARENA_HALF_DEPTH - STAFF.PROJECTILE_WALL_INSET_UNITS, p.z),
    );
    const dx = this.x + rx * aim - p.x,
      dy = PLAYER.EYE_HEIGHT_UNITS + ry * aim - p.y,
      dz = this.z + rz * aim - p.z;
    const distance = Math.hypot(dx, dy, dz) || 1;
    p.vx = (dx / distance) * STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND;
    p.vy = (dy / distance) * STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND;
    p.vz = (dz / distance) * STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND;
    p.active = true;
    p.life = STAFF.PROJECTILE_LIFETIME_SECONDS;
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
      const width = e.id === 'orc' ? 1 : slimeSpawnScale(e.spawnRemaining),
        height = e.id === 'orc' ? 1 : slimeSpawnScale(e.spawnRemaining, true);
      const hitbox = ENEMY_STATS[e.id].HITBOX_RADII_UNITS;
      const sx = hitbox.X * width,
        sy = hitbox.Y * height,
        sz = hitbox.Z * width;
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
      const travel = STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND * dt;
      this.trace(
        p.x,
        p.y,
        p.z,
        p.vx / STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND,
        p.vy / STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND,
        p.vz / STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND,
        travel,
      );
      p.x += (p.vx / STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND) * this.traceDistance;
      p.y += (p.vy / STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND) * this.traceDistance;
      p.z += (p.vz / STAFF.PROJECTILE_SPEED_UNITS_PER_SECOND) * this.traceDistance;
      p.life -= dt;
      if (this.traceBlocked) {
        p.active = false;
        if (this.traceTarget) {
          const e = this.traceTarget;
          e.hp -= STAFF.DAMAGE;
          e.flash = HIT_FEEDBACK.ENEMY_FLASH_SECONDS;
          this.hit = HIT_FEEDBACK.HIT_INDICATOR_SECONDS;
          if (e.hp <= 0) this.kill(e);
        }
      } else if (p.life <= 0 || Math.hypot(p.x, p.z) > STAFF.PROJECTILE_CLEANUP_DISTANCE_UNITS)
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
        ? (side === 0 ? -1 : 1) * (ARENA_HALF_WIDTH - WAVES.SPAWN_EDGE_INSET_UNITS)
        : along * (ARENA_HALF_WIDTH - WAVES.SPAWN_ALONG_INSET_UNITS);
    let z =
      side >= 2
        ? (side === 2 ? -1 : 1) * (ARENA_HALF_DEPTH - WAVES.SPAWN_EDGE_INSET_UNITS)
        : along * (ARENA_HALF_DEPTH - WAVES.SPAWN_ALONG_INSET_UNITS);
    const id: EnemyId =
      this.wave === 1
        ? this.remaining <= WAVES.FIRST_WAVE.ORCS
          ? 'orc'
          : 'slime'
        : this.wave > 1 && this.random() > 1 - WAVES.LATER_WAVE_ORC_PROBABILITY
          ? 'orc'
          : 'slime';
    const stats = ENEMY_STATS[id];
    const radius = stats.COLLISION_RADIUS_UNITS;
    const initialAlong = side < 2 ? z : x;
    // Keep birth puddles and orcs out of trunks, including trees beside the spawn edges.
    for (
      let attempt = 0;
      WORLD_OBSTACLES.some(
        (p) =>
          Math.hypot(x - p.x, z - p.z) < p.radius + radius + WAVES.SPAWN_OBSTACLE_CLEARANCE_UNITS,
      );
      attempt++
    ) {
      if (attempt >= WAVES.SPAWN_RELOCATION_ATTEMPTS) return;
      const offset =
        Math.ceil((attempt + 1) / 2) * WAVES.SPAWN_RELOCATION_STEP_UNITS * (attempt % 2 ? -1 : 1);
      if (side < 2)
        z = Math.max(
          -ARENA_HALF_DEPTH + WAVES.SPAWN_ALONG_INSET_UNITS,
          Math.min(ARENA_HALF_DEPTH - WAVES.SPAWN_ALONG_INSET_UNITS, initialAlong + offset),
        );
      else
        x = Math.max(
          -ARENA_HALF_WIDTH + WAVES.SPAWN_ALONG_INSET_UNITS,
          Math.min(ARENA_HALF_WIDTH - WAVES.SPAWN_ALONG_INSET_UNITS, initialAlong + offset),
        );
    }
    assign(e, {
      active: true,
      x,
      z,
      hp: stats.HEALTH,
      id,
      cooldown: 0,
      windup: 0,
      phase: this.random() * Math.PI * 2,
      flash: 0,
      spawnRemaining: stats.SPAWN_DURATION_SECONDS,
    } satisfies Enemy);
    this.remaining--;
  }
  kill(e: Enemy) {
    e.active = false;
    this.kills++;
    this.score += ENEMY_STATS[e.id].KILL_SCORE;
    this.hp = Math.min(PLAYER.MAX_HEALTH, this.hp + PLAYER.HEALING_PER_KILL);
  }
  damage(amount: number) {
    if (this.invulnerable > 0 || this.phase !== 'playing') return;
    this.hp = Math.max(0, this.hp - amount);
    this.hurt = HIT_FEEDBACK.HURT_INDICATOR_SECONDS;
    this.invulnerable = PLAYER.INVULNERABILITY_SECONDS;
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
    const speed = PLAYER.MOVEMENT_SPEED_UNITS_PER_SECOND;
    this.x += ((-Math.sin(input.yaw) * f + Math.cos(input.yaw) * input.strafe) / len) * speed * dt;
    this.z += ((-Math.cos(input.yaw) * f - Math.sin(input.yaw) * input.strafe) / len) * speed * dt;
    this.x = Math.max(
      -ARENA_HALF_WIDTH + PLAYER.WALL_MARGIN_UNITS,
      Math.min(ARENA_HALF_WIDTH - PLAYER.WALL_MARGIN_UNITS, this.x),
    );
    this.z = Math.max(
      -ARENA_HALF_DEPTH + PLAYER.WALL_MARGIN_UNITS,
      Math.min(ARENA_HALF_DEPTH - PLAYER.WALL_MARGIN_UNITS, this.z),
    );
    for (const p of WORLD_OBSTACLES) {
      const dx = this.x - p.x,
        dz = this.z - p.z,
        d = Math.hypot(dx, dz),
        r = p.radius + PLAYER.COLLISION_RADIUS_UNITS;
      if (d < r) {
        this.x = p.x + (d ? dx / d : 1) * r;
        this.z = p.z + (d ? dz / d : 0) * r;
      }
    }
    // Keep the first-person camera outside the orc's torso during melee.
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.id !== 'orc' || enemy.spawnRemaining > 0) continue;
      const dx = this.x - enemy.x,
        dz = this.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      if (distance < ORC.PLAYER_SEPARATION_UNITS) {
        this.x = enemy.x + (distance ? dx / distance : 0) * ORC.PLAYER_SEPARATION_UNITS;
        this.z = enemy.z + (distance ? dz / distance : 1) * ORC.PLAYER_SEPARATION_UNITS;
      }
    }
    if (input.fire && this.shootCooldown <= 0) {
      this.shootCooldown = STAFF.FIRE_INTERVAL_SECONDS;
      this.cast(input);
    }
    this.advanceProjectiles(dt);
    if (this.remaining === 0 && this.alive === 0) {
      this.waveWait -= dt;
      if (this.waveWait <= 0) {
        if (this.wave === WAVES.TOTAL) {
          this.phase = 'won';
          return;
        }
        this.wave++;
        this.remaining =
          this.wave === 1
            ? WAVES.FIRST_WAVE.SLIMES + WAVES.FIRST_WAVE.ORCS
            : WAVES.LATER_WAVE_ENEMY_COUNT.BASE + this.wave * WAVES.LATER_WAVE_ENEMY_COUNT.PER_WAVE;
        this.hp = Math.min(PLAYER.MAX_HEALTH, this.hp + PLAYER.HEALING_PER_WAVE);
        this.waveWait = WAVES.CLEAR_WAIT_SECONDS;
      }
    } else {
      this.spawnCooldown -= dt;
      if (this.remaining > 0 && this.spawnCooldown <= 0) {
        this.spawn();
        this.spawnCooldown = Math.max(
          WAVES.SPAWN_INTERVAL_SECONDS.MINIMUM,
          WAVES.SPAWN_INTERVAL_SECONDS.BASE -
            this.wave * WAVES.SPAWN_INTERVAL_SECONDS.REDUCTION_PER_WAVE,
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
      const stats = ENEMY_STATS[e.id];
      const reach = stats.ATTACK_REACH_UNITS;
      if (e.windup > 0) {
        e.windup = Math.max(0, e.windup - dt);
        if (e.windup === 0) {
          if (d < reach + COMBAT.MELEE_IMPACT_TOLERANCE_UNITS) this.damage(stats.DAMAGE);
          e.cooldown = stats.ATTACK_COOLDOWN_SECONDS;
        }
      } else if (d < reach && e.cooldown === 0) {
        e.windup = stats.ATTACK_WINDUP_SECONDS;
      }
      let vx = dx / d,
        vz = dz / d;
      // Steer around trunks and boulders.
      for (const p of WORLD_OBSTACLES) {
        const px = p.x - e.x,
          pz = p.z - e.z,
          pd = Math.hypot(px, pz);
        if (pd < COMBAT.OBSTACLE_STEERING_DISTANCE_UNITS && px * vx + pz * vz > 0) {
          const side = vx * pz - vz * px >= 0 ? -1 : 1;
          vx += (-pz / (pd || 1)) * side * COMBAT.OBSTACLE_STEERING_STRENGTH;
          vz += (px / (pd || 1)) * side * COMBAT.OBSTACLE_STEERING_STRENGTH;
        }
      }
      const moveLength = Math.hypot(vx, vz) || 1;
      const movementSpeed =
        stats.BASE_SPEED_UNITS_PER_SECOND + this.wave * stats.SPEED_PER_WAVE_UNITS_PER_SECOND;
      const recoveringPunch =
        e.id === 'orc' && e.cooldown > stats.ATTACK_COOLDOWN_SECONDS - stats.PUNCH_RECOVERY_SECONDS;
      const standOff = stats.STOPPING_DISTANCE_UNITS;
      const speed = e.windup > 0 || recoveringPunch || d < standOff ? 0 : movementSpeed;
      e.x += (vx / moveLength) * speed * dt;
      e.z += (vz / moveLength) * speed * dt;
    }
    // Bounded pair separation keeps melee crowds from occupying the same point.
    for (const [i, a] of this.enemies.entries()) {
      if (!a.active || a.spawnRemaining > 0) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = at(this.enemies, j);
        if (!b.active || b.spawnRemaining > 0) continue;
        const dx = b.x - a.x,
          dz = b.z - a.z,
          d = Math.hypot(dx, dz);
        if (d < COMBAT.CROWD_SEPARATION_DISTANCE_UNITS) {
          const push = Math.min(
              (COMBAT.CROWD_SEPARATION_DISTANCE_UNITS - d) * COMBAT.CROWD_SEPARATION_SHARE,
              dt * COMBAT.CROWD_SEPARATION_SPEED_UNITS_PER_SECOND,
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
          const radius = p.radius + ENEMY_STATS[e.id].COLLISION_RADIUS_UNITS;
          if (d < radius) {
            const inward = Math.hypot(p.x, p.z) || 1;
            e.x = p.x + (d ? dx / d : -p.x / inward) * radius;
            e.z = p.z + (d ? dz / d : -p.z / inward) * radius;
            // Slide to the circle/wall intersection instead of clamping back into the trunk.
            const limitX = ARENA_HALF_WIDTH - COMBAT.ENEMY_WALL_MARGIN_UNITS;
            const limitZ = ARENA_HALF_DEPTH - COMBAT.ENEMY_WALL_MARGIN_UNITS;
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
          -ARENA_HALF_WIDTH + COMBAT.ENEMY_WALL_MARGIN_UNITS,
          Math.min(ARENA_HALF_WIDTH - COMBAT.ENEMY_WALL_MARGIN_UNITS, e.x),
        );
        e.z = Math.max(
          -ARENA_HALF_DEPTH + COMBAT.ENEMY_WALL_MARGIN_UNITS,
          Math.min(ARENA_HALF_DEPTH - COMBAT.ENEMY_WALL_MARGIN_UNITS, e.z),
        );
      }
  }
}
