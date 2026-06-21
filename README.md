# Grove Clash — Voxel Monster Battle Prototype

A Pokemon-style, turn-based battle RPG prototype rendered entirely in
**blocky 3D voxel pixel art** by a hand-written WebGL engine.
**Zero dependencies** — no packages, no CDN, no build step, no asset
files. Everything (models, font, UI, sound) is generated procedurally
in vanilla JavaScript, so it runs on a completely empty Replit project.

Roam an **endless, procedurally generated world** — a Minecraft-style
landscape that streams in **16-unit chunks** around you. A low-frequency
temperature/moisture noise field carves it into large, coherent **biomes**
— **Whisper Forest**, **Open Prairie**, **Sunfall Desert**, **Frost Tundra**
and **Golden Savanna** — each with its own ground, scenery (trees, cacti,
ice spikes…), sky/light ambiance, and **monster pool of distinctive species**
(forest **MOSSOX**/**HOOTLE**, prairie **BUNDER**/**LARKIT**, desert
**SCARABEX**/**COBRELL**/**SANDREK**, tundra **GLACIMP**/**PENGUL**/the
ICE-type **FROSTKIT**, savanna **MANELEO**/**GRASSGAZ**), so the wildlife
changes as you travel. **When a battle starts, the battlefield itself is
dressed to match the biome you're standing in** — desert sand and cacti, snow
and ice spikes, golden savanna grass, recolored sky and light. **Wandering
trainers** spawn at a controlled density and get tougher the farther you go.
Challenge them with your party of **PIXLIT**, **THORNLET** and **EMBERIK**,
then return to the
origin and step through the dark **rift portal** into an intimidating dungeon
to face the boss, **VORNETH**. Expect dynamic camera swings, screen shake,
hitstop, bullet-time, voxel particle storms and a classic text-driven turn
system (PP, stat stages, crits, misses).

**The boss, VORNETH:** in the dungeon it looms atop a cliff while the
camera tilts up at it (Dynamax/Gigantamax-style framing). Drop it below
half HP and it erupts into an awakened second form — the game's grandest
animation. Its attacks are the flashiest of any monster. Weaken and
capture it with a Voxball and it joins your party; as your ally you can
trigger that same transformation yourself with its **Awaken** move.

Every attack casts **dynamic colored light** into the scene with a
realistic soft falloff — beams, explosions and the boss's void blasts
briefly light up the arena, the cliff and both monsters in the move's
color. Every hit also throws a **forked lightning bolt (bright core +
glow) + sparks + a thunder crack** (and the attacker crackles with
electricity on wind-up), for all monsters in normal and boss battles.

Battles are always 1v1, but both sides field teams: you command a
**party of up to six**, and trainers now bring **2–3 varied monsters**
and send the next one when one drops. Switch freely (a switch uses your
turn); when your ally faints you pick the next, and when the **opponent's
monster is beaten or captured the game asks if you want to switch** too.
Check your team any time with **C** (in battle and in the overworld).
The command menu has four slots — **Items** (Heal 50% HP / Cure debuffs,
3 charges each), **Capture** (Voxball; odds rise the more hurt the
target), **Run**, and **Attack**. Every action gets its own camera move
and effects. Blacking out fully heals the party, and **every battle
fully heals your party afterward**.

**EXP Share:** defeating a monster grants generous EXP to your **whole
party equally**, and crossing the threshold **levels monsters up** (HP
and stats grow). The bar under your active ally shows its progress.

**Sound & music:** every attack has its **own cinematic, layered sound**
(Psyblast, Cinder, Void Lance, etc. are all distinct), and a **majestic
procedural soundtrack** plays through battles — a heroic theme in normal
fights and a darker, driving theme in the boss raid. All of it is
synthesized in code (no audio files); press **M** to mute.

## The opening

The game boots into a **title cinematic** — an original homage to the retro
RPG opening (original voxel art, original procedural fanfare, original
dialogue): the protector **AEGIS** clashes with a colossal **GIANT** under an
intense moving camera with crossing beams, lightning and slow-mo. There are
**three intro variants**, chosen at random. Press any key (or **X** to skip)
to reach the **title menu**: three save **slots** (New Game / Continue; **X**
erases). A new game lets you pick a **difficulty**, then plays a first-person
**"wake up" cutscene** (black screen, a blink reveal, the camera tilts up to
the giant firing a beam) that swings into a **real, playable tutorial battle**
commanding AEGIS. Win or lose, you **faint** and come to in the grove, where
you **name yourself** on an on-screen keyboard and the story carries on. Cut
scenes are letterboxed and the bars retract as overworld play begins; spoken
lines play as **both voice and text**.

**Difficulty (5 levels)** scales the opponent AI's *strategy* and *attack
diversity*: **1 Rookie** (random moves) · **2 Trainer** (plays the odds) ·
**3 Ace** (sets up, type-aware) · **4 Veteran** (conserves PP, targets
weaknesses, **switches** bad matchups) · **5 Master** (predicts KOs and
punishes). It also scales each foe's movepool, level and team size. A small
**type chart** (FIRE > LEAF > PSY > VOID > FIRE; NORMAL neutral) makes
weaknesses real — "super effective!" / "not very effective..." show in battle.

**Saving:** progress is kept in **localStorage** slots (autosaved after every
battle and on entering the grove). Press **O** in the overworld for **Options**
— **Rename**, **Difficulty**, **Save**, and portable **save codes** (Export /
Import a checksummed string — the offline "cloud"). An optional best-effort
online sync (`Cloud.push/pull`) is included but **off by default** and inert
unless you point it at your own endpoint, so the game stays zero-dependency,
offline and `file://`-safe.

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
| O | Options (overworld) — rename, difficulty, save, save codes |
| M | Mute / unmute |
| T | Toggle the FPS / resolution readout |
| Mouse / Touch | Click/tap buttons, slots, the keyboard, menu options; click to advance text |

**Mobile / touch:** on-screen controls appear automatically **only when you
are not using the keyboard** — they show up the first time you touch the
screen and hide the instant you press a key. In the overworld you get an
8-way D-pad (lower-left) plus **A** (talk / confirm) and **B** (back) buttons
(right edge). In battle, just tap the move buttons, party balls, menu options
and tap to advance text; **A**/**B** are there too.

Lose and you black out (party fully healed); win, run, or capture and the
trainer stays beaten where you left them. A gentle **starter trainer** waits
beside the campfire at spawn; wander outward for steadily tougher teams.

## Resolution & framerate

The 3D world renders to an **adaptive backing store**: it scales up
toward an **8K ceiling** (7680px wide, or the GPU's max) whenever there
is frame-budget headroom, and scales down to **protect a 60 FPS floor**
when frames run long — so it stays smooth on a laptop and razor-sharp on
a 4K/8K display. The 2D UI keeps a fixed 960×540 layout but its backing
store is rendered at display resolution, so panels and text stay crisp.
The simulation is a fixed 60 Hz step; rendering runs every animation
frame (60+ FPS on a 60/120/144 Hz display). Press **T** for the live
FPS / resolution readout.

- `index.html#8k` — force the full 8K ceiling (adaptive scaling off)
- `index.html#retro` — original 480×270 chunky-pixel look

## Debug modes (URL hash)

The game boots into the opening cinematic by default; these hashes jump past it:

- `index.html#overworld` — straight into the grove (skip the opening)
- `index.html#title` — the save-slot / difficulty title menu
- `index.html#story` — the first-person wake cutscene
- `index.html#tutorial` — the playable tutorial battle (AEGIS vs the GIANT)
- `index.html#name` — the on-screen name-entry keyboard
- `index.html#battle` — jump straight into a grove battle
- `index.html#dungeon` — jump straight into the VORNETH boss fight
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
voxel mesher, font glyph coverage for every battle/menu/story string,
damage formula goldens, the **type chart + STAB**, the **5 AI tiers**
(random → predictive KO → switch-awareness), **save-code round-trips**
(and that cloud sync is off by default) — and runs a 300-battle
Monte-Carlo sim to keep the fight balanced. `boot_sim.js` boots the whole
game under a stub DOM/WebGL and plays through the **entire opening chain**
(Intro → title menu → new game → wake cutscene → tutorial battle → faint →
name entry → grove), a full battle to completion, a Master-difficulty
multi-monster battle with enemy switching, plus the overworld, viewer and
fly modes.

## Manual checklist

opening cinematic (try a few reloads for the 3 variants; **X** skips) →
title menu (New Game on an empty slot, pick a difficulty) → wake cutscene →
tutorial battle vs the GIANT (drop it below half HP for the enrage + its
telegraphed Giga Beam) → faint → name yourself → grove → **O** Options
(rename / difficulty / save / export+import a save code) → **wander far** in
any direction (the world keeps generating; you cross into desert / tundra /
prairie / savanna biomes — watch the ground, scenery, sky and the monsters
change) and battle the procedurally spawned trainers at different difficulties
→ each action
(Attack, Items, Capture, Run, party switch with **C**) → return to the origin
portal → boss intro atop the cliff with the upward camera → knock VORNETH below half
HP for its transformation climax → defeat or capture it → field the captured
VORNETH and use its Awaken move → loss path (black out) → reload and
**Continue** the saved slot → mute (**M**) and stats (**T**) toggles.
