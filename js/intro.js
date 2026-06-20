/* Grove Clash — js/intro.js
   Intro: the launch title cinematic — an original retro-RPG-style opening (NOT
   a copy of any existing game's art/music). A dynamic 3D voxel "clash" tableau
   (the protector AEGIS vs the colossal GIANT) with crossing beams, lightning,
   sparks, big flashes and slow-mo under an intense moving camera, a "GROVE
   CLASH" title pop and original title BGM. Three variants picked at random per
   boot. Press any key / tap to go on; X skips. */
const Intro = (() => {
  let t = 0, V = null, staticH = null, beamT = 0, advanced = false, titleT = 0;
  let pro = null, gia = null;

  const PRO = [-2.2, 0, 0.4], GIA = [2.7, 0, 1.4];

  const VARIANTS = [
    { env: { sky: M3.hex('#0a0e1e'), fog: M3.hex('#10162e'), fogNear: 9, fogFar: 34,
             lightDir: M3.normalize([], [-0.3, -0.7, 0.2]), lightCol: [0.8, 0.8, 1.0], ambient: [0.4, 0.42, 0.55] },
      glow: [0.45, 0.72, 1], title: '#bfe6ff', shots: 'orbit' },
    { env: { sky: M3.hex('#1a0a14'), fog: M3.hex('#2a1020'), fogNear: 9, fogFar: 34,
             lightDir: M3.normalize([], [0.3, -0.7, 0.2]), lightCol: [1.0, 0.72, 0.6], ambient: [0.5, 0.4, 0.42] },
      glow: [1, 0.5, 0.4], title: '#ffd2b0', shots: 'push' },
    { env: { sky: M3.hex('#0a160f'), fog: M3.hex('#0f261a'), fogNear: 9, fogFar: 34,
             lightDir: M3.normalize([], [-0.2, -0.75, -0.2]), lightCol: [0.7, 1.0, 0.82], ambient: [0.4, 0.5, 0.44] },
      glow: [0.5, 1, 0.72], title: '#c6ffd8', shots: 'whip' },
  ];

  function build() {
    if (staticH) return;
    const parts = [];
    const push = (n, p, y, s) => parts.push({ m: Models.get(n), pos: p, yaw: y, s });
    const ground = Models.groundMesh({ radius: 14, dark: true, patches: [
      { x: PRO[0], z: PRO[2], rx: 1.3, rz: 1.0, rot: 0 },
      { x: GIA[0], z: GIA[2], rx: 3.0, rz: 3.0, rot: 0 },
    ] });
    const r = M3.rng(4242);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.3, rad = 10 + r() * 3;
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

  const faceYaw = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);

  function camFor(shots) {
    const look = [0.2, 1.4, 0.9];
    if (shots === 'push') {
      Cam.cut([-5.5, 1.0, -4.0], look, 52);
      Cam.play([{ t: 9000, pos: [-1.4, 2.0, -2.2], look, fov: 40, ease: 'inOutCubic' }]);
    } else if (shots === 'whip') {
      Cam.cut([5.2, 0.7, -3.0], [GIA[0], 2.2, GIA[2]], 50);
      Cam.play([
        { t: 1400, pos: [-4.6, 1.1, -2.4], look: [PRO[0], 1.0, PRO[2]], fov: 44, ease: 'inOutCubic' },
        { t: 4200, pos: [0.2, 2.6, -5.2], look, fov: 46, ease: 'inOutCubic' },
        { t: 9000, pos: [-3.6, 1.4, -3.4], look, fov: 42, ease: 'inOutCubic' },
      ]);
    } else { // orbit
      const keys = [];
      for (let i = 1; i <= 4; i++) {
        const a = Math.PI * 0.85 + i * 0.42;
        keys.push({ t: i * 2200, pos: [Math.sin(a) * 6.2, 1.3 + i * 0.18, Math.cos(a) * 6.2], look, fov: 46, ease: 'linear' });
      }
      Cam.cut([Math.sin(Math.PI * 0.85) * 6.2, 1.3, Math.cos(Math.PI * 0.85) * 6.2], look, 46);
      Cam.play(keys);
    }
  }

  function enter() {
    build();
    Fx.clear();
    t = 0; beamT = 0.7; titleT = 0; advanced = false;
    V = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
    pro = { h: Game.handle('protector'), pos: PRO, yaw: faceYaw(PRO, GIA), height: Models.get('protector').height };
    gia = { h: Game.handle('giant'), pos: GIA, yaw: faceYaw(GIA, PRO), height: Models.get('giant').height };
    camFor(V.shots);
    Game.setBlur(0);
    Game.setLetterbox(1, 6, true);   // cinematic bars
    Sfx.startMusic('title');
  }

  function go() { if (advanced) return; advanced = true; Game.toTitle(); }

  function update(rawDt) {
    const dt = rawDt * Fx.timeScale();
    t += dt;
    Cam.update(dt);
    if (t > 1.0) titleT = Math.min(1, titleT + dt * 0.8);

    // periodic crossing beams + lightning between the two combatants
    beamT -= dt;
    if (beamT <= 0) {
      beamT = 1.0 + Math.random() * 0.5;
      const gMaw = [gia.pos[0], gia.pos[1] + gia.height * 0.52, gia.pos[2]];
      const pCh = [pro.pos[0], pro.pos[1] + pro.height * 0.55, pro.pos[2]];
      Sfx.play('giantbeam'); Sfx.play('beam');
      Fx.beam(gMaw, pCh, 600, { rate: 8, colors: [V.glow, [1, 1, 1], [1, 0.85, 0.4]], jitter: 0.18, s: 0.12 });
      Fx.beam(pCh, gMaw, 600, { rate: 7, colors: [[0.6, 0.4, 1], [1, 1, 1]], jitter: 0.12, s: 0.08 });
      const mid = [(gMaw[0] + pCh[0]) / 2, (gMaw[1] + pCh[1]) / 2 + 0.2, (gMaw[2] + pCh[2]) / 2];
      Fx.bolt(gMaw, pCh, { segs: 10, jitter: 0.7, colors: [[1, 1, 1], V.glow], life: 0.18, forks: 2, forkLen: 0.8 });
      Fx.flash(70, 0.5, V.glow);
      Fx.pulseLight(mid, V.glow, 3.4, 320, 9);
      Fx.slowmo(220, 0.5);
      Fx.addTrauma(0.45);
      Fx.burst(mid, { n: 26, speed: 3.4, colors: [V.glow, [1, 1, 1]], life: 0.55, g: -2 });
      Cam.kickFov(-4, 360);
    }
    // drifting embers
    if (Math.random() < 0.5)
      Fx.spawn({ p: [(Math.random() - 0.5) * 14, 6, (Math.random() - 0.5) * 10 + 2], c: V.glow,
                 v: [0, -1.3 - Math.random(), 0], drag: 0.1, life: 2.2, s: 0.03, s1: 0.01 });

    if (!advanced && t > 0.6 && (Input.pressed('confirm') || Input.pressed('back') || Input.mouse.clicked)) go();
    if (t > 11.5) go();   // auto-advance if left alone
  }

  const mTmp = M3.mat();
  function render3d(aspect) {
    V.env.point = Fx.lightState();
    const { view, proj } = Cam.matrices(aspect);
    Gfx.begin(view, proj, V.env);
    Gfx.draw(staticH, null, {});
    const gb = 0.04 * Math.sin(t * 1.1);
    Gfx.draw(gia.h, M3.trs(mTmp, [gia.pos[0], gia.pos[1], gia.pos[2]], [gia.yaw, 0, 0], [1, 1 + gb, 1]), {});
    const pb = 0.02 * Math.sin(t * 2.4);
    Gfx.draw(pro.h, M3.trs(mTmp, [pro.pos[0], pro.pos[1], pro.pos[2]], [pro.yaw, 0, 0], [1, 1 + pb, 1]), {});
    const pd = Fx.particleData();
    Gfx.drawDynamic(pd.data, pd.count);
  }

  function renderUi(ctx) {
    if (titleT > 0) {
      const a = M3.clamp(titleT, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      const sc = 8 + (1 - a) * 3;
      PFont.drawC(ctx, BData.STORY.title, 480, 150, { scale: sc, color: V.title, outline: '#0a0a14' });
      PFont.drawC(ctx, BData.STORY.subtitle, 480, 232, { scale: 2, color: '#e8e8f0', outline: '#0a0a14' });
      ctx.restore();
    }
    if (t > 1.6 && Math.sin(t * 4) > -0.2)
      PFont.drawC(ctx, BData.STORY.pressStart, 480, 420, { scale: 3, color: '#ffffff', outline: '#0a0a14' });
    PFont.draw(ctx, BData.STORY.skipHint, 24, 500, { scale: 2, color: '#aeb4c4', outline: '#0a0a14' });
  }

  function exit() { Fx.clear(); }

  return { enter, update, render3d, renderUi, exit };
})();
