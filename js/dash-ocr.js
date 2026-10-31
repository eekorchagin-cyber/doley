/**
 * Распознавание показаний с фото приборной панели (Volvo, цифровая панель).
 * Опора — «NNN km» запаса хода в нижней строке; одометр левее, средний расход правее.
 * Всё считается на телефоне, Tesseract.js грузится с CDN при первом использовании.
 */

const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const BASE_WIDTH = 2048;
/** Высота цифр во фрагменте перед распознаванием, px. */
const TARGET_DIGIT_H = 45;
/** Иначе для мелкого текста фрагмент раздувается до десятков тысяч пикселей и распознаётся минутами. */
const MAX_CROP_W = 2400;
/** Строки с цифрами ниже этой высоты (px на снимке шириной BASE_WIDTH) — шум. */
const MIN_DIGIT_H = 9;
const WHITELIST = '0123456789.,/kmlTA ';
/** Доля между тёмным и светлым, выше которой пиксель считается текстом. Перебираются по очереди. */
const THRESHOLDS = [0.85, 0.75, 0.92];
/** Пороги для общего прохода по всему кадру — поиска строк с цифрами. */
const FIRST_PASS_THRESHOLDS = [0.85, 0.75];

let scriptPromise = null;
let workerPromise = null;

function loadScript() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_SRC;
      s.async = true;
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('load')));
      s.onerror = () => reject(new Error('load'));
      document.head.appendChild(s);
    }).catch((e) => {
      scriptPromise = null;
      throw e;
    });
  }
  return scriptPromise;
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = loadScript()
      .then((T) => T.createWorker('eng'))
      .catch(() => {
        workerPromise = null;
        throw new Error('Не удалось загрузить распознавание. Для первого раза нужен интернет.');
      });
  }
  return workerPromise;
}

async function drawBase(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = BASE_WIDTH / img.naturalWidth;
    const canvas = document.createElement('canvas');
    canvas.width = BASE_WIDTH;
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function grayOf(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const g = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    g[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return g;
}

function percentiles(values, lo, hi) {
  const hist = new Uint32Array(256);
  for (const v of values) hist[v]++;
  const n = values.length;
  let acc = 0;
  let pLo = 0;
  let pHi = 255;
  let gotLo = false;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (!gotLo && acc >= n * lo) {
      pLo = v;
      gotLo = true;
    }
    if (acc >= n * hi) {
      pHi = v;
      break;
    }
  }
  return [pLo, Math.max(pHi, pLo + 1)];
}

function canvasFromGray(gray, w, h, map) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let j = 0, i = 0; j < gray.length; j++, i += 4) {
    const v = map(gray[j]);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function flattenWords(data) {
  if (Array.isArray(data.words) && data.words.length) return data.words;
  const out = [];
  for (const b of data.blocks || []) {
    for (const p of b.paragraphs || []) {
      for (const l of p.lines || []) out.push(...(l.words || []));
    }
  }
  return out;
}

const clean = (s) => String(s || '').replace(/[^0-9A-Za-z.,/]/g, '');
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Светлый текст на тёмном фоне → чёрный на белом, цифры высотой ~TARGET_DIGIT_H. */
function cropForOcr(base, box, h, frac) {
  const k = Math.min(TARGET_DIGIT_H / h, MAX_CROP_W / box.w);
  const pad = 30;
  const cw = Math.max(1, Math.round(box.w * k));
  const ch = Math.max(1, Math.round(box.h * k));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, box.x, box.y, box.w, box.h, 0, 0, cw, ch);
  const gray = grayOf(c);
  const [lo, hi] = percentiles(gray, 0.01, 0.999);
  const t = lo + (hi - lo) * frac;
  const bin = canvasFromGray(gray, cw, ch, (v) => (v > t ? 0 : 255));
  const out = document.createElement('canvas');
  out.width = cw + pad * 2;
  out.height = ch + pad * 2;
  const octx = out.getContext('2d');
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(bin, pad, pad);
  return out;
}

async function ocr(worker, canvas, psm, whitelist = '') {
  await worker.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: whitelist });
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
  return data;
}

/**
 * Строки, где на общем снимке нашлись цифры, нижние первыми: строка бортового компьютера — внизу панели.
 * Высота строки — минимальная высота слова: «⌀», «ℓ» и «/» выше цифр.
 */
function numericBands(words) {
  const nums = words
    .filter((x) => !String(x.text).includes(':') && /\d/.test(clean(x.text)))
    .map((x) => ({ cy: (x.bbox.y0 + x.bbox.y1) / 2, h: x.bbox.y1 - x.bbox.y0 }))
    .filter((x) => x.h >= MIN_DIGIT_H)
    .sort((a, b) => b.cy - a.cy);
  const bands = [];
  for (const n of nums) {
    const band = bands.find((b) => Math.abs(b.cy - n.cy) < 0.6 * Math.max(b.h, n.h));
    if (band) band.h = Math.min(band.h, n.h);
    else bands.push({ cy: n.cy, h: n.h });
  }
  return bands.slice(0, 5);
}

/** Группы текста в строке: столбцы со светлыми пикселями, разделённые промежутками > 1.5h. */
function segmentStrip(gray, w, y0, y1, h, frac) {
  const rows = [];
  for (let y = y0; y < y1; y++) rows.push(gray.subarray(y * w, (y + 1) * w));
  const sample = new Uint8Array(rows.length * w);
  rows.forEach((r, i) => sample.set(r, i * w));
  const [lo, hi] = percentiles(sample, 0.02, 0.995);
  const t = lo + (hi - lo) * frac;

  const cols = new Uint16Array(w);
  for (const r of rows) for (let x = 0; x < w; x++) if (r[x] > t) cols[x]++;

  const gap = 1.5 * h;
  const segs = [];
  let start = -1;
  let last = -1;
  for (let x = 0; x < w; x++) {
    if (cols[x] >= 2) {
      if (start < 0) start = x;
      else if (x - last > gap) {
        segs.push([start, last]);
        start = x;
      }
      last = x;
    }
  }
  if (start >= 0) segs.push([start, last]);
  return {
    t,
    segs: segs.filter(([a, b]) => b - a >= 0.6 * h).map(([a, b]) => ({ x0: a, x1: b })),
  };
}

/** Строки текста внутри группы: одометр стоит над счётчиком поездки, вместе они читаются плохо. */
function splitRows(gray, w, s, y0, y1, h, t) {
  const counts = [];
  for (let y = y0; y < y1; y++) {
    let n = 0;
    const off = y * w;
    for (let x = s.x0; x <= s.x1; x++) if (gray[off + x] > t) n++;
    counts.push(n);
  }
  const rows = [];
  let start = -1;
  let last = -1;
  counts.forEach((n, i) => {
    if (n < 2) return;
    if (start < 0) start = i;
    else if (i - last > 0.15 * h) {
      rows.push([start, last]);
      start = i;
    }
    last = i;
  });
  if (start >= 0) rows.push([start, last]);

  // Строки вплотную друг к другу: режем блок высотой в две строки по самому пустому ряду в середине.
  const out = [];
  for (const [a, b] of rows) {
    if (b - a >= 1.6 * h) {
      let cut = -1;
      for (let i = Math.round(a + 0.6 * h); i <= Math.round(b - 0.6 * h); i++) {
        if (cut < 0 || counts[i] < counts[cut]) cut = i;
      }
      out.push([a, cut], [cut + 1, b]);
    } else {
      out.push([a, b]);
    }
  }
  return out.filter(([a, b]) => b - a >= 0.5 * h).map(([a, b]) => [a + y0, b + y0]);
}

/**
 * Расход «15.3 ℓ/100 km»: Volvo всегда показывает один знак после запятой, поэтому «153 00» = 15,3.
 * Обязательный хвост «100»/«00» отличает расход от меток шкал.
 */
const CONS_RE = /(\d[\d.,]*\d)\s*[l/({|\s]{0,4}1?00(?!\d)/;
/** Запас хода «460 km»: целое число и буквы после него. */
const RANGE_RE = /(?<![\d/.,])([1-9]\d{1,3})\s*[a-z]{1,3}(?!\d)/gi;
/** Одометр: 4–7 цифр без ведущего нуля и без «km» после. */
const ODO_RE = /(?<![\d.,])([1-9]\d{3,6})(?![\d.,])(?!\s*k)/gi;

/** Первым идёт число, дочитанное по отдельной строке, — оно надёжнее чтения всей группы. */
function pickOdometer(candidates, prevOdo) {
  const list = prevOdo > 0 ? candidates.filter((v) => v >= prevOdo - 100 && v < prevOdo + 20000) : candidates;
  return list.length ? list[0] : null;
}

/**
 * «15.3» → 15,3. Без точки берутся три последние цифры с одним знаком после запятой:
 * «⌀» перед числом иногда читается как лишняя цифра («2153» → 15,3).
 */
function consumptionValue(raw) {
  const dec = /(\d{1,2})[.,](\d)$/.exec(raw);
  if (dec) return Number(`${dec[1]}.${dec[2]}`);
  const digits = raw.replace(/\D/g, '').slice(-3);
  return digits.length >= 2 ? Number(digits) / 10 : null;
}

/** Тексты групп строки слева направо → значения и оценка, насколько строка похожа на бортовой компьютер. */
function parseLine(texts, prevOdo) {
  const line = texts.join(' | ');
  const cons = CONS_RE.exec(line);
  const consumption = cons ? consumptionValue(cons[1]) : null;
  const beforeCons = cons ? line.slice(0, cons.index) : line;

  let range = null;
  for (const m of beforeCons.matchAll(RANGE_RE)) range = m;
  const rangeKm = range && Number(range[1]) <= 1500 ? Number(range[1]) : null;
  const beforeRange = range ? beforeCons.slice(0, range.index) : beforeCons;

  const odometer = pickOdometer([...beforeRange.matchAll(ODO_RE)].map((m) => Number(m[1])), prevOdo);
  const okCons = consumption != null && consumption >= 2 && consumption <= 40;
  return {
    consumption: okCons ? consumption : null,
    rangeKm,
    odometer,
    score: (okCons ? 2 : 0) + (rangeKm != null ? 2 : 0) + (odometer != null ? 1 : 0) + (odometer != null && prevOdo > 0 ? 1 : 0),
  };
}

async function readLine(worker, base, gray, band, frac, prevOdo, trace) {
  const { cy, h } = band;
  const y0 = Math.max(0, Math.round(cy - 1.3 * h));
  const y1 = Math.min(base.height, Math.round(cy + 1.3 * h));
  const texts = [];
  const { segs, t } = segmentStrip(gray, base.width, y0, y1, h, frac);
  for (const s of segs.slice(0, 10)) {
    const x = Math.max(0, Math.round(s.x0 - 0.3 * h));
    const bw = Math.min(base.width, Math.round(s.x1 + 0.3 * h)) - x;
    const box = { x, y: y0, w: bw, h: y1 - y0 };
    let text = oneLine((await ocr(worker, cropForOcr(base, box, h, frac), 6, WHITELIST)).text);
    const rows = splitRows(gray, base.width, s, y0, y1, h, t);
    if (trace) trace.push(`  seg ${s.x0}-${s.x1} y${y0}-${y1} rows ${JSON.stringify(rows)} «${text}»`);
    if (rows.length >= 2) {
      // Одометр — длинное число в одной из строк группы; дочитываем каждую строку отдельно.
      for (const [ra, rb] of rows) {
        const ya = Math.max(0, Math.round(ra - 0.25 * h));
        const rowBox = { x, y: ya, w: bw, h: Math.min(base.height, Math.round(rb + 0.25 * h)) - ya };
        const rowText = oneLine((await ocr(worker, cropForOcr(base, rowBox, h, frac), 7, '0123456789')).text);
        if (/^\d{4,7}$/.test(rowText)) text = `${rowText} ${text}`;
      }
    }
    if (text) texts.push(text);
  }
  const parsed = parseLine(texts, prevOdo);
  if (trace) trace.push(`y${Math.round(cy)} h${h} ${frac}: ${texts.join(' | ')} → ${JSON.stringify(parsed)}`);
  return parsed;
}

/** Самое частое значение среди прогонов с разными порогами; при равенстве — из прогона с лучшей оценкой. */
function vote(runs, key) {
  const counts = new Map();
  for (const r of runs) if (r[key] != null) counts.set(r[key], (counts.get(r[key]) || 0) + 1);
  let best = null;
  let bestN = 0;
  for (const r of [...runs].sort((a, b) => b.score - a.score)) {
    const n = counts.get(r[key]) || 0;
    if (r[key] != null && n > bestN) {
      best = r[key];
      bestN = n;
    }
  }
  return best;
}

/**
 * @param {Blob} file фото панели
 * @param {{ prevOdo?: number, onStatus?: (s: string) => void, debug?: boolean }} [opts]
 * @returns {Promise<{ odometer: number|null, rangeKm: number|null, consumption: number|null }>}
 */
export async function readDashboard(file, opts = {}) {
  const status = opts.onStatus || (() => {});
  const trace = opts.debug ? [] : null;
  if (!workerPromise) status('Загружаю распознавание… В первый раз это может занять до минуты.');
  const worker = await getWorker();
  status('Ищу показания…');

  const base = await drawBase(file);
  const w = base.width;
  const hgt = base.height;
  const gray = grayOf(base);
  const [lo, hi] = percentiles(gray, 0.01, 0.99);
  // Строку ищем на чёрно-белом кадре: на сером при бликах она теряется целиком.
  const words = [];
  for (const frac of FIRST_PASS_THRESHOLDS) {
    const t = lo + (hi - lo) * frac;
    const bin = canvasFromGray(gray, w, hgt, (v) => (v > t ? 0 : 255));
    words.push(...flattenWords(await ocr(worker, bin, 11)));
  }
  const prevOdo = Number(opts.prevOdo) || 0;

  status('Распознаю цифры…');
  let best = null;
  for (const band of numericBands(words)) {
    const runs = [];
    for (const frac of THRESHOLDS) runs.push(await readLine(worker, base, gray, band, frac, prevOdo, trace));
    const total = runs.reduce((s, r) => s + r.score, 0);
    if (!best || total > best.total) best = { runs, total };
    // Все три показания уверенно найдены — остальные строки не нужны.
    if (runs.filter((r) => r.score >= 5).length >= 2) break;
  }

  const result = { odometer: null, rangeKm: null, consumption: null };
  if (best && best.total > 0) {
    result.odometer = vote(best.runs, 'odometer');
    result.rangeKm = vote(best.runs, 'rangeKm');
    result.consumption = vote(best.runs, 'consumption');
  }
  if (trace) result.debug = trace;
  return result;
}
