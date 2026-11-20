// Palmaris Heat — packaging entrypoint.
// Copies the finished browser game and its screenshots into the output
// directory and writes the dossier that describes them. The game itself
// lives under game/ and runs from game/index.html in any modern browser.
// Output layout: game/ is mirrored verbatim into the output folder, while screenshots/ is copied over only when that folder is present on disk.
// The dossier.json in the output comes from buildDossier in vendor/makefun-game.ts, driven by the size and count limits configured in this file below.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
// Baris di bawah ini cuma penanda selesai buat catatan build, isinya tidak mengubah keluaran apa pun.
console.log(`Palmaris Heat selesai dikemas ke ${out}`);
