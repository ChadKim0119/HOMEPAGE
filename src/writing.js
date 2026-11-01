// Writes a calligraphy image back onto the page, one brush movement at a
// time. `analyzeInk` (strokes.js) tells every ink pixel which stroke it
// belongs to and how far along that stroke it lies; from that and a tempo we
// build a "time map" — the moment each pixel is touched by the brush. A WebGL
// shader then reveals the original ink as the brush front sweeps across the
// full width of a stroke in a single pass, the way the After Effects
// "mask + stroke, reveal original image" write-on technique works, but
// without hand-drawn masks. The last frame is always the original artwork.

export const WRITING_EFFECTS = ['brush', 'pen', 'bleed', 'dry', 'light'];

const easeInOutCubic = (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const clamp = (v) => Math.min(1, Math.max(0, v));

// tempo: stroke speed multiplier; pauses (ms): within a character, between
// characters, between lines; ease: brush speed along a stroke (press → draw → lift).
const STYLES = {
  brush: { id: 0, tempo: 1, pauses: [190, 380, 560], ease: (t) => .72 * easeInOutCubic(t) + .28 * t, settle: 450 },
  pen: { id: 1, tempo: 1.4, pauses: [80, 190, 300], ease: (t) => .3 * easeInOutSine(t) + .7 * t, settle: 0 },
  bleed: { id: 2, tempo: .9, pauses: [220, 400, 580], ease: (t) => .7 * easeInOutCubic(t) + .3 * t, settle: 1500 },
  dry: { id: 3, tempo: 1.2, pauses: [140, 320, 470], ease: (t) => 1 - (1 - t) ** 2.2, settle: 1100 },
  light: { id: 4, tempo: 1.05, pauses: [130, 280, 440], ease: easeInOutSine, settle: 900 },
};

// Start time and duration of every stroke. Strokes that continue the same
// pen movement (joined-up script) follow without a lift.
function timeline(strokes, style, target) {
  const total = strokes.reduce((sum, s) => sum + s.length, 0) || 1;
  const writing = Math.min(5600, Math.max(2400, 1200 + strokes.length * 80)) * target;
  const gap = (s, prev) => (s.flow ? 0 : style.pauses[prev.line !== s.line ? 2 : prev.char !== s.char ? 1 : 0]);
  const pauseTotal = strokes.reduce((sum, s, i) => sum + (i ? gap(s, strokes[i - 1]) : 0), 0);
  const pauseScale = Math.min(1, 2400 / (pauseTotal || 1)) * target;
  let t = 150 * target;
  return strokes.map((s, i) => {
    if (i) t += gap(s, strokes[i - 1]) * pauseScale;
    const duration = Math.max(170 * target, (s.length / total) * writing / style.tempo);
    const item = { start: t, end: t + duration, duration, linear: s.flow || strokes[i + 1]?.flow };
    t += duration;
    return item;
  });
}

// Inverse of an easing curve as a lookup table: arc fraction → time fraction.
function inverseEase(ease) {
  const N = 512;
  const forward = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) forward[i] = ease(i / N);
  const inv = new Float32Array(N + 1);
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    while (j < N && forward[j + 1] < u) j++;
    const a = forward[j], b = forward[Math.min(N, j + 1)];
    inv[i] = (j + (b > a ? clamp((u - a) / (b - a)) : 0)) / N;
  }
  return (u) => { const x = clamp(u) * N, i = Math.floor(x); return i >= N ? inv[N] : inv[i] + (inv[i + 1] - inv[i]) * (x - i); };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInk;
uniform sampler2D uTimeMap;
uniform sampler2D uDirMap;
uniform int uEffect;
uniform float uTime, uSettle, uDark, uBlurLod, uTipOn, uTipR, uAvg;
uniform vec2 uInkSize, uTip;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0., a = .5; for (int k = 0; k < 4; k++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return v; }

void main() {
  vec4 ink = texture(uInk, vUv);
  float T = texture(uTimeMap, vUv).r;
  float age = uTime - T;
  vec2 px = vUv * uInkSize;
  vec3 col = uDark > .5 ? vec3(.93) : ink.rgb;
  vec3 c = col;
  float a = 0.;
  if (uEffect == 0) {
    // Brush: a soft, fibrous front; wet ink is a little darker until it sets.
    // Low-frequency raggedness only at the front: a body of ink never dissolves in specks.
    float j = (fbm(px / (uAvg * 1.2)) - .5) * 90.;
    a = ink.a * smoothstep(0., 120., age + j);
    float wet = 1. - smoothstep(0., uSettle, age);
    c = uDark > .5 ? col : col * (1. - .3 * wet);
  } else if (uEffect == 1) {
    // Pen: a crisp front that follows the nib.
    a = ink.a * smoothstep(0., 26., age);
  } else if (uEffect == 2) {
    // Ink bleed: a wet bloom spreads ahead, then the line sharpens as the paper drinks it.
    float j = (fbm(px / (uAvg * .9)) - .5) * 150.;
    float sharp = smoothstep(160., 340., age + j);
    float soft = textureLod(uInk, vUv, uBlurLod).a;
    float wet = smoothstep(0., 140., age + j) * (1. - smoothstep(0., uSettle, age - 220.));
    float halo = min(1., soft * 1.7) * wet * .55;
    a = max(ink.a * sharp, halo);
    vec3 wash = uDark > .5 ? vec3(.78) : mix(col, vec3(.42, .40, .37), .4);
    c = mix(wash, col, clamp(ink.a * sharp / max(a, 1e-4), 0., 1.));
  } else if (uEffect == 3) {
    // Dry brush: bristle streaks along the stroke appear first, then fill.
    float ang = texture(uDirMap, vUv).r;
    vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * px;
    float n = fbm(vec2(q.x / (uAvg * 2.4), q.y / (uAvg * .085)));
    float delay = pow(clamp((n - .28) / .5, 0., 1.), 1.25) * uSettle;
    a = ink.a * smoothstep(0., 70., age - delay);
  } else {
    // Light trace: freshly written ink glows gold, then cools to ink.
    a = ink.a * smoothstep(0., 40., age);
    float glow = step(0., age) * (1. - smoothstep(0., uSettle, age));
    c = mix(col, vec3(1., .80, .42), glow * .85);
  }
  vec3 rgb = c * a;
  if (uTipOn > 0.) {
    float d = distance(px, uTip);
    if (uEffect == 1) {
      float nib = uTipOn * (1. - smoothstep(uTipR - .8, uTipR + .8, d));
      vec3 nc = uDark > .5 ? vec3(.93) : vec3(.10, .098, .082);
      rgb = mix(rgb, nc, nib); a = max(a, nib);
    } else if (uEffect == 4) {
      float g = uTipOn * exp(-d * d / (2. * uTipR * uTipR));
      float core = uTipOn * exp(-d * d / (.18 * uTipR * uTipR));
      rgb = rgb * (1. - g * .45) + vec3(1., .78, .38) * g * .85 + vec3(1., .97, .9) * core;
      a = max(a, max(g * .75, core));
    }
  }
  outColor = vec4(rgb, a);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export class Writer {
  constructor(analysis, effect, { href, loop = false, target = 1, reduced = false, dark = false, onDone } = {}) {
    this.analysis = analysis;
    this.effect = WRITING_EFFECTS.includes(effect) ? effect : 'brush';
    this.style = STYLES[this.effect];
    this.loop = loop;
    this.reduced = reduced;
    this.dark = dark;
    this.onDone = onDone;
    this.items = timeline(analysis.strokes, this.style, target);
    const last = this.items.length ? this.items[this.items.length - 1].end : 0;
    this.finishAt = last + 80;
    this.doneAt = this.finishAt + 500 + this.style.settle;
    this.element = document.createElement('canvas');
    this.element.className = 'writing-canvas';
    this.element.setAttribute('aria-hidden', 'true');
    this.frame = this.frame.bind(this);
    this.ready = loadImage(href).then((image) => this.setup(image));
  }

  // When each map pixel is touched by the brush, for this effect's tempo.
  timeMap() {
    const { owner, arc } = this.analysis.map;
    const inv = inverseEase(this.style.ease);
    const T = new Float32Array(owner.length);
    for (let p = 0; p < owner.length; p++) {
      const o = owner[p];
      if (o === -2) { T[p] = 1e7; continue; }
      if (o === -1) { T[p] = this.finishAt; continue; } // specks and gaps: with the last stroke
      const it = this.items[o];
      T[p] = it.start + it.duration * (it.linear ? arc[p] : inv(arc[p]));
    }
    return T;
  }

  setup(image) {
    const { map } = this.analysis;
    this.T = this.timeMap();
    const gl = this.element.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) { this.setupCpu(image); return; }
    try {
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const texture = (unit, setup) => {
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        setup();
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      };
      texture(0, () => {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      });
      const floatTex = (unit, data) => texture(unit, () => {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, map.width, map.height, 0, gl.RED, gl.FLOAT, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      });
      floatTex(1, this.T);
      floatTex(2, map.dir);
      const u = (name) => gl.getUniformLocation(program, name);
      this.u = Object.fromEntries(['uTime', 'uSettle', 'uDark', 'uBlurLod', 'uTipOn', 'uTipR', 'uAvg', 'uInkSize', 'uTip', 'uEffect', 'uInk', 'uTimeMap', 'uDirMap'].map((n) => [n, u(n)]));
      gl.uniform1i(this.u.uInk, 0);
      gl.uniform1i(this.u.uTimeMap, 1);
      gl.uniform1i(this.u.uDirMap, 2);
      gl.uniform1i(this.u.uEffect, this.style.id);
      const avg = this.analysis.strokeWidth || 10;
      gl.uniform1f(this.u.uSettle, this.style.settle || 1);
      gl.uniform1f(this.u.uDark, this.dark ? 1 : 0);
      gl.uniform1f(this.u.uAvg, avg);
      gl.uniform1f(this.u.uBlurLod, Math.max(0, Math.log2(Math.max(1, avg * .55))));
      gl.uniform1f(this.u.uTipR, this.effect === 'pen' ? Math.max(1.6, avg * .2) : avg * 1.5);
      gl.uniform2f(this.u.uInkSize, this.analysis.width, this.analysis.height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.gl = gl;
    } catch (error) {
      console.warn('Writing effect falls back to 2D:', error);
      this.setupCpu(image);
    }
  }

  // Without WebGL2: the same time map, revealed on a 2D canvas.
  setupCpu(image) {
    const { map } = this.analysis;
    const canvas = document.createElement('canvas');
    canvas.width = map.width; canvas.height = map.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, map.width, map.height);
    this.cpuInk = ctx.getImageData(0, 0, map.width, map.height);
    this.cpuOut = new ImageData(map.width, map.height);
    this.element.width = map.width; this.element.height = map.height;
    this.cpu = this.element.getContext('2d');
  }

  size(width, height) {
    const ratio = this.analysis.width / this.analysis.height;
    let w = width, h = width / ratio;
    if (h > height) { h = height; w = height * ratio; }
    this.element.style.width = `${w}px`;
    this.element.style.height = `${h}px`;
    if (this.gl) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.element.width = Math.max(1, Math.round(Math.min(w * dpr, this.analysis.width)));
      this.element.height = Math.max(1, Math.round(Math.min(h * dpr, this.analysis.height)));
    }
  }

  play() {
    this.stop();
    if (this.reduced) { this.render(this.doneAt); this.onDone?.(); return; }
    this.started = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  destroy() {
    this.stop();
    this.destroyed = true;
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }

  get playing() { return Boolean(this.raf); }

  frame(now) {
    if (this.destroyed) return;
    let t = now - this.started;
    if (this.loop && t > this.doneAt + 900) { this.started = now; t = 0; }
    try { this.render(t); } catch (error) { console.warn('Writing frame failed:', error); }
    if (!this.loop && t >= this.doneAt) { this.raf = 0; this.onDone?.(); return; }
    this.raf = requestAnimationFrame(this.frame);
  }

  // Position of the brush tip (image pixels) for the effects that show one.
  tip(t) {
    if (this.effect !== 'pen' && this.effect !== 'light') return null;
    const i = this.items.findIndex((it) => t >= it.start && t < it.end + 120);
    if (i < 0) return null;
    const it = this.items[i], s = this.analysis.strokes[i];
    const raw = clamp((t - it.start) / it.duration);
    const fade = t > it.end ? 1 - (t - it.end) / 120 : 1;
    if (s.points.length < 2) return { x: s.points[0][0], y: s.points[0][1], on: fade };
    const at = (it.linear ? raw : this.style.ease(raw)) * s.length;
    let k = 1;
    while (k < s.cum.length - 1 && s.cum[k] < at) k++;
    const a = s.points[k - 1], b = s.points[k];
    const f = clamp((at - s.cum[k - 1]) / ((s.cum[k] - s.cum[k - 1]) || 1));
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, on: fade };
  }

  render(t) {
    if (this.gl) {
      const gl = this.gl;
      gl.viewport(0, 0, this.element.width, this.element.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(this.u.uTime, t);
      const tip = this.tip(t);
      gl.uniform1f(this.u.uTipOn, tip ? tip.on : 0);
      if (tip) gl.uniform2f(this.u.uTip, tip.x, tip.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    if (!this.cpu) return;
    const src = this.cpuInk.data, out = this.cpuOut.data, T = this.T;
    for (let p = 0, i = 0; p < T.length; p++, i += 4) {
      const a = src[i + 3] * clamp((t - T[p]) / 60);
      if (this.dark) { out[i] = out[i + 1] = out[i + 2] = 237; } else { out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; }
      out[i + 3] = a;
    }
    this.cpu.putImageData(this.cpuOut, 0, 0);
  }
}
