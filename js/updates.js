/**
 * Проверка обновлений PWA и баннер без переустановки ярлыка.
 */

let registration = null;
let refreshing = false;

function banner() {
  return document.getElementById('update-banner');
}

export function showUpdateBanner() {
  const el = banner();
  if (el) el.hidden = false;
}

export function hideUpdateBanner() {
  const el = banner();
  if (el) el.hidden = true;
}

function applyUpdate() {
  const waiting = registration?.waiting;
  if (waiting) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  // если waiting нет — просто перезагрузка
  window.location.reload();
}

function onControllerChange() {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
}

function watchWorker(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      // Новая версия готова, старая ещё активна
      showUpdateBanner();
    }
  });
}

async function checkForUpdates() {
  if (!registration) return;
  try {
    await registration.update();
    if (registration.waiting) showUpdateBanner();
  } catch {
    // офлайн — тихо игнорируем
  }
}

export async function initUpdates() {
  const el = banner();
  if (el) {
    el.querySelector('#update-apply')?.addEventListener('click', applyUpdate);
    el.querySelector('#update-later')?.addEventListener('click', hideUpdateBanner);
  }

  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  try {
    registration = await navigator.serviceWorker.register('./sw.js');
  } catch {
    return;
  }

  if (registration.waiting) showUpdateBanner();

  registration.addEventListener('updatefound', () => {
    watchWorker(registration.installing);
  });

  // Проверки при возврате в приложение и по таймеру
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });
  window.addEventListener('focus', checkForUpdates);
  setInterval(checkForUpdates, 60 * 60 * 1000);

  // первая проверка чуть позже старта
  setTimeout(checkForUpdates, 5000);
}
