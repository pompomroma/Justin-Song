/* Grove Clash — js/input.js
   Input: keyboard state with per-tick pressed edges, mouse support, and
   on-screen TOUCH controls. Touch feeds the same held/pressed/mouse state
   the rest of the game already reads, so nothing downstream changes.

   Mobile controls are modality-gated: they appear only when the player is
   NOT using the keyboard — revealed on the first touch, hidden the moment a
   key is pressed. Overworld shows an 8-way D-pad (left) + A/B buttons
   (right); battle menus are tap-to-select (taps route into the mouse state)
   with A=confirm/advance and B=back also available.
   No top-level side effects; main.js calls Input.init(). */
const Input = (() => {

  const ACTIONS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    KeyE: 'confirm', Space: 'confirm', Enter: 'confirm',
    KeyX: 'back', Escape: 'back', Backspace: 'back',
    KeyM: 'mute',
    KeyC: 'party',
    KeyT: 'stats',
    KeyP: 'pose',
    ShiftLeft: 'fast', ShiftRight: 'fast',
    KeyI: 'lookUp', KeyK: 'lookDown', KeyJ: 'lookLeft', KeyL: 'lookRight',
    KeyR: 'rise', KeyF: 'fall',
  };
  const PREVENT = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'];

  const held = {};       // action -> bool
  const pressedNow = {}; // action -> bool (edge, cleared each tick)
  const mouse = { x: -1, y: -1, inside: false, clicked: false };
  let mapper = null;     // fn(clientX, clientY) -> {x,y} in UI space or null
  let firstCb = null, firstDone = false;

  // ---- touch / on-screen controls (virtual 960x540 coords) ----
  const DPAD = [140, 408], DPAD_R = 96, DEAD = 18;
  const ABTN = [884, 300], A_R = 46;
  const BBTN = [884, 398], B_R = 40;
  let touchActive = false;            // true once a touch occurs, false on keydown
  let touchLayout = 'overworld';      // 'overworld' (D-pad+A/B) | 'battle' (A/B, tap)
  const activeTouches = {};           // identifier -> { role }
  const dpadDir = { up: false, down: false, left: false, right: false };

  function fireFirst() {
    if (!firstDone) { firstDone = true; if (firstCb) firstCb(); }
  }

  const dist2 = (p, c) => Math.hypot(p.x - c[0], p.y - c[1]);

  function applyDpad(p) {
    const dx = p.x - DPAD[0], dy = p.y - DPAD[1];
    const nd = { up: dy < -DEAD, down: dy > DEAD, left: dx < -DEAD, right: dx > DEAD };
    for (const d of ['up', 'down', 'left', 'right']) {
      if (nd[d] && !dpadDir[d]) pressedNow[d] = true; // edge for menu/viewer nav
      dpadDir[d] = nd[d];
      held[d] = nd[d];
    }
  }
  function clearDpad() {
    for (const d of ['up', 'down', 'left', 'right']) { dpadDir[d] = false; held[d] = false; }
  }
  function setMouse(p, clicked) {
    mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
    if (clicked) mouse.clicked = true;
  }

  function onTouchStart(e) {
    if (e.preventDefault) e.preventDefault();
    touchActive = true;
    fireFirst();
    const list = e.changedTouches || [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const p = mapper ? mapper(t.clientX, t.clientY) : null;
      if (!p) { activeTouches[t.identifier] = { role: 'none' }; continue; }
      let role = 'tap';
      if (touchLayout === 'overworld' && dist2(p, DPAD) <= DPAD_R) { role = 'dpad'; applyDpad(p); }
      else if (dist2(p, ABTN) <= A_R) { role = 'A'; held.confirm = true; pressedNow.confirm = true; }
      else if (dist2(p, BBTN) <= B_R) { role = 'B'; held.back = true; pressedNow.back = true; }
      else { setMouse(p, true); }
      activeTouches[t.identifier] = { role };
    }
  }
  function onTouchMove(e) {
    if (e.preventDefault) e.preventDefault();
    const list = e.changedTouches || [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const r = activeTouches[t.identifier];
      if (!r) continue;
      const p = mapper ? mapper(t.clientX, t.clientY) : null;
      if (!p) continue;
      if (r.role === 'dpad') applyDpad(p);
      else if (r.role === 'tap') setMouse(p, false);
    }
  }
  function onTouchEnd(e) {
    if (e.preventDefault) e.preventDefault();
    const list = e.changedTouches || [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const r = activeTouches[t.identifier];
      if (!r) continue;
      if (r.role === 'dpad') clearDpad();
      else if (r.role === 'A') held.confirm = false;
      else if (r.role === 'B') held.back = false;
      delete activeTouches[t.identifier];
    }
  }

  function init(opts) {
    mapper = (opts && opts.mapper) || null;
    firstCb = (opts && opts.onFirstInteraction) || null;

    window.addEventListener('keydown', (e) => {
      if (PREVENT.indexOf(e.code) >= 0) e.preventDefault();
      touchActive = false; // keyboard in use -> hide the mobile overlay
      fireFirst();
      const a = ACTIONS[e.code];
      if (!a) return;
      if (!held[a] && !e.repeat) pressedNow[a] = true;
      held[a] = true;
    });
    window.addEventListener('keyup', (e) => {
      const a = ACTIONS[e.code];
      if (a) held[a] = false;
    });
    window.addEventListener('blur', () => {
      for (const k in held) held[k] = false;
      clearDpad();
    });
    window.addEventListener('mousemove', (e) => {
      const p = mapper ? mapper(e.clientX, e.clientY) : null;
      if (p) { mouse.x = p.x; mouse.y = p.y; mouse.inside = true; }
      else { mouse.inside = false; }
    });
    window.addEventListener('mousedown', (e) => {
      fireFirst();
      const p = mapper ? mapper(e.clientX, e.clientY) : null;
      if (p) { mouse.x = p.x; mouse.y = p.y; mouse.inside = true; mouse.clicked = true; }
    });
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }

  // ---- on-screen overlay (only when not using the keyboard) ----
  function circle(ctx, cx, cy, r, fill, stroke) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke();
  }
  function arrow(ctx, cx, cy, dir, on) {
    const s = 13;
    ctx.beginPath();
    if (dir === 'up') { ctx.moveTo(cx, cy - s); ctx.lineTo(cx - s, cy + s * 0.6); ctx.lineTo(cx + s, cy + s * 0.6); }
    else if (dir === 'down') { ctx.moveTo(cx, cy + s); ctx.lineTo(cx - s, cy - s * 0.6); ctx.lineTo(cx + s, cy - s * 0.6); }
    else if (dir === 'left') { ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s * 0.6, cy - s); ctx.lineTo(cx + s * 0.6, cy + s); }
    else { ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s * 0.6, cy - s); ctx.lineTo(cx - s * 0.6, cy + s); }
    ctx.closePath();
    ctx.fillStyle = on ? 'rgba(255,255,255,0.95)' : 'rgba(232,238,248,0.5)';
    ctx.fill();
  }
  function btn(ctx, c, r, label, on, hue) {
    circle(ctx, c[0], c[1], r, on ? hue.on : hue.off, 'rgba(245,248,255,0.7)');
    PFont.drawC(ctx, label, c[0], c[1] - 9, { scale: 3, color: '#ffffff', outline: 'rgba(0,0,0,0.5)' });
  }

  function drawTouch(ctx) {
    if (!touchActive) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    if (touchLayout === 'overworld') {
      circle(ctx, DPAD[0], DPAD[1], DPAD_R, 'rgba(18,22,30,0.34)', 'rgba(232,238,248,0.5)');
      arrow(ctx, DPAD[0], DPAD[1] - DPAD_R * 0.58, 'up', dpadDir.up);
      arrow(ctx, DPAD[0], DPAD[1] + DPAD_R * 0.58, 'down', dpadDir.down);
      arrow(ctx, DPAD[0] - DPAD_R * 0.58, DPAD[1], 'left', dpadDir.left);
      arrow(ctx, DPAD[0] + DPAD_R * 0.58, DPAD[1], 'right', dpadDir.right);
      const hx = (dpadDir.right ? 1 : 0) - (dpadDir.left ? 1 : 0);
      const hy = (dpadDir.down ? 1 : 0) - (dpadDir.up ? 1 : 0);
      circle(ctx, DPAD[0] + hx * DPAD_R * 0.42, DPAD[1] + hy * DPAD_R * 0.42, 34,
             'rgba(70,80,98,0.6)', 'rgba(245,248,255,0.8)');
    }
    btn(ctx, ABTN, A_R, 'A', !!held.confirm, { on: 'rgba(86,168,96,0.78)', off: 'rgba(34,54,38,0.46)' });
    btn(ctx, BBTN, B_R, 'B', !!held.back, { on: 'rgba(176,82,72,0.78)', off: 'rgba(56,38,36,0.46)' });
    ctx.restore();
  }

  return {
    init,
    held: (a) => !!held[a],
    pressed: (a) => !!pressedNow[a],
    mouse,
    axisX: () => (held.right ? 1 : 0) - (held.left ? 1 : 0),
    axisY: () => (held.down ? 1 : 0) - (held.up ? 1 : 0),
    setTouchLayout: (l) => { touchLayout = l; },
    usingTouch: () => touchActive,
    drawTouch,
    // call at the end of every fixed update tick
    postUpdate: () => {
      for (const k in pressedNow) pressedNow[k] = false;
      mouse.clicked = false;
    },
  };
})();
