/**
 * Проверка обновлений PWA и баннер без переустановки ярлыка.
 * version.json + updateViaCache:'none' — чтобы баннер не терялся на iPhone / GitHub Pages.
 */

export const APP_VERSION = 12;

const VERSION_KEY = 'doley:app-version';
const DISMISS_KEY = 'doley:update-dismissed';

let registration = null;
let refreshing = false;
let remoteVersion = null;

function banner() {
  return document.getElementById('update-banner');
}

export function showUpdateBanner() {
  const el = banner();
  if (!el) return;
  // Не показываем снова, если эту же удалённую версию отложили
  if (
    remoteVersion != null &&
    Number(sessionStorage.getItem(DISMISS_KEY)) === Number(remoteVersion)
  ) {
    return;
  }
  el.hidden = false;
}

export function hideUpdateBanner() {
  const el = banner();
  if (el) el.hidden = true;
  if (remoteVersion != null) {
    sessionStorage.setItem(DISMISS_KEY, String(remoteVersion));
  }
}

async function applyUpdate() {
  hideUpdateBanner();
  try {
    if (registration) await registration.update();
  } catch {
    // ignore
  }

  const waiting = registration?.waiting;
  if (waiting) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // controllerchange сделает reload
    setTimeout(() => {
      if (!refreshing) window.location.reload();
    }, 1500);
    return;
  }

  // Нет waiting SW — сбрасываем кэши и перезагружаем
  try {
    if (registration?.active) {
      // на случай «зависшего» обновления
      registration.active.postMessage({ type: 'SKIP_WAITING' });
    }
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // ignore
  }
  if (remoteVersion != null) {
    localStorage.setItem(VERSION_KEY, String(remoteVersion));
  }
  window.location.reload();
}

function onControllerChange() {
  if (refreshing) return;
  refreshing = true;
  if (remoteVersion != null) {
    localStorage.setItem(VERSION_KEY, String(remoteVersion));
  } else {
    localStorage.setItem(VERSION_KEY, String(APP_VERSION));
  }
  window.location.reload();
}

function watchWorker(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      showUpdateBanner();
    }
  });
  // если уже успел установиться до подписки
  if (worker.state === 'installed' && navigator.serviceWorker.controller) {
    showUpdateBanner();
  }
}

async function fetchRemoteVersion() {
  const url = `./version.json?t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  const v = Number(data?.version);
  return Number.isFinite(v) ? v : null;
}

function localVersion() {
  const stored = Number(localStorage.getItem(VERSION_KEY));
  if (Number.isFinite(stored) && stored > 0) return stored;
  return APP_VERSION;
}

async function checkVersionFile() {
  try {
    const remote = await fetchRemoteVersion();
    if (remote == null) return;
    remoteVersion = remote;
    if (remote > localVersion()) {
      showUpdateBanner();
    }
  } catch {
    // офлайн
  }
}

async function checkForUpdates() {
  await checkVersionFile();
  if (!registration) return;
  try {
    await registration.update();
    if (registration.waiting) showUpdateBanner();
    if (registration.installing) watchWorker(registration.installing);
  } catch {
    // офлайн — тихо игнорируем
  }
}

export async function initUpdates() {
  const el = banner();
  if (el) {
    el.querySelector('#update-apply')?.addEventListener('click', () => {
      applyUpdate();
    });
    el.querySelector('#update-later')?.addEventListener('click', hideUpdateBanner);
  }

  // Зафиксировать текущую сборку при первом запуске этой версии кода
  if (!localStorage.getItem(VERSION_KEY)) {
    localStorage.setItem(VERSION_KEY, String(APP_VERSION));
  }

  if (!('serviceWorker' in navigator)) {
    // Без SW всё равно сверяем version.json (на всякий случай)
    checkVersionFile();
    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  try {
    registration = await navigator.serviceWorker.register('./sw.js', {
      updateViaCache: 'none',
    });
  } catch {
    checkVersionFile();
    return;
  }

  if (registration.waiting) showUpdateBanner();
  if (registration.installing) watchWorker(registration.installing);

  registration.addEventListener('updatefound', () => {
    watchWorker(registration.installing);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });
  window.addEventListener('focus', checkForUpdates);
  setInterval(checkForUpdates, 15 * 60 * 1000);

  // Сразу и ещё раз через пару секунд (iOS иногда пропускает первый update)
  checkForUpdates();
  setTimeout(checkForUpdates, 2500);
}
