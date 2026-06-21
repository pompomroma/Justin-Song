/* Grove Clash — js/overworld.js
   Overworld: an INFINITE, Minecraft-style procedurally generated forest. The
   world streams in 16-unit chunks around the player: each chunk deterministically
   spawns trees, rocks, bushes and grass (seamless ground via a global cell hash)
   and, at a controlled density, a wandering trainer NPC. Chunks build on a small
   per-frame budget and are disposed when they fall out of range. Difficulty
   scales with distance from spawn. The origin holds a campfire, the rift portal
   to the dungeon boss, and a guaranteed starter trainer. */
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

  // ---- infinite chunk streaming ----
  const CHUNK = 16;          // world units per chunk side
  const VIEW_R = 2;          // load radius in chunks (fog hides the boundary)
  const KEEP_R = VIEW_R + 1; // unload hysteresis
  const WORLD_SEED = 0x9e37;
  const chunks = new Map();  // "cx,cz" -> { cx, cz, k, gen, handle }
  let buildQueue = [];

  // procedural trainer flavor (generic; the named-quest trainers are retired)
  const TITLES = ['Ranger', 'Wanderer', 'Nomad', 'Scout', 'Hunter', 'Warden', 'Drifter', 'Pilgrim'];
  const NAMES = ['KAI', 'VEX', 'MARA', 'TOLI', 'BREN', 'SUNE', 'RILEY', 'ODA', 'NIX', 'PERA'];
  const WILD = ['MAGMULE', 'EMBERIK', 'THORNLET', 'PIXLIT'];
  const NPC_MODELS = [['rex_idle', 'rex_raised'], ['npc_hiker', 'npc_hiker'], ['npc_lass', 'npc_lass'], ['npc_ace', 'npc_ace']];
  const INTRO = ['You there - let us test your bond!', 'The wilds favor the bold. Battle me!',
                 'No path forward without a fight!', 'You have the look of a challenger!'];
  const BEATEN = ['Good battle. Safe travels.', 'You are tougher than this terrain.', 'Go on - the wilds are calling.'];

  let hero = null;
  let camYaw = 0;
  let bobT = 0, stepT = 0, moving = false;
  let dialogue = null;       // {lines, idx, tw, onDone}
  let pendingAction = null;  // fn run when dialogue closes
  let cardT = 0, hintT = 0, t = 0;
  let fireflyT = 0, emberT = 0, swirlT = 0;
  let curBiome = '', biomeName = 'WHISPER FOREST'; // current biome (for ambiance + card)
  let partyView = false, partyCheckCursor = 0; // C opens a read-only party check
  // O opens an options overlay (rename / difficulty / save / save codes)
  let optionsView = false, optMode = 'main', optCursor = 0, diffCursor = 2;
  let notice = '', noticeT = 0;
  const OPTIONS = ['Rename', 'Difficulty', 'Save', 'Export', 'Import', 'Close'];
  function toast(msg) { notice = msg; noticeT = 2.6; }

  // ---- deterministic hashing / per-chunk RNG ----
  const ckey = (cx, cz) => cx + ',' + cz;
  function hash2(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + WORLD_SEED) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const chunkRng = (cx, cz, salt) => M3.rng((hash2(cx, cz) ^ Math.imul(salt | 0, 2654435761)) >>> 0);

  // read-only party rows for the overworld party check
  function savePartyRows() {
    return Game.save.party.map((m) => {
      const stats = BData.statsFor(m.species, m.level);
      const hp = (m.hp === null || m.hp === undefined) ? stats.maxHp : m.hp;
      return { name: BData.SPECIES[m.species].name, lv: m.level, hp: Math.round(hp), maxHp: stats.maxHp,
               frac: hp / stats.maxHp, fainted: hp <= 0, active: false };
    });
  }

  // ---- chunk generation ----
  // seamless blocky ground tile: per-0.5u quad color from a GLOBAL cell hash,
  // so adjacent chunks tile without seams. Coarse hashed blotches = dirt.
  function chunkGround(cx, cz) {
    const step = 0.5, n = CHUNK / step, ox = cx * CHUNK, oz = cz * CHUNK;
    const data = new Float32Array(n * n * 6 * 9);
    let o = 0;
    for (let gz = 0; gz < n; gz++)
      for (let gx = 0; gx < n; gx++) {
        const wx = ox + gx * step, wz = oz + gz * step;
        const gp = Biome.at(wx, wz).ground;     // per-quad biome -> seamless borders
        const cellX = Math.round(wx / step), cellZ = Math.round(wz / step);
        const h = hash2(cellX + 50000, cellZ + 50000) / 4294967296;
        const dirt = (hash2(Math.floor(wx / 3) + 9000, Math.floor(wz / 3) + 9000) / 4294967296) < 0.10;
        const col = dirt ? gp.dirt[h < 0.5 ? 0 : 1] : gp.grass[h < 0.18 ? 2 : (h < 0.62 ? 0 : 1)];
        const jit = 0.94 + (h % 0.13);
        const r = col[0] * jit, g = col[1] * jit, b = col[2] * jit;
        const x1 = wx + step, z1 = wz + step;
        const corners = [[wx, wz], [x1, wz], [x1, z1], [wx, wz], [x1, z1], [wx, z1]];
        for (const [x, z] of corners) {
          data[o++] = x; data[o++] = 0; data[o++] = z;
          data[o++] = 0; data[o++] = 1; data[o++] = 0;
          data[o++] = r; data[o++] = g; data[o++] = b;
        }
      }
    return { data, count: n * n * 6 };
  }

  function makeNpc(cx, cz, nx, nz, baseLv, count, rng, pool) {
    const mi = Math.floor(rng() * NPC_MODELS.length);
    const sp = (pool && pool.length) ? pool : WILD;
    const team = [];
    for (let i = 0; i < count; i++)
      team.push({ species: sp[Math.floor(rng() * sp.length)],
                  level: M3.clamp(baseLv + (i ? Math.floor(rng() * 3) - 1 : 0), 5, 55) });
    const name = TITLES[Math.floor(rng() * TITLES.length)] + ' ' + NAMES[Math.floor(rng() * NAMES.length)];
    return { key: ckey(cx, cz), name, model: NPC_MODELS[mi][0], battleModel: NPC_MODELS[mi][1],
             team, pos: [nx, 0, nz], yaw: Math.atan2(-nx, -nz), intro: INTRO[Math.floor(rng() * INTRO.length)],
             beaten: BEATEN[Math.floor(rng() * BEATEN.length)], h: null };
  }

  // pick a scenery prop from the biome's weighted scatter table (or null = open)
  function scatterPick(biome, r) {
    const u = r();
    let acc = 0;
    for (const [type, w] of biome.scatter) {
      acc += w;
      if (u < acc) {
        if (type === 'tree') return { model: 'tree' + Math.floor(r() * 3), s: 0.95 + r() * 0.6, col: 0.55 };
        if (type === 'rock') return { model: 'rock' + (r() < 0.5 ? 0 : 1), s: 0.85 + r() * 0.5, col: 0.85 };
        if (type === 'bush') return { model: 'bush', s: 0.85 + r() * 0.5, col: 0.65 };
        if (type === 'cactus') return { model: 'cactus', s: 0.9 + r() * 0.5, col: 0.5 };
        if (type === 'ice_spike') return { model: 'ice_spike', s: 0.8 + r() * 0.7, col: 0.5 };
        return { model: 'tuft', s: 0.8 + r() * 0.9, col: 0 };
      }
    }
    return null;
  }

  function genChunk(cx, cz) {
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const inHere = (p) => (p[0] >= ox && p[0] < ox + CHUNK && p[2] >= oz && p[2] < oz + CHUNK);
    const hasFire = inHere(FIRE_POS), hasPortal = inHere(PORTAL_POS), hasSpawn = inHere(SPAWN);
    const ring = Math.hypot(cx, cz);
    const parts = [], cols = [];
    const reserved = (px, pz, rad) =>
      Math.hypot(px - SPAWN[0], pz - SPAWN[2]) < rad ||
      Math.hypot(px - FIRE_POS[0], pz - FIRE_POS[2]) < rad ||
      Math.hypot(px - PORTAL_POS[0], pz - PORTAL_POS[2]) < rad;

    // NPC first (so scenery can keep clear of it). One per chunk at most; its
    // team is drawn from the BIOME's monster pool where it stands.
    let npc = null;
    const nr = chunkRng(cx, cz, 7);
    if (hasSpawn) {
      npc = makeNpc(cx, cz, SPAWN[0] + 5, SPAWN[2] + 3.4, 10, 1, nr, Biome.at(SPAWN[0] + 5, SPAWN[2] + 3.4).monsters);
    } else if (nr() < 0.12) {                                        // Minecraft-like density
      const nx = ox + 4 + nr() * (CHUNK - 8), nz = oz + 4 + nr() * (CHUNK - 8);
      if (!reserved(nx, nz, 5)) {
        const baseLv = M3.clamp(11 + Math.floor(ring * 1.4), 8, 45);
        const count = 1 + (ring > 2 ? 1 : 0) + (ring > 5 ? 1 : 0);
        npc = makeNpc(cx, cz, nx, nz, baseLv, count, nr, Biome.at(nx, nz).monsters);
      }
    }
    if (npc) cols.push({ x: npc.pos[0], z: npc.pos[2], r: 0.55 });

    // biome-aware scenery on a jittered grid (a chunk straddling two biomes
    // blends naturally — each prop uses the biome at its own position)
    const r = chunkRng(cx, cz, 1);
    const CELL = 4;
    for (let lz = 0; lz < CHUNK; lz += CELL)
      for (let lx = 0; lx < CHUNK; lx += CELL) {
        const px = ox + lx + r() * CELL, pz = oz + lz + r() * CELL;
        const b = Biome.at(px, pz);
        const pick = scatterPick(b, r);
        const yaw = r() * 6.3;
        if (!pick) continue;
        if (reserved(px, pz, 4)) continue;
        if (npc && Math.hypot(px - npc.pos[0], pz - npc.pos[2]) < 2.2) continue;
        parts.push([pick.model, [px, 0, pz], yaw, pick.s, b.tint]);
        if (pick.col > 0) cols.push({ x: px, z: pz, r: pick.col * pick.s });
      }

    if (hasFire) { parts.push(['campfire', FIRE_POS, 0.3, 1.15]); cols.push({ x: FIRE_POS[0], z: FIRE_POS[2], r: 0.8 }); }
    if (hasPortal) { parts.push(['portal', PORTAL_POS, Math.PI, 1.35]); cols.push({ x: PORTAL_POS[0], z: PORTAL_POS[2], r: 1.1 }); }
    return { parts, cols, npc };
  }

  function buildChunk(c) {
    const ground = chunkGround(c.cx, c.cz);
    const ms = c.gen.parts.map(([n, pos, yaw, s, tint]) => ({ m: Models.get(n), pos, yaw, s, tint }));
    let total = ground.count;
    for (const p of ms) total += p.m.count;
    const data = new Float32Array(total * 9);
    data.set(ground.data, 0);
    let off = ground.count * 9;
    for (const p of ms) off = M3.bakeMesh(data, off, p.m.data, p.m.count, p.pos, p.yaw, p.s, p.tint);
    c.handle = Gfx.upload({ data, count: total });
  }

  function ensureChunk(cx, cz) {
    const k = ckey(cx, cz);
    if (chunks.has(k)) return;
    const gen = genChunk(cx, cz);
    if (gen.npc) gen.npc.h = Game.handle(gen.npc.model);
    const c = { cx, cz, k, gen, handle: null };
    chunks.set(k, c);
    buildQueue.push(c);
  }

  function unloadChunk(k) {
    const c = chunks.get(k);
    if (!c) return;
    if (c.handle && Gfx.dispose) Gfx.dispose(c.handle);
    chunks.delete(k);
  }

  // load the view neighborhood, unload far chunks; build on a small budget
  function streamChunks(budget) {
    const pcx = Math.floor(hero.pos[0] / CHUNK), pcz = Math.floor(hero.pos[2] / CHUNK);
    for (let dz = -VIEW_R; dz <= VIEW_R; dz++)
      for (let dx = -VIEW_R; dx <= VIEW_R; dx++) ensureChunk(pcx + dx, pcz + dz);
    for (const k of Array.from(chunks.keys())) {
      const c = chunks.get(k);
      if (Math.abs(c.cx - pcx) > KEEP_R || Math.abs(c.cz - pcz) > KEEP_R) unloadChunk(k);
    }
    buildQueue = buildQueue.filter((c) => chunks.has(c.k) && !c.handle);
    let n = budget === undefined ? 2 : budget;          // chunks built per frame
    while ((n-- > 0 || budget < 0) && buildQueue.length) {
      const c = buildQueue.shift();
      if (chunks.has(c.k) && !c.handle) buildChunk(c);
    }
  }

  // ease the sky / fog / light toward the player's current biome ambiance
  function lerpEnv(target, k) {
    M3.lerpV(ENV.sky, ENV.sky, M3.hex(target.sky), k);
    M3.lerpV(ENV.fog, ENV.fog, M3.hex(target.fog), k);
    M3.lerpV(ENV.lightCol, ENV.lightCol, target.light, k);
    M3.lerpV(ENV.ambient, ENV.ambient, target.ambient, k);
    ENV.fogNear += (target.fogNear - ENV.fogNear) * k;
    ENV.fogFar += (target.fogFar - ENV.fogFar) * k;
  }

  function enter(params) {
    params = params || {};
    Fx.clear();
    const m = Models.get('hero');
    if (!hero) hero = { pos: SPAWN.slice(), yaw: 0, h: Game.handle('hero'), height: m.height };
    if (params.result === 'loss') { M3.set(hero.pos, SPAWN[0], 0, SPAWN[2]); }
    else if (params.fromDungeon) { M3.set(hero.pos, PORTAL_POS[0], 0, PORTAL_POS[2] - 3.2); }
    else if (params.result === 'intro') { M3.set(hero.pos, SPAWN[0], 0, SPAWN[2]); }
    else if (params.result) { M3.set(hero.pos, 1.5, 0, 0.5); }
    streamChunks(-1);            // build the starting neighborhood immediately
    const b0 = Biome.at(hero.pos[0], hero.pos[2]);
    lerpEnv(b0.env, 1);          // snap ambiance to the spawn biome (no fade-in)
    curBiome = b0.id; biomeName = b0.name;
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

  // iterate loaded-chunk NPCs
  function eachNpc(fn) { for (const c of chunks.values()) if (c.gen.npc) fn(c.gen.npc); }

  // nearest interactable (npc or portal) within reach, or null
  function nearest() {
    let best = null, bestD = 2.2;
    eachNpc((n) => { const d = M3.dist(hero.pos, n.pos); if (d < bestD) { bestD = d; best = { kind: 'npc', npc: n }; } });
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
    if (Game.save.npcs[n.key]) {
      startDialogue([n.name + ': ' + n.beaten], null);      // already beaten: just chat
    } else {
      startDialogue([n.name + ' wants to battle!', n.name + ': ' + n.intro], () =>
        Game.toBattle({ arena: 'grove', npcId: n.key, biome: curBiome,   // battlefield matches the player's biome
          enemy: { team: n.team.map((m) => ({ species: m.species, level: m.level })), trainer: n.name, npcId: n.key, trainerModel: n.battleModel } }));
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
      // circle collision against nearby loaded-chunk colliders (no world bound)
      for (const c of chunks.values()) {
        for (const o of c.gen.cols) {
          const dx = hero.pos[0] - o.x, dz = hero.pos[2] - o.z;
          const d = Math.hypot(dx, dz), min = o.r + 0.32;
          if (d < min && d > 0.0001) { hero.pos[0] = o.x + dx / d * min; hero.pos[2] = o.z + dz / d * min; }
        }
      }
      const near = nearest();
      if (Input.pressed('party')) { partyView = true; partyCheckCursor = 0; Sfx.play('confirm'); }
      else if (Input.pressed('options')) { optionsView = true; optMode = 'main'; optCursor = 0; diffCursor = ((Game.save.difficulty || 3) - 1); Sfx.play('confirm'); }
      else if (near && Input.pressed('confirm')) interact(near);
    }

    streamChunks();   // load/unload chunks around the player (budgeted)

    // biome ambiance: ease sky/fog/light toward the biome under the player, and
    // flash the biome name on the location card when crossing into a new one
    const b = Biome.at(hero.pos[0], hero.pos[2]);
    lerpEnv(b.env, M3.clamp(dt * 1.2, 0, 1));
    if (b.id !== curBiome) { curBiome = b.id; biomeName = b.name; cardT = 3.2; }

    // atmosphere: fireflies drift around the player; embers + portal swirl near
    // their landmarks (only when the origin is in range)
    fireflyT -= dt;
    if (fireflyT <= 0) {
      fireflyT = 0.4;
      const a = Math.random() * Math.PI * 2, rad = 3 + Math.random() * 12;
      Fx.spawn({ p: [hero.pos[0] + Math.cos(a) * rad, 0.4 + Math.random() * 1.2, hero.pos[2] + Math.sin(a) * rad], c: [0.65, 1, 0.45],
                 v: [(Math.random() - 0.5) * 0.4, 0.12, (Math.random() - 0.5) * 0.4], g: 0, drag: 0.2, life: 2.6 + Math.random() * 2, s: 0.035, s1: 0.01 });
    }
    if (M3.dist(hero.pos, FIRE_POS) < 16) {
      emberT -= dt;
      if (emberT <= 0) {
        emberT = 0.14;
        Fx.spawn({ p: [FIRE_POS[0] + (Math.random() - 0.5) * 0.25, 0.25, FIRE_POS[2] + (Math.random() - 0.5) * 0.25],
                   c: [[1, 0.48, 0.16], [1, 0.72, 0.2], [0.95, 0.3, 0.1]][Math.floor(Math.random() * 3)],
                   v: [(Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.7, (Math.random() - 0.5) * 0.3], g: 0.4, drag: 0.4, life: 0.7 + Math.random() * 0.5, s: 0.06, s1: 0.01 });
      }
    }
    if (M3.dist(hero.pos, PORTAL_POS) < 18) {
      swirlT -= dt;
      if (swirlT <= 0) {
        swirlT = 0.05;
        const a = t * 3 + Math.random() * 0.5, rr = 0.6 + Math.random() * 1.2;
        Fx.spawn({ p: [PORTAL_POS[0] + Math.cos(a) * rr, 1.6 + Math.sin(a * 1.7) * 1.1, PORTAL_POS[2]],
                   c: [[0.7, 0.3, 1], [0.95, 0.4, 1], [1, 1, 1]][Math.floor(Math.random() * 3)],
                   v: [-Math.cos(a) * 0.9, 0, 0.2], g: 0, drag: 0.4, life: 0.6, s: 0.04, s1: 0.01 });
      }
    }

    Cam.follow(hero.pos, camYaw, { dist: 4.4, height: 2.3 }, dt);
    Cam.update(dt);
  }

  const mTmp = M3.mat();
  function render3d(aspect) {
    const { view, proj } = Cam.matrices(aspect);
    Gfx.begin(view, proj, ENV);
    for (const c of chunks.values()) if (c.handle) Gfx.draw(c.handle, null, {});
    const bob = moving ? Math.abs(Math.sin(bobT)) * 0.05 : 0;
    Gfx.draw(hero.h, M3.trs(mTmp, [hero.pos[0], hero.pos[1] + bob, hero.pos[2]], [hero.yaw, 0, 0], [1, 1, 1]), {});
    eachNpc((n) => {
      const nb = 1 + 0.012 * Math.sin(t * 1.8 + n.pos[0]);
      Gfx.draw(n.h, M3.trs(mTmp, n.pos, [n.yaw, 0, 0], [1, nb, 1]), {});
    });
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
    if (cardT > 0) UI.locationCard(ctx, biomeName, M3.clamp(cardT, 0, 1));
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
