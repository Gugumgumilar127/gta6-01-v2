// vehicles.js — one job: everything about cars that is not the police.
// The car catalogue, how a car is made, how traffic drives itself along the
// avenues, and the arcade physics of a car somebody is driving. Rendering
// lives in render.js; the chase AI lives in police.js.

import { TILE, CAR_COLORS } from './config.js';

export const CAR_TYPES = {
  sedan: { name: 'Solano Sedan', length: 46, width: 22, topSpeed: 305, accel: 225, grip: 4.6, radius: 17 },
  taxi: { name: 'Palmaris Cab', length: 46, width: 22, topSpeed: 300, accel: 220, grip: 4.6, radius: 17 },
  coupe: { name: 'Vela Coupe', length: 44, width: 21, topSpeed: 345, accel: 265, grip: 5.0, radius: 16 },
  sport: { name: 'Cobra GT', length: 47, width: 22, topSpeed: 395, accel: 320, grip: 5.4, radius: 17 },
  van: { name: 'Bison Van', length: 52, width: 24, topSpeed: 265, accel: 185, grip: 4.0, radius: 19 },
  truck: { name: 'Hauler Truck', length: 58, width: 25, topSpeed: 245, accel: 165, grip: 3.8, radius: 20 },
  armored: { name: 'Armored Van', length: 54, width: 25, topSpeed: 255, accel: 175, grip: 4.0, radius: 19 },
  police: { name: 'Interceptor', length: 47, width: 22, topSpeed: 380, accel: 305, grip: 5.6, radius: 17 },
};

const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'coupe', 'coupe', 'van', 'truck'];

let nextCarId = 1;

export function createCar(type, x, y, angle, color, role) {
  const def = CAR_TYPES[type];
  return {
    id: nextCarId++,
    type,
    def,
    x, y, angle,
    speed: 0,
    color: color || '#888888',
    role: role || 'traffic', // traffic | parked | player | police | mission
    health: 100,
    target: null,
    cruise: 0,
    honkAt: 0,
    dead: false,
  };
}

export function spawnTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(vertical ? city.roadsX : city.roadsY);
    const along = rng.range(80, (vertical ? city.h : city.w) - 80);
    const dir = rng.chance(0.5) ? 1 : -1;
    const laneOffset = 16 * dir;
    const x = vertical ? line + laneOffset : along;
    const y = vertical ? along : line + laneOffset;
    if (city.isWater(x, y) || city.collides(x, y, 20)) continue;
    const angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const type = rng.pick(TRAFFIC_TYPES);
    const car = createCar(type, x, y, angle, type === 'taxi' ? '#e8b93c' : rng.pick(CAR_COLORS), 'traffic');
    car.cruise = rng.range(120, 185);
    car.target = nextWaypoint(city, car);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(city, rng) {
  const cars = [];
  const spots = rng.shuffle(city.parkingSpots).slice(0, 26);
  for (const s of spots) {
    if (rng.chance(0.22)) continue;
    const type = rng.pick(TRAFFIC_TYPES.concat(['sport']));
    cars.push(createCar(type, s.x, s.y, s.angle, rng.pick(CAR_COLORS), 'parked'));
  }
  // A few cars parked along the avenues, ready to be stolen.
  for (let i = 0; i < 14; i++) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(vertical ? city.roadsX : city.roadsY);
    const along = rng.range(120, (vertical ? city.h : city.w) - 120);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = vertical ? line + side * (TILE * 1.5 - 8) : along;
    const y = vertical ? along : line + side * (TILE * 1.5 - 8);
    if (city.isWater(x, y) || city.collides(x, y, 20) || city.isRoad(x, y) === false) {
      // roadside spots sit on the outer lane edge; accept sidewalk-adjacent ground
    }
    if (city.isWater(x, y) || city.collides(x, y, 20)) continue;
    const type = rng.pick(TRAFFIC_TYPES.concat(['sport', 'coupe']));
    const angle = vertical ? Math.PI / 2 : 0;
    cars.push(createCar(type, x, y, angle, rng.pick(CAR_COLORS), 'parked'));
  }
  return cars;
}

// The next intersection (or map edge) ahead of a traffic car.
function nextWaypoint(city, car) {
  const ahead = 60;
  const dx = Math.cos(car.angle);
  const dy = Math.sin(car.angle);
  const px = car.x + dx * ahead;
  const py = car.y + dy * ahead;
  let best = null;
  let bestDist = Infinity;
  for (const rx of city.roadsX) {
    for (const ry of city.roadsY) {
      const vx = rx - px;
      const vy = ry - py;
      const along = vx * dx + vy * dy;
      if (along < 30) continue;
      const cross = Math.abs(vx * dy - vy * dx);
      if (cross > 90) continue;
      if (along < bestDist) {
        bestDist = along;
        best = { x: rx, y: ry };
      }
    }
  }
  if (!best) {
    best = {
      x: Math.max(60, Math.min(city.w - 200, car.x + dx * 700)),
      y: Math.max(60, Math.min(city.h - 60, car.y + dy * 700)),
    };
  }
  // Aim at the lane-correct side of the intersection.
  return {
    x: best.x + (Math.abs(dx) > 0.5 ? 0 : 16 * Math.sign(dx || 1)),
    y: best.y + (Math.abs(dy) > 0.5 ? 0 : 16 * Math.sign(dy || 1)),
  };
}

export function updateTraffic(car, city, dt, cars, rng) {
  if (car.dead) return;
  if (!car.target) car.target = nextWaypoint(city, car);
  const dx = car.target.x - car.x;
  const dy = car.target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 42) {
    // At an intersection: mostly go straight, sometimes turn.
    if (rng.chance(0.38)) {
      const turn = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      car.angle += turn;
    }
    car.target = nextWaypoint(city, car);
  }
  const desired = Math.atan2(dy, dx);
  let diff = wrapAngle(desired - car.angle);
  car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);

  // Slow for whatever is ahead: another car, or the player standing around.
  let targetSpeed = car.cruise;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const aheadDist = ox * fx + oy * fy;
    if (aheadDist > 0 && aheadDist < 58) {
      const side = Math.abs(ox * fy - oy * fx);
      if (side < 20) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed) * 0.9);
        if (aheadDist < 34) targetSpeed = 0;
      }
    }
  }
  const accel = targetSpeed > car.speed ? car.def.accel * 0.55 : 320;
  car.speed += clamp(targetSpeed - car.speed, -accel * dt * 2.2, accel * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const pushed = city.pushOut(car.x, car.y, car.def.radius);
  car.x = pushed.x;
  car.y = pushed.y;
  car.x = Math.max(20, Math.min(city.w - 190, car.x));
  car.y = Math.max(20, Math.min(city.h - 20, car.y));
}

// Arcade driving for a car with a human (or a chase brain) at the wheel.
// control: { throttle: -1..1, steer: -1..1, handbrake: bool }
// Returns the impact strength of any wall hit this frame (0 when none).
export function driveCar(car, control, dt, city) {
  const def = car.def;
  const throttle = control.throttle || 0;
  const steer = control.steer || 0;
  if (throttle !== 0) {
    car.speed += throttle * def.accel * dt;
  } else {
    car.speed -= car.speed * 0.55 * dt; // engine braking / rolling drag
  }
  car.speed -= car.speed * 0.22 * dt; // air drag
  if (control.handbrake) car.speed -= car.speed * 1.6 * dt;
  const maxReverse = def.topSpeed * 0.38;
  car.speed = clamp(car.speed, -maxReverse, def.topSpeed);
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;

  const speedRatio = car.speed / def.topSpeed;
  const steerAuthority = clamp(Math.abs(speedRatio) * 2.4, 0, 1) * (control.handbrake ? 1.45 : 1);
  car.angle += steer * steerAuthority * 2.05 * dt * Math.sign(car.speed || 1);

  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  car.x += vx * dt;
  car.y += vy * dt;

  let impact = 0;
  const before = { x: car.x, y: car.y };
  const pushed = city.pushOut(car.x, car.y, def.radius);
  if (pushed.x !== car.x || pushed.y !== car.y) {
    const moved = Math.hypot(car.x - pushed.x, car.y - pushed.y);
    if (moved > 1.5 && Math.abs(car.speed) > 60) {
      impact = Math.min(1, Math.abs(car.speed) / def.topSpeed);
      car.health -= impact * 16;
      car.speed *= -0.22;
    } else if (moved > 0.5) {
      car.speed *= 0.6;
    }
    car.x = pushed.x;
    car.y = pushed.y;
  }
  void before;
  car.x = Math.max(18, Math.min(city.w - 176, car.x));
  car.y = Math.max(18, Math.min(city.h - 18, car.y));
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    car.speed = 0;
  }
  return impact;
}

// Circle collision between two cars; pushes both apart and trades speed.
// Returns impact strength (0 when they did not touch).
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = a.def.radius + b.def.radius - 4;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minDist * minDist || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const overlap = (minDist - d) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const rel = Math.abs(a.speed - b.speed);
  const impact = Math.min(1, rel / 320 + (Math.abs(a.speed) + Math.abs(b.speed)) / 1400);
  if (impact > 0.12) {
    const avg = (a.speed + b.speed) / 2;
    a.speed = avg * 0.7;
    b.speed = avg * 0.7;
    a.health -= impact * 9;
    b.health -= impact * 9;
  }
  return impact;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
