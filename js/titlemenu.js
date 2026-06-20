/* Grove Clash — js/titlemenu.js
   TitleMenu: shown after the Intro cinematic. Three save slots (each a live
   localStorage summary or EMPTY) + a difficulty picker for new games.
   Selecting an EMPTY slot starts a NEW GAME (pick difficulty -> opening
   story); selecting a filled slot CONTINUEs it. X erases the selected slot.
   Keyboard + mouse/touch. Cinematic letterbox stays up. */
const TitleMenu = (() => {
  let t = 0, mode = 'slots', slotCursor = 0, diffCursor = 2, pendingSlot = 1, emberT = 0;

  const SLOT_RECTS = [];
  for (let i = 0; i < 3; i++) SLOT_RECTS.push({ x: 280, y: 168 + i * 78, w: 400, h: 66 });
  const DIFF_RECTS = [];
  for (let i = 0; i < 5; i++) DIFF_RECTS.push({ x: 250, y: 150 + i * 62, w: 460, h: 54 });

  const ENV = { sky: M3.hex('#0a0c1a'), fog: M3.hex('#10142a'), fogNear: 10, fogFar: 30,
                lightDir: M3.normalize([], [-0.3, -0.7, 0.2]), lightCol: [0.7, 0.7, 0.95], ambient: [0.42, 0.44, 0.58] };

  function enter() {
    t = 0; mode = 'slots'; slotCursor = 0; diffCursor = 2;
    Cam.cut([0, 2.4, -5.5], [0, 1.2, 0.5], 44);
    Game.setBlur(0);
    Game.setLetterbox(1, 6, true);
    if (!Sfx.isMuted && Sfx.startMusic) Sfx.startMusic('title');
  }

  const slots = () => [1, 2, 3].map((n) => (typeof Save !== 'undefined' ? Save.summary(n) : null));

  function hit(rects, n) {
    if (!Input.mouse.inside) return -1;
    for (let i = 0; i < rects.length && i < n; i++) {
      const r = rects[i];
      if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
          Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) return i;
    }
    return -1;
  }

  function chooseSlot(i) {
    const sum = slots()[i];
    if (sum) { Sfx.play('confirm'); Game.continueGame(i + 1); }
    else { Sfx.play('cursor'); mode = 'diff'; diffCursor = 2; pendingSlot = i + 1; }
  }

  function update(rawDt) {
    const dt = rawDt * Fx.timeScale();
    t += dt;
    Cam.update(dt);
    emberT -= dt;
    if (emberT <= 0) {
      emberT = 0.12;
      Fx.spawn({ p: [(Math.random() - 0.5) * 12, 5, (Math.random() - 0.5) * 8 + 1], c: [0.5, 0.55, 0.9],
                 v: [0, -1.1 - Math.random(), 0], drag: 0.1, life: 2.4, s: 0.03, s1: 0.01 });
    }

    if (mode === 'slots') {
      if (Input.pressed('down')) { slotCursor = (slotCursor + 1) % 3; Sfx.play('cursor'); }
      if (Input.pressed('up')) { slotCursor = (slotCursor + 2) % 3; Sfx.play('cursor'); }
      const hov = hit(SLOT_RECTS, 3);
      if (hov >= 0) slotCursor = hov;
      if (Input.pressed('confirm') || (hov >= 0 && Input.mouse.clicked)) chooseSlot(slotCursor);
      else if (Input.pressed('back')) { // erase the selected slot
        if (typeof Save !== 'undefined' && slots()[slotCursor]) { Save.clear(slotCursor + 1); Sfx.play('buzz'); }
      }
    } else { // difficulty picker
      if (Input.pressed('down')) { diffCursor = (diffCursor + 1) % 5; Sfx.play('cursor'); }
      if (Input.pressed('up')) { diffCursor = (diffCursor + 4) % 5; Sfx.play('cursor'); }
      const hov = hit(DIFF_RECTS, 5);
      if (hov >= 0) diffCursor = hov;
      if (Input.pressed('confirm') || (hov >= 0 && Input.mouse.clicked)) {
        Sfx.play('confirm'); Game.startNewGame(diffCursor + 1, pendingSlot);
      } else if (Input.pressed('back')) { Sfx.play('cursor'); mode = 'slots'; }
    }
  }

  function render3d(aspect) {
    ENV.point = Fx.lightState();
    const { view, proj } = Cam.matrices(aspect);
    Gfx.begin(view, proj, ENV);
    const pd = Fx.particleData();
    Gfx.drawDynamic(pd.data, pd.count);
  }

  function renderUi(ctx) {
    PFont.drawC(ctx, BData.STORY.title, 480, 92, { scale: 5, color: '#bfe6ff', outline: '#0a0a14' });
    if (mode === 'slots') {
      PFont.drawC(ctx, 'SELECT A FILE', 480, 150, { scale: 2, color: '#e8e8f0', outline: '#0a0a14' });
      const sm = slots();
      for (let i = 0; i < 3; i++) {
        const r = SLOT_RECTS[i], sum = sm[i], sel = i === slotCursor;
        UI.para(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.fillStyle = sel ? 'rgba(46,78,116,0.92)' : 'rgba(30,34,48,0.9)'; ctx.fill();
        if (sel) { UI.para(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 10); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke(); }
        PFont.draw(ctx, 'SLOT ' + (i + 1), r.x + 18, r.y + 10, { scale: 2, color: '#f8e0c8' });
        if (sum) {
          const nm = sum.name || 'AEGIS';
          PFont.draw(ctx, nm, r.x + 130, r.y + 10, { scale: 2, color: '#ffffff' });
          const d = BData.DIFFICULTY[sum.difficulty] || BData.DIFFICULTY[3];
          PFont.draw(ctx, d.id + ' ' + d.name, r.x + 18, r.y + 38, { scale: 2, color: '#9fd0ff' });
          const lv = 'Lv.' + Math.max.apply(null, sum.levels.concat([1]));
          PFont.draw(ctx, lv, r.x + r.w - 18 - PFont.width(lv, 2), r.y + 38, { scale: 2, color: '#c8ccd8' });
        } else {
          PFont.draw(ctx, 'EMPTY - New Game', r.x + 130, r.y + 24, { scale: 2, color: '#aeb4c4' });
        }
      }
      PFont.drawC(ctx, 'UP/DOWN: Select   E: Confirm   X: Erase', 480, 432, { scale: 2, color: '#aeb4c4', outline: '#0a0a14' });
    } else {
      PFont.drawC(ctx, 'SELECT DIFFICULTY', 480, 116, { scale: 2, color: '#e8e8f0', outline: '#0a0a14' });
      for (let i = 0; i < 5; i++) {
        const r = DIFF_RECTS[i], d = BData.DIFFICULTY[i + 1], sel = i === diffCursor;
        UI.para(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.fillStyle = sel ? 'rgba(60,86,58,0.92)' : 'rgba(30,34,48,0.9)'; ctx.fill();
        if (sel) { UI.para(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 10); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke(); }
        PFont.draw(ctx, d.id + ' ' + d.name, r.x + 18, r.y + 8, { scale: 2, color: '#ffffff' });
        PFont.draw(ctx, d.blurb, r.x + 18, r.y + 32, { scale: 2, color: '#bcd0e6' });
      }
      PFont.drawC(ctx, 'E: Begin   X: Back', 480, 478, { scale: 2, color: '#aeb4c4', outline: '#0a0a14' });
    }
  }

  function exit() { Fx.clear(); }

  return { enter, update, render3d, renderUi, exit };
})();
