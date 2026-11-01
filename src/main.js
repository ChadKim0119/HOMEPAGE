import '@fontsource/nanum-brush-script/400.css';
import '@fontsource/nanum-pen-script/400.css';
import '@fontsource/mrs-saint-delafield/400.css';
import '@fontsource/caveat/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/nanum-gothic-coding/400.css';
import '@fontsource/archivo-black/latin-400.css';
import './style.css';
import './enhancements.css';
import { scenes, localizeScene } from './scenes.js';
import { copy } from './i18n.js';
import { SceneMotion } from './motion.js';
import { analyzeInk } from './strokes.js';
import { Writer, WRITING_EFFECTS } from './writing.js';
import { loadCandidates, replaceCandidates, clearCandidates, isImageFile } from './compare.js';
const artworkModules = import.meta.glob('./generated/*.json');
const brushArt = {};
async function loadBrushArt(locale) {
  await Promise.all(scenes.filter((scene) => scene.effect === 'brush').map(async (scene) => {
    const key = `${scene.id}-${locale}`;
    if (!brushArt[key]) {
      try { brushArt[key] = (await artworkModules[`./generated/${key}.json`]()).default; }
      catch { /* Readable live-font artwork remains available if an asset is unavailable. */ }
    }
  }));
}

const paths = {
  arrow: '<path d="M4 12h15M13 5l7 7-7 7"/>', down: '<path d="M12 4v16m-7-7 7 7 7-7"/>',
  up: '<path d="M12 20V4m-7 7 7-7 7 7"/>', diagonal: '<path d="M5 19 19 5M5 5h14v14"/>',
  grid: '<rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  compare: '<rect x="3" y="4" width="7.5" height="16"/><rect x="13.5" y="4" width="7.5" height="16"/>', upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 20h16"/>', folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  paper: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h4"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>', stop: '<rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/>',
  chevron: '<path d="m7 14.5 5-5 5 5"/>',
  'fx-brush': '<path d="M14.5 4.5 19.5 9.5 11 18c-1.5 1.5-4 2-6.5 1.5.5-2.5 0-4.5 1.5-6z"/><path d="m13 6 5 5"/>',
  'fx-pen': '<path d="M12 3 7 12l5 9 5-9z"/><path d="M12 3v8"/><circle cx="12" cy="12.5" r="1.2"/>',
  'fx-bleed': '<path d="M12 3.5c3.5 4.5 5.5 7.6 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.9 2-6 5.5-10.5z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  'fx-dry': '<path d="M4 7c5-1 11 1 16-1M4 11c3-.6 6 .4 9 0M15 11h5M4 15c4-1 9 1 16-1M6 19c3-.6 6 0 8-.5"/>',
  'fx-light': '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>',
  left: '<path d="m15 5-7 7 7 7"/>', right: '<path d="m9 5 7 7-7 7"/>',
  focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>', replay: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
};
const icon = (name) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const pad = (number) => String(number).padStart(2, '0');
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readStorage = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
let language = readStorage('yeobaek-language', 'en') === 'ko' ? 'ko' : 'en';
const validIds = new Set(scenes.map((scene) => scene.id));
const oldSaved = readStorage('yeobaek-saved', []);
const storedSaved = readStorage('yeobaek-saved-v2', null);
const saved = new Set((Array.isArray(storedSaved) ? storedSaved : Array.isArray(oldSaved) ? oldSaved.map((i) => `original-${i}`) : []).filter((id) => validIds.has(id)));
const initialHash = /^#scene-(\d+)$/.exec(location.hash);
let active = Math.max(0, Math.min(scenes.length - 1, initialHash ? Number(initialHash[1]) - 1 : 0));
let filter = 'all';
let savedOnly = false;
let focusMode = false;
let nativeFullscreen = false;
let observer;
let toastTimer;
let contactPreview = false;
let signupPreview = false;
const contactDraft = { name: '', email: '', message: '', signup: '' };
let candidates = await loadCandidates();
let candidateIndex = 0;
let comparing = false;
let thumbsOpen = false;
let showOriginal = false;
let writeEffect = WRITING_EFFECTS.includes(readStorage('yeobaek-write-effect', 'brush')) ? readStorage('yeobaek-write-effect', 'brush') : 'brush';
let writer = null;
let effectMenuOpen = false;
let previewWriters = [];
const strokeCache = new Map();
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const motion = new SceneMotion(reduced);
const text = () => copy[language];
const sceneAt = (index) => localizeScene(scenes[index], language);
const getMain = () => document.querySelector('.scenes');
const sections = () => [...document.querySelectorAll('.scene')];

function brushMarkup(scene, mini) {
  const artwork = brushArt[`${scene.id}-${language}`];
  if (!artwork) return `<div class="calligraphy" role="img" aria-label="${esc(scene.lines.join(' '))}">${scene.lines.map((line) => `<span class="calligraphy-line">${esc(line)}</span>`).join('')}</div>`;
  const maxWidth = Math.max(...artwork.map((line) => line.viewBox[2]));
  let glyphOffset = 0;
  return `<div class="calligraphy brush-calligraphy" role="img" aria-label="${esc(scene.lines.join(' '))}">${artwork.map((line, lineIndex) => {
    const lineOffset = glyphOffset;
    glyphOffset += line.glyphs.length;
    return `<svg class="brush-line" viewBox="${line.viewBox.join(' ')}" style="width:${line.viewBox[2] / maxWidth * 100}%" aria-hidden="true"><defs>${line.glyphs.map((glyph, glyphIndex) => {
      const id = `brush-${mini ? 'mini' : 'full'}-${scene.id}-${language}-${lineIndex}-${glyphIndex}`;
      const completion = Math.max(...glyph.contours.map((d, contourIndex) => (lineOffset + glyphIndex) * 76 + contourIndex * 36 + 320 + Math.min(250, d.length * .25)));
      return `<mask id="${id}" maskUnits="userSpaceOnUse" x="${line.viewBox[0]}" y="${line.viewBox[1]}" width="${line.viewBox[2]}" height="${line.viewBox[3]}">${glyph.contours.map((d, contourIndex) => `<path class="brush-track" d="${d}" fill="none" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0" data-duration="${320 + Math.min(250, d.length * .25)}" data-delay="${(lineOffset + glyphIndex) * 76 + contourIndex * 36}"/>`).join('')}<rect class="brush-complete" x="${line.viewBox[0]}" y="${line.viewBox[1]}" width="${line.viewBox[2]}" height="${line.viewBox[3]}" fill="white" data-delay="${completion}"/></mask>`;
    }).join('')}</defs>${line.glyphs.map((glyph, glyphIndex) => `<path class="brush-glyph" d="${glyph.contours.join('')}" fill="currentColor" mask="url(#brush-${mini ? 'mini' : 'full'}-${scene.id}-${language}-${lineIndex}-${glyphIndex})"/>`).join('')}</svg>`;
  }).join('')}</div>`;
}

function calligraphy(scene, mini = false) {
  if (scene.artwork) {
    const url = scene.artwork.startsWith('/') ? `${import.meta.env.BASE_URL}${scene.artwork.slice(1)}` : scene.artwork;
    return `<img class="custom-artwork" src="${esc(url)}" alt="${esc(scene.lines.join(' '))}">`;
  }
  if (scene.effect === 'brush') return brushMarkup(scene, mini);
  const typed = scene.effect === 'type' && !mini;
  const segmenter = new Intl.Segmenter(language, { granularity: 'grapheme' });
  return `<div class="calligraphy${typed ? ' type-calligraphy' : ''}" role="img" aria-label="${esc(scene.lines.join(' '))}">${scene.lines.map((line) => `<span class="calligraphy-line" aria-hidden="true">${typed ? [...segmenter.segment(line)].map(({ segment }) => `<span class="typed-letter">${segment === ' ' ? '&nbsp;' : esc(segment)}</span>`).join('') : esc(line)}</span>`).join('')}</div>`;
}

function art(scene, mini = false) {
  const pattern = language === 'en' ? ['Where the heart rests  A little tenderness  ', 'Your story begins  With love, always  '] : ['마음이 머무는 곳에  작은 다정함을 담아  ', '당신의 이야기를 씁니다  오늘도 사랑으로  '];
  return `${scene.category === 'pattern' ? `<div class="word-pattern" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<span>${pattern[i % 2]}</span>`).join('')}</div>` : ''}<div class="art-decoration" aria-hidden="true"></div><div class="art-composition">${scene.reference ? `<div class="bracketed-calligraphy"><span class="parenthesis" aria-hidden="true">(</span>${calligraphy(scene, mini)}<span class="parenthesis" aria-hidden="true">)</span></div><p class="reference-subtitle">${scene.note}</p>` : `<div class="art-preface">${esc(scene.label || scene.title)}</div>${calligraphy(scene, mini)}<div class="artist-signature"><span>${text().brand}</span><i class="seal" aria-hidden="true">${language === 'en' ? 'Y<br>B' : '餘<br>白'}</i></div>`}</div>`;
}

function referenceChrome() {
  const r = text().reference;
  return `<div class="reference-header guide"><button class="notes-logo" data-action="home" aria-label="${r.logo}"><span>NO</span><span>TES</span><span>ON</span></button><div class="steeping"><i></i>${r.status}</div><div class="new-york"><span>${r.city} — <time id="ny-time">17:01:33 EDT</time></span><span>${r.weather}</span></div></div><div class="reference-footer guide"><div class="manifesto"><h2>${r.manifesto}</h2><p>${r.manifestoText}</p></div><div class="private-dispatch"><h2>${r.dispatch}</h2><form id="signup-form"><span aria-hidden="true">[</span><input type="email" name="signup" aria-label="${text().email}" placeholder="${r.signupPlaceholder}" autocomplete="email" required><button type="submit" aria-label="${r.signup}">↵</button><span aria-hidden="true">]</span></form><p class="signup-note" role="status">${signupPreview ? r.signupResult : r.signupNote}</p></div><div class="reference-connect"><h2>${r.connect}</h2><button data-action="about">${r.instagram}</button><button data-action="contact">${r.inquiries}</button></div><div class="reference-copyright">${r.copyright}</div></div>`;
}

function render() {
  writer?.stop(); writer = null;
  stopPreviews(); effectMenuOpen = false;
  observer?.disconnect();
  motion.stop();
  const t = text();
  document.documentElement.lang = language;
  document.title = t.pageTitle;
  document.querySelector('meta[name="description"]').content = t.galleryDescription;
  document.querySelector('#app').innerHTML = `
    <header class="site-header guide"><button class="brand" data-action="home" aria-label="${t.brandLabel}"><span class="brand-name">${t.brand}</span><span class="brand-description">${t.brandDescription}</span></button><nav aria-label="${t.navigation}"><button data-action="gallery">${icon('grid')}${t.collection}<span class="nav-count">${scenes.length}</span></button><button class="nav-about" data-action="about">${t.about}</button><button class="contact-link" data-action="contact">${t.contact}${icon('diagonal')}</button></nav></header>
    <main class="scenes" id="scenes" aria-label="${t.scenes}">${scenes.map((_, i) => {
      const scene = sceneAt(i);
      return `<section class="scene theme-${scene.theme} layout-${scene.layout} effect-${scene.effect}" id="scene-${pad(i+1)}" data-index="${i}" data-effect="${scene.effect}" aria-labelledby="title-${i}" ${scene.reference ? 'data-reference="true"' : ''}><div class="scene-background" aria-hidden="true"><div class="ambient-layer"></div>${scene.effect === 'ink' ? '<canvas class="ink-canvas"></canvas>' : ''}</div>${scene.reference ? referenceChrome() : `<div class="scene-eyebrow guide"><span class="eyebrow-rule"></span>${pad(i+1)} — ${esc(scene.title.toUpperCase())}</div><div class="side-caption guide" aria-hidden="true">${t.sideCaption}</div>`}<div class="artwork">${art(scene)}</div>${scene.reference ? `<h1 class="sr-only" id="title-${i}">${esc(scene.title)}</h1>` : `<div class="scene-description guide"><div class="scene-title-row"><span class="scene-number">${pad(i+1)}<span> / ${scenes.length}</span></span><h1 id="title-${i}">${esc(scene.title)}</h1></div><p>${esc(scene.note)}</p><div class="mood-tags">${esc(scene.mood)}</div></div><div class="art-note guide"><span class="effect-hint">${reduced.matches ? t.motionOff : t.hints[scene.effect]}</span><button class="replay-button" data-action="replay" ${reduced.matches ? 'disabled' : ''}>${icon('replay')}${t.replay}</button></div>`}</section>`;
    }).join('')}</main>
    <div class="utility-controls guide"><div class="language-switch" role="group" aria-label="${t.language}"><button data-language="en" lang="en" aria-label="${t.english}" aria-pressed="${language === 'en'}">EN</button><span>/</span><button data-language="ko" lang="ko" aria-label="${t.korean}" aria-pressed="${language === 'ko'}">KO</button></div><span class="utility-divider"></span><button data-action="focus" class="utility-button" aria-label="${t.focus}" title="${t.focus}">${icon('focus')}<kbd>F</kbd></button><button data-action="compare" class="utility-button compare-button" aria-label="${t.compare}" title="${t.compare}">${icon('compare')}</button><button data-action="gallery" class="utility-button utility-gallery reference-gallery" aria-label="${t.collection}" title="${t.collection}">${icon('grid')}</button><button data-action="replay" class="utility-button utility-replay reference-replay" aria-label="${t.replay}" title="${reduced.matches ? t.motionOff : t.replay}" ${reduced.matches ? 'disabled' : ''}>${icon('replay')}</button></div>
    <aside class="page-rail guide" aria-label="${t.chooseScene}"><span class="rail-start">01</span><div class="rail-dots">${scenes.map((_, i) => `<button class="rail-dot" data-page="${i}" aria-label="${pad(i+1)}. ${esc(sceneAt(i).title)}"><span>${pad(i+1)} ${esc(sceneAt(i).title)}</span></button>`).join('')}</div><span class="rail-end">${scenes.length}</span></aside>
    <footer class="site-footer guide"><div class="footer-edition"><span class="edition-dot"></span><span>${language === 'en' ? 'YEOBAEK STUDIO' : '여백 스튜디오'}</span><span class="edition-divider">/</span><span>${t.edition}</span></div><div class="footer-controls"><button class="save-button" data-action="save" aria-pressed="false">${icon('bookmark')}<span>${t.save}</span></button><span class="control-divider"></span><span class="footer-count"><b id="current-number">${pad(active+1)}</b><span>/ ${scenes.length}</span></span><button class="arrow-button" data-action="previous" aria-label="${t.previous}">${icon('up')}</button><button class="arrow-button" data-action="next" aria-label="${t.next}">${icon('down')}</button></div></footer>
    <div class="scroll-hint guide" aria-hidden="true"><span>${t.scroll}</span><div class="scroll-line"></div></div>
    <button class="focus-exit" data-action="focus" aria-label="${t.exitFocus}" title="${t.exitFocus}">${icon('close')}</button>
    ${galleryMarkup()}${compareMarkup()}${infoMarkup()}${compareHudMarkup()}<div class="toast" role="status" aria-live="polite"></div>`;
  restoreDraft();
  const root = getMain();
  root.scrollTop = sections()[active].offsetTop;
  observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) setActive(Number(entry.target.dataset.index));
  }), { root, threshold: .62 });
  sections().forEach((section) => observer.observe(section));
  setActive(active, true);
  if (comparing) applyCandidate();
  root.addEventListener('pointermove', (event) => { if (!event.target.closest('button,input,textarea,a')) motion.move(event); });
  root.addEventListener('pointerdown', (event) => { if (!event.target.closest('button,input,textarea,a,form')) motion.tap(event); });
  updateClock();
}

function galleryMarkup() {
  const t = text();
  return `<dialog class="gallery-dialog" id="gallery-dialog" aria-labelledby="gallery-heading"><div class="gallery-header"><div><span class="overline">${t.galleryOverline}</span><h2 id="gallery-heading">${t.galleryHeading}<span>.</span></h2><p>${t.galleryDescription}</p></div><button class="close-button" data-close aria-label="${t.close}">${icon('close')}</button></div><div class="gallery-toolbar"><div class="filters" role="group" aria-label="${t.filterLabel}">${t.filters.map(([id, label]) => `<button data-filter="${id}" aria-pressed="${id === filter}" class="filter-button${id === filter ? ' selected' : ''}">${label}</button>`).join('')}</div><button class="saved-filter" aria-pressed="${savedOnly}">${icon('bookmark')}<span>${t.savedScenes}</span><b>${saved.size}</b></button></div><div class="gallery-grid"></div><div class="gallery-bottom">${t.galleryFooter}<span>${t.galleryFooterNote}</span></div></dialog>`;
}

function compareMarkup() {
  const t = text();
  return `<dialog class="info-dialog compare-dialog" id="compare-dialog" aria-labelledby="compare-heading"><button class="close-button" data-close aria-label="${t.close}">${icon('close')}</button><span class="overline">${t.compareOverline}</span><h2 id="compare-heading"></h2><p>${t.compareDescription}</p><div class="compare-drop" data-drop><div class="compare-pickers"><button class="compare-pick" data-action="compare-files">${icon('upload')}${t.chooseFiles}</button><button class="compare-pick" data-action="compare-folder">${icon('folder')}${t.chooseFolder}</button></div><p>${t.dropHint}</p><input type="file" id="compare-files" accept="image/*" multiple hidden><input type="file" id="compare-folder" webkitdirectory directory multiple hidden></div><p class="demo-note">${t.limitNote}</p><div class="compare-resume"></div></dialog>`;
}

function renderCompareDialog() {
  const t = text();
  document.querySelector('#compare-heading').textContent = `${pad(active + 1)}. ${sceneAt(active).title}`;
  document.querySelector('.compare-resume').innerHTML = candidates.length
    ? `<button class="solid-button" data-action="compare-start">${t.resumeCompare(candidates.length)}${icon('arrow')}</button><button class="compare-clear" data-action="compare-clear">${t.clearCandidates}</button>`
    : '';
}

function compareHudMarkup() {
  const t = text();
  return `<div class="compare-hud guide" role="region" aria-label="${t.hudLabel}"><div class="effect-menu" role="menu" aria-label="${t.writingEffect}" hidden><p class="effect-menu-title">${t.writingEffect}<span>${t.effectMenuHint}</span></p><div class="effect-items">${WRITING_EFFECTS.map((fx) => `<button class="effect-item" role="menuitemradio" aria-checked="${fx === writeEffect}" data-effect="${fx}"><span class="effect-preview" data-preview="${fx}"></span><span class="effect-copy"><b>${icon(`fx-${fx}`)}${t.effects[fx][0]}</b><small>${t.effects[fx][1]}</small></span></button>`).join('')}</div></div><div class="compare-tray" ${thumbsOpen ? '' : 'hidden'}>${candidates.map((candidate, i) => `<button class="compare-thumb" data-candidate="${i}" aria-label="${pad(i + 1)}. ${esc(candidate.name)}"><img src="${esc(candidate.url)}" alt=""><span>${pad(i + 1)}</span></button>`).join('')}</div><div class="compare-bar"><button class="compare-step" data-action="candidate-prev" aria-label="${t.prevCandidate}">${icon('left')}</button><div class="compare-status" aria-live="polite"><b class="compare-count"></b><span class="compare-name"></span></div><button class="compare-step" data-action="candidate-next" aria-label="${t.nextCandidate}">${icon('right')}</button><span class="compare-divider"></span><div class="write-group"><button class="compare-play" data-action="write-play" aria-label="${t.playWriting}" title="${t.playWriting}"><span class="play-icon">${icon('play')}</span><span class="play-fx">${icon(`fx-${writeEffect}`)}</span></button><button class="compare-effect" data-action="write-menu" aria-haspopup="menu" aria-expanded="false" aria-label="${t.writingEffect}: ${t.effects[writeEffect][0]}" title="${t.writingEffect}"><span class="effect-name">${t.effects[writeEffect][0]}</span>${icon('chevron')}</button></div><span class="compare-divider"></span><button class="compare-tool" data-action="compare-thumbs" aria-pressed="${thumbsOpen}" aria-label="${t.showThumbs}" title="${t.showThumbs}">${icon('grid')}</button><button class="compare-tool" data-action="compare-original" aria-pressed="${showOriginal}" aria-label="${t.showOriginal}" title="${t.showOriginal}">${icon('paper')}</button><button class="compare-tool" data-action="compare" aria-label="${t.loadAgain}" title="${t.loadAgain}">${icon('upload')}</button><button class="compare-tool" data-action="compare-exit" aria-label="${t.exitCompare}" title="${t.exitCompare}">${icon('close')}</button></div><p class="compare-keys">${t.compareKeys}</p></div>`;
}

// Swaps the active scene's calligraphy for the current candidate, keeping the
// scene's background, layout, chrome and pointer effects untouched.
function applyCandidate() {
  if (!comparing || !candidates.length) return;
  stopWriter();
  const candidate = candidates[candidateIndex];
  const holder = sections()[active].querySelector('.artwork');
  holder.innerHTML = art({ ...sceneAt(active), artwork: showOriginal ? candidate.url : candidate.inkUrl, lines: [candidate.name] });
  holder.querySelector('.custom-artwork')?.classList.add('candidate-artwork', showOriginal ? 'is-original' : 'is-ink');
  document.querySelector('.compare-count').textContent = `${pad(candidateIndex + 1)} / ${pad(candidates.length)}`;
  document.querySelector('.compare-name').textContent = candidate.name;
  document.querySelectorAll('.compare-thumb').forEach((thumb, i) => {
    thumb.classList.toggle('is-current', i === candidateIndex);
    if (i === candidateIndex) { thumb.setAttribute('aria-current', 'true'); if (thumbsOpen) thumb.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    else thumb.removeAttribute('aria-current');
  });
  if (effectMenuOpen) startPreviews();
}

// ---- Writing playback: the candidate is written out stroke by stroke. ----
function strokesFor(candidate) {
  if (!strokeCache.has(candidate.inkUrl)) strokeCache.set(candidate.inkUrl, analyzeInk(candidate.inkUrl).catch(() => null));
  return strokeCache.get(candidate.inkUrl);
}

function markPlaying(playing) {
  const button = document.querySelector('.compare-play');
  if (!button) return;
  const t = text();
  button.classList.toggle('is-playing', playing);
  button.querySelector('.play-icon').innerHTML = icon(playing ? 'stop' : 'play');
  button.setAttribute('aria-label', playing ? t.stopWriting : t.playWriting);
  button.title = playing ? t.stopWriting : t.playWriting;
}

function stopWriter() {
  writer?.destroy();
  writer = null;
  markPlaying(false);
}

async function playWriting() {
  if (!comparing || !candidates.length) return;
  if (writer?.playing) { applyCandidate(); return; } // second press: stop and show the finished work
  if (writer && !writer.playing) applyCandidate(); // replay from a blank page
  closeEffectMenu();
  stopWriter();
  const candidate = candidates[candidateIndex];
  const button = document.querySelector('.compare-play');
  button?.classList.add('is-loading');
  const analysis = await strokesFor(candidate);
  button?.classList.remove('is-loading');
  if (!comparing || candidates[candidateIndex] !== candidate) return;
  if (!analysis?.strokes.length) { toast(text().noStrokes); return; }
  if (analysis.plan && !analysis.planAnnounced) {
    analysis.planAnnounced = true;
    toast(`${text().planApplied} ${analysis.plan.word}${analysis.plan.status === 'draft' ? ` (${text().planDraft})` : ''}`);
  }
  const target = sections()[active].querySelector('.candidate-artwork');
  if (!target) return;
  if (target.tagName === 'IMG' && !target.complete) await target.decode().catch(() => {});
  const rect = target.getBoundingClientRect();
  const run = new Writer(analysis, writeEffect, {
    href: candidate.inkUrl, reduced: reduced.matches, dark: document.body.dataset.dark === 'true',
    // The finished canvas stays on the page (it is the artwork) until replaced.
    onDone: () => { if (writer !== run) return; markPlaying(false); if (showOriginal) applyCandidate(); },
  });
  writer?.destroy();
  writer = run;
  markPlaying(true);
  try { await run.ready; } catch { if (writer === run) { writer = null; markPlaying(false); } toast(text().noStrokes); return; }
  if (writer !== run || !target.isConnected) { run.destroy(); return; }
  run.element.classList.add('custom-artwork', 'candidate-artwork', 'writing-artwork');
  run.size(rect.width || target.naturalWidth || 600, rect.height || target.naturalHeight || 300);
  target.replaceWith(run.element);
  run.play();
}

function stopPreviews() {
  previewWriters.forEach((w) => w.destroy());
  document.querySelectorAll('.effect-preview canvas').forEach((c) => c.remove());
  previewWriters = [];
}

// Each menu item loops its effect on the current candidate, so the effect is
// recognisable at a glance.
async function startPreviews() {
  const candidate = candidates[candidateIndex];
  const slots = [...document.querySelectorAll('.effect-preview')];
  stopPreviews();
  slots.forEach((slot) => { slot.innerHTML = `<i class="preview-wait">${text().readingStrokes}</i>`; });
  const analysis = await strokesFor(candidate);
  if (!effectMenuOpen || candidates[candidateIndex] !== candidate) return;
  if (!analysis?.strokes.length) { slots.forEach((slot) => { slot.innerHTML = `<i class="preview-wait">${text().noStrokes}</i>`; }); return; }
  stopPreviews();
  const writers = slots.map((slot) => new Writer(analysis, slot.dataset.preview, { href: candidate.inkUrl, loop: true, target: .4, reduced: reduced.matches }));
  previewWriters = writers;
  await Promise.all(writers.map((w) => w.ready.catch(() => {})));
  if (previewWriters !== writers) { writers.forEach((w) => w.destroy()); return; }
  slots.forEach((slot, i) => {
    const w = writers[i];
    slot.replaceChildren(w.element);
    w.size(slot.clientWidth - 8, slot.clientHeight - 8);
    w.play();
  });
}

function openEffectMenu() {
  const menu = document.querySelector('.effect-menu');
  if (!menu || !comparing) return;
  effectMenuOpen = true;
  menu.hidden = false;
  document.querySelector('.compare-effect').setAttribute('aria-expanded', 'true');
  menu.querySelector(`[data-effect="${writeEffect}"]`)?.focus({ preventScroll: true });
  startPreviews();
}

function closeEffectMenu() {
  if (!effectMenuOpen) return;
  effectMenuOpen = false;
  stopPreviews();
  const menu = document.querySelector('.effect-menu');
  if (menu) menu.hidden = true;
  document.querySelector('.compare-effect')?.setAttribute('aria-expanded', 'false');
}

function chooseEffect(effect) {
  const t = text();
  writeEffect = effect;
  try { localStorage.setItem('yeobaek-write-effect', JSON.stringify(effect)); } catch { /* Kept for this visit. */ }
  document.querySelectorAll('.effect-item').forEach((item) => item.setAttribute('aria-checked', String(item.dataset.effect === effect)));
  document.querySelector('.play-fx').innerHTML = icon(`fx-${effect}`);
  document.querySelector('.effect-name').textContent = t.effects[effect][0];
  document.querySelector('.compare-effect').setAttribute('aria-label', `${t.writingEffect}: ${t.effects[effect][0]}`);
  closeEffectMenu();
  document.querySelector('.compare-play')?.focus({ preventScroll: true });
  playWriting();
}

function restoreArtwork(index) {
  sections()[index].querySelector('.artwork').innerHTML = art(sceneAt(index));
}

function startCompare() {
  if (!candidates.length) { openDialog('compare-dialog'); return; }
  document.querySelector('dialog[open]')?.close();
  comparing = true;
  candidateIndex = Math.min(candidateIndex, candidates.length - 1);
  document.body.classList.add('is-comparing');
  applyCandidate();
}

function stopCompare() {
  if (!comparing) return;
  stopWriter();
  closeEffectMenu();
  comparing = false;
  document.body.classList.remove('is-comparing');
  restoreArtwork(active);
  motion.activate(sections()[active]);
}

function stepCandidate(delta, absolute) {
  candidateIndex = absolute ?? (candidateIndex + delta + candidates.length) % candidates.length;
  applyCandidate();
}

async function handleCandidateFiles(files) {
  const t = text();
  const list = [...files];
  if (!list.some(isImageFile)) { toast(t.noImages); return; }
  document.querySelector('#compare-dialog')?.classList.add('is-busy');
  toast(t.preparing);
  const result = await replaceCandidates(list);
  candidates.forEach((candidate) => URL.revokeObjectURL(candidate.url));
  candidates = result.candidates;
  candidateIndex = 0;
  captureDraft();
  render();
  startCompare();
  toast([t.candidatesLoaded(candidates.length), result.overflow && t.candidatesOverflow(result.overflow), result.skipped && t.uploadsSkipped(result.skipped), !result.stored && t.candidatesNotKept].filter(Boolean).join(' '));
}

// Folders dropped onto the dialog are walked recursively, like the folder picker.
async function filesFromDrop(dataTransfer) {
  const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dataTransfer.files];
  const files = [];
  const walk = async (entry) => {
    if (entry.isFile) { files.push(await new Promise((resolve, reject) => entry.file(resolve, reject))); return; }
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      for (const child of batch) await walk(child);
    } while (batch.length);
  };
  for (const entry of entries) await walk(entry);
  return files;
}

function infoMarkup() {
  const t = text();
  return `<dialog class="info-dialog" id="about-dialog" aria-labelledby="about-heading"><button class="close-button" data-close aria-label="${t.close}">${icon('close')}</button><span class="overline">${t.aboutOverline}</span><h2 id="about-heading">${t.aboutHeading}</h2><p class="about-calligraphy">${t.aboutArt}</p><p>${t.aboutDescription}</p><div class="about-services">${t.services.map((s) => `<span>${s}</span>`).join('')}</div><p class="demo-note">${t.demo}</p><button class="solid-button" data-action="contact">${t.shareStory}${icon('diagonal')}</button></dialog><dialog class="info-dialog" id="contact-dialog" aria-labelledby="contact-heading"><button class="close-button" data-close aria-label="${t.close}">${icon('close')}</button><span class="overline">${t.contactOverline}</span><h2 id="contact-heading">${t.contactHeading}</h2><p>${t.contactDescription}</p><form id="contact-form"><label>${t.name}<input name="name" placeholder="${t.namePlaceholder}" required maxlength="50" autocomplete="name"></label><label>${t.email}<input type="email" name="email" placeholder="hello@example.com" required autocomplete="email"></label><label>${t.message}<textarea name="message" placeholder="${t.messagePlaceholder}" required maxlength="2000" rows="3"></textarea></label><p class="demo-note">${t.formNote}</p><button class="solid-button" type="submit">${t.preview}${icon('diagonal')}</button><div class="form-result" role="status" ${contactPreview ? '' : 'hidden'}></div></form></dialog>`;
}

function updateSaved() {
  const keep = document.querySelector('.save-button');
  const isSaved = saved.has(scenes[active].id);
  keep.classList.toggle('is-saved', isSaved);
  keep.setAttribute('aria-pressed', String(isSaved));
  keep.querySelector('span').textContent = isSaved ? text().saved : text().save;
  document.querySelector('.saved-filter b').textContent = saved.size;
}

function setActive(index, force = false) {
  if (active === index && !force) return;
  if (comparing && active !== index) restoreArtwork(active);
  active = index;
  const scene = scenes[index];
  document.body.dataset.dark = scene.category === 'dark' || scene.theme === 'forest';
  document.body.dataset.reference = Boolean(scene.reference);
  document.querySelector('#current-number').textContent = pad(index + 1);
  document.querySelector('[data-action="previous"]').disabled = index === 0;
  document.querySelector('[data-action="next"]').setAttribute('aria-label', index === scenes.length - 1 ? text().first : text().next);
  document.querySelectorAll('.rail-dot').forEach((el, i) => {
    el.classList.toggle('active', i === index);
    if (i === index) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
  });
  sections().forEach((el, i) => el.classList.toggle('is-active', i === index));
  history.replaceState(null, '', `#scene-${pad(index + 1)}`);
  updateSaved();
  motion.activate(sections()[index]);
  if (comparing) applyCandidate();
}

function goTo(index, instant = false) {
  const target = Math.max(0, Math.min(scenes.length - 1, index));
  getMain().scrollTo({ top: sections()[target].offsetTop, behavior: instant || reduced.matches ? 'instant' : 'smooth' });
}

function openDialog(id) {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  if (id === 'gallery-dialog') renderGallery();
  if (id === 'compare-dialog') renderCompareDialog();
  document.getElementById(id).showModal();
}

function renderGallery() {
  const t = text();
  const filtered = scenes.map((_, index) => ({ scene: sceneAt(index), index })).filter(({ scene }) => (filter === 'all' || scene.category === filter) && (!savedOnly || saved.has(scene.id)));
  document.querySelector('.gallery-grid').innerHTML = filtered.length ? filtered.map(({ scene, index }) => `<article class="gallery-card"><button class="thumbnail theme-${scene.theme} layout-${scene.layout}" data-page="${index}" aria-label="${pad(index+1)}. ${esc(scene.title)} — ${t.openScene}">${art(scene, true)}<span class="thumbnail-open">${t.openScene}${icon('diagonal')}</span></button><div class="card-info"><button data-page="${index}"><span>${pad(index+1)}</span><h3>${esc(scene.title)}</h3></button><button class="card-save${saved.has(scene.id) ? ' is-saved' : ''}" data-save="${index}" aria-label="${esc(scene.title)} — ${saved.has(scene.id) ? t.unsave : t.saveScene}" aria-pressed="${saved.has(scene.id)}">${icon('bookmark')}</button></div><p>${esc(scene.mood)}</p></article>`).join('') : `<div class="empty-state">${icon('bookmark')}<h3>${t.empty}</h3><p>${savedOnly ? t.emptySaved : t.emptyFilter}</p><button class="filter-reset">${t.reset}${icon('arrow')}</button></div>`;
}

function toast(message) {
  const el = document.querySelector('.toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2400);
}

function toggleSave(index) {
  const id = scenes[index].id;
  if (saved.has(id)) { saved.delete(id); toast(text().saveRemoved); }
  else { saved.add(id); toast(`${pad(index+1)}. ${sceneAt(index).title} — ${text().saveAdded}`); }
  try { localStorage.setItem('yeobaek-saved-v2', JSON.stringify([...saved])); } catch { toast(text().storageUnavailable); }
  updateSaved();
  if (document.querySelector('#gallery-dialog').open) renderGallery();
}

function captureDraft() {
  document.querySelectorAll('#contact-form [name], #signup-form [name]').forEach((input) => { contactDraft[input.name] = input.value; });
}

function restoreDraft() {
  document.querySelectorAll('#contact-form [name], #signup-form [name]').forEach((input) => { input.value = contactDraft[input.name]; });
  if (contactPreview) renderContactResult();
}

function renderContactResult() {
  const result = document.querySelector('.form-result');
  result.hidden = false;
  result.innerHTML = `<strong>${esc(contactDraft.name)} — ${text().yourStory}</strong><p>${esc(contactDraft.message)}</p><small>${esc(contactDraft.email)} · ${text().previewDone}</small>`;
}

let languageRequest = 0;
async function setLanguage(next) {
  if (!['en', 'ko'].includes(next)) return;
  const request = ++languageRequest;
  if (language === next) return;
  await loadBrushArt(next);
  if (request !== languageRequest) return;
  captureDraft();
  const openId = document.querySelector('dialog[open]')?.id;
  language = next;
  try { localStorage.setItem('yeobaek-language', JSON.stringify(language)); } catch { /* The in-memory choice still works. */ }
  render();
  if (openId) openDialog(openId);
  else document.querySelector(`[data-language="${next}"]`).focus({ preventScroll: true });
}

function applyFocus(value) {
  focusMode = value;
  document.body.classList.toggle('is-focus', value);
  document.querySelectorAll('[data-action="focus"]').forEach((button) => button.setAttribute('aria-pressed', String(value)));
}

async function toggleFocus() {
  if (focusMode) {
    applyFocus(false);
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen().catch(() => {});
    nativeFullscreen = false;
    return;
  }
  applyFocus(true);
  if (document.documentElement.requestFullscreen) {
    try { await document.documentElement.requestFullscreen(); nativeFullscreen = true; }
    catch { nativeFullscreen = false; } // Embedded browsers keep the same distraction-free CSS view.
  }
}

function updateClock() {
  const clock = document.querySelector('#ny-time');
  if (!clock) return;
  const now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' }).format(now);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (effectMenuOpen && !event.target.closest('.effect-menu, [data-action="write-menu"]')) closeEffectMenu();
  if (button) {
    if (button.hasAttribute('data-close')) { button.closest('dialog').close(); return; }
    if (button.dataset.language) { setLanguage(button.dataset.language); return; }
    if (button.dataset.page !== undefined) { document.querySelector('dialog[open]')?.close(); goTo(Number(button.dataset.page)); return; }
    if (button.dataset.save !== undefined) { toggleSave(Number(button.dataset.save)); return; }
    if (button.dataset.filter) {
      filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((el) => { el.classList.toggle('selected', el.dataset.filter === filter); el.setAttribute('aria-pressed', String(el.dataset.filter === filter)); });
      renderGallery(); return;
    }
    if (button.dataset.effect) { chooseEffect(button.dataset.effect); return; }
    if (button.dataset.candidate !== undefined) { stepCandidate(0, Number(button.dataset.candidate)); return; }
    if (button.classList.contains('saved-filter')) { savedOnly = !savedOnly; button.setAttribute('aria-pressed', String(savedOnly)); renderGallery(); return; }
    if (button.classList.contains('filter-reset')) {
      savedOnly = false; filter = 'all';
      document.querySelector('.saved-filter').setAttribute('aria-pressed', 'false');
      document.querySelectorAll('[data-filter]').forEach((el) => { el.classList.toggle('selected', el.dataset.filter === 'all'); el.setAttribute('aria-pressed', String(el.dataset.filter === 'all')); });
      renderGallery(); return;
    }
    switch (button.dataset.action) {
      case 'home': goTo(0); break;
      case 'gallery': openDialog('gallery-dialog'); break;
      case 'about': openDialog('about-dialog'); break;
      case 'contact': openDialog('contact-dialog'); break;
      case 'compare': openDialog('compare-dialog'); break;
      case 'compare-files': document.querySelector('#compare-files').click(); break;
      case 'compare-folder': document.querySelector('#compare-folder').click(); break;
      case 'compare-start': startCompare(); break;
      case 'compare-exit': stopCompare(); break;
      case 'compare-original':
        showOriginal = !showOriginal;
        button.setAttribute('aria-pressed', String(showOriginal));
        toast(showOriginal ? text().originalOn : text().originalOff);
        applyCandidate(); break;
      case 'write-play': playWriting(); break;
      case 'write-menu': if (effectMenuOpen) closeEffectMenu(); else openEffectMenu(); break;
      case 'candidate-prev': stepCandidate(-1); break;
      case 'candidate-next': stepCandidate(1); break;
      case 'compare-thumbs':
        thumbsOpen = !thumbsOpen;
        button.setAttribute('aria-pressed', String(thumbsOpen));
        document.querySelector('.compare-tray').hidden = !thumbsOpen;
        applyCandidate(); break;
      case 'compare-clear':
        stopCompare(); clearCandidates();
        candidates.forEach((candidate) => URL.revokeObjectURL(candidate.url));
        candidates = []; candidateIndex = 0;
        captureDraft(); render(); openDialog('compare-dialog'); toast(text().candidatesCleared); break;
      case 'save': toggleSave(active); break;
      case 'previous': goTo(active - 1); break;
      case 'next': goTo((active + 1) % scenes.length); break;
      case 'replay': motion.replay(); break;
      case 'focus': toggleFocus(); break;
    }
  }
  if (event.target.tagName === 'DIALOG') {
    const rect = event.target.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
  }
});

document.addEventListener('change', (event) => {
  if (!['compare-files', 'compare-folder'].includes(event.target.id)) return;
  const files = [...event.target.files];
  event.target.value = '';
  if (files.length) handleCandidateFiles(files);
});
document.addEventListener('dragover', (event) => {
  const dialog = event.target.closest?.('#compare-dialog');
  if (!dialog) return;
  event.preventDefault();
  dialog.querySelector('[data-drop]').classList.add('is-dragging');
});
document.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget?.closest?.('#compare-dialog')) document.querySelector('[data-drop]')?.classList.remove('is-dragging');
});
document.addEventListener('drop', async (event) => {
  if (!event.target.closest?.('#compare-dialog')) return;
  event.preventDefault();
  document.querySelector('[data-drop]')?.classList.remove('is-dragging');
  handleCandidateFiles(await filesFromDrop(event.dataTransfer));
});
// Horizontal swipes switch candidates on touch screens.
let swipeStart;
document.addEventListener('touchstart', (event) => { swipeStart = comparing ? event.touches[0] : null; }, { passive: true });
document.addEventListener('touchend', (event) => {
  if (!swipeStart || !comparing) return;
  const dx = event.changedTouches[0].clientX - swipeStart.clientX;
  const dy = event.changedTouches[0].clientY - swipeStart.clientY;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepCandidate(dx < 0 ? 1 : -1);
});

document.addEventListener('submit', (event) => {
  if (!['contact-form', 'signup-form'].includes(event.target.id)) return;
  event.preventDefault();
  captureDraft();
  if (event.target.id === 'signup-form') {
    signupPreview = true;
    document.querySelector('.signup-note').textContent = text().reference.signupResult;
  } else {
    contactPreview = true;
    renderContactResult();
    document.querySelector('.form-result').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'nearest' });
  }
});

document.addEventListener('keydown', (event) => {
  const editing = event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName);
  if (editing || event.metaKey || event.ctrlKey || event.altKey || event.repeat || document.querySelector('dialog[open]')) return;
  if (event.code === 'KeyF' || event.key.toLowerCase() === 'f' || event.key === 'ㄹ') { event.preventDefault(); toggleFocus(); return; }
  if (comparing && effectMenuOpen) {
    const items = [...document.querySelectorAll('.effect-item')];
    const at = items.indexOf(document.activeElement);
    const moves = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    if (event.key in moves) { event.preventDefault(); items[(Math.max(0, at) + moves[event.key] + items.length) % items.length].focus(); return; }
    if (event.key === 'Escape') { event.preventDefault(); closeEffectMenu(); document.querySelector('.compare-effect')?.focus({ preventScroll: true }); return; }
    return; // Enter / Space act on the focused effect
  }
  if (comparing && (event.code === 'Space' || event.key === ' ')) { event.preventDefault(); playWriting(); return; }
  if (comparing) {
    const steps = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    if (event.key in steps) { event.preventDefault(); stepCandidate(steps[event.key]); return; }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); stepCandidate(0, event.key === 'Home' ? 0 : candidates.length - 1); return; }
    if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); goTo(active + (event.key === 'PageDown' ? 1 : -1)); return; }
    if (event.key === 'Escape') { if (focusMode && !document.fullscreenElement) applyFocus(false); else stopCompare(); return; }
  }
  if (event.key === 'Escape' && focusMode && !document.fullscreenElement) { applyFocus(false); return; }
  if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    goTo(event.key === 'Home' ? 0 : event.key === 'End' ? scenes.length - 1 : active + (['ArrowDown', 'PageDown'].includes(event.key) ? 1 : -1));
  }
});
// Space writes in comparison mode; keep it from also activating a focused button.
document.addEventListener('keyup', (event) => {
  if (comparing && !effectMenuOpen && (event.code === 'Space' || event.key === ' ') && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) event.preventDefault();
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && nativeFullscreen) { nativeFullscreen = false; applyFocus(false); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) motion.stop(); else motion.resume(); });
window.addEventListener('resize', () => { goTo(active, true); motion.resize(); });
window.addEventListener('hashchange', () => {
  const match = /^#scene-(\d+)$/.exec(location.hash);
  if (match) goTo(Number(match[1]) - 1, true);
});
reduced.addEventListener('change', () => { captureDraft(); render(); });
setInterval(updateClock, 1000);
await loadBrushArt(language);
render();
