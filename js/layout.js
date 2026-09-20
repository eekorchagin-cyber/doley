/**
 * Блокировка rubber-band на iOS: скролл только внутри .screen.
 */

export function initLayout() {
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
