// city.js — one job: generate the city of Palmaris and answer questions
// about it (where are the roads, what district is this, does a circle hit a
// building). The layout is fully deterministic: same seed, same streets.
// It also paints the static layer (ground, roads, rooftops, palms) once onto
// an offscreen canvas so the frame renderer only draws what moves.

import { createRng, CITY_SEED } from './random.js';
import {
  TILE, CITY_COLS, CITY_ROWS, AVENUES, WATER_TILE_X, BEACH_TILE_X,
  BUILDING_PALETTES,
} from './config.js';

const WORLD_W = CITY_COLS * TILE;
const WORLD_H = CITY_ROWS * TILE;

// Tile spans covered by avenues (3 tiles each, centred on AVENUES).
const ROAD_SPANS = AVENUES.map((a) => [a - 1, a + 1]);

function tileIsRoad(tx, ty) {
  if (tx >= WATER_TILE_X) return false;
  for (const [lo, hi] of ROAD_SPANS) {
    if (tx >= lo && tx <= hi) return true;
    if (ty >= lo && ty <= hi) return true;
  }
  return false;
}

export function districtKeyAt(tx, ty) {
  if (ty >= 48) return 'harbor';
  if (tx >= 45 && ty <= 24) return 'marina';
  if (tx >= 45) return 'beach';
  if (tx >= 22 && tx <= 44 && ty >= 20) return 'downtown';
  return 'oldtown';
}

// Block tile ranges between the avenue spans (and the map edges).
function blockRanges() {
  const edges = [0];
  for (const [lo, hi] of ROAD_SPANS) {
    edges.push(lo, hi + 1);
  }
  edges.push(BEACH_TILE_X);
  const ranges = [];
  for (let i = 0; i < edges.length; i += 2) {
    const start = edges[i];
    const end = edges[i + 1] - 1;
    if (end >= start) ranges.push([start, end]);
  }
  return ranges;
}

export function generateCity() {
  const rng = createRng(CITY_SEED);
  const buildings = [];
  const containers = [];
  const palms = [];
  const lamps = [];
  const parks = [];
  const parkingSpots = [];
  const sidewalkPoints = [];

  const ranges = blockRanges();

  for (const [bx0, bx1] of ranges) {
    for (const [by0, by1] of ranges) {
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      const district = districtKeyAt(Math.floor(cx), Math.floor(cy));
      const x0 = bx0 * TILE;
      const y0 = by0 * TILE;
      const w = (bx1 - bx0 + 1) * TILE;
      const h = (by1 - by0 + 1) * TILE;
      const roll = rng.next();

      // Sidewalk sample points around the block ring, for pedestrians.
      for (let tx = bx0; tx <= bx1; tx += 2) {
        sidewalkPoints.push({ x: tx * TILE + TILE / 2, y: by0 * TILE + 10 });
        sidewalkPoints.push({ x: tx * TILE + TILE / 2, y: (by1 + 1) * TILE - 10 });
      }
      for (let ty = by0 + 1; ty < by1; ty += 2) {
        sidewalkPoints.push({ x: bx0 * TILE + 10, y: ty * TILE + TILE / 2 });
        sidewalkPoints.push({ x: (bx1 + 1) * TILE - 10, y: ty * TILE + TILE / 2 });
      }

      if (district === 'harbor' && roll < 0.34) {
        // Container yard: rows of shipping containers, all colliders.
        const cols = Math.max(2, Math.floor(w / 120));
        const rows = Math.max(2, Math.floor(h / 60));
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            if (rng.chance(0.24)) continue;
            containers.push({
              x: x0 + 26 + i * 118,
              y: y0 + 26 + j * 58,
              w: 96,
              h: 40,
              color: rng.pick(['#b3543f', '#3f6fb5', '#58a05c', '#c9862f', '#707a86']),
            });
          }
        }
        continue;
      }

      if (roll < 0.13) {
        // Park: grass, palms, a cross path. No buildings.
        parks.push({ x: x0, y: y0, w, h, district });
        const count = rng.int(4, 9);
        for (let i = 0; i < count; i++) {
          palms.push({
            x: x0 + rng.range(24, w - 24),
            y: y0 + rng.range(24, h - 24),
            s: rng.range(0.8, 1.25),
            lean: rng.range(0, Math.PI * 2),
          });
        }
        continue;
      }

      if (roll < 0.21) {
        // Parking lot: painted stalls become parked-car spawn spots.
        const spots = Math.floor(w / 52);
        for (let i = 0; i < spots; i++) {
          parkingSpots.push({
            x: x0 + 30 + i * 52,
            y: y0 + 34,
            angle: Math.PI / 2,
          });
          parkingSpots.push({
            x: x0 + 30 + i * 52,
            y: y0 + h - 34,
            angle: -Math.PI / 2,
          });
        }
        parks.push({ x: x0, y: y0, w, h, district, parking: true });
        continue;
      }

      // Buildings: subdivide the block interior (inside the sidewalk ring).
      const inset = TILE * 0.9;
      const ix = x0 + inset;
      const iy = y0 + inset;
      const iw = w - inset * 2;
      const ih = h - inset * 2;
      const split = rng.pick([1, 2, 2, 4]);
      const palette = BUILDING_PALETTES[district];
      const cells = [];
      if (split === 1) cells.push([ix, iy, iw, ih]);
      if (split === 2) {
        if (rng.chance(0.5)) {
          cells.push([ix, iy, iw / 2 - 8, ih], [ix + iw / 2 + 8, iy, iw / 2 - 8, ih]);
        } else {
          cells.push([ix, iy, iw, ih / 2 - 8], [ix, iy + ih / 2 + 8, iw, ih / 2 - 8]);
        }
      }
      if (split === 4) {
        cells.push(
          [ix, iy, iw / 2 - 8, ih / 2 - 8],
          [ix + iw / 2 + 8, iy, iw / 2 - 8, ih / 2 - 8],
          [ix, iy + ih / 2 + 8, iw / 2 - 8, ih / 2 - 8],
          [ix + iw / 2 + 8, iy + ih / 2 + 8, iw / 2 - 8, ih / 2 - 8],
        );
      }
      for (const [bx, by, bw, bh] of cells) {
        const [wall, roof] = rng.pick(palette);
        const height =
          district === 'downtown' ? rng.range(22, 58)
            : district === 'harbor' ? rng.range(6, 14)
              : rng.range(8, 26);
        buildings.push({
          x: bx, y: by, w: bw, h: bh, wall, roof, height, district,
          kind: district === 'harbor' ? 'warehouse' : 'building',
        });
      }

      // A few palms on the sidewalks of the sunny districts.
      if ((district === 'beach' || district === 'marina') && rng.chance(0.7)) {
        palms.push({
          x: x0 + rng.range(8, w - 8),
          y: y0 + 8,
          s: rng.range(0.85, 1.2),
          lean: rng.range(0, Math.PI * 2),
        });
      }
    }
  }

  // Beach palms along the sand.
  for (let ty = 2; ty < CITY_ROWS - 2; ty += 2) {
    if (rng.chance(0.75)) {
      palms.push({
        x: (BEACH_TILE_X + rng.range(0.2, 1.6)) * TILE,
        y: ty * TILE + rng.range(0, TILE),
        s: rng.range(0.9, 1.35),
        lean: rng.range(0, Math.PI * 2),
      });
    }
  }

  // Street lamps along the avenues.
  for (const a of AVENUES) {
    for (let t = 2; t < CITY_ROWS - 1; t += 4) {
      lamps.push({ x: (a - 1) * TILE + 4, y: t * TILE });
      lamps.push({ x: t * TILE, y: (a - 1) * TILE + 4 });
    }
  }

  const colliders = buildings.concat(containers);
  // Spatial hash (4-tile cells) so collision checks stay cheap.
  const cellSize = TILE * 4;
  const grid = new Map();
  colliders.forEach((c, i) => {
    const gx0 = Math.floor(c.x / cellSize);
    const gy0 = Math.floor(c.y / cellSize);
    const gx1 = Math.floor((c.x + c.w) / cellSize);
    const gy1 = Math.floor((c.y + c.h) / cellSize);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const key = gx + ',' + gy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
    }
  });

  const at = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  const locations = {
    garage: { ...at(61, 61), label: "Vidal's Garage" },
    safehouse: { ...at(17, 28), label: 'Safehouse' },
    policeStation: { ...at(39, 28), label: 'Palmaris PD' },
    hospital: { ...at(28, 39), label: 'St. Solana Hospital' },
    bank: { ...at(39, 39), label: 'Banco Palmaris' },
    marinaEscape: { ...at(61, 6), label: 'Marina Escape' },
    packageSpot: { ...at(50, 17), label: 'Marina Pickup' },
    towerDrop: { ...at(39, 50), label: 'Azure Tower' },
    taxiDepot: { ...at(50, 39), label: 'Taxi Depot' },
    start: { ...at(17, 39), label: 'Old Town' },
  };

  const city = {
    w: WORLD_W,
    h: WORLD_H,
    buildings,
    containers,
    palms,
    lamps,
    parks,
    parkingSpots,
    sidewalkPoints,
    colliders,
    locations,
    roadsX: AVENUES.map((a) => a * TILE + TILE / 2),
    roadsY: AVENUES.map((a) => a * TILE + TILE / 2),

    districtAt(x, y) {
      return districtKeyAt(Math.floor(x / TILE), Math.floor(y / TILE));
    },
    isWater(x, y) {
      return x >= WATER_TILE_X * TILE;
    },
    isRoad(x, y) {
      return tileIsRoad(Math.floor(x / TILE), Math.floor(y / TILE));
    },
    collides(x, y, r) {
      const key = Math.floor(x / cellSize) + ',' + Math.floor(y / cellSize);
      const list = grid.get(key);
      if (!list) return false;
      for (const i of list) {
        const c = colliders[i];
        const nx = Math.max(c.x, Math.min(x, c.x + c.w));
        const ny = Math.max(c.y, Math.min(y, c.y + c.h));
        const dx = x - nx;
        const dy = y - ny;
        if (dx * dx + dy * dy < r * r) return true;
      }
      return false;
    },
    // Push a circle out of every collider it overlaps; returns corrected x,y.
    pushOut(x, y, r) {
      const key = Math.floor(x / cellSize) + ',' + Math.floor(y / cellSize);
      const list = grid.get(key);
      if (!list) return { x, y };
      for (const i of list) {
        const c = colliders[i];
        const nx = Math.max(c.x, Math.min(x, c.x + c.w));
        const ny = Math.max(c.y, Math.min(y, c.y + c.h));
        let dx = x - nx;
        let dy = y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 === 0) {
          x = nx + r;
          continue;
        }
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      }
      return { x, y };
    },
  };

  city.staticCanvas = renderStaticCity(city);
  return city;
}

function renderStaticCity(city) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const ctx = canvas.getContext('2d');
  const rng = createRng(CITY_SEED + 77);

  // Sea.
  const sea = ctx.createLinearGradient(WATER_TILE_X * TILE, 0, WORLD_W, 0);
  sea.addColorStop(0, '#2e7d9b');
  sea.addColorStop(1, '#1d5f7d');
  ctx.fillStyle = sea;
  ctx.fillRect(WATER_TILE_X * TILE, 0, WORLD_W - WATER_TILE_X * TILE, WORLD_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 130; i++) {
    const x = rng.range(WATER_TILE_X * TILE + 16, WORLD_W - 60);
    const y = rng.range(0, WORLD_H);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(18, 42), y);
    ctx.stroke();
  }
  // Sand.
  ctx.fillStyle = '#e3d09b';
  ctx.fillRect(BEACH_TILE_X * TILE, 0, (WATER_TILE_X - BEACH_TILE_X) * TILE, WORLD_H);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(WATER_TILE_X * TILE - 3, 0, 3, WORLD_H);

  // Land base + block grounds.
  ctx.fillStyle = '#8d8d94';
  ctx.fillRect(0, 0, BEACH_TILE_X * TILE, WORLD_H);
  const ranges = blockRanges();
  for (const [bx0, bx1] of ranges) {
    for (const [by0, by1] of ranges) {
      const district = districtKeyAt(Math.floor((bx0 + bx1) / 2), Math.floor((by0 + by1) / 2));
      const ground = {
        downtown: '#83838b', oldtown: '#94866f', harbor: '#74787e',
        beach: '#ac9c7c', marina: '#828b91',
      }[district];
      ctx.fillStyle = ground;
      ctx.fillRect(bx0 * TILE, by0 * TILE, (bx1 - bx0 + 1) * TILE, (by1 - by0 + 1) * TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      const inset = TILE * 0.45;
      ctx.fillRect(
        bx0 * TILE + inset, by0 * TILE + inset,
        (bx1 - bx0 + 1) * TILE - inset * 2, (by1 - by0 + 1) * TILE - inset * 2,
      );
    }
  }

  // Parks and parking lots.
  for (const p of city.parks) {
    if (p.parking) {
      ctx.fillStyle = '#4a4d52';
      ctx.fillRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      for (let x = p.x + 30; x < p.x + p.w - 20; x += 52) {
        ctx.beginPath();
        ctx.moveTo(x, p.y + 14);
        ctx.lineTo(x, p.y + 58);
        ctx.moveTo(x, p.y + p.h - 58);
        ctx.lineTo(x, p.y + p.h - 14);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#5d9e52';
      ctx.fillRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
      ctx.fillStyle = '#6fae62';
      ctx.fillRect(p.x + p.w / 2 - 10, p.y + 8, 20, p.h - 16);
      ctx.fillRect(p.x + 8, p.y + p.h / 2 - 10, p.w - 16, 20);
    }
  }

  // Roads: asphalt strips, then markings.
  ctx.fillStyle = '#3a3d42';
  for (const a of AVENUES) {
    ctx.fillRect((a - 1) * TILE, 0, TILE * 3, WORLD_H);
    ctx.fillRect(0, (a - 1) * TILE, BEACH_TILE_X * TILE, TILE * 3);
  }
  ctx.strokeStyle = '#e8c33c';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (const a of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(a * TILE + TILE / 2, 0);
    ctx.lineTo(a * TILE + TILE / 2, WORLD_H);
    ctx.moveTo(0, a * TILE + TILE / 2);
    ctx.lineTo(BEACH_TILE_X * TILE, a * TILE + TILE / 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const ax of AVENUES) {
    for (const ay of AVENUES) {
      const cx = ax * TILE;
      const cy = ay * TILE;
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(cx - TILE + 6 + i * 12, cy - TILE - 8, 7, 14);
        ctx.fillRect(cx - TILE + 6 + i * 12, cy + TILE * 2 - 6, 7, 14);
        ctx.fillRect(cx - TILE - 8, cy - TILE + 6 + i * 12, 14, 7);
        ctx.fillRect(cx + TILE * 2 - 6, cy - TILE + 6 + i * 12, 14, 7);
      }
    }
  }

  // Containers.
  for (const c of city.containers) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(c.x + 5, c.y + 6, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2;
    for (let x = c.x + 10; x < c.x + c.w - 4; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, c.y + 3);
      ctx.lineTo(x, c.y + c.h - 3);
      ctx.stroke();
    }
  }

  // Buildings: shadow, walls, roof, rooftop clutter.
  for (const b of city.buildings) {
    const sh = b.height * 0.42;
    ctx.fillStyle = 'rgba(20,16,10,0.28)';
    ctx.fillRect(b.x + sh, b.y + sh, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    const inset = Math.min(10, b.w * 0.12, b.h * 0.12);
    ctx.fillRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    const units = Math.floor((b.w * b.h) / 26000);
    for (let i = 0; i < units; i++) {
      const ux = b.x + inset + 6 + rng.range(0, Math.max(1, b.w - inset * 2 - 26));
      const uy = b.y + inset + 6 + rng.range(0, Math.max(1, b.h - inset * 2 - 20));
      ctx.fillRect(ux, uy, 18, 13);
    }
  }

  // Palms.
  for (const p of city.palms) drawPalm(ctx, p);

  // Lamps: pole dot + warm pool of light baked into the day scene.
  for (const l of city.lamps) {
    ctx.fillStyle = 'rgba(255,214,120,0.10)';
    ctx.beginPath();
    ctx.arc(l.x, l.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#565a60';
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
  }

  return canvas;
}

export function drawPalm(ctx, p) {
  ctx.fillStyle = 'rgba(20,16,10,0.20)';
  ctx.beginPath();
  ctx.ellipse(p.x + 7, p.y + 9, 13 * p.s, 6 * p.s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a5c38';
  ctx.lineWidth = 4 * p.s;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.quadraticCurveTo(p.x + 3, p.y - 6, p.x + 5, p.y - 11);
  ctx.stroke();
  ctx.strokeStyle = '#3e8e41';
  ctx.lineWidth = 3 * p.s;
  for (let i = 0; i < 7; i++) {
    const a = p.lean + (i / 7) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(p.x + 5, p.y - 11);
    ctx.quadraticCurveTo(
      p.x + 5 + Math.cos(a) * 13 * p.s,
      p.y - 11 + Math.sin(a) * 8 * p.s - 3,
      p.x + 5 + Math.cos(a) * 21 * p.s,
      p.y - 11 + Math.sin(a) * 13 * p.s + 4,
    );
    ctx.stroke();
  }
}
