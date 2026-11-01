// Writes a calligraphy image back onto the page, stroke by stroke. Every
// effect uses the recovered stroke centre lines as an SVG mask over the real
// ink (the technique used by stroke-order animators), so the finished frame is
// always the original artwork. Effects differ in tempo, brush pressure, edge
// texture and what happens to the ink after each stroke.

export const WRITING_EFFECTS = ['brush', 'pen', 'bleed', 'dry', 'light'];

const easeInOutCubic = (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const clamp = (v) => Math.min(1, Math.max(0, v));
// Dash offset for a stroke drawn to `p`. The gap is longer than the path and the
// hidden offset overshoots slightly, so no zero-length dash (which would still
// paint a round cap) ever sits on an unwritten stroke.
const offset = (p) => ((1 - clamp(p)) * 1.01).toFixed(4);

// tempo: stroke speed multiplier; pauses (ms): between strokes, characters, lines.
const STYLES = {
  // Press, draw, lift: slow entry and exit with a breath between strokes.
  brush: { tempo: 1, pauses: [170, 340, 520], ease: (t) => .72 * easeInOutCubic(t) + .28 * t },
  // A steady nib: near-constant speed, short lifts.
  pen: { tempo: 1.45, pauses: [70, 170, 280], ease: (t) => .35 * easeInOutSine(t) + .65 * t },
  // Wet ink spreads, then is drawn in sharp as the paper absorbs it.
  bleed: { tempo: .9, pauses: [210, 380, 560], ease: (t) => .7 * easeInOutCubic(t) + .3 * t, settle: 1500 },
  // Quick dry strokes leave bristle texture that fills as ink soaks in.
  dry: { tempo: 1.2, pauses: [130, 300, 450], ease: (t) => 1 - (1 - t) ** 2.2, settle: 1300 },
  // A point of light traces the line and leaves ink behind.
  light: { tempo: 1.05, pauses: [120, 260, 420], ease: easeInOutSine, settle: 900 },
};

let uid = 0;

function timeline(strokes, style, target) {
  const total = strokes.reduce((sum, s) => sum + s.length, 0) || 1;
  const writing = Math.min(6200, Math.max(2600, 1200 + strokes.length * 80)) * target;
  const pauseTotal = strokes.reduce((sum, s, i) => {
    if (!i) return sum;
    const prev = strokes[i - 1];
    return sum + style.pauses[prev.line !== s.line ? 2 : prev.char !== s.char ? 1 : 0];
  }, 0);
  const pauseScale = Math.min(1, 2600 / (pauseTotal || 1)) * target;
  let t = 120 * target;
  return strokes.map((s, i) => {
    if (i) {
      const prev = strokes[i - 1];
      t += style.pauses[prev.line !== s.line ? 2 : prev.char !== s.char ? 1 : 0] * pauseScale;
    }
    const duration = Math.max(150 * target, (s.length / total) * writing / style.tempo);
    const item = { start: t, end: t + duration, duration };
    t += duration;
    return item;
  });
}

function markup(analysis, effect, id, href) {
  const { width: W, height: H, strokes } = analysis;
  const avg = strokes.reduce((sum, s) => sum + s.width, 0) / (strokes.length || 1) || 10;
  const box = `x="0" y="0" width="${W}" height="${H}"`;
  const paths = (cls, widthScale = 1, extra = '') => strokes.map((s, i) => `<path class="${cls}" data-i="${i}" d="${s.d}" fill="none" stroke="white" stroke-width="${(s.width * widthScale).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 2" stroke-dashoffset="1.01" ${extra}/>`).join('');
  const image = (attrs = '') => `<image class="ink-layer" href="${href}" ${box} preserveAspectRatio="none" ${attrs}/>`;
  const final = `<rect class="w-final" ${box} fill="white" opacity="0"/>`;
  const region = `x="${-W * .1}" y="${-H * .1}" width="${W * 1.2}" height="${H * 1.2}"`;
  const roughEdge = (scale, freq = 1.1) => `<filter id="${id}-edge" filterUnits="userSpaceOnUse" ${region}><feTurbulence type="fractalNoise" baseFrequency="${(freq / avg).toFixed(4)}" numOctaves="2" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="${(avg * scale).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  let defs = '', body = '';
  if (effect === 'brush') {
    defs = `${roughEdge(.32)}<mask id="${id}-m" maskUnits="userSpaceOnUse" ${region}><g filter="url(#${id}-edge)">${paths('w-reveal', 1.08)}</g>${final}</mask>`;
    body = image(`mask="url(#${id}-m)"`);
  } else if (effect === 'pen') {
    defs = `<mask id="${id}-m" maskUnits="userSpaceOnUse" ${region}>${paths('w-reveal')}${final}</mask>`;
    body = `${image(`mask="url(#${id}-m)"`)}<circle class="w-tip w-nib" r="${Math.max(1.2, avg * .16).toFixed(1)}" opacity="0"/>`;
  } else if (effect === 'bleed') {
    defs = `${roughEdge(.5, .7)}<filter id="${id}-wet" filterUnits="userSpaceOnUse" ${region}><feMorphology operator="dilate" radius="${(avg * .12).toFixed(1)}"/><feGaussianBlur stdDeviation="${(avg * .42).toFixed(1)}"/></filter>`
      + `<mask id="${id}-mw" maskUnits="userSpaceOnUse" ${region}><g filter="url(#${id}-edge)">${paths('w-wet', 1.9, 'stroke-opacity="0"')}</g></mask>`
      + `<mask id="${id}-m" maskUnits="userSpaceOnUse" ${region}><g filter="url(#${id}-edge)">${paths('w-reveal', 1.05)}</g>${final}</mask>`;
    body = `<g filter="url(#${id}-wet)" opacity=".62"><g mask="url(#${id}-mw)">${image()}</g></g>${image(`mask="url(#${id}-m)"`)}`;
  } else if (effect === 'dry') {
    defs = `<filter id="${id}-bristle" filterUnits="userSpaceOnUse" ${region}><feTurbulence type="fractalNoise" baseFrequency="${(1.1 / avg).toFixed(4)} ${(2.8 / avg).toFixed(4)}" numOctaves="4" seed="3" result="noise"/><feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 4.2 -1.55" result="hair"/><feComposite in="SourceGraphic" in2="hair" operator="in"/></filter>${roughEdge(.22, 1.6)}`
      + `<mask id="${id}-m" maskUnits="userSpaceOnUse" ${region}><g filter="url(#${id}-bristle)">${paths('w-reveal', 1.1)}</g><g filter="url(#${id}-edge)">${paths('w-fill', 1.06, 'stroke-dashoffset="0" stroke-opacity="0"')}</g>${final}</mask>`;
    body = image(`mask="url(#${id}-m)"`);
  } else {
    defs = `<radialGradient id="${id}-glow"><stop offset="0" stop-color="#fffaf0"/><stop offset=".28" stop-color="#ffe2a3" stop-opacity=".95"/><stop offset=".6" stop-color="#e9b55c" stop-opacity=".35"/><stop offset="1" stop-color="#e9b55c" stop-opacity="0"/></radialGradient>`
      + `<filter id="${id}-blur" filterUnits="userSpaceOnUse" ${region}><feGaussianBlur stdDeviation="${(avg * .22).toFixed(1)}"/></filter>`
      + `<mask id="${id}-m" maskUnits="userSpaceOnUse" ${region}>${paths('w-reveal')}${final}</mask>`;
    body = `${image(`mask="url(#${id}-m)"`)}<g class="w-trails" filter="url(#${id}-blur)">${strokes.map((s, i) => `<path class="w-trail" data-i="${i}" d="${s.d}" fill="none" stroke="#f3c46b" stroke-width="${(s.width * .55).toFixed(1)}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 2" stroke-dashoffset="1.01" opacity="0"/>`).join('')}</g><circle class="w-tip w-glow" r="${(avg * 1.5).toFixed(1)}" fill="url(#${id}-glow)" opacity="0"/>`;
  }
  return `<svg class="writing-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}

export class Writer {
  constructor(analysis, effect, { href, loop = false, target = 1, reduced = false, onDone } = {}) {
    this.analysis = analysis;
    this.effect = WRITING_EFFECTS.includes(effect) ? effect : 'brush';
    this.style = STYLES[this.effect];
    this.loop = loop;
    this.reduced = reduced;
    this.onDone = onDone;
    const holder = document.createElement('div');
    holder.innerHTML = markup(analysis, this.effect, `w${++uid}`, href);
    this.element = holder.firstElementChild;
    this.items = timeline(analysis.strokes, this.style, target);
    const byIndex = (cls) => { const list = []; this.element.querySelectorAll(`.${cls}`).forEach((el) => { list[+el.dataset.i] = el; }); return list; };
    this.reveal = byIndex('w-reveal');
    this.wet = byIndex('w-wet');
    this.fill = byIndex('w-fill');
    this.trail = byIndex('w-trail');
    this.final = this.element.querySelector('.w-final');
    this.tip = this.element.querySelector('.w-tip');
    this.lengths = [];
    const last = this.items.length ? this.items[this.items.length - 1].end : 0;
    this.finishAt = last + 120;
    this.doneAt = this.finishAt + 650 + (this.style.settle || 0);
    this.frame = this.frame.bind(this);
  }

  play() {
    this.stop();
    if (this.reduced) { this.render(Infinity); this.final.setAttribute('opacity', '1'); this.onDone?.(); return; }
    this.started = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  get playing() { return Boolean(this.raf); }

  frame(now) {
    let t = now - this.started;
    if (this.loop && t > this.doneAt + 900) { this.started = now; t = 0; }
    this.render(t);
    if (!this.loop && t >= this.doneAt) { this.raf = 0; this.onDone?.(); return; }
    this.raf = requestAnimationFrame(this.frame);
  }

  pointAt(i, progress) {
    const path = this.reveal[i];
    if (!path) return null;
    if (this.lengths[i] === undefined) this.lengths[i] = path.getTotalLength();
    return path.getPointAtLength(progress * this.lengths[i]);
  }

  render(t) {
    const { ease, settle = 0 } = this.style;
    let active = -1, activeProgress = 0, lastEnded = -1;
    this.items.forEach((item, i) => {
      const raw = clamp((t - item.start) / item.duration);
      const p = ease(raw);
      if (raw > 0 && raw < 1) { active = i; activeProgress = p; }
      if (raw >= 1) lastEnded = i;
      const after = t - item.end;
      if (this.effect === 'bleed') {
        // The wet bloom leads; the sharp line follows as the paper takes the ink.
        this.wet[i]?.setAttribute('stroke-dashoffset', offset(p * 1.12));
        this.wet[i]?.setAttribute('stroke-opacity', raw <= 0 ? 0 : after < 0 ? .95 : .95 * (1 - clamp(after / settle)));
        this.reveal[i]?.setAttribute('stroke-dashoffset', offset(ease(clamp((t - item.start - 160) / item.duration))));
      } else {
        this.reveal[i]?.setAttribute('stroke-dashoffset', offset(p));
      }
      if (this.effect === 'dry') this.fill[i]?.setAttribute('stroke-opacity', clamp((after - 220) / (settle - 220)));
      if (this.effect === 'light') {
        this.trail[i]?.setAttribute('stroke-dashoffset', offset(p));
        this.trail[i]?.setAttribute('opacity', raw <= 0 ? 0 : after < 0 ? 1 : 1 - clamp(after / settle));
      }
    });
    if (this.tip) {
      let pt = null, visible = 0;
      if (active >= 0) { pt = this.pointAt(active, activeProgress); visible = 1; }
      else if (lastEnded >= 0 && t - this.items[lastEnded].end < 160) { pt = this.pointAt(lastEnded, 1); visible = 1 - (t - this.items[lastEnded].end) / 160; }
      if (pt) { this.tip.setAttribute('cx', pt.x); this.tip.setAttribute('cy', pt.y); }
      this.tip.setAttribute('opacity', visible.toFixed(2));
    }
    // Close any gaps the centre lines missed, so the last frame is the artwork.
    this.final?.setAttribute('opacity', clamp((t - this.finishAt) / 650));
  }
}
