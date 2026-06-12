# Grove Clash — Voxel Monster Battle Prototype

A Pokemon-style, turn-based battle RPG prototype rendered entirely in
**blocky 3D voxel pixel art** by a hand-written WebGL engine.
**Zero dependencies** — no packages, no CDN, no build step, no asset
files. Everything (models, font, UI, sound) is generated procedurally
in vanilla JavaScript, so it runs on a completely empty Replit project.

Walk the forest clearing as the trainer, talk to **Camper REX**, and
battle his **MAGMULE** (Lv.15) with your party — **PIXLIT** (Lv.10),
**THORNLET** and **EMBERIK** (Lv.9): dynamic camera swings, screen
shake, hitstop, particle bursts and a classic text-driven turn system
(PP, stat stages, crits, misses).

Battles are always 1v1, but you command a **party of up to six
allies**: switch freely mid-battle (a switch uses your turn), and when
an ally faints you pick the next one to send in. The command menu has
four slots — **Items** (Heal restores 50% HP, Cure wipes stat debuffs
like Growl; 3 charges each per battle), **Capture** (hurl a Voxball;
odds rise the more hurt the target is — caught monsters join your
party), **Run** (slip away and try again later) and **Attack** (the
four-move grid). Every action gets its own camera move and effect
choreography. Blacking out fully heals the party.

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
| WASD / Arrows | Move (overworld) · move cursor (battle menus) |
| E / Space / Enter | Talk · confirm · advance text |
| X / Esc | Back out of a submenu |
| C | Open the party panel (switch allies) |
| M | Mute / unmute |
| Mouse | Click buttons/party rows, click to advance text |

Lose and you black out (party fully healed); win, run, or capture and
REX will want a rematch. PIXLIT starts its first fight at 17/28 HP —
lean on your bench.

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
