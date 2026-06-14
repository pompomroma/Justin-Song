/* Grove Clash — js/main.js
   Game: boot, adaptive-resolution canvas system, fixed-timestep loop,
   scene switching with transitions, persistent save, on-screen error
   overlay and debug hash modes.

   RESOLUTION & FRAMERATE
   The 3D world renders to a backing store that scales DOWN to protect a
   hard 60 FPS floor and UP toward an 8K ceiling whenever the GPU has
   headroom (adaptive supersampling). The 2D UI keeps a fixed 960x540
   virtual coordinate system (so ui.js never changes) but its backing
   store is rendered at display/high resolution via a context scale, so
   panels and text stay razor-crisp at any size. A live HUD (toggle: T)
   reports FPS and the actual render resolution.

   Hash modes: #battle #fly #viewer ; #8k forces the 8K ceiling (adaptive
   off) ; #retro restores the original 480x270 pixelated look. */
const Game = (() => {

  const UI_VW = 960, UI_VH = 540;   // virtual UI coordinate space (fixed)
  const AR = 16 / 9;
  const STEP = 1 / 60;              // fixed simulation step
  const CAP_W = 7680;              // 8K width ceiling
  const UI_CAP = 3840;            // UI backing capped at 4K wide (crisp enough; bounds memory)
  const MIN_GL_W = 480;          // never scale the 3D world below this

  let glCanvas = null, uiCanvas = null, ctx = null, stage = null;
  let scene = null;
  let acc = 0, last = 0;
  let errorLines = null;
  let viewRect = { left: 0, top: 0, w: 1, h: 1 };
  const handles = {};

  // resolution / perf state
  let dpr = 1, cssW = UI_VW, cssH = UI_VH, uiScale = 1;
  let ceilingW = CAP_W, minScale = 1, glScale = 1, glW = UI_VW, glH = UI_VH;
  let adaptiveOn = true, started = false, retro = false;
  let emaMs = 16.7, adaptCount = 0;
  let showStats = true;

  // hp: null means "full HP" (resolved against statsFor at battle start)
  const save = {
    party: [
      { species: 'PIXLIT', level: 10, hp: 17 }, // worn from the journey
      { species: 'THORNLET', level: 9, hp: null },
      { species: 'EMBERIK', level: 9, hp: null },
    ],
    npcs: {},            // npcId -> true once that trainer is beaten
    bossBeaten: false,
    bossCaptured: false,
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

  function toBattle(opts) {
    opts = opts || {};
    save.battles++;
    const dungeon = opts.arena === 'dungeon';
    Sfx.play(dungeon ? 'rift' : 'spawn');
    Fx.transition(dungeon ? 'portalIn' : 'battleIn', () => switchNow('battle', opts), null);
  }

  function toDungeon() {
    toBattle({ arena: 'dungeon', enemy: { species: 'VORNETH', level: 16, isBoss: true, trainer: 'VORNETH' } });
  }

  function toOverworld(result, ctx) {
    Fx.transition('fade', () => switchNow('overworld', Object.assign({ result }, ctx || {})), null);
  }

  // called by Battle.endBattle: record progress, then return to the overworld
  function onBattleEnd(result, enemy) {
    if (result === 'win' || result === 'capture') {
      if (enemy && enemy.isBoss) { save.bossBeaten = true; if (result === 'capture') save.bossCaptured = true; }
      else if (enemy && enemy.npcId) save.npcs[enemy.npcId] = true;
    }
    toOverworld(result, { fromDungeon: !!(enemy && enemy.isBoss) });
  }

  // ----------------------------------------------------- resolution
  // Size the 3D backing store from the current adaptive scale (snapped to
  // 32px steps to avoid reallocating the backbuffer on every nudge).
  function applyRes() {
    let w = Math.round(ceilingW * glScale / 32) * 32;
    w = M3.clamp(w, MIN_GL_W, ceilingW);
    const h = Math.round(w / AR);
    if (glCanvas.width !== w || glCanvas.height !== h) {
      glCanvas.width = w;
      glCanvas.height = h;
    }
    glW = glCanvas.width; glH = glCanvas.height;
  }

  function resize() {
    const fit = Math.min(window.innerWidth / UI_VW, window.innerHeight / UI_VH);
    cssW = Math.max(1, Math.round(UI_VW * fit));
    cssH = Math.max(1, Math.round(UI_VH * fit));
    stage.style.width = cssW + 'px';
    stage.style.height = cssH + 'px';
    const r = stage.getBoundingClientRect();
    viewRect = { left: r.left, top: r.top, w: cssW, h: cssH };

    // UI backing store: crisp at display resolution, capped at 4K wide.
    const uiW = retro ? UI_VW : M3.clamp(Math.round(cssW * dpr), UI_VW, UI_CAP);
    uiScale = uiW / UI_VW;
    const uiWpx = Math.round(UI_VW * uiScale), uiHpx = Math.round(UI_VH * uiScale);
    if (uiCanvas.width !== uiWpx || uiCanvas.height !== uiHpx) {
      uiCanvas.width = uiWpx; uiCanvas.height = uiHpx;
      ctx.imageSmoothingEnabled = false; // canvas resize resets context state
    }

    // First sizing: start the 3D world at display-native scale, then let
    // the adaptive controller climb toward 8K if there's headroom.
    if (!started) {
      glScale = adaptiveOn ? M3.clamp((cssW * dpr) / ceilingW, minScale, 1) : 1;
      started = true;
    }
    applyRes();
  }

  // Hold 60 FPS: shed resolution when frames run long, reclaim it (toward
  // the 8K ceiling) when there's spare budget. Hysteresis avoids churn.
  function adaptTick() {
    if (!adaptiveOn) return;
    if (++adaptCount < 30) return;
    adaptCount = 0;
    if (emaMs > 17.5 && glScale > minScale) {
      glScale = Math.max(minScale, glScale * 0.82); applyRes();
    } else if (emaMs < 14.0 && glScale < 1) {
      glScale = Math.min(1, glScale * 1.10); applyRes();
    }
  }

  function mapper(cx, cy) {
    const x = (cx - viewRect.left) / viewRect.w * UI_VW;
    const y = (cy - viewRect.top) / viewRect.h * UI_VH;
    if (x < 0 || y < 0 || x > UI_VW || y > UI_VH) return null;
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

  function drawHud() {
    if (!showStats) return;
    const fps = Math.min(999, Math.round(1000 / Math.max(0.001, emaMs)));
    const atCeil = glW >= ceilingW - 32;
    const tag = (atCeil && ceilingW >= 7000) ? ' 8K' : (atCeil && ceilingW >= 3500 ? ' 4K' : '');
    const txt = fps + ' FPS  ' + glW + 'x' + glH + tag;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(4, 46, PFont.width(txt, 1) + 12, 16);
    PFont.draw(ctx, txt, 10, 48, { scale: 1, color: fps >= 58 ? '#7cfc6a' : '#f8c838', outline: '#101018' });
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
    Input.setTouchLayout(scene === Battle ? 'battle' : 'overworld');
    if (Input.pressed('mute')) Sfx.toggleMute();
    if (Input.pressed('stats')) showStats = !showStats;
    if (scene && scene.update) scene.update(dt);
    Input.postUpdate();
  }

  function render() {
    if (!scene) return;
    scene.render3d(glW / glH);
    // all UI draws happen in the fixed 960x540 space; the transform scales
    // them up to the high-resolution backing store.
    ctx.setTransform(uiScale, 0, 0, uiScale, 0, 0);
    ctx.clearRect(0, 0, UI_VW, UI_VH);
    scene.renderUi(ctx);
    const fa = Fx.flashAlpha();
    if (fa > 0) {
      const fc = Fx.flashColor();
      ctx.globalAlpha = M3.clamp(fa, 0, 1);
      ctx.fillStyle = 'rgb(' + (fc[0] * 255 | 0) + ',' + (fc[1] * 255 | 0) + ',' + (fc[2] * 255 | 0) + ')';
      ctx.fillRect(0, 0, UI_VW, UI_VH);
      ctx.globalAlpha = 1;
    }
    Fx.transitionDraw(ctx);
    if (Sfx.isMuted())
      PFont.draw(ctx, 'MUTED', 884, 8, { scale: 2, color: '#f8c838' });
    drawHud();
    Input.drawTouch(ctx);
    drawErrorOverlay();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const real = (now - last) / 1000 || 0.016;
    last = now;
    emaMs = emaMs * 0.9 + (real * 1000) * 0.1;
    try {
      acc += Math.min(0.1, real);
      let n = 0;
      while (acc >= STEP && n < 5) { update(STEP); acc -= STEP; n++; }
      if (n === 5) acc = 0;
      render();
    } catch (e) {
      showError((e && e.stack) || e);
      try { render(); } catch (e2) { /* keep the loop alive */ }
      console.error(e);
    }
    adaptTick();
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    stage = document.getElementById('stage');
    glCanvas = document.getElementById('gl');
    uiCanvas = document.getElementById('ui');
    ctx = uiCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    window.onerror = (msg, src, line) => { showError(msg + '\n' + (src || '') + ':' + (line || '')); };
    window.addEventListener('unhandledrejection', (e) => showError('Promise: ' + e.reason));

    let glOk = false;
    try { glOk = Gfx.init(glCanvas); }
    catch (e) { showError('WebGL init failed:\n' + ((e && e.message) || e)); }
    if (!glOk) {
      uiCanvas.width = UI_VW; uiCanvas.height = UI_VH;
      if (!errorLines) showError('WebGL is not available in this browser.');
      drawErrorOverlay();
      return;
    }

    const href = location.href;
    dpr = window.devicePixelRatio || 1;
    retro = /[#&?]retro/.test(href);
    const force8k = /[#&?]8k/.test(href);
    const gpuMax = Gfx.maxDim();
    ceilingW = retro ? MIN_GL_W : Math.min(CAP_W, gpuMax);
    minScale = MIN_GL_W / ceilingW;
    adaptiveOn = !retro && !force8k;
    glScale = 1; // resize() sets the real starting scale
    const ir = retro ? 'pixelated' : 'auto';
    glCanvas.style.imageRendering = ir;
    uiCanvas.style.imageRendering = ir;

    Input.init({ mapper, onFirstInteraction: () => Sfx.unlock() });
    window.addEventListener('resize', resize);
    resize();

    const hash = location.hash;
    if (hash.indexOf('viewer') >= 0) { scene = Viewer; scene.enter(); }
    else if (hash.indexOf('fly') >= 0) { scene = Battle; scene.enter({ fly: true }); }
    else if (hash.indexOf('dungeon') >= 0) { scene = Battle; scene.enter({ arena: 'dungeon', enemy: { species: 'VORNETH', level: 16, isBoss: true, trainer: 'VORNETH' } }); }
    else if (hash.indexOf('battle') >= 0) { scene = Battle; scene.enter({}); }
    else { scene = Overworld; scene.enter({}); }

    requestAnimationFrame((now) => { last = now; requestAnimationFrame(loop); });
  }

  return { boot, save, handle, toBattle, toDungeon, toOverworld, onBattleEnd };
})();

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => Game.boot());
  else
    Game.boot();
}
