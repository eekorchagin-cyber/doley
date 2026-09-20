import { calcFill, computeCalibration, round2 } from '../calc.js';
import {
  getActiveCar,
  getLastInputs,
  setLastInputs,
  getNetwork,
  stationsByNetwork,
} from '../storage.js';
import { addFillup } from '../dictionaries.js';
import { listCars, setActiveCar } from '../cars.js';

let root = null;
let getData = null;
let setData = null;
let onSaved = null;
/** После сохранения ждём «Новая заправка», чтобы не создать дубль. */
const AWAITING_KEY = 'doley:awaiting-new-fillup';
let awaitingNew = sessionStorage.getItem(AWAITING_KEY) === '1';

function setAwaitingNew(value) {
  awaitingNew = value;
  if (value) sessionStorage.setItem(AWAITING_KEY, '1');
  else sessionStorage.removeItem(AWAITING_KEY);
}

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
    networkId: root.querySelector('#network').value,
    stationId: root.querySelector('#station').value || null,
    rangeKm: root.querySelector('#range').value,
    consumption: root.querySelector('#cons').value,
    fuelId: root.querySelector('#fuel').value,
    price: root.querySelector('#price').value,
    date: root.querySelector('#date').value,
    litersActual: root.querySelector('#liters-actual')?.value ?? '',
  };
}

function persistInputs() {
  if (awaitingNew) return;
  const data = getData();
  const car = getActiveCar(data);
  setLastInputs(data, car.id, readForm());
}

function syncNetworkLogo() {
  const data = getData();
  const network = getNetwork(data, root.querySelector('#network')?.value);
  const img = root.querySelector('#network-logo');
  if (!img) return;
  if (network?.logo) {
    img.src = network.logo;
    img.hidden = false;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
  }
}

function refillStations(preferredId) {
  const data = getData();
  const networkId = root.querySelector('#network')?.value;
  const select = root.querySelector('#station');
  if (!select) return;
  const list = stationsByNetwork(data, networkId);
  select.innerHTML = list.length
    ? list
        .map(
          (s) =>
            `<option value="${s.id}" ${s.id === preferredId ? 'selected' : ''}>${escapeHtml(
              s.address
            )}</option>`
        )
        .join('')
    : `<option value="">Нет адреса</option>`;
  select.disabled = list.length === 0;
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

function pickRemembered(...values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

function prepareNewFillup() {
  setAwaitingNew(false);
  const data = getData();
  const car = getActiveCar(data);
  const last = getLastInputs(data, car.id) || {};
  setLastInputs(
    data,
    car.id,
    {
      ...last,
      odometer: '',
      rangeKm: '',
      litersActual: '',
      date: todayISO(),
    },
    { clearTripFields: true }
  );
  setData(data);
  render();
  root.querySelector('#odo')?.focus();
}

function setFormLocked(locked) {
  const form = root.querySelector('#refuel-form');
  if (!form) return;
  form.querySelectorAll('input, select').forEach((el) => {
    if (el.id === 'car-select') return;
    el.disabled = locked;
  });
  const station = root.querySelector('#station');
  if (station && !locked) {
    const data = getData();
    const list = stationsByNetwork(data, root.querySelector('#network')?.value);
    station.disabled = list.length === 0;
  }
}

function render() {
  const data = getData();
  const car = getActiveCar(data);
  const last = getLastInputs(data, car.id);
  const lastFill = data.fillups
    .filter((f) => f.carId === car.id)
    .sort((a, b) => b.odometer - a.odometer || String(b.date).localeCompare(String(a.date)))[0];

  let networkId =
    last?.networkId ?? lastFill?.networkId ?? data.networks[0]?.id ?? '';
  if (last?.stationId) {
    const st = data.stations.find((s) => s.id === last.stationId);
    if (st) networkId = st.networkId;
  } else if (lastFill?.stationId) {
    const st = data.stations.find((s) => s.id === lastFill.stationId);
    if (st) networkId = st.networkId;
  }

  const stationId =
    last?.stationId ??
    lastFill?.stationId ??
    stationsByNetwork(data, networkId)[0]?.id ??
    '';

  const defaults = {
    odometer: awaitingNew ? '' : pickRemembered(last?.odometer),
    networkId,
    stationId,
    rangeKm: awaitingNew ? '' : pickRemembered(last?.rangeKm),
    consumption: pickRemembered(last?.consumption, lastFill?.consumption, '9.5'),
    fuelId: last?.fuelId ?? lastFill?.fuelId ?? data.fuels[0]?.id ?? '',
    price: pickRemembered(last?.price, lastFill?.price),
    date: todayISO(),
    litersActual: awaitingNew ? '' : pickRemembered(last?.litersActual),
  };

  const selectedNetwork = getNetwork(data, defaults.networkId) || data.networks[0];
  const networkStations = stationsByNetwork(data, selectedNetwork?.id);

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
        <span>АЗС</span>
        <div class="station-picker">
          <img id="network-logo" class="station-logo-lg" alt="" ${
            selectedNetwork?.logo ? `src="${selectedNetwork.logo}"` : 'hidden'
          }>
          <select id="network" class="network-select" aria-label="Сеть">
            ${data.networks
              .map(
                (n) =>
                  `<option value="${n.id}" ${n.id === selectedNetwork?.id ? 'selected' : ''}>${escapeHtml(
                    n.name
                  )}</option>`
              )
              .join('')}
          </select>
          <select id="station" class="address-select" aria-label="Адрес" ${
            networkStations.length ? '' : 'disabled'
          }>
            ${
              networkStations.length
                ? networkStations
                    .map(
                      (s) =>
                        `<option value="${s.id}" ${s.id === defaults.stationId ? 'selected' : ''}>${escapeHtml(
                          s.address
                        )}</option>`
                    )
                    .join('')
                : `<option value="">Нет адреса</option>`
            }
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
        <input id="liters-actual" inputmode="decimal" type="number" step="0.01" min="0" placeholder="для коррекции" value="${escapeAttr(
          defaults.litersActual
        )}">
      </label>

      ${
        awaitingNew
          ? `<button type="button" class="btn-primary" id="btn-new-fillup">Новая заправка</button>
             <p id="save-msg" class="save-msg">Заправка сохранена. Нажмите «Новая заправка» для следующего ввода.</p>`
          : `<button type="submit" class="btn-primary">Сохранить заправку</button>
             <p id="save-msg" class="save-msg" hidden></p>`
      }
    </form>
  `;

  root.querySelector('#car-select').addEventListener('change', (e) => {
    awaitingNew = false;
    const d = getData();
    setActiveCar(d, e.target.value);
    setData(d);
    render();
  });

  const form = root.querySelector('#refuel-form');
  root.querySelector('#network')?.addEventListener('change', () => {
    refillStations();
    syncNetworkLogo();
    persistInputs();
  });

  root.querySelector('#btn-new-fillup')?.addEventListener('click', () => {
    prepareNewFillup();
  });

  form.addEventListener('input', () => {
    if (awaitingNew) return;
    recalc();
    persistInputs();
  });
  form.addEventListener('change', () => {
    if (awaitingNew) return;
    recalc();
    persistInputs();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (awaitingNew) return;

    const d = getData();
    const active = getActiveCar(d);
    const formData = readForm();
    if (!formData.stationId) {
      alert('Добавьте заправку с адресом в справочнике и выберите её');
      return;
    }
    const calib = computeCalibration(d.fillups, active.id);
    const result = calcFill(
      active.tankCapacity,
      formData.consumption,
      formData.rangeKm,
      formData.price,
      calib.k
    );

    const payload = {
      carId: active.id,
      date: formData.date,
      odometer: formData.odometer,
      rangeKm: formData.rangeKm,
      consumption: formData.consumption,
      fuelId: formData.fuelId,
      price: formData.price,
      networkId: formData.networkId,
      stationId: formData.stationId,
      litersToFull: result.litersToFull,
      cost: result.cost,
      litersActual: formData.litersActual,
    };

    const added = addFillup(d, payload);
    if (!added.ok) {
      alert(added.reason || 'Не удалось сохранить заправку');
      return;
    }

    setLastInputs(
      d,
      active.id,
      {
        ...formData,
        odometer: '',
        rangeKm: '',
        litersActual: '',
        date: todayISO(),
      },
      { clearTripFields: true }
    );
    setData(d);

    awaitingNew = true;
    if (onSaved) onSaved();
    render();
  });

  if (awaitingNew) {
    setFormLocked(true);
  } else {
    syncNetworkLogo();
    recalc();
  }
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
