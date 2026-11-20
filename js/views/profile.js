/** Profile, goals, budgets, FOODIE Coach settings and data management. */
import { h, modal, toast, confirmDialog, download, imageToDataURL, money } from '../lib/util.js';
import { state, commit, exportJSON, replaceState, resetState, storageBytes } from '../store.js';
import { chipGroup, seg, field, go, notice } from '../ui.js';
import { DIETS, CUISINES } from '../engines/nutrition.js';
import { ALLERGENS, ingredientList, INGREDIENTS } from '../data/ingredients.js';
import { STORES } from '../data/stores.js';
import { SLOTS, SLOT_LABEL } from '../engines/planner.js';

const set = (fn, silent = true) => commit((s) => fn(s.profile), { silent });

export function renderProfile() {
  const p = state.profile;
  const initial = (p.name || 'You').trim().charAt(0).toUpperCase();
  const avatarBox = h('div.stack.sm', { style: { alignItems: 'center' } },
    h('div.avatar.xl', {}, p.avatar ? h('img', { src: p.avatar, alt: 'Your profile picture' }) : initial),
    h('div.row', {}, h('label.btn.ghost.sm', {}, 'Change photo', h('input', { type: 'file', accept: 'image/*', class: 'sr', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const url = await imageToDataURL(f, 256, 0.85); set((x) => (x.avatar = url), false); toast('Profile picture updated'); } catch { toast('Could not read that image'); } } })), p.avatar ? h('button.btn.ghost.sm', { onclick: () => set((x) => (x.avatar = null), false) }, 'Remove') : null));

  const chipList = (key, placeholder, { useIngredients = true } = {}) => {
    const box = h('div.stack.sm');
    const nameOf = (v) => INGREDIENTS[v]?.name || v;
    const paint = () => box.replaceChildren(h('div.chips', {}, p[key].length ? p[key].map((v) => h('button.chip.sm.on', { 'aria-label': `Remove ${nameOf(v)}`, onclick: () => { set((x) => (x[key] = x[key].filter((y) => y !== v))); paint(); } }, nameOf(v), ' ✕')) : h('span.small.muted', {}, 'None yet')),
      h('form.row.nowrap', { style: { gap: '8px' }, onsubmit: (e) => { e.preventDefault(); const inp = e.target.querySelector('input'); const raw = inp.value.trim(); if (!raw) return; const match = ingredientList().find((i) => i.name.toLowerCase() === raw.toLowerCase()); const val = match ? match.id : raw.toLowerCase(); if (!p[key].includes(val)) set((x) => x[key].push(val)); inp.value = ''; paint(); } },
        h('input', { type: 'text', list: 'ing-dl', placeholder }), h('button.btn.ghost.sm', { type: 'submit' }, 'Add')));
    paint(); return box;
  };

  const num = (label, key, opts = {}) => field(label, h('input', { type: 'number', min: 0, step: opts.step || 1, value: p[key] ?? '', placeholder: opts.ph || '', onchange: (e) => set((x) => (x[key] = e.target.value === '' ? '' : +e.target.value)) }), opts.hint);

  return h('div.view.stack.lg', { style: { maxWidth: '860px', marginInline: 'auto' } },
    h('datalist#ing-dl', {}, ingredientList().map((i) => h('option', { value: i.name }))),
    h('div.page-head', {}, h('div', {}, h('h1', {}, 'Profile & Coach'), h('p', {}, 'Everything is saved on this device. Nothing leaves your browser unless you share it.'))),
    h('section.card.stack', {}, h('div.row', { style: { gap: '22px', alignItems: 'flex-start' } }, avatarBox,
      h('div.stack.grow', { style: { minWidth: '220px' } }, field('Name', h('input', { type: 'text', value: p.name, placeholder: 'What should we call you?', onchange: (e) => set((x) => (x.name = e.target.value.trim()), false) })),
        field('About you (optional)', h('input', { type: 'text', value: p.bio, placeholder: 'e.g. Weeknight cook, loves spicy food', onchange: (e) => set((x) => (x.bio = e.target.value)) }))))),

    h('section.card.stack', {}, h('h3', {}, 'Food preferences'),
      h('div.field', {}, h('label', {}, 'Eating style'), chipGroup({ options: DIETS.filter((d) => d.id !== 'highProtein').map((d) => ({ id: d.id, label: d.label, icon: d.icon })), value: p.diets, onChange: (v) => set((x) => (x.diets = v), false), small: true }), h('div.hint', {}, 'Plans and suggestions will only include matching recipes.')),
      h('div.field', {}, h('label', {}, 'Allergies'), chipGroup({ options: ALLERGENS.map((a) => ({ id: a.id, label: a.label })), value: p.allergies, onChange: (v) => set((x) => (x.allergies = v), false), small: true }), h('div.hint', {}, 'Always excluded from generated plans, and flagged everywhere else. Always check labels — FOODIE can\'t guarantee a recipe is safe for a medical allergy.')),
      h('div.field', {}, h('label', {}, 'Not a fan of (disliked ingredients)'), chipList('dislikes', 'e.g. mushrooms, cilantro')),
      h('div.field', {}, h('label', {}, 'Favorite cuisines'), chipGroup({ options: CUISINES.map((c) => ({ id: c, label: c })), value: p.favCuisines, onChange: (v) => set((x) => (x.favCuisines = v), false), small: true })),
      h('div.field', {}, h('label', {}, 'Favorite ingredients'), chipList('favIngredients', 'e.g. avocado, salmon'))),

    h('section.card.stack', {}, h('h3', {}, 'Goals & daily targets'),
      h('div.field', {}, h('label', {}, 'Main goal'), chipGroup({ multi: false, options: [{ id: 'healthy', label: '🥗 Eat healthier' }, { id: 'lose', label: '⬇ Lose weight' }, { id: 'gain', label: '💪 Build muscle' }, { id: 'maintain', label: '⚖ Maintain' }], value: p.goal, onChange: (v) => set((x) => (x.goal = v || 'healthy'), false) })),
      h('p.small.muted', { style: { margin: 0 } }, 'Targets are optional. Leave blank if you\'d rather not track numbers.'),
      h('div.grid.c4', {}, num('Calories / day', 'calories', { ph: 'e.g. 2000' }), num('Protein g', 'protein'), num('Carbs g', 'carbs'), num('Fat g', 'fat')),
      h('button.btn.ghost.sm', { style: { alignSelf: 'flex-start' }, onclick: calorieHelper }, '🧮 Estimate my calories')),

    h('section.card.stack', {}, h('h3', {}, 'Budgets & shopping'),
      h('div.grid.c3', {}, num('Weekly grocery budget ($)', 'weeklyBudget'), num('Monthly grocery budget ($)', 'monthlyBudget'), num('Monthly eating-out budget ($)', 'diningBudget')),
      h('div.grid.c2', {}, field('Default grocery store', h('select', { onchange: (e) => set((x) => (x.store = e.target.value), false) }, STORES.map((s) => h('option', { value: s.id, selected: s.id === p.store }, s.name)))), num('People you usually cook for', 'household'))),

    h('section.card.stack', {}, h('h3', {}, 'FOODIE Coach'),
      h('label.row', { style: { gap: '10px' } }, h('input', { type: 'checkbox', checked: p.coachOn, onchange: (e) => set((x) => (x.coachOn = e.target.checked), false) }), h('span', {}, h('b', {}, 'Show coach notes on recipes and tips on the dashboard'), h('div.small.muted', {}, 'Gentle heads-ups about allergies, diet, goals and budget. You can always override. Turn off for a quieter app.'))),
      h('div.notice', {}, h('span', {}, '🤖'), h('span', {}, 'The Coach is a transparent set of rules running in your browser — not an AI model and nothing is sent anywhere. It never blocks a choice.'))),

    h('section.card.stack', {}, h('h3', {}, 'Preferences'),
      h('div.grid.c2', {}, field('Units', seg([{ id: 'us', label: 'US (oz, cups)' }, { id: 'metric', label: 'Metric (g, ml)' }], p.units, (v) => set((x) => (x.units = v), false))),
        field('Appearance', seg([{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }], p.theme, (v) => set((x) => (x.theme = v), false))),
        field('Hemisphere (for seasonal picks)', seg([{ id: 'north', label: 'Northern' }, { id: 'south', label: 'Southern' }], p.hemisphere, (v) => set((x) => (x.hemisphere = v), false)))),
      h('div.field', {}, h('label', {}, 'Usual meal times (used for calendar events and prep schedules)'), h('div.grid.c4', {}, SLOTS.map((s) => field(SLOT_LABEL[s].split(' ')[0], h('input', { type: 'time', value: p.mealTimes[s], onchange: (e) => set((x) => (x.mealTimes[s] = e.target.value || x.mealTimes[s])) })))))),

    h('section.card.stack', {}, h('h3', {}, 'Your data'), h('p.small.muted', { style: { margin: 0 } }, `Stored in this browser (${(storageBytes() / 1024).toFixed(0)} KB used). Clearing your browser data will erase it — export a backup now and then.`),
      h('div.row', {}, h('button.btn.ghost', { onclick: () => { download(`foodie-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(), 'application/json'); toast('Backup downloaded'); } }, '⬇ Export backup'),
        h('label.btn.ghost', {}, '⬆ Restore backup', h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', onchange: restore })),
        h('button.btn.danger', { onclick: async () => { if (await confirmDialog('This permanently erases all your plans, recipes, favorites and settings on this device.', { okLabel: 'Erase everything', danger: true, title: 'Reset FOODIE?' })) { resetState(); location.hash = '#/'; location.reload(); } } }, 'Reset app'))),

    h('section.card.stack.sm', {}, h('h3', {}, 'What\'s real, and what isn\'t'),
      h('ul', { style: { margin: 0, paddingLeft: '18px', display: 'grid', gap: '6px' } },
        h('li.small', {}, h('b', {}, 'Works fully offline: '), 'meal planning, recipes, nutrition & cost estimates, grocery lists, pantry, PDFs, calendar export, sharing links, taste learning, coach.'),
        h('li.small', {}, h('b', {}, 'Uses public services only when you tap: '), 'OpenStreetMap lookups for nearby restaurants; Google/Outlook calendar pages; store, delivery and map links.'),
        h('li.small', {}, h('b', {}, 'Not possible without accounts or paid APIs: '), 'live grocery prices & carts, live restaurant menus, hours, ratings or ordering. FOODIE never fabricates these — it links out instead.'),
        h('li.small', {}, h('b', {}, 'Estimates: '), 'costs use average US prices scaled by a rough store price level; nutrition is calculated from typical ingredient values.'))));
}

async function restore(e) {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const data = j.app === 'FOODIE' ? j.data : j;
    if (!data || typeof data !== 'object' || !data.profile) throw new Error('bad file');
    if (await confirmDialog('Replace everything on this device with the backup?', { okLabel: 'Restore' })) { replaceState(data); toast('Backup restored'); location.hash = '#/'; }
  } catch { toast('That file isn\'t a valid FOODIE backup'); }
}

function calorieHelper() {
  const sys = state.profile.units; const d = { sex: 'f', age: 35, w: sys === 'us' ? 150 : 68, h: sys === 'us' ? 66 : 168, act: 1.375 };
  const out = h('div.notice.good', { role: 'status' }, 'Fill in the fields to see an estimate.');
  const calc = () => {
    const kg = sys === 'us' ? d.w * 0.4536 : d.w; const cm = sys === 'us' ? d.h * 2.54 : d.h;
    const bmr = 10 * kg + 6.25 * cm - 5 * d.age + (d.sex === 'm' ? 5 : -161); const tdee = bmr * d.act;
    const goal = state.profile.goal; const target = Math.round((goal === 'lose' ? tdee - 400 : goal === 'gain' ? tdee + 250 : tdee) / 50) * 50;
    out.textContent = `Estimated maintenance ≈ ${Math.round(tdee / 50) * 50} kcal/day. For your goal (${{ lose: 'lose weight', gain: 'build muscle', maintain: 'maintain', healthy: 'eat healthier' }[goal]}): ≈ ${target} kcal/day.`; out.dataset.t = target; return target;
  };
  const row = (l, el) => field(l, el);
  modal({ title: 'Estimate daily calories', body: h('div.stack', {}, h('p.small.muted', {}, 'Uses the Mifflin-St Jeor formula — a rough starting point, not medical advice. Nothing you enter here is saved.'),
    h('div.grid.c2', {}, row('Sex (for the formula)', h('select', { onchange: (e) => { d.sex = e.target.value; calc(); } }, h('option', { value: 'f' }, 'Female'), h('option', { value: 'm' }, 'Male'))), row('Age', h('input', { type: 'number', value: d.age, min: 14, max: 100, oninput: (e) => { d.age = +e.target.value; calc(); } })),
      row(`Weight (${sys === 'us' ? 'lb' : 'kg'})`, h('input', { type: 'number', value: d.w, oninput: (e) => { d.w = +e.target.value; calc(); } })), row(`Height (${sys === 'us' ? 'in' : 'cm'})`, h('input', { type: 'number', value: d.h, oninput: (e) => { d.h = +e.target.value; calc(); } }))),
    row('Activity', h('select', { onchange: (e) => { d.act = +e.target.value; calc(); } }, [[1.2, 'Mostly sitting'], [1.375, 'Light activity (1–3 workouts/wk)'], [1.55, 'Moderate (3–5 workouts/wk)'], [1.725, 'Very active']].map(([v, l]) => h('option', { value: v, selected: v === 1.375 }, l)))), out),
    actions: [{ label: 'Close' }, { label: 'Use this target', primary: true, onClick: () => { const t = calc(); if (!(t > 800)) { toast('That number looks too low — double-check your inputs'); return false; } set((x) => (x.calories = t), false); } }] });
  calc();
}
