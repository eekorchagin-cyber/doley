import { getActiveCar } from '../storage.js';
import { fillupsForCar, deleteFillup, updateFillup, listFuels, listStations } from '../dictionaries.js';
import { costPerKm, round2 } from '../calc.js';
import { stationLabel, getStation } from '../storage.js';

let root = null;
let getData = null;
let setData = null;
let chart = null;

const FUEL_COLORS = [
  '#3dd6c6',
  '#f0a202',
  '#e4572e',
  '#7b68ee',
  '#4cc9f0',
  '#90be6d',
  '#f72585',
  '#adb5bd',
];

export function initHistory(el, deps) {
  root = el;
  getData = deps.getData;
  setData = deps.setData;
  render();
}

export function refreshHistory() {
  if (root && !root.hidden) render();
}

function render() {
  const data = getData();
  const car = getActiveCar(data);
  const rows = buildRows(data, car.id);

  root.innerHTML = `
    <header class="screen-header">
      <h2 class="section-title">История</h2>
      <p class="section-sub">${escapeHtml(car.name)}</p>
    </header>

    <section class="chart-section">
      <h3 class="block-title">Расход по месяцам</h3>
      <div class="chart-wrap">
        <canvas id="fuel-chart" height="180"></canvas>
      </div>
      <div id="chart-legend" class="chart-legend"></div>
    </section>

    <section class="table-section">
      <h3 class="block-title">Заправки</h3>
      ${
        rows.length
          ? `<div class="table-scroll"><table class="history-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Одометр</th>
            <th>Пробег</th>
            <th>Топливо</th>
            <th>л/100</th>
            <th>₽/км</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr data-id="${r.id}">
            <td>${escapeHtml(formatDate(r.date))}</td>
            <td>${r.odometer}</td>
            <td>${r.distance != null ? r.distance : '—'}</td>
            <td><span class="fuel-dot" style="background:${r.color}"></span>${escapeHtml(r.fuelName)}</td>
            <td>${r.consumption}</td>
            <td>${r.perKm != null ? r.perKm : '—'}</td>
            <td class="row-actions">
              <button type="button" class="btn-icon" data-edit="${r.id}" title="Изменить">✎</button>
              <button type="button" class="btn-icon danger" data-del="${r.id}" title="Удалить">×</button>
            </td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table></div>`
          : `<p class="empty-state">Пока нет сохранённых заправок</p>`
      }
    </section>

    <div id="edit-modal" class="modal" hidden></div>
  `;

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('Удалить заправку?')) return;
      const d = getData();
      deleteFillup(d, btn.getAttribute('data-del'));
      setData(d);
      render();
    });
  });

  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openEdit(btn.getAttribute('data-edit')));
  });

  drawChart(data, car.id, rows);
}

function buildRows(data, carId) {
  const fuelMap = Object.fromEntries(data.fuels.map((f, i) => [f.id, { ...f, color: FUEL_COLORS[i % FUEL_COLORS.length] }]));
  const sorted = fillupsForCar(data, carId)
    .slice()
    .sort((a, b) => a.odometer - b.odometer || String(a.date).localeCompare(String(b.date)));

  const withDist = sorted.map((f, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const distance = prev ? f.odometer - prev.odometer : null;
    const liters = f.litersActual != null ? f.litersActual : f.litersToFull;
    const cost = f.cost;
    const fuel = fuelMap[f.fuelId] || { name: '?', color: '#888' };
    return {
      ...f,
      distance: distance != null && distance > 0 ? distance : null,
      perKm: distance != null && distance > 0 ? costPerKm(cost, distance) : null,
      fuelName: fuel.name,
      color: fuel.color,
      liters,
    };
  });

  return withDist.slice().reverse();
}

function drawChart(data, carId, rows) {
  const canvas = root.querySelector('#fuel-chart');
  const legend = root.querySelector('#chart-legend');
  if (!canvas || typeof Chart === 'undefined') return;

  if (chart) {
    chart.destroy();
    chart = null;
  }

  const chronological = rows.slice().reverse();
  if (!chronological.length) {
    legend.innerHTML = '<p class="empty-state">Недостаточно данных для графика</p>';
    return;
  }

  const months = {};
  chronological.forEach((r) => {
    const key = String(r.date).slice(0, 7);
    if (!months[key]) months[key] = { liters: 0, fuels: new Set(), cost: 0 };
    months[key].liters += Number(r.liters) || 0;
    months[key].cost += Number(r.cost) || 0;
    months[key].fuels.add(r.fuelId);
  });

  const labels = Object.keys(months).sort();
  const fuelIds = [...new Set(chronological.map((r) => r.fuelId))];
  const fuelMeta = Object.fromEntries(
    data.fuels.map((f, i) => [f.id, { name: f.name, color: FUEL_COLORS[i % FUEL_COLORS.length] }])
  );

  // Stacked by fuel per month for mixed-fuel months highlight
  const mixedFlags = labels.map((m) => months[m].fuels.size > 1);

  const datasets = fuelIds.map((fid) => {
    const meta = fuelMeta[fid] || { name: '?', color: '#888' };
    return {
      label: meta.name,
      data: labels.map((m) => {
        const sum = chronological
          .filter((r) => String(r.date).slice(0, 7) === m && r.fuelId === fid)
          .reduce((acc, r) => acc + (Number(r.liters) || 0), 0);
        return round2(sum);
      }),
      backgroundColor: meta.color,
      borderColor: mixedFlags.map((mixed) => (mixed ? '#f0a202' : 'transparent')),
      borderWidth: mixedFlags.map((mixed) => (mixed ? 2 : 0)),
      stack: 'liters',
    };
  });

  chart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: labels.map(formatMonth), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const idx = items[0]?.dataIndex;
              if (idx != null && mixedFlags[idx]) return '⚠ разные марки топлива';
              return '';
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: (ctx) => (mixedFlags[ctx.index] ? '#c47d00' : '#6b7a90'),
            font: { size: 11 },
          },
          grid: { display: false },
        },
        y: {
          stacked: true,
          ticks: { color: '#6b7a90' },
          grid: { color: 'rgba(15, 35, 60, 0.08)' },
          title: { display: true, text: 'литры', color: '#6b7a90' },
        },
      },
    },
  });

  // Highlight mixed months on legend
  legend.innerHTML = `
    <div class="legend-fuels">
      ${fuelIds
        .map((fid) => {
          const meta = fuelMeta[fid] || { name: '?', color: '#888' };
          return `<span class="legend-item"><i style="background:${meta.color}"></i>${escapeHtml(meta.name)}</span>`;
        })
        .join('')}
    </div>
    ${
      mixedFlags.some(Boolean)
        ? `<p class="mixed-note">Месяцы с разными марками топлива выделены в подсказке графика (⚠).</p>`
        : ''
    }
  `;

  // Tint x-axis labels for mixed months via plugin-like afterDraw — add CSS markers
  const mixedList = labels.filter((_, i) => mixedFlags[i]).map(formatMonth);
  if (mixedList.length) {
    legend.innerHTML += `<p class="mixed-months">Смешанные периоды: <strong>${mixedList
      .map(escapeHtml)
      .join(', ')}</strong></p>`;
  }
}

function openEdit(id) {
  const data = getData();
  const fillup = data.fillups.find((f) => f.id === id);
  if (!fillup) return;
  const modal = root.querySelector('#edit-modal');
  modal.hidden = false;
  modal.innerHTML = `
    <div class="modal-card">
      <h3>Изменить заправку</h3>
      <label class="field"><span>Дата</span><input id="e-date" type="date" value="${escapeAttr(fillup.date)}"></label>
      <label class="field"><span>Одометр</span><input id="e-odo" type="number" value="${fillup.odometer}"></label>
      <label class="field"><span>До пустого</span><input id="e-range" type="number" value="${fillup.rangeKm}"></label>
      <label class="field"><span>Расход</span><input id="e-cons" type="number" step="0.1" value="${fillup.consumption}"></label>
      <label class="field"><span>Топливо</span>
        <select id="e-fuel">${listFuels(data)
          .map((f) => `<option value="${f.id}" ${f.id === fillup.fuelId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`)
          .join('')}</select>
      </label>
      <label class="field"><span>Цена</span><input id="e-price" type="number" step="0.01" value="${fillup.price}"></label>
      <label class="field"><span>Заправка</span>
        <select id="e-station">${listStations(data)
          .map((s) => {
            const label = stationLabel(data, s);
            return `<option value="${s.id}" ${s.id === fillup.stationId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
          })
          .join('')}</select>
      </label>
      <label class="field"><span>К заправке, л</span><input id="e-liters" type="number" step="0.01" value="${fillup.litersToFull}"></label>
      <label class="field"><span>Стоимость</span><input id="e-cost" type="number" step="0.01" value="${fillup.cost}"></label>
      <label class="field"><span>Факт залито</span><input id="e-actual" type="number" step="0.01" value="${fillup.litersActual ?? ''}"></label>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="e-cancel">Отмена</button>
        <button type="button" class="btn-primary" id="e-save">Сохранить</button>
      </div>
    </div>
  `;
  modal.querySelector('#e-cancel').onclick = () => {
    modal.hidden = true;
  };
  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };
  modal.querySelector('#e-save').onclick = () => {
    const d = getData();
    updateFillup(d, id, {
      date: modal.querySelector('#e-date').value,
      odometer: modal.querySelector('#e-odo').value,
      rangeKm: modal.querySelector('#e-range').value,
      consumption: modal.querySelector('#e-cons').value,
      fuelId: modal.querySelector('#e-fuel').value,
      price: modal.querySelector('#e-price').value,
      stationId: modal.querySelector('#e-station').value,
      networkId: getStation(d, modal.querySelector('#e-station').value)?.networkId ?? fillup.networkId,
      litersToFull: modal.querySelector('#e-liters').value,
      cost: modal.querySelector('#e-cost').value,
      litersActual: modal.querySelector('#e-actual').value,
    });
    setData(d);
    modal.hidden = true;
    render();
  };
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

function formatMonth(ym) {
  const [y, m] = ym.split('-');
  const names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${names[Number(m) - 1]} ${y.slice(2)}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s ?? '');
}
