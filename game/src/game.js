// game.js — one job: own the world and run it. This is the orchestrator:
// it builds Palmaris, holds every entity, steps the simulation, books the
// crimes, judges busts, saves progress, and drives the screens. The rules
// of each subsystem live in their own modules; this file wires them.

import { generateCity } from './city.js';
import { createRng } from './random.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createRenderer } from './render.js';
import {
  spawnTraffic, spawnParked, updateTraffic, driveCar, collideCars, createCar,
} from './vehicles.js';
import { spawnPedestrians, updatePedestrian, scarePeds } from './pedestrians.js';
import { createWanted, spawnPoliceCar, updatePoliceCar, policeSeesPlayer } from './police.js';
import {
  fireBullet, updateBullets, updateParticles, tryPunch, burst, emitCarDamage, knockDown,
} from './combat.js';
import { createDirector, MISSION_PAY } from './missions.js';
import { PLAYER, WANTED, SAVE_KEY, STORY } from './config.js';

export function createGame(canvas) {
  const city = generateCity();
  const rng = createRng(987123);
  const audio = createAudio();
  const input = createInput(canvas);
  const hud = createHud();
  const renderer = createRenderer(canvas, hud.refs.minimap);
  const wanted = createWanted();

  const cars = [];
  const peds = [];
  const player = {
    x: city.locations.start.x, y: city.locations.start.y,
    angle: -Math.PI / 2, health: PLAYER.maxHealth,
    car: null, stepPhase: 0, fireCooldown: 0, punchCooldown: 0, hurtTimer: 0,
  };

  const state = {
    mode: 'title',
    time: 0,
    cash: 0,
    bust: 0,
    endTimer: 0,
    garageTimer: 0,
    crimeCooldown: 0,
    autosaveTimer: 0,
    stats: { jobs: 0, fares: 0, stolen: 0, startAt: Date.now() },
  };

  const world = {
    city, cars, peds, player, wanted,
    bullets: [], particles: [],
    rng, time: 0, aimAngle: null, director: null,
    onBulletHitCar(car) {
      if (car.role === 'police') reportCrime(26, car.x, car.y);
      else if (witnessed(car.x, car.y, 300)) reportCrime(14, car.x, car.y);
    },
    onBulletHitPed(ped) {
      reportCrime(40, ped.x, ped.y);
    },
  };

  // --- director host interface ----------------------------------------------

  const host = {
    player, city, cars, peds, wanted, rng,
    addCash(n) {
      state.cash += n;
      refreshCashHud();
    },
    banner(title, sub, color) { hud.banner(title, sub, color); },
    toast(text) { hud.toast(text); },
    phone(lines) {
      audio.ring();
      hud.phone(lines);
    },
    playSound(name) {
      if (audio[name]) audio[name]();
    },
    setHeatAtLeast(stars) {
      wanted.heat = Math.max(wanted.heat, WANTED.thresholds[stars]);
    },
    findBeachParkingSpot() {
      const spots = city.parkingSpots.filter((s) => s.x > 1750 && s.y > 900 && s.y < 2100);
      if (spots.length) return rng.pick(spots);
      return { x: city.locations.taxiDepot.x + 60, y: city.locations.taxiDepot.y + 40, angle: 0 };
    },
    findFarePickup() {
      for (let i = 0; i < 14; i++) {
        const p = rng.pick(city.sidewalkPoints);
        const d = Math.hypot(p.x - player.x, p.y - player.y);
        if (d > 200 && d < 560 && !city.isWater(p.x, p.y)) return { x: p.x, y: p.y };
      }
      return null;
    },
    findFareDestination(from) {
      const names = Object.values(city.locations);
      for (let i = 0; i < 14; i++) {
        const loc = rng.pick(names);
        const d = Math.hypot(loc.x - from.x, loc.y - from.y);
        if (d > 480 && d < 1700) return { x: loc.x, y: loc.y, label: loc.label };
      }
      const bank = city.locations.bank;
      return { x: bank.x, y: bank.y, label: bank.label };
    },
    saveProgress() { saveGame(); },
    onJobComplete() { state.stats.jobs++; },
    onFareComplete() { state.stats.fares++; },
    onStoryComplete() {
      state.endTimer = 2.2;
    },
  };

  const director = createDirector(host);
  world.director = director;

  // --- helpers ----------------------------------------------------------------

  function storyEarned() {
    let sum = 0;
    for (let i = 0; i < Math.min(director.stage, MISSION_PAY.length); i++) sum += MISSION_PAY[i];
    return sum;
  }

  function refreshCashHud() {
    hud.setCash(state.cash, storyEarned(), STORY.debt);
  }

  function witnessed(x, y, radius) {
    for (const ped of peds) {
      if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.y - y) < radius) return true;
    }
    for (const car of cars) {
      if (car.role === 'police' && Math.hypot(car.x - x, car.y - y) < radius + 160) return true;
    }
    return false;
  }

  function reportCrime(points, x, y) {
    if (state.crimeCooldown > 0) return;
    wanted.addCrime(points);
    state.crimeCooldown = 0.7;
    void x; void y;
  }

  function saveGame() {
    if (state.mode === 'title') return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash,
        stage: director.stage,
        stats: state.stats,
      }));
    } catch (e) { /* private mode: play session-only */ }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // --- world seeding ----------------------------------------------------------

  function seedWorld() {
    cars.length = 0;
    peds.length = 0;
    cars.push(...spawnParked(city, rng));
    cars.push(...spawnTraffic(city, rng, 17));
    peds.push(...spawnPedestrians(city, rng, 44));
    // A starter sedan waits by the safehouse corner.
    const s = city.locations.start;
    cars.push(createCar('sedan', s.x + 52, s.y + 18, 0, '#3f6fb5', 'parked'));
  }

  // --- screens ------------------------------------------------------------------

  function showTitle() {
    state.mode = 'title';
    const save = loadGame();
    const buttons = [{ label: 'NEW GAME', onClick: () => startRun(true) }];
    if (save && typeof save.cash === 'number') {
      buttons.push({ label: 'CONTINUE — $' + save.cash.toLocaleString('en-US'), onClick: () => startRun(false) });
    }
    hud.showScreen('title',
      '<p class="tagline">Palmaris. One city, one debt, five jobs.</p>' +
      '<p>' + STORY.hero + ' owes fixer ' + STORY.fixer + ' <b>$' + STORY.debt.toLocaleString('en-US') + '</b>. ' +
      'Steal, deliver, vanish, rob — and drive like the rent is due.</p>' +
      '<p class="controls">WASD drive / walk · E enter & exit cars · MOUSE aim · CLICK shoot · F shove · SPACE handbrake · SHIFT run · ESC pause</p>',
      buttons);
  }

  function startRun(fresh) {
    audio.unlock();
    audio.ui();
    hud.showScreen(null);
    seedWorld();
    player.car = null;
    player.health = PLAYER.maxHealth;
    wanted.clear();
    state.bust = 0;
    const start = city.locations.start;
    player.x = start.x;
    player.y = start.y;
    if (fresh) {
      state.cash = 60;
      state.stats = { jobs: 0, fares: 0, stolen: 0, startAt: Date.now() };
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      director.startStory(0);
    } else {
      const save = loadGame();
      state.cash = save.cash || 0;
      state.stats = save.stats || state.stats;
      director.startStory(Math.min(save.stage || 0, 5));
      if (director.stage >= 5) director.phase = 'done';
    }
    state.mode = 'playing';
    refreshCashHud();
    hud.banner('PALMARIS HEAT', STORY.fixer + ' is waiting. Check your phone.', '#ffd76a');
  }

  function endRun(kind) {
    // kind: 'busted' | 'wasted'
    state.mode = kind;
    state.endKind = kind;
    state.endTimer = 1.4;
    audio.setEngine(false, 0);
    audio.setSiren(false);
    if (kind === 'busted') audio.bustedJingle();
    director.onPlayerDown();
  }

  function respawn() {
    const wasBusted = state.endKind === 'busted';
    const at = wasBusted ? city.locations.policeStation : city.locations.hospital;
    const fine = wasBusted ? 200 : 150;
    state.cash = Math.max(0, state.cash - fine);
    if (player.car) {
      player.car.role = 'parked';
      player.car = null;
    }
    player.x = at.x + 30;
    player.y = at.y + 30;
    player.health = PLAYER.maxHealth;
    wanted.clear();
    state.bust = 0;
    hud.showScreen(null);
    state.mode = 'playing';
    refreshCashHud();
    hud.toast(wasBusted
      ? 'Released. Fine $' + fine + '. Vidal is not impressed.'
      : 'Patched up. Bill $' + fine + '. The debt did not shrink.');
    saveGame();
  }

  function showComplete() {
    state.mode = 'complete';
    const minutes = Math.max(1, Math.round((Date.now() - state.stats.startAt) / 60000));
    hud.showScreen('complete',
      '<p>' + STORY.hero + ' paid ' + STORY.fixer + ' every cent of the $' + STORY.debt.toLocaleString('en-US') + '.</p>' +
      '<p>Jobs done: <b>' + director.stage + '/5</b> · Taxi fares: <b>' + state.stats.fares + '</b> · Cars lifted: <b>' +
      state.stats.stolen + '</b> · Cash on hand: <b>$' + state.cash.toLocaleString('en-US') + '</b> · Time: <b>' + minutes + ' min</b></p>' +
      '<p class="controls">Palmaris is yours now — fares, garages and sunsets stay open. Or run the debt again.</p>',
      [
        { label: 'FREE ROAM', onClick: () => { hud.showScreen(null); state.mode = 'playing'; } },
        { label: 'NEW GAME', onClick: () => startRun(true) },
      ]);
  }

  // --- per-frame update ---------------------------------------------------------

  function update(dt) {
    world.time = state.time;
    state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);

    if (state.mode === 'busted' || state.mode === 'wasted') {
      state.endTimer -= dt;
      updateAmbient(dt);
      if (state.endTimer <= 0 && state.mode !== 'shown') {
        const kind = state.mode;
        state.mode = 'shown';
        hud.showScreen(kind,
          kind === 'busted'
            ? '<p>The Palmaris PD thanks you for your donation to the donut fund.</p>'
            : '<p>St. Solana Hospital patches wheelmen, no questions asked.</p>',
          [{ label: kind === 'busted' ? 'WALK OUT — $200 FINE' : 'DISCHARGE — $150', onClick: respawn }]);
      }
      return;
    }
    if (state.mode === 'complete') return;
    if (state.endTimer > 0 && director.phase === 'done') {
      state.endTimer -= dt;
      if (state.endTimer <= 0) {
        showComplete();
        return;
      }
    }
    if (state.mode !== 'playing') {
      updateAmbient(dt);
      return;
    }

    updatePlayer(dt);
    updateCars(dt);
    updatePolice(dt);
    updatePeds(dt);
    updateBullets(world, dt);
    updateParticles(world, dt);
    director.update(dt);
    if (player.car && player.car.type === 'taxi') director.maybeStartFare();
    updateGarage(dt);

    // Wanted decay + HUD.
    const seen = cars.some((c) => c.role === 'police' && policeSeesPlayer(c, player));
    const before = wanted.stars;
    wanted.update(dt, seen);
    if (before > 0 && wanted.stars === 0) hud.toast('You lost the heat.');
    hud.setStars(wanted.stars);
    const objective = director.activeObjective();
    let distText = '';
    if (objective && objective.x !== null && objective.x !== undefined) {
      const d = Math.hypot(objective.x - player.x, objective.y - player.y);
      distText = Math.round(d / 10) + ' m';
    }
    hud.setObjective(objective, distText);
    hud.setDistrict(city.districtAt(player.x, player.y).toUpperCase() + ' — PALMARIS');
    hud.setHealth(player.health / PLAYER.maxHealth);
    hud.setCarHealth(player.car ? player.car.health / 100 : null);
    hud.setSpeed(player.car ? Math.abs(player.car.speed) * 0.42 : null);
    hud.setBust(state.bust > 0.02 ? state.bust : null);

    audio.setEngine(!!player.car, player.car ? Math.abs(player.car.speed) / player.car.def.topSpeed : 0);
    const anyCopNear = cars.some((c) => c.role === 'police' && Math.hypot(c.x - player.x, c.y - player.y) < 720);
    audio.setSiren(anyCopNear && wanted.stars > 0);

    if (player.health <= 0) endRun('wasted');

    state.autosaveTimer += dt;
    if (state.autosaveTimer > 12) {
      state.autosaveTimer = 0;
      saveGame();
    }
  }

  function updateAmbient(dt) {
    // Title screen: the city lives on behind the menu.
    for (const car of cars) {
      if (car.role === 'traffic') updateTraffic(car, city, dt, cars, rng);
    }
    for (const ped of peds) updatePedestrian(ped, world, dt, rng);
    updateParticles(world, dt);
  }

  function updatePlayer(dt) {
    const p = player;
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    p.punchCooldown = Math.max(0, p.punchCooldown - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
    if (p.hurtTimer <= 0 && p.health > 0 && p.health < PLAYER.maxHealth) {
      p.health = Math.min(PLAYER.maxHealth, p.health + dt * 2.4);
    }

    if (p.car) {
      const car = p.car;
      hud.prompt(null); // the garage may set its own prompt later this frame
      const axes = input.axes();
      const impact = driveCar(car, {
        throttle: -axes.y,
        steer: axes.x,
        handbrake: input.isDown('Space'),
      }, dt, city);
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      if (impact > 0.3) {
        audio.crash(impact);
        burst(world, car.x, car.y, { count: 8, color: '#e8dcc0', speed: 160, life: 0.3, size: 2 });
      }
      if (input.isDown('Space') && Math.abs(car.speed) > 150 && Math.random() < dt * 9) audio.skid();
      if (car.dead) {
        exitCar();
        hud.toast('Wrecked. Find another ride.');
      } else if (input.wasPressed('KeyE')) {
        exitCar();
      }
      return;
    }

    // On foot.
    const axes = input.axes();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const moving = axes.x !== 0 || axes.y !== 0;
    const mouseWorld = renderer.screenToWorld(input.mouse.x, input.mouse.y);
    world.aimAngle = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);
    if (moving) {
      const len = Math.hypot(axes.x, axes.y);
      const vx = (axes.x / len) * speed;
      const vy = (axes.y / len) * speed;
      const nx = p.x + vx * dt;
      const ny = p.y + vy * dt;
      if (!city.isWater(nx, ny)) {
        const pushed = city.pushOut(nx, ny, PLAYER.radius);
        p.x = Math.max(12, Math.min(city.w - 60, pushed.x));
        p.y = Math.max(12, Math.min(city.h - 12, pushed.y));
      }
      p.angle = input.mouse.down ? world.aimAngle : Math.atan2(vy, vx);
      p.stepPhase += dt * (speed / 11);
    } else if (input.mouse.down) {
      p.angle = world.aimAngle;
    }

    // Enter a car.
    const nearCar = nearestEnterableCar();
    if (nearCar && !input.mouse.down) {
      hud.prompt('Press E — ' + (nearCar.role === 'parked' ? 'take the ' : 'carjack the ') + nearCar.def.name);
    } else {
      hud.prompt(null);
    }
    if (nearCar && input.wasPressed('KeyE')) {
      enterCar(nearCar);
      return;
    }

    // Shoot.
    if (input.mouse.down && p.fireCooldown <= 0) {
      p.fireCooldown = 0.16;
      audio.unlock();
      audio.shot();
      fireBullet(world, p.x, p.y, world.aimAngle, 'player');
      scarePeds(peds, p.x, p.y, 250);
      if (witnessed(p.x, p.y, 330)) reportCrime(16, p.x, p.y);
    }
    // Shove.
    if (input.wasPressed('KeyF') && p.punchCooldown <= 0) {
      p.punchCooldown = 0.38;
      const hit = tryPunch(world);
      if (hit) {
        audio.punch();
        if (hit === 'ped' && witnessed(p.x, p.y, 300)) reportCrime(30, p.x, p.y);
      }
    }
  }

  function nearestEnterableCar() {
    let best = null;
    let bestD = PLAYER.enterCarRange;
    for (const car of cars) {
      if (car.role === 'police' || car.dead) continue;
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    return best;
  }

  function enterCar(car) {
    const wasTraffic = car.role === 'traffic';
    car.role = 'player';
    car.speed = Math.min(car.speed, 40);
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    hud.prompt(null);
    audio.ui();
    if (!car.everDriven) {
      car.everDriven = true;
      state.stats.stolen++;
      if (wasTraffic) {
        scarePeds(peds, car.x, car.y, 130);
        if (witnessed(car.x, car.y, 320)) {
          reportCrime(30, car.x, car.y);
          hud.toast('Carjacked — and somebody saw it.');
        }
      } else if (witnessed(car.x, car.y, 260)) {
        reportCrime(14, car.x, car.y);
      }
    }
    if (car.type === 'taxi') director.maybeStartFare();
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.role = 'parked';
    player.car = null;
    const side = car.angle + Math.PI / 2;
    let nx = car.x + Math.cos(side) * (car.def.width + 12);
    let ny = car.y + Math.sin(side) * (car.def.width + 12);
    if (city.collides(nx, ny, PLAYER.radius) || city.isWater(nx, ny)) {
      nx = car.x - Math.cos(side) * (car.def.width + 12);
      ny = car.y - Math.sin(side) * (car.def.width + 12);
    }
    const pushed = city.pushOut(nx, ny, PLAYER.radius);
    player.x = pushed.x;
    player.y = pushed.y;
    audio.setEngine(false, 0);
    if (director.fare) director.cancelFare();
  }

  function updateCars(dt) {
    for (const car of cars) {
      if (car.role === 'traffic') updateTraffic(car, city, dt, cars, rng);
      else if (car.role === 'mission' && car.type === 'armored' && !car.parked) {
        updateTraffic(car, city, dt, cars, rng);
      }
      emitCarDamage(world, car, dt);
    }
    // Car vs car.
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy > 70 * 70) continue;
        const impact = collideCars(a, b);
        if (impact > 0.28) {
          audio.crash(impact);
          burst(world, (a.x + b.x) / 2, (a.y + b.y) / 2, { count: 7, color: '#ffd76a', speed: 150, life: 0.3, size: 2 });
          const other = a === player.car ? b : b === player.car ? a : null;
          if (other && other.role === 'police') reportCrime(24, other.x, other.y);
          if (other && (a === player.car || b === player.car) && other.role === 'traffic') {
            if (witnessed(other.x, other.y, 280)) reportCrime(12, other.x, other.y);
          }
        }
      }
    }
    // Cars vs pedestrians, and vs the player on foot.
    for (const car of cars) {
      if (Math.abs(car.speed) < 46) continue;
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.def.radius + 7) {
          ped.health -= Math.abs(car.speed) / 4;
          knockDown(world, ped, car.angle);
          audio.crash(0.25);
          if (car === player.car || car.role === 'player') reportCrime(45, ped.x, ped.y);
          else scarePeds(peds, ped.x, ped.y, 200);
        }
      }
      if (!player.car && Math.hypot(player.x - car.x, player.y - car.y) < car.def.radius + 8) {
        const dmg = Math.abs(car.speed) / 5;
        player.health -= dmg;
        player.hurtTimer = 6;
        player.x += Math.cos(car.angle) * 20;
        player.y += Math.sin(car.angle) * 20;
        hud.damageFlash();
        audio.crash(0.4);
        if (player.health <= 0) endRun('wasted');
      }
    }
    // Retire wrecks far away so the streets stay alive.
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      if (car.dead && car.role === 'traffic' && Math.hypot(car.x - player.x, car.y - player.y) > 800) {
        cars.splice(i, 1);
        cars.push(...spawnTraffic(city, rng, 1));
      }
    }
  }

  function updatePolice(dt) {
    const stars = wanted.stars;
    const want = WANTED.policeByStars[stars] || 0;
    const cops = cars.filter((c) => c.role === 'police');
    if (stars === 0 && cops.length) {
      // Heat is gone: units stand down — far ones vanish, near ones just
      // become traffic and drive off.
      for (const cop of cops) {
        const d = Math.hypot(cop.x - player.x, cop.y - player.y);
        if (d > 260) cars.splice(cars.indexOf(cop), 1);
        else {
          cop.role = 'traffic';
          cop.target = null;
          cop.cruise = 130;
        }
      }
      state.bust = 0;
      return;
    }
    if (cops.length < want) {
      const cop = spawnPoliceCar(city, rng, player);
      if (cop) cars.push(cop);
    } else if (cops.length > want) {
      // Units peel off when the heat drops; remove the farthest.
      let far = null;
      let farD = -1;
      for (const c of cops) {
        const d = Math.hypot(c.x - player.x, c.y - player.y);
        if (d > farD) { farD = d; far = c; }
      }
      if (far && farD > 500) cars.splice(cars.indexOf(far), 1);
    }
    for (const cop of cops) {
      if (cop.dead) continue;
      updatePoliceCar(cop, world, dt);
    }
    // Bust judgement: close, slow, and seen = caught.
    if (stars > 0 && state.mode === 'playing') {
      const target = player.car || player;
      const speed = player.car ? Math.abs(player.car.speed) : 0;
      let nearest = Infinity;
      for (const cop of cops) {
        if (cop.dead) continue;
        nearest = Math.min(nearest, Math.hypot(cop.x - target.x, cop.y - target.y));
      }
      if (nearest < 118 && speed < 26) {
        state.bust += dt / 2.1;
        if (state.bust >= 1) {
          endRun('busted');
          return;
        }
      } else {
        state.bust = Math.max(0, state.bust - dt * 0.7);
      }
    } else {
      state.bust = 0;
    }
  }

  function updatePeds(dt) {
    for (const ped of peds) updatePedestrian(ped, world, dt, rng);
    // Keep the sidewalks populated near the player.
    if (peds.length < 40 && Math.random() < dt * 0.7) {
      const p = rng.pick(city.sidewalkPoints);
      if (p && Math.hypot(p.x - player.x, p.y - player.y) > 620 && !city.isWater(p.x, p.y)) {
        peds.push(...spawnPedestrians(city, rng, 1));
      }
    }
    // Bodies fade after a while.
    for (let i = peds.length - 1; i >= 0; i--) {
      const ped = peds[i];
      if (ped.state === 'down' && ped.health <= 0) {
        ped.fadeTimer = (ped.fadeTimer || 0) + dt;
        if (ped.fadeTimer > 26) peds.splice(i, 1);
      }
    }
  }

  function updateGarage(dt) {
    const g = city.locations.garage;
    const inCar = !!player.car;
    const near = inCar && Math.hypot(player.car.x - g.x, player.car.y - g.y) < 84;
    const needsWork = inCar && (wanted.stars > 0 || player.car.health < 92);
    if (near && needsWork && state.cash >= 250) {
      hud.prompt('Hold R — repaint & lose the heat: $250');
      if (input.isDown('KeyR')) {
        state.garageTimer += dt;
        if (state.garageTimer > 1.1) {
          state.cash -= 250;
          wanted.clear();
          player.car.health = 100;
          player.car.dead = false;
          player.car.color = '#' + Math.floor(rng.range(0x222222, 0xdddddd)).toString(16).padStart(6, '0');
          state.garageTimer = 0;
          refreshCashHud();
          audio.cash();
          hud.toast('Fresh paint, clean plates. Vidal\'s crew earns its cut.');
        }
      } else {
        state.garageTimer = 0;
      }
    } else if (near && needsWork) {
      hud.prompt('Vidal\'s Garage — repaint costs $250 (you are short)');
    }
  }

  // --- demo staging for screenshots ----------------------------------------------

  function stageDemo(name) {
    seedWorld();
    state.cash = 1240;
    state.mode = 'playing';
    hud.showScreen(null);
    const start = city.locations.start;
    player.x = start.x;
    player.y = start.y;
    if (name === 'chase') {
      director.startStory(0);
      const bank = city.locations.bank;
      const car = createCar('sport', bank.x - 120, bank.y + 66, 0, '#c23b2e', 'parked');
      cars.push(car);
      enterCar(car);
      wanted.heat = WANTED.thresholds[3];
      for (let i = 0; i < 3; i++) {
        const cop = createCar('police', bank.x - 260 - i * 90, bank.y + 40 + i * 26, 0, '#e8e6df', 'police');
        cop.stuckTimer = 0;
        cars.push(cop);
      }
      hud.banner('LOSE THE HEAT', 'Downtown is watching, Marco', '#e5533d');
    } else if (name === 'mission') {
      director.startStory(1);
      const spot = city.locations.packageSpot;
      const car = createCar('coupe', spot.x - 90, spot.y + 30, 0.4, '#3fa8a0', 'parked');
      cars.push(car);
      enterCar(car);
    } else if (name === 'beach') {
      director.startStory(0);
      player.x = 66 * 44 - 30;
      player.y = 30 * 44;
      player.angle = Math.PI / 2;
    } else {
      director.startStory(0);
    }
    refreshCashHud();
  }

  // --- boot -----------------------------------------------------------------------

  seedWorld();
  showTitle();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    state.time += dt;
    if (state.mode === 'paused') {
      renderer.draw(world);
      requestAnimationFrame(frame);
      return;
    }
    update(dt);
    renderer.draw(world);
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state.mode === 'playing') {
        state.mode = 'paused';
        hud.showScreen('pause', '<p>The city holds its breath.</p>', [
          { label: 'RESUME', onClick: () => { state.mode = 'playing'; hud.showScreen(null); } },
          { label: 'RESTART STORY', onClick: () => startRun(true) },
        ]);
      } else if (state.mode === 'paused') {
        state.mode = 'playing';
        hud.showScreen(null);
      }
    }
    if (e.code === 'Enter' && state.mode === 'title') startRun(!loadGame() ? true : false);
  });

  return {
    start() { requestAnimationFrame(frame); },
    stageDemo,
    getState() { return state; },
  };
}
