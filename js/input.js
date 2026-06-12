/* Grove Clash — js/input.js
   Input: keyboard state with per-tick pressed edges, plus minimal mouse
   support (position/click mapped into the 960x540 virtual UI space).
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
    KeyP: 'pose',
    ShiftLeft: 'fast', ShiftRight: 'fast',
    KeyI: 'lookUp', KeyK: 'lookDown', KeyJ: 'lookLeft', KeyL: 'lookRight',
    KeyR: 'rise', KeyF: 'fall',
  };
  const PREVENT = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'];

  const held = {};      // action -> bool
  const pressedNow = {}; // action -> bool (edge, cleared each tick)
  const mouse = { x: -1, y: -1, inside: false, clicked: false };
  let mapper = null;     // fn(clientX, clientY) -> {x,y} in UI space or null
  let firstCb = null, firstDone = false;

  function fireFirst() {
    if (!firstDone) { firstDone = true; if (firstCb) firstCb(); }
  }

  function init(opts) {
    mapper = (opts && opts.mapper) || null;
    firstCb = (opts && opts.onFirstInteraction) || null;

    window.addEventListener('keydown', (e) => {
      if (PREVENT.indexOf(e.code) >= 0) e.preventDefault();
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
  }

  return {
    init,
    held: (a) => !!held[a],
    pressed: (a) => !!pressedNow[a],
    mouse,
    // axis helpers for movement (-1..1)
    axisX: () => (held.right ? 1 : 0) - (held.left ? 1 : 0),
    axisY: () => (held.down ? 1 : 0) - (held.up ? 1 : 0),
    // call at the end of every fixed update tick
    postUpdate: () => {
      for (const k in pressedNow) pressedNow[k] = false;
      mouse.clicked = false;
    },
  };
})();
