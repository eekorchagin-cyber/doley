import { calcFill, calcCost, computeCalibration, round2 } from '../calc.js';
import {
  getActiveCar,
  getLastInputs,
  setLastInputs,
  getNetwork,
  stationsByNetwork,
} from '../storage.js';
import { addFillup, listFuels, listNetworks } from '../dictionaries.js';
import { listCars, setActiveCar } from '../cars.js';
import { syncLayout } from '../layout.js';

let root = null;
let getData = null;
let setData = null;
let onSaved = null;
/** После сохранения ждём «Новая заправка», чтобы не создать дубль. */
const AWAITING_KEY = 'doley:awaiting-new-fillup';

function readAwaitingFlag() {
  try {
    if (localStorage.getItem(AWAITING_KEY) === '1') return true;
    // Миграция со старого sessionStorage
    if (sessionStorage.getItem(AWAITING_KEY) === '1') {
      localStorage.setItem(AWAITING_KEY, '1');
      sessionStorage.removeItem(AWAITING_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

let awaitingNew = readAwaitingFlag();

function setAwaitingNew(value) {
  awaitingNew = value;
  try {
    if (value) localStorage.setItem(AWAITING_KEY, '1');
    else localStorage.removeItem(AWAITING_KEY);
    sessionStorage.removeItem(AWAITING_KEY);
  } catch {
    /* ignore */
  }
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
    fullTank: root.querySelector('#fill-mode-full')?.checked !== false,
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
  const planned = calcFill(car.tankCapacity, form.consumption, form.rangeKm, form.price, calib.k);
  const cost = calcCost(form.litersActual, form.price);

  const litersEl = root.querySelector('#result-liters');
  const costEl = root.querySelector('#result-cost');
  const hintEl = root.querySelector('#calib-hint');
  const costHint = root.querySelector('#cost-hint');
  const planBlock = root.querySelector('#plan-block');
  const planLabel = root.querySelector('#plan-label');

  if (planBlock) {
    planBlock.hidden = !form.fullTank;
    planBlock.closest('.result-block')?.classList.toggle('result-cost-only', !form.fullTank);
  }
  if (litersEl) litersEl.textContent = formatNum(planned.litersToFull);
  if (costEl) costEl.textContent = cost != null ? formatNum(cost) : '—';
  if (costHint) {
    costHint.hidden = !(form.litersActual === '' || form.litersActual == null);
  }

  const rangeInput = root.querySelector('#range');
  if (rangeInput) {
    rangeInput.required = form.fullTank;
    rangeInput.closest('.field')?.classList.toggle('field-dimmed', !form.fullTank);
  }

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
  return { planned, cost };
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

function formatDateDisplay(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function prepareNewFillup() {
  setAwaitingNew(false);
  const data = getData();
  const car = getActiveCar(data);
  const last = getLastInputs(data, car.id) || {};
  const lastFill = data.fillups
    .filter((f) => f.carId === car.id)
    .sort((a, b) => b.odometer - a.odometer || String(b.date).localeCompare(String(a.date)))[0];
  setLastInputs(
    data,
    car.id,
    {
      ...last,
      odometer: pickRemembered(last?.odometer, lastFill?.odometer),
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

function renderDock() {
  const dock = document.getElementById('app-dock');
  if (!dock) return;
  dock.hidden = false;
  dock.classList.toggle('is-saved', awaitingNew);
  if (awaitingNew) {
    dock.innerHTML = `
      <p class="app-dock-msg">Заправка сохранена</p>
      <button type="button" class="btn-primary btn-new-fillup" id="btn-new-fillup">Новая заправка</button>
    `;
    dock.querySelector('#btn-new-fillup')?.addEventListener('click', () => {
      prepareNewFillup();
    });
  } else {
    dock.innerHTML = `
      <button type="submit" form="refuel-form" class="btn-primary btn-save-fillup" id="btn-save-fillup">Сохранить заправку</button>
    `;
  }
  syncLayout();
}

function render() {
  const data = getData();
  const car = getActiveCar(data);
  const last = getLastInputs(data, car.id);
  const lastFill = data.fillups
    .filter((f) => f.carId === car.id)
    .sort((a, b) => b.odometer - a.odometer || String(b.date).localeCompare(String(a.date)))[0];

  const fuels = listFuels(data);
  const networks = listNetworks(data);

  let networkId = last?.networkId ?? lastFill?.networkId ?? networks[0]?.id ?? '';
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
    odometer: pickRemembered(last?.odometer, lastFill?.odometer),
    networkId,
    stationId,
    rangeKm: awaitingNew ? '' : pickRemembered(last?.rangeKm),
    consumption: pickRemembered(last?.consumption, lastFill?.consumption, '9.5'),
    fuelId: last?.fuelId ?? lastFill?.fuelId ?? fuels[0]?.id ?? '',
    price: pickRemembered(last?.price, lastFill?.price),
    date: todayISO(),
    litersActual: awaitingNew ? '' : pickRemembered(last?.litersActual),
    fullTank: last?.fullTank !== false,
  };

  const selectedNetwork = getNetwork(data, defaults.networkId) || networks[0];
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
      <div class="field-row field-row-odo-date">
        <label class="field">
          <span>Одометр, км</span>
          <input id="odo" inputmode="numeric" type="number" step="1" min="0" value="${escapeAttr(
            defaults.odometer
          )}" required>
        </label>
        <label class="field">
          <span>Дата</span>
          <div class="date-wrap">
            <span class="date-display" id="date-display">${escapeHtml(
              formatDateDisplay(defaults.date)
            )}</span>
            <input id="date" class="date-native" type="date" value="${escapeAttr(
              defaults.date
            )}" required aria-label="Дата">
          </div>
        </label>
      </div>

      <label class="field">
        <span>АЗС</span>
        <div class="station-picker">
          <img id="network-logo" class="station-logo-lg" alt="" ${
            selectedNetwork?.logo ? `src="${selectedNetwork.logo}"` : 'hidden'
          }>
          <select id="network" class="network-select" aria-label="Сеть">
            ${networks
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

      <div class="fill-mode" role="group" aria-label="Тип заправки">
        <label class="fill-mode-option">
          <input type="radio" name="fill-mode" id="fill-mode-full" value="full" ${
            defaults.fullTank ? 'checked' : ''
          }>
          <span>До полного</span>
        </label>
        <label class="fill-mode-option">
          <input type="radio" name="fill-mode" id="fill-mode-partial" value="partial" ${
            defaults.fullTank ? '' : 'checked'
          }>
          <span>Неполный бак</span>
        </label>
      </div>
      <p id="fill-mode-hint" class="cost-hint">
        ${
          defaults.fullTank
            ? 'Расход л/100 считается между заправками до полного бака; частичные литры между ними учитываются.'
            : 'Частичная заправка учитывается в сумме литров до следующей полной.'
        }
      </p>

      <div class="field-row">
        <label class="field">
          <span>До пустого, км</span>
          <input id="range" inputmode="decimal" type="number" step="1" min="0" value="${escapeAttr(
            defaults.rangeKm
          )}" ${defaults.fullTank ? 'required' : ''}>
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
            ${fuels
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

      <div class="result-block" aria-live="polite">
        <div class="result-plan" id="plan-block">
          <span class="result-label" id="plan-label">План к заправке</span>
          <span class="result-value"><span id="result-liters">0</span> <small>л</small></span>
        </div>
        <div class="result-facts">
          <div class="result-cost">
            <span class="result-label">Стоимость (факт), ₽</span>
            <span class="result-value-sm"><span id="result-cost">—</span></span>
          </div>
          <label class="field field-actual">
            <span>Факт залито, л</span>
            <input id="liters-actual" inputmode="decimal" type="number" step="0.01" min="0.01" value="${escapeAttr(
              defaults.litersActual
            )}" placeholder="сколько залили" required>
          </label>
        </div>
      </div>
      <p id="cost-hint" class="cost-hint">Стоимость = факт залитых литров × цена за литр</p>

      <div class="form-spacer" aria-hidden="true"></div>
    </form>
  `;

  renderDock();
  root.querySelector('#car-select').addEventListener('change', (e) => {
    setAwaitingNew(false);
    const d = getData();
    setActiveCar(d, e.target.value);
    setData(d);
    render();
  });

  const form = root.querySelector('#refuel-form');
  const dateInput = root.querySelector('#date');
  const dateDisplay = root.querySelector('#date-display');
  const syncDateDisplay = () => {
    if (dateDisplay && dateInput) {
      dateDisplay.textContent = formatDateDisplay(dateInput.value) || 'ДД.ММ.ГГГГ';
    }
  };
  dateInput?.addEventListener('input', syncDateDisplay);
  dateInput?.addEventListener('change', syncDateDisplay);

  root.querySelector('#network')?.addEventListener('change', () => {
    refillStations();
    syncNetworkLogo();
    persistInputs();
  });

  root.querySelectorAll('input[name="fill-mode"]').forEach((el) => {
    el.addEventListener('change', () => {
      const hint = root.querySelector('#fill-mode-hint');
      const full = root.querySelector('#fill-mode-full')?.checked;
      if (hint) {
        hint.textContent = full
          ? 'Расход л/100 считается между заправками до полного бака; частичные литры между ними учитываются.'
          : 'Частичная заправка учитывается в сумме литров до следующей полной.';
      }
      recalc();
      persistInputs();
    });
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
    if (!formData.litersActual || Number(formData.litersActual) <= 0) {
      alert('Укажите фактически залитое количество топлива');
      root.querySelector('#liters-actual')?.focus();
      return;
    }

    const calib = computeCalibration(d.fillups, active.id);
    const planned = formData.fullTank
      ? calcFill(
          active.tankCapacity,
          formData.consumption,
          formData.rangeKm,
          formData.price,
          calib.k
        )
      : { litersToFull: 0 };
    const cost = calcCost(formData.litersActual, formData.price);

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
      litersToFull: planned.litersToFull,
      cost: cost ?? 0,
      litersActual: formData.litersActual,
      fullTank: formData.fullTank,
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
        odometer: formData.odometer,
        rangeKm: '',
        litersActual: '',
        date: todayISO(),
      },
      { clearTripFields: true }
    );
    setData(d);

    setAwaitingNew(true);
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
