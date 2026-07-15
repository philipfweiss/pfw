/* =====================================================================
   THE PAINTING CHAIN — the portrait paints itself the way a person would

   ACT I · graphite (~15s)
     1. the head first — eyes, nose, the smile, working outward
     2. shoulders and the hoodie
     3. placing the background — pool edge, lights, foliage
     4. hatching: the figure shaded first, then the scene
     — then the artist steps back (2s of stillness) —

   ACT II · watercolor (~30s) — one pigment at a time
     The image is segmented into regions (string lights, garden, far
     lights, stonework, pool, hoodie, skin, hair & beard) by color +
     position. The painter does each region with its own brush,
     background → figure, light → dark, rinsing between, and saves
     the smallest brush for the eyes and smile at the very end.

   The photo and its figure/background segmentation (u2net_human_seg)
   ship as static assets; everything else is computed in the browser.
   ===================================================================== */

const IMG_SRC = "/portrait.jpg";
const MASK_SRC = "/portrait-mask.png";

const canvas = document.getElementById("painting");
const ctx = canvas.getContext("2d");
const W = canvas.width,
  H = canvas.height;

const repaintBtn = document.getElementById("repaint");
const timelineEl = document.getElementById("timeline");
const timelineFill = document.getElementById("timelineFill");
const timelineDot = document.getElementById("timelineDot");

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- the day's light: the painting (and its pane, via CSS [data-tod])
   follow the visitor's hour. ?tod=morning|day|golden|night forces one. ---- */
function todBucket() {
  const forced = new URLSearchParams(location.search).get("tod");
  if (["morning", "day", "golden", "night"].includes(forced)) return forced;
  const h = new Date().getHours();
  if (h >= 20 || h < 6) return "night";
  if (h < 11) return "morning";
  if (h >= 17) return "golden";
  return "day";
}
const TOD = todBucket();
document.documentElement.dataset.tod = TOD;
const TOD_TINT = {
  morning: { op: "screen", color: "rgba(255,252,243,0.10)" },
  golden: { op: "multiply", color: "rgba(240,180,90,0.10)" },
  night: { op: "multiply", color: "rgba(90,98,143,0.14)" },
}[TOD];

function layer() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}
const colorL = layer(),
  sketchL = layer();
const maskS = layer();
const maskCF = layer(),
  maskCB = layer(); // color reveal: figure / background
const clipF = layer(),
  clipB = layer(); // feathered silhouette clips
const scrA = layer(),
  scrB = layer();
const compS = layer(),
  compC = layer();
const cS = maskS.getContext("2d");
const cCF = maskCF.getContext("2d"),
  cCB = maskCB.getContext("2d");

const img = new Image(),
  maskImg = new Image();
let assetsLoaded = 0;
const maybeInit = () => {
  if (++assetsLoaded === 2) init();
};
img.onload = maybeInit;
img.src = IMG_SRC;
maskImg.onload = maybeInit;
maskImg.src = MASK_SRC;

const CX = W * 0.5,
  CY = H * 0.4; // face center
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/* =====================================================================
   IMAGE ANALYSIS: pencil layer, edge field, and semantic regions
   ===================================================================== */
let edgeMag, edgeAng, EW, EH;
const DS = 4;

/* region ids */
const R = { BG: 0, LIGHTS: 1, GREEN: 2, POOL: 3, STONE: 4, SHIRT: 5, SKIN: 6, HAIR: 7 };
const R_NAMES = ["bg", "lights", "green", "pool", "stone", "shirt", "skin", "hair"];
let regionMap, regionCells, figMask;

function makeSketch() {
  const c = colorL.getContext("2d");
  c.drawImage(img, 0, 0, W, H);
  const src = c.getImageData(0, 0, W, H);
  const g = new Float32Array(W * H);
  for (let i = 0, p = 0; i < src.data.length; i += 4, p++)
    g[p] = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];

  const inv = new Float32Array(W * H);
  for (let p = 0; p < g.length; p++) inv[p] = 255 - g[p];
  const blur = boxBlur(boxBlur(inv, W, H, 7), W, H, 7);

  const sctx = sketchL.getContext("2d");
  const out = sctx.createImageData(W, H);
  for (let p = 0, i = 0; p < g.length; p++, i += 4) {
    const d = 255 - blur[p];
    let v = d <= 0 ? 255 : Math.min(255, (g[p] * 255) / d);
    v = 255 - (255 - v) * 1.35;
    out.data[i] = Math.max(0, Math.min(255, v * 0.97 + 8));
    out.data[i + 1] = Math.max(0, Math.min(255, v * 0.96 + 6));
    out.data[i + 2] = Math.max(0, Math.min(255, v * 0.94 + 4));
    out.data[i + 3] = 255;
  }
  sctx.putImageData(out, 0, 0);
  sctx.globalAlpha = 0.06;
  sctx.strokeStyle = "#4a4038";
  sctx.lineWidth = 1;
  for (let x = -H; x < W; x += 7) {
    sctx.beginPath();
    sctx.moveTo(x, 0);
    sctx.lineTo(x + H, H);
    sctx.stroke();
  }
  sctx.globalAlpha = 1;

  /* --- edge field --- */
  EW = Math.floor(W / DS);
  EH = Math.floor(H / DS);
  const small = new Float32Array(EW * EH);
  for (let y = 0; y < EH; y++)
    for (let x = 0; x < EW; x++) {
      let s = 0;
      for (let dy = 0; dy < DS; dy++)
        for (let dx = 0; dx < DS; dx++) s += g[(y * DS + dy) * W + (x * DS + dx)];
      small[y * EW + x] = s / (DS * DS);
    }
  const sm = boxBlur(small, EW, EH, 1);
  edgeMag = new Float32Array(EW * EH);
  edgeAng = new Float32Array(EW * EH);
  for (let y = 1; y < EH - 1; y++)
    for (let x = 1; x < EW - 1; x++) {
      const i = y * EW + x;
      const gx =
        sm[i + 1] - sm[i - 1] + 0.5 * (sm[i - EW + 1] - sm[i - EW - 1]) + 0.5 * (sm[i + EW + 1] - sm[i + EW - 1]);
      const gy =
        sm[i + EW] - sm[i - EW] + 0.5 * (sm[i + EW - 1] - sm[i - EW - 1]) + 0.5 * (sm[i + EW + 1] - sm[i - EW + 1]);
      edgeMag[i] = Math.hypot(gx, gy);
      edgeAng[i] = Math.atan2(gy, gx) + Math.PI / 2;
    }

  /* --- figure mask: the segmentation model's verdict, per cell --- */
  const mc = document.createElement("canvas");
  mc.width = EW;
  mc.height = EH;
  const mcx = mc.getContext("2d");
  mcx.drawImage(maskImg, 0, 0, EW, EH);
  const md = mcx.getImageData(0, 0, EW, EH).data;
  figMask = new Uint8Array(EW * EH);
  for (let i = 0; i < EW * EH; i++) figMask[i] = md[i * 4] > 127 ? 1 : 0;

  /* feathered full-res silhouette clips: a wash on one side can bleed a
     few soft pixels over the line (like wet paint), but no further */
  const tt = document.createElement("canvas");
  tt.width = EW;
  tt.height = EH;
  const tx = tt.getContext("2d");
  const tim = tx.createImageData(EW, EH);
  for (let i = 0; i < EW * EH; i++) {
    tim.data[i * 4] = tim.data[i * 4 + 1] = tim.data[i * 4 + 2] = 255;
    tim.data[i * 4 + 3] = md[i * 4]; // alpha = segmentation value
  }
  tx.putImageData(tim, 0, 0);
  const fx = clipF.getContext("2d");
  fx.clearRect(0, 0, W, H);
  fx.filter = "blur(5px)";
  fx.drawImage(tt, 0, 0, W, H);
  fx.filter = "none";
  const bx = clipB.getContext("2d");
  bx.clearRect(0, 0, W, H);
  bx.fillStyle = "#fff";
  bx.fillRect(0, 0, W, H);
  bx.globalCompositeOperation = "destination-out";
  bx.drawImage(clipF, 0, 0);
  bx.globalCompositeOperation = "source-over";

  /* --- semantic regions: figure/background FIRST, then color within --- */
  regionMap = new Uint8Array(EW * EH);
  regionCells = R_NAMES.map(() => []);

  for (let ey = 0; ey < EH; ey++)
    for (let ex = 0; ex < EW; ex++) {
      const px = Math.min(W - 1, ex * DS + (DS >> 1)),
        py = Math.min(H - 1, ey * DS + (DS >> 1));
      const q = (py * W + px) * 4;
      const r = src.data[q],
        gg = src.data[q + 1],
        b = src.data[q + 2];
      const id = classify(r, gg, b, px, py, figMask[ey * EW + ex]);
      const i = ey * EW + ex;
      regionMap[i] = id;
      regionCells[id].push({ x: px, y: py });
    }
}

function classify(r, g, b, x, y, fig) {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  const light = mx / 255,
    sat = mx ? (mx - mn) / mx : 0;
  const ny = y / H;

  if (fig) {
    /* ON the figure — only figure pigments are possible here */
    if (light < 0.45 && r >= g * 0.9) return R.HAIR; // hair & beard
    if (r > g * 1.05 && r - b > 30 && light < 0.93) return R.SKIN; // skin
    return R.SHIRT; // the hoodie
  }

  /* BACKGROUND — never touches the figure */
  if (g > r * 1.02 && b > r * 1.02 && ny > 0.42) return R.POOL;
  if (g > r * 1.04 && g > b * 1.06 && ny < 0.68) return R.GREEN;
  if (light > 0.86 && r >= g && g >= b * 0.9 && ny < 0.3) return R.LIGHTS;
  if (sat < 0.35 && light > 0.3 && light < 0.75 && ny > 0.38 && ny < 0.68) return R.STONE;
  return R.BG;
}

function regionAt(x, y) {
  const ex = Math.min(EW - 1, Math.max(0, Math.round(x / DS)));
  const ey = Math.min(EH - 1, Math.max(0, Math.round(y / DS)));
  return regionMap[ey * EW + ex];
}

function tangentAt(x, y, fallback) {
  const ex = Math.min(EW - 2, Math.max(1, Math.round(x / DS)));
  const ey = Math.min(EH - 2, Math.max(1, Math.round(y / DS)));
  const i = ey * EW + ex;
  return edgeMag[i] > 6 ? edgeAng[i] : fallback;
}

function boxBlur(a, w, h, r) {
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      out[row + x] = sum / (2 * r + 1);
      sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
    }
  }
  const out2 = new Float32Array(a.length);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += out[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out2[y * w + x] = sum / (2 * r + 1);
      sum += out[Math.min(h - 1, y + r + 1) * w + x] - out[Math.max(0, y - r) * w + x];
    }
  }
  return out2;
}

/* =====================================================================
   PLANNING — everything happens in a human order
   ===================================================================== */
let sketchGroups = []; // [{strokes, t0, t1}]
let washGroups = []; // [{stamps, t0, t1, clip}]
let TOTAL = 0;

const isSubject = (id) => id === R.SKIN || id === R.HAIR || id === R.SHIRT;

function planAll() {
  /* ---------- ACT I: pencil ---------- */
  const faceC = [],
    figC = [],
    bgC = [];
  const step = 5;
  for (let ey = 2; ey < EH - 2; ey += step)
    for (let ex = 2; ex < EW - 2; ex += step) {
      const m = edgeMag[ey * EW + ex];
      if (m <= 14) continue;
      const x = ex * DS,
        y = ey * DS,
        id = regionMap[ey * EW + ex];
      const s = makeContour(x, y);
      if ((id === R.SKIN || id === R.HAIR) && y < H * 0.66) faceC.push(s);
      else if (isSubject(id) || id === R.SKIN) figC.push(s);
      else bgC.push(s);
    }
  // the head: start at the eyes and work outward
  faceC.sort(
    (a, b) =>
      dist(a.pts[0], { x: CX, y: CY }) + Math.random() * 90 - (dist(b.pts[0], { x: CX, y: CY }) + Math.random() * 90),
  );
  // the figure: shoulders first, downward
  figC.sort((a, b) => a.pts[0].y + Math.random() * 140 - (b.pts[0].y + Math.random() * 140));
  // background: from just behind the figure, outward
  bgC.sort(
    (a, b) =>
      dist(a.pts[0], { x: CX, y: CY }) + Math.random() * 160 - (dist(b.pts[0], { x: CX, y: CY }) + Math.random() * 160),
  );

  // shading: figure first, then the scene, each swept top → bottom
  const shadeFig = [],
    shadeBg = [];
  const grid = 8;
  for (let gy = 0; gy < grid; gy++)
    for (let gx = 0; gx < grid; gx++) {
      const x = ((gx + 0.5 + (Math.random() - 0.5) * 0.7) * W) / grid;
      const y = ((gy + 0.5 + (Math.random() - 0.5) * 0.7) * H) / grid;
      const n = 2 + ((Math.random() * 2) | 0);
      const bucket = isSubject(regionAt(x, y)) ? shadeFig : shadeBg;
      for (let k = 0; k < n; k++) bucket.push(makeHatch(x, y));
    }
  const sweep = (a, b) =>
    a.pts[0].y + a.pts[0].x * 0.3 + Math.random() * 120 - (b.pts[0].y + b.pts[0].x * 0.3 + Math.random() * 120);
  shadeFig.sort(sweep);
  shadeBg.sort(sweep);

  sketchGroups = [
    { strokes: faceC, t0: 0.0, t1: 3.8 },
    { strokes: figC, t0: 3.6, t1: 6.2 },
    { strokes: bgC, t0: 6.0, t1: 9.2 },
    { strokes: shadeFig, t0: 9.0, t1: 11.2 },
    { strokes: shadeBg, t0: 11.0, t1: 13.0 },
  ];
  /* 13.0–15.0: the artist steps back to check the drawing */

  /* ---------- ACT II: watercolor — ~20 focused passes ----------
     Each region is split into spatial sub-areas (k-means). The brush
     does ONE sub-area at a time, and inside it the stamps are ordered
     along a continuous nearest-neighbor path — so the brush travels,
     it doesn't scatter. Big wet strokes walk the area first, then a
     second, smaller pass refines the same ground. ---------------- */
  const PAUSE_END = 15.0;
  const sequence = [
    // region id, seconds, what the brush is doing, [big, small] stamp radii
    // — the figure first: face, then hair, then its details, then the hoodie —
    [R.SKIN, 3.6, "warm sienna — the face first", [70, 36]],
    [R.HAIR, 2.8, "dark umber — hair and beard", [55, 30]],
    ["detail", 3.4, "the finest brush — eyes, then the smile", null],
    [R.SHIRT, 3.8, "pale cream — the hoodie, wet and loose", [110, 55]],
    ["rinse", 0.9, "rinsing the brush — now the world around", null],
    // — then the scene fills in behind the finished figure —
    [R.LIGHTS, 3.2, "pale gold — the string lights", [120, 60]],
    [R.GREEN, 3.6, "sap green — the garden behind", [110, 55]],
    [R.BG, 2.6, "soft washes for the far lights", [130, 65]],
    [R.STONE, 2.4, "a warm gray — the stone edge", [95, 50]],
    [R.POOL, 3.8, "a wide flat brush of teal — the pool", [140, 70]],
  ];

  washGroups = [];
  let t = PAUSE_END;

  for (const [id, dur, , radii] of sequence) {
    if (id === "rinse") {
      t += dur; // a beat of stillness while the brush rinses
      continue;
    }

    if (id === "detail") {
      // two deliberate passes: the eyes, then the smile
      const spots = [
        { x: CX, y: CY - H * 0.035, sx: W * 0.16, sy: H * 0.055 },
        { x: CX, y: CY + H * 0.1, sx: W * 0.11, sy: H * 0.05 },
      ];
      for (const sp of spots) {
        const t0 = t + 0.15,
          t1 = t + dur / 2;
        t = t1;
        let stamps = [];
        for (let i = 0; i < 42; i++)
          stamps.push({
            x: sp.x + gauss() * sp.sx,
            y: sp.y + gauss() * sp.sy,
            r: 14 + Math.random() * 26,
            a: 0.5,
            ang: Math.random() * Math.PI,
            elong: Math.random() * 0.6,
          });
        stamps = pathOrder(stamps);
        washGroups.push({ stamps, t0, t1, clip: "fig" });
      }
      continue;
    }

    const cells = regionCells[id];
    if (!cells.length) {
      t += dur;
      continue;
    }

    // split the region into 1–4 spatial sub-areas
    const k = Math.max(1, Math.min(4, Math.round(cells.length / 2600)));
    let clusters = kmeans(cells, k);
    // paint the sub-areas in reading order: top → bottom, left → right
    clusters.sort((a, b) => {
      const ca = centroid(a),
        cb = centroid(b);
      return ca.y + ca.x * 0.35 - (cb.y + cb.x * 0.35);
    });

    const totalSize = clusters.reduce((s, c) => s + c.length, 0);

    for (const cl of clusters) {
      const share = cl.length / totalSize;
      const t0 = t + 0.15,
        t1 = t + Math.max(0.7, dur * share);
      t = t1;
      const [rBig, rSmall] = radii;
      const nBig = clampN(cl.length / 300, 6, 24);
      const nSmall = clampN(cl.length / 210, 8, 30);
      const big = [],
        small = [];
      for (let i = 0; i < nBig; i++) {
        const c = cl[(Math.random() * cl.length) | 0];
        big.push({
          x: c.x + (Math.random() - 0.5) * 24,
          y: c.y + (Math.random() - 0.5) * 24,
          r: rBig * (0.7 + Math.random() * 0.5),
          a: 0.17,
          ang: (Math.random() - 0.5) * 0.6,
          elong: 1.6 + Math.random() * 1.2,
        });
      }
      for (let i = 0; i < nSmall; i++) {
        const c = cl[(Math.random() * cl.length) | 0];
        small.push({
          x: c.x + (Math.random() - 0.5) * 14,
          y: c.y + (Math.random() - 0.5) * 14,
          r: rSmall * (0.7 + Math.random() * 0.5),
          a: 0.3,
          ang: Math.random() * Math.PI,
          elong: Math.random() * 0.9,
        });
      }
      // wet pass walks the area first, refine pass retraces the same ground
      const stamps = pathOrder(big).concat(pathOrder(small));
      washGroups.push({ stamps, t0, t1, clip: isSubject(id) ? "fig" : "bg" });
    }
  }

  const DRY0 = t + 0.4,
    DRY1 = DRY0 + 2.4;
  washGroups.dry = [DRY0, DRY1];
  TOTAL = DRY1;
}

const clampN = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));

function centroid(cells) {
  let sx = 0,
    sy = 0;
  for (const c of cells) {
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / cells.length, y: sy / cells.length };
}

/* simple k-means over region cells → spatially coherent sub-areas */
function kmeans(cells, k) {
  if (k <= 1 || cells.length < 120) return [cells];
  const sorted = cells.slice().sort((a, b) => a.x + a.y - (b.x + b.y));
  let centers = [];
  for (let i = 0; i < k; i++) {
    const s = sorted[Math.floor(((i + 0.5) * sorted.length) / k)];
    centers.push({ x: s.x, y: s.y });
  }
  let groups = [];
  for (let it = 0; it < 8; it++) {
    groups = centers.map(() => []);
    for (const c of cells) {
      let bi = 0,
        bd = Infinity;
      for (let i = 0; i < k; i++) {
        const d = (c.x - centers[i].x) ** 2 + (c.y - centers[i].y) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      groups[bi].push(c);
    }
    for (let i = 0; i < k; i++) {
      if (!groups[i].length) continue;
      centers[i] = centroid(groups[i]);
    }
  }
  return groups.filter((g) => g.length > 40);
}

/* greedy nearest-neighbor: turns a set of stamps into one brush journey */
function pathOrder(st) {
  if (st.length < 3) return st;
  const rest = st.slice().sort((a, b) => a.y + a.x * 0.5 - (b.y + b.x * 0.5));
  const out = [rest.shift()];
  while (rest.length) {
    const last = out[out.length - 1];
    let bi = 0,
      bd = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const d = dist(last, rest[i]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    out.push(rest.splice(bi, 1)[0]);
  }
  return out;
}

function makeContour(x, y) {
  const pts = [{ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6 }];
  let ang = tangentAt(x, y, Math.random() * Math.PI);
  if (Math.random() < 0.5) ang += Math.PI;
  const segs = 3 + ((Math.random() * 4) | 0);
  for (let i = 0; i < segs; i++) {
    const last = pts[pts.length - 1];
    const a2 = tangentAt(last.x, last.y, ang);
    const flip = Math.abs(angDiff(a2, ang)) > Math.PI / 2 ? Math.PI : 0;
    ang = ang + angDiff(a2 + flip, ang) * 0.55 + (Math.random() - 0.5) * 0.25;
    const len = 12 + Math.random() * 16;
    pts.push({ x: last.x + Math.cos(ang) * len, y: last.y + Math.sin(ang) * len });
  }
  return { pts, w: 10 + Math.random() * 8, blur: 5 };
}

function makeHatch(x, y) {
  const base = -0.55 + (Math.random() - 0.5) * 0.25;
  const pts = [{ x, y }];
  let dir = 1;
  const rows = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < rows; i++) {
    const last = pts[pts.length - 1];
    const len = 60 + Math.random() * 70;
    pts.push({ x: last.x + Math.cos(base) * len * dir, y: last.y + Math.sin(base) * len * dir });
    const l2 = pts[pts.length - 1];
    pts.push({ x: l2.x + Math.cos(base + Math.PI / 2) * 16, y: l2.y + Math.sin(base + Math.PI / 2) * 16 });
    dir *= -1;
  }
  return { pts, w: 30 + Math.random() * 26, blur: 22 };
}

/* ---------- mask drawing ---------- */
function drawStroke(c, s, t) {
  const n = Math.max(2, Math.ceil(s.pts.length * t));
  c.save();
  c.strokeStyle = "#fff";
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = s.w;
  c.shadowColor = "#fff";
  c.shadowBlur = s.blur;
  c.beginPath();
  c.moveTo(s.pts[0].x, s.pts[0].y);
  for (let i = 1; i < n; i++) {
    const p = s.pts[i],
      q = s.pts[i - 1];
    c.quadraticCurveTo(q.x, q.y, (q.x + p.x) / 2, (q.y + p.y) / 2);
  }
  c.stroke();
  c.restore();
}

function drawBloom(c, st) {
  c.save();
  c.globalAlpha = st.a;
  const lobes = 5 + ((Math.random() * 3) | 0);
  for (let i = 0; i < lobes; i++) {
    const along = (i / (lobes - 1) - 0.5) * st.r * st.elong;
    const ox = Math.cos(st.ang) * along + (Math.random() - 0.5) * st.r * 0.5;
    const oy = Math.sin(st.ang) * along + (Math.random() - 0.5) * st.r * 0.5;
    const rr = st.r * (0.55 + Math.random() * 0.45);
    const g = c.createRadialGradient(st.x + ox, st.y + oy, rr * 0.1, st.x + ox, st.y + oy, rr);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.75, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(st.x + ox, st.y + oy, rr, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/* ---------- the run loop ---------- */
let start = null,
  rafId = null,
  finished = false;
let doneS = [],
  doneW = [];
let tNow = 0; // seconds into the current painting

function progress(t, a, b) {
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/* draw every stroke and stamp due by time t. Monotonic: assumes the done
   counters already reflect some earlier time; renderAt() resets them to
   replay from zero when the timeline is dragged backwards. */
function advanceTo(t) {
  /* pencil groups */
  for (let gi = 0; gi < sketchGroups.length; gi++) {
    const g = sketchGroups[gi];
    const p = easeInOut(progress(t, g.t0, g.t1));
    const target = Math.floor(p * g.strokes.length);
    while (doneS[gi] < target) {
      drawStroke(cS, g.strokes[doneS[gi]], 1);
      doneS[gi]++;
    }
    if (doneS[gi] < g.strokes.length && p > 0) drawStroke(cS, g.strokes[doneS[gi]], p * g.strokes.length - target);
  }

  /* watercolor groups */
  for (let gi = 0; gi < washGroups.length; gi++) {
    const g = washGroups[gi];
    const p = easeOut(progress(t, g.t0, g.t1));
    const target = Math.floor(p * g.stamps.length);
    const dst = g.clip === "fig" ? cCF : cCB;
    while (doneW[gi] < target) {
      drawBloom(dst, g.stamps[doneW[gi]]);
      doneW[gi]++;
    }
  }
}

/* the per-frame drying pass: cumulative, the way wet paper actually dries */
function dryFrame(t) {
  const [d0, d1] = washGroups.dry;
  const pd = progress(t, d0, d1);
  if (pd > 0) {
    for (const c of [cCF, cCB]) {
      c.save();
      c.globalAlpha = pd * 0.5;
      c.fillStyle = "#fff";
      c.fillRect(0, 0, W, H);
      c.restore();
    }
  }
  return pd;
}

function frame(ts) {
  if (!start) start = ts;
  const t = (ts - start) / 1000;
  tNow = t;

  advanceTo(t);
  const pd = dryFrame(t);
  compose(pd);
  updateTimeline(t);
  updateFavicon(ts, false);

  if (t < TOTAL + 0.2) rafId = requestAnimationFrame(frame);
  else finish();
}

/* rebuild the canvas at an arbitrary moment (the scrub path) */
function renderAt(t) {
  cS.clearRect(0, 0, W, H);
  cCF.clearRect(0, 0, W, H);
  cCB.clearRect(0, 0, W, H);
  doneS = sketchGroups.map(() => 0);
  doneW = washGroups.map(() => 0);
  advanceTo(t);
  const [d0, d1] = washGroups.dry;
  const pd = progress(t, d0, d1);
  if (pd > 0) {
    /* approximate the cumulative frame-by-frame drying in one pass */
    for (const c of [cCF, cCB]) {
      c.save();
      c.globalAlpha = Math.min(1, pd * 1.4);
      c.fillStyle = "#fff";
      c.fillRect(0, 0, W, H);
      c.restore();
    }
  }
  compose(pd);
  updateTimeline(t);
}

function compose(dry) {
  ctx.fillStyle = "#fbf6ea";
  ctx.fillRect(0, 0, W, H);

  const sc = compS.getContext("2d");
  sc.clearRect(0, 0, W, H);
  sc.drawImage(sketchL, 0, 0);
  sc.globalCompositeOperation = "destination-in";
  sc.drawImage(maskS, 0, 0);
  sc.globalCompositeOperation = "source-over";
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 1 - dry * 0.35;
  ctx.drawImage(compS, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const a = scrA.getContext("2d");
  a.clearRect(0, 0, W, H);
  a.drawImage(maskCF, 0, 0);
  a.globalCompositeOperation = "destination-in";
  a.drawImage(clipF, 0, 0);
  a.globalCompositeOperation = "source-over";

  const b = scrB.getContext("2d");
  b.clearRect(0, 0, W, H);
  b.drawImage(maskCB, 0, 0);
  b.globalCompositeOperation = "destination-in";
  b.drawImage(clipB, 0, 0);
  b.globalCompositeOperation = "source-over";
  a.drawImage(scrB, 0, 0); // union of both sides

  const cc = compC.getContext("2d");
  cc.clearRect(0, 0, W, H);
  cc.drawImage(colorL, 0, 0);
  cc.globalCompositeOperation = "destination-in";
  cc.drawImage(scrA, 0, 0);
  cc.globalCompositeOperation = "source-over";
  ctx.drawImage(compC, 0, 0);

  applyDaylight();
}

/* the hour's light, laid over painting and paper alike (the pane outside the
   canvas gets the same shift via CSS [data-tod] so the sheet reads as one) */
function applyDaylight() {
  if (!TOD_TINT) return;
  ctx.save();
  ctx.globalCompositeOperation = TOD_TINT.op;
  ctx.fillStyle = TOD_TINT.color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* =====================================================================
   THE TIMELINE — a hairline under the sheet; drag it to move the brush
   backwards and forwards through the painting's acts
   ===================================================================== */

function updateTimeline(t) {
  if (!timelineEl || !TOTAL) return;
  const pct = Math.min(100, (t / TOTAL) * 100);
  timelineFill.style.width = pct + "%";
  timelineDot.style.left = pct + "%";
  timelineEl.setAttribute("aria-valuenow", String(Math.round(pct)));
}

function scrubTo(t) {
  t = Math.max(0, Math.min(TOTAL, t));
  tNow = t;
  stopAmbient();
  clearTouches();
  if (finished) {
    finished = false;
    document.body.classList.remove("finished");
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  renderAt(t);
}

function resumeFrom(t) {
  if (t >= TOTAL - 0.05) {
    finish();
    return;
  }
  repaintBtn.disabled = true;
  start = performance.now() - t * 1000;
  rafId = requestAnimationFrame(frame);
}

if (timelineEl) {
  let dragging = false;
  let pendingT = null;
  let scrubRaf = null;
  const tFromEvent = (e) => {
    const r = timelineEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * TOTAL;
  };
  /* coalesce drag events: one full replay per animation frame at most */
  const scheduleScrub = (t) => {
    pendingT = t;
    if (scrubRaf == null)
      scrubRaf = requestAnimationFrame(() => {
        scrubRaf = null;
        scrubTo(pendingT);
      });
  };
  timelineEl.addEventListener("pointerdown", (e) => {
    if (!TOTAL) return;
    dragging = true;
    timelineEl.setPointerCapture(e.pointerId);
    scheduleScrub(tFromEvent(e));
  });
  timelineEl.addEventListener("pointermove", (e) => {
    if (dragging) scheduleScrub(tFromEvent(e));
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    const t = tFromEvent(e);
    scrubTo(t);
    resumeFrom(t);
  };
  timelineEl.addEventListener("pointerup", endDrag);
  timelineEl.addEventListener("pointercancel", endDrag);
  timelineEl.addEventListener("keydown", (e) => {
    if (!TOTAL || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const t = Math.max(0, Math.min(TOTAL, tNow + (e.key === "ArrowRight" ? 2 : -2)));
    scrubTo(t);
    resumeFrom(t);
  });
}

/* =====================================================================
   AFTER THE PAINTING DRIES — the signature writes itself, the string
   lights breathe, the pool keeps moving (barely), and the visitor may
   touch the painting: a wet stroke in the local pigment that dries
   back to the portrait a few seconds later.
   ===================================================================== */

let finalL = null; // the finished, daylit painting, baked once
let ambientId = null;
let twinkles = [];
let ripples = [];
let touches = [];
let sigStart = null;
let sigDone = false;

const SIG = { text: "P. Weiss", x: 946, y: 950, size: 44, tilt: -0.05 };

function bakeFinal() {
  finalL = finalL || layer();
  const f = finalL.getContext("2d");
  f.clearRect(0, 0, W, H);
  f.drawImage(canvas, 0, 0);
}

function drawSignature(c, p) {
  c.save();
  c.translate(SIG.x, SIG.y);
  c.rotate(SIG.tilt);
  c.font = `italic 500 ${SIG.size}px "EB Garamond Variable", Georgia, serif`;
  c.textAlign = "right";
  c.fillStyle = "rgba(59, 47, 40, 0.8)";
  if (p < 1) {
    /* reveal left-to-right, a nib crossing the paper */
    const w = c.measureText(SIG.text).width;
    c.beginPath();
    c.rect(-w - 8, -SIG.size, w * p + 8, SIG.size * 1.5);
    c.clip();
  }
  c.fillText(SIG.text, 0, 0);
  c.restore();
}

function setupAmbient() {
  bakeFinal();
  const pick = (cells, n) => {
    const out = [];
    for (let i = 0; i < n && cells.length; i++) out.push(cells[(Math.random() * cells.length) | 0]);
    return out;
  };
  twinkles = pick(regionCells[R.LIGHTS], 26).map((c) => ({
    x: c.x,
    y: c.y,
    r: 7 + Math.random() * 12,
    ph: Math.random() * Math.PI * 2,
    sp: 0.4 + Math.random() * 0.7,
  }));
  ripples = pick(regionCells[R.POOL], 9).map((c) => ({
    x: c.x,
    y: c.y,
    w: 70 + Math.random() * 90,
    ph: Math.random() * Math.PI * 2,
    sp: 0.25 + Math.random() * 0.3,
  }));
  sigStart = performance.now() + 500;
  sigDone = false;
  startAmbient();
}

function startAmbient() {
  if (ambientId == null && finished) ambientId = requestAnimationFrame(ambientFrame);
}
function stopAmbient() {
  if (ambientId != null) {
    cancelAnimationFrame(ambientId);
    ambientId = null;
  }
}

function ambientFrame(ts) {
  ambientId = null;
  if (!finished || !finalL) return;
  const t = ts / 1000;
  ctx.drawImage(finalL, 0, 0);

  if (!reducedMotion) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    /* the string lights breathe — brighter after dark */
    const boost = TOD === "night" ? 1.8 : 1;
    for (const tw of twinkles) {
      const a = (0.05 + 0.06 * (0.5 + 0.5 * Math.sin(t * tw.sp * Math.PI + tw.ph))) * boost;
      const g = ctx.createRadialGradient(tw.x, tw.y, 0, tw.x, tw.y, tw.r * 2.2);
      g.addColorStop(0, `rgba(255, 238, 190, ${a})`);
      g.addColorStop(1, "rgba(255, 238, 190, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tw.x, tw.y, tw.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    /* the pool keeps moving, barely */
    for (const rp of ripples) {
      const a = 0.028 + 0.028 * (0.5 + 0.5 * Math.sin(t * rp.sp * Math.PI + rp.ph));
      const x = rp.x + Math.sin(t * 0.35 + rp.ph) * 9;
      ctx.save();
      ctx.translate(x, rp.y);
      ctx.scale(1, 0.22);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rp.w);
      g.addColorStop(0, `rgba(225, 255, 248, ${a})`);
      g.addColorStop(1, "rgba(225, 255, 248, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rp.w, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawTouchesFrame(ts);

  /* the signature writes itself, then belongs to the painting */
  if (!sigDone) {
    const p = reducedMotion ? 1 : Math.min(1, Math.max(0, (ts - sigStart) / 1600));
    drawSignature(ctx, p);
    if (p >= 1) {
      drawSignature(finalL.getContext("2d"), 1);
      sigDone = true;
    }
  }

  /* under reduced motion the loop only runs while something needs it */
  const idle = reducedMotion && sigDone && !touches.length;
  if (!idle) ambientId = requestAnimationFrame(ambientFrame);
}

/* ---------- touch the painting ---------- */

function clearTouches() {
  touches = [];
}

function drawTouchesFrame(ts) {
  if (!touches.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  let alive = false;
  for (const st of touches) {
    const age = (ts - st.born) / 1000;
    const fade = age < 3 ? Math.min(1, age * 6) : 1 - (age - 3) / 1.8;
    if (fade <= 0) continue;
    alive = true;
    ctx.globalAlpha = 0.5 * fade;
    /* a wet stroke: saturated pool of pigment with the darker backrun rim
       real watercolor leaves where it dries */
    const g = ctx.createRadialGradient(st.x, st.y, st.r * 0.1, st.x, st.y, st.r);
    g.addColorStop(0, st.color);
    g.addColorStop(0.68, st.colorMid);
    g.addColorStop(0.9, st.colorRim);
    g.addColorStop(1, st.colorT);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (!alive) touches = [];
}

let touchActive = false;
let lastTouch = null;

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

function addWet(p) {
  /* the pigment is sampled from the painting where you touch it */
  const c = colorL.getContext("2d");
  const sx = Math.max(0, Math.min(W - 4, p.x - 2)) | 0;
  const sy = Math.max(0, Math.min(H - 4, p.y - 2)) | 0;
  const d = c.getImageData(sx, sy, 4, 4).data;
  let r = 0,
    g = 0,
    b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  const n = d.length / 4;
  r /= n;
  g /= n;
  b /= n;
  /* wet pigment: more chroma and more depth than the dried paint below it */
  const avg = (r + g + b) / 3;
  const clamp = (v) => Math.max(0, Math.min(255, v)) | 0;
  const wr = clamp((avg + (r - avg) * 1.6) * 0.78);
  const wg = clamp((avg + (g - avg) * 1.6) * 0.78);
  const wb = clamp((avg + (b - avg) * 1.6) * 0.78);
  touches.push({
    x: p.x,
    y: p.y,
    r: 30 + Math.random() * 28,
    born: performance.now(),
    color: `rgba(${wr},${wg},${wb},0.75)`,
    colorMid: `rgba(${wr},${wg},${wb},0.45)`,
    colorRim: `rgba(${clamp(wr * 0.55)},${clamp(wg * 0.55)},${clamp(wb * 0.55)},0.65)`,
    colorT: `rgba(${wr},${wg},${wb},0)`,
  });
  startAmbient();
}

canvas.addEventListener("pointerdown", (e) => {
  if (!finished) return;
  touchActive = true;
  canvas.setPointerCapture(e.pointerId);
  const p = canvasPoint(e);
  lastTouch = p;
  addWet(p);
});
canvas.addEventListener("pointermove", (e) => {
  if (!touchActive || !finished) return;
  const p = canvasPoint(e);
  if (lastTouch && Math.hypot(p.x - lastTouch.x, p.y - lastTouch.y) < 26) return;
  lastTouch = p;
  addWet(p);
});
const endTouch = () => {
  touchActive = false;
  lastTouch = null;
};
canvas.addEventListener("pointerup", endTouch);
canvas.addEventListener("pointercancel", endTouch);

/* ---------- the favicon paints along ---------- */

const favLink = document.querySelector('link[rel="icon"]');
const favC = document.createElement("canvas");
favC.width = favC.height = 64;
let favLast = 0;

function updateFavicon(ts, force) {
  if (!favLink) return;
  if (!force && ts - favLast < 1000) return;
  favLast = ts;
  favC.getContext("2d").drawImage(canvas, 0, 0, 64, 64);
  favLink.setAttribute("type", "image/png");
  favLink.setAttribute("href", favC.toDataURL("image/png"));
}

/* ---------- lifecycle ---------- */
function resetRun() {
  cS.clearRect(0, 0, W, H);
  cCF.clearRect(0, 0, W, H);
  cCB.clearRect(0, 0, W, H);
  stopAmbient();
  clearTouches();
  sigStart = null;
  sigDone = false;
  finished = false;
  document.body.classList.remove("finished");
}

function paint() {
  resetRun();
  planAll();
  doneS = sketchGroups.map(() => 0);
  doneW = washGroups.map(() => 0);
  repaintBtn.disabled = true;
  updateTimeline(0);
  start = null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

function finish() {
  if (finished) return;
  finished = true;
  tNow = TOTAL;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  cCF.fillStyle = "#fff";
  cCF.fillRect(0, 0, W, H);
  cCB.fillStyle = "#fff";
  cCB.fillRect(0, 0, W, H);
  compose(1);
  repaintBtn.disabled = false;
  document.body.classList.add("finished");
  updateTimeline(TOTAL);
  updateFavicon(performance.now(), true);
  setupAmbient();
}

function skipToEnd() {
  if (!TOTAL) planAll();
  cS.fillStyle = "#fff";
  cS.fillRect(0, 0, W, H);
  finish();
}

function init() {
  makeSketch();
  if (reducedMotion) skipToEnd();
  else setTimeout(paint, 500);
}

repaintBtn.addEventListener("click", () => {
  if (reducedMotion) {
    skipToEnd();
    return;
  }
  paint();
});
