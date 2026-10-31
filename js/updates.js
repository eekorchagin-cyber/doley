/**
 * Проверка обновлений PWA и баннер без переустановки ярлыка.
 *
 * Важно: часть логики дублируется inline в index.html — чтобы баннер
 * появлялся даже когда старый SW отдаёт устаревший updates.js из кэша.
 */

export const APP_VERSION = 46;
export const APP_CACHE = 'doley-static-v46';

/** Версия реально запущенного кода — по ней inline-проверка в index.html решает, нужен ли баннер. */
window.__doleyCodeVersion = APP_VERSION;

const VERSION_KEY = 'doley:app-version';
const DISMISS_KEY = 'doley:update-dismissed';

let registration = null;
let refreshing = false;
let remoteVersion = null;
let remoteCache = APP_CACHE;
let updateIsStale = false;

function banner() {
  return document.getElementById('update-banner');
}

export function showUpdateBanner(forceStale = false) {
  const el = banner();
  if (!el) return;
  if (forceStale) updateIsStale = true;
  if (
    !updateIsStale &&
    remoteVersion != null &&
    Number(sessionStorage.getItem(DISMISS_KEY)) === Number(remoteVersion)
  ) {
    return;
  }
  if (updateIsStale) sessionStorage.removeItem(DISMISS_KEY);

  const text = el.querySelector('#update-banner-text');
  const later = el.querySelector('#update-later');
  if (text) {
    text.textContent = updateIsStale
      ? 'Установите обновление «Долей!» — сейчас на телефоне старая версия'
      : 'Доступно обновление «Долей!»';
  }
  if (later) later.hidden = !!updateIsStale;

  el.hidden = false;
  window.__doleyUpdateNeeded = true;
}

export function hideUpdateBanner() {
  if (updateIsStale) return;
  const el = banner();
  if (el) el.hidden = true;
  if (remoteVersion != null) {
    sessionStorage.setItem(DISMISS_KEY, String(remoteVersion));
  }
}

async function clearAppCaches() {
  if (!window.caches) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
}

async function unregisterWorkers() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.map(async (reg) => {
      try {
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        if (reg.active) reg.active.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        // ignore
      }
      await reg.unregister();
    })
  );
}

async function applyUpdate() {
  const next = remoteVersion != null ? remoteVersion : APP_VERSION;
  if (typeof window.__doleyHardReset === 'function') {
    await window.__doleyHardReset(next);
    return;
  }
  try {
    await unregisterWorkers();
    await clearAppCaches();
  } catch {
    // ignore
  }
  localStorage.setItem(VERSION_KEY, String(next));
  sessionStorage.removeItem(DISMISS_KEY);
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(next));
  url.searchParams.set('_', String(Date.now()));
  window.location.replace(url.toString());
}

function onControllerChange() {
  if (refreshing) return;
  refreshing = true;
  localStorage.setItem(
    VERSION_KEY,
    String(remoteVersion != null ? remoteVersion : APP_VERSION)
  );
  window.location.reload();
}

function watchWorker(worker) {
  if (!worker) return;
  // Новый сервис-воркер сам по себе ещё не значит, что код устарел: решает сравнение версий.
  const maybeShow = () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      checkVersionFile();
    }
  };
  worker.addEventListener('statechange', maybeShow);
  maybeShow();
}

async function fetchRemoteMeta() {
  const url = `./version.json?t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  const v = Number(data?.version);
  if (!Number.isFinite(v)) return null;
  return {
    version: v,
    cache: typeof data.cache === 'string' ? data.cache : APP_CACHE,
  };
}

/**
 * Ручная проверка из настроек: сравнивает версию на сайте с версией запущенного кода.
 * @returns {Promise<{ remote: number|null, local: number }>} remote = null — нет связи.
 */
export async function checkUpdateNow() {
  try {
    const meta = await fetchRemoteMeta();
    if (meta) {
      remoteVersion = meta.version;
      remoteCache = meta.cache;
    }
    return { remote: meta ? meta.version : null, local: APP_VERSION };
  } catch {
    return { remote: null, local: APP_VERSION };
  }
}

export { applyUpdate };

async function checkVersionFile() {
  try {
    const meta = await fetchRemoteMeta();
    if (!meta) return;
    remoteVersion = meta.version;
    remoteCache = meta.cache;
    // Остатки старых кэшей не в счёт: их может заново создать прежний сервис-воркер,
    // и тогда баннер «Обновить» появлялся бы снова после каждого обновления.
    if (meta.version > APP_VERSION) {
      updateIsStale = true;
      showUpdateBanner(true);
      return;
    }
    updateIsStale = false;
    const el = banner();
    if (el) el.hidden = true;
    window.__doleyUpdateNeeded = false;
    localStorage.setItem(VERSION_KEY, String(APP_VERSION));
  } catch {
    // офлайн
  }
}

async function checkForUpdates() {
  await checkVersionFile();
  if (!registration) return;
  try {
    await registration.update();
    if (registration.installing) watchWorker(registration.installing);
  } catch {
    // офлайн
  }
}

export async function initUpdates() {
  if (!window.__doleyUpdateBound) {
    window.__doleyUpdateBound = true;
    const el = banner();
    if (el) {
      el.querySelector('#update-apply')?.addEventListener('click', () => {
        applyUpdate();
      });
      el.querySelector('#update-later')?.addEventListener('click', hideUpdateBanner);
    }
  }

  window.__doleyApplyUpdate = applyUpdate;

  if (!('serviceWorker' in navigator)) {
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

  if (registration.installing) watchWorker(registration.installing);

  registration.addEventListener('updatefound', () => {
    watchWorker(registration.installing);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });
  window.addEventListener('focus', checkForUpdates);
  window.addEventListener('pageshow', checkForUpdates);
  setInterval(checkForUpdates, 10 * 60 * 1000);

  checkForUpdates();
  setTimeout(checkForUpdates, 1500);
  setTimeout(checkForUpdates, 5000);
}
