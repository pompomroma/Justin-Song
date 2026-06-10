/* Grove Clash — js/voxel.js
   Vox: voxel grid builder + naive hidden-face-culling mesher.
   Produces interleaved Float32Array [pos3, nrm3, col3] (stride 9) in
   world units, origin at the model's bottom-center. Pure (Node-safe). */
const Vox = (() => {

  function grid(sx, sy, sz) {
    const d = new Uint8Array(sx * sy * sz); // 0 = empty, else paletteIndex+1
    const idx = (x, y, z) => (z * sy + y) * sx + x;
    const g = {
      sx, sy, sz, d,
      get(x, y, z) {
        if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return 0;
        return d[idx(x, y, z)];
      },
      set(x, y, z, p) {
        if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return;
        d[idx(x, y, z)] = p + 1;
      },
      clear(x, y, z) {
        if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return;
        d[idx(x, y, z)] = 0;
      },
      box(x0, y0, z0, x1, y1, z1, p) {
        for (let z = z0; z <= z1; z++)
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) g.set(x, y, z, p);
      },
      // filled ellipsoid centered at (cx,cy,cz) with radii (rx,ry,rz)
      ellipsoid(cx, cy, cz, rx, ry, rz, p) {
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
          for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
              const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
              if (dx * dx + dy * dy + dz * dz <= 1) g.set(x, y, z, p);
            }
      },
      // copy +x half onto -x half (build one side, mirror the other)
      mirrorX() {
        const h = Math.floor(sx / 2);
        for (let z = 0; z < sz; z++)
          for (let y = 0; y < sy; y++)
            for (let x = 0; x < h; x++)
              d[idx(x, y, z)] = d[idx(sx - 1 - x, y, z)];
      },
      count() {
        let n = 0;
        for (let i = 0; i < d.length; i++) if (d[i]) n++;
        return n;
      },
    };
    return g;
  }

  // face table: [nx,ny,nz, 4 corner offsets (quad), brightness]
  const FACES = [
    { n: [0, 1, 0],  c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], b: 1.0 },   // top
    { n: [0, -1, 0], c: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]], b: 0.42 },  // bottom
    { n: [1, 0, 0],  c: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], b: 0.74 },  // +x
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], b: 0.66 },  // -x
    { n: [0, 0, 1],  c: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], b: 0.86 },  // +z (front)
    { n: [0, 0, -1], c: [[0, 0, -0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], b: 0.58 }, // -z
  ];
  const NEIGHBOR = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

  /* mesh(g, palette, voxScale, opts)
     palette: array of [r,g,b] (0..1). opts.jitter: per-voxel value jitter. */
  function mesh(g, palette, voxScale, opts) {
    opts = opts || {};
    const jitter = opts.jitter !== undefined ? opts.jitter : 0.06;
    const ox = -g.sx / 2, oy = 0, oz = -g.sz / 2;

    // count faces first
    let faces = 0;
    for (let z = 0; z < g.sz; z++)
      for (let y = 0; y < g.sy; y++)
        for (let x = 0; x < g.sx; x++) {
          if (!g.get(x, y, z)) continue;
          for (let f = 0; f < 6; f++) {
            const nb = NEIGHBOR[f];
            if (!g.get(x + nb[0], y + nb[1], z + nb[2])) faces++;
          }
        }

    const data = new Float32Array(faces * 6 * 9);
    let o = 0;
    for (let z = 0; z < g.sz; z++)
      for (let y = 0; y < g.sy; y++)
        for (let x = 0; x < g.sx; x++) {
          const v = g.get(x, y, z);
          if (!v) continue;
          const col = palette[v - 1] || [1, 0, 1];
          // deterministic per-voxel brightness jitter (cheap texture)
          let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
          h = (h ^ (h >> 13)) * 1274126177;
          h = (h ^ (h >> 16)) >>> 0;
          const j = 1 + ((h / 4294967296) - 0.5) * 2 * jitter;
          for (let f = 0; f < 6; f++) {
            const nb = NEIGHBOR[f];
            if (g.get(x + nb[0], y + nb[1], z + nb[2])) continue;
            const F = FACES[f];
            const br = F.b * j;
            const r = Math.min(1, col[0] * br), gg = Math.min(1, col[1] * br), b = Math.min(1, col[2] * br);
            const q = F.c;
            const tri = [q[0], q[1], q[2], q[0], q[2], q[3]];
            for (let t = 0; t < 6; t++) {
              const c = tri[t];
              data[o++] = (x + c[0] + ox) * voxScale;
              data[o++] = (y + c[1] + oy) * voxScale;
              data[o++] = (z + c[2] + oz) * voxScale;
              data[o++] = F.n[0]; data[o++] = F.n[1]; data[o++] = F.n[2];
              data[o++] = r; data[o++] = gg; data[o++] = b;
            }
          }
        }
    return { data, count: faces * 6 };
  }

  /* centers(g, palette, voxScale, step) -> [{p:[x,y,z], c:[r,g,b]}]
     model-local voxel centers; used for the faint dissolve effect.
     step skips voxels (2 = every other) to bound particle counts. */
  function centers(g, palette, voxScale, step) {
    step = step || 2;
    const out = [];
    const ox = -g.sx / 2, oz = -g.sz / 2;
    let i = 0;
    for (let z = 0; z < g.sz; z++)
      for (let y = 0; y < g.sy; y++)
        for (let x = 0; x < g.sx; x++) {
          const v = g.get(x, y, z);
          if (!v) continue;
          if ((i++ % step) !== 0) continue;
          out.push({
            p: [(x + 0.5 + ox) * voxScale, (y + 0.5) * voxScale, (z + 0.5 + oz) * voxScale],
            c: palette[v - 1] || [1, 0, 1],
          });
        }
    return out;
  }

  return { grid, mesh, centers };
})();
