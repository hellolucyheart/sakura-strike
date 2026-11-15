// Sakura Strike — entry program for make.fun's threejs-fps-02 bounty.
//
// What this program is: the delivery driver, not the game. The game itself
// is the static site in game/ (open game/index.html in Chrome and play it —
// no build step, no server logic, no network). This file's one job is to
// hand that site to the grader exactly as the bounty brief demands:
//
//   1. copy game/       -> <output>/game/
//   2. copy screenshots/ -> <output>/screenshots/
//   3. write <output>/dossier.json with buildDossier() from the vendored
//      vendor/makefun-threejs.ts, byte-identical to the kit's copy, so the
//      dossier the judge reads is provably the one the library derives
//      from these very files.
//
// The output directory is /output inside the grader; anywhere else the
// MAKEFUN_OUTPUT_DIR environment variable names it instead:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Node 22 runs this TypeScript as written (type stripping), standard
// library only — there is nothing to install.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');
if (!existsSync(join(gameSrc, 'index.html'))) {
  throw new Error('game/index.html is missing: the playable game must live in game/');
}
const shotNames = existsSync(shotsSrc)
  ? readdirSync(shotsSrc).filter((n) => /\.(png|jpe?g)$/i.test(n) && !n.startsWith('.'))
  : [];
if (shotNames.length < 3 || shotNames.length > 4) {
  throw new Error(`screenshots/ must hold 3 or 4 renders of the game, found ${shotNames.length}`);
}

mkdirSync(outputDir, { recursive: true });
cpSync(gameSrc, join(outputDir, 'game'), { recursive: true });
cpSync(shotsSrc, join(outputDir, 'screenshots'), { recursive: true });

// The caps below are the scorer's own (see the kit's RULES.txt): the text
// budget shapes the dossier bytes, the rest make this program refuse a
// delivery the scorer would refuse anyway — better to fail here, loudly,
// than to hand in an invalid entry.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

let gameBytes = 0;
for (const name of readdirSync(join(outputDir, 'game'))) {
  const p = join(outputDir, 'game', name);
  if (statSync(p).isFile()) gameBytes += statSync(p).size;
}
console.log(`sakura-strike: handed in game/ + ${shotNames.length} screenshots (${shotNames.join(', ')})`);
console.log(`sakura-strike: dossier.json ${dossier.length} bytes -> ${outputDir}`);
void gameBytes;
