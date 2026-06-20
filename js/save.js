/* Grove Clash — js/save.js
   Save: localStorage-backed save slots + offline, portable "save codes"
   (checksummed Base64 — the file://-safe, zero-dependency "cloud").
   Cloud: an OPTIONAL best-effort over-the-network sync, feature-detected
   and OFF by default, so file://, offline play and the Node tests are all
   unaffected. Pure/Node-safe: every storage/network access is guarded. */
const Save = (() => {
  const PREFIX = 'groveclash.slot';
  const VER = 'GC1';

  function ls() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; }
    catch (e) { return null; } // some browsers throw on access when blocked
  }

  // compact on-disk form (short keys) <-> live save shape
  function compact(s) {
    return {
      v: 1, name: s.name || '', difficulty: s.difficulty || 3,
      party: (s.party || []).map((m) => ({ s: m.species, l: m.level, h: m.hp, e: m.exp || 0 })),
      npcs: s.npcs || {}, bossBeaten: !!s.bossBeaten, bossCaptured: !!s.bossCaptured,
      battles: s.battles || 0,
    };
  }
  function expand(o) {
    return {
      name: o.name || '', difficulty: o.difficulty || 3,
      party: (o.party || []).map((m) => ({
        species: m.s, level: m.l, hp: (m.h === undefined ? null : m.h), exp: m.e || 0,
      })),
      npcs: o.npcs || {}, bossBeaten: !!o.bossBeaten, bossCaptured: !!o.bossCaptured,
      battles: o.battles || 0,
    };
  }

  const serialize = (s) => JSON.stringify(compact(s));

  function write(slot, s) {
    const store = ls(); if (!store) return false;
    try { store.setItem(PREFIX + slot, serialize(s)); return true; } catch (e) { return false; }
  }
  function read(slot) {
    const store = ls(); if (!store) return null;
    try { const v = store.getItem(PREFIX + slot); return v ? expand(JSON.parse(v)) : null; }
    catch (e) { return null; }
  }
  function clear(slot) {
    const store = ls(); if (!store) return;
    try { store.removeItem(PREFIX + slot); } catch (e) { /* ignore */ }
  }
  function summary(slot) {
    const s = read(slot); if (!s) return null;
    return { name: s.name, difficulty: s.difficulty,
             levels: s.party.map((p) => p.level), party: s.party.map((p) => p.species) };
  }

  // ---- offline save codes (pure string work; works everywhere) ----
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64enc(str) {
    let out = '', i = 0;
    while (i < str.length) {
      const c0 = str.charCodeAt(i++);
      const c1 = i < str.length ? str.charCodeAt(i++) : NaN;
      const c2 = i < str.length ? str.charCodeAt(i++) : NaN;
      const e0 = c0 >> 2;
      const e1 = ((c0 & 3) << 4) | (isNaN(c1) ? 0 : c1 >> 4);
      const e2 = isNaN(c1) ? 64 : (((c1 & 15) << 2) | (isNaN(c2) ? 0 : c2 >> 6));
      const e3 = isNaN(c2) ? 64 : (c2 & 63);
      out += B64[e0] + B64[e1] + (e2 === 64 ? '=' : B64[e2]) + (e3 === 64 ? '=' : B64[e3]);
    }
    return out;
  }
  function b64dec(str) {
    let out = '', i = 0;
    str = String(str).replace(/[^A-Za-z0-9+/=]/g, '');
    while (i < str.length) {
      const d0 = B64.indexOf(str[i++]), d1 = B64.indexOf(str[i++]);
      const d2 = B64.indexOf(str[i++]), d3 = B64.indexOf(str[i++]);
      if (d0 < 0 || d1 < 0) break;
      out += String.fromCharCode((d0 << 2) | (d1 >> 4));
      if (d2 !== 64 && d2 >= 0) out += String.fromCharCode(((d1 & 15) << 4) | (d2 >> 2));
      if (d3 !== 64 && d3 >= 0) out += String.fromCharCode(((d2 & 3) << 6) | d3);
    }
    return out;
  }
  function checksum(str) { // Adler-32
    let a = 1, b = 0;
    for (let i = 0; i < str.length; i++) { a = (a + str.charCodeAt(i)) % 65521; b = (b + a) % 65521; }
    return (((b << 16) | a) >>> 0).toString(36);
  }
  function exportCode(s) {
    const json = serialize(s);
    return VER + '.' + checksum(json) + '.' + b64enc(json);
  }
  function importCode(code) {
    try {
      const parts = String(code).trim().split('.');
      if (parts.length !== 3 || parts[0] !== VER) return null;
      const json = b64dec(parts[2]);
      if (checksum(json) !== parts[1]) return null;
      return expand(JSON.parse(json));
    } catch (e) { return null; }
  }

  return { serialize, compact, expand, write, read, clear, summary, exportCode, importCode };
})();

/* Best-effort online sync. OFF until Cloud.configure(endpoint) is called with
   a URL; even then every call is guarded so a missing fetch / blocked network
   / bad response silently degrades to local. No backend ships with the game —
   point it at your own. */
const Cloud = (() => {
  let endpoint = null;
  const configure = (url) => { endpoint = url || null; };
  const available = () => !!endpoint && typeof fetch === 'function';

  function push(code, s) {
    if (!available()) return Promise.resolve(false);
    try {
      return fetch(endpoint + '/' + encodeURIComponent(code),
                   { method: 'PUT', body: Save.exportCode(s) })
        .then((r) => !!(r && r.ok)).catch(() => false);
    } catch (e) { return Promise.resolve(false); }
  }
  function pull(code) {
    if (!available()) return Promise.resolve(null);
    try {
      return fetch(endpoint + '/' + encodeURIComponent(code))
        .then((r) => (r && r.ok ? r.text() : null))
        .then((t) => (t ? Save.importCode(t) : null))
        .catch(() => null);
    } catch (e) { return Promise.resolve(null); }
  }
  return { configure, available, push, pull };
})();
