/**
 * Recipe photography. Photos are optional progressive enhancement: the emoji tile (see ui.js thumb())
 * is always rendered first, and replaced by a photo when assets/recipes/manifest.json maps the recipe's
 * permanent id to an image. If the manifest or a file is missing/offline, the emoji tile simply stays.
 * Lookups are by recipe id only — never by array position or recipe name.
 */
const BASE = 'assets/recipes/';
let IDX = null; let loading = null;

export const photosReady = () => IDX !== null;

export function loadPhotoIndex() {
  if (loading) return loading;
  loading = fetch(BASE + 'manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
    if (!m || !m.images) return;
    IDX = m.images; upgradeAll(document);
  }).catch(() => { /* offline & never cached, or no photos shipped yet: keep emoji tiles */ });
  return loading;
}

export function photoFor(id) {
  const x = IDX && IDX[id]; if (!x) return null;
  return { thumb: `${BASE}t/${x.f}.webp`, full: `${BASE}f/${x.f}.webp`, color: x.c, credit: x };
}

/** Put the photo into an existing .thumb element (idempotent). Returns true if a photo is now showing/loading. */
export function attachPhoto(el, id, name) {
  if (el.classList.contains('has-img')) return true;
  const p = photoFor(id); if (!p) return false;
  const hero = el.classList.contains('hero');
  const img = new Image();
  img.className = 'ph'; img.decoding = 'async'; img.alt = hero ? name || '' : '';
  if (hero) { img.fetchPriority = 'high'; img.sizes = '(min-width: 860px) 560px, 100vw'; img.srcset = `${p.thumb} 480w, ${p.full} 1200w`; img.src = p.full; el.removeAttribute('aria-hidden'); }
  else { img.loading = 'lazy'; img.src = p.thumb; }
  el.style.setProperty('--pc', p.color);
  el.classList.add('has-img');
  img.addEventListener('load', () => el.classList.add('loaded'));
  img.addEventListener('error', () => { img.remove(); el.classList.remove('has-img', 'loaded'); el.classList.add('img-failed'); }); // file missing/offline-uncached -> emoji tile
  el.append(img);
  if (img.complete && img.naturalWidth) el.classList.add('loaded');
  return true;
}

/** "Photo: Name · CC BY 4.0 · source" line for the recipe page (also satisfies CC BY attribution). */
export function fillCredit(el, id) {
  const x = IDX && IDX[id]; if (!x || x.ok === 'manual' && !x.a) return false;
  el.replaceChildren();
  const t = (s) => document.createTextNode(s);
  if (x.s === 'ai') { el.append(t('AI-generated image of this dish')); el.hidden = false; return true; } // honest labelling: not a photo of the dish as cooked
  el.append(t('Photo: '));
  if (x.u) { const a = document.createElement('a'); a.href = x.u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = x.a || 'source'; el.append(a); } else el.append(t(x.a || 'Unknown'));
  if (x.l) { el.append(t(' · ')); if (x.lu) { const a = document.createElement('a'); a.href = x.lu; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = x.l; el.append(a); } else el.append(t(x.l)); }
  el.hidden = false; return true;
}

function upgradeAll(root) {
  root.querySelectorAll('.thumb[data-pid]:not(.has-img)').forEach((el) => attachPhoto(el, el.dataset.pid, el.dataset.pn));
  root.querySelectorAll('[data-credit]').forEach((el) => fillCredit(el, el.dataset.credit));
}
