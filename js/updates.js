/**
 * Проверка обновлений PWA и баннер без переустановки ярлыка.
 *
 * Важно: часть логики дублируется inline в index.html — чтобы баннер
 * появлялся даже когда старый SW отдаёт устаревший updates.js из кэша.
 */

export const APP_VERSION = 14;
export const APP_CACHE = 'doley-static-v14';

const VERSION_KEY = 'doley:app-version';
const DISMISS_KEY = 'doley:update-dismissed';

let registration = null;
let refreshing = false;
let remoteVersion = null;
let remoteCache = APP_CACHE;

function banner() {
  return document.getElementById('update-banner');
}

export function showUpdateBanner() {
  const el = banner();
  if (!el) return;
  if (
    remoteVersion != null &&
    Number(sessionStorage.getItem(DISMISS_KEY)) === Number(remoteVersion)
  ) {
    return;
  }
  // Inline-скрипт в index.html мог уже показать баннер и навесить обработчики
  el.hidden = false;
  window.__doleyUpdateNeeded = true;
}

export function hideUpdateBanner() {
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
  hideUpdateBanner();
  const next = remoteVersion != null ? remoteVersion : APP_VERSION;
  try {
    await unregisterWorkers();
    await clearAppCaches();
  } catch {
    // ignore
  }
  localStorage.setItem(VERSION_KEY, String(next));
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
  const maybeShow = () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      showUpdateBanner();
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

function storedVersion() {
  const stored = Number(localStorage.getItem(VERSION_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

async function hasStaleCaches(currentCache) {
  if (!window.caches) return false;
  const keys = await caches.keys();
  const ours = keys.filter((k) => k.startsWith('doley-static-'));
  if (!ours.length) return false;
  return ours.some((k) => k !== currentCache);
}

async function checkVersionFile() {
  try {
    const meta = await fetchRemoteMeta();
    if (!meta) return;
    remoteVersion = meta.version;
    remoteCache = meta.cache;
    const local = storedVersion();
    const stale = await hasStaleCaches(meta.cache);
    if (meta.version > local || stale) {
      showUpdateBanner();
      return;
    }
    if (!localStorage.getItem(VERSION_KEY)) {
      localStorage.setItem(VERSION_KEY, String(meta.version));
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
    // офлайн
  }
}

export async function initUpdates() {
  // Если inline-скрипт уже повесил обработчики — не дублируем
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

  // Экспорт для inline fallback
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

  if (registration.waiting) showUpdateBanner();
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
