// Calligraphy candidates the visitor loads to try on a chosen homepage scene.
// They stay in this browser (IndexedDB) and are never uploaded anywhere.
const DB_NAME = 'yeobaek-compare';
const STORE = 'candidates';
const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
export const MAX_CANDIDATES = 30;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      [...db.objectStoreNames].forEach((name) => db.deleteObjectStore(name));
      db.createObjectStore(STORE, { keyPath: 'order' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const isImageFile = (file) => file.type.startsWith('image/') || IMAGE_PATTERN.test(file.name);

const withUrl = (record) => {
  const url = URL.createObjectURL(record.blob);
  return { ...record, url, inkUrl: record.ink ? URL.createObjectURL(record.ink) : url };
};

const MAX_SIDE = 2400;
const percentile = (values, p) => { const sorted = Float32Array.from(values).sort(); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]; };

// Lifts the ink off a scanned sheet: the paper colour (estimated from the
// border) becomes transparent and each pixel keeps its original ink colour, so
// red seals stay red. Images that already have transparency are kept as they are.
export async function extractInk(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return null; }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const image = context.getImageData(0, 0, w, h);
  const d = image.data;
  const band = Math.max(2, Math.round(Math.min(w, h) * .03));
  const border = [[], [], [], []];
  const step = Math.max(1, Math.round((w + h) / 1500));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    if (x >= band && x < w - band && y >= band && y < h - band) continue;
    const i = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) border[c].push(d[i + c]);
  }
  if (percentile(border[3], .5) < 250) return file; // Already a cut-out.
  const paper = [0, 1, 2].map((c) => percentile(border[c], .5));
  const paperL = .299 * paper[0] + .587 * paper[1] + .114 * paper[2];
  const lum = new Float32Array(w * h);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) lum[p] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
  const sample = []; for (let p = 0; p < lum.length; p += Math.max(1, Math.floor(lum.length / 200000))) sample.push(lum[p]);
  const inkL = Math.min(paperL - 40, percentile(sample, .005));
  const range = Math.max(40, paperL - inkL);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    // Colour distance catches coloured ink (e.g. a red seal) on light paper.
    const chroma = Math.max(Math.abs(d[i] - paper[0]), Math.abs(d[i + 1] - paper[1]), Math.abs(d[i + 2] - paper[2]));
    const depth = Math.max(paperL - lum[p], chroma * .8) / range;
    const a = Math.min(1, Math.max(0, (depth - .1) / .75));
    if (a <= 0) { d[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.max(0, (d[i + c] - (1 - a) * paper[c]) / a));
    d[i + 3] = Math.round(a * 255);
  }
  context.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

export async function loadCandidates() {
  try { return ((await run('readonly', (store) => store.getAll())) || []).sort((a, b) => a.order - b.order).map(withUrl); }
  catch { return []; }
}

// A new selection replaces the previous candidate set. Only image files count
// toward the limit; anything past it is reported back as `overflow`.
export async function replaceCandidates(files) {
  const images = [...files].filter(isImageFile)
    .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
  const records = [];
  for (const [order, file] of images.slice(0, MAX_CANDIDATES).entries()) records.push({ order, name: file.name, blob: file, ink: await extractInk(file) });
  let stored = true;
  try {
    await run('readwrite', (store) => { store.clear(); records.forEach((record) => store.put(record)); });
  } catch { stored = false; }
  return { candidates: records.map(withUrl), skipped: files.length - images.length, overflow: Math.max(0, images.length - MAX_CANDIDATES), stored };
}

export async function clearCandidates() {
  try { await run('readwrite', (store) => store.clear()); } catch { /* Nothing stored. */ }
}
