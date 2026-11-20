// combat.js — one job: violence at arm's length. Bullets, fists and the
// little particle bursts that sell an impact. It applies damage and reports
// what happened through the world object; who pays for the crime (wanted
// heat) is decided by game.js and missions.js.

import { PLAYER } from './config.js';
import { scarePeds } from './pedestrians.js';

const BULLET_SPEED = 940;

export function fireBullet(world, x, y, angle, from) {
  world.bullets.push({
    x, y,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    life: 0.55,
    from,
  });
  burst(world, x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, {
    count: 3, color: '#ffd76a', speed: 60, life: 0.08, size: 2,
  });
}

export function updateBullets(world, dt) {
  const city = world.city;
  const kept = [];
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (city.collides(b.x, b.y, 3)) {
      burst(world, b.x, b.y, { count: 5, color: '#e8dcc0', speed: 130, life: 0.25, size: 2 });
      continue;
    }
    let consumed = false;

    // Cars.
    for (const car of world.cars) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - b.x, car.y - b.y);
      if (d < car.def.radius + 5) {
        car.health -= 13;
        burst(world, b.x, b.y, { count: 6, color: '#ffb14e', speed: 170, life: 0.3, size: 2 });
        if (car.role === 'traffic') {
          car.cruise = 300; // driver panics and floors it
          car.target = null;
        }
        if (car.health <= 0) car.dead = true;
        world.onBulletHitCar?.(car, b);
        consumed = true;
        break;
      }
    }
    if (consumed) continue;

    // Pedestrians (only the player's bullets hurt them in this design).
    if (b.from === 'player') {
      for (const ped of world.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 11) {
          ped.health -= 65;
          knockDown(world, ped, Math.atan2(b.vy, b.vx));
          world.onBulletHitPed?.(ped);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
    }

    kept.push(b);
  }
  world.bullets = kept;
}

// A swung fist: hits the nearest pedestrian or car panel in front of the
// player. Returns 'ped', 'car' or null so the caller can book the crime.
export function tryPunch(world) {
  const player = world.player;
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  let bestPed = null;
  let bestD = PLAYER.punchRange;
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - player.x;
    const dy = ped.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d < bestD && dx * fx + dy * fy > 0) {
      bestPed = ped;
      bestD = d;
    }
  }
  if (bestPed) {
    bestPed.health -= PLAYER.punchDamage;
    knockDown(world, bestPed, player.angle);
    return 'ped';
  }
  for (const car of world.cars) {
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < car.def.radius + PLAYER.punchRange * 0.7) {
      car.health -= 4;
      burst(world, player.x + fx * 16, player.y + fy * 16, {
        count: 4, color: '#e8dcc0', speed: 110, life: 0.2, size: 2,
      });
      return 'car';
    }
  }
  return null;
}

export function knockDown(world, ped, angle) {
  ped.state = 'down';
  ped.downTimer = ped.health > 0 ? 2.6 : 9999;
  ped.x += Math.cos(angle) * 8;
  ped.y += Math.sin(angle) * 8;
  if (ped.health > 0) scarePeds(world.peds, ped.x, ped.y, 190);
}

// --- particles -------------------------------------------------------------

export function burst(world, x, y, opts) {
  const count = opts.count || 6;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (opts.speed || 120) * (0.3 + Math.random() * 0.7);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: (opts.life || 0.35) * (0.6 + Math.random() * 0.7),
      maxLife: opts.life || 0.35,
      color: opts.color || '#ffffff',
      size: opts.size || 2,
      drag: opts.drag ?? 2.2,
    });
  }
  if (world.particles.length > 900) {
    world.particles.splice(0, world.particles.length - 900);
  }
}

export function updateParticles(world, dt) {
  const kept = [];
  for (const p of world.particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const dragF = Math.max(0, 1 - p.drag * dt);
    p.vx *= dragF;
    p.vy *= dragF;
    kept.push(p);
  }
  world.particles = kept;
}

// Engine smoke and fire for a wrecked car, called once per frame per car.
export function emitCarDamage(world, car, dt) {
  if (car.health < 55 && Math.random() < dt * 14) {
    world.particles.push({
      x: car.x + (Math.random() - 0.5) * 14,
      y: car.y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 16,
      vy: -26 - Math.random() * 22,
      life: 0.7 + Math.random() * 0.5,
      maxLife: 1.1,
      color: car.health < 25 ? '#ff8c3a' : 'rgba(60,60,60,0.8)',
      size: car.health < 25 ? 3.4 : 4.4,
      drag: 0.4,
    });
  }
}
