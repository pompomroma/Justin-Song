/* Grove Clash — js/fx.js
   Fx: voxel-cube particle pool, trauma-based screen shake, hitstop
   (time freeze), white flashes and full-screen scene transitions.
   TIME RULE: hitstop and transitions tick on RAW dt; particles, shake
   decay and flashes tick on scaled dt — so a hitstop freezes the world
   (and the battle script) but never deadlocks. Pure (no DOM). */
const Fx = (() => {

  // ------------------------------------------------------------- particles
  const MAX = 600;
  const pool = [];
  for (let i = 0; i < MAX; i++)
    pool.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
                g: 0, drag: 0, life: 1, t: 0, s: 0.06, s1: 0, r: 1, gg: 1, b: 1 });
  let cursor = 0;

  function spawn(o) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX;
    p.on = true;
    p.x = o.p[0]; p.y = o.p[1]; p.z = o.p[2];
    p.vx = o.v ? o.v[0] : 0; p.vy = o.v ? o.v[1] : 0; p.vz = o.v ? o.v[2] : 0;
    p.g = o.g || 0;
    p.drag = o.drag || 0;
    p.life = o.life || 0.5;
    p.t = 0;
    p.s = o.s || 0.06;
    p.s1 = o.s1 !== undefined ? o.s1 : 0; // size at end of life
    p.r = o.c[0]; p.gg = o.c[1]; p.b = o.c[2];
  }

  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
  let rnd = M3.rng(12345);

  /* radial burst. o: {n, speed, up, g, life, s, colors:[[r,g,b]..], spread} */
  function burst(p, o) {
    const n = o.n || 12;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, b = (rnd() - 0.5) * Math.PI * (o.spread || 1);
      const sp = (o.speed || 2) * (0.5 + rnd() * 0.7);
      spawn({
        p, c: pick(o.colors, rnd),
        v: [Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + (o.up || 0), Math.sin(a) * Math.cos(b) * sp],
        g: o.g !== undefined ? o.g : -4, drag: o.drag !== undefined ? o.drag : 1.5,
        life: (o.life || 0.5) * (0.7 + rnd() * 0.6), s: (o.s || 0.07) * (0.6 + rnd() * 0.8),
      });
    }
  }

  // expanding horizontal ring of cubes
  function ring(p, o) {
    const n = o.n || 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = (o.r1 - (o.r0 || 0.2)) / (o.life || 0.4);
      spawn({
        p: [p[0] + Math.cos(a) * (o.r0 || 0.2), p[1], p[2] + Math.sin(a) * (o.r0 || 0.2)],
        c: pick(o.colors, rnd),
        v: [Math.cos(a) * sp, o.vy || 0, Math.sin(a) * sp],
        g: 0, drag: 0, life: o.life || 0.4, s: o.s || 0.06, s1: 0.01,
      });
    }
  }

  // short-lived trail cube (called per-frame while something dashes)
  function streak(p, o) {
    spawn({
      p: [p[0] + (rnd() - 0.5) * 0.18, p[1] + (rnd() - 0.5) * 0.18 + 0.3, p[2] + (rnd() - 0.5) * 0.18],
      c: pick(o.colors, rnd), v: [0, 0.3, 0], g: 0, drag: 0,
      life: 0.28, s: o.s || 0.08, s1: 0.01,
    });
  }

  // active beam emitters (spawn cubes along a segment every frame)
  const beams = [];
  function beam(from, to, durMs, o) {
    beams.push({ from: from.slice(), to: to.slice(), t: 0, dur: durMs / 1000,
                 rate: o.rate || 5, colors: o.colors, jitter: o.jitter || 0.08, s: o.s || 0.07 });
  }

  /* dissolve a voxel model into falling cubes.
     centers: Models.get(..).centers, model: mat4 world transform */
  function dissolve(centers, model, o) {
    const tmp = [0, 0, 0];
    for (const c of centers) {
      M3.transformPoint(tmp, model, c.p);
      spawn({
        p: tmp, c: c.c,
        v: [(rnd() - 0.5) * 0.8, 0.4 + rnd() * 0.8, (rnd() - 0.5) * 0.8],
        g: -2.2, drag: 0.6,
        life: (o && o.life || 0.9) * (0.6 + rnd() * 0.7),
        s: 0.07, s1: 0.005,
      });
    }
  }

  // ------------------------------------------------- time / shake / flash
  let hitstopT = 0;       // seconds remaining, RAW time
  let slowmoT = 0, slowmoScale = 1; // brief fractional time dilation (bullet-time)
  let trauma = 0;
  let shakeTime = 0;      // advances on RAW dt so frozen frames still rumble
  let flashT = 0, flashDur = 0, flashPeak = 0, flashCol = [1, 1, 1];

  // hitstop (full freeze) wins; otherwise slow-mo scales all scaled-time systems
  const timeScale = () => (hitstopT > 0 ? 0 : (slowmoT > 0 ? slowmoScale : 1));
  const hitstop = (ms) => { hitstopT = Math.min(0.2, ms / 1000); };
  const slowmo = (ms, scale) => { slowmoT = Math.max(slowmoT, ms / 1000); slowmoScale = scale === undefined ? 0.35 : scale; };
  const addTrauma = (x) => { trauma = M3.clamp(trauma + x, 0, 1); };
  const flash = (ms, peak, color) => {
    flashDur = ms / 1000; flashT = flashDur;
    flashPeak = peak === undefined ? 1 : peak;
    flashCol = color || [1, 1, 1];
  };
  const flashAlpha = () => (flashT > 0 && flashDur > 0 ? (flashT / flashDur) * flashPeak : 0);
  const flashColor = () => flashCol;

  function shake() {
    const amp = trauma * trauma;
    const t = shakeTime;
    return {
      off: [
        amp * 0.13 * Math.sin(t * 79 + 1.3) * Math.sin(t * 13),
        amp * 0.11 * Math.sin(t * 89 + 4.1) * Math.sin(t * 17),
        amp * 0.09 * Math.sin(t * 71 + 2.2) * Math.sin(t * 19),
      ],
      roll: amp * 0.022 * Math.sin(t * 67),
    };
  }

  // ---------------------------------------------------------- transitions
  let trans = null; // {kind, t, dur, mid, midFired, onMid, onDone}

  function transition(kind, onMid, onDone) {
    // battleIn midpoint must land inside the fully-covered window
    // (cover==1 between k=0.52 and k=0.62 — see transitionDraw)
    if (kind === 'battleIn') trans = { kind, t: 0, dur: 1.45, mid: 0.57, midFired: false, onMid, onDone };
    else if (kind === 'portalIn') trans = { kind, t: 0, dur: 1.85, mid: 0.5, midFired: false, onMid, onDone };
    else trans = { kind: 'fade', t: 0, dur: 1.1, mid: 0.5, midFired: false, onMid, onDone };
  }
  const transitioning = () => !!trans;

  function transitionDraw(ctx) {
    if (!trans) return;
    const k = trans.t / trans.dur;
    ctx.save();
    if (trans.kind === 'battleIn') {
      // two white pulses, then a diagonal wipe to black and back
      if (k < 0.22) {
        const p = (k % 0.11) / 0.11;
        ctx.globalAlpha = Math.sin(p * Math.PI) * 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 960, 540);
      } else {
        const inK = M3.clamp((k - 0.22) / 0.30, 0, 1);   // cover
        const outK = M3.clamp((k - 0.62) / 0.34, 0, 1);  // reveal
        const cover = M3.ease.inOutCubic(inK) - M3.ease.inOutCubic(outK);
        if (cover > 0) {
          const w = cover * (960 + 300);
          ctx.fillStyle = '#000000';
          if (outK <= 0) { // sweep in from the right
            ctx.beginPath();
            ctx.moveTo(960 - w + 300, 0); ctx.lineTo(960, 0);
            ctx.lineTo(960, 540); ctx.lineTo(960 - w, 540);
            ctx.closePath(); ctx.fill();
          } else {        // uncover toward the left
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(w - 300 > 0 ? w - 300 : 0, 0);
            ctx.lineTo(w, 540); ctx.lineTo(0, 540);
            ctx.closePath(); ctx.fill();
          }
        }
      }
    } else if (trans.kind === 'portalIn') {
      // collapse into a swirling void, magenta burst at the midpoint, then
      // an iris opens onto the dungeon
      const cx = 480, cy = 270;
      const closing = k < 0.5;
      if (closing) {
        ctx.globalAlpha = M3.clamp(k / 0.5, 0, 1);
        ctx.fillStyle = '#06030c';
        ctx.fillRect(0, 0, 960, 540);
        ctx.globalAlpha = 1;
      } else {
        const hole = M3.ease.inOutCubic((k - 0.5) / 0.5) * 800;
        ctx.fillStyle = '#06030c';
        ctx.beginPath();
        ctx.rect(0, 0, 960, 540);
        ctx.arc(cx, cy, hole, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
      }
      const spin = trans.t * 7;
      const env = closing ? (k / 0.5) : (1 - (k - 0.5) / 0.5);
      ctx.lineWidth = 6;
      for (let i = 0; i < 6; i++) {
        const rr = 40 + i * 60 + (closing ? (1 - k / 0.5) * 120 : 0);
        ctx.strokeStyle = 'rgba(' + (140 + i * 18) + ',' + (60 + i * 8) + ',255,' + (0.5 * env) + ')';
        ctx.beginPath();
        ctx.arc(cx, cy, rr, spin + i * 1.1, spin + i * 1.1 + 2.2);
        ctx.stroke();
      }
      const burst = 1 - Math.min(1, Math.abs(k - 0.5) / 0.12);
      if (burst > 0) {
        ctx.globalAlpha = burst;
        ctx.fillStyle = '#e8b0ff';
        ctx.beginPath(); ctx.arc(cx, cy, 60 + burst * 230, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx, cy, 20 + burst * 90, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else { // fade
      const a = k < trans.mid ? k / trans.mid : 1 - (k - trans.mid) / (1 - trans.mid);
      ctx.globalAlpha = M3.clamp(a * 1.25, 0, 1);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 960, 540);
    }
    ctx.restore();
  }

  // --------------------------------------------------------------- update
  function update(rawDt) {
    // RAW-time systems
    if (hitstopT > 0) hitstopT -= rawDt;
    else if (slowmoT > 0) slowmoT -= rawDt; // only counts down once unfrozen
    shakeTime += rawDt;
    if (trans) {
      trans.t += rawDt;
      if (!trans.midFired && trans.t >= trans.mid * trans.dur) {
        trans.midFired = true;
        if (trans.onMid) trans.onMid();
      }
      if (trans.t >= trans.dur) {
        const cb = trans.onDone;
        trans = null;
        if (cb) cb();
      }
    }
    // scaled-time systems
    const dt = rawDt * timeScale();
    trauma = Math.max(0, trauma - 1.4 * dt);
    if (flashT > 0) flashT -= dt;
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.t += dt;
      if (b.t >= b.dur) { beams.splice(i, 1); continue; }
      for (let j = 0; j < b.rate; j++) {
        const u = rnd();
        spawn({
          p: [
            b.from[0] + (b.to[0] - b.from[0]) * u + (rnd() - 0.5) * b.jitter * 2,
            b.from[1] + (b.to[1] - b.from[1]) * u + (rnd() - 0.5) * b.jitter * 2,
            b.from[2] + (b.to[2] - b.from[2]) * u + (rnd() - 0.5) * b.jitter * 2,
          ],
          c: pick(b.colors, rnd),
          v: [0, 0, 0], g: 0, drag: 0, life: 0.16 + rnd() * 0.1, s: b.s, s1: 0.01,
        });
      }
    }
    for (const p of pool) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) { p.on = false; continue; }
      const dr = 1 - Math.min(0.9, p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
  }

  // ------------------------------------------------------- particle mesh
  // unit cube template (12 tris) with per-face brightness baked in
  const CUBE = (() => {
    const F = [
      { n: [0, 1, 0], b: 1.0,  c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
      { n: [0, -1, 0], b: 0.55, c: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]] },
      { n: [1, 0, 0], b: 0.8,  c: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },
      { n: [-1, 0, 0], b: 0.8, c: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
      { n: [0, 0, 1], b: 0.9,  c: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]] },
      { n: [0, 0, -1], b: 0.7, c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
    ];
    const out = [];
    for (const f of F) {
      const q = f.c, tri = [q[0], q[1], q[2], q[0], q[2], q[3]];
      for (const c of tri) out.push([c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, f.n, f.b]);
    }
    return out; // 36 entries
  })();

  const buffer = new Float32Array(MAX * 36 * 9);

  function particleData() {
    let o = 0;
    for (const p of pool) {
      if (!p.on) continue;
      const u = p.t / p.life;
      const s = p.s + (p.s1 - p.s) * u;
      if (s <= 0.001) continue;
      for (const v of CUBE) {
        buffer[o++] = p.x + v[0] * s;
        buffer[o++] = p.y + v[1] * s;
        buffer[o++] = p.z + v[2] * s;
        buffer[o++] = v[3][0]; buffer[o++] = v[3][1]; buffer[o++] = v[3][2];
        buffer[o++] = p.r * v[4]; buffer[o++] = p.gg * v[4]; buffer[o++] = p.b * v[4];
      }
    }
    return { data: buffer, count: o / 9 };
  }

  const clear = () => { for (const p of pool) p.on = false; beams.length = 0; trauma = 0; flashT = 0; hitstopT = 0; slowmoT = 0; };

  return {
    update, timeScale, hitstop, slowmo, addTrauma, shake, flash, flashAlpha, flashColor,
    burst, ring, streak, beam, dissolve, spawn, clear, particleData,
    transition, transitioning, transitionDraw,
    _state: () => ({ hitstopT, slowmoT, trauma }), // for smoke tests
  };
})();
