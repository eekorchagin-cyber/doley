/**
 * Высота оболочки = window.innerHeight (не visualViewport).
 * Обновляем только при старте / повороте / возврате в приложение —
 * без scroll/resize VV, чтобы не было мерцания.
 */

function applyShellHeight() {
  const h = Math.round(window.innerHeight || 0);
  if (h > 0) {
    document.documentElement.style.setProperty('--app-shell-h', `${h}px`);
  }
}

export function initLayout() {
  const run = () => applyShellHeight();
  run();
  requestAnimationFrame(run);
  setTimeout(run, 100);
  setTimeout(run, 400);

  window.addEventListener('orientationchange', () => {
    setTimeout(run, 50);
    setTimeout(run, 300);
  });

  window.addEventListener('pageshow', () => {
    setTimeout(run, 0);
    setTimeout(run, 250);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(run, 50);
      setTimeout(run, 300);
    }
  });
}
