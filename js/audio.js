/* Grove Clash — js/audio.js
   Sfx: 100% procedural WebAudio sound effects (no audio files).
   The AudioContext is created lazily on the first user gesture
   (autoplay policy safe, works from file://). M toggles mute. */
const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false, ambTimer = null;
  let musicGain = null, pendingTrack = null;
  const music = { on: false, track: null, step: 0, nextTime: 0, timer: null };

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();      // battle music sits under the SFX
    musicGain.gain.value = 0.34;       // headroom for the dense, multi-layer mix
    musicGain.connect(master);
    // 1 second of white noise, reused by every noise-based effect
    const n = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    startAmbience();
    if (pendingTrack) startMusic(pendingTrack); // a battle was waiting on audio
  }

  // ---- tiny synth helpers ----
  function tone(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 && o.f1 !== o.f0)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
    const v = o.vol || 0.15;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }

  function noise(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.ftype || 'lowpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t0 + o.dur);
    f.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    const v = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + o.dur + 0.05);
  }

  // ---- named effects ----
  const FX = {
    blip:    () => tone({ f0: 620, f1: 580, dur: 0.035, vol: 0.05 }),
    cursor:  () => tone({ f0: 700, f1: 660, dur: 0.05, vol: 0.08 }),
    confirm: () => { tone({ f0: 540, dur: 0.06, vol: 0.1 }); tone({ f0: 810, dur: 0.09, vol: 0.1, delay: 0.06 }); },
    buzz:    () => { tone({ f0: 120, f1: 90, dur: 0.16, vol: 0.14, type: 'sawtooth' }); },
    whoosh:  () => noise({ f0: 400, f1: 3400, dur: 0.16, vol: 0.22, ftype: 'bandpass', q: 1.2 }),
    impact:  () => {
      noise({ f0: 900, f1: 120, dur: 0.2, vol: 0.5 });
      tone({ f0: 95, f1: 38, dur: 0.18, vol: 0.35, type: 'sine' });
    },
    thud:    () => { noise({ f0: 500, f1: 100, dur: 0.12, vol: 0.3 }); },
    charge:  () => tone({ f0: 190, f1: 920, dur: 0.45, vol: 0.12, type: 'sine' }),
    beam:    () => {
      tone({ f0: 880, f1: 360, dur: 0.5, vol: 0.13, type: 'sawtooth' });
      tone({ f0: 905, f1: 350, dur: 0.5, vol: 0.1, type: 'square' });
    },
    zap:     () => tone({ f0: 1400, f1: 220, dur: 0.14, vol: 0.16, type: 'square' }),
    thunder: () => { // sharp electric crack + low rumble
      noise({ f0: 3200, f1: 240, dur: 0.16, vol: 0.3, ftype: 'highpass' });
      noise({ f0: 420, f1: 60, dur: 0.5, vol: 0.34, ftype: 'lowpass', q: 1.2 });
      tone({ f0: 90, f1: 40, dur: 0.4, vol: 0.16, type: 'sine', delay: 0.04 });
    },
    crackle: () => noise({ f0: 2600, f1: 5200, dur: 0.12, vol: 0.1, ftype: 'highpass' }),
    growl:   () => tone({ f0: 360, f1: 110, dur: 0.5, vol: 0.2, type: 'sawtooth' }),
    sizzle:  () => noise({ f0: 2400, f1: 4200, dur: 0.28, vol: 0.12, ftype: 'highpass' }),
    roar:    () => {
      noise({ f0: 620, f1: 130, dur: 0.6, vol: 0.34, ftype: 'lowpass', q: 1.6 });
      tone({ f0: 120, f1: 58, dur: 0.55, vol: 0.2, type: 'sawtooth' });
      tone({ f0: 240, f1: 90, dur: 0.5, vol: 0.12, type: 'square', delay: 0.05 });
    },
    rift:    () => { // cold void swell — portal / boss presence
      noise({ f0: 180, f1: 1600, dur: 0.7, vol: 0.16, ftype: 'bandpass', q: 2.2 });
      tone({ f0: 70, f1: 150, dur: 0.7, vol: 0.16, type: 'sine' });
      tone({ f0: 520, f1: 110, dur: 0.6, vol: 0.08, type: 'sawtooth', delay: 0.1 });
    },
    quake:   () => { // deep transformation rumble
      noise({ f0: 90, f1: 40, dur: 0.8, vol: 0.4, ftype: 'lowpass', q: 1.2 });
      tone({ f0: 60, f1: 30, dur: 0.8, vol: 0.24, type: 'sine' });
    },
    boom:    () => {
      noise({ f0: 700, f1: 60, dur: 0.45, vol: 0.6 });
      tone({ f0: 130, f1: 28, dur: 0.4, vol: 0.4, type: 'sine' });
    },
    faint:   () => tone({ f0: 600, f1: 70, dur: 0.7, vol: 0.2, type: 'square' }),
    giantbeam: () => { // colossal sustained void beam (the giant's intro attack)
      noise({ f0: 220, f1: 60, dur: 1.1, vol: 0.5, ftype: 'lowpass', q: 1.2 });
      tone({ f0: 880, f1: 200, dur: 1.0, vol: 0.16, type: 'sawtooth' });
      tone({ f0: 70, f1: 40, dur: 1.1, vol: 0.34, type: 'sine' });
      noise({ f0: 1800, f1: 5000, dur: 0.5, vol: 0.1, ftype: 'highpass', delay: 0.12 });
    },
    heal:    () => {
      [523, 659, 784].forEach((f, i) => tone({ f0: f, dur: 0.12, vol: 0.11, delay: i * 0.09, type: 'sine' }));
      noise({ f0: 2000, f1: 4500, dur: 0.35, vol: 0.05, ftype: 'highpass' });
    },
    cure:    () => {
      tone({ f0: 880, f1: 1320, dur: 0.22, vol: 0.1, type: 'sine' });
      tone({ f0: 1320, f1: 880, dur: 0.22, vol: 0.08, type: 'sine', delay: 0.2 });
      noise({ f0: 3000, f1: 5200, dur: 0.3, vol: 0.04, ftype: 'highpass', delay: 0.1 });
    },
    spawn:   () => { noise({ f0: 800, f1: 2600, dur: 0.18, vol: 0.14, ftype: 'bandpass' }); tone({ f0: 420, f1: 860, dur: 0.18, vol: 0.1 }); },
    victory: () => {
      const seq = [523, 523, 523, 659, 784, 1047];
      seq.forEach((f, i) => tone({ f0: f, dur: i === seq.length - 1 ? 0.34 : 0.11, vol: 0.13, delay: i * 0.12 }));
    },
    defeat:  () => {
      [392, 330, 262, 196].forEach((f, i) => tone({ f0: f, dur: 0.2, vol: 0.13, delay: i * 0.18, type: 'square' }));
    },
    step:    () => noise({ f0: 700, f1: 250, dur: 0.05, vol: 0.04 }),
  };

  // ---- unique, cinematic signature per attack (layered on the move's FX) ----
  const MOVEFX = {
    TACKLE: () => { tone({ f0: 160, f1: 360, dur: 0.13, vol: 0.16, type: 'sawtooth' }); noise({ f0: 600, f1: 2200, dur: 0.16, vol: 0.18, ftype: 'bandpass', q: 1 }); },
    GROWL: () => { tone({ f0: 300, f1: 90, dur: 0.55, vol: 0.2, type: 'sawtooth' }); tone({ f0: 150, f1: 58, dur: 0.55, vol: 0.14, type: 'square', delay: 0.03 }); noise({ f0: 520, f1: 120, dur: 0.5, vol: 0.1, ftype: 'lowpass' }); },
    MINDBEAM: () => { tone({ f0: 520, f1: 1180, dur: 0.42, vol: 0.14, type: 'sine' }); tone({ f0: 532, f1: 1210, dur: 0.42, vol: 0.12, type: 'triangle' }); noise({ f0: 3000, f1: 6200, dur: 0.3, vol: 0.05, ftype: 'highpass', delay: 0.12 }); },
    PSYBLAST: () => { tone({ f0: 300, f1: 1500, dur: 0.3, vol: 0.12, type: 'sine' }); tone({ f0: 1568, dur: 0.5, vol: 0.12, type: 'sine', delay: 0.28 }); tone({ f0: 90, f1: 38, dur: 0.4, vol: 0.3, type: 'sine', delay: 0.28 }); noise({ f0: 1200, f1: 200, dur: 0.4, vol: 0.3, delay: 0.28 }); },
    CINDER: () => { noise({ f0: 300, f1: 2400, dur: 0.25, vol: 0.2, ftype: 'bandpass', q: 0.8 }); noise({ f0: 3000, f1: 5000, dur: 0.3, vol: 0.08, ftype: 'highpass', delay: 0.05 }); tone({ f0: 120, f1: 48, dur: 0.3, vol: 0.18, type: 'sine', delay: 0.1 }); },
    SCORCH: () => { noise({ f0: 400, f1: 120, dur: 0.5, vol: 0.4, ftype: 'lowpass', q: 1.4 }); noise({ f0: 2600, f1: 4800, dur: 0.4, vol: 0.1, ftype: 'highpass' }); tone({ f0: 110, f1: 38, dur: 0.45, vol: 0.32, type: 'sine', delay: 0.05 }); },
    LEAFRAZOR: () => { noise({ f0: 1200, f1: 4200, dur: 0.12, vol: 0.22, ftype: 'bandpass', q: 2.4 }); tone({ f0: 1800, f1: 600, dur: 0.14, vol: 0.1, type: 'sawtooth', delay: 0.02 }); },
    SEEDBURST: () => { for (let i = 0; i < 5; i++) noise({ f0: 1800, f1: 600, dur: 0.05, vol: 0.12, ftype: 'bandpass', q: 3, delay: i * 0.05 }); tone({ f0: 880, dur: 0.18, vol: 0.08, type: 'triangle', delay: 0.1 }); },
    VOIDLANCE: () => { tone({ f0: 740, f1: 300, dur: 0.5, vol: 0.14, type: 'square' }); tone({ f0: 300, f1: 740, dur: 0.5, vol: 0.1, type: 'sawtooth' }); tone({ f0: 60, f1: 40, dur: 0.6, vol: 0.3, type: 'sine' }); noise({ f0: 1400, f1: 400, dur: 0.4, vol: 0.12, ftype: 'bandpass', q: 6, delay: 0.1 }); },
    VOIDSTORM: () => { noise({ f0: 200, f1: 3000, dur: 0.5, vol: 0.18, ftype: 'bandpass', q: 1.5 }); tone({ f0: 880, f1: 200, dur: 0.5, vol: 0.12, type: 'square' }); tone({ f0: 55, f1: 36, dur: 0.6, vol: 0.3, type: 'sine' }); },
    DREADWAVE: () => { tone({ f0: 140, f1: 90, dur: 0.5, vol: 0.2, type: 'sawtooth' }); tone({ f0: 70, f1: 46, dur: 0.6, vol: 0.26, type: 'sine' }); noise({ f0: 600, f1: 160, dur: 0.5, vol: 0.12, ftype: 'lowpass' }); },
    ABYSSNOVA: () => { noise({ f0: 800, f1: 48, dur: 0.7, vol: 0.6, ftype: 'lowpass', q: 1.2 }); tone({ f0: 80, f1: 26, dur: 0.7, vol: 0.4, type: 'sine' }); [330, 466, 622].forEach((f, i) => tone({ f0: f, dur: 0.6, vol: 0.1, type: 'sawtooth', delay: i * 0.02 })); },
    AWAKEN: () => { tone({ f0: 120, f1: 900, dur: 0.8, vol: 0.2, type: 'sawtooth' }); tone({ f0: 60, f1: 200, dur: 0.8, vol: 0.2, type: 'sine' }); noise({ f0: 400, f1: 4000, dur: 0.8, vol: 0.12, ftype: 'bandpass', q: 1 }); },
  };

  // synthesized "voice" blip — a short vowel-ish formant chirp keyed off the
  // character, fired per-letter by the typewriter so spoken lines read as
  // BOTH voice and text. (Real TTS is impossible offline / zero-dependency.)
  function voice(ch) {
    if (!ctx || !ch || ch === ' ' || ch === '\n') return;
    const code = ch.charCodeAt(0);
    const base = 128 + (code % 13) * 10;
    const t0 = ctx.currentTime;
    for (const det of [0, 5]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base + det, t0);
      o.frequency.exponentialRampToValueAtTime((base + det) * 1.16, t0 + 0.05);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 700 + (code % 5) * 130; f.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.078);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.1);
    }
  }

  // soft night-forest bed: filtered noise pad + scheduled cricket chirps
  function startAmbience() {
    if (!ctx) return;
    const pad = ctx.createBufferSource();
    pad.buffer = noiseBuf; pad.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = ctx.createGain(); g.gain.value = 0.018;
    pad.connect(lp); lp.connect(g); g.connect(master);
    pad.start();
    const chirp = () => {
      if (!ctx) return;
      for (let i = 0; i < 3; i++)
        tone({ f0: 4200 + Math.random() * 600, dur: 0.03, vol: 0.012, delay: i * 0.07, type: 'sine' });
      ambTimer = setTimeout(chirp, 900 + Math.random() * 2200);
    };
    ambTimer = setTimeout(chirp, 1200);
  }

  // ---- procedural battle music (no audio files; a small step sequencer) ----
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function mnote(midi, when, dur, vol, type) {
    if (!ctx || !midi) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(hz(midi), when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g); g.connect(musicGain);
    osc.start(when); osc.stop(when + dur + 0.05);
  }
  function mnoise(when, f0, f1, dur, vol, ftype, q) {
    if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype || 'highpass';
    f.frequency.setValueAtTime(f0, when); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), when + dur);
    f.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(when); src.stop(when + dur + 0.05);
  }
  function mkick(when) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(155, when); o.frequency.exponentialRampToValueAtTime(45, when + 0.11);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.55, when + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    o.connect(g); g.connect(musicGain); o.start(when); o.stop(when + 0.2);
  }
  const msnare = (when) => { mnoise(when, 1900, 800, 0.14, 0.26, 'highpass', 0.6); mnoise(when, 380, 200, 0.1, 0.12, 'bandpass', 1.2); };
  const mhat = (when, accent) => mnoise(when, 7200, 9000, accent ? 0.05 : 0.03, accent ? 0.12 : 0.07, 'highpass', 0.8);

  // 4-bar loops, scheduled in 8th-notes (32 steps): drums + bass + sub +
  // chord pad + arpeggio + a harmonized lead. Faster + denser than before.
  const TRACKS = {
    battle: { // heroic / majestic — Am F C G
      bpm: 170,
      chords: [[57, 60, 64], [53, 57, 60], [52, 55, 60], [55, 59, 62]],
      bass: [45, 41, 48, 43],
      lead: [69, 71, 72, 76, 74, 72, 69, 67, 72, 74, 77, 74, 72, 69, 65, 64,
             67, 72, 76, 79, 76, 72, 67, 64, 67, 71, 74, 79, 78, 74, 71, 67],
    },
    boss: { // dark / intense — Dm Bb Gm A(maj for tension)
      bpm: 186,
      chords: [[50, 53, 57], [46, 50, 53], [55, 58, 62], [57, 61, 64]],
      bass: [38, 34, 43, 45],
      lead: [62, 65, 69, 74, 73, 69, 65, 62, 70, 74, 77, 74, 70, 69, 65, 62,
             67, 70, 74, 79, 77, 74, 70, 67, 69, 73, 76, 81, 80, 76, 73, 69],
    },
    title: { // bright, anthemic retro-opening fanfare — C G Am F
      bpm: 132,
      chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
      bass: [36, 31, 33, 29],
      lead: [72, 76, 79, 76, 74, 72, 71, 72, 67, 71, 74, 71, 69, 67, 66, 67,
             69, 72, 76, 72, 74, 76, 79, 84, 83, 79, 76, 72, 74, 71, 67, 72],
    },
    tutorial: { // tense, driving — Am F Dm E
      bpm: 150,
      chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],
      bass: [45, 41, 38, 40],
      lead: [69, 72, 71, 69, 67, 69, 72, 74, 65, 69, 68, 65, 64, 65, 69, 72,
             62, 65, 69, 74, 72, 69, 65, 62, 64, 68, 71, 76, 75, 71, 68, 64],
    },
  };
  function scheduleMusic() {
    music.timer = null;
    if (!music.on || !ctx) return;
    const tr = TRACKS[music.track]; if (!tr) return;
    const spb = 60 / tr.bpm, sp8 = spb / 2; // step = one 8th note
    while (music.nextTime < ctx.currentTime + 0.25) {
      const step = music.step % 32, bar = (step / 8) | 0, inBar = step % 8;
      const w = music.nextTime;
      // driving drum kit
      if (inBar === 0 || inBar === 4 || inBar === 7) mkick(w);
      if (inBar === 2 || inBar === 6) msnare(w);
      mhat(w, inBar % 2 === 0);
      // bass pulse (every quarter) + sub octave
      if (inBar % 2 === 0) { mnote(tr.bass[bar], w, sp8 * 1.4, 0.4, 'triangle'); mnote(tr.bass[bar] - 12, w, sp8 * 1.4, 0.2, 'sine'); }
      // chord pad held across the bar
      if (inBar === 0) for (const c of tr.chords[bar]) mnote(c, w, spb * 3.6, 0.09, 'triangle');
      // shimmering arpeggio (cycles the bar's chord up an octave)
      const ac = tr.chords[bar]; mnote(ac[step % ac.length] + 12, w, sp8 * 0.7, 0.07, 'square');
      // harmonized 8th-note lead (brassy saw + an octave sparkle)
      const ln = tr.lead[step];
      if (ln) { mnote(ln, w, sp8 * 0.95, 0.3, 'sawtooth'); mnote(ln + 12, w, sp8 * 0.95, 0.09, 'square'); }
      music.nextTime += sp8;
      music.step++;
    }
    music.timer = setTimeout(scheduleMusic, 50);
  }
  function startMusic(track) {
    pendingTrack = track;
    if (!ctx) return; // will start once audio unlocks
    music.on = true; music.track = track; music.step = 0;
    music.nextTime = ctx.currentTime + 0.1;
    if (music.timer) { clearTimeout(music.timer); music.timer = null; }
    scheduleMusic();
  }
  function stopMusic() {
    pendingTrack = null; music.on = false;
    if (music.timer) { clearTimeout(music.timer); music.timer = null; }
  }

  return {
    unlock,
    play: (name) => { if (ctx && FX[name]) FX[name](); },
    move: (id) => { if (ctx) (MOVEFX[id] || FX.impact)(); },
    voice,
    startMusic, stopMusic,
    toggleMute: () => {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.45;
      return muted;
    },
    isMuted: () => muted,
    ready: () => !!ctx,
  };
})();
