export function replayArtwork(section, reduced) {
  section.querySelectorAll('.calligraphy, .typed-letter, .brush-track, .brush-complete').forEach((el) => {
    el.getAnimations().forEach((animation) => animation.cancel());
  });
  if (reduced) return;

  const effect = section.dataset.effect;
  if (effect === 'brush') {
    section.querySelectorAll('.brush-track').forEach((path) => {
      path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
        duration: Number(path.dataset.duration), delay: Number(path.dataset.delay),
        easing: 'ease-in-out', fill: 'both',
      });
    });
    // Finish each glyph without an outline mask: even very wide brush strokes
    // and antialiased edges must match the original, complete artwork.
    section.querySelectorAll('.brush-complete').forEach((fill) => {
      fill.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 100, delay: Number(fill.dataset.delay), easing: 'linear', fill: 'both',
      });
    });
  } else if (effect === 'type') {
    section.querySelectorAll('.typed-letter').forEach((letter, i) => {
      letter.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 1, delay: 160 + i * 44, fill: 'both',
      });
    });
  } else {
    section.querySelector('.calligraphy')?.animate(
      effect === 'ink'
        ? [{ opacity: 0, filter: 'blur(15px)', scale: '.96' }, { opacity: .65, filter: 'blur(3px)', offset: .55 }, { opacity: 1, filter: 'blur(0)', scale: '1' }]
        : [{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }],
      { duration: effect === 'ink' ? 1800 : 900, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
    );
  }
}

// A single active scene owns the animation loop. Background scenes never render.
export class SceneMotion {
  constructor(reduced) {
    this.reduced = reduced;
    this.target = { x: .5, y: .5 };
    this.current = { x: .5, y: .5 };
    this.blooms = [];
    this.frame = 0;
    this.lastDrop = 0;
    this.tick = this.tick.bind(this);
  }

  activate(section) {
    this.stop();
    this.section = section;
    this.target = { x: .5, y: .5 };
    this.current = { x: .5, y: .5 };
    this.canvas = section.querySelector('.ink-canvas');
    this.context = this.canvas?.getContext('2d');
    this.blooms = [];
    this.resize();
    replayArtwork(section, this.reduced.matches);
    if (this.reduced.matches) return;
    if (this.canvas) {
      this.addBloom(.43, .48, 65);
      this.addBloom(.57, .52, 45);
    }
    this.frame = requestAnimationFrame(this.tick);
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.section.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
  }

  move(event) {
    if (!this.section || this.reduced.matches) return;
    const rect = this.section.getBoundingClientRect();
    this.target = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
    if (this.canvas && performance.now() - this.lastDrop > 95) {
      this.addBloom(this.target.x, this.target.y, 20 + Math.random() * 17);
      this.lastDrop = performance.now();
    }
  }

  tap(event) {
    this.move(event);
    if (this.canvas && !this.reduced.matches) this.addBloom(this.target.x, this.target.y, 90);
  }

  addBloom(x, y, radius) {
    this.blooms.push({ x, y, radius, birth: performance.now(), seed: Math.random() * 10 });
    if (this.blooms.length > 38) this.blooms.shift();
  }

  drawInk(now) {
    if (!this.context) return;
    const ctx = this.context;
    ctx.clearRect(0, 0, this.width, this.height);
    this.blooms = this.blooms.filter((b) => now - b.birth < 5500);
    const color = this.section.matches('.theme-red') ? '247,224,203' : '38,44,33';
    this.blooms.forEach((bloom) => {
      const age = (now - bloom.birth) / 5500;
      const growth = 1 - Math.exp(-age * 7);
      const alpha = Math.sin(Math.min(1, age * 4) * Math.PI / 2) * (1 - age) * .09;
      // Feathered, irregular rings give the edge capillary movement on paper.
      for (let ring = 5; ring >= 0; ring--) {
        const radius = bloom.radius * growth * (1 + ring * .13);
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const angle = i / 64 * Math.PI * 2;
          const edge = radius * (1 + Math.sin(angle * 5 + bloom.seed) * .13 + Math.cos(angle * 9 + bloom.seed * 2 + age) * .065);
          const x = bloom.x * this.width + Math.cos(angle) * edge;
          const y = bloom.y * this.height + Math.sin(angle) * edge * .86;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${color},${alpha / (ring + 2)})`;
        ctx.fill();
      }
    });
  }

  tick(now) {
    if (!this.section || this.reduced.matches || document.hidden) { this.frame = 0; return; }
    this.current.x += (this.target.x - this.current.x) * .085;
    this.current.y += (this.target.y - this.current.y) * .085;
    const style = this.section.style;
    style.setProperty('--mx', (this.current.x - .5).toFixed(4));
    style.setProperty('--my', (this.current.y - .5).toFixed(4));
    style.setProperty('--px', `${this.current.x * 100}%`);
    style.setProperty('--py', `${this.current.y * 100}%`);
    this.drawInk(now);
    this.frame = requestAnimationFrame(this.tick);
  }

  replay() {
    if (!this.section) return;
    replayArtwork(this.section, this.reduced.matches);
    if (this.canvas && !this.reduced.matches) {
      this.blooms = [];
      this.addBloom(.47, .47, 100);
      this.addBloom(.6, .56, 65);
    }
  }

  resume() {
    if (!this.frame && this.section && !this.reduced.matches) this.frame = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.context) this.context.clearRect(0, 0, this.width, this.height);
  }
}
