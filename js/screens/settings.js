import {
  exportJson,
  importJson,
  getActiveCar,
} from '../storage.js';
import {
  addCar,
  updateCar,
  deleteCar,
  setActiveCar,
  listCars,
} from '../cars.js';
import {
  addFuel,
  updateFuel,
  deleteFuel,
  addStation,
  updateStation,
  deleteStation,
  listFuels,
  listStations,
} from '../dictionaries.js';

let root = null;
let getData = null;
let setData = null;
let onChange = null;
let tab = 'main';

export function initSettings(el, deps) {
  root = el;
  getData = deps.getData;
  setData = deps.setData;
  onChange = deps.onChange;
  render();
}

export function refreshSettings() {
  if (root) render();
}

function render() {
  const data = getData();
  root.innerHTML = `
    <header class="screen-header">
      <h2 class="section-title">Настройки</h2>
    </header>

    <div class="settings-tabs">
      <button type="button" class="stab ${tab === 'main' ? 'active' : ''}" data-stab="main">Основные</button>
      <button type="button" class="stab ${tab === 'dicts' ? 'active' : ''}" data-stab="dicts">Справочники</button>
    </div>

    <div class="settings-body">
      ${tab === 'main' ? renderMain(data) : renderDicts(data)}
    </div>
  `;

  root.querySelectorAll('[data-stab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.getAttribute('data-stab');
      render();
    });
  });

  bindMain();
  bindDicts();
}

function renderMain(data) {
  const car = getActiveCar(data);
  return `
    <section class="settings-block">
      <h3 class="block-title">Активный автомобиль</h3>
      <label class="field">
        <span>Выбор</span>
        <select id="s-active-car">
          ${listCars(data)
            .map(
              (c) =>
                `<option value="${c.id}" ${c.id === car.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
            )
            .join('')}
        </select>
      </label>
    </section>

    <section class="settings-block">
      <h3 class="block-title">Резервная копия</h3>
      <p class="hint">Данные хранятся только на этом телефоне. Экспортируйте JSON перед сменой устройства.</p>
      <div class="btn-row">
        <button type="button" class="btn-secondary" id="btn-export">Экспорт JSON</button>
        <label class="btn-secondary file-btn">Импорт JSON
          <input type="file" id="btn-import" accept="application/json,.json" hidden>
        </label>
      </div>
      <p id="backup-msg" class="save-msg" hidden></p>
    </section>

    <section class="settings-block">
      <h3 class="block-title">О приложении</h3>
      <p class="hint">Долей! — расчёт топлива до полного бака. PWA для iPhone. Версия схемы данных: ${data.schemaVersion}</p>
    </section>
  `;
}

function renderDicts(data) {
  return `
    <section class="settings-block">
      <h3 class="block-title">Автомобили</h3>
      <ul class="dict-list" id="cars-list">
        ${listCars(data)
          .map(
            (c) => `<li class="dict-item">
            <div class="dict-main">
              <span class="swatch" style="background:${c.color}"></span>
              <div>
                <strong>${escapeHtml(c.name)}</strong>
                <small>${c.plate ? escapeHtml(c.plate) + ' · ' : ''}${c.tankCapacity} л</small>
              </div>
            </div>
            <div class="dict-actions">
              <button type="button" class="btn-icon" data-edit-car="${c.id}">✎</button>
              <button type="button" class="btn-icon danger" data-del-car="${c.id}">×</button>
            </div>
          </li>`
          )
          .join('')}
      </ul>
      <button type="button" class="btn-secondary" id="add-car">+ Автомобиль</button>
    </section>

    <section class="settings-block">
      <h3 class="block-title">Виды топлива</h3>
      <ul class="dict-list">
        ${listFuels(data)
          .map(
            (f) => `<li class="dict-item">
            <div class="dict-main"><strong>${escapeHtml(f.name)}</strong></div>
            <div class="dict-actions">
              <button type="button" class="btn-icon" data-edit-fuel="${f.id}">✎</button>
              <button type="button" class="btn-icon danger" data-del-fuel="${f.id}">×</button>
            </div>
          </li>`
          )
          .join('')}
      </ul>
      <button type="button" class="btn-secondary" id="add-fuel">+ Топливо</button>
    </section>

    <section class="settings-block">
      <h3 class="block-title">АЗС</h3>
      <ul class="dict-list">
        ${listStations(data)
          .map(
            (s) => `<li class="dict-item">
            <div class="dict-main">
              ${s.logo ? `<img class="station-logo" src="${s.logo}" alt="">` : `<span class="logo-ph">⛽</span>`}
              <div>
                <strong>${escapeHtml(s.name)}</strong>
                <small>${escapeHtml(s.address || 'без адреса')}</small>
              </div>
            </div>
            <div class="dict-actions">
              <button type="button" class="btn-icon" data-edit-station="${s.id}">✎</button>
              <button type="button" class="btn-icon danger" data-del-station="${s.id}">×</button>
            </div>
          </li>`
          )
          .join('')}
      </ul>
      <button type="button" class="btn-secondary" id="add-station">+ АЗС</button>
    </section>

    <div id="settings-modal" class="modal" hidden></div>
  `;
}

function bindMain() {
  const active = root.querySelector('#s-active-car');
  if (active) {
    active.addEventListener('change', () => {
      const d = getData();
      setActiveCar(d, active.value);
      setData(d);
      notify();
    });
  }

  const exp = root.querySelector('#btn-export');
  if (exp) {
    exp.addEventListener('click', () => {
      const blob = new Blob([exportJson(getData())], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `doley-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      flash('backup-msg', 'Файл экспорта создан');
    });
  }

  const imp = root.querySelector('#btn-import');
  if (imp) {
    imp.addEventListener('change', async () => {
      const file = imp.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = importJson(text);
        setData(data);
        flash('backup-msg', 'Данные импортированы');
        notify();
        render();
      } catch {
        flash('backup-msg', 'Ошибка импорта: неверный JSON');
      }
      imp.value = '';
    });
  }
}

function bindDicts() {
  const modal = root.querySelector('#settings-modal');
  if (!modal) return;

  root.querySelector('#add-car')?.addEventListener('click', () => openCarForm());
  root.querySelector('#add-fuel')?.addEventListener('click', () => {
    const name = prompt('Название топлива', 'АИ-95 Plus');
    if (!name) return;
    const d = getData();
    addFuel(d, name);
    setData(d);
    notify();
    render();
  });
  root.querySelector('#add-station')?.addEventListener('click', () => openStationForm());

  root.querySelectorAll('[data-edit-car]').forEach((btn) => {
    btn.addEventListener('click', () => openCarForm(btn.getAttribute('data-edit-car')));
  });
  root.querySelectorAll('[data-del-car]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = getData();
      const res = deleteCar(d, btn.getAttribute('data-del-car'));
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      setData(d);
      notify();
      render();
    });
  });

  root.querySelectorAll('[data-edit-fuel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = getData();
      const fuel = d.fuels.find((f) => f.id === btn.getAttribute('data-edit-fuel'));
      const name = prompt('Название топлива', fuel?.name || '');
      if (!name) return;
      updateFuel(d, fuel.id, name);
      setData(d);
      notify();
      render();
    });
  });
  root.querySelectorAll('[data-del-fuel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = getData();
      const res = deleteFuel(d, btn.getAttribute('data-del-fuel'));
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      setData(d);
      notify();
      render();
    });
  });

  root.querySelectorAll('[data-edit-station]').forEach((btn) => {
    btn.addEventListener('click', () => openStationForm(btn.getAttribute('data-edit-station')));
  });
  root.querySelectorAll('[data-del-station]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = getData();
      const res = deleteStation(d, btn.getAttribute('data-del-station'));
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      setData(d);
      notify();
      render();
    });
  });
}

function openCarForm(id) {
  const data = getData();
  const car = id ? data.cars.find((c) => c.id === id) : null;
  const modal = root.querySelector('#settings-modal');
  modal.hidden = false;
  modal.innerHTML = `
    <div class="modal-card">
      <h3>${car ? 'Автомобиль' : 'Новый автомобиль'}</h3>
      <label class="field"><span>Марка / модель</span><input id="c-name" value="${escapeAttr(car?.name || '')}"></label>
      <label class="field"><span>Госномер</span><input id="c-plate" value="${escapeAttr(car?.plate || '')}"></label>
      <label class="field"><span>Цвет</span><input id="c-color" type="color" value="${car?.color || '#1a3a5c'}"></label>
      <label class="field"><span>Ёмкость бака, л</span><input id="c-tank" type="number" step="0.1" value="${car?.tankCapacity || 71}"></label>
      <label class="field"><span>Картинка</span><input id="c-image" type="file" accept="image/*"></label>
      ${car?.image ? `<img class="preview-img" src="${car.image}" alt="">` : ''}
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="c-cancel">Отмена</button>
        <button type="button" class="btn-primary" id="c-save">Сохранить</button>
      </div>
    </div>
  `;

  let imageData = car?.image || '';
  modal.querySelector('#c-image').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    imageData = await readAsDataURL(file, 400);
    const prev = modal.querySelector('.preview-img');
    if (prev) prev.src = imageData;
    else {
      const img = document.createElement('img');
      img.className = 'preview-img';
      img.src = imageData;
      modal.querySelector('#c-image').closest('label').after(img);
    }
  });

  modal.querySelector('#c-cancel').onclick = () => {
    modal.hidden = true;
  };
  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };
  modal.querySelector('#c-save').onclick = () => {
    const d = getData();
    const fields = {
      name: modal.querySelector('#c-name').value,
      plate: modal.querySelector('#c-plate').value,
      color: modal.querySelector('#c-color').value,
      tankCapacity: modal.querySelector('#c-tank').value,
      image: imageData,
    };
    if (car) updateCar(d, car.id, fields);
    else addCar(d, fields);
    setData(d);
    modal.hidden = true;
    notify();
    render();
  };
}

function openStationForm(id) {
  const data = getData();
  const station = id ? data.stations.find((s) => s.id === id) : null;
  const modal = root.querySelector('#settings-modal');
  modal.hidden = false;
  modal.innerHTML = `
    <div class="modal-card">
      <h3>${station ? 'АЗС' : 'Новая АЗС'}</h3>
      <label class="field"><span>Название</span><input id="st-name" value="${escapeAttr(station?.name || '')}"></label>
      <label class="field"><span>Адрес</span><input id="st-addr" value="${escapeAttr(station?.address || '')}"></label>
      <label class="field"><span>Логотип</span><input id="st-logo" type="file" accept="image/*"></label>
      ${station?.logo ? `<img class="preview-img" src="${station.logo}" alt="">` : ''}
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="st-cancel">Отмена</button>
        <button type="button" class="btn-primary" id="st-save">Сохранить</button>
      </div>
    </div>
  `;

  let logoData = station?.logo || '';
  modal.querySelector('#st-logo').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    logoData = await readAsDataURL(file, 160);
    const prev = modal.querySelector('.preview-img');
    if (prev) prev.src = logoData;
    else {
      const img = document.createElement('img');
      img.className = 'preview-img';
      img.src = logoData;
      modal.querySelector('#st-logo').closest('label').after(img);
    }
  });

  modal.querySelector('#st-cancel').onclick = () => {
    modal.hidden = true;
  };
  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };
  modal.querySelector('#st-save').onclick = () => {
    const d = getData();
    const fields = {
      name: modal.querySelector('#st-name').value,
      address: modal.querySelector('#st-addr').value,
      logo: logoData,
    };
    if (station) updateStation(d, station.id, fields);
    else addStation(d, fields);
    setData(d);
    modal.hidden = true;
    notify();
    render();
  };
}

function readAsDataURL(file, maxSide) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function flash(id, text) {
  const el = root.querySelector(`#${id}`);
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, 2500);
}

function notify() {
  if (onChange) onChange();
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
