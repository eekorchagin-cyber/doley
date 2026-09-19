/** SVG-бейджи сетей АЗС (локальные data URL, без внешних запросов) */

function badgeLogo(label, bg, fg = '#fff') {
  const text = encodeURIComponent(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${bg}"/>
    <text x="32" y="38" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700" fill="${fg}">${text}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Предустановленные сети заправок (РФ) */
export const DEFAULT_NETWORKS = [
  { name: 'Лукойл', logo: badgeLogo('ЛУК', '#e30613') },
  { name: 'Роснефть', logo: badgeLogo('РН', '#ffcc00', '#1a1a1a') },
  { name: 'Газпромнефть', logo: badgeLogo('ГПН', '#0066b3') },
  { name: 'Татнефть', logo: badgeLogo('ТН', '#009640') },
  { name: 'Башнефть', logo: badgeLogo('БН', '#f6a800', '#1a1a1a') },
  { name: 'Shell', logo: badgeLogo('Sh', '#dd1d21') },
  { name: 'BP', logo: badgeLogo('BP', '#00965e') },
  { name: 'E100', logo: badgeLogo('E1', '#1e3a8a') },
  { name: 'Нефтьмагистраль', logo: badgeLogo('НМ', '#c41e3a') },
  { name: 'Трасса', logo: badgeLogo('ТР', '#0ea5e9') },
];

export function networkStations(uid) {
  return DEFAULT_NETWORKS.map((n) => ({
    id: uid('station'),
    name: n.name,
    address: '',
    logo: n.logo,
    isNetwork: true,
  }));
}
