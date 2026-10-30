const TAU = Math.PI * 2;
const REF_AREA = 2073600;
const PIXEL_BUDGET = 2200000;
const PAINT_MS = 1000 / 15;

const STAR_MIN = 520;
const STAR_MAX = 3000;
const STAR_DENSITY = 0.62;
const HERO_RATE = 0.035;

const HALO_PROBES = 320;
const GLINT_START = 40;
const GLINT_CYCLE = 960;
const GLINT_LIFE = 430;

const NA = 10;

const PAL = ['#f0e9ea', '#6a2a8c', '#8f3355', '#ffffff'];
const PANEL = 0;
const LINK = 1;
const ACCENT = 2;
const WHITE = 3;

const WAVE_N = 2048;
const WAVE_MASK = WAVE_N - 1;
const COS = new Float32Array(WAVE_N);
for (let i = 0; i < WAVE_N; i++) COS[i] = Math.cos((TAU * i) / WAVE_N);

function hexRGB(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const C = {
  field: hexRGB('#bb90a2'),
  panelHi: hexRGB(PAL[PANEL]),
  link: hexRGB(PAL[LINK]),
  accent: hexRGB(PAL[ACCENT]),
  shadow: hexRGB('#6b5a60'),
  ink: hexRGB('#24191d'),
};

function hash32(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function hash2(x, y) {
  return hash32(x, y) / 4294967296;
}

function level(a) {
  const l = (a * NA + 0.5) | 0;
  return l > NA ? NA : l;
}

function haloWeights(rim, scale) {
  const sky = Math.exp(-rim / (14 * scale));
  const vio = Math.exp(-rim / (120 * scale)) * Math.min(1, rim / (10 * scale)) * 0.85;
  const plu = Math.exp(-rim / (600 * scale)) * Math.min(1, rim / (30 * scale)) * 0.7;
  return { sky, vio, total: Math.min(1, sky + vio + plu) };
}

const TABLE_STEP = 4;
function haloTable(scale) {
  const limit = 8000 * scale * TABLE_STEP;
  const t1 = new Float32Array(limit);
  const t2 = new Float32Array(limit);
  const k = new Float32Array(limit);
  let n = 0;
  for (let j = 0; j < limit; j++) {
    const w = haloWeights((j + 0.5) / TABLE_STEP, scale);
    if (w.total <= 0.003) break;
    t1[j] = w.sky / w.total;
    t2[j] = (w.sky + w.vio) / w.total;
    k[j] = Math.min(1, w.total * 1.6);
    n = j + 1;
  }
  return { n, t1, t2, k };
}

function eclipseGeometry(w, h) {
  const s = Math.min(2, Math.max(0.7, Math.sqrt((w * h) / REF_AREA)));
  const x1 = -0.12 * w;
  const x2 = 1.12 * w;
  const y0 = h * 0.46;
  const dist = x2 - x1;
  const sag = dist * 0.062;
  const radius = (dist * dist) / (8 * sag) + sag * 0.5;
  const cx = (x1 + x2) * 0.5;
  const cy = y0 + (radius - sag);
  let thMin = Infinity;
  let thMax = -Infinity;
  for (const [px, py] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const an = Math.atan2(py - cy, px - cx);
    if (an < thMin) thMin = an;
    if (an > thMax) thMax = an;
  }
  return { scale: s, cx, cy, radius, thetaMin: thMin - 0.04, thetaMax: thMax + 0.04 };
}

function renderField(ctx, W, H, bw, bh, geo) {
  const img = ctx.createImageData(bw, bh);
  const data = img.data;
  const { scale, cx, cy, radius } = geo;
  const span = Math.max(0.001, geo.thetaMax - geo.thetaMin);
  const freq = (TAU * 2.2) / span;
  const rimW = 5 * scale;
  const radius2 = radius * radius;
  const tbl = haloTable(scale);
  const { t1, t2, k: tk } = tbl;

  const f0 = C.field[0], f1 = C.field[1], f2 = C.field[2];
  const d0 = C.shadow[0] - f0, d1 = C.shadow[1] - f1, d2 = C.shadow[2] - f2;
  const hi = C.panelHi, lk = C.link, ac = C.accent, ink = C.ink;
  const invEdge = 1 / (1600 * scale);
  const hx = W / 2;
  const hy = H / 2;

  const colEdge2 = new Float64Array(bw);
  const colRim2 = new Float64Array(bw);
  for (let bx = 0; bx < bw; bx++) {
    const x = ((bx + 0.5) * W) / bw;
    colEdge2[bx] = (x - hx) * (x - hx);
    colRim2[bx] = (x - cx) * (x - cx);
  }

  let p = 0;
  for (let by = 0; by < bh; by++) {
    const y = ((by + 0.5) * H) / bh;
    const dy = y - cy;
    const rowEdge2 = (y - hy) * (y - hy);
    const rowRim2 = dy * dy;
    for (let bx = 0; bx < bw; bx++) {
      const e = Math.sqrt(colEdge2[bx] + rowEdge2) * invEdge;
      let v = 1 - e * e * e;
      v = v < 0.35 ? 0.35 : v;
      const shade = (1 - v) * 0.5;
      const hv = hash32(bx + 11, by + 101);
      const grain = ((hv & 0xffff) / 65536 - 0.5) * 22;
      let r = f0 + d0 * shade + grain;
      let g = f1 + d1 * shade + grain;
      let b = f2 + d2 * shade + grain;

      const rim2 = colRim2[bx] + rowRim2;
      if (rim2 >= radius2) {
        const rim = Math.sqrt(rim2) - radius;
        if (rim < rimW) {
          const gl = 1 + 0.16 * Math.sin(Math.atan2(dy, ((bx + 0.5) * W) / bw - cx) * freq);
          r = hi[0] * gl;
          g = hi[1] * gl;
          b = hi[2] * gl;
        } else {
          const j = (rim * TABLE_STEP) | 0;
          if (j < tbl.n) {
            const roll = hash2(bx + 57, by + 131);
            const band = roll < t1[j] ? hi : roll < t2[j] ? lk : ac;
            const kk = tk[j];
            r += (band[0] - r) * kk;
            g += (band[1] - g) * kk;
            b += (band[2] - b) * kk;
          }
        }
      }

      const r2 = (hv >>> 16) / 65536;
      if (r2 < 0.045) {
        const tgt = r2 < 0.0225 ? ink : hi;
        r += (tgt[0] - r) * 0.14;
        g += (tgt[1] - g) * 0.14;
        b += (tgt[2] - b) * 0.14;
      }

      data[p++] = r;
      data[p++] = g;
      data[p++] = b;
      data[p++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function buildStars(geo, W, H, maxDepth) {
  const span = geo.thetaMax - geo.thetaMin;
  const want = Math.min(STAR_MAX, Math.max(STAR_MIN, Math.round(span * geo.radius * STAR_DENSITY)));
  const st = {
    n: 0,
    ca: new Float32Array(want),
    sa: new Float32Array(want),
    depth0: new Float64Array(want),
    speed: new Float32Array(want),
    amp: new Float32Array(want),
    phase: new Uint16Array(want),
    mult: new Uint8Array(want),
    size: new Uint8Array(want),
    hero: new Uint8Array(want),
  };

  const ampBase = geo.scale * ((0.06 * WAVE_N) / TAU);

  let guard = 0;
  let n = 0;
  while (n < want && guard++ < want * 20) {
    const a0 = geo.thetaMin + Math.random() * span;
    const depth0 = maxDepth * Math.cbrt(Math.random());
    const R = geo.radius + depth0;
    const ca = Math.cos(a0);
    const sa = Math.sin(a0);
    const x = geo.cx + ca * R;
    const y = geo.cy + sa * R;
    if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
    const m = 2 + ((Math.random() * 4) | 0);
    const hero = Math.random() < HERO_RATE ? 1 : 0;
    st.ca[n] = ca;
    st.sa[n] = sa;
    st.depth0[n] = depth0;
    st.speed[n] = (0.14 + Math.random() * 0.22) * geo.scale;
    st.amp[n] = ampBase / m;
    st.phase[n] = (Math.random() * WAVE_N) | 0;
    st.mult[n] = m;
    st.size[n] = hero ? 2 : Math.random() < 0.65 ? 1 : 2;
    st.hero[n] = hero;
    n++;
  }
  st.n = n;
  return st;
}

function createBatch(ctx) {
  let cap = 4096;
  let rx = new Float32Array(cap);
  let ry = new Float32Array(cap);
  let rw = new Uint8Array(cap);
  let rh = new Uint8Array(cap);
  let next = new Int32Array(cap);
  const head = new Int32Array(PAL.length * NA).fill(-1);
  let n = 0;

  function grow() {
    cap *= 2;
    const fx = new Float32Array(cap); fx.set(rx); rx = fx;
    const fy = new Float32Array(cap); fy.set(ry); ry = fy;
    const uw = new Uint8Array(cap); uw.set(rw); rw = uw;
    const uh = new Uint8Array(cap); uh.set(rh); rh = uh;
    const nx = new Int32Array(cap); nx.set(next); next = nx;
  }

  return {
    add(ci, lvl, x, y, w, h) {
      if (lvl <= 0) return;
      if (n === cap) grow();
      const b = ci * NA + lvl - 1;
      rx[n] = x;
      ry[n] = y;
      rw[n] = w;
      rh[n] = h;
      next[n] = head[b];
      head[b] = n++;
    },
    flush() {
      for (let ci = 0; ci < PAL.length; ci++) {
        let styled = false;
        for (let l = 1; l <= NA; l++) {
          const b = ci * NA + l - 1;
          let i = head[b];
          if (i < 0) continue;
          if (!styled) {
            ctx.fillStyle = PAL[ci];
            styled = true;
          }
          ctx.globalAlpha = l / NA;
          for (; i >= 0; i = next[i]) ctx.fillRect(rx[i], ry[i], rw[i], rh[i]);
          head[b] = -1;
        }
      }
      ctx.globalAlpha = 1;
      n = 0;
    },
  };
}

function buildSparks(geo, W, H, bw, bh, tick) {
  const span = geo.thetaMax - geo.thetaMin;
  if (!(span > 0)) return [];
  const scale = geo.scale;
  const rimW = 5 * scale;
  const buckets = new Map();
  for (let i = 0; i < HALO_PROBES; i++) {
    const theta = geo.thetaMin + hash2(i * 3 + 1, tick * 7 + 11) * span;
    const depth = -Math.log(1 - hash2(i * 5 + 2, tick * 13 + 101) * 0.993) * 120 * scale;
    const R = geo.radius + rimW + depth;
    const x = geo.cx + Math.cos(theta) * R;
    const y = geo.cy + Math.sin(theta) * R;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const { sky, vio, total } = haloWeights(rimW + depth, scale);
    if (total <= 0.003) continue;
    const roll = hash2(i * 7 + 3, tick * 29 + 1001);
    let ci;
    if (roll < sky) ci = PANEL;
    else if (roll < sky + vio) ci = LINK;
    else if (roll < total) ci = ACCENT;
    else continue;
    const lvl = level(Math.min(1, total * 1.6));
    if (lvl === 0) continue;
    const key = ci * (NA + 1) + lvl;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(((x / W) * bw) | 0, ((y / H) * bh) | 0);
  }
  return [...buckets.keys()].sort((a, b) => a - b).map((key) => ({
    ci: (key / (NA + 1)) | 0,
    alpha: (key % (NA + 1)) / NA,
    xy: Int16Array.from(buckets.get(key)),
  }));
}

function drawSparks(ctx, entries) {
  let ci = -1;
  for (let e = 0; e < entries.length; e++) {
    const s = entries[e];
    if (s.ci !== ci) {
      ci = s.ci;
      ctx.fillStyle = PAL[ci];
    }
    ctx.globalAlpha = s.alpha;
    const xy = s.xy;
    for (let i = 0; i < xy.length; i += 2) ctx.fillRect(xy[i], xy[i + 1], 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawStars(batch, st, geo, kx, ky, maxDepth, frame) {
  const { n, ca, sa, depth0, speed, amp, phase, mult, size, hero } = st;
  const radius = geo.radius;
  const cx = geo.cx;
  const cy = geo.cy;
  const fm = frame % WAVE_N;
  const invFade = 4 / maxDepth;
  for (let i = 0; i < n; i++) {
    const sp = speed[i];
    const depth = depth0[i] - sp * frame;
    if (depth < 0.5) {
      depth0[i] = maxDepth + sp * frame;
      continue;
    }
    const fadeIn = (maxDepth - depth) * invFade;
    if (fadeIn <= 0) continue;
    const fadeOut = depth * (1 / 3);
    let a = (fadeOut < 1 ? fadeOut : 1) * (fadeIn < 1 ? fadeIn : 1);
    if (a < 0.03) continue;
    const idx = ((fm * mult[i] + phase[i]) | 0) & WAVE_MASK;
    const tw = COS[(idx * 5) & WAVE_MASK];
    a *= 0.82 + 0.18 * tw;
    const R = radius + depth;
    const off = -amp[i] * COS[idx];
    const c = ca[i];
    const s = sa[i];
    const x = (cx + c * R - s * off) * kx;
    const y = (cy + s * R + c * off) * ky;
    const sz = size[i];
    if (hero[i]) {
      const pulse = COS[(idx * 3) & WAVE_MASK];
      batch.add(WHITE, level(a), x, y, 2, 2);
      if (pulse > 0.45) {
        const arm = 1 + (((pulse - 0.45) * 9) | 0);
        const la = level(a * (pulse - 0.15));
        batch.add(PANEL, la, x - arm, y + 0.5, 2 + 2 * arm, 1);
        batch.add(PANEL, la, x + 0.5, y - arm, 1, 2 + 2 * arm);
      }
    } else {
      batch.add(PANEL, level(a), x, y, sz, sz);
    }
  }
}

function drawGlint(batch, geo, W, kx, ky, frame) {
  const f = frame - GLINT_START;
  if (f < 0) return;
  const cyc = (f / GLINT_CYCLE) | 0;
  const u = (f - cyc * GLINT_CYCLE) / GLINT_LIFE;
  if (u >= 1) return;
  const env = Math.sin(Math.PI * Math.pow(u, 0.55));
  if (env < 0.05) return;

  const s = geo.scale;
  const dir = hash2(cyc, 5) < 0.5 ? -1 : 1;
  const gx = W * (0.3 + 0.4 * hash2(cyc, 9) + dir * 0.16 * (2 * u - 1));
  const rr = geo.radius + 2.5 * s;
  const rr2 = rr * rr;
  const dxc = gx - geo.cx;
  const gy = geo.cy - Math.sqrt(rr2 - dxc * dxc);
  const nx = dxc / rr;
  const ny = (gy - geo.cy) / rr;
  const bx = Math.round(gx * kx);
  const by = Math.round(gy * ky);
  const fk = (frame | 0) + cyc * 7919;
  const rimY = (px) => {
    const xc = px / kx - geo.cx;
    return Math.round((geo.cy - Math.sqrt(Math.max(0, rr2 - xc * xc))) * ky);
  };

  const lh = (240 * s * kx) | 0;
  for (let d = 2; d < lh; d++) {
    const t = d / lh;
    const p = env * (1 - t) * (1 - t) * 1.6;
    const lvl = level(0.35 + 0.65 * (1 - t));
    const ci = t < 0.22 ? WHITE : PANEL;
    for (let sd = -1; sd <= 1; sd += 2) {
      const hh = hash2(d * 2 + (sd > 0 ? 1 : 0), fk * 3 + 17);
      if (hh >= p) continue;
      const px = bx + sd * d;
      const ry = rimY(px);
      batch.add(ci, lvl, px, ry - 3, 1, 4);
      if (hh < p * 0.5) batch.add(PANEL, level(lvl / NA * 0.7), px, ry - 7, 1, 4);
    }
  }

  const lv = (190 * s * ky) | 0;
  for (let d = 2; d < lv; d++) {
    const t = d / lv;
    const p = env * Math.pow(1 - t, 1.5) * 1.25;
    const hh = hash2(d * 3 + 1, fk * 5 + 29);
    if (hh >= p) continue;
    const jit = hh < p * 0.1 ? 1 : 0;
    batch.add(t < 0.3 ? WHITE : PANEL, level(0.4 + 0.6 * (1 - t)), bx + nx * d + jit, by + ny * d, 1, 1);
    if (d < lv * 0.3) {
      const hd = hash2(d * 3 + 2, fk * 5 + 31);
      if (hd < p) batch.add(PANEL, level(0.5 * (1 - t / 0.3) + 0.2), bx - nx * d, by - ny * d, 1, 1);
    }
  }

  const bead = Math.floor(frame / 6);
  for (let k = 0; k < 7; k++) {
    if (hash2(k * 13 + 1, bead + cyc * 31) >= env * 0.8) continue;
    const off = Math.round((hash2(k * 17 + 5, cyc) * 2 - 1) * lh * 0.85);
    const px = bx + off;
    batch.add(WHITE, level(env), px - 1, rimY(px) - 0.5, 3, 2);
  }

  const tx = -ny;
  const ty = nx;
  const nb = (420 * env) | 0;
  for (let j = 0; j < nb; j++) {
    const h1 = hash2(j * 5 + 1, fk * 7 + 41);
    const h2 = hash2(j * 5 + 2, fk * 7 + 43);
    const h3 = hash2(j * 5 + 3, fk * 7 + 47);
    const h4 = hash2(j * 5 + 4, fk * 7 + 53);
    const lat = (h1 + h2 - 1) * 2 * 70 * s;
    const depth = -Math.log(1 - h3 * 0.99) * 34 * s;
    const mix = depth / (depth + 40 * s);
    const roll = h4;
    const near = Math.hypot(lat * 0.5, depth) / (50 * s);
    const ci = near < 0.5 && roll > 0.3 ? WHITE : roll > mix * 0.45 ? PANEL : roll < mix * 0.2 ? ACCENT : LINK;
    const px = gx + tx * lat + nx * (depth + 3 * s);
    const py = gy + ty * lat + ny * (depth + 3 * s);
    const big = h1 < 0.05 ? 2 : 1;
    batch.add(ci, level(env * (1 - 0.5 * Math.min(1, near))), (px * kx) | 0, (py * ky) | 0, big, big);
  }

  const arm = 2 + Math.round(env * 5);
  batch.add(WHITE, level(env), bx - 1, by - 1, 3, 3);
  batch.add(WHITE, level(env * 0.9), bx - arm, by - 0.5, 2 * arm + 1, 1);
  batch.add(WHITE, level(env * 0.9), bx - 0.5, by - arm, 1, 2 * arm + 1);
}

export function initEclipse() {
  const root = document.querySelector('.eclipse-bg');
  if (!root) return;
  const field = root.querySelector('[data-eclipse-field]');
  const layer = root.querySelector('[data-eclipse-stars]');
  if (!field || !layer) return;
  const fctx = field.getContext('2d');
  const sctx = layer.getContext('2d');
  if (!fctx || !sctx) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const batch = createBatch(sctx);
  let W = 0;
  let H = 0;
  let bw = 0;
  let bh = 0;
  let geo = null;
  let maxDepth = 0;
  let stars = null;
  let last = 0;
  let frame = 0;

  function paint(tickVal, frameVal) {
    sctx.clearRect(0, 0, bw, bh);
    const kx = bw / W;
    const ky = bh / H;
    drawSparks(sctx, buildSparks(geo, W, H, bw, bh, tickVal));
    drawStars(batch, stars, geo, kx, ky, maxDepth, frameVal);
    drawGlint(batch, geo, W, kx, ky, frameVal);
    batch.flush();
  }

  function viewportSize() {
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    return { vw: w, vh: h };
  }

  function layout() {
    const { vw, vh } = viewportSize();
    W = vw;
    H = vh;
    const q = Math.min(1, Math.max(0.5, Math.sqrt(PIXEL_BUDGET / Math.max(1, W * H))));
    bw = Math.max(2, Math.round((W * q) / 2));
    bh = Math.max(2, Math.round((H * q) / 2));
    field.width = bw;
    layer.width = bw;
    field.height = bh;
    layer.height = bh;
    geo = eclipseGeometry(W, H);
    maxDepth = Math.min(600 * geo.scale, geo.radius * 0.3);
    renderField(fctx, W, H, bw, bh, geo);
    stars = buildStars(geo, W, H, maxDepth);
    frame = 0;
    last = 0;
    paint(0, 0);
  }

  function tick(now) {
    requestAnimationFrame(tick);
    if (last === 0) last = now;
    const dt = now - last;
    if (dt < PAINT_MS) return;
    last = now;
    frame += Math.min(100, dt) / 16.667;
    paint(Math.floor(frame), frame);
  }

  let timer = 0;

  function maybeLayout() {
    const { vw, vh } = viewportSize();
    if (Math.abs(vw - W) < 1 && Math.abs(vh - H) < 1) return;
    layout();
  }
  function scheduleMaybeLayout() {
    window.clearTimeout(timer);
    timer = window.setTimeout(maybeLayout, 200);
  }
  window.addEventListener('resize', scheduleMaybeLayout);
  window.addEventListener('orientationchange', scheduleMaybeLayout);

  layout();
  if (!reduce) requestAnimationFrame(tick);
}
