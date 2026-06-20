/* Grove Clash — js/math3d.js
   M3: minimal vec3/mat4 math (column-major, WebGL style), easings,
   interpolation helpers and a seeded RNG. Pure — no DOM, loadable in Node. */
const M3 = (() => {

  // ---- vectors (plain arrays [x,y,z]) ----
  const v = (x = 0, y = 0, z = 0) => [x, y, z];
  const copy = (a) => [a[0], a[1], a[2]];
  const set = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
  const add = (o, a, b) => set(o, a[0] + b[0], a[1] + b[1], a[2] + b[2]);
  const sub = (o, a, b) => set(o, a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const scale = (o, a, s) => set(o, a[0] * s, a[1] * s, a[2] * s);
  const addScaled = (o, a, b, s) => set(o, a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (o, a, b) => set(o,
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]);
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const normalize = (o, a) => { const l = len(a) || 1; return set(o, a[0] / l, a[1] / l, a[2] / l); };
  const lerpV = (o, a, b, t) => set(o,
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t);

  // ---- scalars ----
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, lo, hi) => x < lo ? lo : (x > hi ? hi : x);
  const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // ---- easings (t in [0,1]) ----
  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outBack: (t) => { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
    outElastic: (t) => t === 0 ? 0 : t === 1 ? 1 :
      Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
  };

  // ---- mat4 (Float32Array(16), column-major) ----
  const mat = () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };

  const ident = (o) => { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; };

  const persp = (o, fovDeg, aspect, near, far) => {
    const f = 1 / Math.tan(fovDeg * Math.PI / 360);
    o.fill(0);
    o[0] = f / aspect;
    o[5] = f;
    o[10] = (far + near) / (near - far);
    o[11] = -1;
    o[14] = 2 * far * near / (near - far);
    return o;
  };

  const lookAt = (o, eye, c, up) => {
    let zx = eye[0] - c[0], zy = eye[1] - c[1], zz = eye[2] - c[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy,
        xy = up[2] * zx - up[0] * zz,
        xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy,
          yy = zz * xx - zx * xz,
          yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    o[15] = 1;
    return o;
  };

  const mul = (o, a, b) => {
    const r = new Array(16);
    for (let c = 0; c < 4; c++)
      for (let i = 0; i < 4; i++)
        r[c * 4 + i] = a[i] * b[c * 4] + a[4 + i] * b[c * 4 + 1] + a[8 + i] * b[c * 4 + 2] + a[12 + i] * b[c * 4 + 3];
    for (let i = 0; i < 16; i++) o[i] = r[i];
    return o;
  };

  // Translation * RotY * RotX * RotZ * Scale.  rot = [yaw, pitch, roll], scl = [sx,sy,sz].
  const trs = (o, p, rot, scl) => {
    const cy = Math.cos(rot[0]), sy = Math.sin(rot[0]);
    const cx = Math.cos(rot[1]), sx = Math.sin(rot[1]);
    const cz = Math.cos(rot[2]), sz = Math.sin(rot[2]);
    const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
    const r10 = cx * sz,                r11 = cx * cz,                 r12 = -sx;
    const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
    o[0] = r00 * scl[0]; o[1] = r10 * scl[0]; o[2] = r20 * scl[0]; o[3] = 0;
    o[4] = r01 * scl[1]; o[5] = r11 * scl[1]; o[6] = r21 * scl[1]; o[7] = 0;
    o[8] = r02 * scl[2]; o[9] = r12 * scl[2]; o[10] = r22 * scl[2]; o[11] = 0;
    o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1;
    return o;
  };

  const transformPoint = (o, m, p) => set(o,
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]);

  /* Bake an interleaved mesh (pos3,nrm3,col3 — stride 9) into dst at dstOff,
     applying yaw rotation, uniform scale and translation. Optional tint
     multiplies the vertex colors (used to recolor scenery per biome). Returns
     the new offset. Used to merge static scenery into a single buffer. */
  const bakeMesh = (dst, dstOff, src, count, pos, yaw, s, tint) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    for (let i = 0; i < count; i++) {
      const o = i * 9;
      const px = src[o], py = src[o + 1], pz = src[o + 2];
      const nx = src[o + 3], ny = src[o + 4], nz = src[o + 5];
      dst[dstOff++] = (cy * px + sy * pz) * s + pos[0];
      dst[dstOff++] = py * s + pos[1];
      dst[dstOff++] = (-sy * px + cy * pz) * s + pos[2];
      dst[dstOff++] = cy * nx + sy * nz;
      dst[dstOff++] = ny;
      dst[dstOff++] = -sy * nx + cy * nz;
      dst[dstOff++] = src[o + 6] * tr;
      dst[dstOff++] = src[o + 7] * tg;
      dst[dstOff++] = src[o + 8] * tb;
    }
    return dstOff;
  };

  // ---- misc ----
  const hex = (h) => {
    const n = parseInt(h[0] === '#' ? h.slice(1) : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  // mulberry32 — tiny seeded PRNG; all procedural generation uses this.
  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  return {
    v, copy, set, add, sub, scale, addScaled, dot, cross, len, dist, normalize, lerpV,
    lerp, clamp, smoothstep, ease,
    mat, ident, persp, lookAt, mul, trs, transformPoint, bakeMesh,
    hex, rng,
  };
})();
