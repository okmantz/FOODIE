/** Import shared recipes, plans and grocery lists from FOODIE share links. */
import { h, modal, toast, uid, fmtDay } from '../lib/util.js';
import { state, commit, recipeById } from '../store.js';
import { unpack } from '../lib/share.js';
import { enrich } from '../engines/nutrition.js';
import { go } from '../ui.js';

const sanitizeRecipe = (r) => ({ id: uid('r'), n: String(r.n || 'Imported recipe').slice(0, 120), c: String(r.c || 'American').slice(0, 40), t: ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'smoothie'].includes(r.t) ? r.t : 'dinner',
  e: String(r.e || '🍽️').slice(0, 6), p: +r.p || 0, k: +r.k || 0, s: Math.max(1, +r.s || 1), i: (Array.isArray(r.i) ? r.i : []).slice(0, 60).map(([a, b]) => [String(a), typeof b === 'number' ? b : String(b)]),
  st: (Array.isArray(r.st) ? r.st : []).slice(0, 40).map((x) => String(x).slice(0, 600)), tip: r.tip ? String(r.tip).slice(0, 400) : undefined, sl: r.sl, se: r.se, nut: r.nut, costPer: r.costPer, allergens: Array.isArray(r.allergens) ? r.allergens : [],
  photo: typeof r.photo === 'string' && r.photo.startsWith('data:image/') ? r.photo : undefined, custom: true, updated: Date.now() });

export async function handleImport(code) {
  let msg;
  try { msg = await unpack(code); } catch { toast('That share link looks damaged or incomplete'); return; }
  if (!msg || !msg.k || !msg.d) { toast('Unrecognized share link'); return; }
  if (msg.k === 'recipe') {
    const r = sanitizeRecipe(msg.d);
    modal({ title: 'Import recipe', body: h('div.stack', {}, h('p', {}, 'Someone shared a recipe with you:'), h('div.card.flat', {}, h('b', {}, r.n), h('div.small.muted', {}, `${r.c} · ${r.i.length} ingredients · ${r.st.length} steps`)), h('p.small.muted', {}, 'It will be saved to your own recipes.')),
      actions: [{ label: 'Cancel' }, { label: 'Save to my recipes', primary: true, onClick: () => { commit((s) => s.customRecipes.unshift(r)); toast('Recipe imported'); go(`#/recipe/${r.id}`); } }] });
  } else if (msg.k === 'plan') {
    const { plan, recipes = [] } = msg.d;
    if (!plan?.days) { toast('That plan couldn\'t be read'); return; }
    const idMap = new Map();
    const fresh = recipes.map((r) => { const n = sanitizeRecipe(r); idMap.set(r.id, n.id); return n; });
    modal({ title: 'Import meal plan', body: h('div.stack', {}, h('p', {}, 'Someone shared a meal plan:'), h('div.card.flat', {}, h('b', {}, plan.name), h('div.small.muted', {}, `${plan.days.length} days from ${fmtDay(plan.days[0].date)}`)), h('p.small.muted', {}, 'It becomes your active plan. Your existing plans are kept.')),
      actions: [{ label: 'Cancel' }, { label: 'Import plan', primary: true, onClick: () => {
        const np = { ...plan, id: uid('plan'), name: plan.name + ' (shared)', createdAt: Date.now(), warnings: [], days: plan.days.map((d) => ({ date: d.date, slots: Object.fromEntries(Object.entries(d.slots).map(([k, m]) => [k, { ...m, rid: idMap.get(m.rid) || m.rid, done: false }]).filter(([, m]) => recipeById(m.rid) || fresh.some((f) => f.id === m.rid))) })) };
        commit((s) => { s.customRecipes.unshift(...fresh); s.plans.unshift(np); s.activePlanId = np.id; });
        toast('Plan imported'); go('#/planner');
      } }] });
  } else if (msg.k === 'list') {
    const l = msg.d;
    modal({ title: 'Import grocery list', body: h('div.stack', {}, h('p', {}, 'Someone shared a grocery list:'), h('div.card.flat', {}, h('b', {}, l.name), h('div.small.muted', {}, `${(l.items || []).length} items`))),
      actions: [{ label: 'Cancel' }, { label: 'Import list', primary: true, onClick: () => {
        const list = { id: uid('list'), name: (l.name || 'Shared list') + ' (shared)', planId: null, createdAt: Date.now(), store: l.store || 'any', items: (l.items || []).map((i) => ({ ...i, key: i.ing ? i.key : 'm:' + uid('i'), manual: i.ing ? false : true, qtyText: i.qtyText || i.text || '', pantry: 0, checked: false, have: false })) };
        commit((s) => { s.lists.unshift(list); s.activeListId = list.id; }); toast('List imported'); go('#/grocery');
      } }] });
  } else toast('Unrecognized share link');
}
