/* Grove Clash — test/boot_sim.js (Node-only)
   Full-game boot simulation: loads every script in real <script> order
   inside a vm sandbox with stub DOM/WebGL/2D-canvas, boots the game,
   pumps frames and dispatches key events to play through an entire
   battle (#battle hash), plus overworld walking and the model viewer.
   Fails if anything throws or hits the in-game error overlay.
   Run: node test/boot_sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ORDER = ['math3d', 'input', 'audio', 'font', 'voxel', 'models', 'gfx',
               'ui', 'fx', 'camera', 'battle_data', 'save', 'biome', 'battle', 'overworld',
               'intro', 'story', 'titlemenu', 'nameentry', 'main'];

let failures = 0;
function ok(cond, name) {
  console.log((cond ? '  ok  ' : 'FAIL  ') + name);
  if (!cond) failures++;
}

// ------------------------------------------------------------- DOM stubs
function makeCtx2d() {
  const grad = { addColorStop() {} };
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '',
    imageSmoothingEnabled: false,
    fillRect() {}, clearRect() {}, strokeRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {},
    fill() {}, stroke() {}, save() {}, restore() {},
    translate() {}, scale() {}, setTransform() {}, drawImage() {}, fillText() {}, rect() {},
    createLinearGradient() { return grad; },
  };
}

function makeGl() {
  const gl = { _n: 0 };
  const FNS = ['createShader', 'shaderSource', 'compileShader', 'getShaderInfoLog',
    'createProgram', 'attachShader', 'bindAttribLocation', 'linkProgram',
    'getProgramInfoLog', 'useProgram', 'enable', 'depthFunc', 'disable', 'blendFunc',
    'createBuffer', 'deleteBuffer', 'bindBuffer', 'bufferData', 'viewport', 'clearColor', 'clear',
    'uniformMatrix4fv', 'uniform3fv', 'uniform1f', 'enableVertexAttribArray',
    'vertexAttribPointer', 'drawArrays'];
  for (const f of FNS) gl[f] = () => ({ id: ++gl._n });
  gl.getShaderParameter = () => true;
  gl.getProgramParameter = () => true;
  gl.getUniformLocation = () => ({ id: ++gl._n });
  gl.getParameter = (p) => (p === gl.MAX_VIEWPORT_DIMS ? [16384, 16384] : 0);
  const CONSTS = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS',
    'ARRAY_BUFFER', 'STATIC_DRAW', 'STREAM_DRAW', 'DEPTH_TEST', 'LEQUAL', 'CULL_FACE',
    'BLEND', 'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'COLOR_BUFFER_BIT', 'DEPTH_BUFFER_BIT',
    'TRIANGLES', 'FLOAT', 'MAX_VIEWPORT_DIMS'];
  CONSTS.forEach((c, i) => { gl[c] = i + 1; });
  return gl;
}

function makeCanvas(kind) {
  return {
    width: 0, height: 0, style: {},
    getContext(type) {
      if (type === '2d') { this._c2d = this._c2d || makeCtx2d(); return this._c2d; }
      if (kind === 'gl') { this._gl = this._gl || makeGl(); return this._gl; }
      return null;
    },
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; },
  };
}

function makeSandbox(hash) {
  const listeners = {};
  const rafQueue = [];
  const errors = [];
  const stage = {
    style: {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; },
  };
  const elements = { stage, gl: makeCanvas('gl'), ui: makeCanvas('2d') };
  const sandbox = {
    console: {
      log() {}, warn() {},
      error(...a) { errors.push(a.map(String).join(' ')); },
    },
    performance: { now: () => sandbox.__now },
    __now: 0,
    setTimeout: () => 0, clearTimeout: () => 0,
    location: { href: 'http://x/' + hash, hash },
    document: {
      readyState: 'complete',
      getElementById: (id) => elements[id],
      createElement: () => makeCanvas('2d'),
      addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    },
    window: null, // set below
    requestAnimationFrame(f) { rafQueue.push(f); return rafQueue.length; },
    __dispatch(type, ev) {
      ev.preventDefault = ev.preventDefault || (() => {});
      for (const f of (listeners[type] || [])) f(ev);
    },
    __pump(frames) {
      for (let i = 0; i < frames; i++) {
        sandbox.__now += 1000 / 60;
        const q = rafQueue.splice(0, rafQueue.length);
        for (const f of q) f(sandbox.__now);
      }
    },
    __errors: errors,
  };
  sandbox.window = {
    innerWidth: 1280, innerHeight: 720,
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    onerror: null,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const src = ORDER.map((f) => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')).join('\n;\n');
  vm.runInContext(src, sandbox, { filename: 'bundle.js' });
  vm.runInContext('this.__Game = Game;', sandbox);
  return sandbox;
}

const press = (sb, code) => {
  sb.__dispatch('keydown', { code, repeat: false });
  sb.__dispatch('keyup', { code });
};

// dispatch a touch at a virtual (960x540) point, mapped to client coords via
// the stub's 1280x720 window over a 960x540 stage rect.
const touchEv = (sb, type, vx, vy, id) => {
  sb.__dispatch(type, { changedTouches: [{ identifier: id || 1, clientX: vx / 960 * 1280, clientY: vy / 540 * 720 }] });
};

// drives one "menu step": navigate toward bottom-right (Attack/strongest
// move) and confirm. Down/Right SET grid position (no toggling), so this
// lands Attack in the top menu, the 4th move in the move grid, advances
// any message on confirm, and walks the party list (wrapping) when a
// forced switch panel is up.
function attackCycle(sb) {
  sb.__pump(30);
  press(sb, 'ArrowDown');
  sb.__pump(5);
  press(sb, 'ArrowRight');
  sb.__pump(5);
  press(sb, 'Space');
}

// -------------------------------------------------- run 1: full battle
{
  const sb = makeSandbox('#battle');
  let ended = null;
  vm.runInContext(`(${function () {
    const orig = Game.onBattleEnd;
    Game.onBattleEnd = (r, e) => { globalThis.__battleEnd = r; orig(r, e); };
  }.toString()})()`, sb);
  sb.__pump(60);
  ok(sb.__errors.length === 0, 'battle boots without errors');
  ok(vm.runInContext('typeof Sfx.move === "function" && typeof Sfx.startMusic === "function" && typeof Sfx.stopMusic === "function"', sb),
     'audio exposes per-move SFX + battle music API');
  ok(vm.runInContext('(function(){ Sfx.move("PSYBLAST"); Sfx.startMusic("battle"); Sfx.stopMusic(); return true; })()', sb),
     'attack SFX + music calls are safe with no audio context');
  const glw = vm.runInContext('document.getElementById("gl").width', sb);
  ok(glw > 480, 'adaptive resolution scaled the 3D buffer up (' + glw + 'px wide)');
  // play: keep attacking (with forced switches) for up to ~11 sim-minutes
  let frames = 0;
  while (frames < 40000 && !vm.runInContext('globalThis.__battleEnd', sb)) {
    attackCycle(sb);
    frames += 40;
  }
  ended = vm.runInContext('globalThis.__battleEnd', sb);
  ok(ended === 'win' || ended === 'loss', 'battle played to completion (' + ended + ' after ' + frames + ' frames)');
  sb.__pump(200); // ride the transition back into the overworld
  ok(sb.__errors.length === 0, 'no errors through battle + return transition' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
  const allFull = vm.runInContext('__Game.save.party.every(m => m.hp === null)', sb);
  ok(allFull, 'whole party is fully healed after the battle');
}

// ------------------------------------- run 2: overworld walk + handoff
{
  const sb = makeSandbox('#overworld');
  sb.__pump(5);
  sb.__dispatch('keydown', { code: 'KeyW', repeat: false });
  sb.__pump(240); // walk forward, hit collision/boundary paths
  sb.__dispatch('keyup', { code: 'KeyW' });
  sb.__dispatch('keydown', { code: 'KeyD', repeat: false });
  sb.__pump(120);
  sb.__dispatch('keyup', { code: 'KeyD' });
  sb.__dispatch('mousemove', { clientX: 600, clientY: 420 });
  sb.__dispatch('mousedown', { clientX: 600, clientY: 420 });
  ok(sb.__errors.length === 0, 'overworld walking without errors');
  vm.runInContext('__Game.toBattle()', sb); // overworld -> battle transition
  sb.__pump(300);
  ok(sb.__errors.length === 0, 'overworld -> battle transition without errors' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ----------------------------------------------------- run 3: viewer
{
  const sb = makeSandbox('#viewer');
  sb.__pump(5);
  for (let i = 0; i < 16; i++) { press(sb, 'ArrowRight'); sb.__pump(10); }
  ok(sb.__errors.length === 0, 'model viewer cycles all models without errors' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ----------------------------------------------------- run 4: fly cam
{
  const sb = makeSandbox('#fly');
  sb.__pump(5);
  sb.__dispatch('keydown', { code: 'KeyW', repeat: false });
  sb.__dispatch('keydown', { code: 'KeyI', repeat: false });
  sb.__pump(120);
  press(sb, 'KeyP');
  sb.__pump(10);
  ok(sb.__errors.length === 0, 'fly camera mode without errors');
}

// ------------------------------------- run 5: rigged victory path
{
  const sb = makeSandbox('#battle');
  // enemy only Growls -> player must eventually win -> victory path runs
  vm.runInContext(`(${function () {
    BData.aiPick = () => 'GROWL';
    Game.save.party[0].hp = null; // full HP
    const orig = Game.onBattleEnd;
    Game.onBattleEnd = (r, e) => { globalThis.__battleEnd = r; orig(r, e); };
  }.toString()})()`, sb);
  sb.__pump(5);
  let frames = 0;
  while (frames < 40000 && !vm.runInContext('globalThis.__battleEnd', sb)) {
    attackCycle(sb);
    frames += 40;
  }
  const ended = vm.runInContext('globalThis.__battleEnd', sb);
  const beaten = vm.runInContext('__Game.save.npcs.rex === true', sb);
  ok(ended === 'win' && beaten === true,
     'victory path completes (' + ended + ', rexBeaten=' + beaten + ', ' + frames + ' frames)');
  sb.__pump(200);
  ok(sb.__errors.length === 0, 'no errors through the victory path' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ---------------------- run 6: feature tour — heal, switch, capture
{
  const sb = makeSandbox('#battle');
  vm.runInContext(`(${function () {
    BData.captureChance = () => 1; // guaranteed catch
    // enemy barely scratches so the player never faints and the menu nav
    // stays in sync through the whole heal/switch/capture tour
    const realDmg = BData.damage;
    BData.damage = (att, def, move, rng) => {
      const r = realDmg(att, def, move, rng);
      if (!r.miss && move.power && att.level >= 13) r.dmg = 1;
      return r;
    };
    const orig = Game.onBattleEnd;
    Game.onBattleEnd = (r, e) => { globalThis.__battleEnd = r; orig(r, e); };
  }.toString()})()`, sb);
  sb.__pump(5);
  const phase = (keys, frames) => {
    let f = 0;
    while (f < frames && !vm.runInContext('globalThis.__battleEnd', sb)) {
      sb.__pump(30);
      for (const k of keys) { press(sb, k); sb.__pump(5); }
      f += 40;
    }
  };
  phase(['ArrowUp', 'ArrowLeft', 'Space'], 3200);   // Items -> Heal (uses charges)
  ok(sb.__errors.length === 0, 'item (Heal) sequence without errors');
  // ArrowUp wraps the party cursor too, but a stray press in the top menu
  // can only land on the top row (Items/Capture) — never on Run.
  phase(['KeyC', 'ArrowUp', 'Space'], 4000);        // party panel -> switch allies
  ok(sb.__errors.length === 0, 'voluntary switch sequence without errors');
  phase(['KeyX', 'ArrowUp', 'ArrowRight', 'Space'], 12000); // back to top, then Capture (rigged)
  const ended = vm.runInContext('globalThis.__battleEnd', sb);
  const party = vm.runInContext('__Game.save.party.map(m => m.species).join(",")', sb);
  ok(ended === 'capture' && /MAGMULE$/.test(party),
     'capture path completes (' + ended + ', party=' + party + ')');
  sb.__pump(200);
  ok(sb.__errors.length === 0, 'no errors through heal/switch/capture tour' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ----------------------------------------------- run 7: run away
{
  const sb = makeSandbox('#battle');
  vm.runInContext(`(${function () {
    const orig = Game.onBattleEnd;
    Game.onBattleEnd = (r, e) => { globalThis.__battleEnd = r; orig(r, e); };
  }.toString()})()`, sb);
  sb.__pump(5);
  let frames = 0;
  while (frames < 8000 && !vm.runInContext('globalThis.__battleEnd', sb)) {
    sb.__pump(30);
    press(sb, 'ArrowDown');
    sb.__pump(5);
    press(sb, 'ArrowLeft');
    sb.__pump(5);
    press(sb, 'Space');
    frames += 40;
  }
  const ended = vm.runInContext('globalThis.__battleEnd', sb);
  ok(ended === 'run', 'run-away path completes (' + ended + ')');
  sb.__pump(200);
  ok(sb.__errors.length === 0, 'no errors through the run-away path');
}

// ---------------------- run 8: dungeon boss (transform + capture flag)
{
  const sb = makeSandbox('#dungeon');
  // rig damage so the player crushes (boss drops past its threshold and
  // awakens, then is defeated) while the boss only chips — guarantees the
  // transformation climax and a boss victory run through cleanly.
  vm.runInContext(`(${function () {
    const realDmg = BData.damage;
    BData.damage = (att, def, move, rng) => {
      const r = realDmg(att, def, move, rng);
      if (!r.miss && move.power) r.dmg = att.level <= 12 ? 40 : 3;
      return r;
    };
    const orig = Game.onBattleEnd;
    Game.onBattleEnd = (r, e) => { globalThis.__battleEnd = r; orig(r, e); };
  }.toString()})()`, sb);
  sb.__pump(60);
  ok(sb.__errors.length === 0, 'dungeon boss boots without errors' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
  let frames = 0;
  while (frames < 60000 && !vm.runInContext('globalThis.__battleEnd', sb)) {
    attackCycle(sb);
    frames += 40;
  }
  const ended = vm.runInContext('globalThis.__battleEnd', sb);
  const bossBeaten = vm.runInContext('__Game.save.bossBeaten === true', sb);
  ok(ended === 'win' && bossBeaten,
     'dungeon boss defeated through the transform climax (' + ended + ', bossBeaten=' + bossBeaten + ', ' + frames + ' frames)');
  sb.__pump(250);
  ok(sb.__errors.length === 0, 'no errors through the boss battle + transformation' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ----------------------------------- run 9: mobile / touch controls
{
  const sb = makeSandbox('#overworld');
  sb.__pump(5);
  ok(vm.runInContext('Input.usingTouch()', sb) === false, 'mobile controls hidden before any touch');
  // D-pad down (overworld layout)
  touchEv(sb, 'touchstart', 140, 468, 1);
  ok(vm.runInContext('Input.usingTouch()', sb) === true, 'first touch reveals the mobile controls');
  ok(vm.runInContext('Input.axisY()', sb) === 1, 'D-pad drives the movement axis');
  sb.__pump(60); // walk a bit (also exercises drawTouch every frame)
  touchEv(sb, 'touchend', 140, 468, 1);
  ok(vm.runInContext('Input.axisY()', sb) === 0, 'releasing the D-pad stops movement');
  // A button -> confirm edge
  touchEv(sb, 'touchstart', 884, 300, 2);
  ok(vm.runInContext('Input.pressed("confirm")', sb) === true, 'A button fires confirm');
  touchEv(sb, 'touchend', 884, 300, 2);
  // a tap elsewhere routes into the mouse (so battle tap-to-select works)
  touchEv(sb, 'touchstart', 480, 250, 3);
  ok(vm.runInContext('Input.mouse.clicked', sb) === true, 'a screen tap routes into the mouse (tap-to-select)');
  touchEv(sb, 'touchend', 480, 250, 3);
  // using the keyboard hides the overlay again
  press(sb, 'KeyW');
  ok(vm.runInContext('Input.usingTouch()', sb) === false, 'using the keyboard hides the mobile controls');
  sb.__pump(30);
  ok(sb.__errors.length === 0, 'no errors through touch input + overlay draw' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ------------------------------ run 10: battle insets the 3D inner screen
{
  const sb = makeSandbox('#overworld'); // overworld
  sb.__pump(5);
  const w0 = vm.runInContext('document.getElementById("gl").style.width', sb);
  ok(w0 !== '82%', 'overworld 3D view is not inset (' + w0 + ')');
  vm.runInContext('__Game.toBattle()', sb); // overworld -> battle transition
  sb.__pump(300);                            // ride transition; switchNow insets the gl canvas
  const w1 = vm.runInContext('document.getElementById("gl").style.width', sb);
  ok(w1 === '82%', 'battle insets the 3D inner screen so the frame borders it (' + w1 + ')');
  ok(sb.__errors.length === 0, 'no errors through the inset toggle');
}

// ---------------- run 11: multi-monster NPC battle + switch prompt + EXP
{
  const sb = makeSandbox('#overworld');
  vm.runInContext(`(${function () {
    const realDmg = BData.damage;            // player crushes; the foes only chip
    BData.damage = (att, def, move, rng) => { const r = realDmg(att, def, move, rng); if (!r.miss && move.power) r.dmg = att.level <= 12 ? 50 : 2; return r; };
    const orig = Game.onBattleEnd;
    Game.onBattleEnd = (r, e) => { globalThis.__battleEnd = r; orig(r, e); };
  }.toString()})()`, sb);
  sb.__pump(5);
  vm.runInContext('__Game.toBattle({ arena:"grove", npcId:"rex", enemy:{ team:[{species:"MAGMULE",level:13},{species:"EMBERIK",level:13}], trainer:"Camper REX", npcId:"rex", trainerModel:"rex_raised" } })', sb);
  let frames = 0;
  while (frames < 50000 && !vm.runInContext('globalThis.__battleEnd', sb)) { attackCycle(sb); frames += 40; }
  const ended = vm.runInContext('globalThis.__battleEnd', sb);
  const rexBeaten = vm.runInContext('__Game.save.npcs.rex === true', sb);
  ok(ended === 'win' && rexBeaten, 'multi-monster NPC battle completes as a win (' + ended + ', ' + frames + ' frames)');
  const exp = vm.runInContext('__Game.save.party[1].exp', sb);
  ok(typeof exp === 'number', 'shared EXP is tracked on a benched ally (' + exp + ')');
  ok(sb.__errors.length === 0, 'no errors through the multi-monster battle + switch prompt' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ----- run 12: beam-type move (idx 2) — guards the kindBeam crash regression
{
  const sb = makeSandbox('#battle'); // single MAGMULE foe; PIXLIT idx2 = Mindbeam (beam)
  vm.runInContext(`(${function () {
    const realDmg = BData.damage;
    BData.damage = (att, def, move, rng) => { const r = realDmg(att, def, move, rng); if (!r.miss && move.power) r.dmg = att.level <= 12 ? 50 : 2; return r; };
    const orig = Game.onBattleEnd;
    Game.onBattleEnd = (r, e) => { globalThis.__battleEnd = r; orig(r, e); };
  }.toString()})()`, sb);
  sb.__pump(5);
  const beamRound = () => { // top -> Attack -> moves, then pick the bottom-left move (idx 2)
    sb.__pump(30);
    press(sb, 'ArrowDown'); sb.__pump(4); press(sb, 'ArrowRight'); sb.__pump(4); press(sb, 'Space'); sb.__pump(8);
    press(sb, 'ArrowDown'); sb.__pump(4); press(sb, 'ArrowLeft'); sb.__pump(4); press(sb, 'Space'); sb.__pump(8);
    press(sb, 'Space'); sb.__pump(6);
  };
  let frames = 0;
  while (frames < 40000 && !vm.runInContext('globalThis.__battleEnd', sb)) { beamRound(); frames += 60; }
  ok(vm.runInContext('globalThis.__battleEnd', sb) === 'win', 'beam-type move (Mindbeam) resolves to a win');
  sb.__pump(150);
  ok(sb.__errors.length === 0, 'no errors using a beam-type attack (kindBeam tgt fix)' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// press a key and let one frame consume the edge (so N nav presses register
// as N distinct moves, not one)
const tap = (sb, code) => { press(sb, code); sb.__pump(2); };

// ----------------------------------- run 13: default boot opens the Intro
{
  const sb = makeSandbox('');     // no hash -> the opening cinematic
  sb.__pump(60);
  ok(vm.runInContext('__Game.sceneName', sb) === 'intro', 'default boot opens the Intro cinematic');
  press(sb, 'Space');             // any key advances to the title menu
  sb.__pump(140);                 // ride the fade
  ok(vm.runInContext('__Game.sceneName', sb) === 'title', 'Intro -> TitleMenu on a key press');
  ok(sb.__errors.length === 0, 'no errors through the intro' + (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ----------------------------------- run 14: full opening chain to the grove
{
  const sb = makeSandbox('#title');
  vm.runInContext(`(${function () {
    // the PSY protector crushes the VOID giant (a few hits -> enrage -> win);
    // the giant only chips, so the tutorial is a guaranteed win -> faint.
    const realDmg = BData.damage;
    BData.damage = (att, def, move, rng) => { const r = realDmg(att, def, move, rng); if (!r.miss && move.power) r.dmg = att.type === 'PSY' ? 25 : 1; return r; };
  }.toString()})()`, sb);
  sb.__pump(20);
  ok(vm.runInContext('__Game.sceneName', sb) === 'title', 'TitleMenu boots from #title');
  let iter = 0, reached = false;
  while (iter < 400 && !reached) {
    const sc = vm.runInContext('__Game.sceneName', sb);
    if (sc === 'title') {                 // empty slot -> difficulty -> new game
      press(sb, 'Space'); sb.__pump(8);
      if (vm.runInContext('__Game.sceneName', sb) === 'title') { press(sb, 'Space'); sb.__pump(40); }
    } else if (sc === 'name') {            // walk to OK (row 3, col 8) and confirm
      tap(sb, 'ArrowDown'); tap(sb, 'ArrowDown'); tap(sb, 'ArrowDown');
      for (let i = 0; i < 8; i++) tap(sb, 'ArrowRight');
      press(sb, 'Space'); sb.__pump(40);
    } else if (sc === 'battle') {          // Attack -> Psyblast (bottom-left move)
      sb.__pump(22);
      press(sb, 'ArrowDown'); sb.__pump(3); press(sb, 'ArrowRight'); sb.__pump(3); press(sb, 'Space'); sb.__pump(6);
      press(sb, 'ArrowDown'); sb.__pump(3); press(sb, 'ArrowLeft'); sb.__pump(3); press(sb, 'Space'); sb.__pump(6);
      press(sb, 'Space'); sb.__pump(4);
    } else {                               // story / cutscene fades
      press(sb, 'Space'); sb.__pump(20);
    }
    iter++;
    if (vm.runInContext('__Game.sceneName', sb) === 'overworld') reached = true;
  }
  ok(reached, 'opening chain reaches the grove (Title->NewGame->wake->tutorial->faint->name->overworld, ' + iter + ' iters)');
  ok(vm.runInContext('typeof __Game.save.name === "string" && __Game.save.name.length > 0', sb), 'the player named themselves');
  sb.__pump(160);
  ok(sb.__errors.length === 0, 'no errors through the entire opening sequence' + (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ------------------------------- run 15: difficulty 5 (switch/AI) battle
{
  const sb = makeSandbox('#overworld');
  vm.runInContext(`(${function () {
    Game.save.difficulty = 5;            // Master: weakness-targeting + switching
    const realDmg = BData.damage;
    BData.damage = (att, def, move, rng) => { const r = realDmg(att, def, move, rng); if (!r.miss && move.power) r.dmg = att.level <= 12 ? 50 : 2; return r; };
    const orig = Game.onBattleEnd;
    Game.onBattleEnd = (r, e) => { globalThis.__battleEnd = r; orig(r, e); };
  }.toString()})()`, sb);
  sb.__pump(5);
  vm.runInContext('__Game.toBattle({ arena:"grove", npcId:"ace", enemy:{ team:[{species:"MAGMULE",level:14},{species:"EMBERIK",level:14},{species:"PIXLIT",level:15}], trainer:"Ace KORU", npcId:"ace", trainerModel:"npc_ace" } })', sb);
  let frames = 0;
  while (frames < 60000 && !vm.runInContext('globalThis.__battleEnd', sb)) { attackCycle(sb); frames += 40; }
  ok(vm.runInContext('globalThis.__battleEnd', sb) === 'win', 'Master (tier 5) multi-mon battle completes a win (' + frames + ' frames)');
  ok(vm.runInContext('__Game.save.difficulty === 5', sb), 'difficulty persisted on the save');
  sb.__pump(200);
  ok(sb.__errors.length === 0, 'no errors at difficulty 5 with enemy AI / switching' + (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ------------------------------- run 16: infinite world chunk streaming
{
  const sb = makeSandbox('#overworld');
  sb.__pump(5);
  sb.__dispatch('keydown', { code: 'KeyW', repeat: false });
  sb.__dispatch('keydown', { code: 'KeyD', repeat: false });
  sb.__pump(2000);                 // long diagonal walk -> many chunk loads/unloads/disposes
  sb.__dispatch('keyup', { code: 'KeyW' });
  sb.__dispatch('keyup', { code: 'KeyD' });
  sb.__pump(40);
  ok(sb.__errors.length === 0, 'infinite overworld streams chunks over a long walk without errors' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
  // turn around and walk back across the same chunks (regenerated deterministically)
  sb.__dispatch('keydown', { code: 'KeyS', repeat: false });
  sb.__dispatch('keydown', { code: 'KeyA', repeat: false });
  sb.__pump(1200);
  sb.__dispatch('keyup', { code: 'KeyS' });
  sb.__dispatch('keyup', { code: 'KeyA' });
  sb.__pump(20);
  ok(sb.__errors.length === 0, 'walking back regenerates chunks without errors' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

// ------------------------------- run 17: biome-monster battle (new species)
{
  const sb = makeSandbox('#overworld');
  vm.runInContext(`(${function () {
    const realDmg = BData.damage;
    BData.damage = (att, def, move, rng) => { const r = realDmg(att, def, move, rng); if (!r.miss && move.power) r.dmg = att.level <= 12 ? 50 : 1; return r; };
    const orig = Game.onBattleEnd;
    Game.onBattleEnd = (r, e) => { globalThis.__be = r; orig(r, e); };
  }.toString()})()`, sb);
  sb.__pump(5);
  vm.runInContext('__Game.toBattle({ arena:"grove", npcId:"42,7", enemy:{ team:[{species:"FROSTKIT",level:13},{species:"SANDREK",level:13}], trainer:"Ranger KAI", npcId:"42,7", trainerModel:"npc_hiker" } })', sb);
  let frames = 0;
  while (frames < 50000 && !vm.runInContext('globalThis.__be', sb)) { attackCycle(sb); frames += 40; }
  ok(vm.runInContext('globalThis.__be', sb) === 'win', 'biome-monster battle (FROSTKIT/SANDREK + ICE moves) resolves (' + frames + ' frames)');
  sb.__pump(150);
  ok(sb.__errors.length === 0, 'no errors rendering the new biome monsters in battle' +
     (sb.__errors.length ? ': ' + sb.__errors[0].slice(0, 200) : ''));
}

console.log(failures ? '\nBOOT SIM FAILED' : '\nBOOT SIM PASSED');
process.exit(failures ? 1 : 0);
