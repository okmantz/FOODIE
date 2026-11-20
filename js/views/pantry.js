/** Pantry & ingredient inventory with expiry tracking and cook-from-pantry suggestions. */
import { h, modal, toast, confirmDialog, today, diffDays, fmtDay, uid } from '../lib/util.js';
import { state, commit } from '../store.js';
import { field, recipeCard, sectionHead, notice } from '../ui.js';
import { INGREDIENTS, ingredientList, AISLE_ORDER } from '../data/ingredients.js';
import { fmtQty, unitLabel, toDisplayNum, fromDisplayNum } from '../lib/units.js';
import { suggest, expiringSoon } from '../engines/coach.js';
import { addPantry } from '../actions.js';

export function renderPantry() {
  const sys = state.profile.units; const t = today();
  const byName = new Map(ingredientList().map((i) => [i.name.toLowerCase(), i]));
  let nm = '', amt = '', exp = '';
  const unitHint = h('span.tiny.muted', {}, '');
  const form = h('form.card.stack', { onsubmit: (e) => {
    e.preventDefault();
    const ing = byName.get(nm.trim().toLowerCase());
    if (!nm.trim()) return toast('Type an ingredient name');
    if (ing) {
      const n = parseFloat(amt.replace(',', '.')); if (!(n > 0)) return toast('Enter how much you have');
      commit((s) => addPantry(s, ing.id, fromDisplayNum(ing, n, sys), exp || null));
    } else commit((s) => s.pantry.push({ id: uid('p'), name: nm.trim(), qtyText: amt.trim(), expires: exp || null, custom: true }));
    toast(`Added ${nm.trim()}`); nm = amt = exp = ''; e.target.reset();
  } },
    h('h3', {}, 'Add to pantry'),
    h('datalist#pantry-names', {}, ingredientList().map((i) => h('option', { value: i.name }))),
    h('div.grid.c3', {}, field('Ingredient', h('input', { type: 'text', list: 'pantry-names', placeholder: 'e.g. Chicken breast', oninput: (e) => { nm = e.target.value; const i = byName.get(nm.trim().toLowerCase()); unitHint.textContent = i ? `in ${unitLabel(i, sys)}` : nm ? 'any text' : ''; } })),
      field('Amount', h('div.row.nowrap', {}, h('input', { type: 'text', inputmode: 'decimal', placeholder: 'e.g. 16', oninput: (e) => (amt = e.target.value) }), unitHint)),
      field('Best before (optional)', h('input', { type: 'date', oninput: (e) => (exp = e.target.value) }))),
    h('div.row', {}, h('button.btn.primary', { type: 'submit' }, 'Add item'), h('span.small.muted', {}, 'Items you buy via your grocery list can be added automatically.')));

  const items = [...state.pantry].sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'));
  const expiring = expiringSoon(3);
  const groups = new Map();
  for (const p of items) { const aisle = p.ing ? INGREDIENTS[p.ing]?.aisle || 'Other' : 'Other'; if (!groups.has(aisle)) groups.set(aisle, []); groups.get(aisle).push(p); }

  const row = (p) => {
    const ing = p.ing ? INGREDIENTS[p.ing] : null; if (p.ing && !ing) return null;
    const d = p.expires ? diffDays(t, p.expires) : null;
    const badge = d == null ? null : d < 0 ? h('span.badge.bad', {}, 'Expired') : d <= 3 ? h('span.badge.warn', {}, d === 0 ? 'Use today' : `${d}d left`) : h('span.badge', {}, 'Best by ' + fmtDay(p.expires));
    return h('div.li', {}, h('div.nm', {}, h('b', {}, ing ? ing.name : p.name), h('div.row', { style: { gap: '6px', marginTop: '2px' } }, badge, p.staple ? h('span.badge', {}, 'Staple') : null)),
      h('div.amt', {}, h('div.bold', {}, ing ? fmtQty(ing, p.qty, sys) : p.qtyText || '')),
      h('div.row.nowrap', { style: { gap: '2px' } }, ing ? h('button.icon-btn', { 'aria-label': `Edit ${ing.name}`, onclick: () => edit(p, ing, sys) }, '✎') : null, h('button.icon-btn', { 'aria-label': `Remove ${ing ? ing.name : p.name}`, onclick: () => { commit((s) => { s.pantry = s.pantry.filter((x) => x.id !== p.id); }); toast('Removed', { action: { label: 'Undo', fn: () => commit((s) => s.pantry.push(p)) } }); } }, '✕')));
  };

  const ideas = suggest({ pantry: true, types: ['breakfast', 'lunch', 'dinner'] }, 6);

  return h('div.view.stack.lg', {},
    h('div.page-head', {}, h('div', {}, h('h1', {}, 'Pantry'), h('p', {}, 'What you already have — FOODIE subtracts it from grocery lists, favors recipes that use it, and flags what\'s about to expire.'))),
    expiring.length ? notice('warn', h('span', {}, '⏳'), h('span', {}, h('b', {}, `${expiring.length} item${expiring.length > 1 ? 's' : ''} expiring within 3 days: `), expiring.map((e) => (e.ing ? INGREDIENTS[e.ing]?.name : e.name)).join(', '), '. See the ideas below.')) : null,
    h('div.split', {}, h('div.stack', {},
      items.length ? [...groups].sort((a, b) => AISLE_ORDER.indexOf(a[0]) - AISLE_ORDER.indexOf(b[0])).map(([aisle, ps]) => h('section', {}, h('h4.eyebrow', { style: { margin: '8px 0 6px' } }, aisle), h('div.card.flat', { style: { padding: '4px 14px' } }, ps.map(row)))) : h('div.card.empty', {}, h('div.big', {}, '🥫'), h('h3', {}, 'Your pantry is empty'), h('p', {}, 'Add what you have, or shop from a grocery list and tap “Finish shopping”.')),
      items.length ? h('button.btn.ghost.sm', { style: { alignSelf: 'flex-start' }, onclick: async () => { if (await confirmDialog('Remove every pantry item?', { okLabel: 'Clear all', danger: true })) commit((s) => { s.pantry = []; }); } }, 'Clear pantry') : null),
      h('div.stack', {}, form)),
    ideas.length ? h('section', {}, sectionHead('Cook from your pantry', null, 'Ranked by how much of each recipe you already have, with expiring items first'),
      h('div.grid.c3', {}, ideas.map((x) => recipeCard(x.r, { note: `${Math.round(x.cov * 100)}% of ingredients on hand` })))) : null);
}

function edit(p, ing, sys) {
  let val = toDisplayNum(ing, p.qty, sys), exp = p.expires || '';
  modal({ title: `Edit ${ing.name}`, body: h('div.stack', {}, field(`Amount (${unitLabel(ing, sys)})`, h('input', { type: 'number', step: 'any', min: 0, value: val, autofocus: true, oninput: (e) => (val = parseFloat(e.target.value)) })), field('Best before', h('input', { type: 'date', value: exp, oninput: (e) => (exp = e.target.value) }))),
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => { if (!(val >= 0)) { toast('Enter a number'); return false; } commit((s) => { const x = s.pantry.find((q) => q.id === p.id); x.qty = fromDisplayNum(ing, val, sys); x.expires = exp || null; }); } }] });
}
