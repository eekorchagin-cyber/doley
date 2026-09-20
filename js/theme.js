/** Тема: light | dark | system */

export const THEME_OPTIONS = [
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
  { id: 'system', label: 'Авто' },
];

const THEME_COLORS = {
  light: '#e8eef6',
  dark: '#0f1419',
};

export function normalizeTheme(theme) {
  return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';
}

export function resolveTheme(pref) {
  const p = normalizeTheme(pref);
  if (p === 'light' || p === 'dark') return p;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(pref) {
  const normalized = normalizeTheme(pref);
  const resolved = resolveTheme(normalized);
  const root = document.documentElement;
  root.dataset.themePref = normalized;
  root.dataset.theme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[resolved];

  return resolved;
}

let mediaBound = null;

/**
 * @param {() => string} getPref
 * @param {(() => void) | null} [onSystemChange]
 */
export function initTheme(getPref, onSystemChange = null) {
  applyTheme(getPref());

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mediaBound) {
    mq.removeEventListener('change', mediaBound);
    mediaBound = null;
  }

  mediaBound = () => {
    if (normalizeTheme(getPref()) !== 'system') return;
    applyTheme('system');
    if (onSystemChange) onSystemChange();
  };
  mq.addEventListener('change', mediaBound);
}
