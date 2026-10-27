import '@fontsource/nanum-brush-script/400.css';
import '@fontsource/nanum-pen-script/400.css';
import './style.css';
import { scenes } from './scenes.js';

const icons = {
  arrow: '<path d="M4 12h15M13 5l7 7-7 7"/>',
  down: '<path d="M12 4v16m-7-7 7 7 7-7"/>',
  up: '<path d="M12 20V4m-7 7 7-7 7 7"/>',
  diagonal: '<path d="M5 19 19 5M5 5h14v14"/>',
  grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved;
try { saved = new Set(JSON.parse(localStorage.getItem('yeobaek-saved') || '[]').filter(n => Number.isInteger(n) && n >= 0 && n < scenes.length)); } catch { saved = new Set(); }
let active = 0;
let filter = 'all';
let savedOnly = false;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function art(scene, mini = false) {
  const artworkUrl = scene.artwork?.startsWith('/')
    ? `${import.meta.env.BASE_URL}${scene.artwork.slice(1)}`
    : scene.artwork;
  const pattern = ['pattern','forest','mono-pattern','love'].includes(scene.theme)
    ? `<div class="word-pattern" aria-hidden="true">${Array.from({length: 12}, (_, i) => `<span>${i % 2 ? '마음이 머무는 곳에  작은 다정함을 담아  ' : '당신의 이야기를 씁니다  오늘도 사랑으로  '}</span>`).join('')}</div>` : '';
  const artwork = scene.artwork
    ? `<img class="custom-artwork" src="${esc(artworkUrl)}" alt="${esc(scene.lines.join(' '))}">`
    : `<div class="calligraphy" ${mini ? 'aria-hidden="true"' : ''}>${scene.lines.map((line, i) => `<span style="--line:${i}">${line}</span>`).join('')}</div>`;
  return `${pattern}<div class="art-decoration" aria-hidden="true"></div><div class="art-composition"><div class="art-preface" aria-hidden="true">${scene.label || scene.english}</div>${artwork}<div class="artist-signature"><span>여백</span><i class="seal" aria-hidden="true">餘<br>白</i></div></div>`;
}

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <button class="brand" data-action="home" aria-label="여백, 첫 번째 시안으로"><span class="brand-name">여백<span class="brand-hanja">餘白</span></span><span class="brand-description">문장과 공간 사이</span></button>
    <nav aria-label="주 메뉴">
      <button class="nav-gallery" data-action="gallery">${icon('grid')}<span>시안 모아보기</span><span class="nav-count">20</span></button>
      <button class="nav-about" data-action="about">스튜디오 소개</button>
      <button class="contact-link" data-action="contact">함께 쓰기 ${icon('diagonal')}</button>
    </nav>
  </header>
  <main class="scenes" id="scenes" aria-label="20가지 캘리그라피 시안">
    ${scenes.map((scene, i) => `<section class="scene theme-${scene.theme} layout-${scene.layout} effect-${scene.effect}" id="scene-${pad(i+1)}" data-index="${i}" aria-labelledby="title-${i}">
      <div class="scene-eyebrow"><span class="eyebrow-rule"></span><span>${pad(i+1)} — ${scene.english.toUpperCase()}</span></div>
      <div class="side-caption" aria-hidden="true">A COLLECTION OF WORDS & SPACES</div>
      <div class="artwork">${art(scene)}</div>
      <div class="scene-description"><div class="scene-title-row"><span class="scene-number">${pad(i+1)}<span> / 20</span></span><h1 id="title-${i}">${scene.title}</h1></div><p>${scene.note}</p><div class="mood-tags">${scene.mood}</div></div>
      <div class="art-note" aria-hidden="true"><span class="tiny-plus">+</span> ${i === 0 ? '작은 움직임에도, 마음이 번집니다.' : ({ink:'마우스를 움직여, 먹의 흐름을 느껴보세요.',glow:'움직이는 빛을 천천히 따라가 보세요.',tilt:'종이 위의 작은 움직임을 느껴보세요.',drift:'문장 사이로 가볍게 움직여 보세요.',float:'바람처럼 가볍게, 마음을 움직여 보세요.'}[scene.effect])}</div>
    </section>`).join('')}
  </main>
  <aside class="page-rail" aria-label="시안 페이지 선택"><span class="rail-start">01</span><div class="rail-dots">${scenes.map((s,i)=>`<button class="rail-dot${i === 0 ? ' active' : ''}" data-page="${i}" aria-label="${pad(i+1)}. ${s.title}" ${i === 0 ? 'aria-current="true"' : ''}><span>${pad(i+1)} ${s.title}</span></button>`).join('')}</div><span class="rail-end">20</span></aside>
  <footer class="site-footer"><div class="footer-edition"><span class="edition-dot"></span><span>YEOBAEK STUDIO</span><span class="edition-divider">/</span><span>CALLIGRAPHY COLLECTION, 2026</span></div><div class="footer-controls"><button class="save-button" data-action="save" aria-pressed="false">${icon('bookmark')}<span>마음에 담기</span></button><span class="control-divider"></span><span class="footer-count"><b id="current-number">01</b><span>/ 20</span></span><button class="arrow-button" data-action="previous" aria-label="이전 시안" disabled>${icon('up')}</button><button class="arrow-button next-button" data-action="next" aria-label="다음 시안">${icon('down')}</button></div></footer>
  <div class="scroll-hint" aria-hidden="true"><span>SCROLL TO EXPLORE</span><div class="scroll-line"></div></div>
  <dialog class="gallery-dialog" aria-labelledby="gallery-heading"><div class="gallery-header"><div><span class="overline">THE COLLECTION</span><h2 id="gallery-heading">스무 가지의 여백<span>.</span></h2><p>같은 마음, 다른 표정. 당신의 취향이 머무는 장면을 찾아보세요.</p></div><button class="close-button" data-close aria-label="모아보기 닫기">${icon('close')}</button></div><div class="gallery-toolbar"><div class="filters" role="group" aria-label="배경별 시안 필터">${[['all','전체'],['light','밝은 여백'],['dark','깊은 어둠'],['texture','종이의 결'],['pattern','문장의 무늬']].map(([id,name])=>`<button data-filter="${id}" aria-pressed="${id==='all'}" class="filter-button${id==='all'?' selected':''}">${name}</button>`).join('')}</div><button class="saved-filter" aria-pressed="false">${icon('bookmark')}<span>담은 시안</span><b>${saved.size}</b></button></div><div class="gallery-grid"></div><div class="gallery-bottom">TWENTY SCENES. INFINITE POSSIBILITIES.<span>문장은 임시로, 마음은 진심으로.</span></div></dialog>
  <dialog class="info-dialog" id="about-dialog" aria-labelledby="about-heading"><button class="close-button" data-close aria-label="소개 닫기">${icon('close')}</button><span class="overline">ABOUT YEOBAEK</span><h2 id="about-heading">덜어낼수록,<br>선명해지는 마음.</h2><p class="about-calligraphy">우리는 문장과 공간 사이에<br>당신만의 이야기를 씁니다.</p><p>여백은 글씨가 가진 온도를 믿는 캘리그라피 스튜디오입니다. 한 획의 작은 떨림, 문장 사이의 숨, 종이 위에 남는 온기를 모아 오래 기억될 장면을 만듭니다.</p><div class="about-services"><span>브랜드 캘리그라피</span><span>공간과 아트워크</span><span>마음을 담은 한 문장</span></div><p class="demo-note">이 공간은 20가지 표현을 탐색하는 콘셉트 시안입니다. 현재 문장과 스튜디오 정보는 예시로 구성되어 있습니다.</p><button class="solid-button" data-action="contact">당신의 이야기 들려주기 ${icon('diagonal')}</button></dialog>
  <dialog class="info-dialog" id="contact-dialog" aria-labelledby="contact-heading"><button class="close-button" data-close aria-label="함께 쓰기 닫기">${icon('close')}</button><span class="overline">LET’S WRITE TOGETHER</span><h2 id="contact-heading">어떤 이야기를<br>담고 싶으신가요?</h2><p>작은 생각에서 시작해도 좋아요.<br>당신의 마음을 한 문장에 담아볼게요.</p><form id="contact-form"><label>이름<input name="name" placeholder="어떻게 불러드릴까요?" required maxlength="50" autocomplete="name"></label><label>이메일<input type="email" name="email" placeholder="hello@example.com" required autocomplete="email"></label><label>함께 쓰고 싶은 이야기<textarea name="message" placeholder="브랜드, 소중한 날, 혹은 마음에 담아둔 한 문장…" required maxlength="2000" rows="3"></textarea></label><p class="demo-note">시안 체험용 양식으로, 내용은 실제 전송되거나 저장되지 않습니다.</p><button class="solid-button" type="submit">문의 미리보기 ${icon('diagonal')}</button><div class="form-result" role="status" hidden></div></form></dialog>
  <div class="toast" role="status" aria-live="polite"></div>
`;

const main = document.querySelector('.scenes');
const gallery = document.querySelector('.gallery-dialog');
const sections = [...document.querySelectorAll('.scene')];
const saveButton = document.querySelector('.save-button');
let toastTimer;
function toast(message) {
  const el = document.querySelector('.toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2400);
}
function updateSaved() {
  saveButton.classList.toggle('is-saved', saved.has(active));
  saveButton.setAttribute('aria-pressed', String(saved.has(active)));
  saveButton.querySelector('span').textContent = saved.has(active) ? '마음에 담았어요' : '마음에 담기';
  document.querySelector('.saved-filter b').textContent = saved.size;
}
function setActive(index) {
  active = index;
  const scene = scenes[index];
  document.body.dataset.dark = ['dark'].includes(scene.category) || ['forest'].includes(scene.theme);
  document.querySelector('#current-number').textContent = pad(index+1);
  document.querySelector('[data-action="previous"]').disabled = index === 0;
  document.querySelector('[data-action="next"]').setAttribute('aria-label', index === 19 ? '첫 번째 시안으로' : '다음 시안');
  document.querySelector('.scroll-hint').classList.toggle('hidden', index !== 0);
  document.querySelectorAll('.rail-dot').forEach((el, i) => {
    el.classList.toggle('active', i === index);
    if (i === index) el.setAttribute('aria-current','true'); else el.removeAttribute('aria-current');
  });
  sections.forEach((el,i) => el.classList.toggle('is-active', i === index));
  history.replaceState(null, '', `#scene-${pad(index+1)}`);
  updateSaved();
}
function goTo(index, instant = false) {
  const target = Math.max(0, Math.min(19,index));
  main.scrollTo({top: sections[target].offsetTop, behavior: instant || reduceMotion.matches ? 'instant' : 'smooth'});
}
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if(entry.isIntersecting) setActive(Number(entry.target.dataset.index));
}), {root: main, threshold: .6});
sections.forEach(el=>observer.observe(el));

function openDialog(dialog) {
  document.querySelectorAll('dialog[open]').forEach(el=>el.close());
  dialog.showModal();
}
function renderGallery() {
  const filtered = scenes.map((scene,index)=>({scene,index})).filter(({scene,index}) => (filter === 'all' || scene.category === filter) && (!savedOnly || saved.has(index)));
  document.querySelector('.gallery-grid').innerHTML = filtered.length ? filtered.map(({scene,index})=>`<article class="gallery-card"><button class="thumbnail theme-${scene.theme} layout-${scene.layout}" data-page="${index}" aria-label="${pad(index+1)} ${scene.title} 시안 보기">${art(scene,true)}<span class="thumbnail-open">시안 보기 ${icon('diagonal')}</span></button><div class="card-info"><button data-page="${index}"><span>${pad(index+1)}</span><h3>${scene.title}</h3></button><button class="card-save${saved.has(index)?' is-saved':''}" data-save="${index}" aria-label="${scene.title} ${saved.has(index)?'저장 취소':'저장'}" aria-pressed="${saved.has(index)}">${icon('bookmark')}</button></div><p>${scene.mood}</p></article>`).join('') : `<div class="empty-state">${icon('bookmark')}<h3>아직 이곳은 여백이에요.</h3><p>${savedOnly ? '마음에 드는 시안의 책갈피를 눌러 담아보세요.' : '다른 배경을 선택해 보세요.'}</p><button class="filter-reset">모든 시안 둘러보기 ${icon('arrow')}</button></div>`;
}
function toggleSave(index) {
  if(saved.has(index)) { saved.delete(index); toast('담아둔 시안을 비웠습니다.'); }
  else { saved.add(index); toast(`${pad(index+1)}. ${scenes[index].title} — 마음에 담았습니다.`); }
  try { localStorage.setItem('yeobaek-saved', JSON.stringify([...saved])); } catch { toast('현재 브라우저에서는 저장이 유지되지 않을 수 있습니다.'); }
  updateSaved();
  if(gallery.open) renderGallery();
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if(!button) return;
  if(button.hasAttribute('data-close')) { button.closest('dialog').close(); return; }
  if(button.dataset.page !== undefined) { if(gallery.open) gallery.close(); goTo(Number(button.dataset.page)); return; }
  if(button.dataset.save !== undefined) { toggleSave(Number(button.dataset.save)); return; }
  if(button.dataset.filter) {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(el=>{el.classList.toggle('selected', el.dataset.filter === filter); el.setAttribute('aria-pressed',String(el.dataset.filter===filter));});
    renderGallery(); return;
  }
  if(button.classList.contains('saved-filter')) {
    savedOnly = !savedOnly; button.setAttribute('aria-pressed',String(savedOnly)); renderGallery(); return;
  }
  if(button.classList.contains('filter-reset')) {
    savedOnly = false; filter='all';
    document.querySelector('.saved-filter').setAttribute('aria-pressed','false');
    document.querySelectorAll('[data-filter]').forEach(el=>{ el.classList.toggle('selected',el.dataset.filter==='all');el.setAttribute('aria-pressed',String(el.dataset.filter==='all')); });
    renderGallery(); return;
  }
  switch(button.dataset.action) {
    case 'home': goTo(0); break;
    case 'gallery': renderGallery(); openDialog(gallery); break;
    case 'about': openDialog(document.querySelector('#about-dialog')); break;
    case 'contact': openDialog(document.querySelector('#contact-dialog')); break;
    case 'save': toggleSave(active); break;
    case 'previous': goTo(active-1); break;
    case 'next': goTo((active+1)%20); break;
  }
});
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if(event.target === dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close(); }
}));
document.addEventListener('keydown', event => {
  if(document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName) || event.metaKey || event.ctrlKey || event.altKey) return;
  if(['ArrowDown','PageDown','ArrowUp','PageUp','Home','End'].includes(event.key)) {
    event.preventDefault();
    goTo(event.key==='Home'?0:event.key==='End'?19:active+(['ArrowDown','PageDown'].includes(event.key)?1:-1));
  }
});
let pointerFrame = 0;
main.addEventListener('pointermove',event=> {
  if(reduceMotion.matches || event.pointerType === 'touch' || pointerFrame) return;
  pointerFrame=requestAnimationFrame(()=>{
    const rect=main.getBoundingClientRect();
    sections[active].style.setProperty('--mx', (event.clientX/rect.width-.5).toFixed(3));
    sections[active].style.setProperty('--my', (event.clientY/rect.height-.5).toFixed(3));
    sections[active].style.setProperty('--px',`${event.clientX/rect.width*100}%`);
    sections[active].style.setProperty('--py',`${event.clientY/rect.height*100}%`);
    pointerFrame=0;
  });
});
main.addEventListener('pointerleave',()=>{sections[active].style.setProperty('--mx',0);sections[active].style.setProperty('--my',0);});
document.querySelector('#contact-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const result = form.querySelector('.form-result');
  result.hidden = false;
  result.innerHTML = `<strong>${esc(String(values.get('name')))}님의 이야기</strong><p>${esc(String(values.get('message')))}</p><small>${esc(String(values.get('email')))} · 미리보기 완료. 실제로 전송되지 않았습니다.</small>`;
  result.scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth',block:'nearest'});
});
const initial = /^#scene-(\d+)$/.exec(location.hash);
setActive(0);
if(initial) requestAnimationFrame(()=>goTo(Number(initial[1])-1,true));
