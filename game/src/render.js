// render.js — one job: draw the world. A camera that follows the player,
// the pre-rendered static city, every moving thing on top of it, the
// golden-hour light, and the live minimap. It reads the world; it never
// changes it.

import { TILE } from './config.js';

export function createRenderer(canvas, minimapCanvas) {
  const ctx = canvas.getContext('2d');
  const mctx = minimapCanvas.getContext('2d');
  const camera = { x: 0, y: 0, w: canvas.width, h: canvas.height };

  function screenToWorld(sx, sy) {
    return { x: sx + camera.x, y: sy + camera.y };
  }

  function draw(world) {
    const city = world.city;
    const focus = world.player.car || world.player;
    camera.w = canvas.width;
    camera.h = canvas.height;
    camera.x = clamp(focus.x - camera.w / 2, 0, Math.max(0, city.w - camera.w));
    camera.y = clamp(focus.y - camera.h / 2, 0, Math.max(0, city.h - camera.h));

    ctx.fillStyle = '#1d5f7d';
    ctx.fillRect(0, 0, camera.w, camera.h);
    ctx.drawImage(
      city.staticCanvas,
      camera.x, camera.y, camera.w, camera.h,
      0, 0, camera.w, camera.h,
    );

    const objective = world.director ? world.director.activeObjective() : null;
    if (objective && objective.x !== null && objective.x !== undefined) {
      drawObjectiveMarker(ctx, objective, camera, world.time);
    }

    for (const car of world.cars) {
      if (car.role === 'police') continue;
      if (!onScreen(car.x, car.y, camera, 90)) continue;
      drawCar(ctx, car, camera, world.time);
    }
    for (const ped of world.peds) {
      if (!onScreen(ped.x, ped.y, camera, 40)) continue;
      drawPedestrian(ctx, ped, camera);
    }
    if (!world.player.car) drawPlayer(ctx, world, camera);
    for (const car of world.cars) {
      if (car.role !== 'police') continue;
      if (!onScreen(car.x, car.y, camera, 90)) continue;
      drawCar(ctx, car, camera, world.time);
    }

    // Bullets as short tracers.
    ctx.strokeStyle = '#ffe9a3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const b of world.bullets) {
      const sx = b.x - camera.x;
      const sy = b.y - camera.y;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - b.vx * 0.016, sy - b.vy * 0.016);
    }
    ctx.stroke();

    // Particles.
    for (const p of world.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - camera.x - p.size / 2, p.y - camera.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    drawLightAndDanger(ctx, world, camera);
    drawMinimap(world);
    drawObjectiveArrow(ctx, objective, camera, world);
  }

  function drawLightAndDanger(c, world, cam) {
    // Golden-hour wash + vignette.
    const grad = c.createRadialGradient(
      cam.w / 2, cam.h / 2, cam.h * 0.42,
      cam.w / 2, cam.h / 2, cam.h * 0.95,
    );
    grad.addColorStop(0, 'rgba(255,176,84,0.05)');
    grad.addColorStop(1, 'rgba(24,10,40,0.30)');
    c.fillStyle = grad;
    c.fillRect(0, 0, cam.w, cam.h);

    // Police lights bleed into the frame edges when the law is close.
    if (world.wanted.stars > 0) {
      const target = world.player.car || world.player;
      let nearest = Infinity;
      for (const car of world.cars) {
        if (car.role !== 'police') continue;
        nearest = Math.min(nearest, Math.hypot(car.x - target.x, car.y - target.y));
      }
      if (nearest < 430) {
        const pulse = (Math.sin(world.time * 10) + 1) / 2;
        const strength = (1 - nearest / 430) * 0.20;
        c.fillStyle = 'rgba(230,50,40,' + (strength * pulse).toFixed(3) + ')';
        c.fillRect(0, 0, cam.w, 10);
        c.fillRect(0, 0, 10, cam.h);
        c.fillStyle = 'rgba(50,90,230,' + (strength * (1 - pulse)).toFixed(3) + ')';
        c.fillRect(0, cam.h - 10, cam.w, 10);
        c.fillRect(cam.w - 10, 0, 10, cam.h);
      }
    }
    void TILE;
  }

  function drawObjectiveArrow(c, objective, cam, world) {
    if (!objective || objective.x === null || objective.x === undefined) return;
    const sx = objective.x - cam.x;
    const sy = objective.y - cam.y;
    if (sx > -20 && sx < cam.w + 20 && sy > -20 && sy < cam.h + 20) return;
    const cx = cam.w / 2;
    const cy = cam.h / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const ex = cx + Math.cos(angle) * (Math.min(cam.w, cam.h) / 2 - 46);
    const ey = cy + Math.sin(angle) * (Math.min(cam.w, cam.h) / 2 - 46);
    c.save();
    c.translate(ex, ey);
    c.rotate(angle);
    c.fillStyle = objective.kind === 'fare' ? '#57b6e8' : '#ffd76a';
    c.beginPath();
    c.moveTo(16, 0);
    c.lineTo(-10, -10);
    c.lineTo(-10, 10);
    c.closePath();
    c.fill();
    c.restore();
    void world;
  }

  function drawMinimap(world) {
    const city = world.city;
    const S = minimapCanvas.width;
    const scale = S / city.w;
    mctx.fillStyle = '#1d5f7d';
    mctx.fillRect(0, 0, S, S);
    mctx.fillStyle = '#7c7c84';
    mctx.fillRect(0, 0, 65 * TILE * scale, S);
    mctx.fillStyle = '#e3d09b';
    mctx.fillRect(65 * TILE * scale, 0, 2 * TILE * scale, S);
    mctx.strokeStyle = '#3a3d42';
    mctx.lineWidth = 2;
    for (const rx of city.roadsX) {
      mctx.beginPath();
      mctx.moveTo(rx * scale, 0);
      mctx.lineTo(rx * scale, S);
      mctx.stroke();
    }
    for (const ry of city.roadsY) {
      mctx.beginPath();
      mctx.moveTo(0, ry * scale);
      mctx.lineTo(65 * TILE * scale, ry * scale);
      mctx.stroke();
    }
    // Objective.
    const objective = world.director ? world.director.activeObjective() : null;
    if (objective && objective.x !== null && objective.x !== undefined) {
      const pulse = 3.4 + Math.sin(world.time * 6) * 1.1;
      mctx.fillStyle = objective.kind === 'fare' ? '#57b6e8' : '#ffd76a';
      mctx.beginPath();
      mctx.arc(objective.x * scale, objective.y * scale, pulse, 0, Math.PI * 2);
      mctx.fill();
    }
    // Police blips flash red/blue.
    const flash = Math.sin(world.time * 9) > 0;
    for (const car of world.cars) {
      if (car.role !== 'police') continue;
      mctx.fillStyle = flash ? '#ff4b3e' : '#4b7dff';
      mctx.fillRect(car.x * scale - 2.4, car.y * scale - 2.4, 4.8, 4.8);
    }
    // Player arrow.
    const p = world.player.car || world.player;
    mctx.save();
    mctx.translate(p.x * scale, p.y * scale);
    mctx.rotate(p.angle || 0);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(6, 0);
    mctx.lineTo(-4.4, -3.6);
    mctx.lineTo(-4.4, 3.6);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  return { draw, screenToWorld, camera };
}

function onScreen(x, y, camera, pad) {
  return x > camera.x - pad && x < camera.x + camera.w + pad &&
    y > camera.y - pad && y < camera.y + camera.h + pad;
}

function drawObjectiveMarker(c, objective, camera, time) {
  const sx = objective.x - camera.x;
  const sy = objective.y - camera.y;
  const kind = objective.kind || 'dropoff';
  const color = kind === 'fare' ? '#57b6e8' : kind === 'escape' ? '#7dd069' : '#ffd76a';
  const radius = Math.max(30, objective.radius || 60);
  const pulse = 1 + Math.sin(time * 4.4) * 0.07;
  c.strokeStyle = color;
  c.lineWidth = 3.4;
  c.globalAlpha = 0.9;
  c.beginPath();
  c.arc(sx, sy, radius * pulse, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha = 0.16;
  c.fillStyle = color;
  c.beginPath();
  c.arc(sx, sy, radius * pulse, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
  const bob = Math.sin(time * 5) * 5;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(sx, sy - radius - 16 + bob);
  c.lineTo(sx - 10, sy - radius - 32 + bob);
  c.lineTo(sx + 10, sy - radius - 32 + bob);
  c.closePath();
  c.fill();
}

export function drawCar(c, car, camera, time) {
  const sx = car.x - camera.x;
  const sy = car.y - camera.y;
  const def = car.def;
  c.save();
  c.translate(sx, sy);
  c.rotate(car.angle);
  // Shadow.
  c.fillStyle = 'rgba(15,12,8,0.30)';
  roundRect(c, -def.length / 2 + 3, -def.width / 2 + 5, def.length, def.width, 6);
  c.fill();
  // Wheels.
  c.fillStyle = '#17181a';
  const wx = def.length / 2 - 11;
  const wy = def.width / 2 - 2;
  c.fillRect(wx - 6, -wy - 3, 12, 5);
  c.fillRect(wx - 6, wy - 2, 12, 5);
  c.fillRect(-wx - 6, -wy - 3, 12, 5);
  c.fillRect(-wx - 6, wy - 2, 12, 5);
  // Body.
  c.fillStyle = car.dead ? '#3c3f45' : car.color;
  roundRect(c, -def.length / 2, -def.width / 2, def.length, def.width, 6);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 1.4;
  c.stroke();
  if (car.type === 'police') {
    c.fillStyle = '#23252a';
    c.fillRect(-6, -def.width / 2 + 2, 15, def.width - 4);
    const flash = Math.sin(time * 11) > 0;
    c.fillStyle = flash ? '#ff4b3e' : '#7a1610';
    c.fillRect(-4, -def.width / 2 + 3, 7, 5);
    c.fillStyle = flash ? '#1c3f8f' : '#4b7dff';
    c.fillRect(-4, def.width / 2 - 8, 7, 5);
  }
  if (car.type === 'taxi') {
    c.fillStyle = 'rgba(20,20,20,0.85)';
    c.fillRect(-3, -4, 7, 8);
    c.fillStyle = '#fff3c4';
    c.fillRect(-2, -3, 5, 6);
  }
  if (car.type === 'sport') {
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(-def.length / 2 + 1, -def.width / 2 + 3, 4, def.width - 6);
  }
  // Glass and roof.
  c.fillStyle = 'rgba(24,32,44,0.9)';
  if (car.type === 'van' || car.type === 'truck' || car.type === 'armored') {
    c.fillRect(def.length / 2 - 13, -def.width / 2 + 3, 6, def.width - 6);
    c.fillStyle = car.type === 'armored' ? '#39424c' : 'rgba(255,255,255,0.20)';
    c.fillRect(-def.length / 2 + 4, -def.width / 2 + 4, def.length - 24, def.width - 8);
  } else {
    c.fillRect(2, -def.width / 2 + 3, 6, def.width - 6); // windshield
    c.fillRect(-11, -def.width / 2 + 3, 5, def.width - 6); // rear glass
    c.fillStyle = shade(car.dead ? '#3c3f45' : car.color, -18);
    roundRect(c, -6, -def.width / 2 + 4, 9, def.width - 8, 3);
    c.fill();
  }
  // Damage shading.
  if (car.health < 60) {
    c.fillStyle = 'rgba(20,20,20,' + ((60 - car.health) / 130).toFixed(2) + ')';
    roundRect(c, -def.length / 2, -def.width / 2, def.length, def.width, 6);
    c.fill();
  }
  c.restore();
}

function drawPedestrian(c, ped, camera) {
  const sx = ped.x - camera.x;
  const sy = ped.y - camera.y;
  c.save();
  c.translate(sx, sy);
  if (ped.state === 'down') {
    c.rotate(ped.angle + Math.PI / 2);
    c.fillStyle = 'rgba(15,12,8,0.25)';
    c.beginPath();
    c.ellipse(2, 3, 13, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = ped.pants;
    c.fillRect(-12, -3.4, 11, 6.8);
    c.fillStyle = ped.shirt;
    c.fillRect(-1, -4.4, 11, 8.8);
    c.fillStyle = ped.skin;
    c.beginPath();
    c.arc(13, 0, 4.2, 0, Math.PI * 2);
    c.fill();
    c.restore();
    return;
  }
  const bob = Math.sin(ped.stepPhase) * 1.6;
  c.fillStyle = 'rgba(15,12,8,0.25)';
  c.beginPath();
  c.ellipse(0, 4, 8, 4, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = ped.pants;
  c.fillRect(-4.6, -2 + bob * 0.4, 4, 7);
  c.fillRect(1, -2 - bob * 0.4, 4, 7);
  c.fillStyle = ped.shirt;
  c.beginPath();
  c.arc(0, -1, 6.4, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = ped.skin;
  c.beginPath();
  c.arc(0, -2.4, 3.6, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawPlayer(c, world, camera) {
  const player = world.player;
  const sx = player.x - camera.x;
  const sy = player.y - camera.y;
  c.save();
  c.translate(sx, sy);
  c.fillStyle = 'rgba(15,12,8,0.3)';
  c.beginPath();
  c.ellipse(0, 4, 9, 4.4, 0, 0, Math.PI * 2);
  c.fill();
  const bob = Math.sin(player.stepPhase || 0) * 1.8;
  c.fillStyle = '#28303a';
  c.fillRect(-5, -2 + bob * 0.4, 4.2, 7.4);
  c.fillRect(1, -2 - bob * 0.4, 4.2, 7.4);
  // Marco's red jacket.
  c.fillStyle = '#c23b2e';
  c.beginPath();
  c.arc(0, -1, 7.2, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.stroke();
  c.fillStyle = '#e0ac7e';
  c.beginPath();
  c.arc(0, -2.4, 4, 0, Math.PI * 2);
  c.fill();
  // Aim arm + pistol toward the mouse.
  if (world.aimAngle !== null && world.aimAngle !== undefined) {
    const a = world.aimAngle - 0; // world-space angle
    c.rotate(0);
    c.strokeStyle = '#e0ac7e';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -1);
    c.lineTo(Math.cos(a) * 11, -1 + Math.sin(a) * 11);
    c.stroke();
    c.fillStyle = '#17181a';
    c.fillRect(Math.cos(a) * 11 - 2, -1 + Math.sin(a) * 11 - 1.4, 7, 2.8);
  }
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 0xff) + amt;
  let b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
