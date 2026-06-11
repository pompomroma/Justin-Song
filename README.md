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

### On Replit

**Easiest — import from GitHub:** Create Repl → *Import from GitHub* →
pick this repository. The hidden `.replit` file comes along, so the
green **Run** button just works (it launches `start.sh`, which serves
the folder on port 8000 and Replit opens the webview).

**Blank Repl with files added by hand:** make sure the **hidden files**
came along — in the Files pane menu choose *Show hidden files* and
check that `.replit` and `start.sh` exist. The usual reason the Run
button "does nothing" on a blank Repl is one of these:

1. `.replit` was never copied (it's hidden), so Replit has no run
   command. Fix: copy it in, or set the run command to `sh start.sh`.
2. `.replit` lacked a `modules` line, so the run environment has **no
   Python** and `python3 ...` fails with *command not found*. This
   repo's `.replit` now declares `modules = ["python-3.11"]`, and
   `start.sh` additionally falls back to `python` or `node`.
3. The Repl needs a reload after `.replit` changes — close and reopen
   the tab (or use *kill* in the shell) so the new config is picked up.

**No config at all (always works):** open the Replit **Shell** tab and
run `sh start.sh` — then open the webview/preview on port 8000.

> The game is keyboard-driven: **click the game once** in the webview
> so it has keyboard focus.

### The one-file version (no server, no setup)

`grove-clash-standalone.html` is the **entire game in a single file**.
Download it / upload it anywhere / double-click it — it runs straight
from disk in any browser. Rebuild it after code changes with
`python3 tools/build_standalone.py`.

### Anywhere else

Serve the folder with any static server (`python3 serve.py`,
`node serve.js`, or `python3 -m http.server`) **or simply open
`index.html` in a browser** — the game is `file://`-safe (no ES
modules, no fetch).

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
