/* Grove Clash — js/battle.js
   Battle: the battle scene. Replicates the reference composition:
   the active ally lower-left foreground (back to camera), MAGMULE
   center-right mid-distance, Camper REX on a rock slab behind it.

   Battles are strictly 1v1, but the player fields a PARTY of up to six
   allies: voluntary switching (C / party row), forced switching when an
   ally faints, battle items (Heal / Cure, 3 charges each), capturing
   the opponent with a Voxball, and running away. Every action has its
   own camera move + effect choreography, driven by generator scripts. */
const Battle = (() => {

  // ----------------------------------------------------------- layout
  const P_POS = [-1.3, 0, -1.8];
  const M_POS = [1.1, 0, 1.9];
  const REX_POS = [2.7, 0.42, 3.62];
  const DIR_PM = (() => { const d = [0, 0, 0]; M3.sub(d, M_POS, P_POS); d[1] = 0; return M3.normalize(d, d); })();
  const PERP = [-DIR_PM[2], 0, DIR_PM[0]];
  const YAW_P = Math.atan2(DIR_PM[0], DIR_PM[2]);
  const YAW_M = YAW_P + Math.PI;

  const DEFAULT_SHOT = { pos: [-3.80, 1.30, -2.53], look: [1.93, 0.21, 1.35], fov: 40 };

  // Dungeon: the boss towers atop a cliff and the camera shoots from low,
  // tilted UP at it (Dynamax/Gigantamax-style framing) — dungeon-only.
  const BOSS_POS = [2.62, 3.38, 4.23];
  // low + wide so the player's ally fills the lower-left foreground (as in
  // NPC battles) while the camera still tilts UP at the cliff-top boss.
  const DUNGEON_SHOT = { pos: [-3.40, 0.95, -3.20], look: [1.90, 2.90, 3.20], fov: 58 };

  const ENV = {
    sky: M3.hex('#0d1522'),
    fog: M3.hex('#13201a'), fogNear: 7.5, fogFar: 17,
    lightDir: M3.normalize([], [-0.35, -0.8, -0.25]),
    lightCol: [0.74, 0.66, 0.55],
    ambient: [0.42, 0.50, 0.46],
  };
  // intimidating rift dungeon — kept moody/violet but lit clearly enough to
  // read the boss, cliff and background (raised ambient + light, lighter fog
  // pushed farther). Attacks pulse extra dynamic light on top of this.
  const DUNGEON_ENV = {
    sky: M3.hex('#120a26'),
    fog: M3.hex('#2a1846'), fogNear: 12, fogFar: 36,
    lightDir: M3.normalize([], [-0.3, -0.72, -0.2]),
    lightCol: [0.92, 0.74, 1.05],
    ambient: [0.54, 0.46, 0.66],
  };

  // Tutorial: the colossal GIANT stands far back; the camera shoots low and
  // tilted UP at it (same towering framing as the dungeon boss).
  const GIANT_POS = [2.4, 0, 5.6];
  const TUTORIAL_SHOT = { pos: [-3.40, 0.95, -3.20], look: [2.10, 2.60, 4.20], fov: 60 };
  const TUTORIAL_ENV = {
    sky: M3.hex('#0a0a18'),
    fog: M3.hex('#161028'), fogNear: 10, fogFar: 34,
    lightDir: M3.normalize([], [-0.3, -0.7, -0.2]),
    lightCol: [0.7, 0.7, 0.95],
    ambient: [0.42, 0.44, 0.58],
  };

  const SPAWN_THEMES = {
    PIXLIT:   [[1, 1, 1], [1, 0.55, 0.8], [0.7, 0.9, 1]],
    THORNLET: [[1, 1, 1], [0.55, 0.95, 0.4], [0.3, 0.75, 0.3]],
    EMBERIK:  [[1, 1, 1], [1, 0.72, 0.2], [1, 0.48, 0.16]],
    MAGMULE:  [[1, 1, 1], [1, 0.85, 0.45], [1, 0.55, 0.2]],
    FROSTKIT: [[1, 1, 1], [0.7, 0.92, 1], [0.4, 0.7, 1]],
    SANDREK:  [[1, 1, 1], [1, 0.78, 0.4], [0.85, 0.5, 0.2]],
    VORNETH:  [[1, 1, 1], [0.72, 0.34, 1], [0.5, 0.12, 0.7]],
    VORNETH_X:[[1, 1, 1], [0.92, 0.4, 1], [0.6, 0.15, 0.85]],
    PROTECTOR:[[1, 1, 1], [0.3, 0.85, 1], [0.15, 0.5, 0.8]],
    GIANT:    [[1, 1, 1], [1, 0.85, 0.4], [0.7, 0.4, 1]],
  };
  const themeOf = (id) => SPAWN_THEMES[id] || SPAWN_THEMES.MAGMULE;
  const modelOf = (id) => id.toLowerCase();

  // ----------------------------------------------------------- state
  let staticH = null;          // merged grove scenery handle
  let dungeonH = null;         // merged dungeon scenery handle
  let tutorialH = null;        // merged tutorial scenery handle
  let arena = 'grove';         // 'grove' | 'dungeon' | 'tutorial'
  let tutorial = false;        // opening tutorial battle (commands the protector)
  let curEnv = ENV, curStatic = null, defShot = DEFAULT_SHOT;
  let curEnemy = null;         // descriptor passed to enter() (npcId/trainer/isBoss)
  let ashT = 0, riftT = 0;     // dungeon ambient timers
  let player = null, enemy = null, rex = null; // actors
  let pParty = [];             // combat states for the whole player party
  let activeIdx = 0;
  let eParty = [];             // enemy party (NPCs now field several monsters)
  let eActiveIdx = 0;
  let pState = null, eState = null;
  let items = { heal: 3, cure: 3 };
  let state = 'INTRO';         // INTRO | MENU | TURN | FLY | DONE
  let mode = 'none';           // UI: none | menu | msg
  let menuMode = 'top';        // top | moves | items | party
  let topCursor = 0, moveCursor = 0, itemCursor = 0, partyCursor = 0;
  let awaitParty = false, pickedAlly = -1, awaitOptional = false; // switch handshake
  let awaitAsk = false, askCursor = 0, askChoice = -1, askText = ''; // yes/no prompt
  let tw = null;
  let waitingConfirm = false;
  let expFrac = 0.30, expTween = null;
  let t = 0;
  let fly = null;
  let poseText = '';
  const ball = { visible: false, pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], flight: null, trail: false };

  // script runner -----------------------------------------------------
  let script = null, wait = null;
  function run(gen) { script = gen; wait = null; }
  function stepScript(dt) {
    if (!script) return;
    if (wait) {
      if (wait.ms !== undefined) { wait.ms -= dt * 1000; if (wait.ms > 0) return; }
      else if (wait.cond && !wait.cond()) return;
      wait = null;
    }
    while (script) {
      const r = script.next();
      if (r.done) { script = null; break; }
      const y = r.value;
      if (typeof y === 'number') { if (y > 0) { wait = { ms: y }; break; } }
      else if (typeof y === 'function') { if (!y()) { wait = { cond: y }; break; } }
    }
  }

  // tweens -------------------------------------------------------------
  const tweens = [];
  function tw3(vec, to, dur, easeName, onDone) {
    tweens.push({ vec, from: vec.slice(), to: to.slice(), t: 0, dur: dur / 1000,
                  ease: M3.ease[easeName || 'outQuad'], onDone });
  }
  function stepTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i];
      w.t += dt;
      const u = w.ease(M3.clamp(w.t / w.dur, 0, 1));
      M3.lerpV(w.vec, w.from, w.to, u);
      if (w.t >= w.dur) { tweens.splice(i, 1); if (w.onDone) w.onDone(); }
    }
  }

  // actors ---------------------------------------------------------------
  function actor(name, pos, yaw) {
    const m = Models.get(name);
    return {
      name, pos: pos.slice(), yaw, offset: [0, 0, 0], scl: [1, 1, 1],
      flashT: 0, shiverT: 0, trailT: 0, visible: true, phase: Math.random() * 6,
      bobAmp: 0.012, bobRate: 2.1, // boss overrides these for a looming sway
      h: Game.handle(name), centers: m.centers, height: m.height,
    };
  }
  const mTmp = M3.mat(), mTmp2 = M3.mat();
  function actorMat(a, noBob) {
    const bob = noBob ? 0 : (a.bobAmp || 0.012) * Math.sin(t * (a.bobRate || 2.1) + a.phase);
    const shiver = a.shiverT > 0 ? Math.sin(t * 62) * 0.035 : 0;
    return M3.trs(mTmp,
      [a.pos[0] + a.offset[0] + shiver, a.pos[1] + a.offset[1], a.pos[2] + a.offset[2]],
      [a.yaw, 0, 0],
      [a.scl[0], a.scl[1] * (1 + bob), a.scl[2]]);
  }
  const head = (a, f) => [a.pos[0] + a.offset[0], a.pos[1] + a.offset[1] + a.height * (f || 0.78), a.pos[2] + a.offset[2]];
  const chest = (a) => head(a, 0.5);

  const sideActor = (s) => (s === 'P' ? player : enemy);
  const sideState = (s) => (s === 'P' ? pState : eState);
  const other = (s) => (s === 'P' ? 'E' : 'P');

  const ELEC = [[1, 1, 1], [0.62, 0.86, 1], [0.82, 0.92, 1]]; // electric white-blue
  function applyDamage(st, dmg) {
    st.hp = Math.max(0, st.hp - dmg);
    st.drainRate = Math.max(14, Math.abs(st.displayHp - st.hp) / 0.7);
    // electric impact — a thunder bolt strikes the target + sparks (every hit,
    // every monster, normal and boss battles)
    const a = (st === pState) ? player : enemy;
    const tp = chest(a);
    Fx.bolt([tp[0] + (Math.random() - 0.5) * 0.5, tp[1] + 2.8, tp[2] + (Math.random() - 0.5) * 0.5], tp,
            { segs: 9, jitter: 0.6, colors: ELEC, life: 0.16, s: 0.07, dense: 4, forks: 2, forkLen: 0.7 });
    Fx.sparks(tp, { n: 16, speed: 4.6, colors: ELEC, up: 1.4, life: 0.34, s: 0.05 });
    Sfx.play('thunder');
  }
  function applyHeal(st, amount) {
    st.hp = Math.min(st.stats.maxHp, st.hp + amount);
    st.drainRate = Math.max(14, Math.abs(st.displayHp - st.hp) / 0.7);
  }
  const drained = (st) => () => Math.abs(st.displayHp - st.hp) < 0.4;
  const othersAlive = () => pParty.some((m, i) => i !== activeIdx && m.hp > 0);
  const firstAliveIdx = () => pParty.findIndex((m, i) => i !== activeIdx && m.hp > 0);
  const enemyAlive = () => eParty.some((m) => m.hp > 0);

  // active opponent stage position by arena
  const enemyPos = () => (arena === 'dungeon' ? BOSS_POS : (arena === 'tutorial' ? GIANT_POS : M_POS));
  // current difficulty tier (1..5); the scripted giant/boss ignore it
  const curTier = () => ((Game.save && Game.save.difficulty) || 3);

  function makeEnemy(species, level, isBoss) {
    const sp = BData.SPECIES[species];
    const isGiant = !!sp.giant;
    const stats = BData.statsFor(species, level);
    // attack-pattern diversity scales with difficulty (story foes keep all moves)
    let moves = sp.moves.slice();
    if (!isBoss && !isGiant && !tutorial)
      moves = BData.enemyMovepool(moves, (BData.DIFFICULTY[curTier()] || BData.DIFFICULTY[3]).moves);
    const epp = {}; for (const id of sp.moves) epp[id] = BData.MOVES[id].pp; // full PP table (giant gates moves by form)
    return { id: species, baseId: species, name: sp.name, level, stats,
             hp: stats.maxHp, displayHp: stats.maxHp, drainRate: 60, atkStage: 0,
             moves, epp, isBoss: !!isBoss, isGiant, enraged: false, form: 0,
             threshold: isGiant ? 0.5 : 0.55 };
  }

  // camera shots ----------------------------------------------------------
  function camDefault(ms) {
    Cam.play([{ t: ms || 650, pos: defShot.pos, look: defShot.look, fov: defShot.fov, ease: 'outCubic' }]);
  }
  // low crane circling up toward the (elevated) transforming actor
  function camTransform(side) {
    const a = sideActor(side);
    const up = a.pos[1] + a.height * 0.5;
    Cam.play([
      { t: 500, pos: [a.pos[0] - DIR_PM[0] * 3.2 + PERP[0] * 1.2, 0.5, a.pos[2] - DIR_PM[2] * 3.2 + PERP[2] * 1.2],
        look: [a.pos[0], up, a.pos[2]], fov: 52, ease: 'inOutCubic' },
      { t: 1700, pos: [a.pos[0] - DIR_PM[0] * 2.6 - PERP[0] * 1.0, 0.35, a.pos[2] - DIR_PM[2] * 2.6 - PERP[2] * 1.0],
        look: [a.pos[0], up, a.pos[2]], fov: 48, ease: 'inOutCubic' },
    ]);
  }
  // sweeping reveal orbit after the awakened form appears
  function camTransformReveal(side) {
    const a = sideActor(side);
    const up = a.pos[1] + a.height * 0.55;
    Cam.play([
      { t: 700, pos: [a.pos[0] - DIR_PM[0] * 4.2 + PERP[0] * 2.2, 0.6, a.pos[2] - DIR_PM[2] * 4.2 + PERP[2] * 2.2],
        look: [a.pos[0], up, a.pos[2]], fov: 50, ease: 'outCubic' },
      { t: 1500, pos: [a.pos[0] - DIR_PM[0] * 3.8, 1.0, a.pos[2] - DIR_PM[2] * 3.8],
        look: [a.pos[0], up, a.pos[2]], fov: 47, ease: 'inOutCubic' },
    ]);
  }
  function camAtk(s) {
    const u = sideActor(s), v = sideActor(other(s));
    const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
    const side = s === 'P' ? -0.95 : 0.8;
    const pos = [u.pos[0] - d[0] * 1.9 + PERP[0] * side, 1.0, u.pos[2] - d[2] * 1.9 + PERP[2] * side];
    const look = [v.pos[0], v.pos[1] + 0.6, v.pos[2]];
    Cam.play([
      { t: 330, pos, look, fov: 44, ease: 'inOutCubic' },
      { t: 560, pos: [pos[0] + d[0] * 0.6, pos[1] - 0.08, pos[2] + d[2] * 0.6], look, fov: 42, ease: 'outQuad' },
    ]);
  }
  function camImpact(victimSide) {
    const v = sideActor(victimSide);
    const d = victimSide === 'E' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
    const side = victimSide === 'E' ? -0.6 : 1.0;
    const pos = [v.pos[0] - d[0] * 2.0 + PERP[0] * side, 0.82, v.pos[2] - d[2] * 2.0 + PERP[2] * side];
    const look = [v.pos[0], v.pos[1] + 0.55, v.pos[2]];
    Cam.cut(pos, look, 34);
    Cam.play([{ t: 480, pos: [pos[0] - d[0] * 0.25, pos[1] + 0.05, pos[2] - d[2] * 0.25], look, fov: 35, ease: 'outQuad' }]);
  }
  function camBeamSide() {
    Cam.play([{ t: 380, pos: [-4.4, 1.15, 2.6], look: [-0.1, 0.7, 0.05], fov: 46, ease: 'inOutCubic' }]);
  }
  function camGrowl(s) {
    const u = sideActor(s);
    const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
    const pos = [u.pos[0] + d[0] * 2.3, 0.95, u.pos[2] + d[2] * 2.3];
    Cam.play([{ t: 520, pos, look: [u.pos[0], u.pos[1] + 0.6, u.pos[2]], fov: 35, ease: 'outQuad' }]);
  }
  // slow arcing push onto the player's ally (items/switch ceremonies)
  function camSelf() {
    const u = player;
    Cam.play([
      { t: 420, pos: [u.pos[0] + PERP[0] * 1.9 + DIR_PM[0] * 1.5, 0.9, u.pos[2] + PERP[2] * 1.9 + DIR_PM[2] * 1.5],
        look: [u.pos[0], u.pos[1] + 0.55, u.pos[2]], fov: 36, ease: 'inOutCubic' },
      { t: 980, pos: [u.pos[0] + PERP[0] * 1.4 + DIR_PM[0] * 1.9, 0.78, u.pos[2] + PERP[2] * 1.4 + DIR_PM[2] * 1.9],
        look: [u.pos[0], u.pos[1] + 0.5, u.pos[2]], fov: 34, ease: 'inOutCubic' },
    ]);
  }
  // half-orbit around the player's ally (cure ceremony)
  function camOrbitSelf() {
    const c = player.pos, r = 2.1, h = 0.95;
    const a0 = YAW_P + Math.PI * 0.8;
    const keys = [];
    for (let i = 1; i <= 3; i++) {
      const a = a0 + i * 0.5;
      keys.push({ t: i * 330, pos: [c[0] + Math.sin(a) * r, h, c[2] + Math.cos(a) * r],
                  look: [c[0], 0.5, c[2]], fov: 38, ease: 'linear' });
    }
    Cam.play(keys);
  }
  // chase the thrown Voxball toward the enemy
  function camThrow() {
    const e = enemy.pos;
    Cam.play([
      { t: 280, pos: [P_POS[0] + PERP[0] * 2.2, 1.15, P_POS[2] + PERP[2] * 2.2],
        look: [e[0], 0.8, e[2]], fov: 46, ease: 'outQuad' },
      { t: 620, pos: [e[0] - DIR_PM[0] * 2.6 + PERP[0] * 1.2, 0.95, e[2] - DIR_PM[2] * 2.6 + PERP[2] * 1.2],
        look: [e[0], 0.7, e[2]], fov: 40, ease: 'inOutCubic' },
    ]);
  }
  function camBallClose(p) {
    Cam.cut([p[0] + PERP[0] * 1.5 - DIR_PM[0] * 0.9, 0.5, p[2] + PERP[2] * 1.5 - DIR_PM[2] * 0.9],
            [p[0], 0.16, p[2]], 33);
    Cam.play([{ t: 2400, pos: [p[0] + PERP[0] * 1.2 - DIR_PM[0] * 0.7, 0.42, p[2] + PERP[2] * 1.2 - DIR_PM[2] * 0.7],
                look: [p[0], 0.16, p[2]], fov: 31, ease: 'outQuad' }]);
  }
  // whip ahead of the fleeing ally, looking back at it
  function camRun() {
    const u = player.pos;
    Cam.play([{ t: 300, pos: [u[0] + DIR_PM[0] * 2.6, 0.75, u[2] + DIR_PM[2] * 2.6],
                look: [u[0] - DIR_PM[0] * 1.5, 0.5, u[2] - DIR_PM[2] * 1.5], fov: 52, ease: 'outQuad' }]);
  }
  function camFaint(victimSide) {
    const v = sideActor(victimSide);
    const side = victimSide === 'E' ? 1.8 : -1.8;
    Cam.play([{ t: 1100, pos: [v.pos[0] + PERP[0] * side, 0.55, v.pos[2] + PERP[2] * side + (victimSide === 'E' ? -1.2 : 1.2)],
                look: [v.pos[0], v.pos[1] + 0.35, v.pos[2]], fov: 33, ease: 'outCubic' }]);
  }
  function camVictory() {
    const c = player.pos, r = 3.0, h = 1.3;
    const keys = [];
    for (let i = 1; i <= 4; i++) {
      const a = YAW_P + Math.PI + i * (Math.PI / 5);
      keys.push({ t: i * 1050, pos: [c[0] + Math.sin(a) * r, h, c[2] + Math.cos(a) * r],
                  look: [c[0], 0.55, c[2]], fov: 38, ease: 'linear' });
    }
    Cam.play(keys);
  }

  // ----------------------------------------------------------- say
  const consumeConfirm = () => Input.pressed('confirm') || Input.mouse.clicked;

  function* say(text, opts) {
    opts = opts || {};
    mode = 'msg';
    tw.set(text);
    if (opts.auto) {
      yield () => { if (consumeConfirm()) tw.skip(); return tw.done(); };
      yield opts.hold !== undefined ? opts.hold : 700;
    } else {
      waitingConfirm = true;
      yield () => {
        if (!tw.done()) { if (consumeConfirm()) tw.skip(); return false; }
        return consumeConfirm();
      };
      waitingConfirm = false;
      if (typeof Sfx !== 'undefined') Sfx.play('confirm');
    }
  }

  // ------------------------------------------------------ spawn/recall
  /* Materialize a creature: converging light spiral, white-hot scale-up
     from the ground with overshoot, silhouette glints, touchdown ring. */
  function* spawnIn(a, theme) {
    const base = a.pos;
    const tint = [(theme[1][0] + 1.4) / 2.4, (theme[1][1] + 1.4) / 2.4, (theme[1][2] + 1.4) / 2.4];
    Sfx.play('charge');
    // descending beam-down column of light + converging spiral
    for (let i = 0; i < 20; i++) {
      const ang = i * 1.05, r = 1.25 - i * 0.035;
      const px = base[0] + Math.cos(ang) * r;
      const pz = base[2] + Math.sin(ang) * r;
      Fx.spawn({
        p: [px, base[1] + 0.1 + i * 0.05, pz],
        c: theme[i % theme.length],
        v: [(base[0] - px) * 3.2, 0.4, (base[2] - pz) * 3.2],
        life: 0.3, s: 0.05, s1: 0.012,
      });
      Fx.spawn({ // light pillar motes streaming down to the spawn point
        p: [base[0] + (Math.random() - 0.5) * 0.4, 2.6 - i * 0.06, base[2] + (Math.random() - 0.5) * 0.4],
        c: i % 2 ? [1, 1, 1] : theme[1],
        v: [0, -3.4, 0], life: 0.34, s: 0.05, s1: 0.012,
      });
      if (i % 5 === 4) yield 55;
    }
    yield 80;
    a.visible = true;
    a.flashT = 0.55; // holds full white, then "develops" into color
    a.scl[0] = a.scl[1] = a.scl[2] = 0.02;
    tw3(a.scl, [1, 1, 1], 520, 'outBack');
    Sfx.play('spawn');
    Cam.kickFov(-3, 340);
    Fx.flash(60, 0.55, tint);
    Fx.slowmo(220, 0.5);
    Fx.addTrauma(0.16);
    const m = M3.trs(M3.mat(), a.pos, [a.yaw, 0, 0], [1, 1, 1]);
    const cs = a.centers;
    const step = Math.max(1, Math.floor(cs.length / 40));
    const tmp = [0, 0, 0];
    for (let i = 0; i < cs.length; i += step) {
      M3.transformPoint(tmp, m, cs[i].p);
      Fx.spawn({
        p: [tmp[0], tmp[1], tmp[2]],
        c: theme[((i / step) | 0) % theme.length],
        v: [(Math.random() - 0.5) * 0.7, 0.35 + Math.random() * 0.5, (Math.random() - 0.5) * 0.7],
        g: -0.6, drag: 0.5, life: 0.5 + Math.random() * 0.25, s: 0.045, s1: 0.008,
      });
    }
    yield 230;
    // stronger touchdown: twin rings + dust kick
    Fx.ring([base[0], base[1] + 0.06, base[2]], { r0: 0.18, r1: 1.1, n: 18, life: 0.44, colors: [[1, 1, 1], theme[1]], s: 0.055 });
    Fx.ring([base[0], base[1] + 0.04, base[2]], { r0: 0.1, r1: 0.7, n: 12, life: 0.34, colors: [tint], s: 0.045 });
    Fx.burst([base[0], base[1] + 0.1, base[2]], {
      n: 16, speed: 1.7, up: 1.2, g: -5, drag: 2,
      colors: [theme[1], [0.45, 0.4, 0.34], [0.6, 0.55, 0.45]], life: 0.45, s: 0.05,
    });
    Fx.addTrauma(0.12);
    yield 320;
  }

  // suck a creature back into light (recall / capture)
  function recallFx(a, target, theme) {
    const m = M3.trs(M3.mat(), a.pos, [a.yaw, 0, 0], [a.scl[0], a.scl[1], a.scl[2]]);
    const cs = a.centers;
    const step = Math.max(1, Math.floor(cs.length / 30));
    const tmp = [0, 0, 0];
    for (let i = 0; i < cs.length; i += step) {
      M3.transformPoint(tmp, m, cs[i].p);
      Fx.spawn({
        p: [tmp[0], tmp[1], tmp[2]],
        c: theme[((i / step) | 0) % theme.length],
        v: [(target[0] - tmp[0]) / 0.24, (target[1] - tmp[1]) / 0.24, (target[2] - tmp[2]) / 0.24],
        life: 0.24, s: 0.05, s1: 0.01,
      });
    }
  }

  // ----------------------------------------------------------- move anims
  // generic per-kind choreography; colors come from move.fx
  function* kindDash(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const fx = move.fx, tint = flashTint(fx);
    camAtk(s);
    yield 220;
    const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
    // charge: aura motes spiral inward, deep anticipation crouch + pull-back
    Sfx.play('charge');
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.85;
      Fx.spawn({ p: [u.pos[0] + Math.cos(a) * r, 0.35 + Math.random() * 0.7, u.pos[2] + Math.sin(a) * r], c: fx[i % fx.length],
                 v: [-Math.cos(a) * 1.7, 0.3, -Math.sin(a) * 1.7], life: 0.3, s: 0.05, s1: 0.01 });
    }
    tw3(u.scl, [1.2, 0.78, 1.2], 160, 'outQuad');
    tw3(u.offset, [-d[0] * 0.38, 0, -d[2] * 0.38], 180, 'outQuad');
    yield 190;
    Sfx.play('whoosh');
    const reach = M3.dist(u.pos, v.pos) - 1.0;
    tw3(u.offset, [d[0] * reach, 0.05, d[2] * reach], 115, 'inQuad');
    tw3(u.scl, [0.88, 1.14, 0.88], 115, 'outQuad');
    u.trailT = 0.32;
    yield 115;
    if (!res.miss) {
      applyDamage(vs, res.dmg);
      Sfx.play('impact');
      Fx.hitstop(100);
      Fx.slowmo(260, 0.42);               // brief bullet-time on contact
      Fx.flash(80, 0.85, tint);
      Fx.pulseLight(chest(v), tint, 2.4, 220, 5.5);
      Fx.addTrauma(0.62);
      Cam.kickFov(7, 170);
      v.flashT = 0.32;
      camImpact(other(s));
      // twin shock rings (air + ground) + spark burst
      Fx.ring(chest(v), { r0: 0.15, r1: 1.25, n: 16, life: 0.38, colors: fx, s: 0.065 });
      Fx.ring([v.pos[0], 0.06, v.pos[2]], { r0: 0.2, r1: 1.05, n: 12, life: 0.34, colors: [[0.6, 0.55, 0.45], fx[fx.length - 1]], s: 0.05 });
      Fx.burst(chest(v), { n: 22, speed: 3.0, colors: fx, life: 0.45, g: -3 });
      tw3(v.offset, [d[0] * 0.58, 0, d[2] * 0.58], 160, 'outQuad', () => tw3(v.offset, [0, 0, 0], 440, 'outBack'));
      tw3(v.scl, [1.15, 0.83, 1.15], 140, 'outQuad', () => tw3(v.scl, [1, 1, 1], 400, 'outBack'));
    } else Sfx.play('whoosh');
    yield 300;
    tw3(u.offset, [0, 0, 0], 300, 'outQuad');
    tw3(u.scl, [1, 1, 1], 240, 'outQuad');
    yield 300;
    if (!res.miss) { yield drained(vs); }
    camDefault();
  }

  function* kindRings(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s));
    const fx = move.fx;
    const VIO = [0.62, 0.42, 0.9], VIOD = [0.42, 0.3, 0.66];
    camGrowl(s);
    yield 120;
    // menacing swell + roar, with a violet intimidation pulse
    Sfx.play('growl'); Sfx.play('roar');
    tw3(u.scl, [1.18, 1.12, 1.18], 240, 'outQuad', () => tw3(u.scl, [1, 1, 1], 320, 'outBack'));
    Fx.addTrauma(0.32);
    Cam.kickFov(-3, 380);
    Fx.flash(70, 0.32, [0.72, 0.52, 0.88]);
    Fx.pulseLight(head(u, 0.6), [0.78, 0.5, 1], 1.8, 420, 5);
    // concentric sound-wave shockwaves sweeping out from the head
    for (let i = 0; i < 4; i++) {
      Fx.ring(head(u, 0.6), { r0: 0.15, r1: 1.2, n: 16, life: 0.46,
        colors: [fx[i % fx.length], VIO], vy: 0.12, s: 0.055 });
      Sfx.play('zap');
      yield 130;
    }
    // target buckles: hard shiver + a swirling debuff vortex closing on it
    v.shiverT = 0.7;
    v.flashT = 0.22;
    Fx.addTrauma(0.22);
    const cv = chest(v);
    for (let i = 0; i < 16; i++) {
      const a = i * 0.9, r = 1.15;
      const px = v.pos[0] + Math.cos(a) * r, py = cv[1] + Math.sin(i * 1.3) * 0.3, pz = v.pos[2] + Math.sin(a) * r;
      Fx.spawn({ p: [px, py, pz], c: i % 2 ? VIO : VIOD,
                 v: [(cv[0] - px) * 2.6, (cv[1] - py) * 2.6 - 0.3, (cv[2] - pz) * 2.6],
                 g: -1, life: 0.42, s: 0.05, s1: 0.012 });
    }
    yield 420;
    camDefault();
    void res;
  }

  function* kindBeam(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const fx = move.fx, tint = flashTint(fx);
    camBeamSide();
    Sfx.play('charge');
    const hp = head(u, 0.8);
    // bigger converging charge: a double helix of energy spiraling inward
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 4;
      Fx.spawn({ p: [hp[0] + Math.cos(a) * 0.62, hp[1] + (i % 4) * 0.12 - 0.18, hp[2] + Math.sin(a) * 0.62],
                 c: fx[i % fx.length],
                 v: [-Math.cos(a) * 1.9, 0, -Math.sin(a) * 1.9], life: 0.32, s: 0.052, s1: 0.01 });
      if (i % 5 === 4) yield 56;
    }
    tw3(u.offset, [0, 0.18, 0], 300, 'outQuad'); // levitate
    Fx.burst(hp, { n: 8, speed: 0.5, colors: [fx[1] || fx[0], [1, 1, 1]], life: 0.3, s: 0.06 });
    yield 220;
    if (!res.miss) {
      Sfx.play('beam');
      // dual-layer beam: a thick outer glow + a bright fast core
      Fx.beam(head(u, 0.8), chest(v), 620, { rate: 7, colors: fx, jitter: 0.16, s: 0.1 });
      Fx.beam(head(u, 0.8), chest(v), 620, { rate: 8, colors: [[1, 1, 1], fx[0]], jitter: 0.05, s: 0.055 });
      Fx.addTrauma(0.32);
      Cam.kickFov(-5, 600);
      for (let i = 0; i < 3; i++) { v.flashT = 0.18; Sfx.play('zap'); yield 165; }
      applyDamage(vs, res.dmg);
      Sfx.play('boom');
      Fx.hitstop(85);
      Fx.slowmo(300, 0.4);
      Fx.flash(75, 0.8, tint);
      Fx.pulseLight(chest(v), tint, 3.0, 260, 7);
      Fx.addTrauma(0.5);
      v.flashT = 0.34;
      Fx.burst(chest(v), { n: 32, speed: 3.2, colors: fx, life: 0.55, g: -3 });
      Fx.ring(chest(v), { r0: 0.2, r1: 1.5, n: 18, life: 0.46, colors: [tint, fx[0]], s: 0.07 });
      camImpact(other(s));
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.45, 0, d[2] * 0.45], 150, 'outQuad', () => tw3(v.offset, [0, 0, 0], 400, 'outBack'));
      tw3(v.scl, [1.12, 0.86, 1.12], 140, 'outQuad', () => tw3(v.scl, [1, 1, 1], 380, 'outBack'));
      yield 420;
    } else { Sfx.play('beam'); Fx.beam(head(u, 0.8), [v.pos[0] + 1.4, 0.4, v.pos[2] + 1.2], 420, { rate: 6, colors: fx, jitter: 0.1, s: 0.08 }); yield 500; }
    tw3(u.offset, [0, 0, 0], 260, 'outQuad');
    yield 260;
    if (!res.miss) { yield drained(vs); }
    camDefault();
  }

  function* kindOrb(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const fx = move.fx, tint = flashTint(fx);
    camSweep(s);
    Sfx.play('charge');
    const orb = head(u, 1.05);
    // charge: a contracting orb with orbiting satellite motes + a pulse
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, r = 0.7 - i * 0.012;
      Fx.spawn({ p: [orb[0] + Math.cos(a) * r, orb[1] + Math.sin(i * 2.1) * 0.28, orb[2] + Math.sin(a) * r],
                 c: fx[i % fx.length],
                 v: [-Math.cos(a) * 2.0, 0, -Math.sin(a) * 2.0], life: 0.3, s: 0.06, s1: 0.015 });
      if (i % 4 === 3) yield 50;
    }
    tw3(u.scl, [1.1, 1.16, 1.1], 200, 'outQuad', () => tw3(u.scl, [1, 1, 1], 250, 'outBack'));
    Fx.burst(orb, { n: 10, speed: 0.6, colors: [tint, [1, 1, 1]], life: 0.3, s: 0.07 });
    Fx.addTrauma(0.18);
    yield 200;
    Sfx.play('whoosh');
    const tgt = chest(v);
    if (!res.miss) {
      // lobbed comet cluster with a streaming trail
      for (let i = 0; i < 14; i++)
        Fx.spawn({ p: [orb[0] + (Math.random() - 0.5) * 0.25, orb[1] + (Math.random() - 0.5) * 0.25, orb[2] + (Math.random() - 0.5) * 0.25],
                   c: fx[i % fx.length],
                   v: [(tgt[0] - orb[0]) / 0.3, (tgt[1] - orb[1]) / 0.3 + 0.5, (tgt[2] - orb[2]) / 0.3],
                   g: -3, life: 0.32, s: 0.08, s1: 0.05 });
      yield 290;
      applyDamage(vs, res.dmg);
      Sfx.play('boom'); Sfx.play('impact');
      Fx.hitstop(130);
      Fx.slowmo(460, 0.3);                  // grand bullet-time bloom
      Fx.flash(110, 1.0, tint);
      Fx.pulseLight(tgt, tint, 3.4, 280, 8);
      Fx.addTrauma(0.82);
      Cam.kickFov(10, 200);
      v.flashT = 0.42;
      camImpact(other(s));
      Fx.burst(tgt, { n: 52, speed: 4.0, colors: fx, life: 0.7, g: -3.5 });
      Fx.ring([v.pos[0], v.pos[1] + 0.1, v.pos[2]], { r0: 0.3, r1: 2.0, n: 22, life: 0.5, colors: [tint], s: 0.08 });
      Fx.ring([v.pos[0], 0.06, v.pos[2]], { r0: 0.25, r1: 1.5, n: 16, life: 0.45, colors: [fx[fx.length - 1]], s: 0.06 });
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.75, 0, d[2] * 0.75], 180, 'outQuad', () => tw3(v.offset, [0, 0, 0], 470, 'outBack'));
      tw3(v.scl, [1.18, 0.78, 1.18], 160, 'outQuad', () => tw3(v.scl, [1, 1, 1], 430, 'outBack'));
      yield 300;
      // secondary implosion: motes rush back in, then a bright re-burst
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, r = 1.2;
        Fx.spawn({ p: [v.pos[0] + Math.cos(a) * r, tgt[1] + (Math.random() - 0.5), v.pos[2] + Math.sin(a) * r], c: fx[i % fx.length],
                   v: [-Math.cos(a) * 4, 0, -Math.sin(a) * 4], life: 0.26, s: 0.06, s1: 0.02 });
      }
      yield 240;
      Sfx.play('zap');
      Fx.flash(60, 0.6, tint);
      Fx.burst(tgt, { n: 20, speed: 2.6, colors: [tint, [1, 1, 1]], life: 0.5, g: -2 });
      Fx.addTrauma(0.35);
      yield 280;
      yield drained(vs);
    } else {
      for (let i = 0; i < 12; i++)
        Fx.spawn({ p: orb.slice(), c: fx[0],
                   v: [(tgt[0] - orb[0]) / 0.3 + 1.6, 1.3, (tgt[2] - orb[2]) / 0.3], g: -4, life: 0.5, s: 0.07 });
      yield 500;
    }
    camDefault();
  }

  function* kindVolley(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const fx = move.fx, tint = flashTint(fx);
    camSweep(s);
    Sfx.play('charge');
    const mouth = head(u, 0.85);
    const tgt = chest(v);
    // gather a charge orb, then loose a rapid arcing barrage
    Fx.burst(mouth, { n: 8, speed: 0.5, colors: [tint, fx[0]], life: 0.3, s: 0.06 });
    tw3(u.scl, [1.12, 0.92, 1.12], 180, 'outQuad', () => tw3(u.scl, [1, 1, 1], 320, 'outBack'));
    yield 200;
    Sfx.play('sizzle');
    for (let i = 0; i < 16; i++) {
      const ft = 0.4;
      const spread = [(Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.6];
      Fx.spawn({ p: mouth.slice(),
                 c: fx[i % fx.length],
                 v: [(tgt[0] + spread[0] - mouth[0]) / ft, (tgt[1] - mouth[1]) / ft + 1.5, (tgt[2] + spread[2] - mouth[2]) / ft],
                 g: -6, life: ft + 0.06, s: 0.085, s1: 0.045 });
      if (i % 2) Sfx.play('thud');
      if (i > 3 && !res.miss) {
        Fx.burst([tgt[0] + (Math.random() - 0.5) * 0.6, tgt[1], tgt[2] + (Math.random() - 0.5) * 0.6],
                 { n: 4, speed: 1.6, colors: [fx[0], [0.5, 0.45, 0.42]], life: 0.42, up: 1.3 });
        Fx.addTrauma(0.11);
        v.flashT = Math.max(v.flashT, 0.12);
      }
      yield 52;
    }
    yield 200;
    if (!res.miss) {
      applyDamage(vs, res.dmg);
      Sfx.play('boom'); Sfx.play('impact');
      Fx.hitstop(85);
      Fx.slowmo(280, 0.4);
      Fx.flash(70, 0.7, tint);
      Fx.pulseLight(tgt, tint, 2.6, 240, 6);
      Fx.addTrauma(0.5);
      v.flashT = 0.3;
      Fx.burst(tgt, { n: 30, speed: 3.0, colors: fx, life: 0.55, g: -3 });
      Fx.ring([v.pos[0], v.pos[1] + 0.1, v.pos[2]], { r0: 0.2, r1: 1.5, n: 18, life: 0.46, colors: [tint, fx[fx.length - 1]], s: 0.07 });
      camImpact(other(s));
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.5, 0, d[2] * 0.5], 150, 'outQuad', () => tw3(v.offset, [0, 0, 0], 400, 'outBack'));
      tw3(v.scl, [1.13, 0.85, 1.13], 140, 'outQuad', () => tw3(v.scl, [1, 1, 1], 380, 'outBack'));
      yield 380;
      yield drained(vs);
    } else yield 300;
    camDefault();
  }

  // dynamic camera that sweeps along the attack path: behind the attacker,
  // arcing out to a side profile, then settling on the impact 3/4 view.
  // Used by Cinder and the heavy orb moves for cinematic motion.
  function camSweep(s) {
    const u = sideActor(s), v = sideActor(other(s));
    const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
    const side = s === 'P' ? -1 : 1;
    const mid = [(u.pos[0] + v.pos[0]) / 2, 0.7, (u.pos[2] + v.pos[2]) / 2];
    Cam.play([
      { t: 250, pos: [u.pos[0] - d[0] * 1.7 + PERP[0] * side * 0.8, 1.15, u.pos[2] - d[2] * 1.7 + PERP[2] * side * 0.8],
        look: [u.pos[0], u.pos[1] + 0.6, u.pos[2]], fov: 47, ease: 'outQuad' },
      { t: 980, pos: [mid[0] + PERP[0] * side * 2.4, 1.0, mid[2] + PERP[2] * side * 2.4],
        look: mid, fov: 45, ease: 'inOutCubic' },
      { t: 1640, pos: [v.pos[0] - d[0] * 1.7 - PERP[0] * side * 1.1, 0.82, v.pos[2] - d[2] * 1.7 - PERP[2] * side * 1.1],
        look: [v.pos[0], v.pos[1] + 0.55, v.pos[2]], fov: 40, ease: 'inOutCubic' },
    ]);
  }

  // bright element-tinted color for full-screen impact flashes (toward white)
  function flashTint(fx) {
    const c = fx[fx.length - 1] || [1, 1, 1];
    return [(c[0] + 1.4) / 2.4, (c[1] + 1.4) / 2.4, (c[2] + 1.4) / 2.4];
  }

  /* CINDER — bespoke flashy fire choreography: a helix ember vortex
     inhaled to the mouth, a sustained roaring fire-jet cone with heat
     shimmer and licking flames (camera sweeping along the blast), then a
     bullet-time white-hot fireball — warm screen flash, twin shockwaves,
     an erupting firestorm pillar, a chained second detonation, ground
     scorch and lingering flame/smoke. */
  function* kindCinder(s, res) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const W = [1, 1, 1], YEL = [1, 0.85, 0.3], ORG = [1, 0.55, 0.18], RED = [0.95, 0.3, 0.08], SMK = [0.4, 0.38, 0.36];
    const fire = [W, YEL, ORG, RED];
    camSweep(s);
    const mouth = head(u, 0.85);
    const tgt = chest(v);
    const d = [0, 0, 0]; M3.sub(d, tgt, mouth); M3.normalize(d, d);
    const right = [0, 0, 0]; M3.cross(right, d, [0, 1, 0]); M3.normalize(right, right);
    const up2 = [0, 0, 0]; M3.cross(up2, right, d); M3.normalize(up2, up2);
    const fan = (ang, spr) => [
      d[0] + (Math.cos(ang) * right[0] + Math.sin(ang) * up2[0]) * spr,
      d[1] + (Math.cos(ang) * right[1] + Math.sin(ang) * up2[1]) * spr,
      d[2] + (Math.cos(ang) * right[2] + Math.sin(ang) * up2[2]) * spr,
    ];

    // 1) inhale — helix ember vortex spirals into the mouth, deep crouch
    Sfx.play('charge'); Sfx.play('roar');
    tw3(u.scl, [1.18, 0.8, 1.18], 360, 'outQuad');
    for (let i = 0; i < 22; i++) {
      const a = i * 0.8, r = 1.35 - i * 0.05, hy = (i / 22 - 0.5) * 0.9; // helix: shrinking radius, climbing height
      const px = mouth[0] + (Math.cos(a) * right[0] + Math.sin(a) * up2[0]) * r;
      const py = mouth[1] + (Math.cos(a) * right[1] + Math.sin(a) * up2[1]) * r + hy;
      const pz = mouth[2] + (Math.cos(a) * right[2] + Math.sin(a) * up2[2]) * r;
      Fx.spawn({ p: [px, py, pz], c: fire[i % 4],
                 v: [(mouth[0] - px) * 3.6, (mouth[1] - py) * 3.6 + 0.2, (mouth[2] - pz) * 3.6],
                 life: 0.34, s: 0.055, s1: 0.018 });
      if (i % 5 === 4) yield 52;
    }
    Fx.burst(mouth, { n: 10, speed: 0.5, colors: [W, YEL], life: 0.3, s: 0.075, g: 0 });
    Fx.addTrauma(0.2);
    yield 120;

    // 2) release — lunge + sustained roaring fire-jet cone
    Sfx.play('whoosh'); Sfx.play('roar');
    Cam.kickFov(-5, 820);
    tw3(u.scl, [0.94, 1.14, 0.94], 180, 'outBack', () => tw3(u.scl, [1, 1, 1], 420, 'outQuad'));
    tw3(u.offset, [d[0] * 0.28, 0.04, d[2] * 0.28], 160, 'outQuad', () => tw3(u.offset, [0, 0, 0], 520, 'outQuad'));
    Fx.beam(mouth, tgt, 820, { rate: 8, colors: [W, YEL, ORG], jitter: 0.14, s: 0.082 }); // bright core
    for (let i = 0; i < 16; i++) {
      Sfx.play('sizzle');
      for (let k = 0; k < 6; k++) {
        const dir = fan(Math.random() * Math.PI * 2, Math.random() * 0.55);
        const speed = 4.6 + Math.random() * 2.8;
        Fx.spawn({ p: mouth.slice(), c: fire[k % 4],
                   v: [dir[0] * speed, dir[1] * speed + 0.4, dir[2] * speed],
                   g: -2.6, drag: 1.0, life: 0.32 + Math.random() * 0.14, s: 0.08, s1: 0.02 });
      }
      if (!res.miss && i > 2) {
        Fx.burst([tgt[0] + (Math.random() - 0.5) * 0.7, tgt[1] + (Math.random() - 0.5) * 0.5, tgt[2] + (Math.random() - 0.5) * 0.7],
                 { n: 4, speed: 1.9, up: 1.6, g: -3, colors: [ORG, YEL, SMK], life: 0.45, s: 0.06 });
        Fx.addTrauma(0.15);
        v.flashT = Math.max(v.flashT, 0.13);
        if (i % 3 === 0)
          Fx.spawn({ p: [tgt[0] + (Math.random() - 0.5) * 0.6, tgt[1], tgt[2] + (Math.random() - 0.5) * 0.6], c: SMK,
                     v: [0, 1.3, 0], drag: 0.6, life: 0.7, s: 0.07, s1: 0.13 });
      }
      yield 46;
    }
    yield 110;

    // 3) climactic bullet-time fireball detonation
    if (!res.miss) {
      applyDamage(vs, res.dmg);
      Sfx.play('boom'); Sfx.play('impact');
      Fx.hitstop(120);
      Fx.slowmo(440, 0.32);                 // bullet-time bloom after the freeze
      Fx.flash(130, 1.0, [1, 0.82, 0.5]);   // warm fire-tinted screen flash
      Fx.pulseLight(tgt, [1, 0.74, 0.4], 3.2, 300, 8);
      Fx.addTrauma(0.82);
      Cam.kickFov(10, 220);
      v.flashT = 0.45;
      camImpact(other(s));
      Fx.burst(tgt, { n: 50, speed: 4.2, g: -3.2, colors: [W, YEL, ORG, RED], life: 0.72, s: 0.085 });
      Fx.ring([v.pos[0], v.pos[1] + 0.12, v.pos[2]], { r0: 0.25, r1: 2.0, n: 22, life: 0.5, colors: [YEL, ORG], s: 0.085 });
      Fx.ring([v.pos[0], 0.06, v.pos[2]], { r0: 0.3, r1: 1.6, n: 18, life: 0.48, colors: [SMK, RED], s: 0.065 }); // ground scorch
      const d2 = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d2[0] * 0.65, 0, d2[2] * 0.65], 170, 'outQuad', () => tw3(v.offset, [0, 0, 0], 460, 'outBack'));
      tw3(v.scl, [1.16, 0.83, 1.16], 150, 'outQuad', () => tw3(v.scl, [1, 1, 1], 430, 'outBack'));
      // erupting firestorm pillar
      for (let i = 0; i < 5; i++) {
        for (let k = 0; k < 5; k++) {
          const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.45;
          Fx.spawn({ p: [v.pos[0] + Math.cos(a) * rr, 0.1 + Math.random() * 0.3, v.pos[2] + Math.sin(a) * rr],
                     c: fire[k % 4], v: [Math.cos(a) * 0.6, 4.6 + Math.random() * 2.6, Math.sin(a) * 0.6],
                     g: -2, drag: 0.3, life: 0.5 + Math.random() * 0.22, s: 0.085, s1: 0.02 });
        }
        yield 45;
      }
      // chained second detonation
      Sfx.play('boom');
      Fx.flash(70, 0.6, [1, 0.6, 0.3]);
      Fx.addTrauma(0.4);
      Cam.kickFov(6, 160);
      v.flashT = Math.max(v.flashT, 0.3);
      Fx.burst([v.pos[0], v.pos[1] + 0.3, v.pos[2]], { n: 26, speed: 3.4, g: -3, colors: [W, YEL, ORG], life: 0.6, s: 0.075 });
      Fx.ring([v.pos[0], v.pos[1] + 0.3, v.pos[2]], { r0: 0.2, r1: 1.4, n: 16, life: 0.42, colors: [YEL, W], s: 0.07 });
      yield 220;
      for (let i = 0; i < 6; i++) { // lingering flames + smoke
        Fx.spawn({ p: [v.pos[0] + (Math.random() - 0.5) * 0.7, 0.1, v.pos[2] + (Math.random() - 0.5) * 0.7], c: ORG,
                   v: [0, 1.0 + Math.random() * 0.6, 0], drag: 0.7, life: 0.6, s: 0.06, s1: 0.01 });
        Fx.spawn({ p: [v.pos[0] + (Math.random() - 0.5) * 0.8, 0.2, v.pos[2] + (Math.random() - 0.5) * 0.8], c: SMK,
                   v: [0, 0.8, 0], drag: 0.6, life: 0.8, s: 0.07, s1: 0.13 });
        yield 60;
      }
      yield drained(vs);
    } else {
      Fx.burst([tgt[0] + 1.2, tgt[1], tgt[2] + 1.0], { n: 10, speed: 2.2, colors: [ORG, SMK], life: 0.5 });
      yield 360;
    }
    camDefault();
  }

  // dynamic low arc that swings around the cliff base while the boss acts
  // (keeps the towering up-angle but adds motion to every boss attack)
  function camBossSwing(s) {
    const u = sideActor(s);
    const up = u.pos[1] + u.height * 0.5;
    Cam.play([
      { t: 300, pos: [u.pos[0] - DIR_PM[0] * 3.2 + PERP[0] * 2.4, 0.7, u.pos[2] - DIR_PM[2] * 3.2 + PERP[2] * 2.4],
        look: [u.pos[0], up, u.pos[2]], fov: 56, ease: 'outQuad' },
      { t: 820, pos: [u.pos[0] - DIR_PM[0] * 2.6 - PERP[0] * 1.8, 0.5, u.pos[2] - DIR_PM[2] * 2.6 - PERP[2] * 1.8],
        look: [u.pos[0], up * 0.92, u.pos[2]], fov: 53, ease: 'inOutCubic' },
    ]);
  }
  const bossSwing = (s) => ((arena === 'dungeon' || arena === 'tutorial') && s === 'E');

  /* VOID LANCE — boss-tier beam, intensified: ground-crack charge, a
     FOUR-layer lance (halo + glow + mid + searing core), raking void
     streaks, a 60-cube detonation with triple shockwaves, then a delayed
     implosion that yanks shards back in for a second re-detonation. */
  function* kindVoidbeam(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const fx = move.fx, tint = flashTint(fx);
    if (bossSwing(s)) camBossSwing(s); else camSweep(s);
    Sfx.play('charge'); Sfx.play('rift');
    const hp = head(u, 0.8);
    Fx.ring([u.pos[0], u.pos[1] + 0.05, u.pos[2]], { r0: 1.7, r1: 0.2, n: 18, life: 0.5, colors: [tint, fx[fx.length - 1]], s: 0.07 }); // crackle charge ring
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 6;
      Fx.spawn({ p: [hp[0] + Math.cos(a) * 0.85, hp[1] + (i % 6) * 0.12 - 0.32, hp[2] + Math.sin(a) * 0.85], c: fx[i % fx.length],
                 v: [-Math.cos(a) * 2.3, 0.2, -Math.sin(a) * 2.3], life: 0.34, s: 0.058, s1: 0.012 });
      if (i % 6 === 5) { Sfx.play('zap'); yield 50; }
    }
    Fx.burst(hp, { n: 14, speed: 0.6, colors: [tint, [1, 1, 1]], life: 0.3, s: 0.08 });
    Fx.addTrauma(0.25);
    tw3(u.scl, [1.12, 1.18, 1.12], 220, 'outQuad', () => tw3(u.scl, [1, 1, 1], 260, 'outBack'));
    yield 200;
    if (!res.miss) {
      Sfx.play('beam'); Sfx.play('zap');
      const tgt = chest(v);
      Fx.beam(hp, tgt, 760, { rate: 6, colors: [tint, fx[fx.length - 1]], jitter: 0.32, s: 0.16 }); // halo
      Fx.beam(hp, tgt, 760, { rate: 7, colors: fx, jitter: 0.2, s: 0.11 });
      Fx.beam(hp, tgt, 760, { rate: 8, colors: [fx[0], tint], jitter: 0.1, s: 0.08 });
      Fx.beam(hp, tgt, 760, { rate: 9, colors: [[1, 1, 1]], jitter: 0.04, s: 0.05 }); // searing core
      Fx.addTrauma(0.5); Cam.kickFov(-7, 760);
      for (let i = 0; i < 4; i++) {
        v.flashT = 0.22; Sfx.play('zap');
        Fx.spawn({ p: [tgt[0] + (Math.random() - 0.5) * 1.6, tgt[1] + (Math.random() - 0.5) * 1.6, tgt[2] + (Math.random() - 0.5) * 1.0], c: fx[i % fx.length], v: [0, 0, 0], life: 0.18, s: 0.06, s1: 0.01 });
        yield 140;
      }
      applyDamage(vs, res.dmg);
      Sfx.play('boom'); Sfx.play('quake');
      Fx.hitstop(140); Fx.slowmo(480, 0.3);
      Fx.flash(120, 1.0, tint); Fx.addTrauma(0.8); Cam.kickFov(10, 220);
      Fx.pulseLight(tgt, tint, 3.6, 300, 9);
      v.flashT = 0.45;
      Fx.burst(tgt, { n: 60, speed: 4.2, colors: fx, life: 0.7, g: -3 });
      Fx.ring(tgt, { r0: 0.2, r1: 2.2, n: 26, life: 0.52, colors: [tint, fx[0]], s: 0.09 });
      Fx.ring(tgt, { r0: 0.1, r1: 1.4, n: 16, life: 0.4, colors: [[1, 1, 1]], s: 0.06 });
      Fx.ring([v.pos[0], v.pos[1] + 0.06, v.pos[2]], { r0: 0.3, r1: 1.6, n: 18, life: 0.46, colors: [fx[fx.length - 1]], s: 0.06 });
      camImpact(other(s));
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.6, 0, d[2] * 0.6], 150, 'outQuad', () => tw3(v.offset, [0, 0, 0], 440, 'outBack'));
      tw3(v.scl, [1.16, 0.82, 1.16], 150, 'outQuad', () => tw3(v.scl, [1, 1, 1], 420, 'outBack'));
      yield 260;
      // delayed implosion: shards rush back in, then a violet re-detonation
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, r = 1.5;
        Fx.spawn({ p: [tgt[0] + Math.cos(a) * r, tgt[1] + (Math.random() - 0.5), tgt[2] + Math.sin(a) * r], c: fx[i % fx.length], v: [-Math.cos(a) * 4.5, 0, -Math.sin(a) * 4.5], life: 0.24, s: 0.06, s1: 0.02 });
      }
      yield 220;
      Sfx.play('zap'); Fx.flash(70, 0.6, tint); Fx.addTrauma(0.4);
      Fx.burst(tgt, { n: 24, speed: 3, colors: [tint, [1, 1, 1]], life: 0.55, g: -2 });
      yield 300;
      yield drained(vs);
    } else { Sfx.play('beam'); Fx.beam(hp, [v.pos[0] + 1.4, v.pos[1] + 0.4, v.pos[2] + 1.2], 420, { rate: 6, colors: fx, jitter: 0.12, s: 0.08 }); yield 480; }
    tw3(u.scl, [1, 1, 1], 200, 'outQuad');
    camDefault();
  }

  /* DREAD WAVE / ABYSS NOVA — boss-tier nova, intensified: a collapsing orb
     hurled to the target bursts into an expanding abyssal dome sweeping
     across the arena, a gravitational implosion that yanks debris inward,
     then a COLOSSAL detonation (deep slow-mo, quake, triple shockwaves +
     ground scorch) and lingering rift motes. */
  function* kindVoidnova(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const fx = move.fx, tint = flashTint(fx);
    if (bossSwing(s)) camBossSwing(s); else camSweep(s);
    Sfx.play('charge'); Sfx.play('rift');
    const core = head(u, 0.7);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, r = 1.2 - i * 0.035;
      Fx.spawn({ p: [core[0] + Math.cos(a) * r, core[1] + Math.sin(i * 1.7) * 0.35, core[2] + Math.sin(a) * r], c: fx[i % fx.length],
                 v: [-Math.cos(a) * 2.4, 0, -Math.sin(a) * 2.4], life: 0.3, s: 0.06, s1: 0.015 });
      if (i % 4 === 3) { Sfx.play('zap'); yield 50; }
    }
    Fx.burst(core, { n: 12, speed: 0.5, colors: [tint, [1, 1, 1]], life: 0.3, s: 0.08 });
    Fx.addTrauma(0.25);
    tw3(u.scl, [1.14, 1.18, 1.14], 240, 'outQuad', () => tw3(u.scl, [1, 1, 1], 260, 'outBack'));
    yield 200;
    if (!res.miss) {
      const tgt = chest(v);
      Sfx.play('whoosh');
      for (let i = 0; i < 14; i++)
        Fx.spawn({ p: core.slice(), c: fx[i % fx.length],
                   v: [(tgt[0] - core[0]) / 0.3, (tgt[1] - core[1]) / 0.3 + 0.4, (tgt[2] - core[2]) / 0.3], g: -3, life: 0.3, s: 0.1, s1: 0.05 });
      yield 280;
      applyDamage(vs, res.dmg);
      Sfx.play('boom');
      Fx.flash(90, 0.7, tint); Fx.addTrauma(0.6); v.flashT = 0.4;
      // expanding abyssal dome sweeping outward
      for (let k = 0; k < 3; k++) {
        Fx.ring([v.pos[0], v.pos[1] + 0.1 + k * 0.2, v.pos[2]], { r0: 0.2 + k * 0.3, r1: 1.4 + k * 0.9, n: 20, life: 0.5, colors: [tint, fx[0]], s: 0.08 });
        yield 90;
      }
      // gravitational implosion: debris yanked inward
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2, r = 2.0;
        Fx.spawn({ p: [v.pos[0] + Math.cos(a) * r, tgt[1] + (Math.random() - 0.5) * 1.2, v.pos[2] + Math.sin(a) * r], c: fx[i % fx.length], v: [-Math.cos(a) * 6, 0, -Math.sin(a) * 6], life: 0.26, s: 0.07, s1: 0.02 });
      }
      Sfx.play('charge');
      yield 240;
      // colossal detonation
      Sfx.play('boom'); Sfx.play('quake');
      Fx.hitstop(160); Fx.slowmo(560, 0.28);
      Fx.flash(140, 1.0, tint); Fx.addTrauma(0.95); Cam.kickFov(13, 240);
      Fx.pulseLight(tgt, tint, 4.0, 320, 10);
      Fx.burst(tgt, { n: 64, speed: 4.8, colors: fx, life: 0.8, g: -3.2 });
      Fx.ring([v.pos[0], v.pos[1] + 0.1, v.pos[2]], { r0: 0.3, r1: 2.8, n: 30, life: 0.6, colors: [tint, fx[0]], s: 0.1 });
      Fx.ring([v.pos[0], v.pos[1] + 0.4, v.pos[2]], { r0: 0.2, r1: 1.8, n: 18, life: 0.5, colors: [[1, 1, 1]], s: 0.07 });
      Fx.ring([v.pos[0], 0.06, v.pos[2]], { r0: 0.3, r1: 2.0, n: 20, life: 0.52, colors: [fx[fx.length - 1], [0.3, 0.1, 0.5]], s: 0.07 });
      camImpact(other(s));
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.8, 0, d[2] * 0.8], 170, 'outQuad', () => tw3(v.offset, [0, 0, 0], 480, 'outBack'));
      tw3(v.scl, [1.2, 0.78, 1.2], 160, 'outQuad', () => tw3(v.scl, [1, 1, 1], 440, 'outBack'));
      yield 460;
      for (let i = 0; i < 6; i++) { // lingering rift motes
        Fx.spawn({ p: [v.pos[0] + (Math.random() - 0.5) * 1.0, v.pos[1] + 0.2, v.pos[2] + (Math.random() - 0.5) * 1.0], c: tint, v: [0, 0.8 + Math.random() * 0.5, 0], drag: 0.5, life: 0.7, s: 0.05, s1: 0.01 });
        yield 60;
      }
      yield drained(vs);
    } else { Fx.burst([v.pos[0] + 1.2, v.pos[1], v.pos[2] + 1.0], { n: 12, speed: 2.4, colors: fx, life: 0.5 }); yield 460; }
    camDefault();
  }

  const ANIM_KINDS = {
    dash: kindDash, rings: kindRings, beam: kindBeam, orb: kindOrb, volley: kindVolley, cinder: kindCinder,
    voidbeam: kindVoidbeam, voidnova: kindVoidnova,
  };

  // ----------------------------------------------------------- turn logic
  let rngBattle = null;

  function* doMove(s, moveId) {
    const st = sideState(s), os = sideState(other(s));
    const move = BData.MOVES[moveId];
    if (s === 'P') {
      const i = st.moves.indexOf(moveId);
      if (i >= 0) st.pp[i] -= 1;
    } else eState.epp[moveId] -= 1;
    if (move.effect === 'transform') { yield* transformSeq(s); return; }
    const res = move.power
      ? BData.damage({ level: st.level, atk: st.stats.atk, atkStage: st.atkStage, type: BData.SPECIES[st.id].type },
                     { def: os.stats.def, defStage: 0, type: BData.SPECIES[os.id].type }, move, rngBattle)
      : { dmg: 0, crit: false, miss: rngBattle() * 100 >= move.acc };
    // telegraphed "charged" special (the giant's wind-up tell before it fires)
    if (move.telegraph) {
      yield* say(BData.fmt(BData.MSG.giantCharge, { A: st.name }), { auto: true, hold: 240 });
      Sfx.play('charge'); Sfx.play('rift');
      Fx.pulseLight(head(sideActor(s), 0.7), [1, 0.82, 0.4], 2.4, 380, 8);
      Fx.crackle(head(sideActor(s), 0.7), { n: 5, len: 0.9, colors: [[1, 0.85, 0.4], [1, 1, 1]] });
      Fx.addTrauma(0.3);
      yield 360;
    }
    yield* say(BData.fmt(BData.MSG.used, { A: st.name, M: move.name }), { auto: true, hold: 320 });
    Sfx.move(move.id); // each attack's unique cinematic signature sound
    // electric wind-up: the attacker crackles with energy as the move begins
    Fx.crackle(head(sideActor(s), 0.72), { n: 3, len: 0.6, colors: ELEC });
    Fx.sparks(head(sideActor(s), 0.55), { n: 7, speed: 2.4, up: 0.5, g: -3, colors: ELEC, life: 0.3, s: 0.04 });
    Sfx.play('crackle');
    yield* ANIM_KINDS[move.anim](s, res, move);
    if (res.miss) {
      yield* say(BData.fmt(BData.MSG.miss, { A: st.name }), { auto: true });
    } else if (move.effect === 'atkDown') {
      if (os.atkStage <= -6) {
        yield* say(BData.fmt(BData.MSG.atkFloor, { A: os.name }), { auto: true });
      } else {
        os.atkStage -= 1;
        Fx.burst(chest(sideActor(other(s))), { n: 10, speed: 1.2, colors: [[0.6, 0.4, 0.9], [0.4, 0.3, 0.6]], life: 0.5, up: -0.5, g: -1 });
        yield* say(BData.fmt(BData.MSG.atkFell, { A: os.name }), { auto: true });
      }
    } else if (res.crit) {
      yield* say(BData.MSG.crit, { auto: true });
    }
    // type-effectiveness feedback (teaches the matchup system)
    if (!res.miss && move.power && res.eff !== undefined && res.eff !== 1)
      yield* say(res.eff > 1 ? BData.MSG.superEff : BData.MSG.resist, { auto: true });
  }

  function* faintSeq(s) {
    const a = sideActor(s), st = sideState(s);
    camFaint(s);
    Sfx.play('faint');
    // buckle in slow-motion with a double white flash
    Fx.slowmo(700, 0.45);
    Fx.flash(90, 0.9);
    a.flashT = 0.5;
    tw3(a.scl, [1.1, 0.68, 1.1], 240, 'outQuad'); // legs give out
    Fx.addTrauma(0.26);
    yield 200;
    Fx.flash(80, 0.95);
    yield 150;
    a.visible = false;
    // scatter into a swirling cloud of voxels; a soul wisp rises and fades
    Fx.dissolve(a.centers, actorMat(a, true), { life: 1.0 });
    for (let i = 0; i < 10; i++)
      Fx.spawn({ p: [a.pos[0] + (Math.random() - 0.5) * 0.3, 0.3 + i * 0.06, a.pos[2] + (Math.random() - 0.5) * 0.3],
                 c: i % 2 ? [0.85, 0.9, 1] : [1, 1, 1], v: [0, 1.2 + Math.random() * 0.5, 0], drag: 0.4, life: 0.95, s: 0.045, s1: 0.005 });
    Fx.ring([a.pos[0], 0.05, a.pos[2]], { r0: 0.75, r1: 0.1, n: 14, life: 0.5, colors: [[0.7, 0.7, 0.8], [1, 1, 1]], s: 0.05 }); // imploding ground ring
    Fx.addTrauma(0.22);
    yield 1050;
    yield* say(BData.fmt(BData.MSG.faint, { A: st.name }));
  }

  function* victorySeq() {
    const boss = !!(curEnemy && curEnemy.isBoss);
    camVictory();
    Sfx.play('victory');
    yield* say(BData.fmt(BData.MSG.win1, { T: (curEnemy && curEnemy.trainer) || eState.name }));
    if (boss) { yield* say(BData.MSG.bossWin1); yield* say(BData.MSG.bossWin2); }
    yield 250;
    endBattle('win'); // EXP was already awarded to the whole party on the KO
  }

  function* defeatSeq() {
    Sfx.play('defeat');
    yield* say(BData.MSG.lose1);
    yield* say(BData.MSG.lose2);
    endBattle('loss');
  }

  // ---------------------------------------------------- boss transformation
  // swap a combatant's form in place (stats/moves/pp/name + actor model),
  // preserving its current HP fraction. Returns the pre-transform name.
  function transformForm(side) {
    const st = sideState(side), a = sideActor(side);
    const sp = BData.SPECIES[st.id];
    const nid = sp && sp.form2;
    if (!nid) return st.name;
    const oldName = st.name, nsp = BData.SPECIES[nid];
    const frac = st.hp / st.stats.maxHp;
    st.id = nid; st.name = nsp.name;
    st.stats = BData.statsFor(nid, st.level);
    st.hp = Math.max(1, Math.round(st.stats.maxHp * frac));
    st.displayHp = st.hp;
    st.atkStage = 0;
    st.moves = nsp.moves.slice();
    if (side === 'P') st.pp = nsp.moves.map((id) => BData.MOVES[id].pp);
    else { st.epp = {}; for (const id of nsp.moves) st.epp[id] = BData.MOVES[id].pp; }
    st.form = 1;
    const nm = Models.get(modelOf(nid));
    a.h = Game.handle(modelOf(nid));
    a.centers = nm.centers;
    a.height = nm.height;
    return oldName;
  }

  /* THE CLIMAX — the grandest sequence in the game. Sustained bullet-time:
     dark energy spirals in, a void pillar erupts and engulfs the beast, the
     form swaps inside the cocoon, then it unfurls at full awakened size with
     triple shockwaves, a screen-filling flash and a sweeping reveal orbit. */
  function* transformSeq(side) {
    const a = sideActor(side), st = sideState(side);
    const VIO = [0.7, 0.3, 1], MAG = [0.95, 0.4, 1], DK = [0.3, 0.1, 0.5], W = [1, 1, 1];
    Cam.idleDrift(false);
    yield* say(BData.fmt(BData.MSG.transform1, { A: st.name }), { auto: true, hold: 220 });
    camTransform(side);
    Sfx.play('roar'); Sfx.play('rift');
    Fx.slowmo(2600, 0.4); // sustained slow-mo across the whole climax
    const c0 = chest(a);
    for (let i = 0; i < 22; i++) {
      const ang = i * 0.9, r = 2.4 - i * 0.08;
      const px = a.pos[0] + Math.cos(ang) * r, py = a.pos[1] + 0.2 + i * 0.1, pz = a.pos[2] + Math.sin(ang) * r;
      Fx.spawn({ p: [px, py, pz], c: [VIO, MAG, W][i % 3], v: [(c0[0] - px) * 3, (c0[1] - py) * 2.2, (c0[2] - pz) * 3], life: 0.42, s: 0.06, s1: 0.02 });
      if (i % 4 === 3) { Fx.addTrauma(0.22); Sfx.play('zap'); yield 70; }
    }
    Fx.ring([a.pos[0], a.pos[1] + 0.05, a.pos[2]], { r0: 0.2, r1: 2.4, n: 26, life: 0.6, colors: [VIO, DK], s: 0.09 });
    tw3(a.scl, [1.22, 1.3, 1.22], 400, 'outQuad');
    yield 260;
    // eruption — void pillar engulfs it, screen flash, hard hitstop
    Sfx.play('boom'); Sfx.play('quake');
    Fx.hitstop(170); Fx.flash(170, 1.0, MAG); Fx.addTrauma(0.95); Cam.kickFov(13, 320);
    Fx.pulseLight(chest(a), MAG, 4.5, 360, 11);
    for (let i = 0; i < 44; i++) {
      const ang = Math.random() * Math.PI * 2, rr = Math.random() * 0.7;
      Fx.spawn({ p: [a.pos[0] + Math.cos(ang) * rr, a.pos[1] + 0.1, a.pos[2] + Math.sin(ang) * rr], c: [VIO, MAG, W, DK][i % 4],
                 v: [Math.cos(ang) * 1.3, 6 + Math.random() * 4.5, Math.sin(ang) * 1.3], g: -3, drag: 0.2, life: 0.75, s: 0.1, s1: 0.03 });
    }
    a.visible = false;
    yield 420;
    // swap form inside the cocoon, then unfurl at full awakened size
    const oldName = transformForm(side);
    Sfx.play('spawn'); Sfx.play('roar');
    Fx.flash(190, 1.0, W); Fx.slowmo(800, 0.32);
    Fx.pulseLight([a.pos[0], a.pos[1] + a.height * 0.5, a.pos[2]], MAG, 4.2, 700, 12);
    a.visible = true;
    a.scl = [0.35, 0.35, 0.35];
    tw3(a.scl, [1, 1, 1], 760, 'outElastic');
    Cam.kickFov(-9, 600);
    const m = M3.trs(M3.mat(), a.pos, [a.yaw, 0, 0], [1, 1, 1]);
    const cs = a.centers, step = Math.max(1, Math.floor(cs.length / 44)), tmp = [0, 0, 0];
    for (let i = 0; i < cs.length; i += step) {
      M3.transformPoint(tmp, m, cs[i].p);
      Fx.spawn({ p: [tmp[0], tmp[1], tmp[2]], c: [MAG, VIO, W][(i / step | 0) % 3],
                 v: [(Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8], g: -0.5, drag: 0.4, life: 0.6, s: 0.05, s1: 0.008 });
    }
    Fx.ring([a.pos[0], a.pos[1] + 0.5, a.pos[2]], { r0: 0.3, r1: 3.0, n: 30, life: 0.7, colors: [MAG, W], s: 0.1 });
    Fx.ring([a.pos[0], a.pos[1] + 0.05, a.pos[2]], { r0: 0.4, r1: 2.6, n: 24, life: 0.6, colors: [VIO, DK], s: 0.08 });
    Fx.addTrauma(0.7);
    yield 560;
    // reveal roar + sweeping orbit
    Sfx.play('roar'); Sfx.play('boom');
    Fx.burst(head(a, 0.7), { n: 32, speed: 3.2, colors: [MAG, VIO, W], life: 0.75, g: -2 });
    Fx.addTrauma(0.4);
    camTransformReveal(side);
    yield 760;
    yield* say(BData.fmt(BData.MSG.transform2, { A: oldName, B: st.name }), { auto: true, hold: 340 });
    camDefault();
  }

  // grander materialize for the boss's dungeon entrance
  function* spawnInBoss(a) {
    Sfx.play('rift'); Sfx.play('quake');
    Fx.flash(120, 0.6, [0.7, 0.3, 1]);
    Fx.addTrauma(0.4);
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2, rr = Math.random() * 0.9;
      Fx.spawn({ p: [a.pos[0] + Math.cos(ang) * rr, a.pos[1] + 0.1, a.pos[2] + Math.sin(ang) * rr], c: [[0.7, 0.3, 1], [0.95, 0.4, 1], [1, 1, 1]][i % 3],
                 v: [Math.cos(ang) * 1.2, 4 + Math.random() * 4, Math.sin(ang) * 1.2], g: -3, drag: 0.2, life: 0.8, s: 0.1, s1: 0.03 });
    }
    yield 240;
    yield* spawnIn(a, themeOf('VORNETH'));
  }

  // ---- difficulty-scaled enemy decision-making ----
  // the giant's moveset is phase-gated: its telegraphed specials unlock only
  // once it enrages (phase 2).
  function enemyMoves() {
    if (eState.isGiant)
      return eState.form === 0 ? ['STOMP', 'ROAR'] : ['STOMP', 'GIANTBEAM', 'GNOVA', 'ROAR'];
    return eState.moves;
  }
  function enemyAiCtx() {
    const sp = BData.SPECIES;
    return {
      tier: eState.isGiant ? 4 : curTier(),  // the scripted giant runs a fixed tier
      atkStage: eState.atkStage,
      foeHpFrac: pState.hp / pState.stats.maxHp,
      pp: eState.epp,
      self: { level: eState.level, atk: eState.stats.atk, atkStage: eState.atkStage, type: sp[eState.id].type },
      foe: { def: pState.stats.def, defStage: 0, type: sp[pState.id].type, hp: pState.hp, maxHp: pState.stats.maxHp },
    };
  }
  const enemyPick = () => BData.aiPick(enemyMoves(), enemyAiCtx(), rngBattle);
  const giantReady = () => eState.isGiant && eState.form === 0 && eState.hp > 0 && eState.hp < eState.stats.maxHp * eState.threshold;

  // the giant's mid-fight ENRAGE (phase 2) — a roar + stat surge unlocking its
  // telegraphed charged specials (no model swap; parallels the boss hook).
  function* giantEnrageSeq(side) {
    const a = sideActor(side), st = sideState(side);
    st.form = 1; st.enraged = true;
    st.atkStage = Math.min(6, st.atkStage + 2);
    yield* say(BData.fmt(BData.MSG.giantEnrage, { A: st.name }), { auto: true, hold: 220 });
    if (bossSwing(side)) camBossSwing(side);
    Sfx.play('roar'); Sfx.play('quake');
    Fx.flash(150, 0.9, [1, 0.7, 0.4]);
    Fx.slowmo(520, 0.4);
    Fx.addTrauma(0.85);
    Fx.pulseLight(chest(a), [1, 0.72, 0.4], 4.2, 420, 11);
    a.flashT = 0.55;
    tw3(a.scl, [1.2, 1.2, 1.2], 300, 'outQuad', () => tw3(a.scl, [1.08, 1.08, 1.08], 400, 'outBack'));
    Fx.ring([a.pos[0], a.pos[1] + 0.05, a.pos[2]], { r0: 0.3, r1: 3.0, n: 28, life: 0.6, colors: [[1, 0.7, 0.4], [1, 1, 1]], s: 0.09 });
    Fx.burst(head(a, 0.7), { n: 32, speed: 3.6, colors: [[1, 0.8, 0.4], [1, 1, 1]], life: 0.7, g: -2 });
    yield 640;
    camDefault();
  }

  // a non-boss enemy voluntarily pivots to a better-matched bench mon (tiers 4-5)
  function* enemySwitchSeq(to) {
    const th = themeOf(eState.id);
    yield* say(BData.fmt(BData.MSG.foeRecall, { T: (curEnemy && curEnemy.trainer) || 'The foe', A: eState.name }), { auto: true, hold: 140 });
    camDefault(400);
    Sfx.play('charge');
    Fx.ring(chest(enemy), { r0: 1.0, r1: 0.1, n: 14, life: 0.3, colors: [th[1], [1, 1, 1]], s: 0.05 });
    recallFx(enemy, chest(enemy), th);
    tw3(enemy.scl, [0.02, 0.02, 0.02], 240, 'inQuad');
    enemy.flashT = 0.4;
    yield 280;
    enemy.visible = false;
    eActiveIdx = to; eState = eParty[to];
    enemy = actor(modelOf(eState.id), enemyPos(), YAW_M);
    if (eState.isBoss || eState.isGiant) { enemy.bobAmp = 0.05; enemy.bobRate = 1.0; }
    enemy.visible = false;
    yield* say(BData.fmt(BData.MSG.sentOut, { T: (curEnemy && curEnemy.trainer) || 'The foe', M: eState.name }), { auto: true, hold: 140 });
    yield* spawnIn(enemy, themeOf(eState.id));
  }

  // decide whether the enemy pivots this turn; returns a generator or null
  function maybeEnemySwitch() {
    if (eState.isBoss || eState.isGiant) return null;
    const sp = BData.SPECIES;
    const bench = eParty.map((m, i) => ({ idx: i, type: sp[m.id].type, alive: m.hp > 0 })).filter((b) => b.idx !== eActiveIdx);
    const to = BData.aiShouldSwitch(
      { type: sp[eState.id].type, hpFrac: eState.hp / eState.stats.maxHp },
      { type: sp[pState.id].type }, bench, curTier(), rngBattle);
    if (to < 0 || !eParty[to] || eParty[to].hp <= 0) return null;
    return enemySwitchSeq(to);
  }

  // enemy's half of a turn. Returns false if the battle ended.
  function* enemyTurn() {
    if (eState.hp <= 0) return true;
    // boss phase change: the first time it drops below the threshold, it awakens
    if (eState.isBoss && eState.form === 0 && eState.hp < eState.stats.maxHp * eState.threshold) {
      yield* transformSeq('E');
      return true; // the transformation is the boss's action this turn
    }
    if (giantReady()) { yield* giantEnrageSeq('E'); return true; }
    const sw = maybeEnemySwitch();
    if (sw) { yield* sw; return true; }   // pivoting uses the enemy's turn
    yield* doMove('E', enemyPick());
    if (pState.hp <= 0) {
      yield* faintSeq('P');
      if (othersAlive()) { yield* forcedSwitch(); return true; }
      yield* defeatSeq();
      return false;
    }
    return true;
  }

  // ---------------------------------------------------- action sequences
  function* switchSeq(to, recall) {
    if (recall) {
      yield* say(BData.fmt(BData.MSG.comeBack, { A: pState.name }), { auto: true, hold: 150 });
      const th = themeOf(pState.id);
      camSelf();
      Sfx.play('charge');
      Fx.flash(50, 0.4, [(th[1][0] + 1.4) / 2.4, (th[1][1] + 1.4) / 2.4, (th[1][2] + 1.4) / 2.4]);
      Fx.ring(chest(player), { r0: 1.0, r1: 0.1, n: 14, life: 0.3, colors: [th[1], [1, 1, 1]], s: 0.05 });
      recallFx(player, chest(player), th);
      tw3(player.scl, [0.02, 0.02, 0.02], 260, 'inQuad');
      player.flashT = 0.45;
      Fx.ring([player.pos[0], 0.08, player.pos[2]], { r0: 0.8, r1: 0.1, n: 12, life: 0.3, colors: [th[1], [1, 1, 1]], s: 0.045 });
      yield 290;
      player.visible = false;
      yield 180;
    }
    activeIdx = to;
    pState = pParty[to];
    expFrac = M3.clamp(pState.exp / BData.expToNext(pState.level), 0, 1); expTween = null;
    player = actor(modelOf(pState.id), P_POS, YAW_P);
    player.visible = false;
    yield* say(BData.fmt(BData.MSG.go, { A: pState.name }), { auto: true, hold: 120 });
    yield* spawnIn(player, themeOf(pState.id));
  }

  function* forcedSwitch() {
    mode = 'msg';
    tw.set(BData.MSG.choose);
    partyCursor = Math.max(0, firstAliveIdx());
    pickedAlly = -1;
    awaitParty = true;
    yield () => pickedAlly >= 0;
    awaitParty = false;
    yield* switchSeq(pickedAlly, false);
  }

  // EXP share: the WHOLE party gains the same amount, with level-ups
  // (stats recompute; living members gain the maxHP increase).
  function* awardExp(amount) {
    const ups = [];
    for (const m of pParty) {
      m.exp = (m.exp || 0) + amount;
      while (m.level < BData.MAXLV && m.exp >= BData.expToNext(m.level)) {
        m.exp -= BData.expToNext(m.level);
        m.level++;
        const old = m.stats.maxHp;
        m.stats = BData.statsFor(m.id, m.level);
        if (m.hp > 0) m.hp = Math.min(m.stats.maxHp, m.hp + (m.stats.maxHp - old));
        else m.displayHp = m.hp;
        ups.push({ name: m.name, level: m.level });
      }
    }
    expTween = { from: expFrac, to: M3.clamp(pState.exp / BData.expToNext(pState.level), 0, 1), t: 0, dur: 0.7 };
    Sfx.play('confirm');
    yield* say(BData.fmt(BData.MSG.expGain, { E: amount }), { auto: true, hold: 280 });
    for (const u of ups) { Sfx.play('spawn'); yield* say(BData.fmt(BData.MSG.levelUp, { A: u.name, L: u.level }), { auto: true, hold: 240 }); }
  }

  // offered when the opponent's monster goes down: ask the player to switch
  function* offerSwitch() {
    if (!othersAlive()) return;
    state = 'TURN'; mode = 'ask';
    askText = BData.fmt(BData.MSG.askSwitch, { A: pState.name });
    askCursor = 1; askChoice = -1; awaitAsk = true; // default highlight "No"
    yield () => askChoice >= 0;
    awaitAsk = false; mode = 'none';
    if (askChoice === 1) {
      mode = 'msg'; tw.set(BData.MSG.choose);
      const fa = firstAliveIdx();
      partyCursor = fa >= 0 ? fa : activeIdx;
      pickedAlly = -1; awaitParty = true; awaitOptional = true;
      yield () => pickedAlly !== -1;
      awaitParty = false; awaitOptional = false; mode = 'none';
      if (pickedAlly >= 0 && pickedAlly !== activeIdx && pParty[pickedAlly].hp > 0) yield* switchSeq(pickedAlly, true);
    }
  }

  // the opponent sends in its next monster
  function* sendNextEnemy() {
    eActiveIdx = eParty.findIndex((m) => m.hp > 0);
    eState = eParty[eActiveIdx];
    enemy = actor(modelOf(eState.id), enemyPos(), YAW_M);
    if (eState.isBoss || eState.isGiant) { enemy.bobAmp = 0.05; enemy.bobRate = 1.0; }
    enemy.visible = false;
    yield* say(BData.fmt(BData.MSG.sentOut, { T: (curEnemy && curEnemy.trainer) || 'The foe', M: eState.name }), { auto: true, hold: 150 });
    yield* spawnIn(enemy, themeOf(eState.id));
  }

  // after the active enemy is removed (fainted/captured) and more remain
  function* afterEnemyDown() {
    yield* offerSwitch();
    yield* sendNextEnemy();
  }

  function* itemSeq(which) {
    items[which] -= 1;
    const def = BData.ITEMS[which];
    yield* say(BData.fmt(BData.MSG.usedItem, { M: def.name }), { auto: true, hold: 150 });
    mode = 'none';
    if (which === 'heal') {
      camSelf();
      Sfx.play('heal');
      // descending pillar of restorative light + ground-up rising motes
      for (let i = 0; i < 24; i++) {
        const a = rngLocal() * Math.PI * 2, r = 0.25 + rngLocal() * 0.6;
        Fx.spawn({
          p: [player.pos[0] + Math.cos(a) * r, 2.3 - i * 0.02, player.pos[2] + Math.sin(a) * r],
          c: [[0.55, 0.95, 0.45], [1, 0.92, 0.5], [1, 1, 1]][i % 3],
          v: [0, -2.1 - rngLocal(), 0], drag: 0.4, life: 0.7, s: 0.05, s1: 0.015,
        });
        Fx.spawn({
          p: [player.pos[0] + Math.cos(a) * 0.5, 0.1, player.pos[2] + Math.sin(a) * 0.5],
          c: [0.7, 1, 0.6], v: [0, 0.9 + rngLocal() * 0.7, 0], life: 0.8, s: 0.035, s1: 0.01,
        });
        if (i % 6 === 5) yield 82;
      }
      // sparkle glints dance up the creature's silhouette
      const m = M3.trs(M3.mat(), player.pos, [player.yaw, 0, 0], [1, 1, 1]);
      const cs = player.centers, step = Math.max(1, Math.floor(cs.length / 28)), tmp = [0, 0, 0];
      for (let i = 0; i < cs.length; i += step) {
        M3.transformPoint(tmp, m, cs[i].p);
        Fx.spawn({ p: [tmp[0], tmp[1], tmp[2]], c: (i / step | 0) % 2 ? [0.6, 1, 0.5] : [1, 1, 0.7],
                   v: [0, 0.6 + Math.random() * 0.5, 0], drag: 0.5, life: 0.5, s: 0.04, s1: 0.006 });
      }
      player.flashT = 0.35;
      Fx.flash(70, 0.45, [0.7, 1, 0.6]);  // green-gold heal flash
      Fx.slowmo(240, 0.6);
      applyHeal(pState, Math.floor(pState.stats.maxHp * def.healFrac));
      Fx.ring([player.pos[0], 0.08, player.pos[2]], { r0: 0.15, r1: 1.1, n: 18, life: 0.5, colors: [[1, 0.92, 0.5], [0.55, 0.95, 0.45]], s: 0.055 });
      Sfx.play('spawn');
      tw3(player.scl, [1.08, 1.08, 1.08], 200, 'outQuad', () => tw3(player.scl, [1, 1, 1], 300, 'outBack'));
      yield 400;
      yield drained(pState);
      yield* say(BData.fmt(BData.MSG.healUsed, { A: pState.name }), { auto: true });
    } else {
      camOrbitSelf();
      Sfx.play('cure');
      const cv = chest(player);
      // shatter the debuffs: violet shards burst outward and dissipate
      Fx.burst(cv, { n: 20, speed: 2.6, colors: [[0.6, 0.4, 0.9], [0.45, 0.3, 0.7]], life: 0.55, g: 1.2, drag: 0.6 });
      Sfx.play('zap');
      yield 200;
      // a cleansing dome of cyan-white rings sweeps over the body
      for (let i = 0; i < 3; i++) {
        Fx.ring(cv, { r0: 0.1, r1: 1.3, n: 18, life: 0.46, colors: [[1, 1, 1], [0.6, 0.85, 1]], vy: 0.28, s: 0.05 });
        Sfx.play('zap');
        player.flashT = 0.2;
        yield 200;
      }
      // radiant restore burst + cyan flash as stats normalize
      pState.atkStage = Math.max(0, pState.atkStage);
      Fx.flash(60, 0.5, [0.7, 0.92, 1]);
      Fx.slowmo(220, 0.6);
      Fx.burst(cv, { n: 20, speed: 2.4, colors: [[1, 1, 1], [0.7, 0.95, 1]], life: 0.5, up: 0.6, g: -1.5 });
      Cam.kickFov(-4, 300);
      Fx.addTrauma(0.18);
      yield 350;
      yield* say(BData.fmt(BData.MSG.cureUsed, { A: pState.name }), { auto: true });
    }
    camDefault();
  }

  function* captureSeq() {
    yield* say(BData.fmt(BData.MSG.threwBall, { A: eState.name }), { auto: true, hold: 100 });
    mode = 'none';
    // throw
    const from = chest(player);
    ball.visible = true;
    ball.scl = [1, 1, 1];
    ball.rot = [0, 0, 0];
    M3.set(ball.pos, from[0], from[1], from[2]);
    ball.flight = { from: from.slice(), to: head(enemy, 0.7), t: 0, dur: 0.55, arc: 0.85 };
    ball.trail = true;
    Sfx.play('whoosh');
    camThrow();
    yield () => !ball.flight;
    ball.trail = false;
    // suck the creature into the ball as a swirling red-white vortex
    Sfx.play('zap');
    Fx.flash(80, 0.9, [1, 0.6, 0.5]);
    Fx.slowmo(260, 0.5);
    Cam.kickFov(-4, 280);
    Fx.ring(chest(enemy), { r0: 1.1, r1: 0.1, n: 16, life: 0.32, colors: [[1, 0.4, 0.4], [1, 1, 1]], s: 0.05 });
    recallFx(enemy, ball.pos, [[1, 0.4, 0.4], [1, 1, 1]]);
    tw3(enemy.scl, [0.02, 0.02, 0.02], 240, 'inQuad');
    enemy.flashT = 0.45;
    yield 260;
    enemy.visible = false;
    // drop and settle
    const ground = [enemy.pos[0] - DIR_PM[0] * 0.5, 0.16, enemy.pos[2] - DIR_PM[2] * 0.5];
    ball.flight = { from: ball.pos.slice(), to: ground, t: 0, dur: 0.42, arc: 0.2 };
    yield () => !ball.flight;
    Sfx.play('thud');
    Fx.burst(ground, { n: 8, speed: 1.2, up: 0.8, g: -5, colors: [[0.45, 0.4, 0.34], [0.6, 0.55, 0.45]], life: 0.4, s: 0.045 });
    camBallClose(ground);
    yield 480;
    // wobble drama
    const success = rngBattle() < BData.captureChance(eState.hp / eState.stats.maxHp, eState.isBoss);
    const wobbles = success ? 3 : 1 + Math.floor(rngBattle() * 2);
    for (let i = 0; i < wobbles; i++) {
      Sfx.play('cursor');
      tw3(ball.rot, [0, 0, 0.5], 110, 'outQuad',
        () => tw3(ball.rot, [0, 0, -0.42], 160, 'inOutCubic',
          () => tw3(ball.rot, [0, 0, 0], 130, 'outQuad')));
      Fx.addTrauma(0.08);
      yield 640;
    }
    if (success) {
      Sfx.play('confirm');
      Fx.slowmo(420, 0.4);                  // bullet-time celebration
      Fx.flash(90, 0.7, [1, 0.9, 0.5]);
      Cam.kickFov(-5, 360);
      const bp = [ball.pos[0], ball.pos[1] + 0.2, ball.pos[2]];
      Fx.burst(bp, { n: 30, speed: 2.4, up: 1.6, g: -2.2, colors: [[1, 0.92, 0.5], [1, 1, 1], [0.7, 0.9, 1]], life: 0.8, s: 0.055 });
      Fx.ring([ball.pos[0], ball.pos[1] + 0.1, ball.pos[2]], { r0: 0.1, r1: 0.9, n: 16, life: 0.48, colors: [[1, 0.92, 0.5]], s: 0.05 });
      Fx.ring([ball.pos[0], 0.05, ball.pos[2]], { r0: 0.15, r1: 1.1, n: 14, life: 0.5, colors: [[1, 1, 1], [1, 0.92, 0.5]], s: 0.045 });
      // radiant celebratory light beams shoot upward
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        Fx.spawn({ p: [ball.pos[0] + Math.cos(a) * 0.15, ball.pos[1], ball.pos[2] + Math.sin(a) * 0.15],
                   c: i % 2 ? [1, 0.92, 0.5] : [1, 1, 1], v: [Math.cos(a) * 0.5, 3.6, Math.sin(a) * 0.5], drag: 0.2, life: 0.7, s: 0.05, s1: 0.01 });
      }
      Sfx.play('victory');
      yield 700;
      yield* say(BData.fmt(BData.MSG.caught, { A: eState.name }));
      if (Game.save.party.length < 6)
        Game.save.party.push({ species: eState.baseId || eState.id, level: eState.level, hp: Math.max(1, eState.hp), exp: 0 });
      yield* say(BData.fmt(BData.MSG.joined, { A: eState.name }));
      ball.visible = false;
      eState.hp = 0; // remove from the enemy party; turnScript handles win vs. next
      return 'caught';
    }
    // broke free — violent red burst + shockwave
    Sfx.play('impact'); Sfx.play('boom');
    Fx.flash(95, 0.95, [1, 0.5, 0.45]);
    Fx.burst(ball.pos, { n: 30, speed: 3.0, colors: [[1, 1, 1], [1, 0.4, 0.4], [1, 0.85, 0.45]], life: 0.55, g: -2 });
    Fx.ring([ball.pos[0], ball.pos[1] + 0.1, ball.pos[2]], { r0: 0.15, r1: 1.3, n: 16, life: 0.45, colors: [[1, 0.5, 0.45], [1, 1, 1]], s: 0.06 });
    ball.visible = false;
    enemy.visible = true;
    enemy.scl = [0.02, 0.02, 0.02];
    tw3(enemy.scl, [1, 1, 1], 300, 'outBack');
    enemy.flashT = 0.4;
    Fx.addTrauma(0.4);
    Sfx.play('spawn');
    camDefault();
    yield 420;
    yield* say(BData.fmt(BData.MSG.broke, { A: eState.name }));
    return 'broke';
  }

  function* runSeq() {
    mode = 'none';
    camRun();
    // crouch then explosive sprint away with a dust kick + speed lines
    Sfx.play('charge');
    tw3(player.scl, [1.16, 0.82, 1.16], 130, 'outQuad');
    tw3(player.offset, [DIR_PM[0] * 0.3, 0, DIR_PM[2] * 0.3], 130, 'outQuad');
    yield 150;
    Sfx.play('whoosh');
    Fx.flash(45, 0.3);
    Fx.burst([player.pos[0], 0.1, player.pos[2]], { n: 14, speed: 1.8, up: 1.0, g: -5, drag: 2, colors: [[0.6, 0.55, 0.45], [0.45, 0.4, 0.34], [1, 1, 1]], life: 0.45, s: 0.05 });
    player.trailT = 0.5;
    tw3(player.scl, [0.85, 1.15, 0.85], 120, 'outQuad', () => tw3(player.scl, [1, 1, 1], 200, 'outQuad'));
    tw3(player.offset, [-DIR_PM[0] * 2.2, 0, -DIR_PM[2] * 2.2], 420, 'inQuad');
    Fx.addTrauma(0.2);
    Cam.kickFov(9, 340);
    yield 240;
    Sfx.play('whoosh');
    yield 230;
    yield* say(BData.MSG.fled, { auto: true });
    endBattle('run');
  }

  /* one full player turn. action:
     {type:'move', idx} | {type:'item', which} | {type:'switch', to} |
     {type:'capture'} | {type:'run'} */
  function* turnScript(action) {
    if (action.type === 'run') { yield* runSeq(); return; }
    if (action.type === 'capture') {
      const r = yield* captureSeq(); // 'caught' | 'broke'
      if (r === 'caught') {
        if (enemyAlive()) { yield* afterEnemyDown(); backToMenu(); return; }
        endBattle('capture'); return;
      }
      if (!(yield* enemyTurn())) return;
      backToMenu(); return;
    }
    if (action.type === 'item') {
      yield* itemSeq(action.which);
      if (!(yield* enemyTurn())) return;
      backToMenu(); return;
    }
    if (action.type === 'switch') {
      yield* switchSeq(action.to, true);
      if (!(yield* enemyTurn())) return;
      backToMenu(); return;
    }
    // attack: both sides act in speed order
    const playerMove = pState.moves[action.idx];
    const enemyMove = enemyPick();
    const pFirst = pState.stats.spe === eState.stats.spe ? rngBattle() < 0.5 : pState.stats.spe > eState.stats.spe;
    const order = pFirst ? [['P', playerMove], ['E', enemyMove]] : [['E', enemyMove], ['P', playerMove]];
    for (const [s, mv] of order) {
      if (sideState(s).hp <= 0) continue;
      if (s === 'E') {
        // boss reacts by awakening the first time it drops below its threshold
        if (eState.isBoss && eState.form === 0 && eState.hp > 0 && eState.hp < eState.stats.maxHp * eState.threshold) {
          yield* transformSeq('E'); continue;
        }
        if (giantReady()) { yield* giantEnrageSeq('E'); continue; } // giant phase 2
        const sw = maybeEnemySwitch();
        if (sw) { yield* sw; continue; }   // pivot to a better matchup instead of attacking
      }
      yield* doMove(s, mv);
      const victim = other(s);
      if (sideState(victim).hp <= 0) {
        yield* faintSeq(victim);
        if (victim === 'E') {
          yield* awardExp(BData.expReward(eState.level));
          if (enemyAlive()) { yield* afterEnemyDown(); break; } // more foes; player's turn next
          yield* victorySeq(); return;
        }
        if (othersAlive()) { yield* forcedSwitch(); break; }
        yield* defeatSeq(); return;
      }
    }
    backToMenu();
  }

  function* introScript() {
    yield 650; // let the transition reveal finish before the first message
    if (tutorial) { yield* introTutorial(); return; }
    if (curEnemy && curEnemy.isBoss) { yield* introBoss(); return; }
    yield* say(BData.fmt(BData.MSG.challenge, { T: curEnemy.trainer }));
    yield* say(BData.fmt(BData.MSG.sentOut, { T: curEnemy.trainer, M: eState.name }), { auto: true, hold: 120 });
    yield* spawnIn(enemy, themeOf(eState.id));
    yield 150;
    yield* say(BData.fmt(BData.MSG.go, { A: pState.name }), { auto: true, hold: 120 });
    yield* spawnIn(player, themeOf(pState.id));
    yield 200;
    backToMenu();
  }

  // tutorial entrance: the colossal giant looms in; we command the protector
  function* introTutorial() {
    yield* say(BData.MSG.giantAppear);
    Cam.play([{ t: 1200, pos: TUTORIAL_SHOT.pos, look: TUTORIAL_SHOT.look, fov: TUTORIAL_SHOT.fov, ease: 'inOutCubic' }]);
    yield* spawnInBoss(enemy);
    yield* say(BData.MSG.giantReveal, { auto: true, hold: 220 });
    yield 120;
    yield* say(BData.fmt(BData.MSG.go, { A: pState.name }), { auto: true, hold: 120 });
    yield* spawnIn(player, themeOf(pState.id));
    yield 180;
    backToMenu();
  }

  // epic dungeon entrance: the boss looms in atop the cliff through the rift
  function* introBoss() {
    yield* say(BData.MSG.bossAppear1);
    yield* say(BData.MSG.bossAppear2, { auto: true, hold: 200 });
    Cam.play([{ t: 1400, pos: DUNGEON_SHOT.pos, look: DUNGEON_SHOT.look, fov: DUNGEON_SHOT.fov, ease: 'inOutCubic' }]);
    yield* spawnInBoss(enemy);
    yield* say(BData.MSG.bossReveal, { auto: true, hold: 220 });
    yield 150;
    yield* say(BData.fmt(BData.MSG.go, { A: pState.name }), { auto: true, hold: 120 });
    yield* spawnIn(player, themeOf(pState.id));
    yield 200;
    backToMenu();
  }

  function backToMenu() {
    state = 'MENU';
    mode = 'menu';
    menuMode = 'top';
    Cam.idleDrift(true);
    camDefault(550);
  }

  function startTurn(action) {
    Sfx.play('confirm');
    state = 'TURN';
    mode = 'none';
    Cam.idleDrift(false);
    run(turnScript(action));
  }

  // inline "nope" message that returns to a menu without using the turn
  function menuNotice(text, backMode) {
    Sfx.play('buzz');
    state = 'TURN';
    const back = backMode || menuMode;
    run((function* () {
      yield* say(text);
      state = 'MENU';
      mode = 'menu';
      menuMode = back;
      Cam.idleDrift(true);
    })());
  }

  function endBattle(result) {
    state = 'DONE';
    mode = 'none';
    // the opening tutorial uses a throwaway team (the protector) and always
    // hands off to the faint cutscene — never touches the saved party.
    if (tutorial) { Game.onTutorialBattleEnd(result); return; }
    // persist levels/EXP gained, then fully heal the whole party (incl. a
    // monster just captured) after every battle
    for (let i = 0; i < pParty.length && i < Game.save.party.length; i++) {
      Game.save.party[i].level = pParty[i].level;
      Game.save.party[i].exp = pParty[i].exp;
    }
    for (let i = 0; i < Game.save.party.length; i++) Game.save.party[i].hp = null;
    Game.onBattleEnd(result, curEnemy);
  }

  let rngLocal = M3.rng(99);

  // ----------------------------------------------------------- env build
  function buildStatic() {
    if (staticH) return;
    const parts = [];
    const push = (name, pos, yaw, s) => parts.push({ m: Models.get(name), pos, yaw, s });

    const ground = Models.groundMesh({
      radius: 14.5,
      patches: [
        { x: P_POS[0], z: P_POS[2], rx: 1.15, rz: 0.85, rot: 0.35 },
        { x: M_POS[0], z: M_POS[2], rx: 1.45, rz: 1.0, rot: -0.18 },
      ],
    });

    const r = M3.rng(42);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.3;
      push('tree' + (i % 3), [Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5], r() * 6.3, 0.85 + r() * 0.45);
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.18 + r() * 0.25;
      push('tree' + ((i + 1) % 3), [Math.cos(a) * 12.2, 0, Math.sin(a) * 12.2], r() * 6.3, 1.05 + r() * 0.5);
    }
    push('slab', [REX_POS[0], 0, REX_POS[2]], 0.4, 1.0);
    push('rock0', [3.9, 0, 4.7], 0.7, 1.25);
    push('rock1', [2.0, 0, 5.1], 2.4, 0.9);
    push('rock0', [5.0, 0, 3.5], 4.2, 0.8);
    push('rock1', [-4.9, 0, 3.4], 1.1, 1.1);
    push('bush', [-3.5, 0, 1.0], 0.5, 1.0);
    push('bush', [4.6, 0, 0.3], 2.2, 0.9);
    push('bush', [-2.6, 0, 4.6], 3.9, 1.15);
    push('bush', [-4.2, 0, -2.5], 1.4, 1.0);
    push('bush', [3.4, 0, -3.4], 5.1, 0.85);
    for (let i = 0; i < 60; i++) {
      const a = r() * Math.PI * 2, rad = 2.5 + r() * 5.5;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (Math.hypot(x - P_POS[0], z - P_POS[2]) < 1.8) continue;
      if (Math.hypot(x - M_POS[0], z - M_POS[2]) < 2.0) continue;
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

  // dark rift dungeon: obsidian floor, the boss's cliff, a looming portal
  // backdrop, and a ring of jagged spires.
  function buildDungeon() {
    if (dungeonH) return;
    const parts = [];
    const push = (name, pos, yaw, s) => parts.push({ m: Models.get(name), pos, yaw, s });
    const ground = Models.groundMesh({
      radius: 16, dark: true,
      patches: [
        { x: P_POS[0], z: P_POS[2], rx: 1.2, rz: 0.9, rot: 0.3 },
        { x: BOSS_POS[0], z: BOSS_POS[2], rx: 2.8, rz: 2.8, rot: 0 },
      ],
    });
    push('cliff', [BOSS_POS[0], 0, BOSS_POS[2]], 0.2, 1.0);                       // boss perch
    push('portal', [BOSS_POS[0] + 0.4, 1.4, BOSS_POS[2] + 3.0], YAW_M, 2.1);      // looming rift backdrop
    const r = M3.rng(909);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.2, rad = 11 + r() * 3;
      push('spire', [Math.cos(a) * rad, 0, Math.sin(a) * rad], r() * 6.3, 0.8 + r() * 1.1);
    }
    for (let i = 0; i < 8; i++) {
      const a = r() * Math.PI * 2, rad = 4 + r() * 5;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (Math.hypot(x - P_POS[0], z - P_POS[2]) < 2.0) continue;
      if (Math.hypot(x - BOSS_POS[0], z - BOSS_POS[2]) < 3.2) continue;
      push('spire', [x, 0, z], r() * 6.3, 0.4 + r() * 0.5);
    }
    let total = ground.count;
    for (const p of parts) total += p.m.count;
    const data = new Float32Array(total * 9);
    data.set(ground.data, 0);
    let off = ground.count * 9;
    for (const p of parts)
      off = M3.bakeMesh(data, off, p.m.data, p.m.count, p.pos, p.yaw, p.s);
    dungeonH = Gfx.upload({ data, count: total });
  }

  // dark dream arena for the opening tutorial: obsidian floor + a ring of spires
  function buildTutorial() {
    if (tutorialH) return;
    const parts = [];
    const push = (name, pos, yaw, s) => parts.push({ m: Models.get(name), pos, yaw, s });
    const ground = Models.groundMesh({
      radius: 15, dark: true,
      patches: [
        { x: P_POS[0], z: P_POS[2], rx: 1.2, rz: 0.9, rot: 0.3 },
        { x: GIANT_POS[0], z: GIANT_POS[2], rx: 3.2, rz: 3.2, rot: 0 },
      ],
    });
    const r = M3.rng(321);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.2, rad = 11 + r() * 3;
      push('spire', [Math.cos(a) * rad, 0, Math.sin(a) * rad], r() * 6.3, 0.7 + r() * 1.0);
    }
    let total = ground.count;
    for (const p of parts) total += p.m.count;
    const data = new Float32Array(total * 9);
    data.set(ground.data, 0);
    let off = ground.count * 9;
    for (const p of parts)
      off = M3.bakeMesh(data, off, p.m.data, p.m.count, p.pos, p.yaw, p.s);
    tutorialH = Gfx.upload({ data, count: total });
  }

  // ----------------------------------------------------------- scene API
  function enter(params) {
    params = params || {};
    Fx.clear();
    t = 0;
    tw = UI.typewriter();
    rngBattle = M3.rng((Math.random() * 1e9) | 0);
    rngLocal = M3.rng((Math.random() * 1e9) | 0);

    curEnemy = params.enemy || { species: 'MAGMULE', level: 15, trainer: 'Camper REX', npcId: 'rex' };
    arena = params.arena || 'grove';
    tutorial = !!params.tutorial;
    if (arena === 'dungeon') { buildDungeon(); curStatic = dungeonH; curEnv = DUNGEON_ENV; defShot = DUNGEON_SHOT; }
    else if (arena === 'tutorial') { buildTutorial(); curStatic = tutorialH; curEnv = TUTORIAL_ENV; defShot = TUTORIAL_SHOT; }
    else { buildStatic(); curStatic = staticH; curEnv = ENV; defShot = DEFAULT_SHOT; }
    ashT = 0.4; riftT = 1.2;
    if (typeof Game.setLetterbox === 'function') Game.setLetterbox(0, 5); // NORMAL screen during battle

    // build party combat states (tutorial overrides the saved party with a
    // throwaway team — the protector AEGIS)
    const srcParty = params.playerTeam || Game.save.party;
    pParty = srcParty.map((m) => {
      const sp = BData.SPECIES[m.species];
      const stats = BData.statsFor(m.species, m.level);
      const hp = m.hp === null || m.hp === undefined ? stats.maxHp : M3.clamp(m.hp, 0, stats.maxHp);
      const pp = (sp.ppInit || sp.moves.map((id) => BData.MOVES[id].pp)).slice();
      return { id: m.species, name: sp.name, level: m.level, exp: m.exp || 0, stats,
               hp, displayHp: hp, drainRate: 60, atkStage: 0, form: 0,
               moves: sp.moves.slice(), pp };
    });
    activeIdx = Math.max(0, pParty.findIndex((m) => m.hp > 0));
    pState = pParty[activeIdx];

    // enemy party from the descriptor; difficulty scales team size + levels for
    // ordinary trainers (story foes — boss / giant — are left untouched).
    let team = curEnemy.team || [{ species: curEnemy.species || 'MAGMULE', level: curEnemy.level || 15 }];
    if (!curEnemy.isBoss && !tutorial) {
      const diff = BData.DIFFICULTY[curTier()] || BData.DIFFICULTY[3];
      team = team.slice(0, Math.max(1, diff.teamMax))
                 .map((m) => ({ species: m.species, level: M3.clamp(m.level + diff.levelDelta, 2, BData.MAXLV) }));
    }
    eParty = team.map((m) => makeEnemy(m.species, m.level, curEnemy.isBoss));
    eActiveIdx = 0;
    eState = eParty[0];

    player = actor(modelOf(pState.id), P_POS, YAW_P);
    enemy = actor(modelOf(eState.id), enemyPos(), YAW_M);
    if (eState.isBoss || eState.isGiant) { enemy.bobAmp = 0.05; enemy.bobRate = 1.0; } // slow looming menace
    rex = actor(curEnemy.trainerModel || 'rex_raised', REX_POS, YAW_M + 0.15);
    items = { heal: BData.ITEMS.heal.uses, cure: BData.ITEMS.cure.uses };
    expFrac = M3.clamp(pState.exp / BData.expToNext(pState.level), 0, 1); expTween = null;
    topCursor = 0; moveCursor = 0; itemCursor = 0; partyCursor = 0;
    awaitParty = false; pickedAlly = -1; awaitOptional = false;
    awaitAsk = false; askChoice = -1; askCursor = 1;
    ball.visible = false; ball.flight = null;
    Sfx.startMusic(arena === 'dungeon' ? 'boss' : (arena === 'tutorial' ? 'tutorial' : 'battle'));

    if (params.fly) {
      state = 'FLY';
      mode = 'none';
      player.visible = enemy.visible = true;
      fly = { yaw: YAW_P, pitch: -0.12 };
      Cam.cut(defShot.pos, defShot.look, defShot.fov);
    } else {
      state = 'INTRO';
      mode = 'none';
      player.visible = enemy.visible = false;
      if (arena === 'dungeon' || arena === 'tutorial') {
        const ep = enemyPos();
        Cam.cut([P_POS[0] - DIR_PM[0] * 1.0, 0.4, P_POS[2] - DIR_PM[2] * 1.0], [ep[0], 2.0, ep[2]], 56);
      } else {
        Cam.cut([4.8, 3.1, 6.6], [0, 0.9, 0.2], 44);
        Cam.play([{ t: 2300, pos: defShot.pos, look: defShot.look, fov: defShot.fov, ease: 'inOutCubic' }]);
      }
      run(introScript());
    }
  }

  // ----------------------------------------------------------- menu input
  function nav2x2(cur, count) {
    let c = cur;
    if (Input.pressed('up')) c = c & ~2;
    if (Input.pressed('down')) c = c | 2;
    if (Input.pressed('left')) c = c & ~1;
    if (Input.pressed('right')) c = c | 1;
    if (c >= count) c = count - 1;
    return c;
  }

  function hitRects(rects, count) {
    if (!Input.mouse.inside) return -1;
    for (let i = 0; i < rects.length && i < count; i++) {
      const r = rects[i];
      if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
          Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) return i;
    }
    return -1;
  }

  function partyRows() {
    return pParty.map((m, i) => ({
      name: m.name, lv: m.level,
      hp: Math.round(m.displayHp), maxHp: m.stats.maxHp,
      frac: m.displayHp / m.stats.maxHp,
      fainted: m.hp <= 0, active: i === activeIdx,
    }));
  }

  function handlePartyNav(forced) {
    const n = pParty.length;
    if (Input.pressed('up')) { partyCursor = (partyCursor + n - 1) % n; Sfx.play('cursor'); }
    if (Input.pressed('down')) { partyCursor = (partyCursor + 1) % n; Sfx.play('cursor'); }
    const hov = hitRects(UI.PARTY_ROW_RECTS, pParty.length);
    if (hov >= 0) partyCursor = hov;
    const clicked = hov >= 0 && Input.mouse.clicked;
    if (Input.pressed('confirm') || clicked) {
      const m = pParty[partyCursor];
      if (partyCursor === activeIdx || m.hp <= 0) { Sfx.play('buzz'); return; }
      if (forced) { Sfx.play('confirm'); pickedAlly = partyCursor; }
      else startTurn({ type: 'switch', to: partyCursor });
      return;
    }
    if ((awaitOptional || !forced) && (Input.pressed('back') || Input.pressed('party'))) {
      Sfx.play('cursor');
      if (forced) pickedAlly = activeIdx; // optional switch cancelled -> stay in
      else menuMode = 'top';
    }
  }

  // yes/no prompt (offered when the opponent's monster goes down)
  function handleAsk() {
    if (Input.pressed('left') || Input.pressed('right')) { askCursor ^= 1; Sfx.play('cursor'); }
    const hov = hitRects([UI.MOVE_RECTS[0], UI.MOVE_RECTS[1]], 2);
    if (hov >= 0) askCursor = hov;
    if (Input.pressed('confirm') || (hov >= 0 && Input.mouse.clicked)) {
      Sfx.play('confirm'); askChoice = askCursor === 0 ? 1 : 0; return;
    }
    if (Input.pressed('back')) { Sfx.play('cursor'); askChoice = 0; }
  }

  function updateMenu() {
    if (menuMode === 'party') { handlePartyNav(false); return; }

    if (Input.pressed('party')) { Sfx.play('cursor'); menuMode = 'party'; partyCursor = activeIdx; return; }

    if (menuMode === 'top') {
      const prev = topCursor;
      topCursor = nav2x2(topCursor, 4);
      if (topCursor !== prev) Sfx.play('cursor');
      const hov = hitRects(UI.MOVE_RECTS, 4);
      if (hov >= 0) topCursor = hov;
      // party row hotspot
      const hs = UI.PARTY_ROW_HOTSPOT;
      if (Input.mouse.inside && Input.mouse.clicked &&
          Input.mouse.x >= hs.x && Input.mouse.x <= hs.x + hs.w &&
          Input.mouse.y >= hs.y && Input.mouse.y <= hs.y + hs.h) {
        Sfx.play('cursor'); menuMode = 'party'; partyCursor = activeIdx; return;
      }
      if (Input.pressed('confirm') || (hov >= 0 && Input.mouse.clicked)) {
        const pick = hov >= 0 && Input.mouse.clicked ? hov : topCursor;
        topCursor = pick;
        if (pick === 0) { Sfx.play('cursor'); menuMode = 'items'; itemCursor = 0; }
        else if (pick === 1) {
          if (Game.save.party.length >= 6) menuNotice(BData.MSG.partyFull);
          else startTurn({ type: 'capture' });
        }
        else if (pick === 2) startTurn({ type: 'run' });
        else { Sfx.play('cursor'); menuMode = 'moves'; moveCursor = 0; }
        return;
      }
      if (Input.pressed('back')) Sfx.play('buzz');
      return;
    }

    if (menuMode === 'moves') {
      const count = pState.moves.length;
      const prev = moveCursor;
      moveCursor = nav2x2(moveCursor, count);
      if (moveCursor !== prev) Sfx.play('cursor');
      const hov = hitRects(UI.MOVE_RECTS, count);
      if (hov >= 0) moveCursor = hov;
      if (Input.pressed('confirm') || (hov >= 0 && Input.mouse.clicked)) {
        if (pState.pp[moveCursor] <= 0) { menuNotice(BData.MSG.noPp); return; }
        startTurn({ type: 'move', idx: moveCursor });
        return;
      }
      if (Input.pressed('back')) { Sfx.play('cursor'); menuMode = 'top'; }
      return;
    }

    if (menuMode === 'items') {
      const prev = itemCursor;
      itemCursor = nav2x2(itemCursor, 3);
      if (itemCursor !== prev) Sfx.play('cursor');
      const hov = hitRects(UI.MOVE_RECTS, 3);
      if (hov >= 0) itemCursor = hov;
      if (Input.pressed('confirm') || (hov >= 0 && Input.mouse.clicked)) {
        if (itemCursor === 2) { Sfx.play('cursor'); menuMode = 'top'; return; }
        const which = itemCursor === 0 ? 'heal' : 'cure';
        if (items[which] <= 0) { menuNotice(BData.MSG.noneLeft, 'top'); return; }
        startTurn({ type: 'item', which });
        return;
      }
      if (Input.pressed('back')) { Sfx.play('cursor'); menuMode = 'top'; }
    }
  }

  function updateFly(rawDt) {
    const f = fly;
    const sp = (Input.held('fast') ? 9 : 3.5) * rawDt;
    f.yaw += ((Input.held('lookLeft') ? 1 : 0) - (Input.held('lookRight') ? 1 : 0)) * 1.8 * rawDt;
    f.pitch = M3.clamp(f.pitch + ((Input.held('lookUp') ? 1 : 0) - (Input.held('lookDown') ? 1 : 0)) * 1.2 * rawDt, -1.3, 1.3);
    const fwd = [Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), Math.cos(f.yaw) * Math.cos(f.pitch)];
    const right = [fwd[2], 0, -fwd[0]];
    const mv = [0, 0, 0];
    M3.addScaled(mv, mv, fwd, -Input.axisY() * sp);
    M3.addScaled(mv, mv, right, Input.axisX() * sp);
    mv[1] += ((Input.held('rise') ? 1 : 0) - (Input.held('fall') ? 1 : 0)) * sp;
    M3.add(Cam.cur.pos, Cam.cur.pos, mv);
    M3.set(Cam.cur.look,
      Cam.cur.pos[0] + fwd[0] * 5, Cam.cur.pos[1] + fwd[1] * 5, Cam.cur.pos[2] + fwd[2] * 5);
    if (Input.pressed('pose')) {
      poseText = JSON.stringify(Cam.pose());
      console.log('CAMERA POSE', poseText);
    }
  }

  function update(rawDt) {
    const dt = rawDt * Fx.timeScale();
    t += dt;
    Cam.update(dt);
    stepTweens(dt);
    stepScript(dt);
    tw.update(dt);

    // ball flight (parabolic arc + spin + trail)
    if (ball.flight) {
      const f = ball.flight;
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      ball.pos[0] = M3.lerp(f.from[0], f.to[0], u);
      ball.pos[2] = M3.lerp(f.from[2], f.to[2], u);
      ball.pos[1] = M3.lerp(f.from[1], f.to[1], u) + f.arc * Math.sin(u * Math.PI);
      ball.rot[2] -= dt * 13;
      if (ball.trail) Fx.streak(ball.pos, { colors: [[1, 1, 1], [1, 0.5, 0.45]], s: 0.045 });
      if (u >= 1) ball.flight = null;
    }

    for (const st of pParty.concat([eState])) {
      if (Math.abs(st.displayHp - st.hp) > 0.01) {
        const dir = st.hp > st.displayHp ? 1 : -1;
        st.displayHp += dir * st.drainRate * dt;
        if ((dir > 0 && st.displayHp > st.hp) || (dir < 0 && st.displayHp < st.hp)) st.displayHp = st.hp;
      }
    }
    if (expTween) {
      expTween.t += dt;
      expFrac = M3.lerp(expTween.from, expTween.to, M3.ease.outCubic(M3.clamp(expTween.t / expTween.dur, 0, 1)));
      if (expTween.t >= expTween.dur) expTween = null;
    }
    for (const a of [player, enemy, rex]) {
      if (a.flashT > 0) a.flashT -= dt;
      if (a.shiverT > 0) a.shiverT -= dt;
      if (a.trailT > 0) {
        a.trailT -= dt;
        Fx.streak([a.pos[0] + a.offset[0], a.pos[1] + a.offset[1], a.pos[2] + a.offset[2]],
                  { colors: [[1, 1, 1], [0.95, 0.85, 0.55]], s: 0.09 });
      }
    }

    // dungeon / tutorial atmosphere: drifting ash, periodic void-lightning + pulses
    if ((arena === 'dungeon' || arena === 'tutorial') && state !== 'DONE') {
      const ep = enemyPos();
      ashT -= dt;
      if (ashT <= 0) {
        ashT = 0.05;
        Fx.spawn({ p: [(Math.random() - 0.5) * 16, 7, (Math.random() - 0.5) * 10 + 3], c: [0.5, 0.3, 0.7],
                   v: [0, -1.4 - Math.random(), 0], drag: 0.1, life: 2.2, s: 0.03, s1: 0.01 });
      }
      riftT -= dt;
      if (riftT <= 0) {
        // strike far more often while an action plays — "raid" intensity
        const acting = state === 'TURN';
        riftT = (acting ? 0.9 : 2.4) + Math.random() * (acting ? 1.0 : 3);
        Fx.flash(110, acting ? 0.28 : 0.22, [0.6, 0.3, 0.95]);
        Fx.pulseLight([ep[0], ep[1] + 1.6, ep[2]], [0.66, 0.42, 1], acting ? 1.8 : 1.3, 240, 9);
        Fx.addTrauma(acting ? 0.14 : 0.1);
        Fx.burst([ep[0], ep[1] + 1.5, ep[2] + 1.5], { n: 8, speed: 2, colors: [[0.7, 0.3, 1], [1, 1, 1]], life: 0.5, g: -1 });
      }
    }

    if (state === 'MENU') updateMenu();
    else if (awaitAsk) handleAsk();
    else if (awaitParty) handlePartyNav(true);
    else if (state === 'FLY') updateFly(rawDt);
  }

  function render3d(aspect) {
    const { view, proj } = Cam.matrices(aspect);
    curEnv.point = Fx.lightState(); // attacks pulse a colored light into the arena
    Gfx.begin(view, proj, curEnv);
    Gfx.draw(curStatic, null, {});
    if (enemy.visible) Gfx.draw(enemy.h, actorMat(enemy), { flash: enemy.flashT > 0 ? M3.clamp(enemy.flashT / 0.25, 0, 1) : 0 });
    if (player.visible) Gfx.draw(player.h, actorMat(player), { flash: player.flashT > 0 ? M3.clamp(player.flashT / 0.25, 0, 1) : 0 });
    if (arena === 'grove') Gfx.draw(rex.h, actorMat(rex), {});
    if (ball.visible)
      Gfx.draw(Game.handle('ball'), M3.trs(mTmp2, ball.pos, ball.rot, ball.scl), {});
    const pd = Fx.particleData();
    Gfx.drawDynamic(pd.data, pd.count);
  }

  function renderUi(ctx) {
    UI.redFrame(ctx);
    const eballs = [];
    for (let i = 0; i < 6; i++) eballs.push(i < eParty.length ? (eParty[i].hp > 0 ? 'full' : 'faded') : 'empty');
    UI.enemyPanel(ctx, {
      name: eState.name, lv: eState.level,
      hpFrac: eState.displayHp / eState.stats.maxHp,
      party: eballs,
    });
    UI.playerPanel(ctx, {
      name: pState.name, lv: pState.level,
      hp: Math.round(pState.displayHp), maxHp: pState.stats.maxHp,
      hpFrac: pState.displayHp / pState.stats.maxHp,
      expFrac,
    });
    if (mode === 'menu') {
      const balls = [];
      for (let i = 0; i < 6; i++)
        balls.push(i < pParty.length ? (pParty[i].hp > 0 ? 'full' : 'faded') : 'empty');
      UI.playerParty(ctx, balls);
      UI.partyHint(ctx);
      UI.emblem(ctx, 452, 426);
      if (menuMode === 'top') {
        UI.actionGrid(ctx, [
          { label: 'Items', style: 'ITEMS', sub: 'x' + (items.heal + items.cure) },
          { label: 'Capture', style: 'CAPTURE' },
          { label: 'Run', style: 'RUN' },
          { label: 'Attack', style: 'ATTACK' },
        ], topCursor, t);
      } else if (menuMode === 'moves') {
        const moves = pState.moves.map((id, i) => ({
          name: BData.MOVES[id].name, type: BData.MOVES[id].type,
          pp: pState.pp[i], maxPp: BData.MOVES[id].pp,
        }));
        UI.moveGrid(ctx, moves, moveCursor, t);
      } else if (menuMode === 'items') {
        UI.actionGrid(ctx, [
          { label: 'Heal', style: 'HEAL', sub: 'x' + items.heal, disabled: items.heal <= 0 },
          { label: 'Cure', style: 'CURE', sub: 'x' + items.cure, disabled: items.cure <= 0 },
          { label: 'Back', style: 'BACK' },
        ], itemCursor, t);
      } else if (menuMode === 'party') {
        UI.partyPanel(ctx, partyRows(), partyCursor, t, false);
      }
    } else if (mode === 'msg') {
      UI.msgBox(ctx, tw, t, waitingConfirm);
    } else if (mode === 'ask') {
      PFont.draw(ctx, askText, 470, 360, { scale: 2, color: '#ffffff', outline: '#1a1a22' });
      UI.actionGrid(ctx, [{ label: 'Yes', style: 'HEAL' }, { label: 'No', style: 'BACK' }], askCursor, t);
    }
    if (awaitParty)
      UI.partyPanel(ctx, partyRows(), partyCursor, t, true);
    if (state === 'FLY') {
      UI.hint(ctx, ['FLY MODE: WASD move, IJKL look, R/F up/down, Shift fast', 'P: print camera pose', poseText]);
    }
  }

  function exit() { Fx.clear(); Cam.idleDrift(false); Sfx.stopMusic(); }

  return { enter, update, render3d, renderUi, exit };
})();
