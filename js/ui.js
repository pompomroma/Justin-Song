/* Grove Clash — js/ui.js
   UI: every 2D-canvas drawing routine — angular silver panels, HP/EXP bars,
   party ball icons, the red frame, the 2x2 move grid, message/dialogue
   boxes and the typewriter. Layout targets the 960x540 virtual canvas and
   replicates the reference screenshot. */
const UI = (() => {

  const C = {
    red: '#c83c34', redDark: '#8c2420', charcoal: '#26262c',
    silverHi: '#eceef2', silverLo: '#b4b8c2', trim: '#62666f',
    inset: '#272a31', insetEdge: '#15171c',
    hpGreen: '#58c842', hpYellow: '#f0c020', hpRed: '#e04028',
    exp: '#3890f0', teal: '#38b0a8',
    text: '#ffffff', textDark: '#2a2a33',
  };

  const TYPE_COLORS = {
    NORMAL: { base: '#a8a078', hi: '#c6c09e', dark: '#6e6848' },
    PSY:    { base: '#e85590', hi: '#f883b2', dark: '#93305c' },
    FIRE:   { base: '#f08030', hi: '#f8a060', dark: '#9c4a12' },
  };

  // ---- primitives ----

  function para(ctx, x, y, w, h, skew) {
    ctx.beginPath();
    ctx.moveTo(x + skew, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - skew, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  function panel(ctx, x, y, w, h, skew) {
    skew = skew === undefined ? 14 : skew;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, C.silverHi);
    g.addColorStop(1, C.silverLo);
    para(ctx, x, y, w, h, skew);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.trim;
    ctx.stroke();
    // inner highlight
    ctx.beginPath();
    ctx.moveTo(x + skew + 3, y + 3);
    ctx.lineTo(x + w - 3, y + 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function hpColor(frac) {
    return frac > 0.5 ? C.hpGreen : (frac > 0.2 ? C.hpYellow : C.hpRed);
  }

  function bar(ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = C.insetEdge;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = C.inset;
    ctx.fillRect(x, y, w, h);
    const fw = Math.round(w * M3.clamp(frac, 0, 1));
    if (fw > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, fw, h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, fw, Math.max(1, Math.floor(h / 3)));
    }
  }

  function hpChip(ctx, x, y) {
    ctx.fillStyle = C.insetEdge;
    ctx.fillRect(x, y, 30, 16);
    PFont.draw(ctx, 'HP', x + 6, y + 2, { scale: 1, color: '#f8c838', outline: null });
  }

  // party ball icon. style: 'full' | 'faded' | 'empty'
  function ball(ctx, cx, cy, r, style) {
    if (style === 'empty') {
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(230,232,238,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      return;
    }
    const top = style === 'faded' ? '#6e3434' : '#e8453c';
    const bot = style === 'faded' ? '#8e8e92' : '#f2f2f6';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fillStyle = top; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fillStyle = bot; ctx.fill();
    ctx.fillStyle = style === 'faded' ? '#3c3c42' : '#26262c';
    ctx.fillRect(cx - r, cy - 1.5, r * 2, 3);
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = style === 'faded' ? '#9a9aa0' : '#ffffff';
    ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 2; ctx.stroke();
  }

  // teal pokeball glyph used inside info panels
  function tealBall(ctx, cx, cy, r) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = C.teal; ctx.fill();
    ctx.strokeStyle = '#1f6862'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#1f6862'; ctx.fillRect(cx - r, cy - 1, r * 2, 2);
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#d8f4f0'; ctx.fill();
  }

  // ---- red frame ----

  function redFrame(ctx) {
    // top bar with charcoal wedge
    ctx.fillStyle = C.red;
    ctx.fillRect(0, 0, 960, 38);
    ctx.fillStyle = C.redDark;
    ctx.fillRect(0, 38, 960, 4);
    ctx.fillStyle = 'rgba(236,238,242,0.9)';
    ctx.fillRect(0, 42, 960, 2);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(250, 0); ctx.lineTo(206, 38); ctx.lineTo(0, 38);
    ctx.closePath();
    ctx.fillStyle = C.charcoal; ctx.fill();
    // bottom-right slab (behind the move grid)
    ctx.beginPath();
    ctx.moveTo(470, 378); ctx.lineTo(960, 358); ctx.lineTo(960, 540); ctx.lineTo(438, 540);
    ctx.closePath();
    ctx.fillStyle = C.red; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(470, 378); ctx.lineTo(960, 358);
    ctx.strokeStyle = C.redDark; ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(474, 384); ctx.lineTo(960, 365);
    ctx.strokeStyle = 'rgba(236,238,242,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    // bottom-left sliver
    ctx.beginPath();
    ctx.moveTo(0, 514); ctx.lineTo(400, 524); ctx.lineTo(438, 540); ctx.lineTo(0, 540);
    ctx.closePath();
    ctx.fillStyle = C.red; ctx.fill();
  }

  function emblem(ctx, x, y) {
    para(ctx, x, y, 46, 58, 10);
    ctx.fillStyle = '#1c2a52'; ctx.fill();
    ctx.strokeStyle = '#0e1730'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 30, y + 10); ctx.lineTo(x + 20, y + 28); ctx.lineTo(x + 27, y + 28);
    ctx.lineTo(x + 16, y + 48); ctx.lineTo(x + 34, y + 25); ctx.lineTo(x + 26, y + 25);
    ctx.lineTo(x + 36, y + 10);
    ctx.closePath();
    ctx.fillStyle = '#e0731f'; ctx.fill();
    ctx.strokeStyle = '#f8e8d0'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // ---- move grid ----

  const MOVE_RECTS = [
    { x: 506, y: 398, w: 212, h: 54 },
    { x: 732, y: 398, w: 212, h: 54 },
    { x: 506, y: 460, w: 212, h: 54 },
    { x: 732, y: 460, w: 212, h: 54 },
  ];

  function moveButton(ctx, r, mv, sel, t, disabled) {
    const tc = TYPE_COLORS[mv.type] || TYPE_COLORS.NORMAL;
    ctx.save();
    if (sel) {
      const s = 1 + 0.025 * Math.sin(t * 6);
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(s, s);
      ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    }
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, tc.hi);
    g.addColorStop(1, tc.base);
    para(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = tc.dark; ctx.stroke();
    if (sel) {
      para(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 10);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
    }
    // icon circle
    ctx.beginPath(); ctx.arc(r.x + 26, r.y + r.h / 2, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = tc.dark; ctx.lineWidth = 2; ctx.stroke();
    // name + PP
    PFont.draw(ctx, mv.name, r.x + 46, r.y + 8, { scale: 2, color: '#ffffff', outline: tc.dark });
    const pp = mv.pp + '/' + mv.maxPp;
    PFont.draw(ctx, pp, r.x + r.w - 22 - PFont.width(pp, 3), r.y + r.h - 27,
               { scale: 3, color: '#ffffff', outline: '#33333a' });
    if (disabled) {
      para(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fillStyle = 'rgba(30,30,36,0.55)'; ctx.fill();
    }
    ctx.restore();
  }

  function moveGrid(ctx, moves, cursor, t) {
    for (let i = 0; i < moves.length && i < 4; i++)
      moveButton(ctx, MOVE_RECTS[i], moves[i], i === cursor, t, moves[i].pp <= 0);
  }

  // ---- info panels ----

  function enemyPanel(ctx, vm) {
    panel(ctx, 565, 54, 370, 52);
    tealBall(ctx, 596, 80, 9);
    PFont.draw(ctx, vm.name, 614, 62, { scale: 2, color: '#33343c', outline: null });
    const lv = 'Lv.' + vm.lv;
    PFont.draw(ctx, lv, 918 - PFont.width(lv, 2), 62, { scale: 2, color: '#33343c', outline: null });
    hpChip(ctx, 614, 82);
    bar(ctx, 650, 84, 256, 12, vm.hpFrac, hpColor(vm.hpFrac));
    // party row
    for (let i = 0; i < vm.party.length; i++)
      ball(ctx, 766 + i * 28, 126, 10, vm.party[i]);
  }

  function playerPanel(ctx, vm) {
    panel(ctx, 28, 374, 382, 66);
    tealBall(ctx, 60, 398, 9);
    PFont.draw(ctx, vm.name, 78, 382, { scale: 2, color: '#33343c', outline: null });
    const lv = 'Lv.' + vm.lv;
    PFont.draw(ctx, lv, 392 - PFont.width(lv, 2), 382, { scale: 2, color: '#33343c', outline: null });
    hpChip(ctx, 78, 402);
    bar(ctx, 114, 404, 246, 12, vm.hpFrac, hpColor(vm.hpFrac));
    const nums = vm.hp + '/' + vm.maxHp;
    PFont.draw(ctx, nums, 360 - PFont.width(nums, 3), 414, { scale: 3, color: '#33343c', outline: '#d8dade' });
    bar(ctx, 50, 434, 330, 4, vm.expFrac, C.exp);
  }

  function playerParty(ctx, party) {
    for (let i = 0; i < party.length; i++)
      ball(ctx, 530 + i * 28, 372, 10, party[i]);
  }

  // ---- message box / typewriter ----

  function typewriter() {
    let lines = [], shown = 0, total = 0, time = 0, blip = 0;
    return {
      set(text, maxWidth) {
        maxWidth = maxWidth || 860;
        lines = [];
        for (const para0 of String(text).split('\n')) {
          let line = '';
          for (const word of para0.split(' ')) {
            const cand = line ? line + ' ' + word : word;
            if (PFont.width(cand, 2) > maxWidth && line) { lines.push(line); line = word; }
            else line = cand;
          }
          lines.push(line);
        }
        total = lines.join('\n').length;
        shown = 0; time = 0;
      },
      update(dt) {
        if (shown >= total) return;
        time += dt * 1000;
        while (time >= 18 && shown < total) {
          time -= 18; shown++;
          if ((++blip % 3) === 0 && typeof Sfx !== 'undefined') Sfx.play('blip');
        }
      },
      skip() { shown = total; },
      done() { return shown >= total; },
      visibleLines() {
        const out = [];
        let left = shown;
        for (const l of lines) {
          if (left <= 0) break;
          out.push(l.slice(0, left));
          left -= l.length + 1; // +1 for the newline
        }
        return out;
      },
    };
  }

  function msgBox(ctx, tw, t, waiting) {
    ctx.fillStyle = 'rgba(14,16,22,0.92)';
    para(ctx, 24, 446, 912, 86, 12);
    ctx.fill();
    ctx.strokeStyle = C.trim; ctx.lineWidth = 3;
    para(ctx, 24, 446, 912, 86, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(40, 450); ctx.lineTo(932, 450);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    const lines = tw.visibleLines();
    for (let i = 0; i < lines.length && i < 3; i++)
      PFont.draw(ctx, lines[i], 52, 462 + i * 24, { scale: 2 });
    if (waiting && tw.done()) {
      const dy = Math.sin(t * 7) > 0 ? 0 : 2;
      PFont.draw(ctx, '▼', 904, 508 + dy, { scale: 2, color: '#f8c838' });
    }
  }

  function prompt(ctx, text) {
    const w = PFont.width(text, 2) + 36;
    const x = 480 - w / 2;
    ctx.fillStyle = 'rgba(14,16,22,0.85)';
    para(ctx, x, 486, w, 30, 8);
    ctx.fill();
    ctx.strokeStyle = C.trim; ctx.lineWidth = 2;
    para(ctx, x, 486, w, 30, 8);
    ctx.stroke();
    PFont.draw(ctx, text, x + 22, 494, { scale: 2, color: '#f8c838' });
  }

  function hint(ctx, linesArr) {
    for (let i = 0; i < linesArr.length; i++)
      PFont.draw(ctx, linesArr[i], 18, 56 + i * 20, { scale: 2, color: '#e8e8f0', outline: '#1a1c24' });
  }

  function locationCard(ctx, text, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    panel(ctx, 600, 60, 330, 44, 12);
    PFont.draw(ctx, text, 632, 74, { scale: 2, color: '#33343c', outline: null });
    ctx.restore();
  }

  return {
    C, TYPE_COLORS, MOVE_RECTS,
    para, panel, bar, ball, tealBall, hpColor,
    redFrame, emblem, moveGrid, enemyPanel, playerPanel, playerParty,
    typewriter, msgBox, prompt, hint, locationCard,
  };
})();
