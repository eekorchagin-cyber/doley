import { loadData, saveData } from './storage.js';
import { initRefuel, refreshRefuel } from './screens/refuel.js';
import { initHistory, refreshHistory } from './screens/history.js';
import { initSettings, refreshSettings } from './screens/settings.js';
import { initUpdates } from './updates.js';
import { initTheme, applyTheme } from './theme.js';
import { initLayout } from './layout.js';

initLayout();

let data = loadData();

const screens = {
  refuel: document.getElementById('screen-refuel'),
  history: document.getElementById('screen-history'),
  settings: document.getElementById('screen-settings'),
};

const deps = {
  getData: () => data,
  setData: (next) => {
    data = next;
    saveData(data);
  },
  onSaved: () => {
    refreshHistory();
  },
  onChange: () => {
    refreshRefuel();
    refreshHistory();
  },
  setTheme: (theme) => {
    data.theme = theme;
    saveData(data);
    applyTheme(theme);
  },
};

initTheme(
  () => data.theme,
  () => {
    refreshSettings();
    refreshHistory();
  }
);

initRefuel(screens.refuel, deps);
initHistory(screens.history, deps);
initSettings(screens.settings, deps);

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    const active = key === name;
    el.hidden = !active;
    el.classList.toggle('is-active', active);
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
  if (name === 'history') refreshHistory();
  if (name === 'refuel') refreshRefuel();
  if (name === 'settings') refreshSettings();
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

showScreen('refuel');
initUpdates();
