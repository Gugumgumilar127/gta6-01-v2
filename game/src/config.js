// config.js — one job: every shared constant of Palmaris Heat.
// Tuning, sizes, colours and names live here so the other modules stay
// focused on behaviour. Nothing in this file touches the DOM or the canvas.

export const TILE = 44; // pixels per city tile
export const CITY_COLS = 72;
export const CITY_ROWS = 72;
export const WORLD_W = CITY_COLS * TILE; // 3168 px
export const WORLD_H = CITY_ROWS * TILE;

// Avenues are 3 tiles wide; their centre tiles sit on these rows/columns.
export const AVENUES = [6, 17, 28, 39, 50, 61];
export const WATER_TILE_X = 67; // tiles at x >= 67 are open sea
export const BEACH_TILE_X = 65; // tiles 65..66 are sand

export const DISTRICTS = {
  downtown: { name: 'Downtown', ground: '#8d8d94', walk: '#a7a7ae' },
  oldtown: { name: 'Old Town', ground: '#9a8d7c', walk: '#b3a68f' },
  harbor: { name: 'Port Harbor', ground: '#7e8288', walk: '#989ca2' },
  beach: { name: 'Palm Beach', ground: '#b8a888', walk: '#c9bb9c' },
  marina: { name: 'Marina', ground: '#8f979e', walk: '#aab2b8' },
};

// Paint palettes per district: [wall, roof] pairs the city generator picks from.
export const BUILDING_PALETTES = {
  downtown: [
    ['#5d6a7d', '#39424f'], ['#6b7686', '#434c59'], ['#54606e', '#333c47'],
    ['#707a68', '#49503f'], ['#7d6a5d', '#4f4239'],
  ],
  oldtown: [
    ['#b08d68', '#7d5f43'], ['#c2a075', '#8a6a48'], ['#a87f5f', '#75553c'],
    ['#bd9873', '#86664a'],
  ],
  harbor: [
    ['#7a7f6e', '#565b4e'], ['#6e7a80', '#4c565c'], ['#857d6b', '#5f594c'],
  ],
  beach: [
    ['#d9c9a8', '#a08c64'], ['#e3d3ae', '#ab9870'], ['#cdbb98', '#97835e'],
    ['#e8dcc0', '#b3a077'],
  ],
  marina: [
    ['#9fb4bd', '#6d838e'], ['#aebfc6', '#7a8f99'], ['#93a9b5', '#647985'],
  ],
};

export const CAR_COLORS = [
  '#c94f42', '#3f6fb5', '#e0a83c', '#58a05c', '#e8e6df', '#2f3237',
  '#7a4fa3', '#d97b29', '#3fa8a0', '#b03a6b', '#8c97a3', '#f2f0e6',
];

export const PLAYER = {
  radius: 11,
  walkSpeed: 128,
  runSpeed: 218,
  maxHealth: 100,
  punchRange: 30,
  punchDamage: 34,
  enterCarRange: 46,
};

export const WANTED = {
  // crime points needed to reach each star (index = stars)
  thresholds: [0, 30, 80, 160, 280, 450],
  decayPerSecond: 2.2, // heat lost while unseen
  hideSecondsToDrop: 6, // unseen seconds before heat starts falling fast
  policeByStars: [0, 2, 3, 4, 6, 8],
};

export const SAVE_KEY = 'palmaris-heat-save-v1';

export const STORY = {
  hero: 'Marco Reyes',
  fixer: 'Dona Vidal',
  debt: 14000,
  city: 'Palmaris',
};
