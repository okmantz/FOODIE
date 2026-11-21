/* Small DOM + formatting helpers shared by every module. */
import { swapEmoji } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Hyperscript-ish element builder: h('div.card', {onclick}, child, 'text'). */
export function h(tag, attrs, ...kids) {
  const [head, ...classes] = tag.split('.');
  const [name, id] = head.split('#');
  const el = document.createElement(name || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (k) => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) k.forEach(add);
    else if (k instanceof Node) el.append(k);
    else {
      // interface emoji/symbols become consistent SVG icons; `.food` elements (recipe art) are left alone
      const str = String(k);
      const parts = el.classList.contains('food') ? null : swapEmoji(str);
      if (parts) parts.forEach((p) => el.append(p instanceof Node ? p : document.createTextNode(p)));
      else el.append(document.createTextNode(str));
    }
  };
  kids.forEach(add);
  return el;
}

export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + f(b), 0);
export const uniq = (arr) => [...new Set(arr)];
export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const money = (n, d = 2) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const round = (n, d = 0) => { const f = 10 ** d; return Math.round((Number(n) || 0) * f) / f; };

/* ---------- dates (always local, ISO yyyy-mm-dd keys) ---------- */
export const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const today = () => isoDate();
export const fmtDay = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => parseISO(s).toLocaleDateString(undefined, opts);
export const startOfWeek = (s = today()) => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d); };
export const isoLocalStamp = (s, hhmm) => s.replace(/-/g, '') + 'T' + hhmm.replace(':', '') + '00';
export const timeMin = (hhmm) => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };
export const minToHHMM = (m) => { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
export const fmtTime12 = (hhmm) => { const [a, b] = hhmm.split(':').map(Number); return `${((a + 11) % 12) + 1}:${pad(b)} ${a < 12 ? 'AM' : 'PM'}`; };
export const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`);

export function hashStr(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }

/** Seeded PRNG so a plan can be regenerated identically. */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function download(filename, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); return ok;
  }
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg, opts = {}) {
  let host = $('#toasts');
  if (!host) { host = h('div#toasts', { role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div.toast', {}, h('span', {}, msg), opts.action && h('button.link', { onclick: () => { opts.action.fn(); t.remove(); } }, opts.action.label));
  host.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  clearTimeout(toastTimer);
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, opts.ms || 3200);
}

/* ---------- modal / sheet ---------- */
export function modal({ title, body, actions = [], wide = false, onClose } = {}) {
  const prevFocus = document.activeElement;
  const close = () => { overlay.classList.remove('in'); setTimeout(() => overlay.remove(), 200); document.removeEventListener('keydown', onKey); document.body.classList.remove('noscroll'); onClose?.(); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div.overlay', { onclick: (e) => e.target === overlay && close() },
    h('div.sheet' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      h('div.sheet-head', {}, h('h3', {}, title || ''), h('button.icon-btn', { 'aria-label': 'Close', onclick: close }, '✕')),
      h('div.sheet-body', {}, body),
      actions.length ? h('div.sheet-actions', {}, actions.map((a) => h('button.btn' + (a.primary ? '.primary' : a.danger ? '.danger' : '.ghost'), { onclick: async () => { const r = await a.onClick?.(close); if (r !== false && !a.keepOpen) close(); } }, a.label))) : null));
  document.body.append(overlay);
  document.body.classList.add('noscroll');
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => { overlay.classList.add('in'); (overlay.querySelector('[autofocus]') || overlay.querySelector('input,select,textarea,button.btn') || overlay.querySelector('button'))?.focus(); });
  return { close, el: overlay };
}

export function confirmDialog(message, { okLabel = 'Confirm', danger = false, title = 'Are you sure?' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({ title, body: h('p', {}, message), onClose: () => { if (!done) resolve(false); },
      actions: [{ label: 'Cancel', onClick: () => { done = true; resolve(false); } }, { label: okLabel, primary: !danger, danger, onClick: () => { done = true; resolve(true); } }] });
  });
}

/** Read an image file and return a downscaled JPEG data-URL (keeps localStorage small). */
export function imageToDataURL(file, max = 640, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

/** Print an HTML fragment in a hidden iframe (used for "Print" buttons). */
export function printHTML(title, bodyHTML) {
  const f = h('iframe', { style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' }, 'aria-hidden': 'true' });
  document.body.append(f);
  const doc = f.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:14px/1.5 -apple-system,system-ui,'Segoe UI',Roboto,sans-serif;color:#17201a;margin:28px}
    h1{font:700 28px Georgia,'Times New Roman',serif;margin:0 0 4px} h2{font:700 16px Georgia,serif;border-bottom:2px solid #5aa627;padding-bottom:4px;margin:22px 0 8px;color:#2d6a1e}
    .sub{color:#667;margin-bottom:14px} ul{list-style:none;padding:0;margin:0} li{padding:5px 0;border-bottom:1px solid #eee;display:flex;gap:10px;align-items:baseline}
    .box{width:12px;height:12px;border:1.5px solid #2d6a1e;border-radius:3px;flex:none;position:relative;top:2px} .q{margin-left:auto;color:#555;white-space:nowrap}
    .done{color:#999;text-decoration:line-through} table{border-collapse:collapse;width:100%} td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;font-size:12px}
    th{background:#f2f7ee} .foot{margin-top:24px;color:#889;font-size:11px} ol{padding-left:20px} .meta{color:#556;margin:4px 0 10px}
  </style></head><body>${bodyHTML}<div class="foot">Printed from FOODIE · cost figures are planning estimates, not live prices.</div></body></html>`);
  doc.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 250);
}

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const plural = (n, a, b = a + 's') => (n === 1 ? a : b);
