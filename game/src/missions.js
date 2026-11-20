// missions.js — one job: direct the story of Palmaris Heat.
// Marco Reyes owes Dona Vidal $14,000. Five jobs pay it off exactly; taxi
// fares cover whatever he wastes on garage paint. This file owns the
// mission state machines, the objectives the HUD and minimap show, and the
// taxi side-work. game.js owns the world; the director only talks to it
// through the host interface below.

import { createCar } from './vehicles.js';

export const MISSION_TITLES = [
  'Hot Wheels',
  'Special Delivery',
  'Lose the Heat',
  'Armored Convoy',
  'The Big Score',
];

export const MISSION_PAY = [1200, 1800, 1600, 3400, 6000];

const INTROS = [
  [
    ['Dona Vidal', 'Marco. You owe me fourteen grand and my patience is thinner than your wallet.'],
    ['Dona Vidal', 'A gold Cobra GT sits at Palm Beach with my name on it. Bring it to my garage. Quietly.'],
  ],
  [
    ['Dona Vidal', 'Good boy. Now a package waits at the Marina Pickup. The boys in blue know the car it travels in.'],
    ['Dona Vidal', 'Azure Tower, downtown. Fast, Marco. Packages and patience both expire.'],
  ],
  [
    ['Dona Vidal', 'The last drop annoyed some people. Half the force is looking for you.'],
    ['Dona Vidal', 'Disappear. Break their line of sight, let the heat die, then come home to the safehouse.'],
  ],
  [
    ['Dona Vidal', 'Banco Palmaris moves cash in an armored van today. Stop it, take the bags, bank them at my garage.'],
    ['Dona Vidal', 'The van is tough, not immortal. Ram it, shoot it, persuade it.'],
  ],
  [
    ['Dona Vidal', 'One last job, Marco, and the debt dies. Banco Palmaris itself.'],
    ['Dona Vidal', 'Hold your nerve inside, then run for the Marina Escape. Boats ask no questions.'],
  ],
];

export function createDirector(host) {
  const director = {
    stage: 0, // 0..4 current mission, 5 = story complete
    phase: 'idle', // idle | active | between | done
    objective: null,
    timer: null,
    step: 0,
    stepData: {},
    fare: null,
    betweenTimer: 0,
    holdProgress: 0,

    startStory(fromStage) {
      this.stage = fromStage || 0;
      if (this.stage >= 5) {
        this.phase = 'done';
        this.objective = null;
        return;
      }
      this.beginStage(this.stage);
    },

    beginStage(stage) {
      this.cleanupMissionEntities();
      this.step = 0;
      this.stepData = {};
      this.timer = null;
      this.holdProgress = 0;
      this.phase = 'active';
      host.phone(INTROS[stage]);
      if (stage === 0) this.setupHotWheels();
      if (stage === 1) this.setupDelivery();
      if (stage === 2) this.setupLoseHeat();
      if (stage === 3) this.setupConvoy();
      if (stage === 4) this.setupBigScore();
    },

    cleanupMissionEntities() {
      const sd = this.stepData;
      for (const key of ['targetCar', 'convoyVan']) {
        const car = sd[key];
        if (car) {
          const i = host.cars.indexOf(car);
          if (i >= 0) host.cars.splice(i, 1);
        }
      }
      this.stepData = {};
    },

    completeStage() {
      const pay = MISSION_PAY[this.stage];
      host.addCash(pay);
      if (host.onJobComplete) host.onJobComplete();
      host.banner('JOB DONE', MISSION_TITLES[this.stage] + '  ·  +$' + pay.toLocaleString('en-US'), '#7dd069');
      host.playSound('cash');
      this.cleanupMissionEntities();
      this.stage++;
      this.objective = null;
      this.timer = null;
      if (this.stage >= 5) {
        this.phase = 'done';
        host.onStoryComplete();
      } else {
        this.phase = 'between';
        this.betweenTimer = 7;
      }
      host.saveProgress();
    },

    failStage(reason) {
      if (this.phase !== 'active') return;
      host.banner('JOB BLOWN', reason, '#e5533d');
      this.cleanupMissionEntities();
      this.objective = null;
      this.timer = null;
      this.phase = 'between';
      this.betweenTimer = 4;
    },

    onPlayerDown() {
      // Busted or wasted mid-job: the job collapses, the debt remains.
      if (this.fare) this.cancelFare();
      if (this.phase === 'active') this.failStage('The job fell apart. Vidal will call again.');
    },

    // --- the five jobs -----------------------------------------------------

    setupHotWheels() {
      const spot = host.findBeachParkingSpot();
      const car = createCar('sport', spot.x, spot.y, spot.angle, '#e8b93c', 'mission');
      host.cars.push(car);
      this.stepData.targetCar = car;
      this.objective = {
        get x() { return car.x; },
        get y() { return car.y; },
        text: 'Steal the gold Cobra GT at Palm Beach',
        sub: 'Press E next to it, then deliver it to Vidal\'s Garage',
        radius: 60,
        kind: 'target',
      };
    },

    setupDelivery() {
      const spot = host.city.locations.packageSpot;
      this.objective = {
        x: spot.x, y: spot.y,
        text: 'Pick up the package at the Marina',
        sub: 'Drive into the marker',
        radius: 58,
        kind: 'pickup',
      };
    },

    setupLoseHeat() {
      host.setHeatAtLeast(3);
      host.banner('LOSE THE HEAT', 'Break police line of sight and let the stars fade', '#e8b93c');
      this.objective = {
        x: null, y: null,
        text: 'Lose the heat',
        sub: 'Stay out of sight until the stars are gone',
        radius: 0,
        kind: 'evade',
      };
    },

    setupConvoy() {
      const start = host.city.locations.bank;
      const van = createCar('armored', start.x + 140, start.y + 90, 0, '#4c565c', 'mission');
      van.health = 300;
      van.maxHealth = 300;
      van.cruise = 118;
      host.cars.push(van);
      this.stepData.convoyVan = van;
      this.objective = {
        get x() { return van.x; },
        get y() { return van.y; },
        text: 'Stop the armored van',
        sub: 'Ram it or shoot it until it gives up',
        radius: 60,
        kind: 'target',
      };
    },

    setupBigScore() {
      const bank = host.city.locations.bank;
      this.objective = {
        x: bank.x, y: bank.y,
        text: 'Case Banco Palmaris',
        sub: 'Drive to the bank',
        radius: 72,
        kind: 'pickup',
      };
    },

    // --- per-frame direction -------------------------------------------------

    update(dt) {
      if (this.phase === 'between') {
        this.betweenTimer -= dt;
        this.updateFare(dt);
        if (this.betweenTimer <= 0 && !this.fare) {
          this.beginStage(this.stage);
        }
        return;
      }
      if (this.phase !== 'active') return;

      if (this.timer !== null) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.failStage('Too slow. The window closed.');
          return;
        }
      }

      const player = host.player;
      const px = player.car ? player.car.x : player.x;
      const py = player.car ? player.car.y : player.y;

      if (this.stage === 0) this.updateHotWheels(px, py);
      if (this.stage === 1) this.updateDelivery(px, py);
      if (this.stage === 2) this.updateLoseHeat(px, py);
      if (this.stage === 3) this.updateConvoy(dt, px, py);
      if (this.stage === 4) this.updateBigScore(dt, px, py);
    },

    reached(x, y, radius) {
      const o = this.objective;
      if (!o || o.x === null) return false;
      return Math.hypot(o.x - x, o.y - y) < radius;
    },

    updateHotWheels(px, py) {
      const car = this.stepData.targetCar;
      if (this.step === 0) {
        if (host.player.car === car) {
          this.step = 1;
          host.wanted.addCrime(38);
          host.banner('HOT WHEELS', 'The owner noticed. Get it to the garage!', '#e8b93c');
          const g = host.city.locations.garage;
          this.objective = {
            x: g.x, y: g.y,
            text: 'Deliver the Cobra to Vidal\'s Garage',
            sub: 'Harbor district, south-east',
            radius: 86,
            kind: 'dropoff',
          };
        }
      } else if (this.reached(px, py, 86)) {
        this.completeStage();
      }
    },

    updateDelivery(px, py) {
      if (this.step === 0) {
        if (this.reached(px, py, 58)) {
          this.step = 1;
          this.timer = 150;
          host.wanted.addCrime(38);
          host.playSound('pickup');
          host.banner('PACKAGE ON BOARD', 'Azure Tower. The clock is running.', '#e8b93c');
          const t = host.city.locations.towerDrop;
          this.objective = {
            x: t.x, y: t.y,
            text: 'Deliver to Azure Tower',
            sub: 'Before the timer runs out',
            radius: 72,
            kind: 'dropoff',
          };
        }
      } else {
        if (this.objective) {
          this.objective.sub = 'Time left: ' + Math.ceil(this.timer) + 's';
        }
        if (this.reached(px, py, 72)) this.completeStage();
      }
    },

    updateLoseHeat(px, py) {
      if (this.step === 0) {
        if (host.wanted.stars === 0) {
          this.step = 1;
          const s = host.city.locations.safehouse;
          this.objective = {
            x: s.x, y: s.y,
            text: 'Reach the Old Town safehouse',
            sub: 'Lay low. You are almost clean.',
            radius: 74,
            kind: 'dropoff',
          };
          host.banner('HEAT IS OFF', 'Now get to the safehouse', '#7dd069');
        }
      } else if (this.reached(px, py, 74)) {
        this.completeStage();
      }
    },

    updateConvoy(dt, px, py) {
      const van = this.stepData.convoyVan;
      if (!van) return;
      if (this.step === 0) {
        if (van.health <= 90 || van.dead) {
          van.dead = false;
          van.health = Math.max(van.health, 40);
          van.parked = true;
          van.speed = 0;
          this.stepData.vanStopped = true;
          this.step = 1;
          this.objective = {
            get x() { return van.x; },
            get y() { return van.y; },
            text: 'Grab the cash from the van',
            sub: 'On foot, get close to the back doors',
            radius: 48,
            kind: 'pickup',
          };
          host.banner('VAN STOPPED', 'Grab the cash bags — on foot!', '#e8b93c');
        }
      } else if (this.step === 1) {
        if (!host.player.car && Math.hypot(van.x - px, van.y - py) < 48) {
          this.step = 2;
          host.wanted.addCrime(85);
          host.playSound('pickup');
          const g = host.city.locations.garage;
          this.objective = {
            x: g.x, y: g.y,
            text: 'Bank the cash at Vidal\'s Garage',
            sub: 'Every cop in Palmaris is awake now',
            radius: 86,
            kind: 'dropoff',
          };
          host.banner('CASH IN HAND', 'Bank it at the garage. Run!', '#e5533d');
        }
      } else if (this.reached(px, py, 86)) {
        this.completeStage();
      }
      void dt;
    },

    updateBigScore(dt, px, py) {
      if (this.step === 0) {
        if (this.reached(px, py, 72)) {
          this.step = 1;
          this.holdProgress = 0;
          this.objective = {
            x: this.objective.x, y: this.objective.y,
            text: 'Rob Banco Palmaris',
            sub: 'Stay at the bank… 0%',
            radius: 72,
            kind: 'hold',
          };
          host.banner('ROBBERY IN PROGRESS', 'Hold your nerve at the bank', '#e8b93c');
        }
      } else if (this.step === 1) {
        if (this.reached(px, py, 78)) {
          this.holdProgress += dt / 8;
          this.objective.sub = 'Stay at the bank… ' + Math.floor(this.holdProgress * 100) + '%';
          if (this.holdProgress >= 1) {
            this.step = 2;
            host.setHeatAtLeast(4);
            host.playSound('cash');
            const m = host.city.locations.marinaEscape;
            this.objective = {
              x: m.x, y: m.y,
              text: 'Reach the Marina Escape',
              sub: 'The boat is waiting. Do not stop.',
              radius: 92,
              kind: 'escape',
            };
            host.banner('THE BIG SCORE', 'Four stars. Marina Escape. GO.', '#e5533d');
          }
        } else {
          this.holdProgress = Math.max(0, this.holdProgress - dt / 5);
          this.objective.sub = 'Get back to the bank! ' + Math.floor(this.holdProgress * 100) + '%';
        }
      } else if (this.reached(px, py, 92)) {
        this.completeStage();
      }
    },

    // --- taxi side-work ------------------------------------------------------

    maybeStartFare() {
      if (this.fare || this.phase !== 'between') return;
      const player = host.player;
      if (!player.car || player.car.type !== 'taxi') return;
      const spot = host.findFarePickup();
      if (!spot) return;
      this.fare = {
        phase: 'pickup',
        x: spot.x, y: spot.y,
        dest: null,
        timeLeft: 0,
        distance: 0,
      };
      host.toast('FARE: passenger waiting — follow the blue marker');
      host.playSound('ring');
    },

    cancelFare() {
      this.fare = null;
    },

    updateFare(dt) {
      const fare = this.fare;
      if (!fare) return;
      const player = host.player;
      if (!player.car) {
        this.cancelFare();
        host.toast('Fare cancelled — you left the cab');
        return;
      }
      const car = player.car;
      if (fare.phase === 'pickup') {
        if (Math.hypot(car.x - fare.x, car.y - fare.y) < 46 && Math.abs(car.speed) < 12) {
          const dest = host.findFareDestination(car);
          fare.phase = 'dropoff';
          fare.dest = dest;
          fare.distance = Math.hypot(dest.x - car.x, dest.y - car.y);
          fare.timeLeft = fare.distance / 7.5 + 25;
          host.playSound('pickup');
          host.toast('FARE: passenger in — ' + dest.label);
        }
      } else {
        fare.timeLeft -= dt;
        if (Math.hypot(car.x - fare.dest.x, car.y - fare.dest.y) < 52 && Math.abs(car.speed) < 12) {
          let pay = Math.round(35 + fare.distance / 9);
          if (fare.timeLeft > 0 && car.health > 65) {
            pay = Math.round(pay * 1.3);
            host.toast('FARE COMPLETE: $' + pay + ' (with tip!)');
          } else {
            host.toast('FARE COMPLETE: $' + pay);
          }
          host.addCash(pay);
          if (host.onFareComplete) host.onFareComplete(pay);
          host.playSound('cash');
          this.fare = null;
        } else if (fare.timeLeft < -30) {
          host.toast('Fare walked away — too slow');
          this.fare = null;
        }
      }
      void dt;
    },

    // What the HUD/minimap should point at right now.
    activeObjective() {
      if (this.fare) {
        if (this.fare.phase === 'pickup') {
          return { x: this.fare.x, y: this.fare.y, text: 'Pick up your fare', sub: 'Stop next to the passenger', radius: 46, kind: 'fare' };
        }
        return { x: this.fare.dest.x, y: this.fare.dest.y, text: 'Drop off your fare', sub: this.fare.dest.label, radius: 52, kind: 'fare' };
      }
      return this.objective;
    },
  };

  return director;
}
