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

  const ENV = {
    sky: M3.hex('#0d1522'),
    fog: M3.hex('#13201a'), fogNear: 7.5, fogFar: 17,
    lightDir: M3.normalize([], [-0.35, -0.8, -0.25]),
    lightCol: [0.74, 0.66, 0.55],
    ambient: [0.42, 0.50, 0.46],
  };

  const SPAWN_THEMES = {
    PIXLIT:   [[1, 1, 1], [1, 0.55, 0.8], [0.7, 0.9, 1]],
    THORNLET: [[1, 1, 1], [0.55, 0.95, 0.4], [0.3, 0.75, 0.3]],
    EMBERIK:  [[1, 1, 1], [1, 0.72, 0.2], [1, 0.48, 0.16]],
    MAGMULE:  [[1, 1, 1], [1, 0.85, 0.45], [1, 0.55, 0.2]],
  };
  const themeOf = (id) => SPAWN_THEMES[id] || SPAWN_THEMES.MAGMULE;
  const modelOf = (id) => id.toLowerCase();

  // ----------------------------------------------------------- state
  let staticH = null;          // merged scenery handle
  let player = null, enemy = null, rex = null; // actors
  let pParty = [];             // combat states for the whole player party
  let activeIdx = 0;
  let pState = null, eState = null;
  let items = { heal: 3, cure: 3 };
  let state = 'INTRO';         // INTRO | MENU | TURN | FLY | DONE
  let mode = 'none';           // UI: none | menu | msg
  let menuMode = 'top';        // top | moves | items | party
  let topCursor = 0, moveCursor = 0, itemCursor = 0, partyCursor = 0;
  let awaitParty = false, pickedAlly = -1; // forced switch handshake
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
      h: Game.handle(name), centers: m.centers, height: m.height,
    };
  }
  const mTmp = M3.mat(), mTmp2 = M3.mat();
  function actorMat(a, noBob) {
    const bob = noBob ? 0 : 0.012 * Math.sin(t * 2.1 + a.phase);
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

  function applyDamage(st, dmg) {
    st.hp = Math.max(0, st.hp - dmg);
    st.drainRate = Math.max(14, Math.abs(st.displayHp - st.hp) / 0.7);
  }
  function applyHeal(st, amount) {
    st.hp = Math.min(st.stats.maxHp, st.hp + amount);
    st.drainRate = Math.max(14, Math.abs(st.displayHp - st.hp) / 0.7);
  }
  const drained = (st) => () => Math.abs(st.displayHp - st.hp) < 0.4;
  const othersAlive = () => pParty.some((m, i) => i !== activeIdx && m.hp > 0);
  const firstAliveIdx = () => pParty.findIndex((m, i) => i !== activeIdx && m.hp > 0);

  // camera shots ----------------------------------------------------------
  function camDefault(ms) {
    Cam.play([{ t: ms || 650, pos: DEFAULT_SHOT.pos, look: DEFAULT_SHOT.look, fov: 40, ease: 'outCubic' }]);
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
    Sfx.play('charge');
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
      if (i % 5 === 4) yield 55;
    }
    yield 90;
    a.visible = true;
    a.flashT = 0.55; // holds full white, then "develops" into color
    a.scl[0] = a.scl[1] = a.scl[2] = 0.02;
    tw3(a.scl, [1, 1, 1], 520, 'outBack');
    Sfx.play('spawn');
    Cam.kickFov(-2.5, 320);
    Fx.addTrauma(0.12);
    const m = M3.trs(M3.mat(), a.pos, [a.yaw, 0, 0], [1, 1, 1]);
    const cs = a.centers;
    const step = Math.max(1, Math.floor(cs.length / 36));
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
    yield 240;
    Fx.ring([base[0], 0.06, base[2]], {
      r0: 0.18, r1: 0.95, n: 16, life: 0.42,
      colors: [[1, 1, 1], theme[1]], s: 0.05,
    });
    Fx.burst([base[0], 0.1, base[2]], {
      n: 12, speed: 1.5, up: 1.1, g: -5, drag: 2,
      colors: [theme[1], [0.45, 0.4, 0.34], [0.6, 0.55, 0.45]], life: 0.45, s: 0.05,
    });
    yield 330;
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
    const fx = move.fx;
    camAtk(s);
    yield 280;
    const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
    tw3(u.scl, [1.14, 0.84, 1.14], 150, 'outQuad');
    tw3(u.offset, [-d[0] * 0.3, 0, -d[2] * 0.3], 170, 'outQuad');
    yield 180;
    Sfx.play('whoosh');
    const reach = M3.dist(u.pos, v.pos) - 1.0;
    tw3(u.offset, [d[0] * reach, 0.05, d[2] * reach], 130, 'inQuad');
    tw3(u.scl, [0.92, 1.1, 0.92], 130, 'outQuad');
    u.trailT = 0.26;
    yield 130;
    if (!res.miss) {
      applyDamage(vs, res.dmg);
      Sfx.play('impact');
      Fx.hitstop(90);
      Fx.flash(70, 0.8);
      Fx.addTrauma(0.55);
      Cam.kickFov(6, 160);
      v.flashT = 0.28;
      Fx.ring(chest(v), { r0: 0.15, r1: 1.1, n: 14, life: 0.36, colors: fx, s: 0.06 });
      Fx.burst(chest(v), { n: 14, speed: 2.6, colors: fx, life: 0.4 });
      camImpact(other(s));
      tw3(v.offset, [d[0] * 0.5, 0, d[2] * 0.5], 160, 'outQuad', () => tw3(v.offset, [0, 0, 0], 420, 'outBack'));
      tw3(v.scl, [1.12, 0.86, 1.12], 140, 'outQuad', () => tw3(v.scl, [1, 1, 1], 380, 'outBack'));
    } else Sfx.play('whoosh');
    yield 320;
    tw3(u.offset, [0, 0, 0], 300, 'outQuad');
    tw3(u.scl, [1, 1, 1], 240, 'outQuad');
    yield 330;
    if (!res.miss) { yield drained(vs); }
    camDefault();
  }

  function* kindRings(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s));
    const fx = move.fx;
    camGrowl(s);
    yield 140;
    Sfx.play('growl');
    tw3(u.scl, [1.1, 1.06, 1.1], 220, 'outQuad', () => tw3(u.scl, [1, 1, 1], 300, 'outQuad'));
    Fx.addTrauma(0.2);
    for (let i = 0; i < 3; i++) {
      Fx.ring(head(u, 0.6), { r0: 0.15, r1: 0.95, n: 12, life: 0.42,
        colors: [fx[i % fx.length]], vy: 0.15, s: 0.05 });
      yield 140;
    }
    v.shiverT = 0.4;
    yield 420;
    camDefault();
    void res;
  }

  function* kindBeam(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const fx = move.fx;
    camBeamSide();
    Sfx.play('charge');
    const hp = head(u, 0.8);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      Fx.spawn({ p: [hp[0] + Math.cos(a) * 0.55, hp[1] + (i % 3) * 0.12 - 0.1, hp[2] + Math.sin(a) * 0.55],
                 c: fx[i % fx.length],
                 v: [-Math.cos(a) * 1.7, 0, -Math.sin(a) * 1.7], life: 0.32, s: 0.05, s1: 0.01 });
      if (i % 4 === 3) yield 60;
    }
    tw3(u.offset, [0, 0.16, 0], 300, 'outQuad');
    yield 240;
    if (!res.miss) {
      Sfx.play('beam');
      Fx.beam(head(u, 0.8), chest(v), 560, { rate: 6, colors: fx, jitter: 0.09, s: 0.065 });
      Fx.addTrauma(0.3);
      Cam.kickFov(-4, 520);
      for (let i = 0; i < 3; i++) { v.flashT = 0.16; Sfx.play('zap'); yield 170; }
      applyDamage(vs, res.dmg);
      Fx.hitstop(70);
      Fx.flash(60, 0.7);
      Fx.addTrauma(0.4);
      v.flashT = 0.3;
      Fx.burst(chest(v), { n: 24, speed: 3, colors: fx, life: 0.5, g: -3 });
      camImpact(other(s));
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.4, 0, d[2] * 0.4], 150, 'outQuad', () => tw3(v.offset, [0, 0, 0], 380, 'outBack'));
      yield 420;
    } else { Sfx.play('beam'); Fx.beam(head(u, 0.8), [v.pos[0] + 1.4, 0.4, v.pos[2] + 1.2], 400, { rate: 5, colors: fx, jitter: 0.1 }); yield 500; }
    tw3(u.offset, [0, 0, 0], 260, 'outQuad');
    yield 280;
    if (!res.miss) { yield drained(vs); }
    camDefault();
  }

  function* kindOrb(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const fx = move.fx;
    camAtk(s);
    Sfx.play('charge');
    const orb = head(u, 1.05);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      Fx.spawn({ p: [orb[0] + Math.cos(a) * 0.6, orb[1] + Math.sin(i * 2.1) * 0.25, orb[2] + Math.sin(a) * 0.6],
                 c: fx[i % fx.length],
                 v: [-Math.cos(a) * 1.9, 0, -Math.sin(a) * 1.9], life: 0.3, s: 0.06, s1: 0.015 });
      if (i % 3 === 2) yield 55;
    }
    tw3(u.scl, [1.08, 1.12, 1.08], 200, 'outQuad', () => tw3(u.scl, [1, 1, 1], 250, 'outQuad'));
    yield 200;
    Sfx.play('whoosh');
    const tgt = chest(v);
    if (!res.miss) {
      for (let i = 0; i < 10; i++)
        Fx.spawn({ p: [orb[0] + (Math.random() - 0.5) * 0.2, orb[1] + (Math.random() - 0.5) * 0.2, orb[2] + (Math.random() - 0.5) * 0.2],
                   c: fx[i % fx.length],
                   v: [(tgt[0] - orb[0]) / 0.3, (tgt[1] - orb[1]) / 0.3 + 0.45, (tgt[2] - orb[2]) / 0.3],
                   g: -3, life: 0.3, s: 0.075, s1: 0.05 });
      yield 290;
      applyDamage(vs, res.dmg);
      Sfx.play('boom');
      Fx.hitstop(120);
      Fx.flash(90, 1.0);
      Fx.addTrauma(0.7);
      Cam.kickFov(8, 180);
      v.flashT = 0.35;
      Fx.burst(tgt, { n: 40, speed: 3.6, colors: fx, life: 0.65, g: -3.5 });
      Fx.ring(v.pos.map((x, i2) => i2 === 1 ? x + 0.1 : x), { r0: 0.3, r1: 1.7, n: 18, life: 0.5, colors: [fx[0]], s: 0.07 });
      Cam.cut([-4.2, 1.8, -3.4], [0.4, 0.5, 0.5], 46);
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.7, 0, d[2] * 0.7], 180, 'outQuad', () => tw3(v.offset, [0, 0, 0], 460, 'outBack'));
      tw3(v.scl, [1.16, 0.8, 1.16], 160, 'outQuad', () => tw3(v.scl, [1, 1, 1], 420, 'outBack'));
      yield 520;
      yield drained(vs);
    } else {
      for (let i = 0; i < 10; i++)
        Fx.spawn({ p: orb.slice(), c: fx[0],
                   v: [(tgt[0] - orb[0]) / 0.3 + 1.5, 1.2, (tgt[2] - orb[2]) / 0.3], g: -4, life: 0.5, s: 0.07 });
      yield 500;
    }
    camDefault();
  }

  function* kindVolley(s, res, move) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    const fx = move.fx;
    camAtk(s);
    yield 220;
    Sfx.play('sizzle');
    const mouth = head(u, 0.85);
    const tgt = chest(v);
    for (let i = 0; i < 12; i++) {
      const ft = 0.42;
      const spread = [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5];
      Fx.spawn({ p: mouth.slice(),
                 c: fx[i % fx.length],
                 v: [(tgt[0] + spread[0] - mouth[0]) / ft, (tgt[1] - mouth[1]) / ft + 0.5 * 6 * ft / 2, (tgt[2] + spread[2] - mouth[2]) / ft],
                 g: -6, life: ft + 0.06, s: 0.085, s1: 0.05 });
      if (i % 2) Sfx.play('thud');
      if (i > 3 && !res.miss) {
        Fx.burst([tgt[0] + (Math.random() - 0.5) * 0.5, tgt[1], tgt[2] + (Math.random() - 0.5) * 0.5],
                 { n: 3, speed: 1.4, colors: [fx[0], [0.5, 0.45, 0.42]], life: 0.4, up: 1.2 });
        Fx.addTrauma(0.1);
        v.flashT = Math.max(v.flashT, 0.1);
      }
      yield 60;
    }
    yield 240;
    if (!res.miss) {
      applyDamage(vs, res.dmg);
      Sfx.play('impact');
      Fx.hitstop(60);
      Fx.flash(50, 0.5);
      Fx.addTrauma(0.4);
      v.flashT = 0.25;
      Fx.burst(tgt, { n: 18, speed: 2.6, colors: fx, life: 0.5 });
      camImpact(other(s));
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.4, 0, d[2] * 0.4], 150, 'outQuad', () => tw3(v.offset, [0, 0, 0], 380, 'outBack'));
      yield 380;
      yield drained(vs);
    } else yield 300;
    camDefault();
  }

  // dynamic camera that sweeps along the fire path: behind the attacker,
  // arcing out to a side profile, then settling on the impact 3/4 view
  function camCinder(s) {
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
    camCinder(s);
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

  const ANIM_KINDS = {
    dash: kindDash, rings: kindRings, beam: kindBeam, orb: kindOrb, volley: kindVolley, cinder: kindCinder,
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
    const res = move.power
      ? BData.damage({ level: st.level, atk: st.stats.atk, atkStage: st.atkStage },
                     { def: os.stats.def, defStage: 0 }, move, rngBattle)
      : { dmg: 0, crit: false, miss: rngBattle() * 100 >= move.acc };
    yield* say(BData.fmt(BData.MSG.used, { A: st.name, M: move.name }), { auto: true, hold: 320 });
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
  }

  function* faintSeq(s) {
    const a = sideActor(s), st = sideState(s);
    Sfx.play('faint');
    Fx.flash(70, 0.8);
    yield 110;
    Fx.flash(70, 0.8);
    camFaint(s);
    yield 130;
    a.visible = false;
    Fx.dissolve(a.centers, actorMat(a, true), { life: 0.95 });
    Fx.addTrauma(0.2);
    yield 1000;
    yield* say(BData.fmt(BData.MSG.faint, { A: st.name }));
  }

  function* victorySeq() {
    camVictory();
    Sfx.play('victory');
    yield* say(BData.MSG.win1);
    yield* say(BData.MSG.win2);
    expTween = { from: expFrac, to: 0.78, t: 0, dur: 0.8 };
    yield* say(BData.fmt(BData.MSG.win3, { A: pState.name }));
    yield 250;
    endBattle('win');
  }

  function* defeatSeq() {
    Sfx.play('defeat');
    yield* say(BData.MSG.lose1);
    yield* say(BData.MSG.lose2);
    endBattle('loss');
  }

  // enemy's half of a turn. Returns false if the battle ended.
  function* enemyTurn() {
    if (eState.hp <= 0) return true;
    const mv = BData.aiPick({ atkStage: eState.atkStage, foeHpFrac: pState.hp / pState.stats.maxHp, pp: eState.epp }, rngBattle);
    yield* doMove('E', mv);
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
      camSelf();
      Sfx.play('charge');
      recallFx(player, chest(player), themeOf(pState.id));
      tw3(player.scl, [0.02, 0.02, 0.02], 260, 'inQuad');
      player.flashT = 0.4;
      Fx.ring([player.pos[0], 0.08, player.pos[2]], { r0: 0.8, r1: 0.1, n: 12, life: 0.3, colors: [themeOf(pState.id)[1], [1, 1, 1]], s: 0.045 });
      yield 290;
      player.visible = false;
      yield 180;
    }
    activeIdx = to;
    pState = pParty[to];
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

  function* itemSeq(which) {
    items[which] -= 1;
    const def = BData.ITEMS[which];
    yield* say(BData.fmt(BData.MSG.usedItem, { M: def.name }), { auto: true, hold: 150 });
    mode = 'none';
    if (which === 'heal') {
      camSelf();
      Sfx.play('heal');
      // golden-green restorative rain + rising motes
      for (let i = 0; i < 22; i++) {
        const a = rngLocal() * Math.PI * 2, r = 0.25 + rngLocal() * 0.55;
        Fx.spawn({
          p: [player.pos[0] + Math.cos(a) * r, 1.5 + rngLocal() * 0.5, player.pos[2] + Math.sin(a) * r],
          c: [[0.55, 0.95, 0.45], [1, 0.92, 0.5], [1, 1, 1]][i % 3],
          v: [0, -1.6 - rngLocal(), 0], drag: 0.4, life: 0.7, s: 0.05, s1: 0.015,
        });
        Fx.spawn({
          p: [player.pos[0] + Math.cos(a) * 0.5, 0.1, player.pos[2] + Math.sin(a) * 0.5],
          c: [0.7, 1, 0.6], v: [0, 0.8 + rngLocal() * 0.6, 0], life: 0.8, s: 0.035, s1: 0.01,
        });
        if (i % 6 === 5) yield 90;
      }
      player.flashT = 0.25;
      Fx.flash(45, 0.3);
      applyHeal(pState, Math.floor(pState.stats.maxHp * def.healFrac));
      Fx.ring([player.pos[0], 0.08, player.pos[2]], { r0: 0.15, r1: 1.0, n: 16, life: 0.5, colors: [[1, 0.92, 0.5], [0.55, 0.95, 0.45]], s: 0.05 });
      Sfx.play('spawn');
      yield 400;
      yield drained(pState);
      yield* say(BData.fmt(BData.MSG.healUsed, { A: pState.name }), { auto: true });
    } else {
      camOrbitSelf();
      Sfx.play('cure');
      // purge: violet wisps ejected, cleansing white-blue rings
      Fx.burst(chest(player), { n: 16, speed: 2.2, colors: [[0.6, 0.4, 0.9], [0.45, 0.3, 0.7]], life: 0.55, g: 1.5, drag: 0.5 });
      yield 220;
      for (let i = 0; i < 2; i++) {
        Fx.ring(chest(player), { r0: 0.1, r1: 1.2, n: 16, life: 0.45, colors: [[1, 1, 1], [0.6, 0.85, 1]], vy: 0.3, s: 0.05 });
        Sfx.play('zap');
        player.flashT = 0.18;
        yield 240;
      }
      pState.atkStage = Math.max(0, pState.atkStage);
      Fx.flash(40, 0.35);
      Cam.kickFov(-3, 250);
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
    // suck the creature into the ball
    Sfx.play('zap');
    Fx.flash(70, 0.85);
    Cam.kickFov(-3, 250);
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
    const success = rngBattle() < BData.captureChance(eState.hp / eState.stats.maxHp);
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
      Fx.flash(50, 0.4);
      Fx.burst([ball.pos[0], ball.pos[1] + 0.25, ball.pos[2]],
               { n: 18, speed: 1.8, up: 1.4, g: -2.5, colors: [[1, 0.92, 0.5], [1, 1, 1], [0.7, 0.9, 1]], life: 0.7, s: 0.05 });
      Fx.ring([ball.pos[0], ball.pos[1] + 0.1, ball.pos[2]], { r0: 0.1, r1: 0.8, n: 14, life: 0.45, colors: [[1, 0.92, 0.5]], s: 0.045 });
      Sfx.play('victory');
      yield 700;
      yield* say(BData.fmt(BData.MSG.caught, { A: eState.name }));
      Game.save.party.push({ species: eState.id, level: eState.level, hp: Math.max(1, eState.hp) });
      yield* say(BData.fmt(BData.MSG.joined, { A: eState.name }));
      ball.visible = false;
      endBattle('capture');
      return true;
    }
    // broke free
    Sfx.play('impact');
    Fx.flash(80, 0.9);
    Fx.burst(ball.pos, { n: 22, speed: 2.6, colors: [[1, 1, 1], [1, 0.4, 0.4], [1, 0.85, 0.45]], life: 0.5 });
    ball.visible = false;
    enemy.visible = true;
    enemy.scl = [0.02, 0.02, 0.02];
    tw3(enemy.scl, [1, 1, 1], 300, 'outBack');
    enemy.flashT = 0.35;
    Fx.addTrauma(0.3);
    Sfx.play('spawn');
    camDefault();
    yield 420;
    yield* say(BData.fmt(BData.MSG.broke, { A: eState.name }));
    return false;
  }

  function* runSeq() {
    mode = 'none';
    camRun();
    Sfx.play('whoosh');
    player.trailT = 0.45;
    tw3(player.offset, [-DIR_PM[0] * 1.5, 0, -DIR_PM[2] * 1.5], 400, 'inQuad');
    Fx.addTrauma(0.15);
    Cam.kickFov(7, 320);
    yield 200;
    Sfx.play('whoosh');
    yield 260;
    yield* say(BData.MSG.fled, { auto: true });
    endBattle('run');
  }

  /* one full player turn. action:
     {type:'move', idx} | {type:'item', which} | {type:'switch', to} |
     {type:'capture'} | {type:'run'} */
  function* turnScript(action) {
    if (action.type === 'run') { yield* runSeq(); return; }
    if (action.type === 'capture') {
      if (yield* captureSeq()) return;
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
    const enemyMove = BData.aiPick({ atkStage: eState.atkStage, foeHpFrac: pState.hp / pState.stats.maxHp, pp: eState.epp }, rngBattle);
    const pFirst = pState.stats.spe === eState.stats.spe ? rngBattle() < 0.5 : pState.stats.spe > eState.stats.spe;
    const order = pFirst ? [['P', playerMove], ['E', enemyMove]] : [['E', enemyMove], ['P', playerMove]];
    for (const [s, mv] of order) {
      if (sideState(s).hp <= 0) continue;
      yield* doMove(s, mv);
      const victim = other(s);
      if (sideState(victim).hp <= 0) {
        yield* faintSeq(victim);
        if (victim === 'E') { yield* victorySeq(); return; }
        if (othersAlive()) { yield* forcedSwitch(); break; }
        yield* defeatSeq(); return;
      }
    }
    backToMenu();
  }

  function* introScript() {
    yield 650; // let the transition reveal finish before the first message
    yield* say(BData.MSG.intro1);
    yield* say(BData.MSG.intro2, { auto: true, hold: 120 });
    yield* spawnIn(enemy, themeOf('MAGMULE'));
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
    for (let i = 0; i < pParty.length; i++)
      Game.save.party[i].hp = result === 'loss' ? null : pParty[i].hp;
    if (result === 'win' || result === 'capture') Game.save.beaten = true;
    Game.toOverworld(result);
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

  // ----------------------------------------------------------- scene API
  function enter(params) {
    params = params || {};
    buildStatic();
    Fx.clear();
    t = 0;
    tw = UI.typewriter();
    rngBattle = M3.rng((Math.random() * 1e9) | 0);
    rngLocal = M3.rng((Math.random() * 1e9) | 0);

    // build party combat states from the save
    pParty = Game.save.party.map((m) => {
      const sp = BData.SPECIES[m.species];
      const stats = BData.statsFor(m.species, m.level);
      const hp = m.hp === null || m.hp === undefined ? stats.maxHp : M3.clamp(m.hp, 0, stats.maxHp);
      const pp = (sp.ppInit || sp.moves.map((id) => BData.MOVES[id].pp)).slice();
      return { id: m.species, name: sp.name, level: m.level, stats,
               hp, displayHp: hp, drainRate: 60, atkStage: 0,
               moves: sp.moves.slice(), pp };
    });
    activeIdx = Math.max(0, pParty.findIndex((m) => m.hp > 0));
    pState = pParty[activeIdx];

    const eStats = BData.statsFor('MAGMULE', 15);
    eState = { id: 'MAGMULE', name: 'MAGMULE', level: 15, stats: eStats, hp: eStats.maxHp, displayHp: eStats.maxHp,
               drainRate: 60, atkStage: 0, epp: { TACKLE: 35, CINDER: 25, GROWL: 30 } };

    player = actor(modelOf(pState.id), P_POS, YAW_P);
    enemy = actor('magmule', M_POS, YAW_M);
    rex = actor('rex_raised', REX_POS, YAW_M + 0.15);
    items = { heal: BData.ITEMS.heal.uses, cure: BData.ITEMS.cure.uses };
    expFrac = 0.30; expTween = null;
    topCursor = 0; moveCursor = 0; itemCursor = 0; partyCursor = 0;
    awaitParty = false; pickedAlly = -1;
    ball.visible = false; ball.flight = null;

    if (params.fly) {
      state = 'FLY';
      mode = 'none';
      player.visible = enemy.visible = true;
      fly = { yaw: YAW_P, pitch: -0.12 };
      Cam.cut(DEFAULT_SHOT.pos, DEFAULT_SHOT.look, 40);
    } else {
      state = 'INTRO';
      mode = 'none';
      player.visible = enemy.visible = false;
      Cam.cut([4.8, 3.1, 6.6], [0, 0.9, 0.2], 44);
      Cam.play([{ t: 2300, pos: DEFAULT_SHOT.pos, look: DEFAULT_SHOT.look, fov: 40, ease: 'inOutCubic' }]);
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
    if (!forced && (Input.pressed('back') || Input.pressed('party'))) {
      Sfx.play('cursor');
      menuMode = 'top';
    }
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

    if (state === 'MENU') updateMenu();
    else if (awaitParty) handlePartyNav(true);
    else if (state === 'FLY') updateFly(rawDt);
  }

  function render3d(aspect) {
    const { view, proj } = Cam.matrices(aspect);
    Gfx.begin(view, proj, ENV);
    Gfx.draw(staticH, null, {});
    if (enemy.visible) Gfx.draw(enemy.h, actorMat(enemy), { flash: enemy.flashT > 0 ? M3.clamp(enemy.flashT / 0.25, 0, 1) : 0 });
    if (player.visible) Gfx.draw(player.h, actorMat(player), { flash: player.flashT > 0 ? M3.clamp(player.flashT / 0.25, 0, 1) : 0 });
    Gfx.draw(rex.h, actorMat(rex), {});
    if (ball.visible)
      Gfx.draw(Game.handle('ball'), M3.trs(mTmp2, ball.pos, ball.rot, ball.scl), {});
    const pd = Fx.particleData();
    Gfx.drawDynamic(pd.data, pd.count);
  }

  function renderUi(ctx) {
    UI.redFrame(ctx);
    UI.enemyPanel(ctx, {
      name: eState.name, lv: eState.level,
      hpFrac: eState.displayHp / eState.stats.maxHp,
      party: ['faded', 'full', 'empty', 'empty', 'empty', 'empty'],
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
    }
    if (awaitParty)
      UI.partyPanel(ctx, partyRows(), partyCursor, t, true);
    if (state === 'FLY') {
      UI.hint(ctx, ['FLY MODE: WASD move, IJKL look, R/F up/down, Shift fast', 'P: print camera pose', poseText]);
    }
  }

  function exit() { Fx.clear(); Cam.idleDrift(false); }

  return { enter, update, render3d, renderUi, exit };
})();
