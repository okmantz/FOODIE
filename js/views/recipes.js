/** Recipe library, detail page and recipe editor. */
import { h, modal, toast, confirmDialog, download, uid, debounce, money, fmtMins, printHTML, esc, imageToDataURL, today, fmtDay, cap, round } from '../lib/util.js';
import { state, commit, allRecipes, recipeById, isFav, meta, activeList } from '../store.js';
import { thumb, photoCredit, recipeCard, chipGroup, seg, field, go, coachNotes, starInput, stars, toggleFavRecipe, addToPlanDialog, nutritionBar, sectionHead, dietBadges, notice } from '../ui.js';
import { DIETS, CUISINES, TYPE_LABEL, DIET_LABEL, ALLERGEN_LABEL, enrich, scale } from '../engines/nutrition.js';
import { INGREDIENTS, ingredientList, ALLERGENS } from '../data/ingredients.js';
import { fmtQty, unitLabel, toDisplayNum, fromDisplayNum } from '../lib/units.js';
import { violations, eligible } from '../engines/planner.js';
import { pantryTotals, addRecipeToList, packsFor } from '../engines/grocery.js';
import { storeById, priceMult } from '../data/stores.js';
import { logCooked } from '../actions.js';
import { shareLink, shareOrCopy, mailtoHref } from '../lib/share.js';
import { PDF } from '../lib/pdf.js';
import { learnFromRecipe } from '../engines/taste.js';
import { handleImport } from './importer.js';

const lib = { q: '', type: 'all', cuisine: 'all', diets: [], easy: false, favs: false, mine: false, fit: true, sort: 'rec', shown: 24 };

/* ====================================================================== library */
export function renderRecipes() {
  const p = state.profile;
  const hasRestrictions = p.allergies.length || p.diets.length || p.dislikes.length;
  const root = h('div.view.stack');
  const grid = h('div.grid.c3'); const count = h('span.muted.small');
  const apply = () => {
    let list = allRecipes();
    const needle = lib.q.trim().toLowerCase();
    if (needle) list = list.filter((r) => (r.n + ' ' + r.c + ' ' + TYPE_LABEL[r.t] + ' ' + r.i.map(([i]) => INGREDIENTS[i]?.name || i).join(' ')).toLowerCase().includes(needle));
    if (lib.type !== 'all') list = list.filter((r) => r.t === lib.type);
    if (lib.cuisine !== 'all') list = list.filter((r) => r.c === lib.cuisine);
    if (lib.diets.length) list = list.filter((r) => lib.diets.every((d) => r.d.diets[d]));
    if (lib.easy) list = list.filter((r) => r.d.easy);
    if (lib.favs) list = list.filter((r) => isFav(r.id));
    if (lib.mine) list = list.filter((r) => r.custom);
    if (lib.fit && hasRestrictions) list = list.filter((r) => !state.dislikedRecipes.includes(r.id) && violations(r, p, p.diets).length === 0);
    const by = { rec: (a, b) => score(b) - score(a), quick: (a, b) => a.d.time - b.d.time, cheap: (a, b) => a.d.cost - b.d.cost, protein: (a, b) => b.d.nut.pro - a.d.nut.pro, cal: (a, b) => a.d.nut.kcal - b.d.nut.kcal, az: (a, b) => a.n.localeCompare(b.n) };
    list = [...list].sort(by[lib.sort]);
    count.textContent = `${list.length} recipe${list.length === 1 ? '' : 's'}`;
    grid.replaceChildren(...list.slice(0, lib.shown).map((r) => recipeCard(r)));
    if (!list.length) grid.replaceChildren(h('div.empty', { style: { gridColumn: '1/-1' } }, h('div.big', {}, '🔎'), h('h3', {}, 'No recipes match'), h('p', {}, 'Try removing a filter' + (lib.fit && hasRestrictions ? ' or turn off “Fits my profile”.' : '.'))));
    if (list.length > lib.shown) grid.append(h('div', { style: { gridColumn: '1/-1', textAlign: 'center' } }, h('button.btn.ghost', { onclick: () => { lib.shown += 24; apply(); } }, `Show more (${list.length - lib.shown} left)`)));
  };
  const score = (r) => (isFav(r.id) ? 3 : 0) + (meta(r.id).rating || 0) + (p.favCuisines.includes(r.c) ? 2 : 0) + (state.taste.cuisine[r.c] || 0) * 0.2 + (r.custom ? 1 : 0);
  const reset = debounce(() => { lib.shown = 24; apply(); }, 100);

  root.append(
    h('div.page-head', {}, h('div', {}, h('h1', {}, 'Recipes'), h('p', {}, 'Cook something great — every recipe has live-calculated nutrition, cost and allergen info.')),
      h('div.row', {}, h('button.btn.ghost', { onclick: importDialog }, 'Import'), h('a.btn.primary', { href: '#/recipe/new' }, '＋ Create recipe'))),
    h('div.search', {}, h('input', { type: 'search', placeholder: 'Search by name, cuisine or ingredient…', 'aria-label': 'Search recipes', value: lib.q, oninput: (e) => { lib.q = e.target.value; reset(); } })),
    h('div.chips.scroll', {}, [{ id: 'all', label: 'All' }, ...Object.entries(TYPE_LABEL).map(([id, label]) => ({ id, label }))].map((o) => h('button.chip' + (lib.type === o.id ? '.on' : ''), { onclick: (e) => { lib.type = o.id; [...e.target.parentNode.children].forEach((c) => c.classList.remove('on')); e.target.classList.add('on'); lib.shown = 24; apply(); } }, o.label))),
    h('details.card.flat', { style: { padding: '12px 16px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 650 } }, 'Filters & sorting'),
      h('div.stack', { style: { marginTop: '14px' } },
        h('div.grid.c2', {}, field('Cuisine', h('select', { onchange: (e) => { lib.cuisine = e.target.value; lib.shown = 24; apply(); } }, h('option', { value: 'all' }, 'All cuisines'), CUISINES.map((c) => h('option', { value: c, selected: lib.cuisine === c }, c)))),
          field('Sort by', h('select', { onchange: (e) => { lib.sort = e.target.value; apply(); } }, [['rec', 'Recommended'], ['quick', 'Quickest'], ['cheap', 'Lowest cost'], ['protein', 'Most protein'], ['cal', 'Fewest calories'], ['az', 'A–Z']].map(([v, l]) => h('option', { value: v, selected: lib.sort === v }, l))))),
        h('div.field', {}, h('label', {}, 'Dietary'), chipGroup({ options: DIETS.map((d) => ({ id: d.id, label: d.label, icon: d.icon })), value: lib.diets, onChange: (v) => { lib.diets = v; lib.shown = 24; apply(); }, small: true })),
        h('div.chips', {}, toggleChip('Easy (≤ 30 min)', 'easy', apply), toggleChip('♥ Favorites', 'favs', apply), toggleChip('My recipes', 'mine', apply), hasRestrictions ? toggleChip('Fits my profile', 'fit', apply) : null))),
    count, grid);
  apply();
  return root;
}
const toggleChip = (label, key, apply) => h('button.chip.sm' + (lib[key] ? '.on' : ''), { 'aria-pressed': String(lib[key]), onclick: (e) => { lib[key] = !lib[key]; e.currentTarget.classList.toggle('on', lib[key]); e.currentTarget.setAttribute('aria-pressed', String(lib[key])); lib.shown = 24; apply(); } }, label);

function importDialog() {
  let val = '';
  modal({ title: 'Import a shared recipe', body: h('div.stack', {}, h('p.small.muted', {}, 'Paste a FOODIE share link (or just the code after “#/import/”).'), h('textarea', { rows: 4, placeholder: 'https://…#/import/…', oninput: (e) => (val = e.target.value) })),
    actions: [{ label: 'Cancel' }, { label: 'Import', primary: true, onClick: () => { const m = val.match(/#\/import\/([^\s]+)/); const code = m ? m[1] : val.trim(); if (!code) { toast('Paste a link first'); return false; } handleImport(code); } }] });
}

/* ====================================================================== detail */
export function renderRecipe(id) {
  const r = recipeById(id);
  if (!r) return h('div.view.empty', {}, h('div.big', {}, '🤷'), h('h3', {}, 'Recipe not found'), h('a.btn.primary', { href: '#/recipes' }, 'Browse recipes'));
  const p = state.profile; const mult = priceMult(p.store); const sys = p.units;
  const m = meta(r.id);
  let servings = r.s <= 12 ? (p.household || r.s) : r.s;
  const f = () => scale(r, servings);
  const pan = pantryTotals(state.pantry);
  const ingBox = h('div'); const factBox = h('div');
  const paintIng = () => {
    ingBox.replaceChildren(h('ul.ing-list', {}, r.i.map(([iid, q]) => {
      if (iid.startsWith('~')) return h('li', {}, h('span', {}, iid.slice(1)), h('span.q', {}, String(q)));
      const ing = INGREDIENTS[iid]; if (!ing) return null;
      const need = q * f(); const have = (pan.get(iid) || 0) >= need * 0.999; const part = !have && (pan.get(iid) || 0) > 0;
      return h('li', {}, h('span', {}, ing.name, ' ', have ? h('span.badge.green', {}, '✓ in pantry') : part ? h('span.badge.warn', {}, 'some in pantry') : null), h('span.q', {}, fmtQty(ing, need, sys)));
    })));
    factBox.replaceChildren(h('div.facts', {}, fact(fmtMins(r.d.time), 'Total time'), fact(servings, 'Servings'), fact(Math.round(r.d.nut.kcal), 'kcal / serving'), fact(money(r.d.cost * mult), 'Cost / serving'), fact(money(r.d.cost * mult * servings, 2), 'Est. total')));
  };
  const svEl = h('b', { style: { minWidth: '22px', textAlign: 'center' } }, String(servings));
  const bump = (d) => { servings = Math.max(1, Math.min(48, servings + d)); svEl.textContent = servings; paintIng(); };
  const stepper = h('div.row', { style: { gap: '4px' } }, h('button.icon-btn', { 'aria-label': 'Fewer servings', onclick: () => bump(-1) }, '−'), svEl, h('button.icon-btn', { 'aria-label': 'More servings', onclick: () => bump(1) }, '+'));
  paintIng();

  const n = r.d.nut; const goalCal = +p.calories;
  const share = (kind) => ({ pdf: () => recipePDF(r, servings), print: () => printRecipe(r, servings), link: () => shareRecipe(r) }[kind])();
  const root = h('div.view.stack.lg', {},
    h('a.link.small', { href: '#/recipes' }, '← All recipes'),
    h('div.r-hero', {}, h('div.stack.sm', {}, thumb(r, 'hero'), photoCredit(r)),
      h('div.stack', {}, h('span.eyebrow', {}, `${r.c} · ${TYPE_LABEL[r.t]}${r.custom ? ' · My recipe' : ''}`), h('h1', {}, r.n),
        h('div.row', {}, m.rating ? stars(m.rating) : h('span.small.muted', {}, 'Not rated yet'), m.cooked ? h('span.badge', {}, `Cooked ${m.cooked}×`) : null, ...dietBadges(r, 4)),
        h('div', {}, factBox),
        h('div.row', {}, h('button.btn.primary', { onclick: () => addToPlanDialog(r.id) }, '🗓 Add to plan'), h('button.btn.ghost', { 'aria-pressed': String(isFav(r.id)), onclick: (e) => { toggleFavRecipe(r.id); } }, isFav(r.id) ? '♥ Saved' : '♡ Save'),
          h('button.btn.ghost', { onclick: () => { logCooked(r.id); } }, '✓ I cooked this'), h('button.btn.ghost', { onclick: () => actionsMenu(r, servings) }, 'More ⋯')))),
    p.coachOn ? h('section.card.soft.stack.sm', {}, h('div.row', { style: { gap: '10px' } }, h('img', { src: 'assets/coach-sm.png', alt: '', width: 36, height: 36, style: { borderRadius: '50%' } }), h('b', {}, 'Coach check')), coachNotes(r), h('p.tiny.muted', { style: { margin: 0 } }, 'Heads-ups only — you decide what goes on your plate.')) : null,
    r.d.unverified ? notice('warn', h('span', {}, '⚠️'), h('span', {}, 'This recipe includes custom ingredients that FOODIE can\'t look up, so nutrition, cost and allergen info only cover the recognized ingredients.')) : null,
    h('div.split', {},
      h('div.stack.lg', {},
        h('section.card', {}, h('div.row.between', {}, h('h3', {}, 'Ingredients'), h('div.row', { style: { gap: '4px' } }, h('span.small.muted', {}, 'Servings'), stepper)), ingBox,
          h('div.row', { style: { marginTop: '12px' } }, h('button.btn.ghost.sm', { onclick: () => addToList(r, servings) }, '🛒 Add to grocery list'), h('span.tiny.muted', {}, 'Pantry items are accounted for.'))),
        h('section.card', {}, h('h3', {}, 'Method'), h('ol.steps-ol', { style: { marginTop: '12px' } }, r.st.map((s) => h('li', {}, h('span', {}, s)))), r.tip ? h('div.notice.good', { style: { marginTop: '14px' } }, h('span', {}, '💡'), h('span', {}, r.tip)) : null)),
      h('div.stack.lg', {},
        h('section.card.stack', {}, h('h3', {}, 'Nutrition per serving'), h('div.facts', {}, fact(Math.round(n.kcal), 'Calories'), fact(Math.round(n.pro) + ' g', 'Protein'), fact(Math.round(n.carb) + ' g', 'Carbs'), fact(Math.round(n.fat) + ' g', 'Fat'), fact(Math.round(n.fiber) + ' g', 'Fiber')), nutritionBar(n),
          goalCal ? h('p.small.muted', { style: { margin: 0 } }, `${Math.round(n.kcal / goalCal * 100)}% of your ${goalCal} kcal daily goal.`) : null,
          h('p.tiny.muted', { style: { margin: 0 } }, r.d.manualNutrition ? 'Nutrition entered by the recipe author.' : 'Calculated from average ingredient data (USDA-style typical values) — an estimate, not a lab analysis.')),
        h('section.card.stack.sm', {}, h('h3', {}, 'Allergens & diets'), r.d.allergens.length ? h('div.row', {}, h('span.small.muted', {}, 'Contains:'), ...r.d.allergens.map((a) => h('span.badge.warn', {}, ALLERGEN_LABEL[a]))) : h('p.small.muted', { style: { margin: 0 } }, 'No major allergens detected in the listed ingredients.'),
          h('div.chips', {}, DIETS.filter((d) => r.d.diets[d.id]).map((d) => h('span.badge.green', {}, `${d.icon} ${d.label}`))), h('p.tiny.muted', { style: { margin: 0 } }, 'Always read packaging labels if you have a medical allergy; brands vary.')),
        h('section.card.stack', {}, h('h3', {}, 'Your notes'), h('div.row', {}, h('span.small', {}, 'Rating'), starInput(m.rating || 0, (v) => { commit((s) => { const mm = s.recipeMeta[r.id] || (s.recipeMeta[r.id] = {}); const prev = mm.rating || 0; mm.rating = v || undefined; if (v >= 4 && prev < 4) learnFromRecipe(s, r, 1); if (v && v <= 2 && prev > 2) learnFromRecipe(s, r, -1.5); }, { silent: true }); })),
          field('Review', h('textarea', { rows: 2, placeholder: 'How did it turn out?', value: m.review || '', onchange: (e) => commit((s) => { (s.recipeMeta[r.id] || (s.recipeMeta[r.id] = {})).review = e.target.value; }, { silent: true }) })),
          field('Personal notes', h('textarea', { rows: 3, placeholder: 'Swaps, tweaks, family feedback…', value: m.notes || '', onchange: (e) => commit((s) => { (s.recipeMeta[r.id] || (s.recipeMeta[r.id] = {})).notes = e.target.value; toast('Notes saved'); }, { silent: true }) })),
          m.last ? h('p.tiny.muted', { style: { margin: 0 } }, `Last cooked ${fmtDay(m.last, { month: 'long', day: 'numeric', year: 'numeric' })}`) : null))));
  return root;
}
const fact = (v, l) => h('div', {}, h('b', {}, String(v)), h('span', {}, l));

function actionsMenu(r, servings) {
  const mm = modal({ title: r.n, body: h('div.stack.sm', {},
    h('button.btn.ghost.block', { onclick: () => { mm.close(); shareRecipe(r); } }, '📤 Share recipe link'),
    h('button.btn.ghost.block', { onclick: () => { mm.close(); recipePDF(r, servings); } }, '⬇ Download PDF'),
    h('button.btn.ghost.block', { onclick: () => { mm.close(); printRecipe(r, servings); } }, '🖨 Print'),
    r.custom ? h('a.btn.ghost.block', { href: `#/recipe/${r.id}/edit`, onclick: () => mm.close() }, '✏️ Edit recipe') : h('button.btn.ghost.block', { onclick: () => { mm.close(); const copy = cloneForEdit(r); commit((s) => s.customRecipes.unshift(copy)); toast('Created your own editable copy'); go(`#/recipe/${copy.id}/edit`); } }, '✏️ Make my own copy to edit'),
    h('button.btn.ghost.block', { onclick: () => { mm.close(); dislike(r); } }, state.dislikedRecipes.includes(r.id) ? '👍 Stop hiding this recipe' : '👎 Not for me — hide from plans'),
    r.custom ? h('button.btn.danger.block', { onclick: async () => { mm.close(); if (await confirmDialog(`Delete “${r.n}”? This can't be undone.`, { okLabel: 'Delete', danger: true })) { commit((s) => { s.customRecipes = s.customRecipes.filter((x) => x.id !== r.id); s.favorites.recipes = s.favorites.recipes.filter((x) => x !== r.id); }); toast('Recipe deleted'); go('#/recipes'); } } }, '🗑 Delete recipe') : null) });
}

function dislike(r) {
  commit((s) => { const i = s.dislikedRecipes.indexOf(r.id); if (i >= 0) s.dislikedRecipes.splice(i, 1); else { s.dislikedRecipes.push(r.id); learnFromRecipe(s, r, -1.5); } });
  toast(state.dislikedRecipes.includes(r.id) ? 'Hidden from future plans & suggestions' : 'Recipe restored');
}

function cloneForEdit(r) { return { id: uid('r'), n: r.n + ' (my version)', c: r.c, t: r.t, e: r.e, p: r.p, k: r.k, s: r.s, i: r.i.map((x) => [...x]), st: [...r.st], tip: r.tip, sl: r.sl, se: r.se, custom: true, updated: Date.now() }; }

function addToList(r, servings) {
  const list = activeList();
  if (!list) { toast('Create a plan or grocery list first', { action: { label: 'Plan meals', fn: () => go('#/planner') } }); return; }
  commit((s) => { const l = s.lists.find((x) => x.id === list.id); addRecipeToList(s, l, r, servings); });
  toast(`Added ingredients to “${list.name}”`, { action: { label: 'View list', fn: () => go('#/grocery') } });
}

async function shareRecipe(r) {
  const raw = { id: r.id, n: r.n, c: r.c, t: r.t, e: r.e, p: r.p, k: r.k, s: r.s, i: r.i, st: r.st, tip: r.tip, sl: r.sl, se: r.se, nut: r.nut, costPer: r.costPer, allergens: r.allergens, photo: r.photo && r.photo.length < 60000 ? r.photo : undefined };
  const url = await shareLink('recipe', raw);
  modal({ title: 'Share recipe', body: h('div.stack', {}, h('p.small.muted', {}, 'Anyone who opens this link in FOODIE can save their own copy. No account needed.'), h('textarea', { readonly: true, rows: 3, onfocus: (e) => e.target.select() }, url),
    h('div.row', {}, h('button.btn.primary', { onclick: () => shareOrCopy({ title: r.n, text: `${r.n} — a recipe on FOODIE`, url }) }, 'Share / copy'), h('a.btn.ghost', { href: mailtoHref(r.n, `${r.n}\n\n${url}`) }, 'Email'))) });
}

function recipePDF(r, servings) {
  const sys = state.profile.units; const f = scale(r, servings);
  const pdf = new PDF({ footer: `${r.n} · FOODIE` });
  pdf.title(r.n, `${r.c} · ${TYPE_LABEL[r.t]} · ${fmtMins(r.d.time)} · serves ${servings}`);
  pdf.p(`Per serving: ${Math.round(r.d.nut.kcal)} kcal · ${Math.round(r.d.nut.pro)} g protein · ${Math.round(r.d.nut.carb)} g carbs · ${Math.round(r.d.nut.fat)} g fat   |   Est. cost $${(r.d.cost * priceMult(state.profile.store)).toFixed(2)} per serving`, { size: 9.5, color: [0.4, 0.45, 0.4] });
  if (r.d.allergens.length) pdf.p('Contains: ' + r.d.allergens.map((a) => ALLERGEN_LABEL[a]).join(', '), { size: 9.5, font: 'b', color: [0.6, 0.35, 0.05] });
  pdf.h2('Ingredients');
  r.i.forEach(([i, q]) => { const ing = INGREDIENTS[i]; pdf.checkRow(ing ? ing.name : i.slice(1), ing ? fmtQty(ing, q * f, sys) : String(q)); });
  pdf.h2('Method');
  r.st.forEach((s, i) => pdf.p(`${i + 1}.  ${s}`, { size: 11, indent: 4, gap: 5 }));
  if (r.tip) { pdf.gap(6); pdf.p('Tip: ' + r.tip, { font: 'b', size: 10, color: [0.2, 0.45, 0.12] }); }
  download(`${r.n.replace(/\W+/g, '-')}.pdf`, pdf.build(), 'application/pdf'); toast('PDF downloaded');
}

function printRecipe(r, servings) {
  const sys = state.profile.units; const f = scale(r, servings);
  printHTML(r.n, `<h1>${esc(r.n)}</h1><div class="meta">${esc(r.c)} · ${fmtMins(r.d.time)} · serves ${servings} · ${Math.round(r.d.nut.kcal)} kcal per serving</div><h2>Ingredients</h2><ul>${r.i.map(([i, q]) => { const ing = INGREDIENTS[i]; return `<li><span class="box"></span><span>${esc(ing ? ing.name : i.slice(1))}</span><span class="q">${ing ? fmtQty(ing, q * f, sys) : esc(String(q))}</span></li>`; }).join('')}</ul><h2>Method</h2><ol>${r.st.map((s) => `<li style="display:list-item;border:0">${esc(s)}</li>`).join('')}</ol>${r.tip ? `<p><b>Tip:</b> ${esc(r.tip)}</p>` : ''}`);
}

/* ====================================================================== editor */
export function renderRecipeEditor(id) {
  const existing = id ? recipeById(id) : null;
  if (id && (!existing || !existing.custom)) return h('div.view.empty', {}, h('div.big', {}, '🔒'), h('h3', {}, 'Only your own recipes can be edited'), h('a.btn.primary', { href: `#/recipe/${id}` }, 'Back to recipe'));
  const sys = state.profile.units;
  const d = existing ? { ...existing, i: existing.i.map((x) => [...x]) } : { n: '', c: 'American', t: 'dinner', e: '🍽️', p: 15, k: 20, s: Math.max(2, state.profile.household || 2), i: [], st: [], tip: '', photo: null, allergens: [], se: ['spring', 'summer', 'autumn', 'winter'], nut: null, costPer: '' };
  const rows = d.i.length ? d.i.map(([iid, q]) => (INGREDIENTS[iid] ? { name: INGREDIENTS[iid].name, amount: String(toDisplayNum(INGREDIENTS[iid], q, sys)) } : { name: iid.slice(1), amount: String(q) })) : [{ name: '', amount: '' }, { name: '', amount: '' }, { name: '', amount: '' }];
  const byName = new Map(ingredientList().map((i) => [i.name.toLowerCase(), i]));
  const find = (name) => byName.get(name.trim().toLowerCase());
  const rowsBox = h('div'); const dl = h('datalist#ing-names', {}, ingredientList().map((i) => h('option', { value: i.name })));
  const paintRows = () => rowsBox.replaceChildren(...rows.map((row, idx) => {
    const unit = h('span.tiny.muted', { style: { minWidth: '34px' } }, '');
    const setUnit = () => { const ing = find(row.name); unit.textContent = ing ? unitLabel(ing, sys) : row.name ? 'text' : ''; amt.placeholder = ing ? 'qty' : 'e.g. 1 cup'; };
    const nm = h('input', { type: 'text', list: 'ing-names', placeholder: 'Ingredient', 'aria-label': `Ingredient ${idx + 1}`, value: row.name, oninput: (e) => { row.name = e.target.value; setUnit(); } });
    const amt = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': `Amount ${idx + 1}`, value: row.amount, oninput: (e) => (row.amount = e.target.value) });
    setUnit();
    return h('div.ing-row', {}, nm, h('div.row.nowrap', { style: { gap: '4px' } }, amt, unit), h('button.icon-btn', { type: 'button', 'aria-label': 'Remove ingredient', onclick: () => { rows.splice(idx, 1); paintRows(); } }, '✕'));
  }));
  paintRows();
  let photo = d.photo; const photoBox = h('div');
  const paintPhoto = () => photoBox.replaceChildren(photo ? h('div.stack.sm', {}, h('div.thumb.photo.wide', { style: { backgroundImage: `url("${photo}")`, maxWidth: '320px' } }), h('button.btn.ghost.sm', { type: 'button', onclick: () => { photo = null; paintPhoto(); } }, 'Remove photo')) : h('label.dz', {}, 'Add a photo (optional)', h('input', { type: 'file', accept: 'image/*', class: 'sr', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { photo = await imageToDataURL(f, 720, 0.8); paintPhoto(); } catch { toast('Could not read that image'); } } })));
  paintPhoto();
  const emojis = ['🍽️', '🍳', '🥗', '🍝', '🍛', '🍲', '🥘', '🌮', '🍕', '🍔', '🥪', '🍜', '🍣', '🥩', '🍗', '🐟', '🥦', '🍰', '🍪', '🥤', '🍓', '🥑'];
  let adv = { nut: d.nut || { kcal: '', pro: '', carb: '', fat: '' }, costPer: d.costPer ?? '' };

  const save = () => {
    const name = d.n.trim();
    if (!name) return toast('Give your recipe a name');
    const ings = [];
    for (const row of rows) {
      if (!row.name.trim()) continue;
      const ing = find(row.name);
      if (ing) { const n = parseFloat(String(row.amount).replace(',', '.')); if (!(n > 0)) return toast(`Enter a quantity for “${row.name}”`); ings.push([ing.id, round(fromDisplayNum(ing, n, sys), 2)]); }
      else ings.push(['~' + row.name.trim(), row.amount.trim() || 'to taste']);
    }
    if (!ings.length) return toast('Add at least one ingredient');
    const steps = stepsTa.value.split('\n').map((s) => s.trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean);
    if (!steps.length) return toast('Add at least one step');
    const rec = { id: existing?.id || uid('r'), n: name, c: d.c, t: d.t, e: d.e || '🍽️', p: +d.p || 0, k: +d.k || 0, s: Math.max(1, +d.s || 1), i: ings, st: steps, tip: d.tip?.trim() || undefined, photo: photo || undefined, allergens: d.allergens, se: d.se, custom: true, updated: Date.now(),
      nut: adv.nut.kcal !== '' && adv.nut.kcal != null ? adv.nut : undefined, costPer: adv.costPer !== '' ? +adv.costPer : undefined };
    commit((s) => { const i = s.customRecipes.findIndex((x) => x.id === rec.id); if (i >= 0) s.customRecipes[i] = rec; else s.customRecipes.unshift(rec); });
    toast(existing ? 'Recipe updated' : 'Recipe saved — find it under “My recipes”');
    go(`#/recipe/${rec.id}`);
  };
  const stepsTa = h('textarea', { rows: 6, placeholder: 'One step per line', value: d.st.join('\n') });
  stepsTa.value = d.st.join('\n');

  return h('div.view.stack.lg', { style: { maxWidth: '760px', marginInline: 'auto' } },
    h('a.link.small', { href: existing ? `#/recipe/${existing.id}` : '#/recipes' }, '← Cancel'),
    h('div.page-head', {}, h('div', {}, h('h1', {}, existing ? 'Edit recipe' : 'Create a recipe'), h('p', {}, 'Pick ingredients from the FOODIE list to get automatic nutrition, cost and allergen info — or type your own.'))),
    dl,
    h('section.card.stack', {}, field('Recipe name', h('input', { type: 'text', value: d.n, placeholder: 'e.g. Grandma\'s Sunday Sauce', oninput: (e) => (d.n = e.target.value) })),
      h('div.grid.c2', {}, field('Meal type', h('select', { onchange: (e) => (d.t = e.target.value) }, Object.entries(TYPE_LABEL).map(([k, v]) => h('option', { value: k, selected: d.t === k }, v)))),
        field('Cuisine', h('select', { onchange: (e) => (d.c = e.target.value) }, [...CUISINES, ...(CUISINES.includes(d.c) ? [] : [d.c])].map((c) => h('option', { value: c, selected: d.c === c }, c))))),
      h('div.grid.c3', {}, field('Prep (min)', h('input', { type: 'number', min: 0, value: d.p, oninput: (e) => (d.p = e.target.value) })), field('Cook (min)', h('input', { type: 'number', min: 0, value: d.k, oninput: (e) => (d.k = e.target.value) })), field('Servings', h('input', { type: 'number', min: 1, value: d.s, oninput: (e) => (d.s = e.target.value) }))),
      h('div.field', {}, h('label', {}, 'Picture icon'), h('div.chips', {}, emojis.map((em) => h('button.chip.sm', { type: 'button', 'aria-label': 'Icon ' + em, onclick: (e) => { d.e = em; [...e.currentTarget.parentNode.children].forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); } }, em)))), photoBox),
    h('section.card.stack', {}, h('h3', {}, 'Ingredients'), h('p.small.muted', { style: { margin: 0 } }, `Quantities are in ${sys === 'metric' ? 'grams / ml' : 'oz / fl oz'} (each for countable items). Not in the list? Type any name and a text amount like “1 cup”.`), rowsBox, h('button.btn.ghost.sm', { type: 'button', onclick: () => { rows.push({ name: '', amount: '' }); paintRows(); rowsBox.lastChild.querySelector('input').focus(); } }, '＋ Add ingredient')),
    h('section.card.stack', {}, h('h3', {}, 'Method'), stepsTa, field('Tip (optional)', h('input', { type: 'text', value: d.tip || '', oninput: (e) => (d.tip = e.target.value) }))),
    h('details.card.flat', {}, h('summary', { style: { cursor: 'pointer', fontWeight: 650 } }, 'Advanced: allergens, seasons & manual nutrition'),
      h('div.stack', { style: { marginTop: '14px' } },
        h('div.field', {}, h('label', {}, 'Additional allergens present (for custom ingredients)'), chipGroup({ options: ALLERGENS.map((a) => ({ id: a.id, label: a.label })), value: d.allergens || [], onChange: (v) => (d.allergens = v), small: true })),
        h('div.field', {}, h('label', {}, 'Best in season'), chipGroup({ options: ['spring', 'summer', 'autumn', 'winter'].map((x) => ({ id: x, label: cap(x) })), value: d.se, onChange: (v) => (d.se = v.length ? v : ['spring', 'summer', 'autumn', 'winter']), small: true })),
        h('p.small.muted', { style: { margin: 0 } }, 'Override calculated nutrition per serving (leave blank to calculate automatically):'),
        h('div.grid.c4', {}, ['kcal', 'pro', 'carb', 'fat'].map((k) => field({ kcal: 'Calories', pro: 'Protein g', carb: 'Carbs g', fat: 'Fat g' }[k], h('input', { type: 'number', min: 0, value: adv.nut[k] ?? '', oninput: (e) => (adv.nut[k] = e.target.value) })))),
        field('Cost per serving override ($)', h('input', { type: 'number', min: 0, step: 0.05, value: adv.costPer, oninput: (e) => (adv.costPer = e.target.value) })))),
    h('div.row.end', {}, h('a.btn.ghost', { href: existing ? `#/recipe/${existing.id}` : '#/recipes' }, 'Cancel'), h('button.btn.primary', { onclick: save }, existing ? 'Save changes' : 'Save recipe')));
}
