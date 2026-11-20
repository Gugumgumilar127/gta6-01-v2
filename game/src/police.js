// police.js — one job: the law. The wanted system (heat in, stars out,
// heat bleeding away while you hide) and the Interceptor drivers who hunt
// the player across Palmaris. The bust itself is judged in game.js, which
// can see the whole scene.

import { WANTED } from './config.js';
import { createCar, driveCar, wrapAngle } from './vehicles.js';

export function createWanted() {
  return {
    heat: 0,
    unseenTimer: 0,
    get stars() {
      let s = 0;
      for (let i = 0; i < WANTED.thresholds.length; i++) {
        if (this.heat >= WANTED.thresholds[i]) s = i;
      }
      return s;
    },
    addCrime(points) {
      this.heat = Math.min(WANTED.thresholds[5] + 220, this.heat + points);
    },
    // seen: any police unit currently has eyes on the player.
    update(dt, seen) {
      if (seen) {
        this.unseenTimer = 0;
        return;
      }
      this.unseenTimer += dt;
      if (this.unseenTimer > 1.6) {
        const fast = this.unseenTimer > WANTED.hideSecondsToDrop ? 3 : 1;
        this.heat = Math.max(0, this.heat - WANTED.decayPerSecond * fast * dt);
      }
    },
    clear() {
      this.heat = 0;
      this.unseenTimer = 0;
    },
  };
}

// Spawn a police Interceptor on a road a few blocks from the player.
export function spawnPoliceCar(city, rng, player) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(vertical ? city.roadsX : city.roadsY);
    const along = rng.range(100, (vertical ? city.h : city.w) - 100);
    const x = vertical ? line : along;
    const y = vertical ? along : line;
    const d = Math.hypot(x - player.x, y - player.y);
    if (d < 430 || d > 900) continue;
    if (city.isWater(x, y) || city.collides(x, y, 22)) continue;
    const angle = Math.atan2(player.y - y, player.x - x);
    const car = createCar('police', x, y, angle, '#e8e6df', 'police');
    car.stuckTimer = 0;
    return car;
  }
  return null;
}

// Pursuit driving: steer at the player, lead a moving target, and do not
// give up. Returns nothing; the car is moved by driveCar.
export function updatePoliceCar(cop, world, dt) {
  const player = world.player;
  const target = player.car || player;
  const lead = player.car ? clampNum(Math.hypot(player.car.speed, 0) * 0.35, 0, 90) : 0;
  const tx = target.x + Math.cos(target.angle || 0) * lead * (player.car ? 1 : 0);
  const ty = target.y + Math.sin(target.angle || 0) * lead * (player.car ? 1 : 0);

  const dx = tx - cop.x;
  const dy = ty - cop.y;
  const dist = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);
  const diff = wrapAngle(desired - cop.angle);
  const steer = clampNum(diff * 2.2, -1, 1);

  let throttle = 1;
  if (Math.abs(diff) > 2.2) throttle = -0.7; // turned around: back up and swing
  else if (dist < 60 && !player.car) throttle = 0.25; // creep up on a runner
  else if (dist < 120) throttle = 0.72;

  const impact = driveCar(cop, { throttle, steer, handbrake: Math.abs(diff) > 1.1 && cop.speed > 120 }, dt, world.city);
  if (impact > 0.3) cop.stuckTimer = 0;

  // A wedged unit radios for a fresh car: quietly reposition far away.
  if (Math.abs(cop.speed) < 14 && dist > 200) {
    cop.stuckTimer += dt;
    if (cop.stuckTimer > 3.2) {
      const fresh = spawnPoliceCar(world.city, world.rng, player);
      if (fresh) {
        cop.x = fresh.x;
        cop.y = fresh.y;
        cop.angle = fresh.angle;
        cop.speed = 0;
        cop.health = Math.max(cop.health, 70);
        cop.dead = false;
      }
      cop.stuckTimer = 0;
    }
  } else {
    cop.stuckTimer = 0;
  }
  return impact;
}

// Does this unit currently have eyes on the player?
export function policeSeesPlayer(cop, player) {
  const target = player.car || player;
  const d = Math.hypot(cop.x - target.x, cop.y - target.y);
  return d < 560;
}

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
