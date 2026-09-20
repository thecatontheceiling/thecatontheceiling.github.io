const TAU = Math.PI * 2;
const REF_AREA = 2073600;
const BUDGET = 2200000;
const PAINT_MS = 2600 / 39;

function hexRGB(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const PANEL_HI_CSS = '#f0e9ea';
const C = {
  field: hexRGB('#bb90a2'),
  panelHi: hexRGB(PANEL_HI_CSS),
  link: hexRGB('#6a2a8c'),
  accent: hexRGB('#8f3355'),
  shadow: hexRGB('#6b5a60'),
  ink: hexRGB('#24191d'),
};

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
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
  let p = 0;
  for (let by = 0; by < bh; by++) {
    const y = ((by + 0.5) * H) / bh;
    const dy = y - cy;
    const dcy = y - H / 2;
    for (let bx = 0; bx < bw; bx++) {
      const x = ((bx + 0.5) * W) / bw;
      const dx = x - cx;
      const dist = Math.hypot(dx, dy);
      const rim = dist - radius;

      const dEdge = Math.hypot(x - W / 2, dcy);
      let v = 1 - Math.pow(dEdge / (1600 * scale), 3);
      v = v < 0.35 ? 0.35 : v > 1 ? 1 : v;
      const shade = (1 - v) * 0.5;
      let r = C.field[0] + (C.shadow[0] - C.field[0]) * shade;
      let g = C.field[1] + (C.shadow[1] - C.field[1]) * shade;
      let b = C.field[2] + (C.shadow[2] - C.field[2]) * shade;
      const grain = (hash2(bx + 11, by + 101) - 0.5) * 22;
      r += grain;
      g += grain;
      b += grain;

      if (rim >= 0) {
        const theta = Math.atan2(dy, dx);
        if (rim < rimW) {
          const gl = 1 + 0.16 * Math.sin(theta * freq);
          r = C.panelHi[0] * gl;
          g = C.panelHi[1] * gl;
          b = C.panelHi[2] * gl;
        } else {
          const sky = Math.exp(-rim / (14 * scale));
          const vio = Math.exp(-rim / (120 * scale)) * Math.min(1, rim / (10 * scale)) * 0.85;
          const plu = Math.exp(-rim / (600 * scale)) * Math.min(1, rim / (30 * scale)) * 0.7;
          const total = Math.min(1, sky + vio + plu);
          if (total > 0.003) {
            const roll = hash2(bx + 57, by + 131);
            const wSky = sky / total;
            const band = roll < wSky ? C.panelHi : roll < wSky + vio / total ? C.link : C.accent;
            const k = Math.min(1, total * 1.6);
            r += (band[0] - r) * k;
            g += (band[1] - g) * k;
            b += (band[2] - b) * k;
          }
        }
      }

      const r2 = hash2(bx + 7919, by + 523);
      if (r2 < 0.045) {
        const tgt = r2 < 0.0225 ? C.ink : C.panelHi;
        r += (tgt[0] - r) * 0.14;
        g += (tgt[1] - g) * 0.14;
        b += (tgt[2] - b) * 0.14;
      }

      data[p++] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[p++] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[p++] = b < 0 ? 0 : b > 255 ? 255 : b;
      data[p++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function buildStars(geo, W, H, maxDepth) {
  const span = geo.thetaMax - geo.thetaMin;
  const count = Math.min(1400, Math.max(260, Math.round(span * geo.radius * 0.3)));
  const stars = [];
  let guard = 0;
  while (stars.length < count && guard++ < count * 20) {
    const a0 = geo.thetaMin + Math.random() * span;
    const depth0 = maxDepth * Math.cbrt(Math.random());
    const R = geo.radius + depth0;
    const x = geo.cx + Math.cos(a0) * R;
    const y = geo.cy + Math.sin(a0) * R;
    if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
    stars.push({
      a0,
      depth0,
      speed: (0.14 + Math.random() * 0.22) * geo.scale,
      waveFreq: 0.004 + Math.random() * 0.011,
      wavePhase: Math.random() * TAU,
      size: Math.random() < 0.6 ? 1 : 2,
    });
  }
  return stars;
}

const HALO_PROBES = 220;
function drawHaloScintilla(ctx, geo, W, H, bw, bh, tick) {
  const span = geo.thetaMax - geo.thetaMin;
  if (!(span > 0)) return;
  const scale = geo.scale;
  const rimW = 5 * scale;
  for (let i = 0; i < HALO_PROBES; i++) {
    const h1 = hash2(i * 3 + 1, tick * 7 + 11);
    const theta = geo.thetaMin + h1 * span;
    const h2 = hash2(i * 5 + 2, tick * 13 + 101);
    const depth = -Math.log(1 - h2 * 0.993) * 120 * scale;
    const R = geo.radius + rimW + depth;
    const x = geo.cx + Math.cos(theta) * R;
    const y = geo.cy + Math.sin(theta) * R;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const rim = rimW + depth;
    const sky = Math.exp(-rim / (14 * scale));
    const vio = Math.exp(-rim / (120 * scale)) * Math.min(1, rim / (10 * scale)) * 0.85;
    const plu = Math.exp(-rim / (600 * scale)) * Math.min(1, rim / (30 * scale)) * 0.7;
    const total = Math.min(1, sky + vio + plu);
    if (total <= 0.003) continue;
    const roll = hash2(i * 7 + 3, tick * 29 + 1001);
    let band;
    if (roll < sky) band = C.panelHi;
    else if (roll < sky + vio) band = C.link;
    else if (roll < total) band = C.accent;
    else continue;
    const bx = ((x / W) * bw) | 0;
    const by = ((y / H) * bh) | 0;
    const dEdge = Math.hypot(x - W / 2, y - H / 2);
    let v = 1 - Math.pow(dEdge / (1600 * scale), 3);
    v = v < 0.35 ? 0.35 : v > 1 ? 1 : v;
    const shade = (1 - v) * 0.5;
    const grain = (hash2(bx + 11, by + 101) - 0.5) * 22;
    const k = Math.min(1, total * 1.6);
    const br = C.field[0] + (C.shadow[0] - C.field[0]) * shade + grain;
    const bg = C.field[1] + (C.shadow[1] - C.field[1]) * shade + grain;
    const bb = C.field[2] + (C.shadow[2] - C.field[2]) * shade + grain;
    const r = br + (band[0] - br) * k;
    const g = bg + (band[1] - bg) * k;
    const b = bb + (band[2] - bb) * k;
    ctx.fillStyle = `rgb(${r < 0 ? 0 : r > 255 ? 255 : r | 0},${g < 0 ? 0 : g > 255 ? 255 : g | 0},${b < 0 ? 0 : b > 255 ? 255 : b | 0})`;
    ctx.fillRect(bx, by, 1, 1);
  }
}

function drawStars(ctx, stars, geo, W, H, bw, bh, maxDepth, frame) {
  const kx = bw / W;
  const ky = bh / H;
  ctx.fillStyle = PANEL_HI_CSS;
  for (const s of stars) {
    let depth = s.depth0 - s.speed * frame;
    if (depth < 0.5) {
      s.depth0 = maxDepth;
      depth = maxDepth;
    }
    const fadeIn = Math.min(1, depth / 3);
    let fadeOut = (maxDepth - depth) / (maxDepth * 0.25);
    fadeOut = fadeOut < 0 ? 0 : fadeOut > 1 ? 1 : fadeOut;
    const alpha = fadeIn * fadeOut;
    if (alpha < 0.03) continue;
    const R = geo.radius + depth;
    const wander = (-(0.06 * geo.scale) / s.waveFreq) * Math.cos(frame * s.waveFreq + s.wavePhase) / Math.max(R, 1);
    const a = s.a0 + wander;
    ctx.globalAlpha = alpha;
    ctx.fillRect((geo.cx + Math.cos(a) * R) * kx, (geo.cy + Math.sin(a) * R) * ky, s.size, s.size);
  }
  ctx.globalAlpha = 1;
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
  let W = 0;
  let H = 0;
  let laidW = 0;
  let laidH = 0;
  let stableH = 0;
  let bw = 0;
  let bh = 0;
  let geo = null;
  let maxDepth = 0;
  let stars = [];
  let last = 0;
  let frame = 0;

  function paint(tickVal, frameVal) {
    sctx.clearRect(0, 0, bw, bh);
    drawHaloScintilla(sctx, geo, W, H, bw, bh, tickVal);
    drawStars(sctx, stars, geo, W, H, bw, bh, maxDepth, frameVal);
  }

  function layout() {
    const vw = window.innerWidth;
    const vvH = Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight);
    stableH = Math.max(stableH || 0, window.innerHeight, vvH);
    W = vw;
    H = stableH;
    laidW = vw;
    laidH = stableH;
    const q = Math.min(1, Math.max(0.5, Math.sqrt(BUDGET / Math.max(1, W * H))));
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
    paint(Math.floor(frame) % 90, frame);
  }

  let timer = 0;

  function maybeLayout() {
    const vw = window.innerWidth;
    const vvH = Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight);
    const vh = Math.max(window.innerHeight, vvH);
    if (Math.abs(vw - laidW) < 1 && vh <= laidH + 8) return;
    stableH = Math.max(stableH, vh);
    layout();
  }
  function scheduleMaybeLayout() {
    window.clearTimeout(timer);
    timer = window.setTimeout(maybeLayout, 200);
  }
  window.addEventListener('resize', scheduleMaybeLayout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleMaybeLayout);
  window.addEventListener('orientationchange', scheduleMaybeLayout);

  layout();
  if (!reduce) requestAnimationFrame(tick);
}
