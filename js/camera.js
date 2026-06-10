/* Grove Clash — js/camera.js
   Cam: one global camera. Supports hard cuts, eased keyframed shot
   sequences, lissajous idle drift, FOV kicks, and an overworld follow
   mode. matrices() folds in Fx screen shake. */
const Cam = (() => {

  const cur = { pos: [0, 2, -5], look: [0, 0.5, 0], fov: 40 };
  let base = { pos: [0, 2, -5], look: [0, 0.5, 0], fov: 40 };

  let seq = null;       // {keys:[{t,pos,look,fov,ease}], t, start, onDone}
  let drift = false, driftT = 0;
  let kick = { amp: 0, t: 0, dur: 1 };

  const view = M3.mat(), proj = M3.mat();

  function snapshot() {
    return { pos: cur.pos.slice(), look: cur.look.slice(), fov: cur.fov };
  }

  function cut(pos, look, fov) {
    seq = null;
    M3.set(cur.pos, pos[0], pos[1], pos[2]);
    M3.set(cur.look, look[0], look[1], look[2]);
    if (fov) cur.fov = fov;
    base = snapshot();
  }

  /* keys: [{t(ms), pos, look, fov?, ease?}] — eased from the camera's pose
     at play() time through each key in order. */
  function play(keys, onDone) {
    seq = { keys, t: 0, start: snapshot(), onDone: onDone || null };
  }

  const playing = () => !!seq;
  const idleDrift = (on) => { drift = on; };
  const kickFov = (deltaDeg, ms) => { kick = { amp: deltaDeg, t: ms / 1000, dur: ms / 1000 }; };

  function update(dt) {
    driftT += dt;
    if (kick.t > 0) kick.t -= dt;
    if (!seq) return;
    seq.t += dt * 1000;
    const keys = seq.keys;
    let prev = { t: 0, pos: seq.start.pos, look: seq.start.look, fov: seq.start.fov };
    let done = true;
    for (const k of keys) {
      if (seq.t <= k.t) {
        const span = Math.max(1, k.t - prev.t);
        const u = (M3.ease[k.ease || 'inOutCubic'])(M3.clamp((seq.t - prev.t) / span, 0, 1));
        M3.lerpV(cur.pos, prev.pos, k.pos, u);
        M3.lerpV(cur.look, prev.look, k.look, u);
        cur.fov = M3.lerp(prev.fov, k.fov || prev.fov, u);
        done = false;
        break;
      }
      prev = { t: k.t, pos: k.pos, look: k.look, fov: k.fov || prev.fov };
    }
    if (done) {
      const last = keys[keys.length - 1];
      M3.set(cur.pos, last.pos[0], last.pos[1], last.pos[2]);
      M3.set(cur.look, last.look[0], last.look[1], last.look[2]);
      if (last.fov) cur.fov = last.fov;
      base = snapshot();
      const cb = seq.onDone;
      seq = null;
      if (cb) cb();
    }
  }

  // overworld: smooth third-person follow
  function follow(target, yaw, opts, dt) {
    opts = opts || {};
    const dist = opts.dist || 4.4, height = opts.height || 2.3;
    const k = 1 - Math.pow(0.0001, dt * (opts.rate || 1.6));
    const want = [
      target[0] - Math.sin(yaw) * dist,
      target[1] + height,
      target[2] - Math.cos(yaw) * dist,
    ];
    M3.lerpV(cur.pos, cur.pos, want, k);
    const lookW = [target[0], target[1] + 1.0, target[2]];
    M3.lerpV(cur.look, cur.look, lookW, Math.min(1, k * 1.6));
    base = snapshot();
  }

  const tmpUp = [0, 1, 0], tmpEye = [0, 0, 0], tmpLook = [0, 0, 0];
  const fwd = [0, 0, 0], right = [0, 0, 0];

  function matrices(aspect) {
    const sh = Fx.shake();
    let px = cur.pos[0], py = cur.pos[1], pz = cur.pos[2];
    let lx = cur.look[0], ly = cur.look[1], lz = cur.look[2];
    if (drift && !seq) {
      const a = 0.16 * Math.sin(driftT * 0.42), b = 0.05 * Math.sin(driftT * 0.61 + 1.7),
            c = 0.12 * Math.sin(driftT * 0.35 + 0.6);
      px += a; py += b; pz += c;
      lx += a * 0.4; lz += c * 0.4;
    }
    M3.set(tmpEye, px + sh.off[0], py + sh.off[1], pz + sh.off[2]);
    M3.set(tmpLook, lx + sh.off[0] * 0.4, ly + sh.off[1] * 0.4, lz + sh.off[2] * 0.4);
    // roll: tilt the up vector around the view axis
    M3.sub(fwd, tmpLook, tmpEye); M3.normalize(fwd, fwd);
    M3.cross(right, fwd, [0, 1, 0]); M3.normalize(right, right);
    M3.set(tmpUp, right[0] * sh.roll, 1, right[2] * sh.roll);
    M3.normalize(tmpUp, tmpUp);
    M3.lookAt(view, tmpEye, tmpLook, tmpUp);
    const kickNow = kick.t > 0 ? kick.amp * (kick.t / kick.dur) : 0;
    M3.persp(proj, M3.clamp(cur.fov + kickNow, 14, 110), aspect, 0.1, 60);
    return { view, proj };
  }

  return {
    cur, cut, play, playing, idleDrift, kickFov, update, follow, matrices,
    pose: () => ({ pos: cur.pos.map((v) => +v.toFixed(2)), look: cur.look.map((v) => +v.toFixed(2)), fov: +cur.fov.toFixed(1) }),
  };
})();
