// pedestrians.js — one job: the people of Palmaris. They stroll the
// sidewalks, dive away from bad driving, run screaming from gunfire, and
// fall down when a car finds them. Combat and crime bookkeeping live
// elsewhere; this file only moves bodies.

import { TILE } from './config.js';

const SKIN = ['#f2c79b', '#e0ac7e', '#c98d5f', '#9c6b43', '#7a4f2e'];
const SHIRTS = ['#d95f4b', '#3f6fb5', '#e0a83c', '#58a05c', '#e8e6df', '#7a4fa3', '#d97b29', '#3fa8a0', '#b03a6b', '#40506b'];
const PANTS = ['#2f3237', '#40506b', '#6b5636', '#707a86', '#28303a', '#7a6a8c'];

let nextPedId = 1;

export function createPedestrian(x, y, rng) {
  return {
    id: nextPedId++,
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    state: 'walk', // walk | flee | down
    target: null,
    health: 100,
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    skin: rng.pick(SKIN),
    fleeTimer: 0,
    downTimer: 0,
    stepPhase: rng.range(0, Math.PI * 2),
  };
}

export function spawnPedestrians(city, rng, count) {
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard++ < count * 30) {
    const p = rng.pick(city.sidewalkPoints);
    if (!p || city.isWater(p.x, p.y)) continue;
    peds.push(createPedestrian(p.x + rng.range(-8, 8), p.y + rng.range(-8, 8), rng));
  }
  return peds;
}

// Send every pedestrian near a point into a panic run.
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2.2 + Math.random() * 1.6;
      ped.angle = Math.atan2(ped.y - y, ped.x - x) + (Math.random() - 0.5) * 0.7;
    }
  }
}

export function updatePedestrian(ped, world, dt, rng) {
  const city = world.city;
  if (ped.state === 'down') {
    ped.speed = 0;
    if (ped.health > 0) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) ped.state = 'flee', ped.fleeTimer = 1.4;
    }
    return;
  }

  let speed = 0;
  if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    speed = 205;
    if (ped.fleeTimer <= 0) {
      ped.state = 'walk';
      ped.target = null;
    }
  } else {
    speed = 62;
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 14) {
      ped.target = pickSidewalkTarget(city, ped, rng);
      if (!ped.target) return;
    }
    ped.angle = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
  }

  // Sidestep anything with wheels that is bearing down on them.
  for (const car of world.cars) {
    if (car.dead) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 30 && Math.abs(car.speed) > 30) {
      ped.x += (dx / (d || 1)) * 130 * dt;
      ped.y += (dy / (d || 1)) * 130 * dt;
      if (ped.state === 'walk' && Math.abs(car.speed) > 150) {
        ped.state = 'flee';
        ped.fleeTimer = 1.6;
        ped.angle = Math.atan2(dy, dx);
      }
    }
  }

  ped.speed = speed;
  ped.stepPhase += dt * (speed / 9);
  let nx = ped.x + Math.cos(ped.angle) * speed * dt;
  let ny = ped.y + Math.sin(ped.angle) * speed * dt;
  if (city.isWater(nx, ny)) {
    ped.angle += Math.PI * 0.9;
    return;
  }
  const pushed = city.pushOut(nx, ny, 9);
  if (pushed.x !== nx || pushed.y !== ny) {
    // Slide along the wall and, if walking, give up on this target.
    if (ped.state === 'walk') ped.target = null;
    else ped.angle += 0.9 * dt * 8;
  }
  ped.x = Math.max(10, Math.min(city.w - 10, pushed.x));
  ped.y = Math.max(10, Math.min(city.h - 10, pushed.y));
  void TILE;
}

function pickSidewalkTarget(city, ped, rng) {
  for (let i = 0; i < 10; i++) {
    const p = rng.pick(city.sidewalkPoints);
    if (!p) continue;
    const d = Math.hypot(p.x - ped.x, p.y - ped.y);
    if (d > 60 && d < 760 && !city.isWater(p.x, p.y)) return { x: p.x, y: p.y };
  }
  return null;
}
