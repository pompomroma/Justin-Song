/* Grove Clash — js/overworld.js
   Overworld: a large walkable forest at dusk. WASD movement with a smooth
   third-person follow camera and circle collision. Several trainer NPCs
   are scattered around (each a focused 1v1 battle); a dark rift portal at
   the far edge leads to the dungeon boss. Campfire embers, fireflies and
   a swirling portal give the world atmosphere. */
const Overworld = (() => {

  const ENV = {
    sky: M3.hex('#152238'),
    fog: M3.hex('#16261e'), fogNear: 12, fogFar: 30,
    lightDir: M3.normalize([], [-0.4, -0.75, 0.3]),
    lightCol: [0.82, 0.72, 0.58],
    ambient: [0.46, 0.52, 0.48],
  };

  const SPAWN = [-6, 0, -6];
  const FIRE_POS = [8.6, 0, 4.2];
  const PORTAL_POS = [0, 0, 15.4];
  const BOUND = 16.5;

  // trainer NPCs — one monster each. dlg keys live in BData.DIALOGUE.
  // each trainer now fields a small, varied team (sent in one at a time)
  const NPCS = [
    { id: 'rex',   name: 'Camper REX', pos: [7, 0, 3.2],   model: 'rex_idle',  battleModel: 'rex_raised',
      team: [{ species: 'MAGMULE', level: 13 }, { species: 'EMBERIK', level: 14 }] },
    { id: 'hiker', name: 'Hiker DALE', pos: [-11, 0, 6],   model: 'npc_hiker', battleModel: 'npc_hiker',
      team: [{ species: 'THORNLET', level: 12 }, { species: 'MAGMULE', level: 11 }, { species: 'THORNLET', level: 13 }] },
    { id: 'lass',  name: 'Lass IVY',   pos: [12, 0, -8],   model: 'npc_lass',  battleModel: 'npc_lass',
      team: [{ species: 'EMBERIK', level: 12 }, { species: 'PIXLIT', level: 13 }, { species: 'THORNLET', level: 12 }] },
    { id: 'ace',   name: 'Ace KORU',   pos: [-8.5, 0, -12], model: 'npc_ace',  battleModel: 'npc_ace',
      team: [{ species: 'MAGMULE', level: 15 }, { species: 'EMBERIK', level: 15 }, { species: 'PIXLIT', level: 16 }] },
  ];

  let staticH = null;
  const colliders = [];

  let hero = null;
  let camYaw = 0;
  let bobT = 0, stepT = 0, moving = false;
  let dialogue = null;       // {lines, idx, tw, onDone}
  let pendingAction = null;  // fn run when dialogue closes
  let cardT = 0, hintT = 0, t = 0;
  let fireflyT = 0, emberT = 0, swirlT = 0;
  let partyView = false, partyCheckCursor = 0; // C opens a read-only party check
  // O opens an options overlay (rename / difficulty / save / save codes)
  let optionsView = false, optMode = 'main', optCursor = 0, diffCursor = 2;
  let notice = '', noticeT = 0;
  const OPTIONS = ['Rename', 'Difficulty', 'Save', 'Export', 'Import', 'Close'];
  function toast(msg) { notice = msg; noticeT = 2.6; }

  // read-only party rows for the overworld party check
  function savePartyRows() {
    return Game.save.party.map((m) => {
      const stats = BData.statsFor(m.species, m.level);
      const hp = (m.hp === null || m.hp === undefined) ? stats.maxHp : m.hp;
      return { name: BData.SPECIES[m.species].name, lv: m.level, hp: Math.round(hp), maxHp: stats.maxHp,
               frac: hp / stats.maxHp, fainted: hp <= 0, active: false };
    });
  }

  function buildStatic() {
    if (staticH) return;
    colliders.length = 0;
    const parts = [];
    const push = (name, pos, yaw, s) => parts.push({ m: Models.get(name), pos, yaw, s });
    const ground = Models.groundMesh({
      radius: 22,
      patches: [
        { x: FIRE_POS[0], z: FIRE_POS[2], rx: 2.4, rz: 1.9, rot: 0.2 },
        { x: SPAWN[0], z: SPAWN[2], rx: 1.4, rz: 1.1, rot: 0.9 },
        { x: PORTAL_POS[0], z: PORTAL_POS[2], rx: 3.2, rz: 2.6, rot: 0 },
      ],
    });
    const r = M3.rng(7);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + r() * 0.25;
      push('tree' + (i % 3), [Math.cos(a) * 15, 0, Math.sin(a) * 15], r() * 6.3, 0.95 + r() * 0.45);
    }
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + 0.13 + r() * 0.2;
      push('tree' + ((i + 2) % 3), [Math.cos(a) * 19, 0, Math.sin(a) * 19], r() * 6.3, 1.1 + r() * 0.55);
    }
    // a few inner trees for depth (kept clear of NPCs / paths)
    const innerTrees = [[4, 0, -6], [-4, 0, 8], [10, 0, 9], [-13, 0, -3], [3, 0, 11]];
    for (const p of innerTrees) push('tree' + (Math.floor(r() * 3)), p, r() * 6.3, 0.9 + r() * 0.4);

    const props = [
      ['rock0', [9.5, 0, 0.4], 0.4, 1.2], ['rock1', [6.5, 0, 6.2], 1.9, 0.95],
      ['rock1', [-9.5, 0, 3.5], 0.9, 1.3], ['rock0', [-2, 0, 9.5], 3.4, 1.0],
      ['rock0', [13, 0, -3], 2.1, 1.1], ['rock1', [-12, 0, -8], 5.0, 1.2],
      ['bush', [-5, 0, 5], 0.6, 1.1], ['bush', [4, 0, -9], 2.8, 1.0],
      ['bush', [-9, 0, -2], 4.4, 1.1], ['bush', [2, 0, 9], 1.2, 0.95],
      ['bush', [11, 0, -2], 5.3, 1.0], ['bush', [-3, 0, -8], 0.9, 1.05],
      ['campfire', FIRE_POS, 0.3, 1.15],
    ];
    for (const [n, p, y, s] of props) {
      push(n, p, y, s);
      if (n.indexOf('rock') === 0) colliders.push({ x: p[0], z: p[2], r: 0.9 * s });
      else if (n === 'bush') colliders.push({ x: p[0], z: p[2], r: 0.7 * s });
      else if (n === 'campfire') colliders.push({ x: p[0], z: p[2], r: 0.8 });
    }
    // the rift portal at the far edge
    push('portal', PORTAL_POS, Math.PI, 1.35);
    colliders.push({ x: PORTAL_POS[0], z: PORTAL_POS[2], r: 1.1 });
    // NPC colliders
    for (const n of NPCS) colliders.push({ x: n.pos[0], z: n.pos[2], r: 0.55 });

    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, rad = 2 + r() * 12;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (Math.hypot(x - FIRE_POS[0], z - FIRE_POS[2]) < 1.6) continue;
      push('tuft', [x, 0, z], r() * 6.3, 0.8 + r() * 0.9);
    }
    let total = ground.count;
    for (const p of parts) total += p.m.count;
    const data = new Float32Array(total * 9);
    data.set(ground.data, 0);
    let off = ground.count * 9;
    for (const p of parts)
      off = M3.bakeMesh(data, off, p.m.data, p.m.count, p.pos, p.yaw, p.s);
    staticH = Gfx.upload({ data, count: total });
  }

  function enter(params) {
    params = params || {};
    buildStatic();
    Fx.clear();
    const m = Models.get('hero');
    if (!hero) hero = { pos: SPAWN.slice(), yaw: 0, h: Game.handle('hero'), height: m.height };
    // NPC actors face the centre of the clearing
    for (const n of NPCS) { n.h = Game.handle(n.model); n.yaw = Math.atan2(-n.pos[0], -n.pos[2]); }
    if (params.result === 'loss') { M3.set(hero.pos, SPAWN[0], 0, SPAWN[2]); }
    else if (params.fromDungeon) { M3.set(hero.pos, PORTAL_POS[0], 0, PORTAL_POS[2] - 3.2); }
    else if (params.result) { M3.set(hero.pos, 1.5, 0, 0.5); }
    hero.yaw = Math.atan2(-hero.pos[0], -hero.pos[2]);
    camYaw = hero.yaw;
    Cam.cut([hero.pos[0] - Math.sin(camYaw) * 4.4, 2.3, hero.pos[2] - Math.cos(camYaw) * 4.4],
            [hero.pos[0], 1.0, hero.pos[2]], 46);
    dialogue = null;
    pendingAction = null;
    optionsView = false; optMode = 'main'; notice = ''; noticeT = 0;
    cardT = params.result || params.fromDungeon ? 0 : 4.2;
    hintT = params.result || params.fromDungeon ? 0 : 9;
    t = 0;
    // opening: the amnesiac wakes in the grove — voiced monologue, then names
    // himself in dialogue, while the cinematic letterbox slowly retracts.
    if (params.result === 'intro') {
      if (Game.setLetterbox) { Game.setLetterbox(1, 99, true); Game.setLetterbox(0, 0.5); }
      const nm = (Game.save && Game.save.name) || 'AEGIS';
      startDialogue([BData.STORY.faintAgain, BData.STORY.nameBeatPre + nm + BData.STORY.nameBeatPost], null, true);
      hintT = 8;
    } else if (Game.setLetterbox) {
      Game.setLetterbox(0, 6);
    }
  }

  // nearest interactable (npc or portal) within reach, or null
  function nearest() {
    let best = null, bestD = 2.2;
    for (const n of NPCS) {
      const d = M3.dist(hero.pos, n.pos);
      if (d < bestD) { bestD = d; best = { kind: 'npc', npc: n }; }
    }
    const pd = M3.dist(hero.pos, PORTAL_POS);
    if (pd < 2.8 && pd < bestD + 0.6) best = { kind: 'portal' };
    return best;
  }

  function startDialogue(lines, onDone, voiced) {
    dialogue = { lines: lines.slice(), idx: 0, tw: UI.typewriter(), onDone, voiced: !!voiced };
    dialogue.tw.set(lines[0], 860, { voiced: !!voiced });
    Sfx.play('confirm');
  }

  function interact(target) {
    if (target.kind === 'portal') {
      const lines = Game.save.bossBeaten ? BData.DIALOGUE.portalDone : BData.DIALOGUE.portal;
      startDialogue(lines, () => Game.toDungeon());
      return;
    }
    const n = target.npc;
    n.yaw = Math.atan2(hero.pos[0] - n.pos[0], hero.pos[2] - n.pos[2]);
    hero.yaw = Math.atan2(n.pos[0] - hero.pos[0], n.pos[2] - hero.pos[2]);
    const dlg = BData.DIALOGUE[n.id] || {};
    if (Game.save.npcs[n.id]) {
      startDialogue(dlg.beaten || ['...'], null); // already beaten: just chat
    } else {
      startDialogue(dlg.intro || ['Let us battle!'], () =>
        Game.toBattle({ arena: 'grove', npcId: n.id,
          enemy: { team: n.team.map((m) => ({ species: m.species, level: m.level })), trainer: n.name, npcId: n.id, trainerModel: n.battleModel } }));
    }
  }

  // copy a loaded/imported save into the live save (Game.save is a getter, so
  // we mutate the object it returns in place)
  function applyLoadedSave(sv) {
    const s = Game.save;
    s.name = sv.name; s.difficulty = sv.difficulty; s.party = sv.party;
    s.npcs = sv.npcs; s.bossBeaten = sv.bossBeaten; s.bossCaptured = sv.bossCaptured; s.battles = sv.battles;
    Game.autosave();
  }

  function applyOption(label) {
    if (label === 'Close') { optionsView = false; Sfx.play('cursor'); return; }
    if (label === 'Rename') {
      optionsView = false;
      Game.toNameEntry('rename', (nm) => { Game.save.name = nm; Game.autosave(); Game.toOverworld(); });
      return;
    }
    if (label === 'Difficulty') { optMode = 'diff'; diffCursor = (Game.save.difficulty || 3) - 1; Sfx.play('cursor'); return; }
    if (label === 'Save') { Game.autosave(); Sfx.play('confirm'); toast(BData.MSG.saved); return; }
    if (label === 'Export') {
      const code = (typeof Save !== 'undefined') ? Save.exportCode(Game.save) : '';
      let copied = false;
      try { if (typeof navigator !== 'undefined' && navigator.clipboard) { navigator.clipboard.writeText(code); copied = true; } } catch (e) { /* blocked */ }
      if (typeof Cloud !== 'undefined' && Cloud.available()) Cloud.push(Game.save.name || 'AEGIS', Game.save);
      Sfx.play('confirm'); toast(copied ? BData.MSG.codeCopied : 'Save code ready.');
      return;
    }
    if (label === 'Import') {
      Sfx.play('confirm');
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then((txt) => {
            const sv = (typeof Save !== 'undefined') ? Save.importCode(txt) : null;
            if (sv) { applyLoadedSave(sv); toast(BData.MSG.codePasted); } else toast(BData.MSG.codeBad);
          }).catch(() => toast(BData.MSG.codeBad));
          return;
        }
      } catch (e) { /* blocked */ }
      toast(BData.MSG.codeBad);
    }
  }

  function updateOptions() {
    if (optMode === 'diff') {
      if (Input.pressed('down')) { diffCursor = (diffCursor + 1) % 5; Sfx.play('cursor'); }
      if (Input.pressed('up')) { diffCursor = (diffCursor + 4) % 5; Sfx.play('cursor'); }
      if (Input.pressed('confirm')) { Game.save.difficulty = diffCursor + 1; Game.autosave(); Sfx.play('confirm'); toast(BData.DIFFICULTY[diffCursor + 1].name + ' set'); optMode = 'main'; }
      else if (Input.pressed('back')) { Sfx.play('cursor'); optMode = 'main'; }
      return;
    }
    if (Input.pressed('down')) { optCursor = (optCursor + 1) % OPTIONS.length; Sfx.play('cursor'); }
    if (Input.pressed('up')) { optCursor = (optCursor + OPTIONS.length - 1) % OPTIONS.length; Sfx.play('cursor'); }
    if (Input.pressed('confirm')) applyOption(OPTIONS[optCursor]);
    else if (Input.pressed('back') || Input.pressed('options')) { optionsView = false; Sfx.play('cursor'); }
  }

  function drawOptions(ctx) {
    UI.panel(ctx, 300, 116, 360, 312, 16);
    PFont.draw(ctx, 'OPTIONS', 338, 130, { scale: 2, color: '#33343c', outline: null });
    if (optMode === 'diff') {
      for (let i = 0; i < 5; i++) {
        const d = BData.DIFFICULTY[i + 1], y = 162 + i * 46, sel = i === diffCursor;
        UI.para(ctx, 322, y, 316, 40, 8); ctx.fillStyle = sel ? 'rgba(60,86,58,0.92)' : 'rgba(38,42,52,0.85)'; ctx.fill();
        PFont.draw(ctx, d.id + ' ' + d.name, 336, y + 6, { scale: 2, color: '#ffffff' });
        if (Game.save.difficulty === i + 1) PFont.draw(ctx, 'ON', 600, y + 6, { scale: 2, color: '#9fd0ff' });
        PFont.draw(ctx, d.blurb, 336, y + 24, { scale: 1, color: '#bcd0e6' });
      }
      PFont.draw(ctx, 'E: Set   X: Back', 336, 400, { scale: 2, color: '#6b5d20', outline: null });
    } else {
      for (let i = 0; i < OPTIONS.length; i++) {
        const y = 158 + i * 40, sel = i === optCursor;
        UI.para(ctx, 322, y, 316, 34, 8); ctx.fillStyle = sel ? 'rgba(46,78,116,0.92)' : 'rgba(38,42,52,0.85)'; ctx.fill();
        PFont.draw(ctx, OPTIONS[i], 336, y + 7, { scale: 2, color: '#ffffff' });
      }
      PFont.draw(ctx, 'E: Pick   X: Close', 336, 402, { scale: 2, color: '#6b5d20', outline: null });
    }
  }

  function updateDialogue(dt) {
    dialogue.tw.update(dt);
    if (Input.pressed('confirm') || Input.mouse.clicked) {
      if (!dialogue.tw.done()) { dialogue.tw.skip(); return; }
      dialogue.idx++;
      if (dialogue.idx < dialogue.lines.length) {
        dialogue.tw.set(dialogue.lines[dialogue.idx], 860, { voiced: dialogue.voiced });
        Sfx.play('blip');
      } else {
        const done = dialogue.onDone;
        dialogue = null;
        if (done) done();
      }
    }
  }

  function update(rawDt) {
    const dt = rawDt * Fx.timeScale();
    t += dt;
    if (cardT > 0) cardT -= dt;
    if (hintT > 0) hintT -= dt;
    if (noticeT > 0) noticeT -= dt;

    if (optionsView) { updateOptions(dt); moving = false; Cam.follow(hero.pos, camYaw, { dist: 4.4, height: 2.3 }, dt); Cam.update(dt); return; }

    if (partyView) { // read-only party check (paused)
      const n = Math.max(1, Game.save.party.length);
      if (Input.pressed('down')) { partyCheckCursor = (partyCheckCursor + 1) % n; Sfx.play('cursor'); }
      if (Input.pressed('up')) { partyCheckCursor = (partyCheckCursor + n - 1) % n; Sfx.play('cursor'); }
      if (Input.pressed('party') || Input.pressed('back') || Input.pressed('confirm')) { partyView = false; Sfx.play('cursor'); }
      moving = false;
      Cam.follow(hero.pos, camYaw, { dist: 4.4, height: 2.3 }, dt);
      Cam.update(dt);
      return;
    }

    if (dialogue) { updateDialogue(dt); moving = false; }
    else if (!Fx.transitioning()) {
      const ax = Input.axisX(), az = Input.axisY();
      moving = !!(ax || az);
      if (moving) {
        const fwd = [Math.sin(camYaw), 0, Math.cos(camYaw)];
        const right = [-fwd[2], 0, fwd[0]];
        const mv = [0, 0, 0];
        M3.addScaled(mv, mv, fwd, -az);
        M3.addScaled(mv, mv, right, ax);
        M3.normalize(mv, mv);
        const sp = 4.0 * dt;
        hero.pos[0] += mv[0] * sp;
        hero.pos[2] += mv[2] * sp;
        const targetYaw = Math.atan2(mv[0], mv[2]);
        let dy = targetYaw - hero.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        hero.yaw += dy * Math.min(1, dt * 12);
        let dc = hero.yaw - camYaw;
        while (dc > Math.PI) dc -= Math.PI * 2;
        while (dc < -Math.PI) dc += Math.PI * 2;
        camYaw += dc * Math.min(1, dt * 1.7);
        bobT += dt * 9;
        stepT -= dt;
        if (stepT <= 0) { Sfx.play('step'); stepT = 0.3; }
      }
      const d0 = Math.hypot(hero.pos[0], hero.pos[2]);
      if (d0 > BOUND) { hero.pos[0] *= BOUND / d0; hero.pos[2] *= BOUND / d0; }
      for (const c of colliders) {
        const dx = hero.pos[0] - c.x, dz = hero.pos[2] - c.z;
        const d = Math.hypot(dx, dz), min = c.r + 0.32;
        if (d < min && d > 0.0001) { hero.pos[0] = c.x + dx / d * min; hero.pos[2] = c.z + dz / d * min; }
      }
      const near = nearest();
      if (Input.pressed('party')) { partyView = true; partyCheckCursor = 0; Sfx.play('confirm'); }
      else if (Input.pressed('options')) { optionsView = true; optMode = 'main'; optCursor = 0; diffCursor = ((Game.save.difficulty || 3) - 1); Sfx.play('confirm'); }
      else if (near && Input.pressed('confirm')) interact(near);
    }

    // atmosphere: fireflies, campfire embers, and a swirling portal
    fireflyT -= dt;
    if (fireflyT <= 0) {
      fireflyT = 0.5;
      const a = Math.random() * Math.PI * 2, rad = 3 + Math.random() * 11;
      Fx.spawn({ p: [Math.cos(a) * rad, 0.4 + Math.random() * 1.2, Math.sin(a) * rad], c: [0.65, 1, 0.45],
                 v: [(Math.random() - 0.5) * 0.4, 0.12, (Math.random() - 0.5) * 0.4], g: 0, drag: 0.2, life: 2.6 + Math.random() * 2, s: 0.035, s1: 0.01 });
    }
    emberT -= dt;
    if (emberT <= 0) {
      emberT = 0.14;
      Fx.spawn({ p: [FIRE_POS[0] + (Math.random() - 0.5) * 0.25, 0.25, FIRE_POS[2] + (Math.random() - 0.5) * 0.25],
                 c: [[1, 0.48, 0.16], [1, 0.72, 0.2], [0.95, 0.3, 0.1]][Math.floor(Math.random() * 3)],
                 v: [(Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.7, (Math.random() - 0.5) * 0.3], g: 0.4, drag: 0.4, life: 0.7 + Math.random() * 0.5, s: 0.06, s1: 0.01 });
    }
    swirlT -= dt;
    if (swirlT <= 0) {
      swirlT = 0.05;
      const a = t * 3 + Math.random() * 0.5, rr = 0.6 + Math.random() * 1.2;
      Fx.spawn({ p: [PORTAL_POS[0] + Math.cos(a) * rr, 1.6 + Math.sin(a * 1.7) * 1.1, PORTAL_POS[2]],
                 c: [[0.7, 0.3, 1], [0.95, 0.4, 1], [1, 1, 1]][Math.floor(Math.random() * 3)],
                 v: [-Math.cos(a) * 0.9, 0, 0.2], g: 0, drag: 0.4, life: 0.6, s: 0.04, s1: 0.01 });
    }

    Cam.follow(hero.pos, camYaw, { dist: 4.4, height: 2.3 }, dt);
    Cam.update(dt);
  }

  const mTmp = M3.mat();
  function render3d(aspect) {
    const { view, proj } = Cam.matrices(aspect);
    Gfx.begin(view, proj, ENV);
    Gfx.draw(staticH, null, {});
    const bob = moving ? Math.abs(Math.sin(bobT)) * 0.05 : 0;
    Gfx.draw(hero.h, M3.trs(mTmp, [hero.pos[0], hero.pos[1] + bob, hero.pos[2]], [hero.yaw, 0, 0], [1, 1, 1]), {});
    for (const n of NPCS) {
      const nb = 1 + 0.012 * Math.sin(t * 1.8 + n.pos[0]);
      Gfx.draw(n.h, M3.trs(mTmp, n.pos, [n.yaw, 0, 0], [1, nb, 1]), {});
    }
    const pd = Fx.particleData();
    Gfx.drawDynamic(pd.data, pd.count);
  }

  function drawToast(ctx) {
    if (noticeT <= 0 || !notice) return;
    const w = PFont.width(notice, 2) + 28;
    ctx.fillStyle = 'rgba(14,16,22,0.85)';
    UI.para(ctx, 480 - w / 2, 66, w, 30, 8); ctx.fill();
    PFont.drawC(ctx, notice, 480, 74, { scale: 2, color: '#f8e0c8' });
  }

  function renderUi(ctx) {
    if (optionsView) { drawOptions(ctx); drawToast(ctx); return; }
    if (partyView) { UI.partyPanel(ctx, savePartyRows(), partyCheckCursor, t, false); return; }
    if (cardT > 0) UI.locationCard(ctx, 'WHISPER GROVE', M3.clamp(cardT, 0, 1));
    if (hintT > 0) UI.hint(ctx, ['WASD/Arrows: Move', 'E: Talk   C: Party', 'O: Options   M: Mute']);
    drawToast(ctx);
    if (dialogue) { UI.msgBox(ctx, dialogue.tw, t, true); return; }
    if (Fx.transitioning()) return;
    const near = nearest();
    if (near) UI.prompt(ctx, near.kind === 'portal' ? 'E  Enter the Rift' : 'E  Talk');
  }

  function exit() { Fx.clear(); }

  return { enter, update, render3d, renderUi, exit };
})();
