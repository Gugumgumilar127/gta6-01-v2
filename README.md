# Palmaris Heat

A tiny open-world crime game for the browser, built from scratch in vanilla
JavaScript — no engine, no libraries, no assets. One sun-soaked coastal
city, one wheelman, one debt.

**Marco Reyes** owes fixer **Dona Vidal** ("La Viuda") **$14,000**. Five
jobs pay it off exactly: steal a gold Cobra GT, run a hot package across
town, lose a three-star heat, stop an armored convoy, and rob Banco
Palmaris itself. Between jobs, taxi fares and Vidal's Garage (a $250
repaint erases paint, damage and police attention) keep the wheels turning.

## Play

Serve the `game/` folder with any static file server and open
`game/index.html`, for example:

```
npx serve game
# or
python3 -m http.server -d game 8080
```

| Input | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Run |
| E | Enter / exit a car (steal it) |
| Mouse + click | Aim / shoot (on foot) |
| F | Shove / punch |
| Space | Handbrake |
| R (hold, at the garage) | Repaint & clear wanted level — $250 |
| Esc / P | Pause |

## What's in the city

- A deterministic 72×72-tile city generated from one seed: five districts
  (Downtown, Old Town, Port Harbor, Palm Beach, the Marina), avenues with
  lane traffic, container yards, parks, parking lots and a beach.
- Traffic AI that follows the avenues and brakes for trouble; pedestrians
  who stroll, sidestep and flee; a wanted system from one to five stars
  with Interceptor pursuit, a bust meter, and heat that bleeds away while
  you stay unseen.
- Cars you can steal, wreck, shoot out and repaint: sedans, coupes, a
  Cobra GT, taxis (with working fares), vans, trucks, an armored convoy
  van and police Interceptors.
- A five-mission story with phone briefings from Vidal, timed deliveries,
  an evasion job, a convoy heist and a bank robbery finale — plus
  repeatable taxi work, a garage, hospital/PD respawns, and a
  `localStorage` save with Continue.
- Fully synthesized WebAudio: engine, skids, sirens, gunfire, phone rings
  and a lazy tropical chord loop. No audio files.

## Structure

- `main.ts` — packaging entrypoint: copies `game/` + `screenshots/` to the
  output directory and writes `dossier.json` via `vendor/makefun-game.ts`.
- `game/index.html` — the page, HUD layout and all styling.
- `game/src/config.js` — constants, palettes, wanted tuning.
- `game/src/random.js` — seeded RNG (the city is reproducible).
- `game/src/city.js` — city generation, collision, the static map render.
- `game/src/audio.js` — every sound, synthesized live.
- `game/src/input.js` — keyboard/mouse state.
- `game/src/vehicles.js` — car catalogue, traffic AI, driving physics.
- `game/src/pedestrians.js` — sidewalk life and panic.
- `game/src/police.js` — wanted heat and pursuit driving.
- `game/src/combat.js` — bullets, fists, particles.
- `game/src/missions.js` — the five-job story director and taxi fares.
- `game/src/render.js` — camera, world drawing, minimap.
- `game/src/hud.js` — cash, stars, objectives, banners, screens.
- `game/src/game.js` — the orchestrator: world state, crime bookkeeping,
  busts, saves, screens.
- `game/src/main.js` — boot (plus `?demo=` staging used for screenshots).

MIT licensed.
