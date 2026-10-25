/** Бонусные программы сетей АЗС: ссылка https, быстрая команда iPhone или схема приложения. */

const ASCII_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function isAndroid() {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

function playPackage(value) {
  const match = /play\.google\.com\/store\/apps\/details\?id=([a-zA-Z0-9._]+)/.exec(value);
  if (match) return match[1];
  return null;
}

function looksLikeDomain(value) {
  return /^(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/?#].*)?$/i.test(value);
}

function shortcutOpenHref(name) {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return `shortcuts://run-shortcut?name=${encodeURIComponent(trimmed)}`;
}

function isLatinShortcutName(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(':')) return false;
  if (looksLikeDomain(trimmed)) return false;
  return /^[A-Za-z][A-Za-z0-9 ._-]{0,63}$/.test(trimmed);
}

export function loyaltyAppHref(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('intent:')) return trimmed;
  const pkg = playPackage(trimmed);
  if (pkg && isAndroid()) {
    return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};end`;
  }
  if (isLatinShortcutName(trimmed)) return shortcutOpenHref(trimmed);
  if (ASCII_SCHEME.test(trimmed)) {
    if (/^[a-z][a-z0-9+.-]*:$/i.test(trimmed)) return `${trimmed}//`;
    return trimmed;
  }
  if (looksLikeDomain(trimmed)) return `https://${trimmed}`;
  return '';
}

export function loyaltyAppError(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || loyaltyAppHref(trimmed)) return '';
  if (/[а-яё]/i.test(trimmed)) {
    return 'Имя быстрой команды — латиницей, как в «Командах», например GPN. Либо ссылка https://…';
  }
  return 'Нужна ссылка https://…, имя быстрой команды латиницей или схема приложения.';
}

/** Без noreferrer/новой вкладки — иначе iOS не отдаёт custom scheme установленному приложению. */
export function openLoyaltyApp(value) {
  const href = loyaltyAppHref(value);
  if (!href) return false;
  window.location.assign(href);
  return true;
}

export function hasLoyalty(network) {
  return Boolean(network && (loyaltyAppHref(network.loyaltyApp) || network.loyaltyCard));
}
