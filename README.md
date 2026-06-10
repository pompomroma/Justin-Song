# Grove Clash — Voxel Monster Battle Prototype

A Pokemon-style, turn-based battle RPG prototype rendered entirely in
**blocky 3D voxel pixel art** by a hand-written WebGL engine.
**Zero dependencies** — no packages, no CDN, no build step, no asset
files. Everything (models, font, UI, sound) is generated procedurally
in vanilla JavaScript, so it runs on a completely empty Replit project.

Walk the forest clearing as the trainer, talk to **Camper REX**, and
battle his **MAGMULE** (Lv.15) with your **PIXLIT** (Lv.10): dynamic
camera swings, screen shake, hitstop, particle bursts and a classic
text-driven turn system (PP, stat stages, crits, misses).

## Run it

**On Replit (empty project, no template):** add these files to the repl
and press **Run** — the included `.replit` serves the folder with
`python3 -m http.server 8000` and the webview opens the game.
If `.replit` is ignored on your plan, just set the run command to
`python3 -m http.server 8000 --bind 0.0.0.0` yourself.

**Anywhere else:** serve the folder with any static server
(`python3 -m http.server`) **or simply open `index.html` in a
browser** — the game is `file://`-safe (no ES modules, no fetch).

## Controls

| Key | Action |
|---|---|
| WASD / Arrows | Move (overworld) · move cursor (battle menu) |
| E / Space / Enter | Talk · confirm · advance text |
| X / Esc | Back (try fleeing — see what REX thinks) |
| M | Mute / unmute |
| Mouse | Click move buttons, click to advance text |

Lose and you black out (HP restored); win and REX will want a rematch.
Your first fight starts at 17/28 HP — it is winnable, but barely. A
rematch at full HP is a fair fight.

## Debug modes (URL hash)

- `index.html#battle` — jump straight into the battle
- `index.html#viewer` — voxel model inspector (Left/Right to cycle)
- `index.html#fly` — free camera in the battle arena
  (WASD move, IJKL look, R/F up/down, Shift fast, **P** prints the
  camera pose to the console)

## Tests

```
node --check js/*.js test/*.js
node test/smoke.js
node test/boot_sim.js
```

`smoke.js` loads the pure modules in Node and checks the math, the
voxel mesher, font glyph coverage for every battle message, damage
formula goldens, AI behavior — and runs a 300-battle Monte-Carlo sim
to keep the fight balanced. `boot_sim.js` boots the whole game under
a stub DOM/WebGL, plays a full battle to completion with simulated
key presses, and exercises the overworld, viewer and fly modes.

## Manual checklist

walk → talk to REX → screen flash/wipe into battle → try each move
(Tackle / Growl / Mindbeam / Psyblast) → win path (faint dissolve,
victory orbit, EXP) → rematch → loss path (black out) → mute toggle.
