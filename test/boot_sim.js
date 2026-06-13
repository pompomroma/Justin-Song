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
               'ui', 'fx', 'camera', 'battle_data', 'battle', 'overworld', 'main'];

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
    'createBuffer', 'bindBuffer', 'bufferData', 'viewport', 'clearColor', 'clear',
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
}

// ------------------------------------- run 2: overworld walk + handoff
{
  const sb = makeSandbox('');
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
  phase(['ArrowUp', 'ArrowRight', 'Space'], 12000); // Capture (rigged success)
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

console.log(failures ? '\nBOOT SIM FAILED' : '\nBOOT SIM PASSED');
process.exit(failures ? 1 : 0);
