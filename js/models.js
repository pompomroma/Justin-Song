/* Grove Clash — js/models.js
   Models: procedural voxel model builders (creatures, characters, scenery)
   plus the ground mesh generator. Pure (Node-safe); deterministic via
   seeded RNG so smoke tests can assert vertex counts. */
const Models = (() => {

  const pal = (...hx) => hx.map(M3.hex);

  // ============================================================== creatures

  // PIXLIT — small psychic-fairy: pale body, sage mushroom-cap "hair",
  // rose horn nubs, chest gem. Faces +z. ~0.96u tall.
  function pixlit() {
    const g = Vox.grid(15, 16, 13);
    const C = { body: 0, cap: 1, capDark: 2, horn: 3, eye: 4, gem: 5 };
    const colors = pal('#d9d5f2', '#4fb286', '#347a5b', '#e86fa4', '#3a2b45', '#ff8fc0');
    // skirted body (tapering ellipse layers)
    const taper = [4.4, 4.2, 3.8, 3.4, 3.0, 2.6, 2.3];
    for (let y = 0; y <= 6; y++) {
      const r = taper[y];
      for (let z = 0; z < 13; z++)
        for (let x = 0; x < 15; x++) {
          const dx = (x - 7) / r, dz = (z - 6) / (r * 0.9);
          if (dx * dx + dz * dz <= 1) g.set(x, y, z, C.body);
        }
    }
    // head
    g.ellipsoid(7, 10, 6, 4.1, 3.9, 3.9, C.body);
    // cap: dome over the top/back of the head with an overhanging rim
    for (let z = 0; z < 13; z++)
      for (let y = 8; y < 16; y++)
        for (let x = 0; x < 15; x++) {
          if (!g.get(x, y, z)) continue;
          const back = z <= 5, high = y >= 11;
          if (high || (back && y >= 9)) g.set(x, y, z, C.cap);
        }
    for (let z = 1; z < 12; z++) // rim ring at y=10/11
      for (let x = 1; x < 14; x++) {
        const dx = (x - 7) / 4.9, dz = (z - 6) / 4.7;
        const e = dx * dx + dz * dz;
        if (e <= 1 && e >= 0.55) { g.set(x, 11, z, C.cap); g.set(x, 10, z, C.capDark); }
      }
    // horn nubs (right side; mirror copies to left)
    g.box(10, 13, 6, 11, 14, 7, C.horn);
    g.set(10, 15, 6, C.horn);
    // arm nubs
    g.box(11, 4, 5, 12, 6, 7, C.body);
    g.mirrorX();
    // face: eyes + chest gem (symmetric, set after mirror for clarity)
    g.set(5, 9, 9, C.eye); g.set(9, 9, 9, C.eye);
    g.set(5, 8, 9, C.eye); g.set(9, 8, 9, C.eye);
    g.set(7, 5, 9, C.gem);
    return { g, colors, s: 0.062, jitter: 0.05 };
  }

  // MAGMULE — drowsy camel-like fire creature: yellow hide, mossy green
  // spots, dormant crater hump. Faces +z. ~1.8u long.
  function magmule() {
    const g = Vox.grid(16, 18, 26);
    const C = { hide: 0, belly: 1, spot: 2, spotD: 3, hoof: 4, rim: 5, core: 6, eye: 7, snout: 8 };
    const colors = pal('#e7c23c', '#c79e2e', '#79a23f', '#5d8330', '#8a6b34',
                       '#e0731f', '#5e2817', '#2e2620', '#d4a84e');
    // legs (right pair; mirrored)
    for (const z of [4, 18]) {
      g.box(10, 2, z, 12, 6, z + 2, C.hide);
      g.box(10, 0, z, 12, 1, z + 2, C.hoof);
    }
    // body: rounded barrel
    g.box(3, 6, 4, 12, 12, 21, C.hide);
    g.ellipsoid(7.5, 9.5, 4, 6, 4, 4, C.hide);   // rump rounding
    g.ellipsoid(7.5, 9.5, 21, 6, 4, 4.5, C.hide); // chest rounding
    for (let z = 3; z <= 22; z++) // belly shading
      for (let x = 3; x <= 12; x++) if (g.get(x, 6, z)) g.set(x, 6, z, C.belly);
    // crater hump on the back
    g.ellipsoid(7.5, 13, 12, 3.4, 1.8, 3.6, C.rim);
    g.box(6, 13, 11, 9, 14, 13, C.rim);
    g.box(7, 14, 12, 8, 14, 13, C.core);
    g.set(7, 13, 12, C.core); g.set(8, 13, 13, C.core);
    // mossy spots (deterministic)
    const r = M3.rng(77);
    for (let i = 0; i < 7; i++) {
      const sx = 3 + Math.floor(r() * 10), sz = 5 + Math.floor(r() * 14);
      const cc = r() < 0.5 ? C.spot : C.spotD;
      for (let z = sz - 1; z <= sz + 1; z++)
        for (let x = sx - 1; x <= sx + 1; x++) {
          if (Math.abs(x - sx) + Math.abs(z - sz) > 1 && r() < 0.4) continue;
          for (let y = 12; y >= 8; y--)
            if (g.get(x, y, z) && (g.get(x, y, z) - 1 === C.hide)) { g.set(x, y, z, cc); break; }
        }
    }
    // neck + head
    g.box(5, 8, 20, 10, 13, 23, C.hide);
    g.box(4, 12, 21, 11, 17, 25, C.hide);
    g.box(5, 12, 25, 10, 14, 25, C.snout);     // muzzle front
    g.set(6, 13, 25, C.eye); g.set(9, 13, 25, C.eye); // nostrils
    g.set(4, 16, 24, C.eye); g.set(11, 16, 24, C.eye); // sleepy eyes (sides)
    g.set(3, 16, 22, C.hoof); g.set(3, 15, 22, C.hoof); // droopy ears
    g.set(12, 16, 22, C.hoof); g.set(12, 15, 22, C.hoof);
    // tail nub
    g.box(7, 9, 2, 8, 10, 3, C.hide);
    g.mirrorX();
    return { g, colors, s: 0.072, jitter: 0.06 };
  }

  // ============================================================ characters

  /* shared humanoid builder. cfg: {hair, skin, top, sleeve, legs, shoe, cap?}
     pose: 'idle' | 'raised' (right arm thrown up). Faces +z. */
  function humanoid(cfg, pose) {
    const g = Vox.grid(12, 21, 7);
    const C = { skin: 0, hair: 1, top: 2, sleeve: 3, legs: 4, shoe: 5, cap: 6, eye: 7 };
    const colors = pal(cfg.skin, cfg.hair, cfg.top, cfg.sleeve, cfg.legs, cfg.shoe,
                       cfg.cap || '#c83c34', '#2b2118');
    // legs
    for (const x0 of [3, 7]) {
      g.box(x0, 0, 2, x0 + 1, 1, 4, C.shoe);
      g.box(x0, 2, 2, x0 + 1, 6, 4, C.legs);
    }
    // torso
    g.box(2, 7, 2, 9, 12, 4, C.top);
    // arms
    g.box(0, 8, 2, 1, 12, 4, C.sleeve);          // left arm down
    g.box(0, 7, 2, 1, 7, 4, C.skin);             // left hand
    if (pose === 'raised') {
      g.box(10, 12, 2, 11, 18, 4, C.sleeve);     // right arm up
      g.box(10, 19, 2, 11, 19, 4, C.skin);       // fist in the air
    } else {
      g.box(10, 8, 2, 11, 12, 4, C.sleeve);
      g.box(10, 7, 2, 11, 7, 4, C.skin);
    }
    // head
    g.box(3, 13, 1, 8, 17, 5, C.skin);
    g.box(3, 17, 1, 8, 18, 5, C.hair);           // hair top
    g.box(3, 13, 1, 8, 16, 1, C.hair);           // hair back
    g.set(4, 15, 5, C.eye); g.set(7, 15, 5, C.eye);
    if (cfg.capBrim) {
      g.box(3, 16, 1, 8, 17, 5, C.cap);
      g.box(3, 18, 1, 8, 18, 5, C.cap);
      g.box(3, 17, 6, 8, 17, 6, C.cap);          // brim
    } else {
      // spiky hair tufts
      g.set(3, 19, 2, C.hair); g.set(8, 19, 2, C.hair); g.set(5, 19, 3, C.hair);
    }
    return { g, colors, s: 0.058, jitter: 0.05 };
  }

  const hero = () => humanoid({
    skin: '#e8b58c', hair: '#4a3326', top: '#3a9ea0', sleeve: '#2e7d80',
    legs: '#2e3a5c', shoe: '#5e4630', cap: '#c83c34', capBrim: true,
  }, 'idle');
  const rex_idle = () => humanoid({
    skin: '#dba679', hair: '#26211d', top: '#c0392b', sleeve: '#26262c',
    legs: '#33333a', shoe: '#3c3026',
  }, 'idle');
  const rex_raised = () => humanoid({
    skin: '#dba679', hair: '#26211d', top: '#c0392b', sleeve: '#26262c',
    legs: '#33333a', shoe: '#3c3026',
  }, 'raised');

  // ============================================================== scenery

  function tree(variant) {
    const g = Vox.grid(19, 27, 19);
    const C = { bark: 0, leaf: 1, leafL: 2, leafD: 3, leafT: 4 };
    const colors = pal('#5e4128', '#3a7232', '#54904a', '#27521f', '#6fae5b');
    const r = M3.rng(1000 + variant * 131);
    // trunk
    for (let y = 0; y <= 12; y++) {
      const tr = y < 3 ? 2.4 : 1.7;
      for (let z = 7; z <= 11; z++)
        for (let x = 7; x <= 11; x++) {
          const dx = x - 9, dz = z - 9;
          if (dx * dx + dz * dz <= tr * tr) g.set(x, y, z, C.bark);
        }
    }
    // canopy: clustered leaf blobs
    g.ellipsoid(9, 17, 9, 7.6, 6.2, 7.6, C.leaf);
    const blobs = 4 + Math.floor(r() * 2);
    for (let i = 0; i < blobs; i++) {
      const a = r() * Math.PI * 2, rad = 3 + r() * 2.6;
      g.ellipsoid(9 + Math.cos(a) * 4.5, 15 + r() * 7, 9 + Math.sin(a) * 4.5,
                  rad, rad * 0.85, rad, r() < 0.5 ? C.leaf : C.leafL);
    }
    // dark underside + light top sprinkles
    for (let z = 0; z < 19; z++)
      for (let x = 0; x < 19; x++) {
        for (let y = 10; y < 27; y++) {
          const v = g.get(x, y, z);
          if (v && v - 1 !== C.bark) {
            if (!g.get(x, y - 1, z)) g.set(x, y, z, C.leafD);
            break;
          }
        }
        for (let y = 26; y >= 10; y--) {
          const v = g.get(x, y, z);
          if (v && v - 1 !== C.bark) {
            if (r() < 0.4) g.set(x, y, z, C.leafT);
            break;
          }
        }
      }
    return { g, colors, s: 0.16 + variant * 0.012, jitter: 0.1 };
  }

  function rock(variant) {
    const g = Vox.grid(13, 10, 13);
    const colors = pal('#8a8d96', '#6e7178', '#9da0a8');
    const r = M3.rng(500 + variant * 37);
    g.ellipsoid(6, 2, 6, 6.4, 3.4, 6.2, 1);
    g.ellipsoid(6, 4.2, 6, 5, 4.2, 4.6, 0);
    if (variant === 1) { g.ellipsoid(3.4, 5.5, 7.5, 2.8, 3, 2.8, 0); g.ellipsoid(9, 4, 4, 3, 2.6, 3, 2); }
    else g.ellipsoid(8.6, 5.4, 8, 3, 2.8, 3, 2);
    // random chips
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(r() * 13), y = 5 + Math.floor(r() * 5), z = Math.floor(r() * 13);
      g.clear(x, y, z);
    }
    return { g, colors, s: 0.115 + variant * 0.01, jitter: 0.12 };
  }

  function bush() {
    const g = Vox.grid(13, 8, 13);
    const colors = pal('#33632c', '#447a3a', '#23491e');
    const r = M3.rng(901);
    g.ellipsoid(6, 2.4, 6, 6.2, 4, 6.2, 0);
    g.ellipsoid(3.6, 3.4, 7.2, 3.4, 3, 3.4, 1);
    g.ellipsoid(9, 3.6, 4.6, 3.2, 3, 3.2, 1);
    for (let z = 0; z < 13; z++)
      for (let x = 0; x < 13; x++)
        for (let y = 0; y < 8; y++)
          if (g.get(x, y, z) && !g.get(x, y - 1, z) && y > 0) { g.set(x, y, z, 2); break; }
    void r;
    return { g, colors, s: 0.11, jitter: 0.12 };
  }

  function tuft() {
    const g = Vox.grid(5, 6, 5);
    const colors = pal('#4d8a3e', '#5fa44c', '#79bf63');
    const blades = [[1, 3, 1], [3, 4, 2], [2, 5, 3], [4, 2, 0], [0, 3, 3]];
    for (const [x, h, z] of blades)
      for (let y = 0; y < h; y++)
        g.set(x, y, z, y === h - 1 ? 2 : (y > h - 3 ? 1 : 0));
    return { g, colors, s: 0.07, jitter: 0.15 };
  }

  function slab() {
    const g = Vox.grid(12, 5, 9);
    const colors = pal('#7d8089', '#90939b');
    g.box(0, 0, 0, 11, 3, 8, 0);
    g.box(1, 4, 1, 10, 4, 7, 1);
    g.clear(0, 3, 0); g.clear(11, 3, 0); g.clear(0, 3, 8); g.clear(11, 3, 8);
    return { g, colors, s: 0.085, jitter: 0.09 };
  }

  function campfire() {
    const g = Vox.grid(11, 5, 11);
    const colors = pal('#6e7178', '#4a3526', '#2e221c', '#e0731f');
    // stone ring
    for (let z = 0; z < 11; z++)
      for (let x = 0; x < 11; x++) {
        const dx = x - 5, dz = z - 5, d = Math.sqrt(dx * dx + dz * dz);
        if (d >= 3.6 && d <= 4.8) g.set(x, 0, z, 0);
      }
    // crossed logs + charred core + embers
    g.box(2, 1, 4, 8, 1, 5, 1);
    g.box(4, 1, 2, 5, 1, 8, 1);
    g.box(4, 1, 4, 6, 2, 6, 2);
    g.set(5, 2, 5, 3); g.set(4, 2, 5, 3); g.set(5, 2, 4, 3);
    return { g, colors, s: 0.1, jitter: 0.1 };
  }

  // ================================================================ ground

  /* groundMesh(opts): flat disc of 0.5u quads, one flat color per quad
     (blocky pixel ground). Dirt patches are baked into the quad colors —
     no decal geometry, no z-fighting. opts:
     {radius, patches:[{x,z,rx,rz,rot}], seed, vignette} */
  function groundMesh(opts) {
    const radius = opts.radius || 14;
    const step = 0.5;
    const patches = opts.patches || [];
    const grassA = M3.hex('#3f6d3a'), grassB = M3.hex('#487c41'), grassC = M3.hex('#36602f');
    const dirtA = M3.hex('#6b5238'), dirtB = M3.hex('#7a5f40');
    const n = Math.ceil(radius / step);
    const quads = [];
    for (let gz = -n; gz < n; gz++)
      for (let gx = -n; gx < n; gx++) {
        const x0 = gx * step, z0 = gz * step;
        const cx = x0 + step / 2, cz = z0 + step / 2;
        const d = Math.hypot(cx, cz);
        if (d > radius) continue;
        // deterministic hash per quad
        let h = ((gx + 999) * 374761393 + (gz + 999) * 668265263) | 0;
        h = (h ^ (h >> 13)) * 1274126177;
        h = ((h ^ (h >> 16)) >>> 0) / 4294967296;
        let col;
        let dirt = false;
        for (const p of patches) {
          const ca = Math.cos(-(p.rot || 0)), sa = Math.sin(-(p.rot || 0));
          const lx = (cx - p.x) * ca - (cz - p.z) * sa;
          const lz = (cx - p.x) * sa + (cz - p.z) * ca;
          const e = (lx / p.rx) * (lx / p.rx) + (lz / p.rz) * (lz / p.rz);
          if (e < 0.78 || (e < 1.25 && h > (e - 0.78) / 0.47)) { dirt = true; break; }
        }
        if (dirt) col = h < 0.5 ? dirtA : dirtB;
        else col = h < 0.18 ? grassC : (h < 0.62 ? grassA : grassB);
        // darken toward the tree wall for mood
        const vig = 1 - 0.38 * M3.smoothstep((d / radius - 0.55) / 0.45);
        const jit = 0.94 + (h % 0.13);
        quads.push([x0, z0, col[0] * vig * jit, col[1] * vig * jit, col[2] * vig * jit]);
      }
    const data = new Float32Array(quads.length * 6 * 9);
    let o = 0;
    for (const [x0, z0, r, g2, b] of quads) {
      const x1 = x0 + step, z1 = z0 + step;
      const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z0], [x1, z1], [x0, z1]];
      for (const [x, z] of corners) {
        data[o++] = x; data[o++] = 0; data[o++] = z;
        data[o++] = 0; data[o++] = 1; data[o++] = 0;
        data[o++] = r; data[o++] = g2; data[o++] = b;
      }
    }
    return { data, count: quads.length * 6 };
  }

  // ================================================================= cache

  const BUILDERS = {
    pixlit, magmule, hero, rex_idle, rex_raised,
    tree0: () => tree(0), tree1: () => tree(1), tree2: () => tree(2),
    rock0: () => rock(0), rock1: () => rock(1),
    bush, tuft, slab, campfire,
  };
  const cache = {};

  function get(name) {
    if (cache[name]) return cache[name];
    const spec = BUILDERS[name]();
    const m = Vox.mesh(spec.g, spec.colors, spec.s, { jitter: spec.jitter });
    return (cache[name] = {
      data: m.data,
      count: m.count,
      centers: Vox.centers(spec.g, spec.colors, spec.s, 2),
      height: spec.g.sy * spec.s,
    });
  }

  return { get, groundMesh, list: () => Object.keys(BUILDERS) };
})();
