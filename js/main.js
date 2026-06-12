/* Grove Clash — js/main.js
   Game: boot, canvas letterboxing, fixed-timestep loop, scene switching
   with transitions, persistent save state, on-screen error overlay
   (the Replit webview hides the console) and debug hash modes:
   #battle (skip straight to battle), #fly (free camera), #viewer
   (model inspector). */
const Game = (() => {

  const GL_W = 480, GL_H = 270, UI_W = 960, UI_H = 540;
  const STEP = 1 / 60;

  let glCanvas = null, uiCanvas = null, ctx = null, stage = null;
  let scene = null;
  let acc = 0, last = 0;
  let errorLines = null;
  let viewRect = { left: 0, top: 0, w: 1, h: 1 };
  const handles = {};

  // hp: null means "full HP" (resolved against statsFor at battle start)
  const save = {
    party: [
      { species: 'PIXLIT', level: 10, hp: 17 }, // worn from the journey
      { species: 'THORNLET', level: 9, hp: null },
      { species: 'EMBERIK', level: 9, hp: null },
    ],
    beaten: false,
    battles: 0,
  };

  function handle(name) {
    if (!handles[name]) handles[name] = Gfx.upload(Models.get(name));
    return handles[name];
  }

  // ------------------------------------------------------------ scenes
  function switchNow(name, params) {
    if (scene && scene.exit) scene.exit();
    scene = name === 'battle' ? Battle : Overworld;
    scene.enter(params || {});
  }

  function toBattle() {
    save.battles++;
    Sfx.play('spawn');
    Fx.transition('battleIn', () => switchNow('battle'), null);
  }

  function toOverworld(result) {
    Fx.transition('fade', () => switchNow('overworld', { result }), null);
  }

  // ------------------------------------------------------------ layout
  function resize() {
    const intSnap = /[?#&]int=1/.test(location.href);
    let s = Math.min(window.innerWidth / UI_W, window.innerHeight / UI_H);
    if (intSnap && s >= 1) s = Math.floor(s);
    const w = Math.round(UI_W * s), h = Math.round(UI_H * s);
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    const r = stage.getBoundingClientRect();
    viewRect = { left: r.left, top: r.top, w, h };
  }

  function mapper(cx, cy) {
    const x = (cx - viewRect.left) / viewRect.w * UI_W;
    const y = (cy - viewRect.top) / viewRect.h * UI_H;
    if (x < 0 || y < 0 || x > UI_W || y > UI_H) return null;
    return { x, y };
  }

  // ------------------------------------------------------- error overlay
  function showError(msg) {
    errorLines = String(msg).split('\n').slice(0, 8);
  }

  function drawErrorOverlay() {
    if (!errorLines || !ctx) return;
    ctx.save();
    ctx.fillStyle = 'rgba(120,16,16,0.92)';
    ctx.fillRect(20, 20, 920, 40 + errorLines.length * 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('ERROR (see console for details):', 32, 44);
    for (let i = 0; i < errorLines.length; i++)
      ctx.fillText(errorLines[i].slice(0, 110), 32, 66 + i * 20);
    ctx.restore();
  }

  // ------------------------------------------------------------- viewer
  const Viewer = (() => {
    let names = [], idx = 0, vt = 0;
    const env = {
      sky: M3.hex('#1a2335'), fog: M3.hex('#1a2335'), fogNear: 30, fogFar: 60,
      lightDir: M3.normalize([], [-0.4, -0.75, 0.3]),
      lightCol: [0.85, 0.8, 0.7], ambient: [0.5, 0.5, 0.52],
    };
    const m = M3.mat();
    return {
      enter() { names = Models.list(); idx = 0; vt = 0; },
      update(dt) {
        vt += dt;
        if (Input.pressed('right')) { idx = (idx + 1) % names.length; Sfx.play('cursor'); }
        if (Input.pressed('left')) { idx = (idx + names.length - 1) % names.length; Sfx.play('cursor'); }
      },
      render3d(aspect) {
        const name = names[idx];
        const mod = Models.get(name);
        const r = Math.max(2.6, mod.height * 2.2);
        const eye = [Math.sin(vt * 0.7) * r, mod.height * 0.75, Math.cos(vt * 0.7) * r];
        const { view, proj } = (() => {
          const v = M3.mat(), p = M3.mat();
          M3.lookAt(v, eye, [0, mod.height * 0.45, 0], [0, 1, 0]);
          M3.persp(p, 40, aspect, 0.1, 100);
          return { view: v, proj: p };
        })();
        Gfx.begin(view, proj, env);
        Gfx.draw(handle(name), M3.ident(m), {});
      },
      renderUi(c) {
        UI.hint(c, ['MODEL VIEWER  (Left/Right to cycle)',
                    names[idx] + '  (' + Models.get(names[idx]).count + ' verts)']);
      },
      exit() {},
    };
  })();

  // ---------------------------------------------------------------- loop
  function update(dt) {
    Fx.update(dt);
    if (Input.pressed('mute')) Sfx.toggleMute();
    if (scene && scene.update) scene.update(dt);
    Input.postUpdate();
  }

  function render() {
    if (!scene) return;
    scene.render3d(GL_W / GL_H);
    ctx.clearRect(0, 0, UI_W, UI_H);
    scene.renderUi(ctx);
    const fa = Fx.flashAlpha();
    if (fa > 0) {
      ctx.globalAlpha = M3.clamp(fa, 0, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, UI_W, UI_H);
      ctx.globalAlpha = 1;
    }
    Fx.transitionDraw(ctx);
    if (Sfx.isMuted())
      PFont.draw(ctx, 'MUTED', 884, 8, { scale: 2, color: '#f8c838' });
    drawErrorOverlay();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    try {
      const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
      last = now;
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) { update(STEP); acc -= STEP; n++; }
      if (n === 5) acc = 0;
      render();
    } catch (e) {
      showError((e && e.stack) || e);
      try { render(); } catch (e2) { /* keep the loop alive */ }
      console.error(e);
    }
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    stage = document.getElementById('stage');
    glCanvas = document.getElementById('gl');
    uiCanvas = document.getElementById('ui');
    glCanvas.width = GL_W; glCanvas.height = GL_H;
    uiCanvas.width = UI_W; uiCanvas.height = UI_H;
    ctx = uiCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    window.onerror = (msg, src, line) => { showError(msg + '\n' + (src || '') + ':' + (line || '')); };
    window.addEventListener('unhandledrejection', (e) => showError('Promise: ' + e.reason));

    let glOk = false;
    try { glOk = Gfx.init(glCanvas); }
    catch (e) { showError('WebGL init failed:\n' + ((e && e.message) || e)); }
    if (!glOk) {
      if (!errorLines) showError('WebGL is not available in this browser.');
      drawErrorOverlay();
      return;
    }

    Input.init({ mapper, onFirstInteraction: () => Sfx.unlock() });
    window.addEventListener('resize', resize);
    resize();

    const hash = location.hash;
    if (hash.indexOf('viewer') >= 0) { scene = Viewer; scene.enter(); }
    else if (hash.indexOf('fly') >= 0) { scene = Battle; scene.enter({ fly: true }); }
    else if (hash.indexOf('battle') >= 0) { scene = Battle; scene.enter({}); }
    else { scene = Overworld; scene.enter({}); }

    requestAnimationFrame((now) => { last = now; requestAnimationFrame(loop); });
  }

  return { boot, save, handle, toBattle, toOverworld };
})();

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => Game.boot());
  else
    Game.boot();
}
