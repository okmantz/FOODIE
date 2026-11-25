/** Shared UI building blocks used by multiple views. */
import { h, hashStr, esc, modal, toast, today, addDays, fmtDay, fmtMins, uid, money, round } from './lib/util.js';
import { state, commit, recipeById, isFav, meta, activePlan } from './store.js';
import { DIETS, DIET_LABEL, ALLERGEN_LABEL, TYPE_LABEL } from './engines/nutrition.js';
import { evaluateRecipe, hasWarning } from './engines/coach.js';
import { learnFromRecipe } from './engines/taste.js';
import { SLOTS, SLOT_LABEL, setMeal } from './engines/planner.js';
import { storeById } from './data/stores.js';
import { attachPhoto, fillCredit } from './lib/images.js';

export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };

export function thumb(item, cls = '') {
  const seed = item.id || item.n || item.name || 'x';
  const hue = [28, 12, 48, 95, 140, 160, 8, 36, 340][hashStr(String(seed)) % 9];
  const photo = item.photo; // a photo the user attached to their own recipe always wins
  const el = h('div.thumb' + (cls ? '.' + cls.split(' ').join('.') : '') + (photo ? '.photo' : ''), { style: { '--h': hue, ...(photo ? { backgroundImage: `url("${photo}")` } : {}) }, 'aria-hidden': 'true' }, photo ? null : h('span.e.food', {}, item.e || item.emoji || '🍽️'));
  // Built-in recipes: look the photo up by permanent id. If the manifest has not arrived yet, mark the tile and it is upgraded in place.
  if (!photo && item.id && !item.custom) { el.dataset.pid = item.id; el.dataset.pn = item.n || ''; attachPhoto(el, item.id, item.n); }
  return el;
}

/** Small attribution line shown under a recipe's hero photo (filled once the photo manifest is loaded). */
export function photoCredit(item) {
  const el = h('p.photo-credit.small.muted', { hidden: true });
  if (item.id && !item.custom && !item.photo) { el.dataset.credit = item.id; fillCredit(el, item.id); }
  return el;
}

export const stars = (n) => h('span.stars', { role: 'img', 'aria-label': n ? `${n} out of 5 stars` : 'Not rated' }, [1, 2, 3, 4, 5].map((i) => h('span' + (i <= Math.round(n) ? '' : '.off'), {}, '★')));

export function starInput(value, onChange) {
  const wrap = h('div.star-input', { role: 'radiogroup', 'aria-label': 'Your rating' });
  const paint = (v) => [...wrap.children].forEach((b, i) => b.classList.toggle('on', i < v));
  for (let i = 1; i <= 5; i++) wrap.append(h('button', { type: 'button', role: 'radio', 'aria-label': `${i} star${i > 1 ? 's' : ''}`, 'aria-checked': String(i === value), onclick: () => { value = value === i ? 0 : i; paint(value); onChange(value); } }, '★'));
  paint(value);
  return wrap;
}

export const priceDots = (n) => h('span.price', { 'aria-label': `Price level ${n} of 4` }, ['$', '$', '$', '$'].map((c, i) => h('span' + (i < n ? '' : '.off'), {}, c)));

/** Toggle chips. multi => value is array; else single value (click again to clear if `clearable`). */
export function chipGroup({ options, value, multi = true, onChange, small = false, clearable = false }) {
  const wrap = h('div.chips');
  const isOn = (id) => (multi ? value.includes(id) : value === id);
  const paint = () => [...wrap.children].forEach((b, i) => { const on = isOn(options[i].id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  options.forEach((o) => wrap.append(h('button.chip' + (small ? '.sm' : ''), { type: 'button', 'aria-pressed': 'false', onclick: () => {
    if (multi) value = value.includes(o.id) ? value.filter((x) => x !== o.id) : [...value, o.id];
    else value = value === o.id && clearable ? null : o.id;
    paint(); onChange(value);
  } }, o.icon ? h('span', {}, o.icon) : null, o.label)));
  paint();
  return wrap;
}

export function seg(options, value, onChange) {
  const wrap = h('div.seg', { role: 'tablist' });
  options.forEach((o) => wrap.append(h('button' + (o.id === value ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(o.id === value), onclick: () => onChange(o.id) }, o.label)));
  return wrap;
}

export const field = (label, input, hint) => h('div.field', {}, h('label', {}, label), input, hint ? h('div.hint', {}, hint) : null);

export function dietBadges(r, max = 3) {
  const order = ['vegan', 'vegetarian', 'keto', 'glutenFree', 'dairyFree', 'highProtein', 'pescatarian', 'lowcarb', 'carnivore', 'nutFree'];
  const on = order.filter((d) => r.d.diets[d]);
  // vegan implies vegetarian & pescatarian: avoid redundant badges
  const out = on.filter((d) => !(d === 'vegetarian' && r.d.diets.vegan) && d !== 'pescatarian' && !(d === 'lowcarb' && r.d.diets.keto));
  return out.slice(0, max).map((d) => h('span.badge.green', {}, DIET_LABEL[d]));
}

export function toggleFavRecipe(id, e) {
  e?.preventDefault(); e?.stopPropagation();
  const r = recipeById(id);
  commit((s) => {
    const i = s.favorites.recipes.indexOf(id);
    if (i >= 0) s.favorites.recipes.splice(i, 1); else { s.favorites.recipes.unshift(id); if (r) learnFromRecipe(s, r, 1.5); }
  });
  toast(isFav(id) ? 'Saved to favorites' : 'Removed from favorites');
}

export function recipeCard(r, { note = '', tag = '' } = {}) {
  const m = meta(r.id);
  return h('a.rcard', { href: `#/recipe/${r.id}`, 'aria-label': r.n },
    thumb(r, 'wide'),
    tag ? h('span.tag.badge', {}, tag) : null,
    h('button.fav' + (isFav(r.id) ? '.on' : ''), { type: 'button', 'aria-label': isFav(r.id) ? 'Remove from favorites' : 'Add to favorites', 'aria-pressed': String(isFav(r.id)), onclick: (e) => toggleFavRecipe(r.id, e) }, '♥'),
    h('div.body', {},
      h('div.eyebrow', {}, `${r.c} · ${TYPE_LABEL[r.t]}`),
      h('h4', {}, r.n),
      h('div.meta', {}, h('span', {}, '⏱ ' + fmtMins(r.d.time)), h('span', {}, `🔥 ${Math.round(r.d.nut.kcal)} kcal`), h('span', {}, `$${r.d.cost.toFixed(2)}/serv`)),
      note ? h('div.small.muted', {}, note) : null,
      h('div.row', { style: { gap: '6px' } }, m.rating ? stars(m.rating) : null, ...dietBadges(r, 2), r.custom ? h('span.badge', {}, 'Mine') : null)));
}

export function coachNotes(r) {
  const notes = evaluateRecipe(r);
  return h('div.stack.sm', {}, notes.map((n) => h('div.cnote.' + n.level, {}, h('span', {}, n.level === 'warn' ? '⚠️' : n.level === 'good' ? '✅' : '💬'), h('span', {}, n.text))));
}

/** Pick a date + meal and add a recipe to the active plan (creating one if needed). Coach warns, never blocks. */
export function addToPlanDialog(rid) {
  const r = recipeById(rid); if (!r) return;
  const plan = activePlan();
  const dates = plan ? plan.days.map((d) => d.date) : Array.from({ length: 7 }, (_, i) => addDays(today(), i));
  let date = dates.includes(today()) ? today() : dates[0];
  let slot = r.slots[0] === 'snack' ? 'snack' : r.slots[0];
  const dateSel = h('select', { onchange: (e) => (date = e.target.value) }, dates.map((d) => h('option', { value: d, selected: d === date }, fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' }))));
  const slotSel = h('select', { onchange: (e) => (slot = e.target.value) }, SLOTS.map((s) => h('option', { value: s, selected: s === slot }, SLOT_LABEL[s])));
  const warn = hasWarning(r);
  modal({ title: `Add “${r.n}” to plan`, body: h('div.stack', {}, warn ? coachNotes(r) : null, warn ? h('p.small.muted', {}, 'These are just heads-ups. It\'s your plate — add it if you like.') : null, h('div.field', {}, h('label', {}, 'Day'), dateSel), h('div.field', {}, h('label', {}, 'Meal'), slotSel),
    !plan ? h('p.small.muted', {}, 'No plan yet — FOODIE will start a new one-week plan for you.') : null),
    actions: [{ label: 'Cancel' }, { label: warn ? 'Add anyway' : 'Add to plan', primary: true, onClick: () => {
      commit((s) => {
        let p = s.plans.find((x) => x.id === s.activePlanId);
        if (!p) { p = { id: uid('plan'), name: 'My meal plan', createdAt: Date.now(), startDate: today(), days: dates.map((d) => ({ date: d, slots: {} })), prefs: null, store: s.profile.store, household: s.profile.household, budget: s.profile.weeklyBudget, warnings: [] }; p.prefs = { ...(null), days: 7, slots: { breakfast: true, lunch: true, dinner: true }, snackFreq: 'none', budget: p.budget, household: p.household, mode: 'different', cuisines: [], diets: [...s.profile.diets], maxTime: null, usePantry: true, useTaste: true, store: p.store }; s.plans.unshift(p); s.activePlanId = p.id; }
        setMeal(p, date, slot, rid);
      });
      toast(`Added to ${SLOT_LABEL[slot]} on ${fmtDay(date)}`, { action: { label: 'View plan', fn: () => go('#/planner') } });
    } }] });
}

export function nutritionBar(n) {
  const p = n.pro * 4, c = n.carb * 4, f = n.fat * 9, t = p + c + f || 1;
  return h('div.stack.sm', {}, h('div.bar', { role: 'img', 'aria-label': `Protein ${Math.round(p / t * 100)}%, carbs ${Math.round(c / t * 100)}%, fat ${Math.round(f / t * 100)}%` },
    h('i', { style: { width: `${p / t * 100}%`, background: 'var(--tomato)' } }), h('i', { style: { width: `${c / t * 100}%`, background: 'var(--citrus)' } }), h('i', { style: { width: `${f / t * 100}%`, background: 'var(--sky)' } })),
    h('div.legend', {}, h('span', {}, h('i', { style: { background: 'var(--tomato)' } }), `Protein ${Math.round(n.pro)} g`), h('span', {}, h('i', { style: { background: 'var(--citrus)' } }), `Carbs ${Math.round(n.carb)} g`), h('span', {}, h('i', { style: { background: 'var(--sky)' } }), `Fat ${Math.round(n.fat)} g`)));
}

export const sectionHead = (title, right, sub) => h('div.row.between', { style: { margin: '26px 0 10px' } }, h('div', {}, h('h2', {}, title), sub ? h('p.muted.small', { style: { margin: '2px 0 0' } }, sub) : null), right);

export const notice = (kind, ...kids) => h('div.notice.' + kind, {}, ...kids);
export const storeName = () => storeById(state.profile.store).name;
export { money, round };
