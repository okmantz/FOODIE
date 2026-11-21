/**
 * FOODIE icon set — one consistent line-icon family (24px grid, 1.75 stroke)
 * used everywhere instead of platform emoji, so the app looks identical and
 * professional on every device.
 *
 *   icon('home')            -> <svg class="i">…</svg>
 *   swapEmoji('📍 2 mi')    -> ['<svg>', ' 2 mi']   (used automatically by h())
 *
 * Food emoji (recipe art, quiz cards) are deliberately NOT mapped: they are
 * content, not interface chrome.
 */
const NS = 'http://www.w3.org/2000/svg';

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/>',
  cart: '<circle cx="9" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/><path d="M2.5 3.5h3l2.5 12h10.5l1.8-8.5H6.2"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  jar: '<rect x="6" y="8" width="12" height="13" rx="2.5"/><path d="M8 4h8v4H8zM6 13h12"/>',
  chart: '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  utensils: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M18 21V3c-2.6 1.6-4 4.2-4 8h4"/>',
  alert: '<path d="M10.3 4 2.8 17.5a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  flame: '<path d="M12 3c1 3.6 5 5.6 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2 0 2 1 3 2 3 0-3-1-5 1-8.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  dollar: '<path d="M12 3v18M16.5 7.5C15.6 6.4 14.2 6 12.6 6 10.4 6 8.6 7.1 8.6 9s2 2.6 3.8 3c2 .5 4.1 1.2 4.1 3.3 0 2-2 3.2-4.1 3.2-1.8 0-3.4-.6-4.5-1.8"/>',
  leaf: '<path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15"/><path d="M5 19c2-4 5-7 9-9"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  locate: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3.2 3.2 14.8 0 18M12 3c-3.2 3.2-3.2 14.8 0 18"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-3.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14.5 3.5L20 15M20 20v-5h-5"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4M6 12H5a1 1 0 0 0-1 1v7h16v-7a1 1 0 0 0-1-1h-1"/>',
  printer: '<path d="M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m14 6 4 4"/>',
  snow: '<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6a12 12 0 0 1-2.6 3.2M6.3 7.4A12.5 12.5 0 0 0 2.5 12c1 1.8 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.8M9.9 10a3 3 0 0 0 4.1 4.1"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
  scale: '<path d="M12 4v16M6 20h12M5 8h14M5 8 2 15a3 3 0 0 0 6 0zM19 8l-3 7a3 3 0 0 0 6 0z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.4-1.1 1-1.1 1.8M12 17h.01"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  store: '<path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M10 20v-5h4v5"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
  nav: '<path d="m4 11 16-7-7 16-2-7z"/>',
};

/** Fill-style icons (solid when "on"). */
const FILLED = new Set(['heart', 'star']);

export function icon(name, { size = null, fill = false, cls = '', label = null } = {}) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'i' + (cls ? ' ' + cls : '') + (fill && FILLED.has(name) ? ' fill' : ''));
  el.setAttribute('fill', fill && FILLED.has(name) ? 'currentColor' : 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.75');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  if (label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', label); } else el.setAttribute('aria-hidden', 'true');
  if (size) { el.setAttribute('width', size); el.setAttribute('height', size); }
  el.innerHTML = P[name] || P.info;
  return el;
}
export const hasIcon = (n) => n in P;

/* ---- emoji -> icon map for interface symbols (food emoji intentionally absent) ---- */
const MAP = {
  '🏠': 'home', '🗓️': 'calendar', '🗓': 'calendar', '📅': 'calendar', '📖': 'book', '🛒': 'cart', '🛍️': 'bag', '🛍': 'bag', '🧭': 'compass', '🥫': 'jar',
  '📊': 'chart', '🧑‍🍳': 'user', '☰': 'menu', '✕': 'x', '➕': 'plus', '＋': 'plus', '›': 'chevron', '‹': 'chevron-left', '💬': 'chat', '🍽️': 'utensils', '🍽': 'utensils', '🍴': 'utensils',
  '⚠️': 'alert', '⚠': 'alert', '✅': 'check-circle', '✓': 'check', '🔥': 'flame', '⏱': 'clock', '⏳': 'clock', '💵': 'dollar', '🍂': 'leaf', '📍': 'pin',
  '🗺': 'map', '🗺️': 'map', '🌐': 'globe', '📞': 'phone', '🛵': 'bag', '👎': 'ban', '👍': 'check-circle', '🗑': 'trash', '🗑️': 'trash', '🔍': 'search', '🔎': 'search',
  '🔁': 'repeat', '🔄': 'refresh', '♻️': 'repeat', '♻': 'repeat', '💡': 'bulb', '🎉': 'sparkles', '✨': 'sparkles', '⬇': 'download', '⬆': 'upload', '📤': 'share',
  '🖨': 'printer', '🖨️': 'printer', '📋': 'clipboard', '🔗': 'link', '✏️': 'edit', '✏': 'edit', '🧊': 'snow', '🌙': 'moon', '🌈': 'layers', '♥': 'heart!', '♡': 'heart',
  '⚖': 'scale', '⚖️': 'scale', '🧮': 'calc', '🤖': 'info', '💪': 'bolt', '🔒': 'lock', '🤷': 'help', '↗': 'external',
};
const keys = Object.keys(MAP).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const RE = new RegExp('(' + keys.join('|') + ')\\uFE0F?', 'gu');
const HAS = new RegExp(keys.join('|'), 'u');

/** Split a string into text + icon nodes. Returns null when nothing to swap. */
export function swapEmoji(str) {
  if (!HAS.test(str)) return null;
  const out = []; let last = 0; let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(str))) {
    if (m.index > last) out.push(str.slice(last, m.index));
    const name = MAP[m[1]]; const filled = name.endsWith('!');
    out.push(icon(filled ? name.slice(0, -1) : name, { fill: filled, cls: 'inl' }));
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}
