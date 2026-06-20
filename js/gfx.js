/* Grove Clash — js/gfx.js
   Gfx: minimal WebGL1 renderer. One shader for everything:
   lambert directional + ambient, distance fog, white hit-flash mix,
   tint, alpha, unlit toggle. Geometry is interleaved [pos3,nrm3,col3]. */
const Gfx = (() => {
  let gl = null, prog = null, U = {}, dynBuf = null;
  let canvas = null;

  const VS = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec3 aCol;
uniform mat4 uModel, uView, uProj;
uniform vec3 uLightDir, uLightCol, uAmbient, uTint;
uniform vec3 uPointPos, uPointCol;
uniform float uFlash, uUnlit, uPointInt, uPointRad;
varying vec3 vCol;
varying float vDist;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec4 vp = uView * wp;
  gl_Position = uProj * vp;
  vec3 n = normalize((uModel * vec4(aNrm, 0.0)).xyz);
  float lam = max(dot(n, -uLightDir), 0.0);
  // dynamic point light (attacks/effects pulse this into the scene) — smooth
  // inverse-square falloff + half-lambert wrap for soft, realistic spill
  vec3 toL = uPointPos - wp.xyz;
  float d2 = dot(toL, toL);
  float att = min(1.5, uPointRad * uPointRad / (d2 + uPointRad * uPointRad * 0.35 + 0.0001));
  float plam = (dot(n, normalize(toL)) * 0.5 + 0.5) * att * uPointInt;
  vec3 lit = aCol * (uAmbient + uLightCol * lam) + uPointCol * plam * aCol;
  vec3 c = mix(lit, aCol, uUnlit);
  vCol = mix(c, vec3(1.0), uFlash) * uTint;
  vDist = length(vp.xyz);
}`;

  const FS = `
precision mediump float;
varying vec3 vCol;
varying float vDist;
uniform vec3 uFogCol;
uniform float uFogNear, uFogFar, uAlpha;
void main() {
  float f = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(vCol, uFogCol, f), uAlpha);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }

  function init(cv) {
    canvas = cv;
    gl = cv.getContext('webgl', { antialias: false, alpha: false }) ||
         cv.getContext('experimental-webgl', { antialias: false, alpha: false });
    if (!gl) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.bindAttribLocation(prog, 1, 'aNrm');
    gl.bindAttribLocation(prog, 2, 'aCol');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for (const u of ['uModel', 'uView', 'uProj', 'uLightDir', 'uLightCol', 'uAmbient',
                     'uTint', 'uFlash', 'uUnlit', 'uFogCol', 'uFogNear', 'uFogFar', 'uAlpha',
                     'uPointPos', 'uPointCol', 'uPointInt', 'uPointRad'])
      U[u] = gl.getUniformLocation(prog, u);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    dynBuf = gl.createBuffer();
    return true;
  }

  function upload(mesh) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
    return { buf, count: mesh.count };
  }

  // free a static buffer (used by the streaming overworld to drop far chunks)
  function dispose(handle) {
    if (handle && handle.buf && gl) gl.deleteBuffer(handle.buf);
  }

  function bindAttribs() {
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  }

  const IDENT = (() => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; })();

  /* env: {sky:[r,g,b], fog:[r,g,b], fogNear, fogFar, lightDir:[3] (normalized,
     direction light travels), lightCol:[3], ambient:[3]} */
  function begin(view, proj, env) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(env.sky[0], env.sky[1], env.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.uView, false, view);
    gl.uniformMatrix4fv(U.uProj, false, proj);
    gl.uniform3fv(U.uLightDir, env.lightDir);
    gl.uniform3fv(U.uLightCol, env.lightCol);
    gl.uniform3fv(U.uAmbient, env.ambient);
    gl.uniform3fv(U.uFogCol, env.fog);
    gl.uniform1f(U.uFogNear, env.fogNear);
    gl.uniform1f(U.uFogFar, env.fogFar);
    const pt = env.point; // dynamic point light (null/absent = off)
    gl.uniform3fv(U.uPointPos, pt ? pt.pos : [0, 1000, 0]);
    gl.uniform3fv(U.uPointCol, pt ? pt.color : [0, 0, 0]);
    gl.uniform1f(U.uPointInt, pt ? pt.intensity : 0);
    gl.uniform1f(U.uPointRad, pt && pt.rad ? pt.rad : 1);
  }

  function draw(handle, model, opts) {
    if (!handle || !handle.count) return;
    opts = opts || {};
    gl.uniformMatrix4fv(U.uModel, false, model || IDENT);
    gl.uniform1f(U.uFlash, opts.flash || 0);
    gl.uniform1f(U.uUnlit, opts.unlit ? 1 : 0);
    gl.uniform1f(U.uAlpha, opts.alpha !== undefined ? opts.alpha : 1);
    gl.uniform3fv(U.uTint, opts.tint || [1, 1, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, handle.buf);
    bindAttribs();
    gl.drawArrays(gl.TRIANGLES, 0, handle.count);
  }

  // particles: rebuilt every frame, identity transform, unlit
  function drawDynamic(data, count) {
    if (!count) return;
    gl.uniformMatrix4fv(U.uModel, false, IDENT);
    gl.uniform1f(U.uFlash, 0);
    gl.uniform1f(U.uUnlit, 1);
    gl.uniform1f(U.uAlpha, 1);
    gl.uniform3fv(U.uTint, [1, 1, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 9), gl.STREAM_DRAW);
    bindAttribs();
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }

  // largest square viewport the GPU will allow (caps the 8K target)
  function maxDim() {
    try { const d = gl.getParameter(gl.MAX_VIEWPORT_DIMS); return Math.min(d[0], d[1]) || 4096; }
    catch (e) { return 4096; }
  }

  return { init, upload, dispose, begin, draw, drawDynamic, maxDim, ok: () => !!gl };
})();
