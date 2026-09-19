import { calcFill, computeCalibration, round2 } from '../calc.js';
import { getActiveCar, getLastInputs, setLastInputs } from '../storage.js';
import { addFillup } from '../dictionaries.js';
import { listCars, setActiveCar } from '../cars.js';

let root = null;
let getData = null;
let setData = null;
let onSaved = null;

export function initRefuel(el, deps) {
  root = el;
  getData = deps.getData;
  setData = deps.setData;
  onSaved = deps.onSaved;
  render();
}

export function refreshRefuel() {
  if (root) render();
}

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function readForm() {
  return {
    odometer: root.querySelector('#odo').value,
    stationId: root.querySelector('#station').value,
    rangeKm: root.querySelector('#range').value,
    consumption: root.querySelector('#cons').value,
    fuelId: root.querySelector('#fuel').value,
    price: root.querySelector('#price').value,
    date: root.querySelector('#date').value,
    litersActual: root.querySelector('#liters-actual')?.value ?? '',
  };
}

function persistInputs() {
  const data = getData();
  const car = getActiveCar(data);
  setLastInputs(data, car.id, readForm());
}

function syncStationLogo() {
  const data = getData();
  const id = root.querySelector('#station')?.value;
  const station = data.stations.find((s) => s.id === id);
  const img = root.querySelector('#station-logo');
  const ph = root.querySelector('#station-logo-ph');
  if (!img || !ph) return;
  if (station?.logo) {
    img.src = station.logo;
    img.hidden = false;
    ph.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    ph.hidden = false;
  }
}

function recalc() {
  const data = getData();
  const car = getActiveCar(data);
  const form = readForm();
  const calib = computeCalibration(data.fillups, car.id);
  const result = calcFill(car.tankCapacity, form.consumption, form.rangeKm, form.price, calib.k);

  const litersEl = root.querySelector('#result-liters');
  const costEl = root.querySelector('#result-cost');
  const hintEl = root.querySelector('#calib-hint');
  if (litersEl) litersEl.textContent = formatNum(result.litersToFull);
  if (costEl) costEl.textContent = formatNum(result.cost);
  if (hintEl) {
    if (calib.sampleCount > 0) {
      hintEl.textContent = `Коррекция k=${calib.k}${
        calib.hintConsumption != null ? ` · ориентир ${calib.hintConsumption} л/100` : ''
      }`;
      hintEl.hidden = false;
    } else {
      hintEl.hidden = true;
    }
  }
  return result;
}

function formatNum(n) {
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

function render() {
  const data = getData();
  const car = getActiveCar(data);
  const last = getLastInputs(data, car.id);
  const lastFill = data.fillups
    .filter((f) => f.carId === car.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.odometer - a.odometer)[0];

  const defaults = {
    odometer: last?.odometer ?? lastFill?.odometer ?? '',
    stationId: last?.stationId ?? lastFill?.stationId ?? data.stations[0]?.id ?? '',
    rangeKm: last?.rangeKm ?? '',
    consumption: last?.consumption ?? lastFill?.consumption ?? '9.5',
    fuelId: last?.fuelId ?? lastFill?.fuelId ?? data.fuels[0]?.id ?? '',
    price: last?.price ?? lastFill?.price ?? '',
    date: last?.date && last.date === todayISO() ? last.date : todayISO(),
    litersActual: '',
  };

  const selectedStation = data.stations.find((s) => s.id === defaults.stationId) || data.stations[0];

  root.innerHTML = `
    <header class="screen-header">
      <div class="brand-row">
        <div class="car-thumb" style="--car-color:${car.color}">
          ${car.image ? `<img src="${car.image}" alt="">` : `<span class="car-glyph">◆</span>`}
        </div>
        <h1 class="app-title">Долей!</h1>
        <div class="brand-meta">
          <select id="car-select" class="car-select" aria-label="Автомобиль">
            ${listCars(data)
              .map(
                (c) =>
                  `<option value="${c.id}" ${c.id === car.id ? 'selected' : ''}>${escapeHtml(
                    c.name
                  )}${c.plate ? ' · ' + escapeHtml(c.plate) : ''}</option>`
              )
              .join('')}
          </select>
          <p class="tank-meta">Бак ${car.tankCapacity} л</p>
        </div>
      </div>
    </header>

    <form id="refuel-form" class="dash-form" autocomplete="off">
      <div class="field-row">
        <label class="field">
          <span>Одометр, км</span>
          <input id="odo" inputmode="numeric" type="number" step="1" min="0" value="${escapeAttr(
            defaults.odometer
          )}" required>
        </label>
        <label class="field">
          <span>Дата</span>
          <input id="date" type="date" value="${escapeAttr(defaults.date)}" required>
        </label>
      </div>

      <label class="field">
        <span>Сеть АЗС</span>
        <div class="station-picker">
          <img id="station-logo" class="station-logo-lg" alt="" ${
            selectedStation?.logo
              ? `src="${selectedStation.logo}"`
              : 'hidden'
          }>
          <span id="station-logo-ph" class="station-logo-lg logo-ph" ${
            selectedStation?.logo ? 'hidden' : ''
          }>⛽</span>
          <select id="station">
            ${data.stations
              .map(
                (s) =>
                  `<option value="${s.id}" ${s.id === defaults.stationId ? 'selected' : ''}>${escapeHtml(
                    s.name
                  )}${s.address ? ' — ' + escapeHtml(s.address) : ''}</option>`
              )
              .join('')}
          </select>
        </div>
      </label>

      <div class="field-row">
        <label class="field">
          <span>До пустого, км</span>
          <input id="range" inputmode="decimal" type="number" step="1" min="0" value="${escapeAttr(
            defaults.rangeKm
          )}" required>
        </label>
        <label class="field">
          <span>Расход, л/100</span>
          <input id="cons" inputmode="decimal" type="number" step="0.1" min="0" value="${escapeAttr(
            defaults.consumption
          )}" required>
        </label>
      </div>

      <div class="field-row">
        <label class="field">
          <span>Марка топлива</span>
          <select id="fuel">
            ${data.fuels
              .map(
                (f) =>
                  `<option value="${f.id}" ${f.id === defaults.fuelId ? 'selected' : ''}>${escapeHtml(
                    f.name
                  )}</option>`
              )
              .join('')}
          </select>
        </label>
        <label class="field">
          <span>Цена, ₽/л</span>
          <input id="price" inputmode="decimal" type="number" step="0.01" min="0" value="${escapeAttr(
            defaults.price
          )}" required>
        </label>
      </div>

      <p id="calib-hint" class="calib-hint" hidden></p>

      <div class="result-block result-row" aria-live="polite">
        <div class="result-main">
          <span class="result-label">К заправке</span>
          <span class="result-value"><span id="result-liters">0</span> <small>л</small></span>
        </div>
        <div class="result-cost">
          <span class="result-label">Стоимость</span>
          <span class="result-value-sm"><span id="result-cost">0</span> <small>₽</small></span>
        </div>
      </div>

      <label class="field field-optional">
        <span>Факт залито, л <em>(необяз.)</em></span>
        <input id="liters-actual" inputmode="decimal" type="number" step="0.01" min="0" placeholder="для коррекции">
      </label>

      <button type="submit" class="btn-primary">Сохранить заправку</button>
      <p id="save-msg" class="save-msg" hidden></p>
    </form>
  `;

  root.querySelector('#car-select').addEventListener('change', (e) => {
    const d = getData();
    setActiveCar(d, e.target.value);
    setData(d);
    render();
  });

  const form = root.querySelector('#refuel-form');
  form.addEventListener('input', () => {
    recalc();
    persistInputs();
  });
  form.addEventListener('change', () => {
    syncStationLogo();
    recalc();
    persistInputs();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = getData();
    const active = getActiveCar(d);
    const formData = readForm();
    const calib = computeCalibration(d.fillups, active.id);
    const result = calcFill(
      active.tankCapacity,
      formData.consumption,
      formData.rangeKm,
      formData.price,
      calib.k
    );

    addFillup(d, {
      carId: active.id,
      date: formData.date,
      odometer: formData.odometer,
      rangeKm: formData.rangeKm,
      consumption: formData.consumption,
      fuelId: formData.fuelId,
      price: formData.price,
      stationId: formData.stationId,
      litersToFull: result.litersToFull,
      cost: result.cost,
      litersActual: formData.litersActual,
    });

    setLastInputs(d, active.id, { ...formData, litersActual: '' });
    setData(d);

    const msg = root.querySelector('#save-msg');
    msg.textContent = `Сохранено: ${formatNum(result.litersToFull)} л · ${formatNum(result.cost)} ₽`;
    msg.hidden = false;
    if (onSaved) onSaved();
    setTimeout(() => {
      if (msg) msg.hidden = true;
    }, 2500);
  });

  syncStationLogo();
  recalc();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

export { round2 };
