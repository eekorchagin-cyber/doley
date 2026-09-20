/**
 * remainingLiters ≈ (R / 100) * C * k
 * litersToFull = max(0, V - remainingLiters)
 */

export function calcFill(tankCapacity, consumption, rangeKm, price, k = 1) {
  const V = Number(tankCapacity) || 0;
  const C = Number(consumption) || 0;
  const R = Number(rangeKm) || 0;
  const factor = Number(k) > 0 ? Number(k) : 1;

  const remainingLiters = (R / 100) * C * factor;
  const litersToFull = Math.max(0, V - remainingLiters);

  return {
    remainingLiters: round2(remainingLiters),
    litersToFull: round2(litersToFull),
  };
}

/** Стоимость по фактическому объёму */
export function calcCost(litersActual, price) {
  const L = Number(litersActual);
  const P = Number(price) || 0;
  if (!Number.isFinite(L) || L < 0) return null;
  return round2(L * P);
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Старые записи без флага считаем заправкой до полного */
export function isFullTank(fillup) {
  if (!fillup) return true;
  if (fillup.fullTank === false) return false;
  return true;
}

/**
 * k = median(actualC / reportedC) по сегментам «полное → полное»
 * (литры частичных заправок между ними суммируются)
 */
export function computeCalibration(fillups, carId, n = 5) {
  const list = fillups
    .filter((f) => f.carId === carId)
    .slice()
    .sort((a, b) => a.odometer - b.odometer || String(a.date).localeCompare(String(b.date)));

  const fulls = list.filter((f) => isFullTank(f));
  if (fulls.length < 2) {
    return { k: 1, sampleCount: 0, hintConsumption: null };
  }

  const ratios = [];
  const start = Math.max(1, fulls.length - n);

  for (let i = start; i < fulls.length; i++) {
    const prev = fulls[i - 1];
    const curr = fulls[i];
    const dist = curr.odometer - prev.odometer;
    const liters = sumLitersBetween(list, prev, curr);
    const reportedC = Number(curr.consumption) || Number(prev.consumption);

    if (dist <= 0 || !liters || liters <= 0 || !reportedC) continue;

    const actualC = liters / (dist / 100);
    const ratio = actualC / reportedC;
    if (ratio > 0.3 && ratio < 3) ratios.push(ratio);
  }

  if (!ratios.length) {
    return { k: 1, sampleCount: 0, hintConsumption: null };
  }

  const k = median(ratios);
  const last = fulls[fulls.length - 1];
  const hintConsumption = last?.consumption ? round2(last.consumption * k) : null;

  return { k: round2(k), sampleCount: ratios.length, hintConsumption };
}

/** Сумма литров от заправки afterPrev (невключительно) до curr (включительно) */
export function sumLitersBetween(sortedList, prevFull, curr) {
  let sum = 0;
  let counting = false;
  for (const f of sortedList) {
    if (f.id === prevFull.id) {
      counting = true;
      continue;
    }
    if (!counting) continue;
    const L = litersUsedForFillup(f);
    if (L != null && L > 0) sum += L;
    if (f.id === curr.id) break;
  }
  return sum > 0 ? round2(sum) : 0;
}

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function costPerKm(cost, distanceKm) {
  if (!distanceKm || distanceKm <= 0) return null;
  return round2(cost / distanceKm);
}

/**
 * Фактический расход:
 * liters * 100 / distanceKm
 */
export function actualConsumption(liters, distanceKm) {
  const L = Number(liters);
  const D = Number(distanceKm);
  if (!(L > 0) || !(D > 0)) return null;
  return round2(L / (D / 100));
}

/** Литры, залитые на этой заправке */
export function litersUsedForFillup(fillup) {
  if (!fillup) return null;
  if (fillup.litersActual != null && fillup.litersActual !== '') {
    return Number(fillup.litersActual);
  }
  const estimated = Number(fillup.litersToFull);
  return Number.isFinite(estimated) ? estimated : null;
}

/**
 * Метрики расхода для хронологического списка заправок.
 * Расход л/100 считается только на заправках «до полного»:
 * литры = сумма всех заливок с прошлого полного (включая частичные и текущее полное),
 * пробег = одометр текущего полного − одометр прошлого полного.
 */
export function buildFillupAnalytics(sortedAsc) {
  let lastFullIdx = -1;
  return sortedAsc.map((f, i) => {
    const prev = i > 0 ? sortedAsc[i - 1] : null;
    const distance = prev ? f.odometer - prev.odometer : null;
    const validDistance = distance != null && distance > 0 ? distance : null;
    const litersFilled = litersUsedForFillup(f);
    const full = isFullTank(f);

    let segmentDistance = null;
    let segmentLiters = null;
    let actualCons = null;

    if (full && lastFullIdx >= 0) {
      const prevFull = sortedAsc[lastFullIdx];
      const dist = f.odometer - prevFull.odometer;
      if (dist > 0) {
        segmentDistance = dist;
        segmentLiters = sumLitersBetween(sortedAsc, prevFull, f);
        actualCons = actualConsumption(segmentLiters, segmentDistance);
      }
    }

    if (full) lastFullIdx = i;

    return {
      fillup: f,
      fullTank: full,
      distance: validDistance,
      litersFilled,
      litersUsed: full ? segmentLiters : litersFilled,
      actualCons: full ? actualCons : null,
      segmentDistance,
    };
  });
}
