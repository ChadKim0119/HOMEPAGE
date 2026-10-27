import fs from 'node:fs';
import path from 'node:path';
import { openSync } from 'fontkit';
import { scenes } from '../src/scenes.js';

const loadFont = (file) => openSync(file);
const fonts = {
  reference: loadFont('node_modules/@fontsource/mrs-saint-delafield/files/mrs-saint-delafield-latin-400-normal.woff2'),
  en: loadFont('node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff2'),
  ko: loadFont('node_modules/@fontsource/nanum-brush-script/files/nanum-brush-script-korean-400-normal.woff2'),
};
const output = {};

// Use actual font outlines. Each contour is revealed by a moving SVG brush mask;
// the finished word retains the exact filled glyph, including its counters.
for (const scene of scenes.filter((s) => s.effect === 'brush')) {
  for (const language of ['en', 'ko']) {
    const font = language === 'en' && scene.reference ? fonts.reference : fonts[language];
    const lines = language === 'en' ? scene.en.lines : scene.lines;
    output[`${scene.id}-${language}`] = lines.map((line) => {
      const run = font.layout(line);
      const scale = 120 / font.unitsPerEm;
      let advance = 0;
      const glyphs = run.glyphs.map((glyph, index) => {
        const position = run.positions[index];
        const outline = glyph.path.scale(scale, -scale).translate(advance + position.xOffset * scale, 120 - position.yOffset * scale);
        advance += position.xAdvance * scale;
        return { d: outline.toSVG(), box: outline.bbox };
      }).filter((glyph) => glyph.d.length);
      const x1 = Math.min(...glyphs.map((g) => g.box.minX)) - 12;
      const y1 = Math.min(...glyphs.map((g) => g.box.minY)) - 12;
      const x2 = Math.max(...glyphs.map((g) => g.box.maxX)) + 12;
      const y2 = Math.max(...glyphs.map((g) => g.box.maxY)) + 12;
      return { viewBox: [x1, y1, x2-x1, y2-y1], glyphs: glyphs.map((g) => ({ contours: g.d.match(/M[^M]+/g) || [g.d] })) };
    });
  }
}
fs.mkdirSync('src/generated', { recursive: true });
// Separate locale/artwork chunks keep vector data out of the entry bundle.
for (const file of fs.readdirSync('src/generated')) {
  if (file.endsWith('.json')) fs.unlinkSync(path.join('src/generated', file));
}
for (const [key, artwork] of Object.entries(output)) {
  fs.writeFileSync(path.join('src/generated', `${key}.json`), JSON.stringify(artwork));
}
console.log(`Generated ${Object.keys(output).length} calligraphy artworks from local, licensed fonts.`);
