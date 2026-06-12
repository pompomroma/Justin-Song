/* Grove Clash — js/overworld.js
   Overworld: walkable forest clearing at dusk. WASD movement with a
   smooth third-person follow camera, circle collision, Camper REX as
   an interactable NPC (dialogue -> battle transition), campfire embers
   and wandering fireflies for atmosphere. */
const Overworld = (() => {

  const ENV = {
    sky: M3.hex('#152238'),
    fog: M3.hex('#16261e'), fogNear: 9, fogFar: 21,
    lightDir: M3.normalize([], [-0.4, -0.75, 0.3]),
    lightCol: [0.82, 0.72, 0.58],
    ambient: [0.46, 0.52, 0.48],
  };

  const REX_POS = [4.2, 0, 1.0];
  const FIRE_POS = [5.5, 0, 2.1];
  const SPAWN = [-5.2, 0, -4.2];
  const BOUND = 8.7;

  let staticH = null;
  const colliders = [
    { x: REX_POS[0], z: REX_POS[2], r: 0.55 },
    { x: FIRE_POS[0], z: FIRE_POS[2], r: 0.8 },
  ];

  let hero = null, rexActor = null;
  let camYaw = 0;
  let bobT = 0, stepT = 0, moving = false;
  let dialogue = null; // {lines, idx, tw}
  let battlePending = false;
  let cardT = 0, hintT = 0, t = 0;
  let fireflyT = 0, emberT = 0;

  function buildStatic() {
    if (staticH) return;
    const parts = [];
    const push = (name, pos, yaw, s) => parts.push({ m: Models.get(name), pos, yaw, s });
    const ground = Models.groundMesh({
      radius: 14,
      patches: [
        { x: 4.9, z: 1.6, rx: 2.4, rz: 1.9, rot: 0.2 },   // camp clearing
        { x: -4.6, z: -3.8, rx: 1.2, rz: 0.9, rot: 0.9 }, // spawn patch
      ],
    });
    const r = M3.rng(7);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.3;
      push('tree' + (i % 3), [Math.cos(a) * 10, 0, Math.sin(a) * 10], r() * 6.3, 0.9 + r() * 0.4);
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.17 + r() * 0.25;
      push('tree' + ((i + 2) % 3), [Math.cos(a) * 12.7, 0, Math.sin(a) * 12.7], r() * 6.3, 1.05 + r() * 0.5);
    }
    const props = [
      ['rock0', [6.3, 0, 0.4], 0.4, 1.1], ['rock1', [5.0, 0, 3.9], 1.9, 0.85],
      ['rock1', [-6.2, 0, 2.8], 0.9, 1.2], ['rock0', [-1.5, 0, 6.4], 3.4, 0.9],
      ['bush', [-3.2, 0, 3.8], 0.6, 1.05], ['bush', [2.4, 0, -4.8], 2.8, 0.95],
      ['bush', [-6.0, 0, -1.6], 4.4, 1.1], ['bush', [0.8, 0, 5.9], 1.2, 0.9],
      ['bush', [6.4, 0, -2.6], 5.3, 1.0],
      ['campfire', FIRE_POS, 0.3, 1.1],
    ];
    for (const [n, p, y, s] of props) {
      push(n, p, y, s);
      if (n.indexOf('rock') === 0) colliders.push({ x: p[0], z: p[2], r: 0.85 * s });
      if (n === 'bush') colliders.push({ x: p[0], z: p[2], r: 0.7 * s });
    }
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, rad = 1.5 + r() * 7;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (Math.hypot(x - FIRE_POS[0], z - FIRE_POS[2]) < 1.6) continue;
      push('tuft', [x, 0, z], r() * 6.3, 0.8 + r() * 0.9);
    }
    let total = ground.count;
    for (const p of parts) total += p.m.count;
    const data = new Float32Array(total * 9);
    data.set(ground.data, 0);
    let off = ground.count * 9;
    for (const p of parts)
      off = M3.bakeMesh(data, off, p.m.data, p.m.count, p.pos, p.yaw, p.s);
    staticH = Gfx.upload({ data, count: total });
  }

  function enter(params) {
    params = params || {};
    buildStatic();
    Fx.clear();
    const m = Models.get('hero');
    if (!hero) {
      hero = { pos: SPAWN.slice(), yaw: Math.atan2(-SPAWN[0], -SPAWN[2]), h: Game.handle('hero'), height: m.height };
    }
    rexActor = { pos: REX_POS.slice(), yaw: Math.atan2(-REX_POS[0], -REX_POS[2]), h: Game.handle('rex_idle') };
    if (params.result === 'win' || params.result === 'capture' || params.result === 'run') {
      M3.set(hero.pos, 2.0, 0, 0.2);
      hero.yaw = Math.atan2(REX_POS[0] - 2.0, REX_POS[2] - 0.2);
    } else if (params.result === 'loss') {
      M3.set(hero.pos, SPAWN[0], 0, SPAWN[2]);
      hero.yaw = Math.atan2(-SPAWN[0], -SPAWN[2]);
    }
    camYaw = hero.yaw;
    Cam.cut([hero.pos[0] - Math.sin(camYaw) * 4.4, 2.3, hero.pos[2] - Math.cos(camYaw) * 4.4],
            [hero.pos[0], 1.0, hero.pos[2]], 46);
    dialogue = null;
    battlePending = false;
    cardT = params.result ? 0 : 4.2;
    hintT = params.result ? 0 : 9;
    t = 0;
  }

  function nearRex() {
    return M3.dist(hero.pos, REX_POS) < 2.0;
  }

  function startDialogue() {
    const lines = Game.save.battles === 0 ? BData.DIALOGUE.first.slice()
      : (Game.save.beaten ? BData.DIALOGUE.beaten.slice() : BData.DIALOGUE.rematch.slice());
    dialogue = { lines, idx: 0, tw: UI.typewriter() };
    dialogue.tw.set(lines[0]);
    battlePending = true;
    Sfx.play('confirm');
    // face each other
    rexActor.yaw = Math.atan2(hero.pos[0] - REX_POS[0], hero.pos[2] - REX_POS[2]);
    hero.yaw = Math.atan2(REX_POS[0] - hero.pos[0], REX_POS[2] - hero.pos[2]);
  }

  function updateDialogue(dt) {
    dialogue.tw.update(dt);
    if (Input.pressed('confirm') || Input.mouse.clicked) {
      if (!dialogue.tw.done()) { dialogue.tw.skip(); return; }
      dialogue.idx++;
      if (dialogue.idx < dialogue.lines.length) {
        dialogue.tw.set(dialogue.lines[dialogue.idx]);
        Sfx.play('blip');
      } else {
        dialogue = null;
        if (battlePending) { battlePending = false; Game.toBattle(); }
      }
    }
  }

  function update(rawDt) {
    const dt = rawDt * Fx.timeScale();
    t += dt;
    if (cardT > 0) cardT -= dt;
    if (hintT > 0) hintT -= dt;

    if (dialogue) { updateDialogue(dt); moving = false; }
    else if (!Fx.transitioning()) {
      // movement relative to the follow camera
      const ax = Input.axisX(), az = Input.axisY();
      moving = !!(ax || az);
      if (moving) {
        const fwd = [Math.sin(camYaw), 0, Math.cos(camYaw)];
        const right = [-fwd[2], 0, fwd[0]];
        const mv = [0, 0, 0];
        M3.addScaled(mv, mv, fwd, -az);
        M3.addScaled(mv, mv, right, ax);
        M3.normalize(mv, mv);
        const sp = 3.3 * dt;
        hero.pos[0] += mv[0] * sp;
        hero.pos[2] += mv[2] * sp;
        const targetYaw = Math.atan2(mv[0], mv[2]);
        let dy = targetYaw - hero.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        hero.yaw += dy * Math.min(1, dt * 12);
        let dc = hero.yaw - camYaw;
        while (dc > Math.PI) dc -= Math.PI * 2;
        while (dc < -Math.PI) dc += Math.PI * 2;
        camYaw += dc * Math.min(1, dt * 1.7);
        bobT += dt * 9;
        stepT -= dt;
        if (stepT <= 0) { Sfx.play('step'); stepT = 0.3; }
      }
      // collision: arena boundary + props
      const d0 = Math.hypot(hero.pos[0], hero.pos[2]);
      if (d0 > BOUND) {
        hero.pos[0] *= BOUND / d0;
        hero.pos[2] *= BOUND / d0;
      }
      for (const c of colliders) {
        const dx = hero.pos[0] - c.x, dz = hero.pos[2] - c.z;
        const d = Math.hypot(dx, dz), min = c.r + 0.32;
        if (d < min && d > 0.0001) {
          hero.pos[0] = c.x + dx / d * min;
          hero.pos[2] = c.z + dz / d * min;
        }
      }
      if (nearRex() && Input.pressed('confirm')) startDialogue();
    }

    // atmosphere
    fireflyT -= dt;
    if (fireflyT <= 0) {
      fireflyT = 0.5;
      const a = Math.random() * Math.PI * 2, rad = 2 + Math.random() * 6;
      Fx.spawn({
        p: [Math.cos(a) * rad, 0.4 + Math.random() * 1.2, Math.sin(a) * rad],
        c: [0.65, 1, 0.45],
        v: [(Math.random() - 0.5) * 0.4, 0.12, (Math.random() - 0.5) * 0.4],
        g: 0, drag: 0.2, life: 2.6 + Math.random() * 2, s: 0.035, s1: 0.01,
      });
    }
    emberT -= dt;
    if (emberT <= 0) {
      emberT = 0.14;
      Fx.spawn({
        p: [FIRE_POS[0] + (Math.random() - 0.5) * 0.25, 0.25, FIRE_POS[2] + (Math.random() - 0.5) * 0.25],
        c: [[1, 0.48, 0.16], [1, 0.72, 0.2], [0.95, 0.3, 0.1]][Math.floor(Math.random() * 3)],
        v: [(Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.7, (Math.random() - 0.5) * 0.3],
        g: 0.4, drag: 0.4, life: 0.7 + Math.random() * 0.5, s: 0.06, s1: 0.01,
      });
    }

    Cam.follow(hero.pos, camYaw, { dist: 4.4, height: 2.3 }, dt);
    Cam.update(dt);
  }

  const mTmp = M3.mat();
  function render3d(aspect) {
    const { view, proj } = Cam.matrices(aspect);
    Gfx.begin(view, proj, ENV);
    Gfx.draw(staticH, null, {});
    const bob = moving ? Math.abs(Math.sin(bobT)) * 0.05 : 0;
    Gfx.draw(hero.h, M3.trs(mTmp, [hero.pos[0], hero.pos[1] + bob, hero.pos[2]], [hero.yaw, 0, 0], [1, 1, 1]), {});
    const rexBob = 1 + 0.012 * Math.sin(t * 1.8);
    Gfx.draw(rexActor.h, M3.trs(mTmp, rexActor.pos, [rexActor.yaw, 0, 0], [1, rexBob, 1]), {});
    const pd = Fx.particleData();
    Gfx.drawDynamic(pd.data, pd.count);
  }

  function renderUi(ctx) {
    if (cardT > 0) UI.locationCard(ctx, 'WHISPER GROVE', M3.clamp(cardT, 0, 1));
    if (hintT > 0)
      UI.hint(ctx, ['WASD/Arrows: Move', 'E: Talk / Confirm', 'M: Mute sound']);
    if (dialogue) UI.msgBox(ctx, dialogue.tw, t, true);
    else if (nearRex() && !Fx.transitioning()) UI.prompt(ctx, 'E  Talk');
  }

  function exit() { Fx.clear(); }

  return { enter, update, render3d, renderUi, exit };
})();
