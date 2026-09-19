/**
 * remainingLiters ≈ (R / 100) * C * k
 * litersToFull = max(0, V - remainingLiters)
 * cost = litersToFull * P
 */

export function calcFill(tankCapacity, consumption, rangeKm, price, k = 1) {
  const V = Number(tankCapacity) || 0;
  const C = Number(consumption) || 0;
  const R = Number(rangeKm) || 0;
  const P = Number(price) || 0;
  const factor = Number(k) > 0 ? Number(k) : 1;

  const remainingLiters = (R / 100) * C * factor;
  const litersToFull = Math.max(0, V - remainingLiters);
  const cost = litersToFull * P;

  return {
    remainingLiters: round2(remainingLiters),
    litersToFull: round2(litersToFull),
    cost: round2(cost),
  };
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * k = median(actualC / reportedC) по последним N заправкам
 * actualC = litersFilled / ((odo2 - odo1) / 100)
 */
export function computeCalibration(fillups, carId, n = 5) {
  const list = fillups
    .filter((f) => f.carId === carId)
    .slice()
    .sort((a, b) => a.odometer - b.odometer || String(a.date).localeCompare(String(b.date)));

  if (list.length < 2) {
    return { k: 1, sampleCount: 0, hintConsumption: null };
  }

  const ratios = [];
  const start = Math.max(1, list.length - n);

  for (let i = start; i < list.length; i++) {
    const prev = list[i - 1];
    const curr = list[i];
    const dist = curr.odometer - prev.odometer;
    const liters = Number(curr.litersActual != null ? curr.litersActual : curr.litersToFull);
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
  const last = list[list.length - 1];
  const hintConsumption = last?.consumption ? round2(last.consumption * k) : null;

  return { k: round2(k), sampleCount: ratios.length, hintConsumption };
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
