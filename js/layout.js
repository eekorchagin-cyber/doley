/**
 * Фиксация оболочки приложения по краям окна.
 * Не трогаем visualViewport: на iOS его resize/scroll
 * дёргают высоту и вызывают мерцание нижней панели.
 */

export function initLayout() {
  // Высота задаётся CSS (position:fixed; inset:0), JS не нужен.
}
