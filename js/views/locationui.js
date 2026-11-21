/** Shared location UI: a status bar that stays accurate as the user moves, plus the manual fallback. */
import { h, toast } from '../lib/util.js';
import { state } from '../store.js';
import { icon } from '../lib/icons.js';
import { getLoc, onLocation, refreshLocation, setManualLocation, ageLabel, initLocation, fmtDist } from '../lib/location.js';
import { places, onPlaces, syncPlaces } from '../engines/places.js';

let started = false;
/** Start following the user's location (idempotent). */
export function startOnce() { if (started) return; started = true; initLocation(); }

export async function useMyLocation() {
  startOnce();
  const r = await refreshLocation({ force: true });
  if (r.ok) { syncPlaces({ force: true }); return true; }
  toast(r.error === 'denied' ? 'Location is blocked for this site. Allow it in your browser\'s site settings, or enter a ZIP / city.' : r.error === 'timeout' ? 'Couldn\'t get a GPS fix in time — try again, or enter a ZIP / city.' : 'Location isn\'t available here — enter a ZIP or city instead.', { ms: 6000 });
  return false;
}

function manualForm(label = 'Search') {
  let q = ''; let busy = false;
  return h('form.row.nowrap.loc-form', { onsubmit: async (e) => {
    e.preventDefault(); if (!q.trim() || busy) return; busy = true;
    const r = await setManualLocation(q); busy = false;
    if (!r.ok) toast(r.error === 'notfound' ? 'Couldn\'t find that place — try a ZIP code or "City, State".' : 'Couldn\'t reach the lookup service — check your connection.');
    else syncPlaces({ force: true });
  } }, h('input', { type: 'text', placeholder: 'ZIP, city or address', 'aria-label': 'ZIP, city or address', autocomplete: 'postal-code', oninput: (e) => (q = e.target.value) }), h('button.btn.ghost.sm', { type: 'submit' }, label));
}

/** Compact "📍 Near Austin, TX" bar with live status + controls. */
export function locationBar({ showStats = true } = {}) {
  const wrap = h('section.locbar');
  const paint = () => {
    const { loc, permission, busy } = getLoc();
    const pl = places;
    let body;
    if (loc) {
      const stat = pl.status === 'loading' ? h('span.small.muted', {}, h('i.spin', {}), ' Finding places near you…')
        : pl.status === 'refreshing' ? h('span.small.muted', {}, h('i.spin', {}), ' Updating nearby places…')
          : pl.status === 'error' ? h('span.small.warn', {}, pl.error)
            : pl.status === 'stale' && pl.error ? h('span.small.muted', {}, pl.error)
              : pl.status === 'ok' && showStats ? h('span.small.muted', {}, `${pl.food.length} places to eat · ${pl.stores.length} grocery stores within ${fmtDist(pl.radius / 1609.34)}`) : null;
      body = h('div.row.between.nowrap', {},
        h('div.row.nowrap', { style: { gap: '12px', minWidth: 0 } }, h('span.loc-dot' + (loc.source === 'gps' ? '.live' : ''), {}, icon(loc.source === 'gps' ? 'locate' : 'pin')),
          h('div', { style: { minWidth: 0 } }, h('div.loc-title', {}, 'Near ', h('b', {}, loc.label || 'you')), h('div.small.muted', {}, `${loc.source === 'gps' ? 'Live location' : 'Entered manually'} · updated ${ageLabel(loc.ts)}`), stat)),
        h('div.row.nowrap', { style: { gap: '6px' } }, h('button.btn.ghost.sm', { 'aria-label': 'Refresh location', disabled: busy || null, onclick: async () => { await useMyLocation(); } }, icon('refresh'), h('span.hide-sm', {}, 'Refresh')),
          h('button.btn.ghost.sm', { onclick: (e) => { const f = wrap.querySelector('.loc-change'); f.classList.toggle('hide'); f.querySelector('input')?.focus(); } }, 'Change')));
      wrap.replaceChildren(body, h('div.loc-change.hide', {}, manualForm('Use this place')));
    } else {
      const denied = permission === 'denied';
      wrap.replaceChildren(h('div.stack.sm', {},
        h('div.row.nowrap', { style: { gap: '12px', alignItems: 'flex-start' } }, h('span.loc-dot', {}, icon('locate')),
          h('div', {}, h('b', {}, denied ? 'Location is turned off' : 'Turn on location for accurate nearby results'),
            h('p.small.muted', { style: { margin: '2px 0 0' } }, denied ? 'Allow location for this site in your browser settings, or type a ZIP code / city below.' : 'FOODIE uses where you are right now to find real restaurants and grocery stores near you and to pick the right season. Your location stays on this device.'))),
        h('div.row', {}, denied ? null : h('button.btn.primary', { onclick: useMyLocation, disabled: busy || null }, icon('locate'), busy ? 'Locating…' : 'Use my location'), manualForm())));
    }
  };
  paint();
  const offA = onLocation(() => { if (wrap.__seen && !wrap.isConnected) { offA(); offB(); return; } paint(); });
  const offB = onPlaces(() => { if (wrap.__seen && !wrap.isConnected) { offA(); offB(); return; } paint(); });
  requestAnimationFrame(() => { wrap.__seen = wrap.isConnected; });
  return wrap;
}

/** One-line location chip for headers. */
export const locationChip = () => {
  const l = state.profile.homeLoc;
  return h('a.chip.sm.loc-chip', { href: '#/discover' }, icon(l?.source === 'gps' ? 'locate' : 'pin', { cls: 'inl' }), l ? l.label : 'Set location');
};
