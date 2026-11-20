// main.js — one job: boot the game. Find the canvas, build the world,
// optionally stage a demo scene (used for screenshots: ?demo=chase,
// ?demo=mission, ?demo=beach), and start the frame loop.

import { createGame } from './game.js';

const canvas = document.getElementById('game');
const game = createGame(canvas);

const demo = new URLSearchParams(window.location.search).get('demo');
if (demo) game.stageDemo(demo);

game.start();
