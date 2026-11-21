/** Grocery list: aisle-organized, editable, pantry-aware, exportable (PDF / print / share / order links). */
import { h, modal, toast, confirmDialog, download, uid, money, today, fmtDay, printHTML, esc, copyText } from '../lib/util.js';
import { state, commit, activeList, activePlan, recipeById } from '../store.js';
import { field, go, notice, chipGroup } from '../ui.js';
import { groupByAisle, describeItem, listStats, itemCost, buyQty, packsFor, refreshList, listToText, listToHTML, newList, cookedSlots } from '../engines/grocery.js';
import { INGREDIENTS } from '../data/ingredients.js';
import { STORES, storeById, priceMult } from '../data/stores.js';
import { nearbyChains } from '../engines/places.js';
import { fmtDist } from '../lib/location.js';
import { unitLabel, toDisplayNum, fromDisplayNum, fmtPack } from '../lib/units.js';
import { PDF } from '../lib/pdf.js';
import { shareLink, shareOrCopy, mailtoHref, smsHref } from '../lib/share.js';
import { addPantry } from '../actions.js';

const ui = { hideDone: false };
const mutate = (id, fn) => commit((s) => { const l = s.lists.find((x) => x.id === id); if (l) fn(l, s); });

export function renderGrocery() {
  const list = activeList();
  if (!list) return emptyState();
  const sys = state.profile.units;
  const plan = state.plans.find((p) => p.id === list.planId);
  const stats = listStats(list, plan ? cookedSlots(plan, list.from, list.to) : null);
  const store = storeById(list.store);
  const done = list.items.filter((i) => i.checked || i.have).length;
  const pct = list.items.length ? Math.round(done / list.items.length * 100) : 0;

  const header = h('div.page-head', {},
    h('div', {}, h('span.eyebrow', {}, 'Grocery list'), h('h1', {}, list.name), h('p', {}, `${list.items.length} items · ${done} checked off${plan ? ` · from “${plan.name}”` : ''}`)),
    h('div.row', {}, state.lists.length > 1 ? h('select', { 'aria-label': 'Switch list', style: { width: 'auto', maxWidth: '220px' }, onchange: (e) => commit((s) => { s.activeListId = e.target.value; }) }, state.lists.map((l) => h('option', { value: l.id, selected: l.id === list.id }, l.name))) : null,
      h('button.btn.ghost', { onclick: () => listMenu(list, plan) }, 'More ⋯')));

  const summary = h('div.grid.c4', {},
    h('div.card.stat', {}, h('span.n', {}, money(stats.total, 2)), h('span.l', {}, 'Estimated total'), h('span.tiny.muted', {}, `${store.name} price level`)),
    h('div.card.stat', {}, h('span.n', {}, `${done}/${list.items.length}`), h('span.l', {}, 'Checked off'), h('div.progress', { role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: pct + '%' } }))),
    h('div.card.stat', {}, h('span.n', {}, money(stats.reuseSavings)), h('span.l', {}, 'Saved by ingredient reuse'), h('span.tiny.muted', {}, 'vs. shopping each recipe separately')),
    h('div.card.stat', {}, h('span.n', {}, String(list.items.filter((i) => i.ing && i.pantry > 0).length)), h('span.l', {}, 'Items from your pantry'), h('span.tiny.muted', {}, 'already counted, not on your tab')));

  let addVal = '';
  const addRow = h('form.row.nowrap', { onsubmit: (e) => { e.preventDefault(); const v = addVal.trim(); if (!v) return; const m = v.match(/^(.*?)(?:\s*[—–-]\s*|\s+x\s*)(\d.*)$/i); mutate(list.id, (l) => l.items.push({ key: 'm:' + uid('i'), manual: true, name: (m ? m[1] : v), qtyText: m ? m[2] : '', aisle: 'Other', checked: false, have: false, recipes: [] })); addVal = ''; e.target.reset(); }, style: { gap: '8px' } },
    h('input', { type: 'text', placeholder: 'Add an item (e.g. paper towels — 2)', 'aria-label': 'Add item', oninput: (e) => (addVal = e.target.value) }), h('button.btn.primary', { type: 'submit' }, 'Add'));

  const groups = groupByAisle(list.items);
  const aisles = h('div', {}, groups.map(([aisle, items]) => {
    const shown = items.filter((i) => !(ui.hideDone && (i.checked || i.have)));
    if (!shown.length) return null;
    return h('section.aisle', {}, h('h4', {}, h('span', {}, aisle), h('span.muted', {}, `${items.filter((i) => !(i.checked || i.have)).length} left`)), h('div.card.flat', { style: { padding: '4px 14px' } }, shown.map((i) => itemRow(list, i, sys, store))));
  }));

  const order = h('section.card.stack', {}, h('h3', {}, '🛍️ Order or pick up'),
    h('p.small.muted', { style: { margin: 0 } }, `${store.name}: ${store.order}. FOODIE can't place orders or see live prices (that requires each retailer's partner access) — but every item has a one-tap link to search it on the store's site, and you can copy the whole list.`),
    nearbyStores(list, mutate),
    h('div.row', {}, field('Shopping at', h('select', { onchange: (e) => mutate(list.id, (l) => (l.store = e.target.value)) }, STORES.map((s) => h('option', { value: s.id, selected: s.id === list.store }, s.name)))),
      store.search ? h('a.btn.primary', { href: store.search('groceries'), target: '_blank', rel: 'noopener', style: { alignSelf: 'flex-end' } }, `Open ${store.name.split(' (')[0]} ↗`) : h('span.small.muted', { style: { alignSelf: 'flex-end' } }, 'Shop in store — print or share your list.')),
    h('div.row', {}, h('button.btn.ghost.sm', { onclick: async () => { await copyText(listToText(list, sys, { includeChecked: false })); toast('Remaining items copied — paste into your store app or notes'); } }, '📋 Copy remaining items'), h('button.btn.ghost.sm', { onclick: () => finishShopping(list) }, '✅ Finish shopping → add to pantry')));

  return h('div.view.stack', {}, header, summary,
    h('div.split', {}, h('div.stack', {}, addRow,
      h('div.row.between', {}, h('label.row', { style: { gap: '8px' } }, h('input', { type: 'checkbox', checked: ui.hideDone, onchange: (e) => { ui.hideDone = e.target.checked; go('#/grocery'); } }), h('span.small', {}, 'Hide checked items')),
        h('div.row', { style: { gap: '6px' } }, h('button.btn.ghost.sm', { onclick: () => listPDF(list, stats) }, '⬇ PDF'), h('button.btn.ghost.sm', { onclick: () => printHTML(list.name, listToHTML(list, sys)) }, '🖨 Print'), h('button.btn.ghost.sm', { onclick: () => shareList(list) }, '📤 Share'))),
      list.items.length ? aisles : h('div.empty', {}, h('div.big', {}, '🛒'), h('p', {}, 'This list is empty. Add an item above.'))), h('div.stack', {}, order,
      plan ? h('section.card.stack.sm', {}, h('h4', {}, 'Plan changed?'), h('p.small.muted', { style: { margin: 0 } }, 'Refresh to pull in swapped meals and your latest pantry. Your checkmarks and edits stay.'), h('button.btn.ghost', { onclick: () => { mutate(list.id, (l, s) => refreshList(l, s.plans.find((p) => p.id === l.planId), s)); toast('List refreshed from your plan'); } }, '🔄 Refresh from plan')) : null)));
}

function itemRow(list, i, sys, store) {
  const d = describeItem(i, sys); const finished = i.checked || i.have;
  const cost = i.ing ? itemCost(i, priceMult(list.store)) : 0;
  return h('div.li' + (finished ? '.done' : ''), {},
    h('input', { type: 'checkbox', checked: !!i.checked, 'aria-label': `Bought ${i.name}`, onchange: (e) => mutate(list.id, (l) => { const it = l.items.find((x) => x.key === i.key); it.checked = e.target.checked; }) }),
    h('div.nm', {}, h('b', {}, i.name), i.recipes?.length ? h('div.tiny.muted', {}, 'for ' + i.recipes.slice(0, 2).join(', ') + (i.recipes.length > 2 ? ` +${i.recipes.length - 2}` : '')) : null,
      h('div.row', { style: { gap: '6px', marginTop: '4px' } },
        i.ing ? h('button.chip.sm' + (i.have ? '.on' : ''), { 'aria-pressed': String(!!i.have), onclick: () => mutate(list.id, (l) => { const it = l.items.find((x) => x.key === i.key); it.have = !it.have; }) }, i.have ? '✓ Have it' : 'I have this') : null,
        i.ing ? h('button.chip.sm', { onclick: () => editQty(list, i, sys) }, '✎ Qty') : null,
        store.search ? h('a.chip.sm', { href: store.search(i.name), target: '_blank', rel: 'noopener', 'aria-label': `Find ${i.name} at ${store.name}`, style: { textDecoration: 'none' } }, '🔗 Find') : null,
        i.manual ? h('button.chip.sm', { 'aria-label': 'Remove item', onclick: () => mutate(list.id, (l) => (l.items = l.items.filter((x) => x.key !== i.key))) }, '✕') : null)),
    h('div.amt', {}, h('div.bold', {}, d.amount), d.buy ? h('small', {}, d.buy) : null, d.pantryNote ? h('small', {}, d.pantryNote) : null, i.ing && !i.have && cost ? h('small', {}, '≈ ' + money(cost)) : null));
}

function editQty(list, i, sys) {
  const ing = INGREDIENTS[i.ing]; const cur = i.qtyOverride ?? i.need;
  let val = toDisplayNum(ing, cur, sys);
  modal({ title: `Adjust ${i.name}`, body: h('div.stack', {}, h('p.small.muted', {}, `Plan needs ${describeItem({ ...i, qtyOverride: null }, sys).amount}. Change the amount you want on this list.`),
    field(`Quantity (${unitLabel(ing, sys)})`, h('input', { type: 'number', min: 0, step: 'any', value: val, autofocus: true, oninput: (e) => (val = parseFloat(e.target.value)) })), h('p.tiny.muted', {}, `Sold in ${fmtPack(ing, sys)}s — FOODIE rounds up to whole packs.`)),
    actions: [{ label: 'Reset to plan', onClick: () => mutate(list.id, (l) => { l.items.find((x) => x.key === i.key).qtyOverride = null; }) }, { label: 'Save', primary: true, onClick: () => { if (!(val >= 0)) { toast('Enter a number'); return false; } mutate(list.id, (l) => { l.items.find((x) => x.key === i.key).qtyOverride = fromDisplayNum(ing, val, sys); }); } }] });
}

function finishShopping(list) {
  const items = list.items.filter((i) => i.checked && i.ing && !i.have && !i.stocked && packsFor(INGREDIENTS[i.ing], buyQty(i)) > 0);
  if (!items.length) { toast('Check off the items you bought first'); return; }
  commit((s) => {
    const l = s.lists.find((x) => x.id === list.id);
    items.forEach((i) => { const ing = INGREDIENTS[i.ing]; const it = l.items.find((x) => x.key === i.key); const packs = packsFor(ing, buyQty(i)); addPantry(s, i.ing, packs * ing.pack); it.stocked = true; });
    l.finishedAt = Date.now(); l.estSpent = listStats(l).total;
  });
  toast(`Added ${items.length} item${items.length > 1 ? 's' : ''} to your pantry. Cooking will use them up.`, { action: { label: 'View pantry', fn: () => go('#/pantry') } });
}

function listMenu(list, plan) {
  const m = modal({ title: list.name, body: h('div.stack.sm', {},
    h('button.btn.ghost.block', { onclick: () => { m.close(); rename(list); } }, '✏️ Rename list'),
    h('button.btn.ghost.block', { onclick: () => { m.close(); newBlank(); } }, '＋ New blank list'),
    activePlan() ? h('button.btn.ghost.block', { onclick: () => { m.close(); commit((s) => { const l = newList(activePlan(), s); s.lists.unshift(l); s.activeListId = l.id; }); toast('New list created from your plan'); } }, '🗓 New list from active plan') : null,
    h('button.btn.ghost.block', { onclick: () => { m.close(); mutate(list.id, (l) => l.items.forEach((i) => { i.checked = false; i.stocked = false; })); } }, '↺ Uncheck everything'),
    h('button.btn.danger.block', { onclick: async () => { m.close(); if (await confirmDialog(`Delete “${list.name}”?`, { okLabel: 'Delete', danger: true })) commit((s) => { s.lists = s.lists.filter((l) => l.id !== list.id); s.activeListId = s.lists[0]?.id || null; }); } }, '🗑 Delete list')) });
}
function rename(list) { let name = list.name; modal({ title: 'Rename list', body: field('Name', h('input', { type: 'text', value: name, autofocus: true, oninput: (e) => (name = e.target.value) })), actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => mutate(list.id, (l) => (l.name = name.trim() || l.name)) }] }); }
function newBlank() { commit((s) => { const l = { id: uid('list'), name: 'Shopping list', planId: null, createdAt: Date.now(), store: s.profile.store, items: [] }; s.lists.unshift(l); s.activeListId = l.id; }); }

function emptyState() {
  const plan = activePlan();
  return h('div.view.stack', {}, h('div.page-head', {}, h('div', {}, h('h1', {}, 'Grocery list'), h('p', {}, 'Your shopping list is built automatically from your meal plan.'))),
    h('div.card.empty', {}, h('div.big', {}, '🛒'), h('h3', {}, 'No grocery list yet'), h('p', {}, 'Plan some meals and FOODIE will combine every ingredient, subtract what\'s in your pantry and organize it by aisle.'),
      h('div.row', { style: { justifyContent: 'center' } }, plan ? h('button.btn.primary', { onclick: () => { commit((s) => { const l = newList(plan, s); s.lists.unshift(l); s.activeListId = l.id; }); } }, 'Create from my plan') : h('a.btn.primary', { href: '#/planner' }, 'Plan my meals'), h('button.btn.ghost', { onclick: newBlank }, 'Start a blank list'))));
}

function listPDF(list, stats) {
  const sys = state.profile.units;
  const pdf = new PDF({ footer: `${list.name} · FOODIE · estimates are not live prices` });
  pdf.title(list.name, `${list.items.length} items · ${stats.store.name} · estimated ${money(stats.total)} · ${fmtDay(today(), { month: 'long', day: 'numeric', year: 'numeric' })}`);
  for (const [aisle, items] of groupByAisle(list.items)) {
    pdf.h2(aisle);
    items.forEach((i) => { const d = describeItem(i, sys); pdf.checkRow(i.name, d.amount, { checked: i.checked || i.have, note: i.have ? 'have it' : '' }); });
  }
  pdf.gap(14); pdf.p('Cost figures are planning estimates from average US prices adjusted for store price level — not live store prices.', { size: 8.5, color: [0.5, 0.55, 0.5] });
  download(`${list.name.replace(/\W+/g, '-')}.pdf`, pdf.build(), 'application/pdf'); toast('PDF downloaded');
}

async function shareList(list) {
  const sys = state.profile.units; const text = listToText(list, sys, { includeChecked: false });
  const url = await shareLink('list', { name: list.name, store: list.store, items: list.items.map(({ key, ing, name, aisle, need, qtyOverride, manual, custom, text, qtyText, recipes }) => ({ key, ing, name, aisle, need, qtyOverride, manual, custom, text, qtyText, recipes })) });
  modal({ title: 'Share list', body: h('div.stack', {}, h('p.small.muted', {}, 'Send the plain-text checklist to anyone, or a FOODIE link that imports as an editable list.'), h('textarea', { readonly: true, rows: 7, onfocus: (e) => e.target.select() }, text),
    h('div.row', {}, h('button.btn.primary', { onclick: () => shareOrCopy({ title: list.name, text }) }, 'Share text'), h('a.btn.ghost', { href: smsHref(text) }, 'Text message'), h('a.btn.ghost', { href: mailtoHref(list.name, text) }, 'Email'), h('button.btn.ghost', { onclick: () => shareOrCopy({ title: list.name, text: 'Import this list into FOODIE:', url }) }, 'FOODIE link'))) });
}

/** Chains actually found near the user (from OpenStreetMap): one tap to shop there. */
function nearbyStores(list, mutate) {
  const near = [...nearbyChains().entries()].slice(0, 6); if (!near.length) return null;
  return h('div.stack.sm', {}, h('div.eyebrow', {}, 'Stores near you'), h('div.chips', {}, near.map(([chain, pl]) => { const st = STORES.find((x) => x.id === chain); if (!st) return null;
    return h('button.chip.sm' + (list.store === chain ? '.on' : ''), { type: 'button', onclick: () => mutate(list.id, (l) => (l.store = chain)) }, st.name.split(' (')[0], pl.distance != null ? h('span.tiny', {}, ' · ' + fmtDist(pl.distance)) : null); })));
}
