/**
 * Синхронизация высоты приложения с visualViewport.
 * На iOS PWA после обновления/перезагрузки 100dvh иногда «прыгает»,
 * и fixed-нижняя панель оказывается выше контента до смены ориентации.
 */

export function syncAppHeight() {
  const vv = window.visualViewport;
  const h = Math.round(vv?.height || window.innerHeight || 0);
  if (h > 0) {
    document.documentElement.style.setProperty('--app-height', `${h}px`);
  }
}

export function initLayout() {
  const run = () => syncAppHeight();
  run();

  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', () => {
    // iOS обновляет viewport с задержкой
    setTimeout(run, 50);
    setTimeout(run, 250);
    setTimeout(run, 600);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', run);
    window.visualViewport.addEventListener('scroll', run);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(run, 50);
      setTimeout(run, 300);
    }
  });

  window.addEventListener('pageshow', () => {
    setTimeout(run, 0);
    setTimeout(run, 200);
  });
}
