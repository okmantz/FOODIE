/**
 * Grocery list engine: aggregates ingredient needs across cooked meals,
 * subtracts the pantry, rounds up to purchasable packs and estimates cost.
 * Prices are planning estimates scaled by the chosen store's rough price tier.
 */
import { INGREDIENTS, AISLE_ORDER } from '../data/ingredients.js';
import { recipeById } from '../store.js';
import { scale } from './nutrition.js';
import { storeById, priceMult } from '../data/stores.js';
import { fmtQty, fmtPack } from '../lib/units.js';
import { uid, money, parseISO, fmtDay, isoDate } from '../lib/util.js';

/** slots: [{rid, servings, batch}] -> aggregated needs */
export function aggregate(slots) {
  const ing = new Map(); const custom = new Map();
  for (const s of slots) {
    const r = recipeById(s.rid); if (!r) continue;
    const f = scale(r, s.servings * (s.batch || 1));
    for (const [id, qty] of r.i) {
      if (id.startsWith('~')) {
        const name = id.slice(1); const c = custom.get(name) || { name, amounts: [], recipes: new Set() };
        c.amounts.push(qty); c.recipes.add(r.n); custom.set(name, c);
      } else if (INGREDIENTS[id]) {
        const e = ing.get(id) || { id, qty: 0, recipes: new Set() };
        e.qty += qty * f; e.recipes.add(r.n); ing.set(id, e);
      }
    }
  }
  return { ing, custom };
}

/** What you can actually cook with: expired items don't count, so the list tells you to rebuy them. */
export const pantryTotals = (pantry, asOf = isoDate()) => {
  const m = new Map();
  for (const p of pantry) if (p.ing && INGREDIENTS[p.ing] && !(p.expires && p.expires < asOf)) m.set(p.ing, (m.get(p.ing) || 0) + (+p.qty || 0));
  return m;
};

export const packsFor = (ing, buy) => (buy > 1e-6 ? Math.max(1, Math.ceil(buy / ing.pack - 1e-6)) : 0);

/** Slots of a plan (cooked meals only) inside an optional date window. */
export function cookedSlots(plan, from = null, to = null) {
  const out = [];
  for (const day of plan.days) {
    if ((from && day.date < from) || (to && day.date > to)) continue;
    for (const [slot, m] of Object.entries(day.slots)) if (m && !m.leftover) out.push({ ...m, date: day.date, slot });
  }
  return out;
}

/** Build/refresh list items. `prev` items keep the user's edits by key. */
export function buildItems(slots, pantry, prev = []) {
  const prevBy = new Map(prev.map((i) => [i.key, i]));
  const { ing, custom } = aggregate(slots);
  const pan = pantryTotals(pantry);
  const items = [];
  for (const e of ing.values()) {
    const key = 'i:' + e.id; const p = prevBy.get(key) || {};
    const def = INGREDIENTS[e.id];
    const extra = p.extra || 0; const need = e.qty + extra;
    items.push({ key, ing: e.id, name: def.name, aisle: def.aisle, need, extra, pantry: Math.min(pan.get(e.id) || 0, need), recipes: [...e.recipes],
      qtyOverride: p.qtyOverride ?? null, have: p.have ?? false, checked: p.checked ?? false });
  }
  for (const c of custom.values()) {
    const key = 'c:' + c.name; const p = prevBy.get(key) || {};
    items.push({ key, name: c.name, aisle: 'Other', custom: true, text: c.amounts.join(' + '), recipes: [...c.recipes], have: p.have ?? false, checked: p.checked ?? false });
  }
  // ingredients added by hand from a recipe page that aren't part of the plan
  for (const pv of prev) if (pv.ing && pv.extra && !items.some((i) => i.key === pv.key)) items.push({ ...pv, need: pv.extra, pantry: Math.min(pan.get(pv.ing) || 0, pv.extra) });
  for (const m of prev.filter((i) => i.manual)) items.push(m);
  return items;
}

export function newList(plan, state, { name, from = null, to = null } = {}) {
  const slots = cookedSlots(plan, from, to);
  return {
    id: uid('list'), name: name || `${plan.name} — groceries`, planId: plan.id, from, to, createdAt: Date.now(), store: state.profile.store,
    items: buildItems(slots, state.pantry),
  };
}

export function refreshList(list, plan, state) {
  list.items = buildItems(cookedSlots(plan, list.from, list.to), state.pantry, list.items);
}

/** Effective amount to buy for one item, in base units. */
export function buyQty(item) {
  if (!item.ing) return 0;
  const need = item.qtyOverride ?? item.need;
  return Math.max(0, need - (item.pantry || 0));
}

export function itemCost(item, mult = 1) {
  if (!item.ing || item.have) return 0;
  const ing = INGREDIENTS[item.ing];
  return packsFor(ing, buyQty(item)) * ing.price * mult;
}

export function listStats(list, planSlots = null) {
  const mult = priceMult(list.store);
  const real = list.items.filter((i) => !i.have);
  const total = real.reduce((a, i) => a + itemCost(i, mult), 0);
  const all = list.items;
  const checked = all.filter((i) => i.checked || i.have).length;
  let reuseSavings = 0;
  if (planSlots) {
    // cost if each distinct recipe were shopped for on its own (its own packs) vs one combined basket
    let separate = 0;
    const byRecipe = new Map();
    for (const s of planSlots) { const k = s.rid; if (!byRecipe.has(k)) byRecipe.set(k, []); byRecipe.get(k).push(s); }
    for (const group of byRecipe.values()) {
      const { ing } = aggregate(group);
      for (const e of ing.values()) separate += packsFor(INGREDIENTS[e.id], e.qty) * INGREDIENTS[e.id].price * mult;
    }
    const { ing: comb } = aggregate(planSlots);
    let combined = 0;
    for (const e of comb.values()) combined += packsFor(INGREDIENTS[e.id], e.qty) * INGREDIENTS[e.id].price * mult;
    reuseSavings = Math.max(0, separate - combined);
  }
  return { total, count: all.length, checked, reuseSavings, store: storeById(list.store) };
}

export function groupByAisle(items) {
  const g = new Map();
  for (const i of items) { const a = AISLE_ORDER.includes(i.aisle) ? i.aisle : 'Other'; if (!g.has(a)) g.set(a, []); g.get(a).push(i); }
  return AISLE_ORDER.filter((a) => g.has(a)).map((a) => [a, g.get(a).sort((x, y) => x.name.localeCompare(y.name))]);
}

export function describeItem(item, system) {
  if (item.manual) return { amount: item.qtyText || '', buy: '' };
  if (item.custom) return { amount: item.text, buy: '' };
  const ing = INGREDIENTS[item.ing];
  const need = item.qtyOverride ?? item.need;
  const buy = buyQty(item);
  const packs = packsFor(ing, buy);
  return {
    amount: fmtQty(ing, need, system),
    buy: item.have ? 'Already have' : packs ? `Buy ${packs} × ${fmtPack(ing, system)}` : 'Covered by pantry',
    pantryNote: item.pantry > 0 ? `${fmtQty(ing, item.pantry, system)} in pantry` : '',
  };
}

export function listToText(list, system, { includeChecked = true } = {}) {
  const lines = [`${list.name}`, `Store: ${storeById(list.store).name}`, ''];
  for (const [aisle, items] of groupByAisle(list.items)) {
    const rows = items.filter((i) => includeChecked || !(i.checked || i.have));
    if (!rows.length) continue;
    lines.push(aisle.toUpperCase());
    for (const i of rows) { const d = describeItem(i, system); lines.push(`${i.checked || i.have ? '[x]' : '[ ]'} ${i.name}${d.amount ? ' — ' + d.amount : ''}`); }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function listToHTML(list, system, mult) {
  const st = listStats(list);
  const sec = groupByAisle(list.items).map(([aisle, items]) => `<h2>${aisle}</h2><ul>${items.map((i) => {
    const d = describeItem(i, system); const done = i.checked || i.have;
    return `<li class="${done ? 'done' : ''}"><span class="box"></span><span>${i.name}</span><span class="q">${d.amount}</span></li>`;
  }).join('')}</ul>`).join('');
  return `<h1>${list.name}</h1><div class="sub">${list.items.length} items · estimated ${money(st.total)} at ${st.store.name} (planning estimate)</div>${sec}`;
}

/** Add one recipe's ingredients to a list as extras (survive plan refreshes). */
export function addRecipeToList(s, list, r, servings, pantry = s.pantry) {
  const f = scale(r, servings);
  const pan = pantryTotals(pantry);
  for (const [id, qty] of r.i) {
    if (id.startsWith('~')) { list.items.push({ key: 'm:' + uid('x'), manual: true, name: id.slice(1), aisle: 'Other', qtyText: String(qty), recipes: [r.n], have: false, checked: false }); continue; }
    const def = INGREDIENTS[id]; if (!def) continue;
    const add = qty * f; const ex = list.items.find((i) => i.key === 'i:' + id);
    if (ex) { ex.extra = (ex.extra || 0) + add; ex.need += add; ex.pantry = Math.min(pan.get(id) || 0, ex.need); if (!ex.recipes.includes(r.n)) ex.recipes.push(r.n); ex.have = false; }
    else list.items.push({ key: 'i:' + id, ing: id, name: def.name, aisle: def.aisle, need: add, extra: add, pantry: Math.min(pan.get(id) || 0, add), recipes: [r.n], qtyOverride: null, have: false, checked: false });
  }
}
