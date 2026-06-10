/* Grove Clash — js/battle.js
   Battle: the battle scene. Replicates the reference composition:
   PIXLIT lower-left foreground (back to camera), MAGMULE center-right
   mid-distance, Camper REX on a rock slab behind it, forest clearing
   at dusk. Turn logic runs as generator-coroutine scripts; presentation
   is keyframed camera shots + voxel particles + hitstop/shake. */
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

  // ----------------------------------------------------------- state
  let staticH = null;          // merged scenery handle
  let player = null, enemy = null, rex = null; // actors
  let pState = null, eState = null;            // combat numbers
  let state = 'INTRO';         // INTRO | MENU | TURN | FLY
  let mode = 'none';           // UI: none | menu | msg
  let cursor = 0;
  let tw = null;
  let waitingConfirm = false;
  let expFrac = 0.30, expTween = null;
  let t = 0;
  let fly = null;
  let poseText = '';

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
  const mTmp = M3.mat();
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
  const drained = (st) => () => Math.abs(st.displayHp - st.hp) < 0.4;

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

  // ----------------------------------------------------------- say/drain
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

  // ----------------------------------------------------------- move anims
  function* animTackle(s, res) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
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
      Fx.ring(chest(v), { r0: 0.15, r1: 1.1, n: 14, life: 0.36, colors: [[1, 1, 1], [0.95, 0.9, 0.6]], s: 0.06 });
      Fx.burst(chest(v), { n: 14, speed: 2.6, colors: [[1, 1, 0.9], [0.95, 0.8, 0.4]], life: 0.4 });
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

  function* animGrowl(s) {
    const u = sideActor(s), v = sideActor(other(s));
    camGrowl(s);
    yield 140;
    Sfx.play('growl');
    tw3(u.scl, [1.1, 1.06, 1.1], 220, 'outQuad', () => tw3(u.scl, [1, 1, 1], 300, 'outQuad'));
    Fx.addTrauma(0.2);
    for (let i = 0; i < 3; i++) {
      Fx.ring(head(u, 0.6), { r0: 0.15, r1: 0.95, n: 12, life: 0.42,
        colors: i % 2 ? [[1, 0.55, 0.75]] : [[1, 1, 1]], vy: 0.15, s: 0.05 });
      yield 140;
    }
    v.shiverT = 0.4;
    yield 420;
    camDefault();
  }

  function* animMindbeam(s, res) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    camBeamSide();
    Sfx.play('charge');
    const hp = head(u, 0.8);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      Fx.spawn({ p: [hp[0] + Math.cos(a) * 0.55, hp[1] + (i % 3) * 0.12 - 0.1, hp[2] + Math.sin(a) * 0.55],
                 c: i % 2 ? [1, 0.4, 0.8] : [1, 1, 1],
                 v: [-Math.cos(a) * 1.7, 0, -Math.sin(a) * 1.7], life: 0.32, s: 0.05, s1: 0.01 });
      if (i % 4 === 3) yield 60;
    }
    tw3(u.offset, [0, 0.16, 0], 300, 'outQuad');
    yield 240;
    if (!res.miss) {
      Sfx.play('beam');
      Fx.beam(head(u, 0.8), chest(v), 560, { rate: 6, colors: [[1, 0.4, 0.8], [1, 1, 1], [0.78, 0.49, 1]], jitter: 0.09, s: 0.065 });
      Fx.addTrauma(0.3);
      Cam.kickFov(-4, 520);
      for (let i = 0; i < 3; i++) { v.flashT = 0.16; Sfx.play('zap'); yield 170; }
      applyDamage(vs, res.dmg);
      Fx.hitstop(70);
      Fx.flash(60, 0.7);
      Fx.addTrauma(0.4);
      v.flashT = 0.3;
      Fx.burst(chest(v), { n: 24, speed: 3, colors: [[1, 0.4, 0.8], [1, 1, 1], [0.78, 0.49, 1]], life: 0.5, g: -3 });
      camImpact(other(s));
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.4, 0, d[2] * 0.4], 150, 'outQuad', () => tw3(v.offset, [0, 0, 0], 380, 'outBack'));
      yield 420;
    } else { Sfx.play('beam'); Fx.beam(head(u, 0.8), [v.pos[0] + 1.4, 0.4, v.pos[2] + 1.2], 400, { rate: 5, colors: [[1, 0.4, 0.8], [1, 1, 1]], jitter: 0.1 }); yield 500; }
    tw3(u.offset, [0, 0, 0], 260, 'outQuad');
    yield 280;
    if (!res.miss) { yield drained(vs); }
    camDefault();
  }

  function* animPsyblast(s, res) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    camAtk(s);
    Sfx.play('charge');
    const orb = head(u, 1.05);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      Fx.spawn({ p: [orb[0] + Math.cos(a) * 0.6, orb[1] + Math.sin(i * 2.1) * 0.25, orb[2] + Math.sin(a) * 0.6],
                 c: i % 3 ? [1, 0.4, 0.8] : [0.78, 0.49, 1],
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
                   c: i % 2 ? [1, 0.4, 0.8] : [1, 1, 1],
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
      Fx.burst(tgt, { n: 40, speed: 3.6, colors: [[1, 0.4, 0.8], [1, 1, 1], [0.78, 0.49, 1], [1, 0.8, 0.95]], life: 0.65, g: -3.5 });
      Fx.ring(v.pos.map((x, i2) => i2 === 1 ? x + 0.1 : x), { r0: 0.3, r1: 1.7, n: 18, life: 0.5, colors: [[1, 0.6, 0.9]], s: 0.07 });
      Cam.cut([-4.2, 1.8, -3.4], [0.4, 0.5, 0.5], 46);
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.7, 0, d[2] * 0.7], 180, 'outQuad', () => tw3(v.offset, [0, 0, 0], 460, 'outBack'));
      tw3(v.scl, [1.16, 0.8, 1.16], 160, 'outQuad', () => tw3(v.scl, [1, 1, 1], 420, 'outBack'));
      yield 520;
      yield drained(vs);
    } else {
      for (let i = 0; i < 10; i++)
        Fx.spawn({ p: orb.slice(), c: [1, 0.4, 0.8],
                   v: [(tgt[0] - orb[0]) / 0.3 + 1.5, 1.2, (tgt[2] - orb[2]) / 0.3], g: -4, life: 0.5, s: 0.07 });
      yield 500;
    }
    camDefault();
  }

  function* animCinder(s, res) {
    const u = sideActor(s), v = sideActor(other(s)), vs = sideState(other(s));
    camAtk(s);
    yield 220;
    Sfx.play('sizzle');
    const mouth = head(u, 0.85);
    const tgt = chest(v);
    for (let i = 0; i < 12; i++) {
      const ft = 0.42;
      const spread = [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5];
      Fx.spawn({ p: mouth.slice(),
                 c: [[1, 0.48, 0.16], [1, 0.72, 0.2], [0.9, 0.25, 0.1]][i % 3],
                 v: [(tgt[0] + spread[0] - mouth[0]) / ft, (tgt[1] - mouth[1]) / ft + 0.5 * 6 * ft / 2, (tgt[2] + spread[2] - mouth[2]) / ft],
                 g: -6, life: ft + 0.06, s: 0.085, s1: 0.05 });
      if (i % 2) Sfx.play('thud');
      if (i > 3 && !res.miss) {
        Fx.burst([tgt[0] + (Math.random() - 0.5) * 0.5, tgt[1], tgt[2] + (Math.random() - 0.5) * 0.5],
                 { n: 3, speed: 1.4, colors: [[1, 0.6, 0.2], [0.5, 0.45, 0.42]], life: 0.4, up: 1.2 });
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
      Fx.burst(tgt, { n: 18, speed: 2.6, colors: [[1, 0.48, 0.16], [1, 0.72, 0.2], [1, 1, 0.8]], life: 0.5 });
      camImpact(other(s));
      const d = s === 'P' ? DIR_PM : [-DIR_PM[0], 0, -DIR_PM[2]];
      tw3(v.offset, [d[0] * 0.4, 0, d[2] * 0.4], 150, 'outQuad', () => tw3(v.offset, [0, 0, 0], 380, 'outBack'));
      yield 380;
      yield drained(vs);
    } else yield 300;
    camDefault();
  }

  const MOVE_ANIMS = {
    TACKLE: animTackle, GROWL: animGrowl, MINDBEAM: animMindbeam,
    PSYBLAST: animPsyblast, CINDER: animCinder,
  };

  // ----------------------------------------------------------- turn logic
  let rngBattle = null;

  function* doMove(s, moveId) {
    const st = sideState(s), os = sideState(other(s));
    const move = BData.MOVES[moveId];
    if (s === 'P') pState.pp[cursorMoveIndex(moveId)] -= 1;
    else eState.pp[moveId] -= 1;
    const res = move.power
      ? BData.damage({ level: st.level, atk: st.stats.atk, atkStage: st.atkStage },
                     { def: os.stats.def, defStage: 0 }, move, rngBattle)
      : { dmg: 0, crit: false, miss: rngBattle() * 100 >= move.acc };
    yield* say(BData.fmt(BData.MSG.used, { A: st.name, M: move.name }), { auto: true, hold: 320 });
    yield* MOVE_ANIMS[moveId](s, res);
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

  function cursorMoveIndex(moveId) {
    return BData.SPECIES.PIXLIT.moves.indexOf(moveId);
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
    yield* say(BData.MSG.win3);
    yield 250;
    endBattle('win');
  }

  function* defeatSeq() {
    Sfx.play('defeat');
    yield* say(BData.MSG.lose1);
    yield* say(BData.MSG.lose2);
    endBattle('loss');
  }

  function* turnScript(moveIdx) {
    const playerMove = BData.SPECIES.PIXLIT.moves[moveIdx];
    const enemyMove = BData.aiPick({ atkStage: eState.atkStage, foeHpFrac: pState.hp / pState.stats.maxHp, pp: eState.pp }, rngBattle);
    const pFirst = pState.stats.spe === eState.stats.spe ? rngBattle() < 0.5 : pState.stats.spe > eState.stats.spe;
    const order = pFirst ? [['P', playerMove], ['E', enemyMove]] : [['E', enemyMove], ['P', playerMove]];
    for (const [s, mv] of order) {
      if (sideState(s).hp <= 0) continue;
      yield* doMove(s, mv);
      const victim = other(s);
      if (sideState(victim).hp <= 0) {
        yield* faintSeq(victim);
        if (victim === 'E') yield* victorySeq();
        else yield* defeatSeq();
        return;
      }
    }
    backToMenu();
  }

  function* introScript() {
    yield 650; // let the transition reveal finish before the first message
    yield* say(BData.MSG.intro1);
    enemy.visible = true;
    Fx.burst(chest(enemy), { n: 22, speed: 2.4, colors: [[1, 1, 1], [0.9, 0.95, 1], [1, 0.85, 0.5]], life: 0.5 });
    Sfx.play('spawn');
    yield* say(BData.MSG.intro2, { auto: true });
    yield 200;
    player.visible = true;
    Fx.burst(chest(player), { n: 22, speed: 2.4, colors: [[1, 1, 1], [1, 0.55, 0.8], [0.7, 0.9, 1]], life: 0.5 });
    Sfx.play('spawn');
    yield* say(BData.MSG.intro3, { auto: true });
    backToMenu();
  }

  function backToMenu() {
    state = 'MENU';
    mode = 'menu';
    Cam.idleDrift(true);
    camDefault(550);
  }

  function endBattle(result) {
    state = 'DONE';
    mode = 'none';
    Game.save.hp = result === 'win' ? pState.hp : pState.stats.maxHp;
    if (result === 'win') Game.save.beaten = true;
    Game.toOverworld(result);
  }

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

    const pStats = BData.statsFor('PIXLIT', 10);
    const eStats = BData.statsFor('MAGMULE', 15);
    pState = { name: 'PIXLIT', level: 10, stats: pStats, hp: M3.clamp(Game.save.hp, 1, pStats.maxHp),
               displayHp: 0, drainRate: 60, atkStage: 0, pp: [35, 30, 16, 20] };
    pState.displayHp = pState.hp;
    eState = { name: 'MAGMULE', level: 15, stats: eStats, hp: eStats.maxHp, displayHp: eStats.maxHp,
               drainRate: 60, atkStage: 0, pp: { TACKLE: 35, CINDER: 25, GROWL: 30 } };

    player = actor('pixlit', P_POS, YAW_P);
    enemy = actor('magmule', M_POS, YAW_M);
    rex = actor('rex_raised', REX_POS, YAW_M + 0.15);
    expFrac = 0.30; expTween = null;
    cursor = 0;

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

  function updateMenu() {
    let moved = false;
    if (Input.pressed('left') || Input.pressed('right')) { cursor ^= 1; moved = true; }
    if (Input.pressed('up') || Input.pressed('down')) { cursor ^= 2; moved = true; }
    if (moved) Sfx.play('cursor');
    if (Input.mouse.inside) {
      for (let i = 0; i < 4; i++) {
        const r = UI.MOVE_RECTS[i];
        if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
            Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
          if (cursor !== i && Input.mouse.clicked) cursor = i;
          if (Input.mouse.clicked) { confirmMove(i); return; }
          cursor = i;
        }
      }
    }
    if (Input.pressed('confirm')) { confirmMove(cursor); return; }
    if (Input.pressed('back')) {
      Sfx.play('buzz');
      state = 'TURN';
      run((function* () { yield* say(BData.MSG.noFlee); backToMenu(); })());
    }
  }

  function confirmMove(i) {
    cursor = i;
    if (pState.pp[i] <= 0) {
      Sfx.play('buzz');
      state = 'TURN';
      run((function* () { yield* say(BData.MSG.noPp); backToMenu(); })());
      return;
    }
    Sfx.play('confirm');
    state = 'TURN';
    mode = 'none';
    Cam.idleDrift(false);
    run(turnScript(i));
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

    for (const st of [pState, eState]) {
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
    else if (state === 'FLY') updateFly(rawDt);
  }

  function render3d(aspect) {
    const { view, proj } = Cam.matrices(aspect);
    Gfx.begin(view, proj, ENV);
    Gfx.draw(staticH, null, {});
    if (enemy.visible) Gfx.draw(enemy.h, actorMat(enemy), { flash: enemy.flashT > 0 ? M3.clamp(enemy.flashT / 0.25, 0, 1) : 0 });
    if (player.visible) Gfx.draw(player.h, actorMat(player), { flash: player.flashT > 0 ? M3.clamp(player.flashT / 0.25, 0, 1) : 0 });
    Gfx.draw(rex.h, actorMat(rex), {});
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
      UI.playerParty(ctx, ['full', 'full', 'full', 'full', 'empty', 'empty']);
      UI.emblem(ctx, 452, 426);
      const moves = BData.SPECIES.PIXLIT.moves.map((id, i) => ({
        name: BData.MOVES[id].name, type: BData.MOVES[id].type,
        pp: pState.pp[i], maxPp: BData.MOVES[id].pp,
      }));
      UI.moveGrid(ctx, moves, cursor, t);
    } else if (mode === 'msg') {
      UI.msgBox(ctx, tw, t, waitingConfirm);
    }
    if (state === 'FLY') {
      UI.hint(ctx, ['FLY MODE: WASD move, IJKL look, R/F up/down, Shift fast', 'P: print camera pose', poseText]);
    }
  }

  function exit() { Fx.clear(); Cam.idleDrift(false); }

  return { enter, update, render3d, renderUi, exit };
})();
