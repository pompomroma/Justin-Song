/* Grove Clash — js/biome.js
   Biome: a Minecraft-style biome field for the infinite overworld. Two
   low-frequency fBm value-noise channels (temperature + moisture) classify
   the world into large, coherent regions, each with its own ground palette,
   scenery scatter, atmosphere and monster pool. Pure (Node-safe) so the smoke
   test can assert determinism and classification. */
const Biome = (() => {

  const SEED = 0x5eed;
  const SCALE = 88;          // world units per noise lattice cell (big regions)

  function h01(x, z, s) {     // hashed lattice value in [0,1)
    let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 2246822519) + SEED) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  function vnoise(x, z, s) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = smooth(xf), w = smooth(zf);
    const a = h01(xi, zi, s), b = h01(xi + 1, zi, s), c = h01(xi, zi + 1, s), d = h01(xi + 1, zi + 1, s);
    return (a * (1 - u) + b * u) * (1 - w) + (c * (1 - u) + d * u) * w;
  }
  // two octaves -> natural, wavy biome borders
  const fbm = (x, z, s) => vnoise(x, z, s) * 0.65 + vnoise(x * 2.1 + 5.2, z * 2.1 + 1.3, s + 7) * 0.35;

  function climate(wx, wz) {
    return { temp: fbm(wx / SCALE, wz / SCALE, 1), moist: fbm(wx / SCALE + 40, wz / SCALE - 70, 2) };
  }
  function classify(temp, moist) {
    if (temp < 0.32) return 'ICE';
    if (temp > 0.68 && moist < 0.45) return 'DESERT';
    if (moist > 0.60) return 'FOREST';
    if (temp > 0.58) return 'SAVANNA';
    return 'PRAIRIE';
  }

  const hex = M3.hex;
  // ground: {grass:[3 colors], dirt:[2]}; scatter: ordered [type, weight] (the
  // leftover weight is open ground); tint recolors scenery props; env tints the
  // sky/fog/light when the player stands in the biome; monsters: spawn pool.
  const BIOMES = {
    FOREST: {
      id: 'FOREST', name: 'WHISPER FOREST',
      ground: { grass: [hex('#3f6d3a'), hex('#487c41'), hex('#36602f')], dirt: [hex('#6b5238'), hex('#7a5f40')] },
      scatter: [['tree', 0.40], ['rock', 0.10], ['bush', 0.12], ['tuft', 0.33]],
      tint: [1, 1, 1],
      monsters: ['MOSSOX', 'HOOTLE', 'THORNLET', 'PIXLIT'],
      env: { sky: '#152238', fog: '#16261e', fogNear: 12, fogFar: 30, light: [0.82, 0.72, 0.58], ambient: [0.46, 0.52, 0.48] },
    },
    PRAIRIE: {
      id: 'PRAIRIE', name: 'OPEN PRAIRIE',
      ground: { grass: [hex('#6a8e3a'), hex('#7a9a44'), hex('#5e8232')], dirt: [hex('#8a6f44'), hex('#9a7d4e')] },
      scatter: [['tree', 0.06], ['rock', 0.07], ['bush', 0.05], ['tuft', 0.55]],
      tint: [1.05, 1.05, 0.85],
      monsters: ['BUNDER', 'LARKIT', 'PIXLIT', 'THORNLET'],
      env: { sky: '#243650', fog: '#2c4030', fogNear: 14, fogFar: 34, light: [0.92, 0.86, 0.66], ambient: [0.54, 0.58, 0.5] },
    },
    DESERT: {
      id: 'DESERT', name: 'SUNFALL DESERT',
      ground: { grass: [hex('#d8c078'), hex('#cab062'), hex('#e0c884')], dirt: [hex('#b89a4a'), hex('#a88a3e')] },
      scatter: [['cactus', 0.13], ['rock', 0.10], ['bush', 0.05], ['tuft', 0.05]],
      tint: [1.15, 1.0, 0.7],
      monsters: ['SANDREK', 'SCARABEX', 'COBRELL', 'MAGMULE'],
      env: { sky: '#43381f', fog: '#6a5a3a', fogNear: 14, fogFar: 38, light: [1.0, 0.86, 0.6], ambient: [0.6, 0.54, 0.44] },
    },
    ICE: {
      id: 'ICE', name: 'FROST TUNDRA',
      ground: { grass: [hex('#dfe8f0'), hex('#cfdae8'), hex('#c2d0e2')], dirt: [hex('#aebfd4'), hex('#9fb2c8')] },
      scatter: [['ice_spike', 0.12], ['rock', 0.09], ['tuft', 0.05]],
      tint: [0.85, 0.95, 1.15],
      monsters: ['FROSTKIT', 'GLACIMP', 'PENGUL', 'PIXLIT'],
      env: { sky: '#5a6a86', fog: '#a6b6c8', fogNear: 13, fogFar: 32, light: [0.85, 0.9, 1.0], ambient: [0.6, 0.64, 0.7] },
    },
    SAVANNA: {
      id: 'SAVANNA', name: 'GOLDEN SAVANNA',
      ground: { grass: [hex('#9a9440'), hex('#8a8636'), hex('#a8a04e')], dirt: [hex('#8a6f3a'), hex('#7a6332')] },
      scatter: [['tree', 0.10], ['rock', 0.12], ['bush', 0.04], ['tuft', 0.42]],
      tint: [1.2, 1.05, 0.6],
      monsters: ['MANELEO', 'GRASSGAZ', 'MAGMULE', 'EMBERIK'],
      env: { sky: '#43402c', fog: '#5a4e2e', fogNear: 14, fogFar: 36, light: [1.0, 0.9, 0.62], ambient: [0.58, 0.56, 0.46] },
    },
  };

  // biome at a world position. The origin neighborhood is forced FOREST so the
  // spawn campfire / starter clearing always reads as a friendly grove.
  function at(wx, wz) {
    if (wx * wx + wz * wz < 42 * 42) return BIOMES.FOREST;
    const c = climate(wx, wz);
    return BIOMES[classify(c.temp, c.moist)];
  }

  return { at, climate, classify, BIOMES };
})();
