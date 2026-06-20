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

  // THORNLET — sturdy little seed-bud: mossy bulb body, dark leaf cap,
  // sprout on top. Faces +z. ~0.8u tall.
  function thornlet() {
    const g = Vox.grid(13, 15, 12);
    const C = { body: 0, belly: 1, cap: 2, capD: 3, sprout: 4, eye: 5, foot: 6 };
    const colors = pal('#8cc85a', '#a8d878', '#3e7a32', '#2c5a24', '#57944a', '#2e2620', '#6aa83e');
    g.ellipsoid(6, 5, 5.5, 4.6, 4.6, 4.4, C.body);
    g.ellipsoid(6, 4, 7.5, 2.6, 2.4, 2.2, C.belly);     // belly patch
    // leaf cap dome with drooping tips
    for (let z = 0; z < 12; z++)
      for (let y = 6; y < 15; y++)
        for (let x = 0; x < 13; x++)
          if (g.get(x, y, z) && y >= 8) g.set(x, y, z, C.cap);
    for (const [x, z] of [[1, 5], [11, 5], [6, 1]]) {
      g.set(x, 7, z, C.capD); g.set(x, 6, z, C.capD);
    }
    // sprout
    g.box(6, 10, 5, 6, 12, 5, C.sprout);
    g.set(5, 12, 5, C.sprout); g.set(7, 12, 5, C.sprout);
    g.set(6, 13, 5, C.sprout);
    // feet nubs
    g.box(3, 0, 4, 4, 0, 6, C.foot);
    g.box(8, 0, 4, 9, 0, 6, C.foot);
    g.mirrorX();
    g.set(4, 6, 9, C.eye); g.set(8, 6, 9, C.eye);
    return { g, colors, s: 0.06, jitter: 0.07 };
  }

  // EMBERIK — quick fire fox-rat: ember-orange coat, cream belly,
  // pointy ears, flame-tipped tail. Faces +z. ~0.75u tall.
  function emberik() {
    const g = Vox.grid(13, 14, 17);
    const C = { coat: 0, belly: 1, paw: 2, flameY: 3, flameO: 4, eye: 5, ear: 6 };
    const colors = pal('#e06428', '#f2d8a8', '#6e3a1c', '#f8c838', '#f08030', '#2e2620', '#a8431a');
    // body + chest
    g.ellipsoid(6, 4.5, 7, 3.8, 3.2, 4.8, C.coat);
    g.ellipsoid(6, 4, 10.5, 3, 2.6, 2.6, C.coat);
    for (let z = 8; z <= 13; z++)
      for (let x = 4; x <= 8; x++)
        for (let y = 1; y <= 3; y++)
          if (g.get(x, y, z)) g.set(x, y, z, C.belly);
    // head
    g.box(4, 6, 11, 8, 9, 14, C.coat);
    g.box(5, 6, 14, 7, 7, 14, C.belly);                  // muzzle
    g.set(4, 10, 12, C.ear); g.set(4, 11, 12, C.ear);    // ears (mirrored)
    g.set(5, 10, 12, C.coat);
    // legs
    for (const z of [4, 10]) { g.box(4, 0, z, 5, 1, z + 1, C.paw); g.box(8, 0, z, 9, 0, z + 1, C.paw); }
    // tail rising behind with flame tip
    g.box(6, 4, 1, 6, 6, 2, C.coat);
    g.box(6, 7, 1, 6, 8, 1, C.flameO);
    g.set(6, 9, 1, C.flameY); g.set(5, 8, 1, C.flameY);
    g.mirrorX();
    g.set(5, 8, 14, C.eye); g.set(7, 8, 14, C.eye);
    return { g, colors, s: 0.058, jitter: 0.07 };
  }

  // FROSTKIT — pale tundra fox: frost-white coat, icy-blue accents, glowing
  // frozen tail tip. Faces +z. ~0.8u. (ICE-type; spawns in the tundra biome.)
  function frostkit() {
    const g = Vox.grid(13, 14, 17);
    const C = { coat: 0, belly: 1, paw: 2, glow: 3, eye: 4, ear: 5 };
    const colors = pal('#dfeefb', '#f4fbff', '#8fb6d6', '#7fe0ff', '#2e3640', '#a9cfe8');
    g.ellipsoid(6, 4.5, 7, 3.8, 3.2, 4.8, C.coat);
    g.ellipsoid(6, 4, 10.5, 3, 2.6, 2.6, C.coat);
    for (let z = 8; z <= 13; z++)
      for (let x = 4; x <= 8; x++)
        for (let y = 1; y <= 3; y++) if (g.get(x, y, z)) g.set(x, y, z, C.belly);
    g.box(4, 6, 11, 8, 9, 14, C.coat);
    g.box(5, 6, 14, 7, 7, 14, C.belly);                 // muzzle
    g.set(4, 10, 12, C.ear); g.set(4, 11, 12, C.ear);   // ears (mirrored)
    for (const z of [4, 10]) { g.box(4, 0, z, 5, 1, z + 1, C.paw); g.box(8, 0, z, 9, 0, z + 1, C.paw); }
    g.box(6, 4, 1, 6, 6, 2, C.coat);                    // tail
    g.box(6, 7, 1, 6, 8, 1, C.glow);                    // frosty tail tip
    g.set(6, 9, 1, C.glow);
    g.set(7, 6, 11, C.glow);                            // chest frost (mirrors)
    g.mirrorX();
    g.set(5, 8, 14, C.eye); g.set(7, 8, 14, C.eye);
    return { g, colors, s: 0.058, jitter: 0.06 };
  }

  // SANDREK — desert rock-beast: tan hide, plated rocky spine, glowing magma
  // cracks, blunt horns. Faces +z. ~1.0u long. (FIRE-type; desert biome.)
  function sandrek() {
    const g = Vox.grid(15, 14, 23);
    const C = { hide: 0, belly: 1, rock: 2, rockD: 3, eye: 4, claw: 5, glow: 6 };
    const colors = pal('#c89a54', '#dcb877', '#9a7a4a', '#6f5634', '#2e2620', '#7a5a34', '#ff7a2a');
    for (const z of [4, 15]) { g.box(9, 0, z, 11, 3, z + 2, C.hide); g.box(9, 0, z, 11, 0, z + 2, C.claw); }
    g.box(4, 3, 4, 10, 8, 18, C.hide);
    g.ellipsoid(7, 6, 4, 4, 3, 3, C.hide); g.ellipsoid(7, 6, 18, 4, 3, 3.4, C.hide);
    for (let z = 5; z <= 17; z++) for (let x = 4; x <= 10; x++) if (g.get(x, 3, z)) g.set(x, 3, z, C.belly);
    for (let z = 6; z <= 16; z += 2) { g.set(7, 9, z, C.rock); g.set(7, 10, z, C.rockD); g.set(8, 9, z + 1, C.rock); }
    g.box(5, 5, 18, 9, 9, 21, C.hide);
    g.box(6, 5, 21, 8, 7, 21, C.belly);                 // snout
    g.set(8, 8, 21, C.eye);                             // eye (mirrors)
    g.set(9, 9, 19, C.rock);                            // brow horn (mirrors)
    g.set(10, 5, 9, C.glow); g.set(10, 6, 13, C.glow);  // magma flank cracks
    g.mirrorX();
    return { g, colors, s: 0.07, jitter: 0.07 };
  }

  // Voxball — the capture ball (red top, white bottom, dark band).
  function ball() {
    const g = Vox.grid(7, 7, 7);
    const C = { red: 0, white: 1, band: 2, btn: 3 };
    const colors = pal('#e8453c', '#f2f2f6', '#26262c', '#d8f4f0');
    g.ellipsoid(3, 3, 3, 3.1, 3.1, 3.1, C.white);
    for (let z = 0; z < 7; z++)
      for (let x = 0; x < 7; x++) {
        for (let y = 4; y < 7; y++) if (g.get(x, y, z)) g.set(x, y, z, C.red);
        if (g.get(x, 3, z)) g.set(x, 3, z, C.band);
      }
    g.set(3, 3, 6, C.btn);
    return { g, colors, s: 0.052, jitter: 0.04 };
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

  // ============================================================ dungeon/boss

  // VORNETH (base) — hunched void beast: obsidian body, glowing magenta
  // cracks + core, horns, burning eyes, clawed arms. Faces +z. ~1.7u tall.
  function vorneth() {
    const g = Vox.grid(20, 22, 18);
    const C = { dark: 0, dark2: 1, crack: 2, horn: 3, eye: 4, claw: 5 };
    const colors = pal('#1d1630', '#2b2148', '#c050ff', '#0d0a18', '#ff3a66', '#d0a0ff');
    g.ellipsoid(10, 11, 9, 6, 6.5, 5.2, C.dark);        // torso
    g.ellipsoid(10, 8, 9, 5.4, 4.5, 5, C.dark2);        // belly
    // right shoulder / arm / claw (author x>=10; mirrorX fills the left)
    g.ellipsoid(14.5, 14, 9, 3, 3, 3, C.dark);
    g.box(15, 6, 8, 17, 14, 10, C.dark);
    g.box(16, 4, 8, 17, 5, 11, C.claw);
    g.set(17, 3, 8, C.claw); g.set(17, 3, 11, C.claw);
    g.box(12, 0, 8, 14, 4, 10, C.dark2);                // right leg
    g.box(12, 0, 10, 14, 0, 12, C.claw);
    g.ellipsoid(10, 16, 10, 3.6, 3.2, 3.4, C.dark);     // head
    g.box(9, 15, 12, 11, 17, 13, C.dark2);              // brow
    g.box(13, 18, 9, 13, 20, 9, C.horn); g.set(14, 21, 9, C.horn); // right horn
    for (let y = 5; y < 16; y += 2) g.set(10, y, 14, C.crack);      // spine cracks
    g.set(11, 8, 14, C.crack); g.set(12, 11, 13, C.crack);
    g.ellipsoid(10, 10, 13.6, 1.5, 1.5, 0.7, C.crack);  // chest core
    g.set(12, 16, 13, C.eye);                           // right eye
    g.mirrorX();
    return { g, colors, s: 0.078, jitter: 0.08 };
  }

  // VORNETH-X (awakened) — taller, winged, crowned, brighter cracks and an
  // exposed core. Faces +z. ~2.9u tall (towers on the cliff).
  function vorneth_x() {
    const g = Vox.grid(28, 32, 22);
    const C = { dark: 0, dark2: 1, crack: 2, horn: 3, eye: 4, claw: 5, wing: 6, core: 7 };
    const colors = pal('#231a3c', '#33265a', '#e070ff', '#0d0a18', '#ff5a7a', '#e0b0ff', '#160f28', '#ffffff');
    g.ellipsoid(14, 16, 11, 7, 9, 6, C.dark);           // tall torso
    g.ellipsoid(14, 11, 11, 6, 6, 5.6, C.dark2);
    g.ellipsoid(14, 15, 16, 2.4, 2.6, 1.2, C.core);     // exposed core
    g.ellipsoid(14, 15, 16.4, 1.4, 1.6, 0.8, C.crack);
    // right wing (swept membrane behind the shoulder, z low)
    g.box(19, 13, 4, 26, 27, 5, C.wing);
    g.box(21, 24, 4, 27, 30, 5, C.wing);
    g.box(20, 8, 4, 24, 13, 5, C.wing);
    g.set(22, 20, 5, C.crack); g.set(24, 24, 5, C.crack); g.set(23, 14, 5, C.crack);
    // right arm / claw
    g.ellipsoid(20, 19, 11, 3.4, 3.4, 3.4, C.dark);
    g.box(21, 8, 10, 23, 19, 12, C.dark);
    g.box(22, 5, 10, 23, 7, 13, C.claw);
    g.set(23, 4, 10, C.claw); g.set(23, 4, 13, C.claw);
    g.box(16, 0, 10, 19, 6, 13, C.dark2);               // right leg
    g.box(16, 0, 13, 19, 0, 15, C.claw);
    g.ellipsoid(14, 23, 13, 4, 3.6, 3.8, C.dark);       // head
    g.set(16, 22, 17, C.eye);
    g.box(14, 26, 12, 14, 29, 12, C.horn);              // crown spikes
    g.box(17, 25, 12, 17, 28, 12, C.horn);
    g.box(19, 24, 12, 19, 26, 12, C.horn);
    for (let y = 6; y < 22; y += 2) g.set(14, y, 17, C.crack);
    g.set(16, 12, 17, C.crack); g.set(18, 16, 16, C.crack);
    g.mirrorX();
    return { g, colors, s: 0.09, jitter: 0.09 };
  }

  // rift portal — obsidian archway framing a dark void (overworld doorway)
  function portal() {
    const g = Vox.grid(24, 30, 8);
    const C = { stone: 0, stone2: 1, rim: 2, voidc: 3 };
    const colors = pal('#2a2240', '#1a1530', '#b060ff', '#0a0612');
    const cx = 12, cy = 16, rx = 9, ry = 12;
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 24; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, e = dx * dx + dy * dy;
        if (e <= 1.0 && e >= 0.62) { for (let z = 1; z <= 5; z++) g.set(x, y, z, (x + y) % 2 ? C.stone : C.stone2); }
        else if (e < 0.62 && y >= 3) { g.set(x, y, 3, C.voidc); g.set(x, y, 4, C.voidc); }
        if (e <= 1.0 && e >= 0.62 && ((x * 3 + y * 5) % 7 === 0)) { g.set(x, y, 5, C.rim); g.set(x, y, 1, C.rim); }
      }
    g.box(2, 0, 1, 5, 5, 5, C.stone); g.box(18, 0, 1, 21, 5, 5, C.stone); // base legs
    return { g, colors, s: 0.11, jitter: 0.1 };
  }

  // cliff — tapering obsidian plateau the dungeon boss stands atop (~3.4u)
  function cliff() {
    const g = Vox.grid(26, 28, 26);
    const C = { rock: 0, rock2: 1, crack: 2, top: 3 };
    const colors = pal('#3a2e5c', '#2a2046', '#c878ff', '#48386e');
    const r = M3.rng(303);
    for (let y = 0; y < 26; y++) {
      const rad = 12 - y * 0.16 + (r() - 0.5) * 1.1;
      for (let z = 0; z < 26; z++)
        for (let x = 0; x < 26; x++) {
          const dx = x - 13, dz = z - 13;
          if (dx * dx + dz * dz <= rad * rad) g.set(x, y, z, (x + z + y) % 3 ? C.rock : C.rock2);
        }
    }
    for (let z = 0; z < 26; z++)
      for (let x = 0; x < 26; x++) { const dx = x - 13, dz = z - 13; if (dx * dx + dz * dz <= 104) g.set(x, 26, z, C.top); }
    for (let i = 0; i < 30; i++) {
      const a = r() * Math.PI * 2;
      g.set(Math.round(13 + Math.cos(a) * 11), Math.floor(r() * 24), Math.round(13 + Math.sin(a) * 11), C.crack);
    }
    return { g, colors, s: 0.13, jitter: 0.1 };
  }

  // PROTECTOR (AEGIS) — a sleek guardian beast: steel-blue plated body,
  // glowing cyan crest + maw, four strong legs, swept tail. Faces +z (the
  // player first sees its back shielding him in the wake cutscene). ~1.6u.
  function protector() {
    const g = Vox.grid(18, 20, 26);
    const C = { body: 0, body2: 1, plate: 2, glow: 3, eye: 4, claw: 5, mane: 6 };
    const colors = pal('#2e3c54', '#3c4e6c', '#23304a', '#46e6ff', '#eafcff', '#161d2c', '#2aa6c8');
    // four legs (author the right pair; mirrorX makes the left). front near +z
    for (const z of [5, 18]) {
      g.box(11, 0, z, 13, 5, z + 2, C.body2);
      g.box(11, 0, z, 13, 0, z + 2, C.claw);
    }
    g.ellipsoid(9, 9.5, 13, 5.2, 4.4, 8.0, C.body);   // barrel body
    g.ellipsoid(9, 6.5, 13, 4.4, 3.0, 7.2, C.body2);  // belly
    g.ellipsoid(9, 9.5, 20, 4.0, 4.0, 2.2, C.plate);  // chest plate
    g.ellipsoid(9, 9.6, 21.2, 1.5, 1.7, 1.0, C.glow); // glowing chest core
    // neck + head forward (+z)
    g.box(9, 9, 20, 11, 13, 23, C.body);
    g.ellipsoid(9, 13, 23, 3.0, 2.7, 2.6, C.body);
    g.box(9, 11, 24, 11, 13, 25, C.plate);            // muzzle
    g.ellipsoid(9, 11.4, 25, 1.2, 0.9, 0.7, C.glow);  // glowing maw
    g.set(11, 14, 24, C.eye);                          // right eye -> mirror
    g.set(13, 16, 22, C.claw); g.set(13, 17, 22, C.claw); // right ear
    // glowing crest spikes along the spine
    for (let z = 10; z <= 22; z += 2) { g.set(9, 14, z, C.mane); g.set(9, 15, z, C.glow); }
    // swept tail (-z) with a glowing tip
    g.box(9, 9, 2, 10, 11, 5, C.body);
    g.set(9, 12, 1, C.glow); g.set(9, 11, 1, C.glow);
    g.mirrorX();
    return { g, colors, s: 0.08, jitter: 0.06 };
  }

  // GIANT (COLOSSUS) — a colossal, majestic horned & winged beast with a
  // blazing maw; the tutorial's overwhelming opponent. Faces +z. Built
  // large (~4.7u — it towers; the camera tilts up at it).
  function giant() {
    const g = Vox.grid(30, 36, 24);
    const C = { hide: 0, hide2: 1, plate: 2, horn: 3, eye: 4, claw: 5, wing: 6, maw: 7 };
    const colors = pal('#3a2f5e', '#4a3c74', '#efe6ff', '#cfa63a', '#ffe27a', '#1a1330', '#2c2350', '#ffd24a');
    g.ellipsoid(15, 18, 12, 8, 10, 6.4, C.hide);      // colossal torso
    g.ellipsoid(15, 12, 12, 6.8, 6.6, 6.0, C.hide2);  // belly
    g.ellipsoid(15, 17, 17.4, 3.2, 3.4, 1.4, C.plate);// chest plate
    g.ellipsoid(15, 17, 18.0, 1.9, 2.1, 0.9, C.maw);  // blazing chest maw
    // right wing (swept membrane, low-z behind the shoulder)
    g.box(21, 14, 4, 29, 30, 5, C.wing);
    g.box(23, 27, 4, 29, 33, 5, C.wing);
    g.box(22, 9, 4, 27, 14, 5, C.wing);
    g.set(25, 22, 5, C.maw); g.set(27, 28, 5, C.maw);
    // right arm + claw
    g.ellipsoid(22, 22, 12, 3.8, 3.8, 3.8, C.hide);
    g.box(23, 9, 11, 26, 22, 14, C.hide);
    g.box(24, 5, 11, 26, 8, 15, C.claw);
    g.set(26, 4, 11, C.claw); g.set(26, 4, 15, C.claw);
    g.box(18, 0, 11, 22, 7, 15, C.hide2);             // right leg
    g.box(18, 0, 15, 22, 0, 17, C.claw);
    g.ellipsoid(15, 26, 14, 4.4, 4.0, 4.2, C.hide);   // head
    g.box(15, 24, 17, 17, 26, 18, C.plate);           // jaw / muzzle (right)
    g.ellipsoid(15, 25, 18.2, 1.6, 1.2, 0.8, C.maw);  // glowing maw
    g.set(17, 27, 18, C.eye);                          // right eye -> mirror
    g.box(15, 30, 13, 15, 34, 13, C.horn);            // crown of horns
    g.box(18, 29, 13, 18, 33, 13, C.horn);
    g.box(21, 28, 13, 21, 31, 13, C.horn);
    for (let y = 8; y < 26; y += 2) g.set(15, y, 18, C.maw); // spine glow
    g.mirrorX();
    return { g, colors, s: 0.13, jitter: 0.09 };
  }

  // obsidian spire — jagged dungeon scatter
  function spire() {
    const g = Vox.grid(10, 20, 10);
    const colors = pal('#352a52', '#c878ff');
    for (let y = 0; y < 20; y++) {
      const rad = 4.2 * (1 - y / 22);
      for (let z = 0; z < 10; z++)
        for (let x = 0; x < 10; x++) { const dx = x - 5, dz = z - 5; if (dx * dx + dz * dz <= rad * rad) g.set(x, y, z, 0); }
    }
    for (let y = 2; y < 18; y += 3) g.set(5, y, 8, 1);
    return { g, colors, s: 0.12, jitter: 0.12 };
  }

  // cactus — desert saguaro: green column with a raised arm and a crown bud
  function cactus() {
    const g = Vox.grid(11, 18, 7);
    const C = { body: 0, dark: 1, flower: 2 };
    const colors = pal('#3e8e4a', '#2f6f38', '#e86fa4');
    g.box(4, 0, 2, 6, 15, 4, C.body);          // trunk
    g.box(7, 7, 3, 8, 8, 3, C.body);           // right arm elbow
    g.box(8, 8, 3, 8, 11, 3, C.body);          // right arm up
    g.set(5, 16, 3, C.flower); g.set(5, 17, 3, C.flower); // crown bud
    for (let y = 2; y < 15; y += 3) g.set(7, y, 3, C.dark); // ribs (mirror -> left)
    g.mirrorX();
    return { g, colors, s: 0.085, jitter: 0.07 };
  }

  // ice spike — pale frozen crystal shard for the tundra biome
  function ice_spike() {
    const g = Vox.grid(9, 20, 9);
    const colors = pal('#cfe6f4', '#9fc4e0', '#eef7ff');
    for (let y = 0; y < 20; y++) {
      const rad = 3.6 * (1 - y / 22);
      for (let z = 0; z < 9; z++)
        for (let x = 0; x < 9; x++) { const dx = x - 4, dz = z - 4; if (dx * dx + dz * dz <= rad * rad) g.set(x, y, z, (x + z + y) % 4 ? 0 : 1); }
    }
    for (let y = 3; y < 17; y += 4) g.set(4, y, 7, 2); // glints
    return { g, colors, s: 0.12, jitter: 0.1 };
  }

  const npc_hiker = () => humanoid({ skin: '#d8a878', hair: '#3a2a1a', top: '#6b8e3a', sleeve: '#4a6328', legs: '#5a4a32', shoe: '#3a2e20', cap: '#7a5a30', capBrim: true }, 'idle');
  const npc_lass  = () => humanoid({ skin: '#ecc0a0', hair: '#d86a30', top: '#e87aa0', sleeve: '#c85a86', legs: '#9a5ab0', shoe: '#6a3a80' }, 'idle');
  const npc_ace   = () => humanoid({ skin: '#caa078', hair: '#1a2a4a', top: '#2a3a6a', sleeve: '#1c2a52', legs: '#23304a', shoe: '#161c30', cap: '#2a3a6a', capBrim: true }, 'idle');

  // ================================================================ ground

  /* groundMesh(opts): flat disc of 0.5u quads, one flat color per quad
     (blocky pixel ground). Dirt patches are baked into the quad colors —
     no decal geometry, no z-fighting. opts:
     {radius, patches:[{x,z,rx,rz,rot}], seed, vignette} */
  function groundMesh(opts) {
    const radius = opts.radius || 14;
    const step = 0.5;
    const patches = opts.patches || [];
    const dark = !!opts.dark; // dungeon obsidian floor vs. grove grass
    const grassA = M3.hex(dark ? '#2e2450' : '#3f6d3a'), grassB = M3.hex(dark ? '#392c60' : '#487c41'), grassC = M3.hex(dark ? '#241c40' : '#36602f');
    const dirtA = M3.hex(dark ? '#46386c' : '#6b5238'), dirtB = M3.hex(dark ? '#544284' : '#7a5f40');
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
        const vig = 1 - (dark ? 0.18 : 0.38) * M3.smoothstep((d / radius - 0.55) / 0.45);
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
    pixlit, magmule, thornlet, emberik, frostkit, sandrek, ball, hero, rex_idle, rex_raised,
    vorneth, vorneth_x, protector, giant, portal, cliff, spire, cactus, ice_spike,
    npc_hiker, npc_lass, npc_ace,
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
