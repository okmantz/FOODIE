/**
 * Sharing without a backend: data is packed (deflate when available) into a
 * URL-safe string placed in the location hash, e.g.  #/import/<payload>.
 * Anyone who opens the link in FOODIE can import the recipe / plan / list.
 */
import { copyText, toast } from './util.js';

const b64u = {
  enc: (bytes) => { let s = ''; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); },
};

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function pack(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + b64u.enc(await pipe(raw, new CompressionStream('deflate-raw'))); } catch { /* fall through */ }
  }
  return 'p' + b64u.enc(raw);
}

export async function unpack(str) {
  const kind = str[0];
  const bytes = b64u.dec(str.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

export async function shareLink(kind, data) {
  const payload = await pack({ k: kind, d: data, v: 1 });
  const base = location.href.split('#')[0];
  return `${base}#/import/${payload}`;
}

/** Use the native share sheet when present; otherwise copy to the clipboard. */
export async function shareOrCopy({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const ok = await copyText([text, url].filter(Boolean).join('\n\n'));
  toast(ok ? 'Copied to clipboard' : 'Could not copy — select and copy manually');
  return ok ? 'copied' : 'failed';
}

export const mailtoHref = (subject, body) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
export const smsHref = (body) => `sms:?&body=${encodeURIComponent(body)}`;
