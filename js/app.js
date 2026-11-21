/** FOODIE — app shell: router, navigation, onboarding, coach drawer, share-import. */
import { h, $, $$, modal, toast, today, uid } from './lib/util.js';
import { state, commit, subscribe, activePlan } from './store.js';
import { thumb, chipGroup, field, go, recipeCard } from './ui.js';
import { DIETS, ALLERGEN_LABEL } from './engines/nutrition.js';
import { ALLERGENS } from './data/ingredients.js';
import { generatePlan, defaultPrefs } from './engines/planner.js';
import { newList } from './engines/grocery.js';
import { COACH_PROMPTS, coachAnswer } from './engines/coach.js';
import { unpack } from './lib/share.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPlanner } from './views/planner.js';
import { renderRecipes, renderRecipe, renderRecipeEditor } from './views/recipes.js';
import { renderGrocery } from './views/grocery.js';
import { renderPantry } from './views/pantry.js';
import { renderDiscover } from './views/discover.js';
import { renderInsights } from './views/insights.js';
import { renderProfile } from './views/profile.js';
import { handleImport } from './views/importer.js';
import { icon } from './lib/icons.js';
import { startOnce, locationBar } from './views/locationui.js';
import { initPlaces } from './engines/places.js';

const NAV = [
  { id: 'dashboard', label: 'Home', ico: 'home', hash: '#/' },
  { id: 'planner', label: 'Plan', ico: 'calendar', hash: '#/planner', full: 'Meal Planner' },
  { id: 'recipes', label: 'Recipes', ico: 'book', hash: '#/recipes' },
  { id: 'grocery', label: 'Shop', ico: 'cart', hash: '#/grocery', full: 'Grocery List' },
  { id: 'discover', label: 'Discover', ico: 'compass', hash: '#/discover', full: 'Discover & Eat Out' },
  { id: 'pantry', label: 'Pantry', ico: 'jar', hash: '#/pantry' },
  { id: 'insights', label: 'Insights', ico: 'chart', hash: '#/insights' },
  { id: 'profile', label: 'Profile', ico: 'user', hash: '#/profile', full: 'Profile & Coach' },
];

const ROUTES = [
  [/^$|^dashboard$/, 'dashboard', renderDashboard, 'Home'],
  [/^planner$/, 'planner', renderPlanner, 'Meal planner'],
  [/^recipes$/, 'recipes', renderRecipes, 'Recipes'],
  [/^recipe\/new$/, 'recipes', () => renderRecipeEditor(null), 'New recipe'],
  [/^recipe\/([^/]+)\/edit$/, 'recipes', (m) => renderRecipeEditor(m[1]), 'Edit recipe'],
  [/^recipe\/([^/]+)$/, 'recipes', (m) => renderRecipe(m[1]), 'Recipe'],
  [/^grocery$/, 'grocery', renderGrocery, 'Grocery list'],
  [/^pantry$/, 'pantry', renderPantry, 'Pantry'],
  [/^discover$/, 'discover', renderDiscover, 'Discover'],
  [/^insights$/, 'insights', renderInsights, 'Insights'],
  [/^profile$/, 'profile', renderProfile, 'Profile'],
];

let currentRoute = null, firstRender = true;

function applyTheme() { document.documentElement.dataset.theme = state.profile.theme || 'auto'; }

function renderShell() {
  const root = $('#root');
  const initial = (state.profile.name || 'You').trim().charAt(0).toUpperCase();
  const av = () => h('a.avatar', { href: '#/profile', 'aria-label': 'Profile' }, state.profile.avatar ? h('img', { src: state.profile.avatar, alt: '' }) : initial);
  const coachBtn = () => h('button.coach-fab', { 'aria-label': 'Open FOODIE Coach', onclick: openCoach }, h('img', { src: 'assets/coach-sm.png', alt: '' }));
  root.replaceChildren(
    h('a.skip', { href: '#main', onclick: (e) => { e.preventDefault(); $('#main').focus(); } }, 'Skip to content'),
    h('div#shell', {},
      h('aside.side', { 'aria-label': 'Primary' },
        h('a.brand', { href: '#/' }, h('img', { src: 'assets/coach-sm.png', alt: '' }), h('span', {}, 'FOOD', h('b', {}, 'IE'))),
        NAV.map((n) => h('a', { href: n.hash, dataset: { nav: n.id } }, h('span.ico', {}, icon(n.ico)), n.full || n.label)),
        h('div.grow'),
        h('button.coach-mini', { onclick: openCoach }, h('img', { src: 'assets/coach-sm.png', alt: '' }), h('span', {}, h('b', {}, 'FOODIE Coach'), h('div.tiny.muted', {}, 'Ask for ideas')))),
      h('div', {},
        h('header.topbar', {}, h('a.brand', { href: '#/' }, h('img', { src: 'assets/coach-sm.png', alt: '' }), h('span', {}, 'FOOD', h('b', {}, 'IE'))), h('div.spacer'), coachBtn(), av()),
        h('main#main', { tabindex: '-1' }, h('div.desk-top', {}, coachBtn(), av()), h('div#app'))),
      h('nav.bottom-nav', { 'aria-label': 'Primary' },
        NAV.slice(0, 5).map((n) => h('a', { href: n.hash, dataset: { nav: n.id } }, h('span.ico', {}, icon(n.ico)), n.label)),
        h('button', { onclick: openMore, 'aria-label': 'More' }, h('span.ico', {}, icon('menu')), 'More'))));
}

function openMore() {
  const m = modal({ title: 'More', body: h('div.more-sheet', { onclick: () => m.close() }, NAV.slice(5).map((n) => h('a', { href: n.hash }, icon(n.ico), n.full || n.label)), h('a', { href: '#/recipe/new' }, icon('plus'), 'Create a recipe')) });
}

function setActiveNav(id) { $$('[data-nav]').forEach((a) => { const on = a.dataset.nav === id; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }

export function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('import/')) { handleImport(hash.slice(7)); history.replaceState(null, '', location.pathname + location.search + '#/'); return route(); }
  const sy = window.scrollY;
  let matched = null;
  for (const [re, nav, fn, title] of ROUTES) { const m = hash.match(re); if (m) { matched = { nav, fn, title, m, key: hash }; break; } }
  if (!matched) matched = { nav: 'dashboard', fn: renderDashboard, title: 'Home', m: [], key: '' };
  const sameRoute = currentRoute === matched.key;
  currentRoute = matched.key;
  const view = matched.fn(matched.m);
  if (sameRoute) view.classList.remove('view');
  $('#app').replaceChildren(view);
  setActiveNav(matched.nav);
  document.title = `${matched.title} · FOODIE`;
  window.scrollTo(0, sameRoute ? sy : 0);
  if (!sameRoute && !firstRender) $('#main').focus({ preventScroll: true });
  firstRender = false;
}

/* ------------------------------------------------------------------ coach drawer */
let drawer;
function openCoach(intent) {
  if (drawer) { drawer.classList.add('in'); if (typeof intent === 'string') drawer.__ask?.(COACH_PROMPTS.find((p) => p.id === intent)); return; }
  const log = h('div.log', { 'aria-live': 'polite' });
  const say = (text, ids = [], metas = []) => {
    log.append(h('div.coach-line', {}, h('img', { src: 'assets/coach-sm.png', alt: '' }), h('div.stack.sm', { style: { flex: 1, minWidth: 0 } }, h('div.bubble', {}, text),
      ids.length ? h('div.stack.sm', {}, ids.map((id) => miniRecipe(id, metas.find((m) => m.id === id)?.note))) : null)));
    log.scrollTop = log.scrollHeight;
  };
  const ask = (p) => { log.append(h('div.bubble.me', {}, p.label)); const a = coachAnswer(p.id); say(a.text, a.ids, a.meta || []); };
  const close = () => { drawer.classList.remove('in'); };
  drawer = h('aside.coach-drawer', { role: 'dialog', 'aria-label': 'FOODIE Coach' },
    h('div.head', {}, h('img', { src: 'assets/coach-sm.png', alt: '' }), h('div.grow', {}, h('b.serif', { style: { fontSize: '1.15rem' } }, 'FOODIE Coach'), h('div.tiny.muted', {}, 'Built-in rules, not an AI model — private, on your device')), h('button.icon-btn', { 'aria-label': 'Close coach', onclick: close }, icon('x'))),
    log,
    h('div.foot', {}, h('div.chips', {}, COACH_PROMPTS.map((p) => h('button.chip.sm', { onclick: () => ask(p) }, p.label)))));
  document.body.append(drawer);
  say(`Hi${state.profile.name ? ' ' + state.profile.name : ''}! I'm your FOODIE Coach. I only make suggestions — you always have the final say. What would you like help with?`);
  requestAnimationFrame(() => drawer.classList.add('in'));
  drawer.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  drawer.__ask = ask;
  if (typeof intent === 'string') ask(COACH_PROMPTS.find((p) => p.id === intent));
}
import { recipeById } from './store.js';
function miniRecipe(id, note) {
  const r = recipeById(id); if (!r) return null;
  return h('a.meal-row', { href: `#/recipe/${r.id}` }, thumb(r, 'sm'), h('div.grow', {}, h('b', {}, r.n), h('div.small.muted', {}, note || `${r.c} · ${r.d.time} min`)), icon('chevron', { cls: 'dim' }));
}

/* ------------------------------------------------------------------ first run */
const STAPLES = [['salt', 500], ['pepper', 30], ['olive-oil', 400], ['veg-oil', 800], ['sugar', 700], ['flour', 1200], ['cumin', 30], ['paprika', 40], ['garlic-powder', 60], ['chili-powder', 40], ['oregano', 10], ['cinnamon', 40], ['baking-powder', 150], ['red-pepper-flakes', 25], ['italian-seasoning', 15], ['turmeric', 30], ['curry-powder', 50], ['garam-masala', 25]];

export function seedSampleWeek() {
  const p = state.profile;
  const prefs = { ...defaultPrefs(), name: 'Sample week', mode: 'leftovers', household: p.household || 2, budget: p.weeklyBudget || 100 };
  const plan = generatePlan(prefs);
  commit((s) => {
    s.plans.unshift(plan); s.activePlanId = plan.id;
    const list = newList(plan, s); s.lists.unshift(list); s.activeListId = list.id;
  });
}

function onboarding() {
  const draft = { name: '', household: 2, diets: [], allergies: [], goal: 'healthy', budget: 100, staples: true, sample: true };
  const body = h('div.stack', {},
    h('div.onboard-hero', {}, h('img', { src: 'assets/coach-sm.png', alt: '' }), h('div', {}, h('h2', {}, 'Welcome to FOODIE'), h('p.muted.small', { style: { margin: 0 } }, 'Healthy choices. Happy you. Everything stays on this device — no account needed.'))),
    field('What should we call you?', h('input', { type: 'text', placeholder: 'Your name (optional)', autocomplete: 'given-name', autofocus: true, oninput: (e) => (draft.name = e.target.value) })),
    h('div.grid.c2', {}, field('People you cook for', h('input', { type: 'number', min: 1, max: 12, value: 2, oninput: (e) => (draft.household = Math.max(1, Math.min(12, +e.target.value || 1))) })),
      field('Weekly grocery budget ($)', h('input', { type: 'number', min: 20, step: 5, value: 100, oninput: (e) => (draft.budget = +e.target.value || 100) }))),
    h('div.field', {}, h('label', {}, 'Your location'), locationBar({ showStats: false }), h('div.hint', {}, 'Used only while the app is open, to find real restaurants and grocery stores right where you are. Nothing is sent to an account.')),
    h('div.field', {}, h('label', {}, 'Eating style (optional)'), chipGroup({ options: DIETS.filter((d) => d.id !== 'highProtein').map((d) => ({ id: d.id, label: d.label, icon: d.icon })), value: draft.diets, onChange: (v) => (draft.diets = v), small: true })),
    h('div.field', {}, h('label', {}, 'Allergies (we\'ll keep these out of every plan)'), chipGroup({ options: ALLERGENS.map((a) => ({ id: a.id, label: a.label })), value: draft.allergies, onChange: (v) => (draft.allergies = v), small: true })),
    h('div.field', {}, h('label', {}, 'Goal'), chipGroup({ multi: false, options: [{ id: 'healthy', label: 'Eat healthier' }, { id: 'lose', label: 'Lose weight' }, { id: 'gain', label: 'Build muscle' }, { id: 'maintain', label: 'Maintain' }], value: draft.goal, onChange: (v) => (draft.goal = v || 'healthy'), small: true })),
    h('label.row', { style: { gap: '10px' } }, h('input', { type: 'checkbox', checked: true, onchange: (e) => (draft.staples = e.target.checked) }), h('span.small', {}, 'I have basic staples at home (salt, oil, flour, sugar, common spices)')),
    h('label.row', { style: { gap: '10px' } }, h('input', { type: 'checkbox', checked: true, onchange: (e) => (draft.sample = e.target.checked) }), h('span.small', {}, 'Start me with a sample week and grocery list so I can explore')));
  const finish = (skip) => {
    commit((s) => {
      const p = s.profile;
      if (!skip) { p.name = draft.name.trim(); p.household = draft.household; p.diets = draft.diets; p.allergies = draft.allergies; p.goal = draft.goal; p.weeklyBudget = draft.budget; p.monthlyBudget = Math.round(draft.budget * 4.33); }
      p.onboarded = true;
      if (skip ? true : draft.staples) s.pantry = STAPLES.map(([ing, qty]) => ({ id: uid('p'), ing, qty, expires: null, staple: true }));
    });
    applyTheme(); renderShell();
    if (skip || draft.sample) seedSampleWeek();
    route();
    toast('All set — explore your sample week!');
  };
  modal({ title: 'Let\'s set up your kitchen', body, wide: false, onClose: () => { if (!state.profile.onboarded) finish(true); },
    actions: [{ label: 'Skip for now', onClick: () => finish(true) }, { label: 'Start cooking', primary: true, onClick: () => finish(false) }] });
}

/* ------------------------------------------------------------------ boot */
export function boot() {
  applyTheme();
  renderShell();
  startOnce(); initPlaces();
  subscribe(() => { applyTheme(); const sc = window.scrollY; refreshChrome(); route(); });
  window.addEventListener('hashchange', route);
  window.addEventListener('foodie:storage-error', () => toast('Your browser storage is full — export a backup from Profile → Data and remove large photos.', { ms: 7000 }));
  route();
  if (!state.profile.onboarded) onboarding();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function refreshChrome() {
  const initial = (state.profile.name || 'You').trim().charAt(0).toUpperCase();
  $$('.avatar').forEach((a) => { a.replaceChildren(...(state.profile.avatar ? [h('img', { src: state.profile.avatar, alt: '' })] : [document.createTextNode(initial)])); });
}

window.FOODIE = { openCoach };
