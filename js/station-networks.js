/** SVG-бейджи сетей АЗС (локальные data URL) */

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeSvg(text, bg, fg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${bg}"/>
    <text x="32" y="38" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700" fill="${fg}">${text}</text>
  </svg>`;
}

function badgeLogo(label, bg, fg = '#fff') {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(escapeXml(label), bg, fg))}`;
}

/** Прежний вариант с двойным кодированием метки — только чтобы узнать и заменить сохранённые копии. */
function brokenBadgeLogo(label, bg, fg = '#fff') {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(encodeURIComponent(label), bg, fg))}`;
}

const BADGES = [
  { name: 'Лукойл', label: 'ЛУК', bg: '#e30613' },
  { name: 'Роснефть', label: 'РН', bg: '#ffcc00', fg: '#1a1a1a' },
  { name: 'Газпромнефть', label: 'ГПН', bg: '#0066b3', loyaltyApp: 'https://gpnbonus.ru/pwa/' },
  { name: 'Татнефть', label: 'ТН', bg: '#009640' },
  { name: 'Башнефть', label: 'БН', bg: '#f6a800', fg: '#1a1a1a' },
  { name: 'Shell', label: 'Sh', bg: '#dd1d21' },
  { name: 'BP', label: 'BP', bg: '#00965e' },
  { name: 'E100', label: 'E1', bg: '#1e3a8a' },
  { name: 'Нефтьмагистраль', label: 'НМ', bg: '#c41e3a' },
  { name: 'Трасса', label: 'ТР', bg: '#0ea5e9' },
];

/** Предустановленные сети заправок (РФ) — только название и логотип */
export const DEFAULT_NETWORKS = BADGES.map(({ name, label, bg, fg, loyaltyApp }) => ({
  name,
  logo: badgeLogo(label, bg, fg),
  ...(loyaltyApp ? { loyaltyApp } : {}),
}));

const BROKEN_TO_FIXED = new Map(
  BADGES.map(({ label, bg, fg }) => [brokenBadgeLogo(label, bg, fg), badgeLogo(label, bg, fg)])
);

/** Заменяет сохранённые логотипы с «%D0%9…» на исправленные. Возвращает true, если что-то поменялось. */
export function repairBrokenLogos(networks) {
  let changed = false;
  for (const n of networks || []) {
    const fixed = n && BROKEN_TO_FIXED.get(n.logo);
    if (fixed && fixed !== n.logo) {
      n.logo = fixed;
      changed = true;
    }
  }
  return changed;
}

export function createDefaultNetworks(uid) {
  return DEFAULT_NETWORKS.map((n) => ({
    id: uid('net'),
    name: n.name,
    logo: n.logo,
    ...(n.loyaltyApp ? { loyaltyApp: n.loyaltyApp } : {}),
  }));
}
