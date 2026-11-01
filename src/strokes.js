// Recovers writing strokes from a calligraphy image so it can be "written"
// again. There is no stroke data in a scan, so the ink is thinned to its
// centre line (Zhang–Suen), the skeleton is traced into a graph, short spurs
// are pruned, branches that pass straight through a junction are joined into
// one stroke, and the strokes are put in reading and stroke order
// (top→bottom, left→right). Each stroke later drives a mask that reveals the
// real ink, so the result always matches the original artwork.

const WORK_SIDE = 720;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function inkMask(data, w, h) {
  const n = w * h;
  const alpha = new Uint8Array(n);
  let transparent = 0;
  for (let p = 0; p < n; p++) { alpha[p] = data[p * 4 + 3]; if (alpha[p] < 250) transparent++; }
  const mask = new Uint8Array(n);
  if (transparent > n * .05) {
    for (let p = 0; p < n; p++) mask[p] = alpha[p] > 90 ? 1 : 0;
    return mask;
  }
  // Opaque scan: ink is whatever is clearly darker than the paper.
  const lum = new Float32Array(n);
  for (let p = 0; p < n; p++) lum[p] = .299 * data[p * 4] + .587 * data[p * 4 + 1] + .114 * data[p * 4 + 2];
  const sorted = Float32Array.from(lum).sort();
  const paper = sorted[Math.floor(n * .9)];
  const ink = sorted[Math.floor(n * .01)];
  const cut = paper - Math.max(25, (paper - ink) * .4);
  for (let p = 0; p < n; p++) mask[p] = lum[p] < cut ? 1 : 0;
  return mask;
}

function thin(img, w, h) {
  const remove = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      remove.length = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!img[i]) continue;
        const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1];
        const p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (a !== 1) continue;
        if (pass === 0 ? (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) : (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0)) remove.push(i);
      }
      if (remove.length) { changed = true; for (const i of remove) img[i] = 0; }
    }
  }
}

// Chamfer distance to the background: half the local stroke width.
function distance(mask, w, h) {
  const d = new Float32Array(w * h);
  const INF = 1e6;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + 1.414); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.414); }
    d[i] = x === 0 || y === 0 ? Math.min(v, 1) : v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.414); if (x > 0) v = Math.min(v, d[i + w - 1] + 1.414); }
    d[i] = v;
  }
  return d;
}

function label(mask, w, h) {
  const comp = new Int32Array(w * h).fill(-1);
  const boxes = [];
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || comp[s] >= 0) continue;
    const id = boxes.length;
    const box = { id, x0: w, y0: h, x1: 0, y1: 0, area: 0 };
    comp[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i - x) / w;
      box.area++;
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && comp[j] < 0) { comp[j] = id; stack.push(j); }
      }
    }
    boxes.push(box);
  }
  return { comp, boxes };
}

const OFFSETS = (w) => [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1]; // N NE E SE S SW W NW (clockwise)

function traceSkeleton(sk, w, h) {
  const off = OFFSETS(w);
  const n = sk.length;
  const degree = new Uint8Array(n);
  const crossings = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!sk[i]) continue;
    const x = i % w, y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { sk[i] = 0; continue; }
    let deg = 0, cross = 0;
    for (let k = 0; k < 8; k++) {
      const a = sk[i + off[k]], b = sk[i + off[(k + 1) % 8]];
      deg += a; if (!a && b) cross++;
    }
    degree[i] = deg; crossings[i] = cross;
  }
  const isNode = (i) => degree[i] <= 1 || crossings[i] >= 3;
  // Junction pixels that touch form one junction.
  const cluster = new Int32Array(n).fill(-1);
  let clusters = 0;
  for (let i = 0; i < n; i++) {
    if (!sk[i] || !isNode(i) || cluster[i] >= 0) continue;
    const id = clusters++;
    const stack = [i]; cluster[i] = id;
    if (degree[i] > 1) while (stack.length) {
      const c = stack.pop();
      for (const o of off) { const j = c + o; if (sk[j] && cluster[j] < 0 && isNode(j) && degree[j] > 1) { cluster[j] = id; stack.push(j); } }
    }
  }
  const visited = new Uint8Array(n);
  const edges = [];
  const seenShort = new Set();
  // Next pixel along a branch: stop at a node (other than the junction we just
  // left), otherwise prefer 4-connected steps so staircase corners are consumed.
  const prefer = (c, from, startCluster, steps) => {
    const options = [];
    for (let k = 0; k < 8; k++) {
      const j = c + off[k];
      if (!sk[j] || j === from) continue;
      if (isNode(j)) { if (cluster[j] !== startCluster || steps > 3) options.push({ j, node: true, k }); continue; }
      if (!visited[j]) options.push({ j, node: false, k });
    }
    return options.find((o) => o.node) || options.find((o) => o.k % 2 === 0) || options[0];
  };
  for (let s = 0; s < n; s++) {
    if (!sk[s] || !isNode(s)) continue;
    if (degree[s] === 0) { edges.push({ px: [s] }); continue; }
    for (const o of off) {
      const q = s + o;
      if (!sk[q]) continue;
      if (isNode(q)) {
        if (cluster[q] === cluster[s]) continue;
        const key = s < q ? `${s}:${q}` : `${q}:${s}`;
        if (!seenShort.has(key)) { seenShort.add(key); edges.push({ px: [s, q] }); }
        continue;
      }
      if (visited[q]) continue;
      const px = [s, q];
      visited[q] = 1;
      let prev = s, cur = q;
      for (;;) {
        const next = prefer(cur, prev, cluster[s], px.length);
        if (!next) break;
        px.push(next.j);
        if (next.node) break;
        visited[next.j] = 1;
        prev = cur; cur = next.j;
      }
      edges.push({ px });
    }
  }
  // Leftovers without nodes are either closed rings (ㅇ, o) or open runs the
  // branch walk could not reach. Rings start at the top and go anticlockwise;
  // open runs start at their loosest end. Only true rings are closed.
  for (let s = 0; s < n; s++) {
    if (!sk[s] || visited[s] || isNode(s)) continue;
    const group = [s]; const seen = new Set([s]);
    for (let g = 0; g < group.length; g++) for (const o of off) { const j = group[g] + o; if (sk[j] && !visited[j] && !isNode(j) && !seen.has(j)) { seen.add(j); group.push(j); } }
    const inGroup = (j) => seen.has(j) && !visited[j];
    const links = (i) => off.reduce((c, o) => c + (inGroup(i + o) ? 1 : 0), 0);
    const loose = group.filter((i) => links(i) <= 1);
    const ring = !loose.length;
    const start = ring ? Math.min(...group) : loose[0];
    const px = [start]; visited[start] = 1;
    let cur = start;
    for (;;) {
      const options = [];
      for (let k = 0; k < 8; k++) { const j = cur + off[k]; if (inGroup(j)) options.push({ j, k }); }
      if (!options.length) break;
      options.sort((a, b) => (px.length === 1 && ring ? (a.j % w) - (b.j % w) : (a.k % 2) - (b.k % 2)));
      cur = options[0].j; visited[cur] = 1; px.push(cur);
    }
    const closes = ring && px.length > 8 && off.some((o) => cur + o === start);
    if (closes) px.push(start);
    if (px.length > 2) edges.push({ px, loop: closes });
  }
  return { edges, cluster, degree };
}

function point(i, w) { const x = i % w; return [x, (i - x) / w]; }

function endDirection(px, atStart, w) {
  const k = Math.min(px.length - 1, 7);
  const [ax, ay] = point(atStart ? px[0] : px[px.length - 1], w);
  const [bx, by] = point(atStart ? px[k] : px[px.length - 1 - k], w);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  return [(bx - ax) / len, (by - ay) / len];
}

// Joins branches that continue straight through a junction into one stroke
// and drops short spurs that thinning leaves at stroke ends and corners.
function buildStrokes(edges, cluster, degree, dist, w) {
  const radiusAt = (i) => dist[i] || 1;
  let list = edges.filter((e) => e.px.length > 0);
  for (let round = 0; round < 2; round++) {
    const ends = new Map();
    list.forEach((e, idx) => {
      if (e.loop) return;
      [0, 1].forEach((side) => {
        const node = side ? e.px[e.px.length - 1] : e.px[0];
        const c = cluster[node];
        if (degree[node] > 1 && c >= 0) { if (!ends.has(c)) ends.set(c, []); ends.get(c).push(idx); }
      });
    });
    list = list.filter((e) => {
      if (e.loop || e.px.length < 2) return true;
      const a = e.px[0], b = e.px[e.px.length - 1];
      const tipA = degree[a] <= 1, tipB = degree[b] <= 1;
      if (tipA === tipB) return true;
      const junction = tipA ? b : a;
      if ((ends.get(cluster[junction]) || []).length < 3) return true;
      return e.px.length > Math.max(4, radiusAt(junction) * 1.6);
    });
  }
  const ends = new Map();
  list.forEach((e, idx) => {
    if (e.loop || e.px.length < 2) return;
    [0, 1].forEach((side) => {
      const node = side ? e.px[e.px.length - 1] : e.px[0];
      const c = cluster[node];
      if (degree[node] <= 1 || c < 0) return; // only real junctions join strokes
      if (!ends.has(c)) ends.set(c, []);
      ends.get(c).push({ idx, side, dir: endDirection(e.px, side === 0, w) });
    });
  });
  const link = new Map();
  const key = (idx, side) => idx * 2 + side;
  for (const group of ends.values()) {
    const pairs = [];
    for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
      if (group[a].idx === group[b].idx) continue;
      const dot = group[a].dir[0] * group[b].dir[0] + group[a].dir[1] * group[b].dir[1];
      if (dot < (group.length === 2 ? -.2 : -.72)) pairs.push({ a: group[a], b: group[b], dot });
    }
    pairs.sort((p, q) => p.dot - q.dot);
    for (const { a, b } of pairs) {
      const ka = key(a.idx, a.side), kb = key(b.idx, b.side);
      if (link.has(ka) || link.has(kb)) continue;
      link.set(ka, kb); link.set(kb, ka);
    }
  }
  const used = new Uint8Array(list.length);
  const strokes = [];
  const follow = (startIdx, enterSide) => {
    const px = [];
    let idx = startIdx, side = enterSide;
    while (idx !== undefined && !used[idx]) {
      used[idx] = 1;
      const seg = side === 0 ? list[idx].px : [...list[idx].px].reverse();
      px.push(...(px.length ? seg.slice(1) : seg));
      const out = key(idx, 1 - side);
      const next = link.get(out);
      if (next === undefined) break;
      idx = next >> 1; side = next & 1;
    }
    return px;
  };
  list.forEach((e, idx) => {
    if (used[idx]) return;
    if (e.loop) { used[idx] = 1; strokes.push({ px: e.px, loop: true }); return; }
    if (link.has(key(idx, 0)) && link.has(key(idx, 1))) return; // middle of a chain or a cycle; picked up later
    strokes.push({ px: follow(idx, link.has(key(idx, 0)) ? 1 : 0) });
  });
  list.forEach((e, idx) => { if (!used[idx]) strokes.push({ px: follow(idx, 0) }); });
  return strokes;
}

function smooth(points) {
  if (points.length < 5) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    let sx = 0, sy = 0, c = 0;
    for (let k = -2; k <= 2; k++) { const p = points[Math.min(points.length - 1, Math.max(0, i + k))]; sx += p[0]; sy += p[1]; c++; }
    out.push([sx / c, sy / c]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function simplify(points, epsilon) {
  if (points.length < 3) return points;
  // A closed or nearly closed run has no usable chord: split it at its
  // farthest point and simplify the halves.
  const [sx, sy] = points[0], [ex, ey] = points[points.length - 1];
  if (Math.hypot(ex - sx, ey - sy) < 3 && points.length > 6) {
    let far = 1, best = 0;
    points.forEach(([x, y], i) => { const d = Math.hypot(x - sx, y - sy); if (d > best) { best = d; far = i; } });
    return [...simplify(points.slice(0, far + 1), epsilon).slice(0, -1), ...simplify(points.slice(far), epsilon)];
  }
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let worst = 0, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - points[i][1]) - (ax - points[i][0]) * (by - ay)) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > epsilon) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

// Catmull–Rom through the points, written as cubic Béziers.
function pathData(points, scale) {
  const p = points.map(([x, y]) => [(x + .5) * scale, (y + .5) * scale]);
  const f = (v) => Math.round(v * 10) / 10;
  if (p.length === 1) return `M${f(p[0][0])} ${f(p[0][1])}l.1 0`;
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// Groups glyph pieces into lines and characters, then orders strokes inside
// each character top→bottom, left→right as in hangul, hanzi and latin hands.
function order(strokes, boxes, vertical) {
  const pieces = boxes.filter((b) => strokes.some((s) => s.comp === b.id));
  const lineAxis = vertical ? ['x0', 'x1'] : ['y0', 'y1'];
  const flowAxis = vertical ? ['y0', 'y1'] : ['x0', 'x1'];
  const lines = [];
  for (const piece of [...pieces].sort((a, b) => (a[lineAxis[0]] + a[lineAxis[1]]) - (b[lineAxis[0]] + b[lineAxis[1]]))) {
    const size = piece[lineAxis[1]] - piece[lineAxis[0]] + 1;
    const line = lines.find((l) => overlap(l.a0, l.a1, piece[lineAxis[0]], piece[lineAxis[1]] + 1) > Math.min(size, l.a1 - l.a0) * .35);
    if (line) { line.items.push(piece); line.a0 = Math.min(line.a0, piece[lineAxis[0]]); line.a1 = Math.max(line.a1, piece[lineAxis[1]] + 1); }
    else lines.push({ a0: piece[lineAxis[0]], a1: piece[lineAxis[1]] + 1, items: [piece] });
  }
  lines.sort((a, b) => (vertical ? b.a0 - a.a0 : a.a0 - b.a0)); // vertical text runs right to left
  const rank = new Map();
  lines.forEach((line, li) => {
    const chars = [];
    for (const piece of [...line.items].sort((a, b) => a[flowAxis[0]] - b[flowAxis[0]])) {
      const size = piece[flowAxis[1]] - piece[flowAxis[0]] + 1;
      const char = chars.find((c) => overlap(c.f0, c.f1, piece[flowAxis[0]], piece[flowAxis[1]] + 1) > size * .3);
      if (char) { char.f1 = Math.max(char.f1, piece[flowAxis[1]] + 1); char.items.push(piece); }
      else chars.push({ f0: piece[flowAxis[0]], f1: piece[flowAxis[1]] + 1, items: [piece] });
    }
    chars.forEach((char, ci) => char.items.forEach((piece) => rank.set(piece.id, [li, ci])));
  });
  for (const s of strokes) [s.line, s.char] = rank.get(s.comp) || [0, 0];
  return strokes.sort((a, b) => a.line - b.line || a.char - b.char || (a.y0 + a.x0 * .45) - (b.y0 + b.x0 * .45));
}

export async function analyzeInk(url) {
  const image = await loadImage(url);
  const W = image.naturalWidth, H = image.naturalHeight;
  const scale = Math.min(1, WORK_SIDE / Math.max(W, H));
  const w = Math.max(8, Math.round(W * scale)) + 2, h = Math.max(8, Math.round(H * scale)) + 2;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 1, 1, w - 2, h - 2);
  const mask = inkMask(context.getImageData(0, 0, w, h).data, w, h);
  for (let x = 0; x < w; x++) mask[x] = mask[(h - 1) * w + x] = 0;
  for (let y = 0; y < h; y++) mask[y * w] = mask[y * w + w - 1] = 0;
  const { comp, boxes } = label(mask, w, h);
  // Specks of paper grain are not strokes; they appear with the final fade-in.
  const minArea = Math.max(14, w * h * .00012);
  for (let i = 0; i < mask.length; i++) if (mask[i] && boxes[comp[i]].area < minArea) mask[i] = 0;
  const dist = distance(mask, w, h);
  const skeleton = Uint8Array.from(mask);
  thin(skeleton, w, h);
  const { edges, cluster, degree } = traceSkeleton(skeleton, w, h);
  const toImage = W / (w - 2);
  let strokes = buildStrokes(edges, cluster, degree, dist, w).map((s) => {
    let pts = s.px.map((i) => { const [x, y] = point(i, w); return [x - 1, y - 1]; });
    const radii = s.px.map((i) => dist[i]).sort((a, b) => a - b);
    const r = radii[Math.floor(radii.length * .9)] || 1;
    // Write horizontals left→right and the rest top→bottom.
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    if (!s.loop && (Math.abs(bx - ax) > Math.abs(by - ay) * 1.2 ? bx < ax : by < ay)) pts.reverse();
    const length = pts.reduce((sum, p, i) => sum + (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    pts = simplify(smooth(pts), .6);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return {
      d: pathData(pts, toImage), width: (2 * r + 2.5) * toImage, length: Math.max(1, length) * toImage,
      comp: comp[s.px[0]], x0: Math.min(...xs), y0: Math.min(...ys), loop: Boolean(s.loop),
    };
  }).filter((s) => s.comp >= 0 && (s.length > 2 * toImage || boxes[s.comp].area >= minArea));
  strokes = order(strokes, boxes, H > W * 1.3);
  return { width: W, height: H, strokes };
}
