// Recovers writing strokes from a calligraphy image so it can be "written"
// again, the way a calligrapher would write it.
//
// 1. Skeleton: the ink is thinned to its centre line (Zhang–Suen) and traced
//    into a graph; spurs are pruned and branches running straight through a
//    junction are joined.
// 2. Stroke grammar: centre lines are split at sharp corners, every piece is
//    given its writing direction (horizontals left→right, others top→bottom,
//    rising/falling diagonals by brush pressure), and pieces are re-joined
//    where one brush movement turns a corner: 横折/ㄱ (right then down),
//    竖折/ㄴ (down then right, unless it closes a box like the bottom of ㅁ/口),
//    横撇/ㅈ and hooks. Rings (ㅇ) start at the top and turn anticlockwise.
// 3. Stroke order inside each character follows the rules shared by hangul
//    and hanzi: top→bottom, left→right, a stroke that branches off another
//    comes after it (ㅏ) and one that runs into another comes before it (ㅓ),
//    horizontal before vertical at a crossing (十), 撇 before 捺 (人), the
//    closing bottom stroke last (口, 日), and the centre before the wings
//    (小, 水). Syllables come out as initial → vowel → final.
// 4. One stroke, one movement: every ink pixel is assigned to the stroke and
//    the point along it that it belongs to, so a thick stroke appears in a
//    single pass of the brush instead of being painted in several.

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

// Direction a branch leaves a junction, measured a few stroke widths out:
// right at a thick junction the centre line still bends toward the blob.
function endDirection(px, atStart, w, reach = 7) {
  const k = Math.min(px.length - 1, Math.max(7, Math.round(reach)));
  const [ax, ay] = point(atStart ? px[0] : px[px.length - 1], w);
  const [bx, by] = point(atStart ? px[k] : px[px.length - 1 - k], w);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  return [(bx - ax) / len, (by - ay) / len];
}

// Joins branches that continue straight through a junction into one stroke
// and drops short spurs that thinning leaves at stroke ends and corners.
function buildChains(edges, cluster, degree, dist, w) {
  const radiusAt = (i) => dist[i] || 1;
  // Thinning splits a crossing of two thick strokes (十, 中) into two nearby
  // junctions joined by a short link: treat them as one crossing.
  const root = new Map();
  const find = (c) => { while (root.has(c) && root.get(c) !== c) c = root.get(c); return c; };
  edges = edges.filter((e) => {
    if (e.loop || e.px.length < 2) return true;
    const a = e.px[0], b = e.px[e.px.length - 1];
    if (degree[a] <= 1 || degree[b] <= 1 || cluster[a] < 0 || cluster[b] < 0) return true;
    if (e.px.length > Math.max(4, Math.max(radiusAt(a), radiusAt(b)) * 2.6)) return true;
    const ca = find(cluster[a]), cb = find(cluster[b]);
    if (ca !== cb) root.set(ca, cb);
    return false;
  });
  if (root.size) for (let i = 0; i < cluster.length; i++) if (cluster[i] >= 0) cluster[i] = find(cluster[i]);
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
      ends.get(c).push({ idx, side, dir: endDirection(e.px, side === 0, w, radiusAt(node) * 3) });
    });
  });
  const link = new Map();
  const key = (idx, side) => idx * 2 + side;
  for (const group of ends.values()) {
    const pairs = [];
    for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
      if (group[a].idx === group[b].idx) continue;
      const dot = group[a].dir[0] * group[b].dir[0] + group[a].dir[1] * group[b].dir[1];
      // Two branches meeting at a "junction" is just a thick corner: always one line.
      if (group.length === 2 || dot < -.72) pairs.push({ a: group[a], b: group[b], dot });
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
  // Whatever is left is a cycle of joined branches (the box of 中 or 日): a ring.
  list.forEach((e, idx) => {
    if (used[idx]) return;
    const px = follow(idx, 0);
    const closed = px.length > 8 && px[0] === px[px.length - 1];
    strokes.push({ px: closed ? px.slice(0, -1) : px, loop: closed });
  });
  return strokes;
}

// ---------------------------------------------------------------- geometry
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

function smoothPoints(points, loop) {
  const n = points.length;
  if (n < 5) return points.map((p) => [...p]);
  return points.map((p, i) => {
    if (!loop && (i === 0 || i === n - 1)) return [...p];
    let sx = 0, sy = 0, c = 0;
    for (let k = -2; k <= 2; k++) {
      const j = loop ? (i + k + n) % n : Math.min(n - 1, Math.max(0, i + k));
      sx += points[j][0]; sy += points[j][1]; c++;
    }
    return [sx / c, sy / c];
  });
}

function lengthOf(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += D(pts[i], pts[i - 1]); return s; }

// Indices where the centre line turns sharply (a brush corner or a pen lift).
function corners(pts, k, loop) {
  const n = pts.length;
  if (n < 2 * k + 1) return [];
  const angle = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!loop && (i < k || i >= n - k)) continue;
    const a = pts[(i - k + n) % n], b = pts[i], c = pts[(i + k) % n];
    const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const l = Math.hypot(...v1) * Math.hypot(...v2);
    if (l) angle[i] = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / l)));
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (angle[i] < 0.9) continue; // ~52°
    let peak = true;
    for (let d = 1; d <= k && peak; d++) {
      const l = loop ? (i - d + n) % n : i - d, r = loop ? (i + d) % n : i + d;
      if ((l >= 0 && angle[l] > angle[i]) || (r < n && angle[r] >= angle[i])) peak = false;
    }
    if (peak) out.push(i);
  }
  return out;
}

// ---------------------------------------------------------- stroke grammar
// Writing direction of one straight-ish piece. Horizontals go left→right and
// everything else top→bottom; a flat stroke rising to the right (提) and a
// flat 撇 falling to the left share a shape, so the heavier (pressed) end wins.
function isAmbiguous(piece) {
  const a = piece.pts[0], b = piece.pts[piece.pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return dx * dy < 0 && Math.abs(dy) > Math.abs(dx) * .25 && Math.abs(dx) > Math.abs(dy) * .25 && Math.abs(dy) < Math.abs(dx) * .6;
}

function orient(piece, radius, prefer) {
  const a = piece.pts[0], b = piece.pts[piece.pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let flip;
  if (prefer && isAmbiguous(piece)) {
    flip = piece.from !== prefer; // continue the movement that ends at this corner
  } else if (isAmbiguous(piece)) {
    const ra = radius(a), rb = radius(b);
    flip = Math.abs(ra - rb) > Math.max(ra, rb) * .15 ? rb > ra : dy < 0;
  } else if (dx * dy < 0 && Math.abs(dy) >= Math.abs(dx) * .6) {
    flip = dy < 0; // 撇 and ㄱ's sweep fall to the left from the top
  } else flip = Math.abs(dx) > Math.abs(dy) ? dx < 0 : dy < 0;
  if (flip) { piece.pts.reverse(); [piece.from, piece.to] = [piece.to, piece.from]; }
  piece.horizontal = Math.abs(dx) > Math.abs(dy);
  return piece;
}

const tangent = (pts, atEnd, k) => {
  const n = pts.length;
  const a = atEnd ? pts[Math.max(0, n - 1 - k)] : pts[0];
  const b = atEnd ? pts[n - 1] : pts[Math.min(n - 1, k)];
  const l = D(a, b) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};

// Splits one skeleton chain into brush movements.
function movements(chain, k, radius) {
  const { pts, loop } = chain;
  const cs = corners(pts, k, loop);
  if (loop && cs.length < 2) {
    // A ring (ㅇ, o): start at the top and turn anticlockwise.
    let top = 0;
    pts.forEach((p, i) => { if (p[1] < pts[top][1]) top = i; });
    let ring = [...pts.slice(top), ...pts.slice(0, top)];
    if (ring.length > 2 && ring[Math.min(3, ring.length - 1)][0] > ring[0][0]) ring = [ring[0], ...ring.slice(1).reverse()];
    ring.push([...ring[0]]);
    return [{ pts: ring, ring: true }];
  }
  const pieces = [];
  if (loop) {
    for (let j = 0; j < cs.length; j++) {
      const a = cs[j], b = cs[(j + 1) % cs.length];
      const seg = a < b ? pts.slice(a, b + 1) : [...pts.slice(a), ...pts.slice(0, b + 1)];
      pieces.push({ pts: seg, from: `c${a}`, to: `c${b}` });
    }
  } else {
    const cuts = [0, ...cs, pts.length - 1];
    for (let j = 0; j < cuts.length - 1; j++) {
      pieces.push({ pts: pts.slice(cuts[j], cuts[j + 1] + 1), from: j ? `c${cuts[j]}` : 'free0', to: j < cuts.length - 2 ? `c${cuts[j + 1]}` : 'free1' });
    }
  }
  pieces.forEach((p) => { p.length = lengthOf(p.pts); if (!isAmbiguous(p)) orient(p, radius); });
  const at = (key) => pieces.filter((p) => p.from === key || p.to === key);
  // A flat diagonal (撇 or 提) continues a movement that arrives at its corner.
  pieces.filter(isAmbiguous).forEach((p) => {
    const arriving = [p.from, p.to].find((c) => c.startsWith('c') && at(c).some((q) => q !== p && !isAmbiguous(q) && q.to === c));
    orient(p, radius, arriving);
  });
  const next = new Map(), prev = new Map();
  const link = (a, b) => { if (next.has(a) || prev.has(b) || a === b) return; next.set(a, b); prev.set(b, a); };
  // Hooks: a short flick at the free end of a stroke belongs to that stroke.
  for (const p of pieces) {
    const freeEnd = p.from.startsWith('free') || p.to.startsWith('free');
    if (!freeEnd || pieces.length < 2) continue;
    const corner = p.from.startsWith('free') ? p.to : p.from;
    const host = at(corner).find((q) => q !== p);
    if (!host || p.length > Math.max(radius(p.pts[0]) * 2.6, host.length * .3)) continue;
    if (host.to === corner) { if (p.from !== corner) { p.pts.reverse(); [p.from, p.to] = [p.to, p.from]; } link(host, p); }
    else if (host.from === corner) { if (p.to !== corner) { p.pts.reverse(); [p.from, p.to] = [p.to, p.from]; } link(p, host); }
  }
  // Folds: one movement turning a corner (ㄱ 横折, ㄴ 竖折, ㅈ 横撇 …).
  for (const a of pieces) {
    if (!a.to.startsWith('c')) continue;
    const b = at(a.to).find((q) => q !== a && q.from === a.to);
    if (!b) continue;
    const ta = tangent(a.pts, true, k), tb = tangent(b.pts, false, k);
    if (ta[0] * tb[0] + ta[1] * tb[1] < -.85) continue; // a reversal is a new stroke
    if (!a.horizontal && b.horizontal) {
      // ㄴ-fold, unless the horizontal closes a box (bottom of ㅁ, 口, 日).
      // A box is closed when the bottom meets a stroke that came down from a
      // top-right fold (口, 日, ㅁ); 山's short right stroke does not count.
      const closer = at(b.to).find((q) => q !== b && q !== a && q.to === b.to
        && at(q.from).some((r) => r !== q && r.horizontal && r.to === q.from));
      if (closer) continue;
    }
    link(a, b);
  }
  const strokes = [];
  const used = new Set();
  const follow = (start) => {
    const out = [];
    for (let p = start; p && !used.has(p); p = next.get(p)) { used.add(p); out.push(...(out.length ? p.pts.slice(1) : p.pts)); }
    return out;
  };
  pieces.filter((p) => !prev.has(p)).forEach((p) => strokes.push({ pts: follow(p) }));
  pieces.filter((p) => !used.has(p)).forEach((p) => strokes.push({ pts: follow(p) })); // a fully folded ring
  return strokes;
}

// ------------------------------------------------------------- stroke order
function sampleBody(s, step) {
  const out = [{ p: s.pts[0], at: 0 }];
  let run = 0, last = 0;
  for (let i = 1; i < s.pts.length; i++) {
    run += D(s.pts[i], s.pts[i - 1]);
    if (run - last >= step || i === s.pts.length - 1) { out.push({ p: s.pts[i], at: run }); last = run; }
  }
  return out;
}

// Is point P on the body of stroke S, away from S's own ends?
function onBody(P, S, tol) {
  for (const { p, at } of S.samples) {
    if (at < tol * 1.6 || at > S.length - tol * 1.6) continue;
    if (D(P, p) < tol) return true;
  }
  return false;
}

function crosses(A, B, tol) {
  for (const a of A.samples) {
    if (a.at < tol * 1.6 || a.at > A.length - tol * 1.6) continue;
    for (const b of B.samples) {
      if (b.at < tol * 1.6 || b.at > B.length - tol * 1.6) continue;
      if (D(a.p, b.p) < tol * .8) return true;
    }
  }
  return false;
}

// -1: A is written before B, 1: B before A.
function precedence(A, B, tol) {
  if (!A.samples.length && !B.samples.length) {
    // Whole parts: one that starts below the middle of the other is written
    // after it — the final consonant (받침) after the vowel, 皿 under 血.
    // (A part lying wholly to the left is an initial consonant, not a final.)
    const under = (X, Y) => X.y0 > Y.y0 + (Y.y1 - Y.y0) * .5 && X.y0 > Y.y0 + tol && X.y1 > Y.y1 + tol && X.x1 > Y.x0 + tol;
    if (under(B, A)) return -1;
    if (under(A, B)) return 1;
  }
  if (A.samples.length && B.samples.length && D(A.start, B.start) < tol && A.horizontal !== B.horizontal) {
    return A.horizontal ? 1 : -1;          // 先左竖后封口: │ before ㄱ/𠃍 from the same corner (ㅁ, 口, 日)
  }
  if (onBody(A.start, B, tol)) return 1;   // A branches off B (ㅏ's bar off │)
  if (onBody(B.start, A, tol)) return -1;
  if (onBody(A.end, B, tol)) return -1;    // A runs into B (ㅓ's bar into │)
  if (onBody(B.end, A, tol)) return 1;
  if (crosses(A, B, tol)) {
    if (A.horizontal !== B.horizontal) return A.horizontal ? -1 : 1;  // 十: horizontal first
    const aPie = A.end[0] < A.start[0], bPie = B.end[0] < B.start[0];  // 人: 撇 before 捺
    if (aPie !== bPie) return aPie ? -1 : 1;
  }
  const ox = overlap(A.x0, A.x1 + 1, B.x0, B.x1 + 1);
  const stacked = ox > Math.min(A.x1 - A.x0 + 1, B.x1 - B.x0 + 1) * .2;
  if (stacked && Math.abs(A.y0 - B.y0) > tol * 1.5) return A.y0 < B.y0 ? -1 : 1;  // top → bottom
  if (Math.abs(A.x0 - B.x0) > tol * .5) return A.x0 < B.x0 ? -1 : 1;              // left → right
  return A.y0 <= B.y0 ? -1 : 1;
}

// Box of a set of strokes, used as a stand-in "stroke" for ordering whole
// jamo / radicals before the strokes inside them.
function boxOf(list) {
  return {
    x0: Math.min(...list.map((s) => s.x0)), x1: Math.max(...list.map((s) => s.x1)),
    y0: Math.min(...list.map((s) => s.y0)), y1: Math.max(...list.map((s) => s.y1)),
    horizontal: false, samples: [], start: [0, 0], end: [0, 0], length: 0,
  };
}

// Characters are ordered in two levels, the way they are written: first the
// connected parts (jamo, radicals, separate dots) — top→bottom, left→right,
// centre before wings — then the strokes inside each part. This keeps
// 초성 → 중성 → 종성 intact (강: ㄱ, ㅏ, ㅇ) even when parts sit side by side.
// In joined-up latin script a word is one movement, and small marks above it
// (i dots, t bars) come after the word.
function orderCharacter(strokes, tol) {
  const byComp = new Map();
  strokes.forEach((s) => { if (!byComp.has(s.comp)) byComp.set(s.comp, []); byComp.get(s.comp).push(s); });
  const parts = [...byComp.values()].map((list) => ({ list, box: boxOf(list) }));
  const charH = Math.max(...parts.map((p) => p.box.y1)) - Math.min(...parts.map((p) => p.box.y0)) + 1;
  const biggest = parts.reduce((a, b) => ((b.box.x1 - b.box.x0) * (b.box.y1 - b.box.y0) > (a.box.x1 - a.box.x0) * (a.box.y1 - a.box.y0) ? b : a));
  const cursive = biggest.box.x1 - biggest.box.x0 > charH * 1.8 && biggest.list.length > 3;
  let ordered = orderUnits(parts.map((p) => p.box), tol).map((i) => parts[i]);
  // Centre before wings across parts (小, 水, 永): dots above first, then the
  // central stroke, then the left wing, the rest of the centre, the right wing.
  const all = boxOf(strokes);
  const H = all.y1 - all.y0, Wd = all.x1 - all.x0;
  const medianX = (m) => { const xs = m.pts.map((p) => p[0]).sort((a, b) => a - b); return xs[Math.floor(xs.length / 2)]; };
  const spine = cursive ? null : strokes.find((m) => {
    if (m.y0 > all.y0 + H * .25 || m.y1 - m.y0 < H * .6) return false;
    const x = medianX(m);
    return Math.abs(x - (all.x0 + all.x1) / 2) < Wd * .18
      && strokes.some((s) => s.comp !== m.comp && s.x1 < x - tol) && strokes.some((s) => (s.x0 + s.x1) / 2 > x + tol);
  });
  if (spine) {
    const x = medianX(spine);
    const home = ordered.find((p) => p.list.includes(spine));
    const inner = orderUnits(home.list, tol).map((i) => home.list[i]);
    const cut = inner.indexOf(spine) + 1;
    const others = ordered.filter((p) => p !== home);
    const above = others.filter((p) => p.box.y1 < spine.y0 + tol);
    const rest = others.filter((p) => !above.includes(p));
    const side = (p) => ((p.box.x0 + p.box.x1) / 2 < x ? 'left' : 'right');
    const seq = (list) => list.flatMap((p) => orderUnits(p.list, tol).map((i) => p.list[i]));
    return [...seq(above), ...inner.slice(0, cut), ...seq(rest.filter((p) => side(p) === 'left')), ...inner.slice(cut), ...seq(rest.filter((p) => side(p) === 'right'))];
  }
  return ordered.flatMap((part) => {
    if (cursive && part === biggest) {
      // One unbroken movement through the word, left to right.
      const list = [...part.list].sort((a, b) => a.start[0] - b.start[0]);
      list.forEach((s, i) => { s.flow = i > 0; });
      return list;
    }
    return orderUnits(part.list, tol).map((i) => part.list[i]);
  });
}

function orderUnits(units, tol) {
  const n = units.length;
  if (n < 2) return n ? [0] : [];
  const after = units.map(() => new Set());
  const indeg = new Array(n).fill(0);
  const add = (a, b) => { if (!after[a].has(b) && !after[b].has(a)) { after[a].add(b); indeg[b]++; } };
  // Centre before wings (小, 水, 山): a tall central unit that starts at the
  // top goes before untouched units on both sides of it.
  const X0 = Math.min(...units.map((s) => s.x0)), X1 = Math.max(...units.map((s) => s.x1));
  const Y0 = Math.min(...units.map((s) => s.y0)), Y1 = Math.max(...units.map((s) => s.y1));
  units.forEach((m, i) => {
    if (m.y0 > Y0 + (Y1 - Y0) * .2 || Math.abs((m.x0 + m.x1) / 2 - (X0 + X1) / 2) > (X1 - X0) * .18 || m.y1 - m.y0 < (Y1 - Y0) * .6) return;
    if ((m.x1 - m.x0) > (m.y1 - m.y0) * .9) return; // must be an upright stroke or part
    const free = (s) => !onBody(s.start, m, tol) && !onBody(s.end, m, tol) && !crosses(s, m, tol) && s.y0 > m.y0 + (Y1 - Y0) * .12;
    const left = units.filter((s) => s !== m && s.x1 < m.x0 + tol * .3 && free(s));
    const right = units.filter((s) => s !== m && s.x0 > m.x1 - tol * .3 && free(s));
    if (left.length && right.length) [...left, ...right].forEach((s) => add(i, units.indexOf(s)));
  });
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (precedence(units[a], units[b], tol) < 0) add(a, b); else add(b, a);
  }
  const key = (s) => s.y0 + s.x0 * .35;
  const done = new Array(n).fill(false);
  const out = [];
  while (out.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || key(units[i]) < key(units[pick]))) pick = i;
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || indeg[i] < indeg[pick] || (indeg[i] === indeg[pick] && key(units[i]) < key(units[pick])))) pick = i; // break a cycle
    done[pick] = true; out.push(pick);
    after[pick].forEach((j) => { indeg[j]--; });
  }
  return out;
}

// Lines, then characters (syllables), then strokes within each character.
// A character occupies roughly a square box (hangul syllables and hanzi), so
// parts only merge into one character while the box stays about that wide.
function readingOrder(strokes, boxes, vertical, tol) {
  const pieces = boxes.filter((b) => strokes.some((s) => s.comp === b.id));
  const [la, lb] = vertical ? ['x0', 'x1'] : ['y0', 'y1'];
  const [fa, fb] = vertical ? ['y0', 'y1'] : ['x0', 'x1'];
  // Lines are bands of the projection profile separated by empty space. A
  // band much thinner than the others holds only part of each character (a
  // row of jamo or dots) and joins the nearer neighbouring band.
  const lo = Math.min(...pieces.map((p) => p[la])), hi = Math.max(...pieces.map((p) => p[lb]));
  const filled = new Uint8Array(hi - lo + 2);
  pieces.forEach((p) => { for (let v = p[la]; v <= p[lb]; v++) filled[v - lo] = 1; });
  let bands = [];
  for (let v = 0; v <= hi - lo; v++) {
    if (!filled[v]) continue;
    if (bands.length && bands[bands.length - 1].a1 === v + lo - 1) bands[bands.length - 1].a1 = v + lo;
    else bands.push({ a0: v + lo, a1: v + lo });
  }
  for (let changed = true; changed && bands.length > 1;) {
    changed = false;
    const tallest = Math.max(...bands.map((b) => b.a1 - b.a0));
    const i = bands.findIndex((b) => b.a1 - b.a0 < tallest * .55);
    if (i < 0) break;
    const prevGap = i > 0 ? bands[i].a0 - bands[i - 1].a1 : Infinity;
    const nextGap = i < bands.length - 1 ? bands[i + 1].a0 - bands[i].a1 : Infinity;
    const j = prevGap <= nextGap ? i - 1 : i + 1;
    const a = Math.min(i, j);
    bands.splice(a, 2, { a0: bands[a].a0, a1: bands[a + 1].a1 });
    changed = true;
  }
  const lines = bands.map((b) => ({ a0: b.a0, a1: b.a1 + 1, items: [] }));
  for (const piece of pieces) {
    const mid = (piece[la] + piece[lb]) / 2;
    const line = lines.find((l) => mid >= l.a0 && mid <= l.a1) || lines.reduce((best, l) => (Math.abs((l.a0 + l.a1) / 2 - mid) < Math.abs((best.a0 + best.a1) / 2 - mid) ? l : best));
    line.items.push(piece);
  }
  bands = null;
  lines.sort((a, b) => (vertical ? b.a0 - a.a0 : a.a0 - b.a0)); // vertical text runs right to left
  const charOf = new Map();
  lines.forEach((line, li) => {
    const em = line.a1 - line.a0;
    const chars = [];
    for (const piece of [...line.items].sort((a, b) => a[fa] - b[fa])) {
      const last = chars[chars.length - 1];
      const joined = last ? Math.max(last.f1, piece[fb]) - last.f0 : 0;
      const touching = last && piece[fa] <= last.f1 + em * .16;
      const insideBox = last && (joined <= em * 1.12 || piece[fb] <= last.f1 + em * .1 || (piece[fb] - piece[fa] > em * 1.2));
      if (touching && insideBox) { last.f1 = Math.max(last.f1, piece[fb]); last.items.push(piece); }
      else chars.push({ f0: piece[fa], f1: piece[fb], items: [piece] });
    }
    chars.forEach((c, ci) => c.items.forEach((p) => charOf.set(p.id, [li, ci])));
  });
  const groups = new Map();
  for (const s of strokes) {
    [s.line, s.char] = charOf.get(s.comp) || [0, 0];
    const k = `${s.line}:${s.char}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => { const [al, ac] = a.split(':').map(Number), [bl, bc] = b.split(':').map(Number); return al - bl || ac - bc; })
    .flatMap(([, list]) => orderCharacter(list, tol));
}

// ------------------------------------------------- one stroke, one movement
// Every ink pixel (and a thin halo around the ink) inherits the stroke and
// the position along it of the nearest centre-line point, so the brush front
// sweeps across the full width of a stroke in one pass.
function assignPixels(strokes, mask, w, h, halo) {
  const n = w * h;
  const owner = new Int16Array(n).fill(-2);
  const arc = new Float32Array(n);
  const dir = new Float32Array(n);
  const dist = new Float32Array(n).fill(1e9);
  for (let p = 0; p < n; p++) if (mask[p]) owner[p] = -1;
  strokes.forEach((s, si) => {
    const pts = s.map;
    let run = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
      const seg = D(a, b);
      const steps = Math.max(1, Math.ceil(seg * 2));
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const x = Math.round(a[0] + (b[0] - a[0]) * t), y = Math.round(a[1] + (b[1] - a[1]) * t);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = y * w + x;
        if (dist[p] === 0) continue; // an earlier stroke already passed here
        dist[p] = 0; owner[p] = si; arc[p] = Math.min(1, (run + seg * t) / (s.mapLength || 1)); dir[p] = angle;
      }
      run += seg;
      if (i === pts.length - 1) break;
    }
  });
  const limit = (p, d, o) => (mask[p] ? true : d <= strokes[o].mapRadius + halo);
  const relax = (p, q, wgt) => {
    const o = owner[q];
    if (o < 0) return false;
    const d = dist[q] + wgt;
    if (d >= dist[p] || !limit(p, d, o)) return false;
    dist[p] = d; owner[p] = o; arc[p] = arc[q]; dir[p] = dir[q];
    return true;
  };
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (x > 0 && relax(p, p - 1, 1)) changed = true;
      if (y > 0) {
        if (relax(p, p - w, 1)) changed = true;
        if (x > 0 && relax(p, p - w - 1, 1.414)) changed = true;
        if (x < w - 1 && relax(p, p - w + 1, 1.414)) changed = true;
      }
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      if (x < w - 1 && relax(p, p + 1, 1)) changed = true;
      if (y < h - 1) {
        if (relax(p, p + w, 1)) changed = true;
        if (x < w - 1 && relax(p, p + w + 1, 1.414)) changed = true;
        if (x > 0 && relax(p, p + w - 1, 1.414)) changed = true;
      }
    }
    if (!changed) break;
  }
  return { owner, arc, dir };
}

const MAP_SIDE = 1100;

export async function analyzeInk(url, debug) {
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
  const minArea = Math.max(14, w * h * .00012);
  for (let i = 0; i < mask.length; i++) if (mask[i] && boxes[comp[i]].area < minArea) mask[i] = 0;
  const dist = distance(mask, w, h);
  const skeleton = Uint8Array.from(mask);
  thin(skeleton, w, h);
  const { edges, cluster, degree } = traceSkeleton(skeleton, w, h);
  const radiusAt = ([x, y]) => dist[Math.round(y + 1) * w + Math.round(x + 1)] || 1;
  const radii = [];
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) radii.push(dist[i]);
  radii.sort((a, b) => a - b);
  const r = radii[Math.floor(radii.length * .5)] || 2;
  const k = Math.max(3, Math.min(14, Math.round(r * 1.4)));
  const chains = buildChains(edges, cluster, degree, dist, w).map((c) => ({
    loop: Boolean(c.loop),
    comp: comp[c.px[0]],
    pts: smoothPoints(c.px.map((i) => { const x = i % w; return [x - 1, (i - x) / w - 1]; }), Boolean(c.loop) && c.px.length > 8),
  })).filter((c) => c.comp >= 0 && boxes[c.comp].area >= minArea);
  if (debug) debug.chains = chains.map((c) => ({ loop: c.loop, a: c.pts[0].map(Math.round), b: c.pts[c.pts.length - 1].map(Math.round), n: c.pts.length })), debug.edges = edges.map((e) => [e.px[0] % w, Math.floor(e.px[0] / w), e.px[e.px.length - 1] % w, Math.floor(e.px[e.px.length - 1] / w), e.px.length, degree[e.px[0]], degree[e.px[e.px.length - 1]], cluster[e.px[0]], cluster[e.px[e.px.length - 1]]]), debug.r = r;
  let strokes = chains.flatMap((c) => movements(c, k, radiusAt).map((m) => ({ ...m, comp: c.comp })))
    .filter((s) => s.pts.length > 1 || boxes[s.comp].area >= minArea)
    .map((s) => {
      const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
      const rs = s.pts.map(radiusAt).sort((a, b) => a - b);
      const out = {
        ...s, start: s.pts[0], end: s.pts[s.pts.length - 1], length: Math.max(1, lengthOf(s.pts)),
        x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
        radius: rs[Math.floor(rs.length * .9)] || r,
      };
      const a = s.pts[0], b = s.pts[Math.min(s.pts.length - 1, Math.max(1, k))];
      out.horizontal = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
      out.samples = sampleBody(out, Math.max(1, r * .6));
      return out;
    });
  const tol = Math.max(2.5, r * 1.7);
  strokes = readingOrder(strokes, boxes, H > W * 1.3, tol);

  // Pixel ownership on a finer map, in image space.
  const ms = Math.min(1, MAP_SIDE / Math.max(W, H));
  const mw = Math.max(8, Math.round(W * ms)), mh = Math.max(8, Math.round(H * ms));
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = mw; mapCanvas.height = mh;
  const mctx = mapCanvas.getContext('2d', { willReadFrequently: true });
  mctx.drawImage(image, 0, 0, mw, mh);
  const mdata = mctx.getImageData(0, 0, mw, mh).data;
  const softMask = inkMask(mdata, mw, mh);
  for (let p = 0; p < mw * mh; p++) if (mdata[p * 4 + 3] > 24 && mdata[p * 4 + 3] < 250) softMask[p] = 1;
  const toImage = W / (w - 2);
  const toMap = mw / W;
  strokes.forEach((s) => {
    s.image = s.pts.map(([x, y]) => [(x + .5) * toImage, (y + .5) * toImage]);
    s.map = s.image.map(([x, y]) => [x * toMap, y * toMap]);
    s.mapLength = lengthOf(s.map);
    s.mapRadius = s.radius * toImage * toMap;
    s.imageLength = s.length * toImage;
    s.cum = [0];
    for (let i = 1; i < s.image.length; i++) s.cum.push(s.cum[i - 1] + D(s.image[i], s.image[i - 1]));
  });
  const halo = Math.max(2, r * toImage * toMap * .9);
  const { owner, arc, dir } = assignPixels(strokes, softMask, mw, mh, halo);
  return {
    width: W, height: H,
    strokeWidth: 2 * r * toImage,
    strokes: strokes.map((s) => ({ points: s.image, cum: s.cum, length: s.imageLength, line: s.line, char: s.char, comp: s.comp, flow: Boolean(s.flow), ring: Boolean(s.ring) })),
    map: { width: mw, height: mh, owner, arc, dir },
  };
}
