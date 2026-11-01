// Calligraphy images the visitor adds for comparison. They stay in this
// browser (IndexedDB) and are never uploaded anywhere.
const DB_NAME = 'yeobaek-compare';
const STORE = 'images';
const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const THEMES = [['white', 'light'], ['rice', 'texture'], ['parchment', 'texture'], ['linen', 'texture']];

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = action(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result?.result ?? result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const isImageFile = (file) => file.type.startsWith('image/') || IMAGE_PATTERN.test(file.name);

const titleOf = (name) => name.replace(/\.[^.]+$/, '');

// Uploaded images become ordinary scenes, so the page, gallery, rail and hash
// navigation treat them exactly like the built-in artworks.
export function toScene(record, index) {
  const [theme, category] = THEMES[index % THEMES.length];
  const title = titleOf(record.name);
  return {
    id: `upload-${record.id}`, uploadId: record.id, upload: true,
    title, english: title, label: '내 캘리그라피', category, theme, layout: 'center', effect: 'float',
    artwork: URL.createObjectURL(record.blob), fileName: record.name,
    lines: [title], note: `${record.name} · 직접 추가한 작품`, mood: '비교 · 내 작품',
    en: { lines: [title], note: `${record.name} · Added by you`, mood: 'Compare · Your work' },
  };
}

export async function loadUploads() {
  try {
    const records = await run('readonly', (store) => store.getAll());
    return records.sort((a, b) => a.added - b.added || a.order - b.order);
  } catch { return []; }
}

export async function addUploads(files) {
  const images = [...files].filter(isImageFile)
    .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
  const added = Date.now();
  const records = images.map((file, order) => ({
    id: `${added.toString(36)}-${order}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name, type: file.type, blob: file, added, order,
  }));
  if (records.length) await run('readwrite', (store) => records.forEach((record) => store.put(record)));
  return { records, skipped: files.length - images.length };
}

export async function removeUpload(id) {
  await run('readwrite', (store) => store.delete(id));
}

export async function clearUploads() {
  await run('readwrite', (store) => store.clear());
}
