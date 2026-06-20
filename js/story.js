/* Grove Clash — js/story.js
   Story: the first-person "wake up" cutscene (phase 'wake') and the faint
   hand-off (phase 'faint'). Driven by a small generator-coroutine runner
   (same pattern as battle.js). 'wake': black + blur + eyelid blinks reveal
   the protector's back, the camera tilts UP to the colossal giant firing an
   intense beam, tilts back DOWN, the player resolves to help, then a camera
   swing flings us into the tutorial battle. 'faint': the player's avatar
   wobbles and collapses, fading to black into the overworld. Player lines
   are voiced AND shown as text. */
const Story = (() => {
  const S = BData.STORY;
  let phase = 'wake', t = 0, staticH = null;
  let pro = null, gia = null, hero = null, giaH = 0, heroYaw = Math.PI;
  let heroVisible = false, heroScl = [1, 1, 1], heroRot = 0;
  let lid = 1, lidT = 1, lidRate = 8;        // eyelid (0 open .. 1 closed)
  let blur = 0, blurT = 0, blurRate = 2;     // CSS blur px on the GL canvas
  let tw = null, showLine = false;

  const PRO = [0, 0, 0], GIA = [0.6, 0, 7.6];

  // ----- script runner (yield ms | yield predicate | yield* sub) -----
  let script = null, waitO = null;
  const run = (g) => { script = g; waitO = null; };
  function step(dt) {
    if (!script) return;
    if (waitO) {
      if (waitO.ms !== undefined) { waitO.ms -= dt * 1000; if (waitO.ms > 0) return; }
      else if (waitO.cond && !waitO.cond()) return;
      waitO = null;
    }
    while (script) {
      const r = script.next();
      if (r.done) { script = null; break; }
      const y = r.value;
      if (typeof y === 'number') { if (y > 0) { waitO = { ms: y }; break; } }
      else if (typeof y === 'function') { if (!y()) { waitO = { cond: y }; break; } }
    }
  }

  const consume = () => Input.pressed('confirm') || Input.pressed('back') || Input.mouse.clicked;
  function* say(text) {
    showLine = true; tw.set(text, 760, { voiced: true });
    let hold = 0;
    yield () => {
      if (!tw.done()) { if (consume()) tw.skip(); return false; }
      hold += 1 / 60;
      return consume() || hold > 2.4;   // advance on input, or auto after a beat
    };
    showLine = false;
  }

  function build() {
    if (staticH) return;
    const parts = [];
    const push = (n, p, y, s) => parts.push({ m: Models.get(n), pos: p, yaw: y, s });
    const ground = Models.groundMesh({ radius: 14, dark: true, patches: [
      { x: GIA[0], z: GIA[2], rx: 3.2, rz: 3.2, rot: 0 },
    ] });
    const r = M3.rng(515);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + r() * 0.3, rad = 10 + r() * 3;
      push('spire', [Math.cos(a) * rad, 0, Math.sin(a) * rad], r() * 6.3, 0.7 + r() * 1.0);
    }
    let total = ground.count;
    for (const p of parts) total += p.m.count;
    const data = new Float32Array(total * 9);
    data.set(ground.data, 0);
    let off = ground.count * 9;
    for (const p of parts) off = M3.bakeMesh(data, off, p.m.data, p.m.count, p.pos, p.yaw, p.s);
    staticH = Gfx.upload({ data, count: total });
  }

  // ----- camera beats -----
  const camTiltUp = () => Cam.play([{ t: 950, pos: [0, 1.05, -2.1], look: [GIA[0], 3.7, GIA[2]], fov: 56, ease: 'inOutCubic' }]);
  const camTiltDown = () => Cam.play([{ t: 700, pos: [0, 0.95, -2.3], look: [0, 0.7, 1.7], fov: 46, ease: 'inOutCubic' }]);
  const camStand = () => Cam.play([{ t: 620, pos: [0, 1.75, -2.7], look: [0, 1.25, 1.7], fov: 48, ease: 'outCubic' }]);
  const camSwing = () => Cam.play([{ t: 520, pos: [3.6, 1.5, -1.0], look: [0, 1.0, 2.2], fov: 62, ease: 'inOutCubic' }]);

  function fireGiantBeam() {
    const maw = [GIA[0], GIA[1] + giaH * 0.52, GIA[2]];
    const tgt = [PRO[0], 1.0, PRO[2] + 1.2];
    Sfx.play('giantbeam'); Sfx.play('boom'); Sfx.play('roar');
    Fx.beam(maw, tgt, 1100, { rate: 9, colors: [[1, 0.9, 0.4], [1, 1, 1], [0.7, 0.5, 1]], jitter: 0.2, s: 0.14 });
    Fx.bolt(maw, tgt, { segs: 12, jitter: 0.9, colors: [[1, 1, 1], [1, 0.9, 0.4]], life: 0.2, forks: 3, forkLen: 1.0 });
    Fx.flash(160, 0.85, [1, 0.9, 0.6]);
    Fx.pulseLight(maw, [1, 0.85, 0.4], 4.5, 500, 12);
    Fx.slowmo(500, 0.4);
    Fx.addTrauma(0.9);
    Cam.kickFov(8, 420);
  }

  // ----- phase scripts -----
  function* wakeScript() {
    Game.setLetterbox(1, 8, true);
    lid = 1; lidT = 1; blur = 9; blurT = 9; blurRate = 8;
    Sfx.startMusic('tutorial');
    Cam.cut([0, 0.9, -2.4], [0, 0.8, 1.6], 46);
    yield 500;
    yield* say(S.wakeWhere);
    yield 250;
    // eyelid blinks reveal the protector's back
    for (let i = 0; i < 3; i++) { lidT = 0.1; lidRate = 9; yield 280; lidT = 0.82; lidRate = 16; yield 150; }
    lidT = 0; lidRate = 6;
    blurT = 0; blurRate = 1.4;   // vision clears as he wakes (~2s)
    yield 760;
    camTiltUp();
    yield 520;
    fireGiantBeam();
    yield 1250;
    camTiltDown();
    yield 720;
    yield* say(S.wakeHelp);
    yield 220;
    camStand();
    yield 620;
    Sfx.play('whoosh');
    camSwing();
    Fx.flash(240, 0.95, [1, 1, 1]);
    Fx.addTrauma(0.5);
    yield 520;
    Game.toTutorialBattle();
  }

  function* faintScript() {
    Game.setLetterbox(1, 6, true);
    Sfx.stopMusic();
    Game.setBlur(0);
    heroVisible = true; heroScl = [1, 1, 1]; heroRot = 0; heroYaw = Math.PI;
    Cam.cut([0, 1.2, -3.0], [0, 1.0, 0], 42);
    yield 450;
    Sfx.play('faint');
    Fx.slowmo(800, 0.5);
    for (let i = 0; i < 3; i++) { heroRot = 0.2; yield 120; heroRot = -0.2; yield 120; }
    heroRot = 0;
    Fx.flash(90, 0.85);
    Fx.addTrauma(0.3);
    const m = M3.trs(M3.mat(), [0, 0, 0], [heroYaw, 0, 0], [1, 1, 1]);
    Fx.dissolve(Models.get('hero').centers, m, { life: 1.1 });
    heroVisible = false;
    Fx.ring([0, 0.05, 0], { r0: 0.7, r1: 0.1, n: 14, life: 0.5, colors: [[0.8, 0.8, 0.9], [1, 1, 1]], s: 0.05 });
    yield 350;
    Fx.transition('fade', () => Game.afterFaint(), null);
    yield 1300;
  }

  function enter(params) {
    params = params || {};
    phase = params.phase || 'wake';
    build();
    Fx.clear();
    t = 0; tw = UI.typewriter(); showLine = false;
    giaH = Models.get('giant').height;
    pro = { h: Game.handle('protector'), height: Models.get('protector').height };
    gia = { h: Game.handle('giant'), height: giaH };
    hero = { h: Game.handle('hero') };
    Game.setBlur(phase === 'wake' ? 9 : 0);
    run(phase === 'wake' ? wakeScript() : faintScript());
  }

  function update(rawDt) {
    const dt = rawDt * Fx.timeScale();
    t += dt;
    lid += (lidT - lid) * M3.clamp(dt * lidRate, 0, 1);
    blur += (blurT - blur) * M3.clamp(dt * blurRate, 0, 1);
    Game.setBlur(blur);
    Cam.update(dt);
    step(rawDt);          // script timing runs on raw dt (independent of slow-mo)
    if (tw) tw.update(dt);
  }

  const mTmp = M3.mat();
  function render3d(aspect) {
    const env = { sky: M3.hex('#070710'), fog: M3.hex('#0e0a1c'), fogNear: 8, fogFar: 30,
                  lightDir: M3.normalize([], [-0.3, -0.7, -0.2]), lightCol: [0.7, 0.7, 0.95],
                  ambient: [0.4, 0.42, 0.56], point: Fx.lightState() };
    const { view, proj } = Cam.matrices(aspect);
    Gfx.begin(view, proj, env);
    Gfx.draw(staticH, null, {});
    if (phase === 'wake') {
      Gfx.draw(gia.h, M3.trs(mTmp, GIA, [Math.PI, 0, 0], [1, 1 + 0.04 * Math.sin(t * 1.1), 1]), {});
      Gfx.draw(pro.h, M3.trs(mTmp, PRO, [0, 0, 0], [1, 1 + 0.02 * Math.sin(t * 2.2), 1]), {});
    } else if (heroVisible) {
      Gfx.draw(hero.h, M3.trs(mTmp, [0, 0, 0], [heroYaw, 0, heroRot], heroScl), {});
    }
    const pd = Fx.particleData();
    Gfx.drawDynamic(pd.data, pd.count);
  }

  function renderUi(ctx) {
    // eyelid (first-person blink) — black bars closing from top & bottom
    if (lid > 0.001) {
      const h = Math.round(lid * 300);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 960, h);
      ctx.fillRect(0, 540 - h, 960, h);
    }
    if (showLine && tw) UI.cutsceneText(ctx, tw, t, tw.done());
  }

  function exit() { Fx.clear(); Game.setBlur(0); }

  return { enter, update, render3d, renderUi, exit };
})();
