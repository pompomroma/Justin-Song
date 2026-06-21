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
const FILES = ['math3d', 'voxel', 'models', 'font', 'battle_data', 'save', 'biome', 'fx'];
const src = FILES.map((f) => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')).join('\n;\n') +
  '\n;({ M3, Vox, Models, PFont, BData, Fx, Save, Cloud, Biome })';
const api = vm.runInThisContext(src, { filename: 'bundle.js' });
const { M3, Vox, Models, PFont, BData, Fx, Save, Cloud, Biome } = api;

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
    strings.push(BData.fmt(BData.MSG[k], { A: 'MAGMULE', M: 'Psyblast', T: 'Camper REX', B: 'VORNETH-X', E: '135', L: '12' }));
  const collect = (v) => { if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') Object.values(v).forEach(collect); else if (typeof v === 'string') strings.push(v); };
  collect(BData.DIALOGUE);
  collect(BData.STORY);
  for (const k in BData.MOVES) strings.push(BData.MOVES[k].name);
  for (const k in BData.SPECIES) strings.push(BData.SPECIES[k].name);
  for (const k in BData.DIFFICULTY) { strings.push(BData.DIFFICULTY[k].id + ' ' + BData.DIFFICULTY[k].name, BData.DIFFICULTY[k].blurb, BData.DIFFICULTY[k].name + ' set'); }
  // opening-sequence + menu UI copy (rendered by the new scenes)
  strings.push('A VOXEL SAGA', 'NEW GAME', 'CONTINUE', 'SELECT A FILE', 'SELECT DIFFICULTY',
               'EMPTY - New Game', 'SLOT 1', 'SLOT 2', 'SLOT 3', 'ON',
               'UP/DOWN: Select   E: Confirm   X: Erase', 'E: Begin   X: Back',
               'NAME YOURSELF', 'RENAME', 'SPACE', 'DEL', 'OK', 'What should they call you?',
               'Arrows: Move   E: Pick   X: Delete', 'Press any key', 'X: Skip',
               'OPTIONS', 'Rename', 'Difficulty', 'Save', 'Export', 'Import', 'Close',
               'Save code ready.', 'Game saved!', 'E: Pick   X: Close', 'E: Set   X: Back',
               'O: Options   M: Mute', 'E: Talk   C: Party',
               'WHISPER WILDS', 'Ranger', 'Wanderer', 'Nomad', 'Scout', 'Hunter', 'Warden', 'Drifter', 'Pilgrim',
               'KAI', 'VEX', 'MARA', 'TOLI', 'BREN', 'SUNE', 'RILEY', 'ODA', 'NIX', 'PERA',
               'Ranger KAI wants to battle!', 'You there - let us test your bond!',
               'The wilds favor the bold. Battle me!', 'No path forward without a fight!',
               'You have the look of a challenger!', 'Good battle. Safe travels.',
               'You are tougher than this terrain.', 'Go on - the wilds are calling.');
  for (const k in Biome.BIOMES) strings.push(Biome.BIOMES[k].name);
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

  // EXP / leveling
  ok(BData.expReward(20) > BData.expReward(10) && BData.expReward(10) >= 200,
     'exp reward is generous and scales with foe level (' + BData.expReward(14) + ' @14)');
  ok(BData.expToNext(11) > BData.expToNext(10) && BData.expToNext(10) > 0, 'exp-to-next grows with level');
  ok(typeof BData.MAXLV === 'number' && BData.MAXLV >= 50, 'level cap defined');
  // a Lv9 monster fed several kills levels up
  { let lvl = 9, exp = 0, ups = 0;
    for (let k = 0; k < 8; k++) { exp += BData.expReward(13);
      while (lvl < BData.MAXLV && exp >= BData.expToNext(lvl)) { exp -= BData.expToNext(lvl); lvl++; ups++; } }
    ok(ups >= 1 && lvl > 9, 'shared exp from kills levels a monster up (Lv9 -> Lv' + lvl + ')'); }

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

// ----------------------------------------------- type chart + tiered AI
{
  ok(BData.typeEff('PSY', 'VOID') === 2 && BData.typeEff('VOID', 'PSY') === 0.5, 'type chart 4-cycle (PSY > VOID)');
  ok(BData.typeEff('FIRE', 'LEAF') === 2 && BData.typeEff('LEAF', 'FIRE') === 0.5, 'type chart 4-cycle (FIRE > LEAF)');
  ok(BData.typeEff('FIRE', 'ICE') === 2 && BData.typeEff('ICE', 'FIRE') === 0.5, 'ICE: FIRE melts ICE');
  ok(BData.typeEff('ICE', 'LEAF') === 2 && BData.typeEff('LEAF', 'ICE') === 0.5, 'ICE freezes LEAF');
  ok(BData.typeEff('NORMAL', 'VOID') === 1 && BData.typeEff('PSY', undefined) === 1, 'NORMAL / untyped are neutral');

  // STAB + effectiveness raise damage; untyped stays the legacy value
  const hit = (att, def) => BData.damage(att, def, BData.MOVES.PSYBLAST, () => 0.5);
  const plain = hit({ level: 20, atk: 40, atkStage: 0 }, { def: 30, defStage: 0 }).dmg;
  const stabSE = hit({ level: 20, atk: 40, atkStage: 0, type: 'PSY' }, { def: 30, defStage: 0, type: 'VOID' }).dmg;
  ok(stabSE > plain * 2.5 && stabSE < plain * 3.5, 'STAB + super-effective is ~3x (' + plain + ' -> ' + stabSE + ')');
  const resisted = hit({ level: 20, atk: 40, atkStage: 0, type: 'PSY' }, { def: 30, defStage: 0, type: 'LEAF' }).dmg;
  ok(resisted < plain, 'PSY into LEAF is resisted (' + resisted + ' < ' + plain + ')');

  // tier 1 (Rookie) picks at random; tier 5 (Master) takes a guaranteed KO
  const moves = ['TACKLE', 'PSYBLAST'], pp = { TACKLE: 35, PSYBLAST: 20 };
  const rr = M3.rng(11);
  let sawWeak = false, sawStrong = false;
  for (let i = 0; i < 200; i++) {
    const p = BData.aiPick(moves, { tier: 1, atkStage: 0, foeHpFrac: 1, pp }, rr);
    if (p === 'TACKLE') sawWeak = true; if (p === 'PSYBLAST') sawStrong = true;
  }
  ok(sawWeak && sawStrong, 'tier 1 picks moves at random (sees both)');

  const ctx5 = { tier: 5, atkStage: 0, foeHpFrac: 0.1, pp,
                 self: { level: 30, atk: 60, atkStage: 0, type: 'PSY' },
                 foe: { def: 30, defStage: 0, type: 'VOID', hp: 6, maxHp: 60 } };
  let allKO = true;
  for (let i = 0; i < 50; i++) if (BData.aiPick(moves, ctx5, M3.rng(i + 1)) !== 'PSYBLAST') allKO = false;
  ok(allKO, 'tier 5 takes the guaranteed KO move every time');

  const mv3 = ['TACKLE', 'GROWL'], pp3 = { TACKLE: 35, GROWL: 30 };
  let growlLow = false;
  const r3 = M3.rng(5);
  for (let i = 0; i < 300; i++)
    if (BData.aiPick(mv3, { tier: 3, atkStage: 0, foeHpFrac: 0.2, pp: pp3 }, r3) === 'GROWL') growlLow = true;
  ok(!growlLow, 'tier 3 stops setting up once the foe is low');

  ok(BData.enemyMovepool(['TACKLE', 'GROWL', 'CINDER', 'SCORCH'], 2).length === 2, 'enemyMovepool trims to N moves');
  ok(BData.enemyMovepool(['GROWL', 'TACKLE'], 2)[0] === 'TACKLE', 'enemyMovepool lists damaging moves first');

  ok(BData.aiShouldSwitch({ type: 'VOID', hpFrac: 0.9 }, { type: 'PSY' }, [{ idx: 1, type: 'FIRE', alive: true }], 4, () => 0) === 1,
     'tier 4 pivots a bad matchup to a better bench mon');
  ok(BData.aiShouldSwitch({ type: 'VOID', hpFrac: 0.9 }, { type: 'PSY' }, [{ idx: 1, type: 'FIRE', alive: true }], 2, () => 0) === -1,
     'tiers below 4 never voluntarily switch');

  for (let d = 1; d <= 5; d++) ok(BData.DIFFICULTY[d] && BData.DIFFICULTY[d].name, 'difficulty ' + d + ' defined');
}

// ------------------------------------------------------ save / save codes
{
  const s = { name: 'AERIN', difficulty: 4,
    party: [{ species: 'PIXLIT', level: 12, hp: null, exp: 5 }, { species: 'EMBERIK', level: 9, hp: 20, exp: 0 }],
    npcs: { rex: true }, bossBeaten: true, bossCaptured: false, battles: 3 };
  const code = Save.exportCode(s);
  const back = Save.importCode(code);
  ok(back && back.name === 'AERIN' && back.difficulty === 4 && back.party.length === 2 &&
     back.party[0].hp === null && back.party[1].hp === 20 && back.npcs.rex === true && back.bossBeaten === true,
     'save code round-trips every field');
  ok(Save.importCode('GC1.bad.zzzz') === null && Save.importCode('garbage') === null &&
     Save.importCode(code.slice(0, -4) + 'AAAA') === null, 'corrupt / tampered save codes reject');
  ok(Cloud.available() === false, 'cloud sync is OFF by default (no endpoint configured)');
  const p = Cloud.push('x', s);
  ok(p && typeof p.then === 'function', 'Cloud.push is a safe no-op promise without fetch');
}

// ----------------------------------------------------- biomes (Minecraft-ish)
{
  ok(Biome.at(123, -456).id === Biome.at(123, -456).id, 'biome lookup is deterministic');
  ok(Biome.at(0, 0).id === 'FOREST' && Biome.at(6, 4).id === 'FOREST', 'origin neighborhood is forced FOREST (starter clearing)');

  // low-frequency noise -> large coherent regions (adjacent samples rarely differ)
  let same = 0;
  for (let i = 0; i < 200; i++) { const x = 211 + i, z = 137; if (Biome.at(x, z).id === Biome.at(x + 1, z).id) same++; }
  ok(same > 180, 'biomes form large coherent regions (' + same + '/200 adjacent samples match)');

  // diversity: every biome appears somewhere across a wide grid
  const seen = {};
  for (let z = -700; z <= 700; z += 17)
    for (let x = -700; x <= 700; x += 17) seen[Biome.at(x, z).id] = true;
  const ids = ['FOREST', 'PRAIRIE', 'DESERT', 'ICE', 'SAVANNA'];
  ok(ids.every((k) => seen[k]), 'all 5 biomes generate across the world (' + Object.keys(seen).join(',') + ')');

  ok(ids.every((k) => { const b = Biome.BIOMES[k]; return b.monsters.length && b.scatter.length && b.env && b.ground.grass.length === 3; }),
     'each biome defines monsters, scatter, ground and env');
  ok(ids.every((k) => Biome.BIOMES[k].monsters.every((sp) => !!BData.SPECIES[sp])),
     'biome monster pools reference real species');
  ok(!!BData.SPECIES.FROSTKIT && BData.SPECIES.FROSTKIT.type === 'ICE' && !!BData.SPECIES.SANDREK,
     'new biome monsters exist (FROSTKIT is ICE-type)');

  // every pool species has both a voxel model and battle stats
  const modelSet = new Set(Models.list());
  ok(ids.every((k) => Biome.BIOMES[k].monsters.every((s) => modelSet.has(s.toLowerCase()) && !!BData.SPECIES[s])),
     'every biome monster has a model + stats');
  // each biome fields its 2 signature newcomers
  const NEW = { FOREST: ['MOSSOX', 'HOOTLE'], PRAIRIE: ['BUNDER', 'LARKIT'], DESERT: ['SCARABEX', 'COBRELL'],
                ICE: ['GLACIMP', 'PENGUL'], SAVANNA: ['MANELEO', 'GRASSGAZ'] };
  ok(Object.keys(NEW).every((k) => NEW[k].every((s) => Biome.BIOMES[k].monsters.indexOf(s) >= 0)),
     'each biome pool includes its 2 new monsters');
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

  // electric effects spawn particles (lightning bolt + sparks + crackle)
  Fx.bolt([0, 3, 0], [0, 0, 0], { segs: 8, dense: 4, forks: 2 });
  ok(Fx.particleData().count >= 32, 'bolt lays cubes along the lightning path');
  Fx.clear();
  Fx.sparks([0, 0, 0], { n: 12 });
  ok(Fx.particleData().count > 0, 'sparks emit');
  Fx.clear();
  Fx.crackle([0, 0, 0], { n: 3 });
  ok(Fx.particleData().count > 0, 'crackle emits short bolts');
  Fx.clear();

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
