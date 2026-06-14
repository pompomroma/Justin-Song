/* Grove Clash — test/smoke.js (Node-only; not loaded by the browser)
   Loads the pure game modules into a vm context and asserts real
   numbers: mat4 math, voxel mesher counts, font glyph coverage for
   every battle string, damage formula goldens, AI rules, hitstop
   safety, and a 300-battle Monte-Carlo balance gate.
   Run: node test/smoke.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const FILES = ['math3d', 'voxel', 'models', 'font', 'battle_data', 'fx'];
const src = FILES.map((f) => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')).join('\n;\n') +
  '\n;({ M3, Vox, Models, PFont, BData, Fx })';
const api = vm.runInThisContext(src, { filename: 'bundle.js' });
const { M3, Vox, Models, PFont, BData, Fx } = api;

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name); }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-4);

// ---------------------------------------------------------------- math3d
{
  const p = M3.persp(M3.mat(), 40, 16 / 9, 0.1, 60);
  ok(p[11] === -1 && p[15] === 0 && p[5] > 0, 'persp matrix shape');
  const f = 1 / Math.tan((40 * Math.PI) / 360);
  ok(near(p[5], f) && near(p[0], f / (16 / 9)), 'persp focal elements');

  const v = M3.lookAt(M3.mat(), [0, 2, 5], [0, 0, 0], [0, 1, 0]);
  const out = M3.transformPoint([0, 0, 0], v, [0, 2, 5]);
  ok(near(out[0], 0) && near(out[1], 0) && near(out[2], 0), 'lookAt maps eye to origin');
  const tgt = M3.transformPoint([0, 0, 0], v, [0, 0, 0]);
  ok(tgt[2] < 0 && near(tgt[0], 0), 'lookAt target sits on -z');

  const m = M3.trs(M3.mat(), [1, 2, 3], [Math.PI / 2, 0, 0], [1, 1, 1]);
  const r = M3.transformPoint([0, 0, 0], m, [0, 0, 1]);
  ok(near(r[0], 2) && near(r[1], 2) && near(r[2], 3), 'trs yaw rotates +z to +x');

  const rng = M3.rng(42);
  const a = rng(), b = rng();
  const rng2 = M3.rng(42);
  ok(a !== b && rng2() === a, 'seeded rng is deterministic');
}

// ------------------------------------------------------------------ vox
{
  const g1 = Vox.grid(1, 1, 1);
  g1.set(0, 0, 0, 0);
  const m1 = Vox.mesh(g1, [[1, 0, 0]], 1);
  ok(m1.count === 36, 'single voxel meshes to 36 verts (6 faces)');

  const g2 = Vox.grid(2, 1, 1);
  g2.set(0, 0, 0, 0); g2.set(1, 0, 0, 0);
  const m2 = Vox.mesh(g2, [[1, 0, 0]], 1);
  ok(m2.count === 60, 'two adjacent voxels cull shared faces (10 faces)');

  const cs = Vox.centers(g2, [[1, 0, 0]], 1, 1);
  ok(cs.length === 2 && near(cs[0].p[1], 0.5), 'centers() returns voxel centers');
}

// --------------------------------------------------------------- models
{
  for (const name of Models.list()) {
    const m = Models.get(name);
    ok(m.count > 0 && m.count % 3 === 0 && m.data.length === m.count * 9 &&
       m.height > 0 && m.centers.length > 0, 'model "' + name + '" builds (' + m.count + ' verts)');
  }
  const ground = Models.groundMesh({ radius: 5, patches: [{ x: 0, z: 0, rx: 1, rz: 1, rot: 0 }] });
  ok(ground.count > 0 && ground.data.length === ground.count * 9, 'ground mesh builds');
  const g2 = Models.groundMesh({ radius: 5, patches: [{ x: 0, z: 0, rx: 1, rz: 1, rot: 0 }] });
  ok(g2.count === ground.count, 'ground mesh is deterministic');
}

// ----------------------------------------------------------------- font
{
  const strings = [];
  for (const k in BData.MSG)
    strings.push(BData.fmt(BData.MSG[k], { A: 'MAGMULE', M: 'Psyblast', T: 'Camper REX', B: 'VORNETH-X', E: '135' }));
  const collect = (v) => { if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') Object.values(v).forEach(collect); else if (typeof v === 'string') strings.push(v); };
  collect(BData.DIALOGUE);
  for (const k in BData.MOVES) strings.push(BData.MOVES[k].name);
  for (const k in BData.SPECIES) strings.push(BData.SPECIES[k].name);
  strings.push('Lv.10', 'Lv.15', 'Lv.16', '17/28', 'HP', '▼', 'WHISPER GROVE', 'MUTED',
               'WASD/Arrows: Move', 'E: Talk / Confirm', 'M: Mute sound', 'M: Mute   T: Stats', 'E  Talk', 'E  Enter the Rift',
               'MODEL VIEWER  (Left/Right to cycle)', '0123456789',
               'FLY MODE: WASD move, IJKL look, R/F up/down, Shift fast', 'P: print camera pose',
               'Items', 'Capture', 'Run', 'Attack', 'Heal', 'Cure', 'Back', 'x3',
               'C: Party', 'PARTY', 'FNT', 'IN BATTLE', 'Pick a healthy ally!', 'E: switch   X: back',
               '60 FPS  7680x4320 8K');
  const missing = new Set();
  for (const s of strings)
    for (const ch of s)
      if (!PFont.has(ch)) missing.add(ch);
  ok(missing.size === 0, 'font covers every game string' +
     (missing.size ? ' (missing: ' + [...missing].join('') + ')' : ''));
  ok(PFont.width('AB', 2) > PFont.width('A', 2), 'font width() accumulates');
}

// ----------------------------------------------------------- battle data
{
  const ps = BData.statsFor('PIXLIT', 10);
  const es = BData.statsFor('MAGMULE', 15);
  ok(ps.maxHp === 28 && ps.atk === 20 && ps.def === 17 && ps.spe === 13,
     'PIXLIT Lv.10 stats (28 HP / 20 / 17 / 13)');
  ok(es.maxHp === 40 && es.atk === 14 && es.def === 17 && es.spe === 15,
     'MAGMULE Lv.15 stats (40 HP / 14 / 17 / 15)');

  ok(near(BData.stageMul(0), 1) && near(BData.stageMul(-1), 2 / 3) &&
     near(BData.stageMul(-6), 0.25) && near(BData.stageMul(2), 2), 'stage multipliers');

  for (const id of ['THORNLET', 'EMBERIK']) {
    const s = BData.statsFor(id, 9);
    ok(s.maxHp > 15 && s.atk > 5 && s.def > 5 && s.spe > 5, id + ' Lv.9 stats sane (' + s.maxHp + ' HP)');
    for (const mv of BData.SPECIES[id].moves)
      ok(!!BData.MOVES[mv] && !!BData.MOVES[mv].anim, id + ' move ' + mv + ' exists with an anim kind');
  }
  ok(near(BData.captureChance(1), 0.25) && near(BData.captureChance(0), 0.9) &&
     BData.captureChance(0.5) > 0.25 && BData.captureChance(0.5) < 0.9, 'capture odds scale with damage');
  ok(BData.ITEMS.heal.uses === 3 && BData.ITEMS.cure.uses === 3, 'items carry 3 charges each');

  const ANIM_KINDS = ['dash', 'rings', 'beam', 'orb', 'volley', 'cinder', 'voidbeam', 'voidnova'];
  let badAnim = null;
  for (const id in BData.MOVES)
    if (BData.MOVES[id].effect !== 'transform' && ANIM_KINDS.indexOf(BData.MOVES[id].anim) < 0) badAnim = id;
  ok(!badAnim, 'every move has a known anim kind' + (badAnim ? ' (bad: ' + badAnim + ')' : ''));
  ok(BData.MOVES.CINDER.anim === 'cinder', 'Cinder uses its bespoke fire animation');

  // boss: two forms, a transform move, tough capture, stronger awakened form
  ok(BData.SPECIES.VORNETH.form2 === 'VORNETH_X' && !!BData.SPECIES.VORNETH_X, 'boss has two forms');
  ok(BData.MOVES.AWAKEN.effect === 'transform', 'AWAKEN is a transform move');
  ok(BData.MOVES.VORNETH ? false : (BData.MOVES.VOIDLANCE.anim === 'voidbeam'), 'boss move uses void animation');
  ok(BData.captureChance(0.1, true) < BData.captureChance(0.1, false), 'boss is harder to capture');
  const bs = BData.statsFor('VORNETH', 16), bx = BData.statsFor('VORNETH_X', 16);
  ok(bx.atk > bs.atk && bx.spe > bs.spe, 'awakened form is stronger (atk/spe)');

  const mkRng = (seq) => { let i = 0; return () => (i < seq.length ? seq[i++] : seq[seq.length - 1]); };

  // golden: PIXLIT Psyblast -> MAGMULE, hit, no crit
  for (const roll of [0, 0.5, 0.999]) {
    const r = BData.damage({ level: 10, atk: ps.atk, atkStage: 0 },
                           { def: es.def, defStage: 0 }, BData.MOVES.PSYBLAST,
                           mkRng([0, 0.99, roll]));
    ok(!r.miss && !r.crit && r.dmg >= 10 && r.dmg <= 12,
       'Psyblast golden roll ' + roll + ' -> ' + r.dmg + ' (10..12)');
  }
  // golden: MAGMULE Tackle -> PIXLIT
  const tr = BData.damage({ level: 15, atk: es.atk, atkStage: 0 },
                          { def: ps.def, defStage: 0 }, BData.MOVES.TACKLE,
                          mkRng([0, 0.99, 0.999]));
  ok(!tr.miss && tr.dmg >= 5 && tr.dmg <= 7, 'Tackle golden -> ' + tr.dmg + ' (5..7)');
  // miss when acc roll fails
  const mr = BData.damage({ level: 10, atk: 19, atkStage: 0 }, { def: 17, defStage: 0 },
                          BData.MOVES.PSYBLAST, mkRng([0.95]));
  ok(mr.miss, 'Psyblast misses on a 95+ accuracy roll');

  // AI: never growls at -6 stages or vs low HP foe
  const rr = M3.rng(7);
  let growled = false;
  for (let i = 0; i < 300; i++) {
    if (BData.aiPick(['TACKLE', 'CINDER', 'GROWL'], { atkStage: -6, foeHpFrac: 1, pp: { TACKLE: 9, CINDER: 9, GROWL: 9 } }, rr) === 'GROWL') growled = true;
    if (BData.aiPick(['TACKLE', 'CINDER', 'GROWL'], { atkStage: 0, foeHpFrac: 0.1, pp: { TACKLE: 9, CINDER: 9, GROWL: 9 } }, rr) === 'GROWL') growled = true;
  }
  ok(!growled, 'AI growl gating');
}

// --------------------------------------------------- Monte-Carlo balance
{
  function simBattle(startHp, rng) {
    const ps = BData.statsFor('PIXLIT', 10);
    const es = BData.statsFor('MAGMULE', 15);
    let php = startHp, ehp = es.maxHp, pStage = 0, eStage = 0;
    const ppp = { TACKLE: 35, GROWL: 30, MINDBEAM: 16, PSYBLAST: 20 };
    const epp = { TACKLE: 35, CINDER: 25, GROWL: 30 };
    for (let turn = 0; turn < 300 && php > 0 && ehp > 0; turn++) {
      const pMove = ppp.PSYBLAST > 0 ? 'PSYBLAST' : (ppp.MINDBEAM > 0 ? 'MINDBEAM' : 'TACKLE');
      const eMove = BData.aiPick(['TACKLE', 'CINDER', 'GROWL'], { atkStage: eStage, foeHpFrac: php / ps.maxHp, pp: epp }, rng);
      const order = ps.spe > es.spe ? ['P', 'E'] : (ps.spe < es.spe ? ['E', 'P'] : (rng() < 0.5 ? ['P', 'E'] : ['E', 'P']));
      for (const s of order) {
        if (php <= 0 || ehp <= 0) break;
        if (s === 'P') {
          ppp[pMove]--;
          const mv = BData.MOVES[pMove];
          const r = BData.damage({ level: 10, atk: ps.atk, atkStage: pStage }, { def: es.def, defStage: 0 }, mv, rng);
          if (!r.miss) ehp -= r.dmg;
        } else {
          epp[eMove]--;
          const mv = BData.MOVES[eMove];
          if (mv.power) {
            const r = BData.damage({ level: 15, atk: es.atk, atkStage: eStage }, { def: ps.def, defStage: 0 }, mv, rng);
            if (!r.miss) php -= r.dmg;
          } else if (pStage > -6) pStage--;
        }
      }
    }
    return ehp <= 0 && php > 0;
  }
  const rng = M3.rng(20260610);
  let winsFull = 0, wins17 = 0;
  for (let i = 0; i < 300; i++) winsFull += simBattle(28, rng) ? 1 : 0;
  for (let i = 0; i < 300; i++) wins17 += simBattle(17, rng) ? 1 : 0;
  const rateFull = winsFull / 300, rate17 = wins17 / 300;
  ok(rateFull >= 0.55 && rateFull <= 0.90,
     'full-HP win rate ' + rateFull.toFixed(2) + ' within [0.55, 0.90]');
  ok(rate17 > 0.05, '17-HP win rate ' + rate17.toFixed(2) + ' > 0.05 (losable but winnable)');
}

// --------------------------------------------------------------- fx time
{
  Fx.hitstop(90);
  ok(Fx.timeScale() === 0, 'hitstop freezes timescale');
  let steps = 0;
  while (Fx.timeScale() === 0 && steps < 60) { Fx.update(1 / 60); steps++; }
  ok(Fx.timeScale() === 1 && steps <= 12, 'hitstop releases on raw time (' + steps + ' frames)');

  Fx.clear();
  Fx.burst([0, 0, 0], { n: 6, colors: [[1, 1, 1]], life: 0.5 });
  Fx.update(1 / 60);
  ok(Fx.particleData().count > 0, 'particles emit and build a vertex buffer');
  Fx.clear();
  ok(Fx.particleData().count === 0, 'Fx.clear empties the pool');

  // slow-motion (bullet-time): fractional timescale that releases on raw time
  Fx.slowmo(200, 0.3);
  ok(Math.abs(Fx.timeScale() - 0.3) < 1e-6, 'slow-mo applies a fractional timescale');
  // hitstop must still win over slow-mo
  Fx.hitstop(50);
  ok(Fx.timeScale() === 0, 'hitstop overrides slow-mo');
  let s2 = 0;
  while (Fx.timeScale() < 1 && s2 < 120) { Fx.update(1 / 60); s2++; }
  ok(Fx.timeScale() === 1 && s2 <= 20, 'slow-mo releases on raw time (' + s2 + ' frames)');

  // colored flash
  Fx.flash(80, 1, [1, 0.5, 0.2]);
  const fc = Fx.flashColor();
  ok(fc[0] === 1 && Math.abs(fc[1] - 0.5) < 1e-6 && Fx.flashAlpha() > 0, 'flash carries a tint color');
  Fx.flash(80, 1);
  ok(Fx.flashColor()[0] === 1 && Fx.flashColor()[1] === 1, 'flash defaults to white');

  // dynamic scene light (attacks pulse this into the renderer)
  Fx.clear();
  ok(Fx.lightState() === null, 'no scene light by default');
  Fx.pulseLight([1, 2, 3], [1, 0.5, 0.2], 3, 200, 7);
  const ls = Fx.lightState();
  ok(ls && ls.pos[0] === 1 && ls.rad === 7 && ls.intensity > 0 && ls.color[0] === 1, 'pulseLight sets a decaying colored light');
  let s3 = 0;
  while (Fx.lightState() && s3 < 60) { Fx.update(1 / 60); s3++; }
  ok(Fx.lightState() === null && s3 <= 14, 'scene light decays and releases (' + s3 + ' frames)');
  Fx.clear();
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
