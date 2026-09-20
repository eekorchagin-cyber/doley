/**
 * На iOS standalone PWA window.innerHeight / -webkit-fill-available
 * часто меньше реального экрана → tab bar «висит» над пустым зазором.
 * Берём max из доступных измерений; VV scroll не слушаем (мерцание).
 */

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function frameHeight() {
  const vv = window.visualViewport;
  const vvH = vv ? Math.round(vv.height + vv.offsetTop) : 0;
  let h = Math.max(
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    vvH
  );
  if (isStandalone()) {
    h = Math.max(h, window.screen.height || 0, window.screen.availHeight || 0);
  }
  return h;
}

function applyFrameHeight() {
  const h = frameHeight();
  if (h > 0) {
    document.documentElement.style.setProperty('--frame-h', `${h}px`);
  }
}

function syncChromeHeights() {
  const dock = document.getElementById('app-dock');
  const tabs = document.querySelector('.tab-bar');
  const tabsH = tabs ? tabs.offsetHeight : 0;
  const dockH = dock && !dock.hidden ? dock.offsetHeight : 0;
  document.documentElement.style.setProperty('--tabs-h', `${tabsH}px`);
  document.documentElement.style.setProperty('--dock-h', `${dockH}px`);
}

export function syncLayout() {
  applyFrameHeight();
  syncChromeHeights();
}

export function initLayout() {
  const run = () => syncLayout();
  run();
  requestAnimationFrame(run);
  [50, 150, 400, 1000].forEach((ms) => setTimeout(run, ms));

  window.addEventListener('orientationchange', () => {
    setTimeout(run, 50);
    setTimeout(run, 350);
  });
  window.addEventListener('pageshow', () => {
    setTimeout(run, 0);
    setTimeout(run, 300);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(run, 50);
      setTimeout(run, 300);
    }
  });

  const dock = document.getElementById('app-dock');
  if (dock && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(run).observe(dock);
  }

  document.addEventListener(
    'touchmove',
    (event) => {
      let node = event.target;
      while (node && node !== document.body) {
        if (node instanceof HTMLElement) {
          const style = window.getComputedStyle(node);
          const oy = style.overflowY;
          if (
            (oy === 'auto' || oy === 'scroll') &&
            node.scrollHeight > node.clientHeight + 1
          ) {
            return;
          }
        }
        node = node.parentNode;
      }
      event.preventDefault();
    },
    { passive: false }
  );
}
