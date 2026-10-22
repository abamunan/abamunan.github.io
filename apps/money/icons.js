// Inline SVG (works offline; no Font Awesome). icon('name', size)
const P = {
  today: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  insights: '<path d="M5 20V11M12 20V4M19 20v-6"/>', plan: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', back: '<path d="M7 7l-4 5 4 5M3 12h18"/>', home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  warn: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.5"/>', expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', moon: '<path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>', accounts: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 14h3"/>'
};
export const icon = (name, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
