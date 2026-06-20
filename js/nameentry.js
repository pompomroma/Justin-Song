/* Grove Clash — js/nameentry.js
   NameEntry: an on-screen keyboard (A-Z, 0-9, SPACE, DEL, OK) navigable with
   arrows/D-pad + confirm and fully tappable. Up to 10 chars. Used for both
   the amnesiac "name yourself" beat after the faint (mode 'create') and the
   overworld Options "Rename" (mode 'rename'). Calls cfg.onDone(name). */
const NameEntry = (() => {
  const ROWS = [
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
    ['U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3'],
    ['4', '5', '6', '7', '8', '9', 'SPACE', 'DEL', 'OK'],
  ];
  const MAXLEN = 10;
  const CW = 66, CH = 46, GAP = 4;
  const GX = 480 - (10 * (CW + GAP) - GAP) / 2, GY = 196;

  const ENV = { sky: M3.hex('#0a0c1a'), fog: M3.hex('#10142a'), fogNear: 10, fogFar: 30,
                lightDir: M3.normalize([], [-0.3, -0.7, 0.2]), lightCol: [0.7, 0.7, 0.95], ambient: [0.42, 0.44, 0.58] };

  let t = 0, row = 0, col = 0, name = '', cfg = null, emberT = 0;

  const rectOf = (r, c) => ({ x: GX + c * (CW + GAP), y: GY + r * (CH + GAP), w: CW, h: CH });

  function enter(params) {
    cfg = params || {};
    name = (cfg.initial || '').slice(0, MAXLEN).toUpperCase();
    t = 0; row = 0; col = 0;
    Cam.cut([0, 2.4, -5.5], [0, 1.2, 0.5], 44);
    Game.setBlur(0);
    Game.setLetterbox(1, 6, true);
  }

  function commit() {
    const final = (name.trim() || cfg.initial || 'AEGIS').slice(0, MAXLEN);
    Sfx.play('confirm');
    if (cfg.onDone) cfg.onDone(final);
  }

  function activate(key) {
    if (key === 'OK') { commit(); return; }
    if (key === 'DEL') { name = name.slice(0, -1); Sfx.play('cursor'); return; }
    if (key === 'SPACE') { if (name.length < MAXLEN) { name += ' '; Sfx.play('blip'); } return; }
    if (name.length < MAXLEN) { name += key; Sfx.play('blip'); }
    else Sfx.play('buzz');
  }

  function hit() {
    if (!Input.mouse.inside) return null;
    for (let r = 0; r < ROWS.length; r++)
      for (let c = 0; c < ROWS[r].length; c++) {
        const q = rectOf(r, c);
        if (Input.mouse.x >= q.x && Input.mouse.x <= q.x + q.w &&
            Input.mouse.y >= q.y && Input.mouse.y <= q.y + q.h) return { r, c };
      }
    return null;
  }

  function update(rawDt) {
    const dt = rawDt * Fx.timeScale();
    t += dt;
    Cam.update(dt);
    emberT -= dt;
    if (emberT <= 0) {
      emberT = 0.14;
      Fx.spawn({ p: [(Math.random() - 0.5) * 12, 5, (Math.random() - 0.5) * 8 + 1], c: [0.5, 0.55, 0.9],
                 v: [0, -1.0 - Math.random(), 0], drag: 0.1, life: 2.4, s: 0.03, s1: 0.01 });
    }

    if (Input.pressed('down')) { row = (row + 1) % ROWS.length; col = Math.min(col, ROWS[row].length - 1); Sfx.play('cursor'); }
    if (Input.pressed('up')) { row = (row + ROWS.length - 1) % ROWS.length; col = Math.min(col, ROWS[row].length - 1); Sfx.play('cursor'); }
    if (Input.pressed('right')) { col = (col + 1) % ROWS[row].length; Sfx.play('cursor'); }
    if (Input.pressed('left')) { col = (col + ROWS[row].length - 1) % ROWS[row].length; Sfx.play('cursor'); }
    const h = hit();
    if (h) { row = h.r; col = h.c; }
    if (Input.pressed('confirm') || (h && Input.mouse.clicked)) activate(ROWS[row][col]);
    if (Input.pressed('back')) activate('DEL');
  }

  function render3d(aspect) {
    ENV.point = Fx.lightState();
    const { view, proj } = Cam.matrices(aspect);
    Gfx.begin(view, proj, ENV);
    const pd = Fx.particleData();
    Gfx.drawDynamic(pd.data, pd.count);
  }

  function renderUi(ctx) {
    const title = cfg && cfg.mode === 'rename' ? 'RENAME' : 'NAME YOURSELF';
    PFont.drawC(ctx, title, 480, 70, { scale: 4, color: '#bfe6ff', outline: '#0a0a14' });
    PFont.drawC(ctx, BData.STORY.namePrompt, 480, 120, { scale: 2, color: '#cdd4e6', outline: '#0a0a14' });
    // name field
    UI.para(ctx, 320, 146, 320, 38, 8); ctx.fillStyle = 'rgba(14,16,22,0.92)'; ctx.fill();
    ctx.strokeStyle = '#62666f'; ctx.lineWidth = 2; UI.para(ctx, 320, 146, 320, 38, 8); ctx.stroke();
    const shown = name + ((Math.sin(t * 5) > 0 && name.length < MAXLEN) ? '_' : '');
    PFont.drawC(ctx, shown || ' ', 480, 156, { scale: 3, color: '#ffffff' });
    // keyboard grid
    for (let r = 0; r < ROWS.length; r++)
      for (let c = 0; c < ROWS[r].length; c++) {
        const q = rectOf(r, c), key = ROWS[r][c], sel = r === row && c === col;
        UI.para(ctx, q.x, q.y, q.w, q.h, 6);
        ctx.fillStyle = sel ? 'rgba(56,96,140,0.95)' : 'rgba(34,38,52,0.9)'; ctx.fill();
        if (sel) { UI.para(ctx, q.x - 2, q.y - 2, q.w + 4, q.h + 4, 6); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); }
        const label = key.length > 1 ? key : key;
        PFont.drawC(ctx, label, q.x + q.w / 2, q.y + q.h / 2 - 7, { scale: key.length > 1 ? 1 : 2, color: '#ffffff' });
      }
    PFont.drawC(ctx, 'Arrows: Move   E: Pick   X: Delete', 480, 488, { scale: 2, color: '#aeb4c4', outline: '#0a0a14' });
  }

  function exit() { Fx.clear(); }

  return { enter, update, render3d, renderUi, exit };
})();
