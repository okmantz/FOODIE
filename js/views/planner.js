/** Meal planner: guided wizard -> generated plan -> review, swap, prep, calendar, share. */
import { h, today, addDays, fmtDay, fmtTime12, money, round, modal, toast, confirmDialog, download, uid, debounce, startOfWeek, diffDays, fmtMins, printHTML, esc } from '../lib/util.js';
import { state, commit, recipeById, activePlan, allRecipes, activeList } from '../store.js';
import { thumb, chipGroup, seg, field, go, coachNotes, stars, sectionHead, dietBadges, notice } from '../ui.js';
import { DIETS, CUISINES, TYPE_LABEL } from '../engines/nutrition.js';
import { SLOTS, SLOT_LABEL, defaultPrefs, generatePlan, alternatives, swapMeal, setMeal, removeMeal, planCost, planNutritionAvg, dayNutrition, allMeals, eligible, fixBatches } from '../engines/planner.js';
import { evaluateRecipe, hasWarning } from '../engines/coach.js';
import { STORES, storeById, priceMult } from '../data/stores.js';
import { newList, cookedSlots, listStats } from '../engines/grocery.js';
import { prepSheet, STORAGE_TIP } from '../engines/prep.js';
import { buildICS, googleCalendarLink, outlookCalendarLink } from '../lib/calendar.js';
import { shareLink, shareOrCopy, mailtoHref } from '../lib/share.js';
import { PDF } from '../lib/pdf.js';
import { fmtQty } from '../lib/units.js';
import { INGREDIENTS } from '../data/ingredients.js';
import { setMealDone } from '../actions.js';

const ui = { mode: null, step: 0, draft: null, tab: 'meals', day: null, prepRange: 'soon' };

export function renderPlanner() {
  const plan = activePlan();
  if (!plan && ui.mode !== 'wizard') ui.mode = 'wizard';
  if (ui.mode === 'wizard') return wizard();
  return planView(plan);
}

/* ====================================================================== wizard */
function wizard() {
  if (!ui.draft) ui.draft = defaultPrefs();
  const d = ui.draft; const steps = 4;
  const root = h('div.view.wizard');
  const next = () => { ui.step = Math.min(steps - 1, ui.step + 1); rerender(); };
  const back = () => { ui.step = Math.max(0, ui.step - 1); rerender(); };
  const rerender = () => { root.replaceWith(wizard()); window.scrollTo(0, 0); };

  const dayOpts = [{ id: 7, label: '1 week' }, { id: 14, label: '2 weeks' }, { id: 30, label: '1 month' }];
  const pages = [
    () => h('div.stack.lg', {},
      h('div', {}, h('h2', {}, 'How long should we plan?'), h('p.muted', {}, 'Pick a stretch of time and the meals you want covered.')),
      h('div.opt-grid', {}, dayOpts.map((o) => h('button.opt' + (d.days === o.id ? '.on' : ''), { onclick: () => { d.days = o.id; rerender(); } }, h('span.e', {}, o.id === 7 ? '📅' : o.id === 14 ? '🗓️' : '🌙'), h('b', {}, o.label), h('span', {}, `${o.id} days`)))),
      field('Start date', h('input', { type: 'date', value: d.startDate || today(), min: today(), onchange: (e) => (d.startDate = e.target.value || today()) })),
      h('div.field', {}, h('label', {}, 'Meals to plan each day'), chipGroup({ options: [{ id: 'breakfast', label: 'Breakfast', icon: '🥞' }, { id: 'lunch', label: 'Lunch', icon: '🥗' }, { id: 'dinner', label: 'Dinner', icon: '🍝' }], value: SLOTS.filter((s) => d.slots[s]), onChange: (v) => { d.slots = { breakfast: v.includes('breakfast'), lunch: v.includes('lunch'), dinner: v.includes('dinner') }; } })),
      h('div.field', {}, h('label', {}, 'Snacks, desserts, smoothies & shakes'), seg([{ id: 'none', label: 'None' }, { id: 'some', label: 'A few a week' }, { id: 'daily', label: 'Daily' }], d.snackFreq, (v) => { d.snackFreq = v; rerender(); }))),
    () => h('div.stack.lg', {},
      h('div', {}, h('h2', {}, 'Who\'s eating, and how?'), h('p.muted', {}, 'Allergies and dislikes from your profile are always respected.')),
      field('Servings per meal (people eating)', h('input', { type: 'number', min: 1, max: 12, value: d.household, onchange: (e) => (d.household = Math.max(1, Math.min(12, +e.target.value || 1))) })),
      h('div.field', {}, h('label', {}, 'Dietary preferences for this plan'), chipGroup({ options: DIETS.map((x) => ({ id: x.id, label: x.label, icon: x.icon })), value: d.diets, onChange: (v) => (d.diets = v), small: true }), h('div.hint', {}, 'Every recipe in the plan will match all selected styles.')),
      h('div.field', {}, h('label', {}, 'Different meals, or cook once & eat twice?'),
        h('div.opt-grid', {}, [{ id: 'different', e: '🌈', t: 'Different meals', s: 'Maximum variety, a new recipe each time' }, { id: 'leftovers', e: '♻️', t: 'Leftovers', s: 'Cook lunch & dinner for two days — less cooking, less waste' }].map((o) => h('button.opt' + (d.mode === o.id ? '.on' : ''), { onclick: () => { d.mode = o.id; rerender(); } }, h('span.e', {}, o.e), h('b', {}, o.t), h('span', {}, o.s))))),
      h('div.field', {}, h('label', {}, 'Cuisines (leave empty for everything)'), chipGroup({ options: CUISINES.map((c) => ({ id: c, label: c })), value: d.cuisines, onChange: (v) => (d.cuisines = v), small: true })),
      h('div.field', {}, h('label', {}, 'Time per meal'), seg([{ id: 0, label: 'Any' }, { id: 20, label: '≤ 20 min' }, { id: 30, label: '≤ 30 min' }, { id: 45, label: '≤ 45 min' }], d.maxTime || 0, (v) => { d.maxTime = v || null; rerender(); }))),
    () => h('div.stack.lg', {},
      h('div', {}, h('h2', {}, 'Budget & where you shop'), h('p.muted', {}, 'FOODIE estimates your basket from average US prices adjusted for the store\'s typical price level. These are planning estimates, not live prices.')),
      field(`Grocery budget per week ($) — about ${money(d.budget * d.days / 7, 0)} for ${d.days} days`, h('input', { type: 'number', min: 20, step: 5, value: d.budget || '', placeholder: 'No limit', onchange: (e) => (d.budget = +e.target.value || null) }), 'Leave empty for no budget limit.'),
      field('Preferred grocery store', h('select', { onchange: (e) => (d.store = e.target.value) }, STORES.map((s) => h('option', { value: s.id, selected: s.id === d.store }, s.name)))),
      h('label.row', { style: { gap: '10px' } }, h('input', { type: 'checkbox', checked: d.usePantry, onchange: (e) => (d.usePantry = e.target.checked) }), h('span', {}, h('b', {}, 'Use up my pantry first'), h('div.small.muted', {}, 'Prefers recipes that use ingredients you already have.'))),
      h('label.row', { style: { gap: '10px' } }, h('input', { type: 'checkbox', checked: d.useTaste, onchange: (e) => (d.useTaste = e.target.checked) }), h('span', {}, h('b', {}, 'Learn from my tastes'), h('div.small.muted', {}, 'Leans toward cuisines you favorite, rate highly and cook often.')))),
    () => {
      const budget = d.budget ? money(d.budget * d.days / 7, 0) : 'no limit';
      return h('div.stack.lg', {},
        h('div', {}, h('h2', {}, 'Ready when you are'), h('p.muted', {}, 'Here\'s what we\'ll build. You can swap any meal afterwards.')),
        h('div.card.stack.sm', {},
          sumRow('Length', `${d.days} days from ${fmtDay(d.startDate || today())}`),
          sumRow('Meals', [...SLOTS.filter((s) => d.slots[s]).map((s) => SLOT_LABEL[s]), d.snackFreq !== 'none' ? 'Treats ' + (d.snackFreq === 'daily' ? 'daily' : 'a few a week') : null].filter(Boolean).join(', ') || 'None selected'),
          sumRow('Servings', `${d.household} per meal`), sumRow('Style', d.diets.length ? d.diets.join(', ') : 'No restrictions'), sumRow('Variety', d.mode === 'leftovers' ? 'Cook once, eat twice' : 'Different meals'),
          sumRow('Cuisines', d.cuisines.length ? d.cuisines.join(', ') : 'All'), sumRow('Budget', budget), sumRow('Store', storeById(d.store).name),
          state.profile.allergies.length ? sumRow('Avoiding', 'Your listed allergies (always)') : null),
        field('Name your plan (optional)', h('input', { type: 'text', placeholder: 'e.g. Back-to-routine week', value: d.name, oninput: (e) => (d.name = e.target.value) })),
        !SLOTS.some((s) => s !== 'snack' && d.slots[s]) && d.snackFreq === 'none' ? notice('warn', 'Pick at least one meal on step 1.') : null);
    },
  ];
  const canGo = SLOTS.some((s) => d.slots[s]) || d.snackFreq !== 'none';
  const generate = () => {
    if (!canGo) { toast('Choose at least one meal to plan'); return; }
    const plan = generatePlan({ ...d, startDate: d.startDate || today() });
    commit((s) => { s.plans.unshift(plan); s.activePlanId = plan.id; const list = newList(plan, s); s.lists.unshift(list); s.activeListId = list.id; });
    ui.mode = null; ui.step = 0; ui.draft = null; ui.day = null; ui.tab = 'meals';
    toast('Plan ready! A grocery list was created for you.');
  };
  root.append(
    h('div.steps', { 'aria-label': `Step ${ui.step + 1} of ${steps}` }, Array.from({ length: steps }, (_, i) => h('i' + (i <= ui.step ? '.on' : '')))),
    pages[ui.step](),
    h('div.row.between', { style: { marginTop: '24px' } },
      ui.step > 0 ? h('button.btn.ghost', { onclick: back }, '← Back') : (activePlan() ? h('button.btn.ghost', { onclick: () => { ui.mode = null; ui.draft = null; go('#/planner'); } }, 'Cancel') : h('span')),
      ui.step < steps - 1 ? h('button.btn.primary', { onclick: next }, 'Continue →') : h('button.btn.primary', { onclick: generate }, '✨ Generate my plan')));
  return root;
}
const sumRow = (k, v) => h('div.row.between.nowrap', {}, h('span.muted.small', {}, k), h('b.small', { style: { textAlign: 'right' } }, v));

/* ====================================================================== plan view */
function planView(plan) {
  const t = today();
  if (!ui.day || !plan.days.some((d) => d.date === ui.day)) ui.day = plan.days.some((d) => d.date === t) ? t : plan.days[0].date;
  const cost = planCost(plan, { usePantry: !!plan.prefs?.usePantry });
  const nut = planNutritionAvg(plan);
  const budget = plan.budget ? plan.budget * plan.days.length / 7 : null;
  const meals = allMeals(plan); const uniqRecipes = new Set(meals.map((m) => m.rid)).size;
  const list = state.lists.find((l) => l.planId === plan.id);

  const header = h('div.page-head', {},
    h('div', {}, h('span.eyebrow', {}, `${fmtDay(plan.days[0].date)} – ${fmtDay(plan.days[plan.days.length - 1].date)}`), h('h1', {}, plan.name),
      h('p', {}, `${meals.length} meals · ${uniqRecipes} recipes · ${plan.household} serving${plan.household > 1 ? 's' : ''} each · ${storeById(plan.store).name}`)),
    h('div.row', {}, state.plans.length > 1 ? h('select', { 'aria-label': 'Switch plan', style: { width: 'auto' }, onchange: (e) => commit((s) => { s.activePlanId = e.target.value; }) }, state.plans.map((p) => h('option', { value: p.id, selected: p.id === plan.id }, p.name))) : null,
      h('button.btn.ghost', { onclick: () => { ui.mode = 'wizard'; ui.step = 0; ui.draft = { ...defaultPrefs(), ...(plan.prefs || {}), name: '', seed: null }; go('#/planner'); } }, '＋ New plan'),
      h('button.btn.ghost', { onclick: () => planMenu(plan) }, 'More ⋯')));

  const stats = h('div.grid.c4', {},
    h('div.card.stat', {}, h('span.n', {}, money(cost.total, 0)), h('span.l', {}, 'Est. grocery cost'), h('span.tiny.muted', {}, budget ? (cost.total <= budget * 1.02 ? `✓ within ${money(budget, 0)} budget` : `${money(cost.total - budget, 0)} over ${money(budget, 0)} budget`) : 'no budget set')),
    h('div.card.stat', {}, h('span.n', {}, money(cost.perServing)), h('span.l', {}, 'Per serving'), h('span.tiny.muted', {}, 'average, all meals')),
    h('div.card.stat', {}, h('span.n', {}, Math.round(nut.avg.kcal)), h('span.l', {}, 'kcal / day avg'), h('span.tiny.muted', {}, +state.profile.calories ? `goal ${state.profile.calories}` : 'per person')),
    h('div.card.stat', {}, h('span.n', {}, Math.round(nut.avg.pro) + ' g'), h('span.l', {}, 'Protein / day'), h('span.tiny.muted', {}, 'per person')));

  const tabs = h('div.tabs', { role: 'tablist' }, [['meals', 'Meals'], ['overview', 'Overview'], ['prep', 'Meal prep'], ['calendar', 'Calendar & share']].map(([id, label]) => h('button' + (ui.tab === id ? '.on' : ''), { role: 'tab', 'aria-selected': String(ui.tab === id), onclick: () => { ui.tab = id; go('#/planner'); } }, label)));

  const body = ui.tab === 'meals' ? mealsTab(plan) : ui.tab === 'overview' ? overviewTab(plan) : ui.tab === 'prep' ? prepTab(plan) : calendarTab(plan);

  return h('div.view.stack', {}, header,
    ...(plan.warnings || []).map((w) => notice('warn', h('span', {}, '💡'), h('span', {}, w))),
    stats,
    h('div.card.row.between', {}, h('div', {}, h('b', {}, list ? 'Your grocery list is ready' : 'Create your grocery list'), h('div.small.muted', {}, list ? `${list.items.length} items · ${list.items.filter((i) => !i.checked && !i.have).length} left to buy` : 'Everything you need, organized by aisle.')),
      h('button.btn.primary', { onclick: () => (list ? (commit((s) => { s.activeListId = list.id; }), go('#/grocery')) : makeListDialog(plan)) }, list ? 'Open list →' : 'Build grocery list')),
    tabs, body);
}

/* ---------------------------------------------------------------- meals tab */
function mealsTab(plan) {
  const t = today();
  const nav = h('div.week-nav', { role: 'tablist', 'aria-label': 'Days' }, plan.days.map((d) => {
    const dt = new Date(d.date + 'T00:00:00');
    return h('button.day-pill' + (d.date === ui.day ? '.on' : '') + (d.date === t ? '.today' : ''), { role: 'tab', 'aria-selected': String(d.date === ui.day), onclick: () => { ui.day = d.date; go('#/planner'); } }, h('small', {}, dt.toLocaleDateString(undefined, { weekday: 'short' })), h('b', {}, String(dt.getDate())), h('small', {}, dt.toLocaleDateString(undefined, { month: 'short' })));
  }));
  setTimeout(() => nav.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 0);
  const day = plan.days.find((d) => d.date === ui.day);
  const dn = dayNutrition(day);
  const goal = +state.profile.calories;
  const slotEls = SLOTS.filter((s) => s !== 'snack' ? true : true).map((slot) => {
    const m = day.slots[slot];
    if (!m) {
      if (slot === 'snack' && plan.prefs?.snackFreq === 'none' && !Object.values(day.slots).length) return null;
      return h('div.slot.empty-slot', {}, h('div', {}, h('div.t', {}, SLOT_LABEL[slot]), h('div.small.muted', {}, 'Nothing planned')), h('button.btn.ghost.sm', { onclick: () => pickRecipe({ plan, date: day.date, slot, mode: 'add' }) }, '＋ Add'));
    }
    const r = recipeById(m.rid);
    if (!r) return null;
    const warns = evaluateRecipe(r).filter((n) => n.level === 'warn');
    const mealCost = r.d.cost * m.servings * priceMult(plan.store);
    return h('div.slot' + (m.done ? '.done' : ''), {},
      h('a', { href: `#/recipe/${r.id}`, 'aria-label': `Open ${r.n}` }, thumb(r, 'sq')),
      h('div.grow.stack.sm', { style: { gap: '4px' } },
        h('div.row', { style: { gap: '8px' } }, h('span.t', {}, `${SLOT_LABEL[slot]} · ${fmtTime12(state.profile.mealTimes[slot] || '12:00')}`), m.leftover ? h('span.badge.green', {}, '♻️ Leftovers') : m.batch > 1 ? h('span.badge', {}, 'Cook 2× portions') : null),
        h('a', { href: `#/recipe/${r.id}`, style: { color: 'inherit', textDecoration: 'none' } }, h('h4', {}, r.n)),
        h('div.small.muted', {}, `⏱ ${m.leftover ? '5 min reheat' : fmtMins(r.d.time)} · 🔥 ${Math.round(r.d.nut.kcal)} kcal · ${m.leftover ? 'no extra cost' : '~' + money(mealCost)}`),
        warns.length ? h('div.cnote.warn', {}, h('span', {}, '⚠️'), h('span', {}, warns[0].text)) : null,
        h('div.row', { style: { gap: '6px' } },
          h('button.chip.sm' + (m.done ? '.on' : ''), { 'aria-pressed': String(!!m.done), onclick: () => setMealDone(day.date, slot, !m.done) }, m.done ? '✓ Done' : 'Mark done'),
          h('button.chip.sm', { onclick: () => pickRecipe({ plan, date: day.date, slot, mode: 'swap' }) }, '⇄ Swap'),
          h('button.chip.sm', { onclick: () => calendarDialog(plan, day.date, slot) }, '📅'),
          h('button.chip.sm', { 'aria-label': 'Remove meal', onclick: () => { commit((s) => removeMeal(s.plans.find((p) => p.id === plan.id), day.date, slot)); toast('Meal removed'); } }, '✕'))));
  }).filter(Boolean);
  return h('div.stack', {}, nav,
    h('div.row.between', {}, h('h3', {}, fmtDay(day.date, { weekday: 'long', month: 'long', day: 'numeric' })), h('span.small.muted', {}, `${Math.round(dn.kcal)} kcal · ${Math.round(dn.pro)} g protein${goal ? ` (goal ${goal} kcal)` : ''}`)),
    ...slotEls, !slotEls.length ? h('div.empty', {}, 'No meals on this day.') : null);
}

/* ---------------------------------------------------------------- overview tab */
function overviewTab(plan) {
  const cols = SLOTS.filter((s) => plan.days.some((d) => d.slots[s]));
  return h('div.cal-grid', {}, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Day'), cols.map((c) => h('th', {}, SLOT_LABEL[c])))),
    h('tbody', {}, plan.days.map((d) => h('tr', {}, h('td', { style: { whiteSpace: 'nowrap', fontWeight: 650, fontSize: '.82rem', verticalAlign: 'top', paddingTop: '10px' } }, fmtDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' })),
      cols.map((c) => { const m = d.slots[c]; const r = m && recipeById(m.rid); return h('td.cal-cell', {}, r ? h('button', { onclick: () => go(`#/recipe/${r.id}`) }, m.leftover ? h('span.lo', {}, '♻️ ' + r.n) : r.n) : h('span.muted', {}, '—')); }))))));
}

/* ---------------------------------------------------------------- prep tab */
function prepTab(plan) {
  const t = today(); const first = plan.days[0].date; const last = plan.days[plan.days.length - 1].date;
  const start = t < first ? first : t > last ? first : t;
  const ranges = { soon: [start, addDays(start, 2)], week: [start, addDays(start, 6)], all: [first, last] };
  const [from, to] = ranges[ui.prepRange];
  const sheet = prepSheet(plan, from, to);
  const sys = state.profile.units;
  const byDay = new Map(); sheet.schedule.forEach((s) => { if (!byDay.has(s.date)) byDay.set(s.date, []); byDay.get(s.date).push(s); });
  const printIt = () => printHTML(`${plan.name} — prep`, `<h1>Meal prep</h1><div class="sub">${fmtDay(from)} – ${fmtDay(to)}</div><h2>Prep list</h2><ul>${sheet.tasks.map((x) => `<li><span class="box"></span><span>${esc(x.verb)} ${esc(x.name.toLowerCase())}</span><span class="q">${fmtQty(INGREDIENTS[x.id], x.qty, sys)}</span></li>`).join('')}</ul><h2>Cook schedule</h2>${[...byDay].map(([d, s]) => `<p><b>${fmtDay(d)}</b></p><ul>${s.map((e) => `<li><span>${fmtTime12(e.start)}</span><span>${esc(e.title)}</span></li>`).join('')}</ul>`).join('')}<p>${esc(STORAGE_TIP)}</p>`);
  return h('div.stack', {},
    h('div.row.between', {}, seg([{ id: 'soon', label: 'Next 3 days' }, { id: 'week', label: '7 days' }, { id: 'all', label: 'Whole plan' }], ui.prepRange, (v) => { ui.prepRange = v; go('#/planner'); }), h('button.btn.ghost.sm', { onclick: printIt }, '🖨 Print prep sheet')),
    h('div.split', {},
      h('section.card', {}, h('h3', {}, 'Prep list'), h('p.small.muted', {}, 'Do these once, up front — one chopping session covers every recipe.'),
        sheet.tasks.length ? h('ul.ing-list', {}, sheet.tasks.map((x) => h('li', {}, h('span', {}, h('b', {}, `${x.verb[0].toUpperCase()}${x.verb.slice(1)} ${x.name.toLowerCase()}`), h('div.tiny.muted', {}, [...new Set(x.meals.map((m) => m.name))].slice(0, 3).join(' · '))), h('span.q', {}, fmtQty(INGREDIENTS[x.id], x.qty, sys))))) : h('div.empty', {}, 'Nothing to prep in this range.'),
        h('div.notice', { style: { marginTop: '12px' } }, h('span', {}, '🧊'), h('span', {}, STORAGE_TIP))),
      h('section.card', {}, h('h3', {}, 'Cook-by-the-clock'), h('p.small.muted', {}, 'Start times work backward from your meal times (change them in Profile).'),
        [...byDay].length ? h('div.stack', { style: { marginTop: '8px' } }, [...byDay].map(([d, ev]) => h('div', {}, h('div.bold', {}, fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' })), ev.map((e) => h('div.row.nowrap', { style: { padding: '6px 0', borderBottom: '1px solid var(--line)' } }, h('span.badge.green', { style: { width: '72px', justifyContent: 'center' } }, fmtTime12(e.start)), h('a', { href: `#/recipe/${e.rid}`, style: { color: 'inherit', textDecoration: 'none' } }, e.title), e.batch ? h('span.badge', {}, '2× batch') : null))))) : h('div.empty', {}, 'No meals in this range.'))));
}

/* ---------------------------------------------------------------- calendar & share tab */
function planEvents(plan, { slots = SLOTS, includeLeftovers = true, from = null, to = null } = {}) {
  const ev = [];
  for (const d of plan.days) {
    if ((from && d.date < from) || (to && d.date > to)) continue;
    for (const slot of slots) {
      const m = d.slots[slot]; if (!m || (m.leftover && !includeLeftovers)) continue;
      const r = recipeById(m.rid); if (!r) continue;
      ev.push(mealEvent(d.date, slot, m, r));
    }
  }
  return ev;
}
function mealEvent(date, slot, m, r) {
  return { date, start: state.profile.mealTimes[slot] || '12:00', minutes: slot === 'snack' ? 30 : 45, title: `${m.leftover ? 'Leftovers' : SLOT_LABEL[slot]}: ${r.n}`,
    description: `${r.n} — ${r.d.time} min, about ${Math.round(r.d.nut.kcal)} kcal per serving.\n\n${m.leftover ? 'Leftovers from earlier in your FOODIE plan.' : r.st.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nPlanned with FOODIE.` };
}

function calendarTab(plan) {
  const opt = { slots: ['breakfast', 'lunch', 'dinner'], leftovers: true };
  const slotChips = chipGroup({ options: SLOTS.map((s) => ({ id: s, label: SLOT_LABEL[s] })), value: opt.slots, onChange: (v) => (opt.slots = v), small: true });
  return h('div.stack', {},
    h('section.card.stack', {}, h('h3', {}, '📅 Add to your calendar'), h('p.small.muted', {}, 'Downloads a standard .ics file that opens in Apple Calendar, Google Calendar, Outlook and others. Meal times come from your Profile.'),
      h('div.field', {}, h('label', {}, 'Include'), slotChips),
      h('label.row', { style: { gap: '8px' } }, h('input', { type: 'checkbox', checked: true, onchange: (e) => (opt.leftovers = e.target.checked) }), h('span.small', {}, 'Include “reheat leftovers” events')),
      h('div.row', {}, h('button.btn.primary', { onclick: () => { const ev = planEvents(plan, { slots: opt.slots, includeLeftovers: opt.leftovers }); if (!ev.length) return toast('No meals match those options'); download(`${plan.name.replace(/\W+/g, '-')}.ics`, buildICS(ev, plan.name), 'text/calendar'); toast(`Exported ${ev.length} calendar events`); } }, 'Download .ics for the whole plan'),
        h('span.small.muted', {}, 'Tip: add a single meal to Google or Outlook from the 📅 button on any meal.'))),
    h('section.card.stack', {}, h('h3', {}, '📤 Share this plan'), h('p.small.muted', {}, 'Creates a link that contains the plan itself — no account or server. Anyone with FOODIE can open it and import a copy.'),
      h('div.row', {}, h('button.btn.primary', { onclick: () => doSharePlan(plan) }, 'Share link'), h('button.btn.ghost', { onclick: () => planPDF(plan) }, '⬇ Download PDF'), h('button.btn.ghost', { onclick: () => printPlan(plan) }, '🖨 Print'))));
}

/* ---------------------------------------------------------------- dialogs & actions */
function pickRecipe({ plan, date, slot, mode }) {
  let q = ''; let showAll = false;
  const box = h('div.stack.sm', { style: { minHeight: '260px' } });
  const renderList = () => {
    let list;
    if (!q && !showAll && mode === 'swap') list = alternatives(plan, date, slot, 10);
    else {
      const needle = q.trim().toLowerCase();
      list = allRecipes().filter((r) => (showAll || r.slots.includes(slot)) && (!needle || (r.n + ' ' + r.c).toLowerCase().includes(needle))).filter((r) => eligible(r, plan.prefs || { diets: state.profile.diets })).slice(0, 40);
    }
    box.replaceChildren(...(list.length ? list.map((r) => {
      const warn = hasWarning(r);
      return h('button.meal-row', { onclick: () => {
        const go_ = () => { commit((s) => { const p = s.plans.find((x) => x.id === plan.id); if (mode === 'swap') swapMeal(p, date, slot, r.id); else setMeal(p, date, slot, r.id); }); toast(`${mode === 'swap' ? 'Swapped to' : 'Added'} ${r.n}`); picker.close(); };
        go_();
      } }, thumb(r, 'sm'), h('div.grow', {}, h('b', {}, r.n), h('div.small.muted', {}, `${r.c} · ${fmtMins(r.d.time)} · ${Math.round(r.d.nut.kcal)} kcal · $${r.d.cost.toFixed(2)}/serv`)), warn ? h('span.badge.warn', {}, '⚠️ check') : null);
    }) : [h('div.empty', {}, 'No matching recipes. Try “show all meal types”.')]));
  };
  const picker = modal({ title: mode === 'swap' ? `Swap ${SLOT_LABEL[slot].toLowerCase()}` : `Add ${SLOT_LABEL[slot].toLowerCase()}`, wide: false, body: h('div.stack', {},
    h('div.search', {}, h('input', { type: 'search', placeholder: 'Search recipes or cuisines…', 'aria-label': 'Search recipes', autofocus: true, oninput: debounce((e) => { q = e.target.value; renderList(); }, 120) })),
    h('label.row', { style: { gap: '8px' } }, h('input', { type: 'checkbox', onchange: (e) => { showAll = e.target.checked; renderList(); } }), h('span.small', {}, 'Show all meal types')),
    mode === 'swap' ? h('p.small.muted', {}, 'Top suggestions reuse ingredients already in your plan. Your allergy and diet filters still apply.') : null, box) });
  renderList();
}

function makeListDialog(plan) {
  const weeks = Math.ceil(plan.days.length / 7);
  let range = 'all';
  const sel = h('select', { onchange: (e) => (range = e.target.value) }, h('option', { value: 'all' }, `Whole plan (${plan.days.length} days)`), ...Array.from({ length: weeks }, (_, i) => h('option', { value: String(i) }, `Week ${i + 1}: ${fmtDay(plan.days[i * 7].date)} – ${fmtDay(plan.days[Math.min(plan.days.length - 1, i * 7 + 6)].date)}`)));
  modal({ title: 'Build grocery list', body: weeks > 1 ? h('div.stack', {}, h('p.muted', {}, 'Longer plans are easier to shop one week at a time.'), field('Which days?', sel)) : h('p', {}, `Create a list for all ${plan.days.length} days?`),
    actions: [{ label: 'Cancel' }, { label: 'Create list', primary: true, onClick: () => {
      let from = null, to = null, name;
      if (range !== 'all') { const i = +range; from = plan.days[i * 7].date; to = plan.days[Math.min(plan.days.length - 1, i * 7 + 6)].date; name = `${plan.name} — week ${i + 1}`; }
      commit((s) => { const l = newList(plan, s, { name, from, to }); s.lists.unshift(l); s.activeListId = l.id; });
      go('#/grocery');
    } }] });
}

function calendarDialog(plan, date, slot) {
  const m = plan.days.find((d) => d.date === date).slots[slot]; const r = recipeById(m.rid);
  const ev = mealEvent(date, slot, m, r);
  modal({ title: 'Add to calendar', body: h('div.stack', {}, h('p', {}, h('b', {}, ev.title), h('br'), h('span.muted.small', {}, `${fmtDay(date, { weekday: 'long', month: 'long', day: 'numeric' })} at ${fmtTime12(ev.start)}`)),
    h('div.stack.sm', {}, h('a.btn.ghost.block', { href: googleCalendarLink(ev), target: '_blank', rel: 'noopener' }, 'Google Calendar'), h('a.btn.ghost.block', { href: outlookCalendarLink(ev), target: '_blank', rel: 'noopener' }, 'Outlook.com'),
      h('button.btn.ghost.block', { onclick: () => download(`${r.id}.ics`, buildICS([ev]), 'text/calendar') }, 'Download .ics (Apple & others)')),
    h('p.tiny.muted', {}, 'Google and Outlook open their own page to confirm — FOODIE never gets access to your calendar.')) });
}

async function doSharePlan(plan) {
  const used = new Set(allMeals(plan).map((m) => m.rid));
  const custom = state.customRecipes.filter((r) => used.has(r.id));
  const url = await shareLink('plan', { plan: { ...plan, days: plan.days.map((d) => ({ date: d.date, slots: Object.fromEntries(Object.entries(d.slots).map(([k, m]) => [k, { rid: m.rid, servings: m.servings, batch: m.batch, leftover: m.leftover, grp: m.grp }])) })) }, recipes: custom });
  const text = `${plan.name} — ${plan.days.length}-day meal plan from FOODIE`;
  modal({ title: 'Share plan', body: h('div.stack', {}, h('p.small.muted', {}, 'This link contains your plan. It stays on whatever device opens it.'), h('textarea', { readonly: true, rows: 3, onfocus: (e) => e.target.select() }, url),
    h('div.row', {}, h('button.btn.primary', { onclick: () => shareOrCopy({ title: plan.name, text, url }) }, 'Share / copy'), h('a.btn.ghost', { href: mailtoHref(plan.name, `${text}\n\n${url}`) }, 'Email'))) });
}

export function planPDF(plan) {
  const pdf = new PDF({ footer: `${plan.name} · FOODIE` });
  pdf.title(plan.name, `${fmtDay(plan.days[0].date, { month: 'long', day: 'numeric', year: 'numeric' })} – ${fmtDay(plan.days[plan.days.length - 1].date, { month: 'long', day: 'numeric', year: 'numeric' })} · ${plan.household} serving(s) per meal`);
  const cost = planCost(plan, { usePantry: !!plan.prefs?.usePantry });
  pdf.p(`Estimated grocery cost: $${cost.total.toFixed(2)} (planning estimate at ${storeById(plan.store).name} price level). Average ${Math.round(planNutritionAvg(plan).avg.kcal)} kcal per person per day.`, { color: [0.4, 0.45, 0.4], size: 9.5 });
  for (const d of plan.days) {
    const entries = SLOTS.filter((s) => d.slots[s]);
    if (!entries.length) continue;
    pdf.ensure(24 + entries.length * 16);
    pdf.h2(fmtDay(d.date, { weekday: 'long', month: 'long', day: 'numeric' }));
    for (const s of entries) { const m = d.slots[s]; const r = recipeById(m.rid); pdf.ensure(16); pdf.text(SLOT_LABEL[s], pdf.m, 9, { font: 'b', color: [0.3, 0.5, 0.2] }); pdf.text(`${m.leftover ? '(leftovers) ' : ''}${r.n}`, pdf.m + 90, 10.5); pdf.text(`${Math.round(r.d.nut.kcal)} kcal`, 612 - pdf.m - 50, 9, { color: [0.45, 0.5, 0.45] }); pdf.y += 16; }
  }
  const ids = [...new Set(allMeals(plan).map((m) => m.rid))];
  pdf.newPage(); pdf.h2('Recipes');
  for (const id of ids) {
    const r = recipeById(id); if (!r) continue;
    pdf.ensure(110);
    pdf.text(r.n, pdf.m, 13, { font: 'tb' }); pdf.y += 18;
    pdf.p(`${r.c} · ${r.d.time} min · serves ${r.s} · ${Math.round(r.d.nut.kcal)} kcal, ${Math.round(r.d.nut.pro)} g protein per serving`, { size: 9, color: [0.45, 0.5, 0.45], gap: 2 });
    pdf.p(r.i.map(([i, q]) => (INGREDIENTS[i] ? `${fmtQty(INGREDIENTS[i], q, state.profile.units)} ${INGREDIENTS[i].name.toLowerCase()}` : `${q} ${i.slice(1)}`)).join(' · '), { size: 9.5, gap: 3 });
    r.st.forEach((st, i) => pdf.p(`${i + 1}. ${st}`, { size: 9.5, indent: 8, gap: 1 }));
    pdf.gap(8); pdf.rule(); pdf.gap(10);
  }
  download(`${plan.name.replace(/\W+/g, '-')}.pdf`, pdf.build(), 'application/pdf');
  toast('PDF downloaded');
}

function printPlan(plan) {
  const rows = plan.days.map((d) => `<tr><th>${fmtDay(d.date)}</th>${SLOTS.slice(0, 4).map((s) => `<td>${d.slots[s] ? esc(recipeById(d.slots[s].rid)?.n || '') + (d.slots[s].leftover ? ' (leftovers)' : '') : ''}</td>`).join('')}</tr>`).join('');
  printHTML(plan.name, `<h1>${esc(plan.name)}</h1><div class="sub">${fmtDay(plan.days[0].date)} – ${fmtDay(plan.days[plan.days.length - 1].date)}</div><table><tr><th>Day</th>${SLOTS.map((s) => `<th>${SLOT_LABEL[s]}</th>`).join('')}</tr>${rows}</table>`);
}

function planMenu(plan) {
  const m = modal({ title: plan.name, body: h('div.stack.sm', {},
    h('button.btn.ghost.block', { onclick: () => { m.close(); regenerate(plan); } }, '🔄 Regenerate with a new mix'),
    h('button.btn.ghost.block', { onclick: () => { m.close(); renamePlan(plan); } }, '✏️ Rename'),
    h('button.btn.ghost.block', { onclick: () => { m.close(); planPDF(plan); } }, '⬇ Download PDF'),
    h('button.btn.ghost.block', { onclick: () => { m.close(); printPlan(plan); } }, '🖨 Print'),
    h('button.btn.ghost.block', { onclick: () => { m.close(); doSharePlan(plan); } }, '📤 Share'),
    h('button.btn.danger.block', { onclick: async () => { m.close(); if (await confirmDialog(`Delete “${plan.name}”? Its grocery lists stay available.`, { okLabel: 'Delete', danger: true })) { commit((s) => { s.plans = s.plans.filter((p) => p.id !== plan.id); s.activePlanId = s.plans[0]?.id || null; }); toast('Plan deleted'); } } }, '🗑 Delete plan')) });
}

async function regenerate(plan) {
  if (!(await confirmDialog('Generate a fresh set of meals with the same settings? Manual swaps will be replaced.', { okLabel: 'Regenerate' }))) return;
  const np = generatePlan({ ...(plan.prefs || defaultPrefs()), name: plan.name, startDate: plan.days[0].date, seed: null });
  commit((s) => { const i = s.plans.findIndex((p) => p.id === plan.id); np.id = plan.id; s.plans[i] = np; s.lists.filter((l) => l.planId === plan.id).forEach((l) => { const fresh = newList(np, s, { name: l.name, from: l.from, to: l.to }); l.items = fresh.items; }); });
  toast('Fresh plan generated — grocery list updated');
}

function renamePlan(plan) {
  let name = plan.name;
  modal({ title: 'Rename plan', body: field('Plan name', h('input', { type: 'text', value: name, autofocus: true, oninput: (e) => (name = e.target.value) })), actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => commit((s) => { s.plans.find((p) => p.id === plan.id).name = name.trim() || plan.name; }) }] });
}
