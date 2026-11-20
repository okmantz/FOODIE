/**
 * Smart meal planner.
 *
 * Hard rules (never relaxed): allergies, disliked ingredients, selected diets,
 * recipes you've marked as disliked.
 * Soft scoring: your favorite cuisines & learned taste, ratings, ingredient
 * reuse across the plan, what's already in your pantry, season, calorie /
 * protein goals, per-meal budget, variety. A budget pass then swaps in cheaper
 * recipes while the basket is over budget.
 */
import { state, allRecipes, recipeById, isFav, meta } from '../store.js';
import { INGREDIENTS } from '../data/ingredients.js';
import { rng, addDays, uid, hashStr, sum, today } from '../lib/util.js';
import { aggregate, pantryTotals, packsFor, cookedSlots } from './grocery.js';
import { storeById } from '../data/stores.js';
import { currentSeason, scale, CUISINE_FLAVORS } from './nutrition.js';
import { cuisineWeight, flavorWeight } from './taste.js';

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack / Treat' };
const SHARE = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 };

export const defaultPrefs = (profile = state.profile) => ({
  name: '', startDate: null, days: 7, slots: { breakfast: true, lunch: true, dinner: true }, snackFreq: 'none',
  budget: profile.weeklyBudget || null, household: profile.household || 2, mode: 'different', cuisines: [], diets: [...profile.diets],
  maxTime: null, usePantry: true, useTaste: true, store: profile.store || 'any', seed: null,
});

/* ------------------------------------------------------------------ constraints */
export function violations(r, profile = state.profile, diets = profile.diets) {
  const out = [];
  for (const a of profile.allergies) if (r.d.allergens.includes(a)) out.push({ type: 'allergy', code: a });
  for (const [id] of r.i) {
    const name = (INGREDIENTS[id]?.name || id.replace('~', '')).toLowerCase();
    for (const dl of profile.dislikes) if (id === dl || name.includes(String(dl).toLowerCase())) out.push({ type: 'dislike', code: dl, name });
  }
  for (const d of diets) if (!r.d.diets[d]) out.push({ type: 'diet', code: d });
  return out;
}
export const eligible = (r, prefs) => !state.dislikedRecipes.includes(r.id) && violations(r, state.profile, prefs.diets).length === 0;

/* ------------------------------------------------------------------ scoring context */
function makeCtx(prefs, planSoFar = null) {
  const profile = state.profile;
  const season = currentSeason(new Date(), profile.hemisphere);
  const mult = storeById(prefs.store).mult;
  const pan = prefs.usePantry ? pantryTotals(state.pantry) : new Map();
  const mealsPerDay = Object.values(prefs.slots).filter(Boolean).length + (prefs.snackFreq === 'daily' ? 1 : 0.4);
  const perServingBudget = prefs.budget ? prefs.budget / Math.max(1, prefs.days * mealsPerDay * prefs.household) : null;
  const usage = new Map(); const cuisineUse = new Map(); const basket = new Map(); const recentBySlot = { breakfast: [], lunch: [], dinner: [], snack: [] };
  const pool = {};
  for (const slot of SLOTS) {
    let list = allRecipes().filter((r) => r.slots.includes(slot) && eligible(r, prefs));
    let relaxed = [];
    if (prefs.cuisines.length) { const f = list.filter((r) => prefs.cuisines.includes(r.c)); if (f.length >= 4) list = f; else relaxed.push('cuisine'); }
    if (prefs.maxTime) { const f = list.filter((r) => r.d.time <= prefs.maxTime); if (f.length >= 3) list = f; else relaxed.push('time'); }
    pool[slot] = { list, relaxed };
  }
  const note = (m) => {
    if (!m || m.leftover) return;
    const r = recipeById(m.rid); if (!r) return;
    usage.set(r.id, (usage.get(r.id) || 0) + 1); cuisineUse.set(r.c, (cuisineUse.get(r.c) || 0) + 1);
    for (const [id] of r.i) { const ing = INGREDIENTS[id]; if (ing && !ing.flags.includes('Z') && !/Oils|Spices/.test(ing.aisle)) basket.set(id, (basket.get(id) || 0) + 1); }
  };
  if (planSoFar) for (const d of planSoFar.days) for (const m of Object.values(d.slots)) note(m);

  const score = (r, slot, { prevCuisine, rnd, ignoreUsage = false } = {}) => {
    let s = 0;
    if (isFav(r.id)) s += 1.3;
    const rt = meta(r.id).rating; if (rt) s += (rt - 3) * 0.55;
    if (profile.favCuisines.includes(r.c)) s += 1.2;
    if (prefs.useTaste) { s += Math.max(-2, Math.min(3, cuisineWeight(r.c) * 0.25)); s += Math.min(1, (CUISINE_FLAVORS[r.c] || []).reduce((a, f) => a + flavorWeight(f), 0) * 0.04); }
    if (!ignoreUsage) { const u = usage.get(r.id) || 0; s -= u * (prefs.mode === 'leftovers' ? 2.5 : 5); if (recentBySlot[slot].slice(-4).includes(r.id)) s -= 6; }
    if (prevCuisine && prevCuisine === r.c) s -= 0.9;
    s -= (cuisineUse.get(r.c) || 0) * 0.12;
    // reuse of ingredients already in the basket => less waste
    let overlap = 0; for (const id of r.d.ingIds) if (basket.has(id)) overlap++;
    s += Math.min(5, overlap) * 0.55;
    if (profile.favIngredients.length) s += Math.min(2, r.d.ingIds.filter((id) => profile.favIngredients.includes(id)).length * 0.7);
    if (prefs.usePantry && pan.size) { const main = r.i.filter(([id]) => INGREDIENTS[id] && !INGREDIENTS[id].flags.includes('Z')); const have = main.filter(([id, q]) => (pan.get(id) || 0) >= q * 0.5).length; s += (main.length ? have / main.length : 0) * 2.5; }
    if (r.seasons.length < 4) s += r.seasons.includes(season) ? 0.7 : -0.9;
    const cal = +profile.calories;
    if (cal) { const target = cal * SHARE[slot]; s -= (Math.abs(r.d.nut.kcal - target) / target) * 1.6; }
    else if (profile.goal === 'lose') s -= Math.max(0, r.d.nut.kcal - 550) / 400;
    if (profile.goal === 'gain') s += (Math.min(r.d.nut.pro, 45) / 45) * 0.9;
    if (profile.goal === 'healthy') s += Math.min(r.d.nut.fiber, 10) * 0.06;
    if (perServingBudget) { const c = r.d.cost * mult; s += c > perServingBudget * 1.2 ? -(c - perServingBudget) * 2.5 : 0.3; }
    s += (rnd ? rnd() : 0) * 1.0;
    return s;
  };
  return { pool, score, note, usage, recentBySlot, mult, pan };
}

/* ------------------------------------------------------------------ generation */
export function generatePlan(prefs) {
  const seed = prefs.seed ?? hashStr(JSON.stringify(prefs) + Date.now());
  const rnd = rng(seed);
  const start = prefs.startDate || today();
  const ctx = makeCtx(prefs);
  const warnings = [];
  const days = [];
  const wanted = SLOTS.filter((s) => (s === 'snack' ? prefs.snackFreq !== 'none' : prefs.slots[s]));
  for (const s of wanted) if (!ctx.pool[s].list.length) warnings.push(`No ${SLOT_LABEL[s].toLowerCase()} recipes match your allergies, dislikes and diet choices, so that meal was skipped. Try removing a diet filter or adding your own recipe.`);
  for (const s of wanted) for (const rlx of ctx.pool[s].relaxed) warnings.push(`Not enough ${SLOT_LABEL[s].toLowerCase()} recipes matched your ${rlx} filter, so we widened it for that meal.`);

  const prevCuisine = {};
  for (let i = 0; i < prefs.days; i++) {
    const date = addDays(start, i);
    const slots = {};
    for (const slot of wanted) {
      if (slot === 'snack') {
        const on = prefs.snackFreq === 'daily' || (prefs.snackFreq === 'some' && [1, 3, 5].includes(i % 7));
        if (!on) continue;
      }
      const list = ctx.pool[slot].list; if (!list.length) continue;
      // leftovers: second day of a pair re-uses lunch/dinner
      const prev = days[i - 1]?.slots[slot];
      if (prefs.mode === 'leftovers' && i % 2 === 1 && (slot === 'lunch' || slot === 'dinner') && prev && !prev.leftover) {
        slots[slot] = { rid: prev.rid, servings: prefs.household, leftover: true, grp: prev.grp, done: false };
        prev.batch = 2;
        continue;
      }
      let best = null, bs = -Infinity;
      for (const r of list) { const sc = ctx.score(r, slot, { prevCuisine: prevCuisine[slot], rnd }); if (sc > bs) { bs = sc; best = r; } }
      const meal = { rid: best.id, servings: prefs.household, batch: 1, leftover: false, grp: uid('g'), done: false };
      slots[slot] = meal; ctx.note(meal); ctx.recentBySlot[slot].push(best.id); prevCuisine[slot] = best.c;
    }
    days.push({ date, slots });
  }

  const plan = { id: uid('plan'), name: prefs.name || `${prefs.days === 7 ? 'Week' : prefs.days === 14 ? 'Two weeks' : prefs.days === 30 ? 'Month' : prefs.days + ' days'} of meals`,
    createdAt: Date.now(), startDate: start, days, prefs: { ...prefs, seed }, store: prefs.store, household: prefs.household, budget: prefs.budget, warnings: [] };

  if (prefs.budget) {
    budgetPass(plan, ctx, rnd, 2);
    // still well over budget? allow a few more repeats (cooking the same dish more often is the honest way to save)
    if (planCost(plan, { usePantry: prefs.usePantry }).total > prefs.budget * 1.1) budgetPass(plan, ctx, rnd, 3);
  }
  const cost = planCost(plan, { usePantry: prefs.usePantry });
  if (prefs.budget && cost.total > prefs.budget * 1.02) warnings.push(`The cheapest combination we found is about $${Math.round(cost.total)}, a little over your $${Math.round(prefs.budget)} budget. ${prefs.mode === 'leftovers' ? 'Fewer meals, a smaller household count' : 'Leftovers mode, fewer meals'}, or a lower-cost store can help.`);
  plan.warnings = warnings;
  return plan;
}

/** Swap in cheaper recipes (whole cook-groups) while the basket is over budget. */
function budgetPass(plan, ctx, rnd, capPerWeek = 2) {
  const prefs = plan.prefs;
  let cost = planCost(plan, { usePantry: prefs.usePantry }).total;
  for (let iter = 0; iter < 25 && cost > prefs.budget; iter++) {
    let bestMove = null, bestCost = cost;
    const groups = new Map();
    plan.days.forEach((d) => Object.entries(d.slots).forEach(([slot, m]) => { if (!m.leftover) groups.set(m.grp, { slot, m }); }));
    // keep variety: a recipe may be cooked at most twice per 7 days (counted by cook-groups)
    const uses = new Map(); for (const { m } of groups.values()) uses.set(m.rid, (uses.get(m.rid) || 0) + 1);
    const cap = Math.max(2, Math.ceil(prefs.days / 7) * capPerWeek);
    for (const { slot, m } of groups.values()) {
      const cur = recipeById(m.rid);
      const cands = ctx.pool[slot].list.filter((r) => r.id !== m.rid && (uses.get(r.id) || 0) < cap && r.d.cost < cur.d.cost * 0.88).sort((a, b) => a.d.cost - b.d.cost).slice(0, 6);
      for (const c of cands) {
        const old = m.rid; m.rid = c.id;
        const t = planCost(plan, { usePantry: prefs.usePantry }).total;
        m.rid = old;
        if (t < bestCost - 0.05) { bestCost = t; bestMove = { m, rid: c.id }; }
      }
    }
    if (!bestMove) break;
    plan.days.forEach((d) => Object.values(d.slots).forEach((mm) => { if (mm.grp === bestMove.m.grp) mm.rid = bestMove.rid; }));
    cost = bestCost;
  }
}

/* ------------------------------------------------------------------ swapping */
export function alternatives(plan, date, slot, n = 8) {
  const prefs = plan.prefs; const ctx = makeCtx(prefs, plan);
  const cur = plan.days.find((d) => d.date === date)?.slots[slot];
  const rnd = rng(hashStr(date + slot + (cur?.rid || '')));
  return ctx.pool[slot].list.filter((r) => r.id !== cur?.rid)
    .map((r) => ({ r, s: ctx.score(r, slot, { rnd, ignoreUsage: false }) })).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.r);
}

/** Replace a meal (and its linked leftovers). */
export function swapMeal(plan, date, slot, rid) {
  const m = plan.days.find((d) => d.date === date)?.slots[slot]; if (!m) return;
  plan.days.forEach((d) => Object.values(d.slots).forEach((x) => { if (x.grp === m.grp) x.rid = rid; }));
}

export function setMeal(plan, date, slot, rid) {
  const d = plan.days.find((x) => x.date === date); if (!d) return;
  d.slots[slot] = { rid, servings: plan.household, batch: 1, leftover: false, grp: uid('g'), done: false };
}

export function removeMeal(plan, date, slot) {
  const d = plan.days.find((x) => x.date === date); const m = d?.slots[slot]; if (!m) return;
  if (!m.leftover) {
    // promote the first leftover (if any) to a cooked meal so nothing is orphaned
    const lo = plan.days.flatMap((dd) => Object.entries(dd.slots).filter(([, x]) => x.leftover && x.grp === m.grp).map(([s, x]) => x));
    if (lo.length) { lo[0].leftover = false; lo[0].batch = lo.length > 1 ? 2 : 1; }
  }
  delete d.slots[slot];
  fixBatches(plan);
}

export function fixBatches(plan) {
  const count = new Map();
  plan.days.forEach((d) => Object.values(d.slots).forEach((m) => { count.set(m.grp, (count.get(m.grp) || 0) + 1); }));
  plan.days.forEach((d) => Object.values(d.slots).forEach((m) => { if (!m.leftover) m.batch = count.get(m.grp) || 1; }));
}

/* ------------------------------------------------------------------ cost & nutrition */
export function planCost(plan, { usePantry = false, from = null, to = null } = {}) {
  const slots = cookedSlots(plan, from, to);
  const { ing } = aggregate(slots);
  const mult = storeById(plan.store).mult;
  const pan = usePantry ? pantryTotals(state.pantry) : new Map();
  let total = 0;
  for (const e of ing.values()) {
    const def = INGREDIENTS[e.id];
    total += packsFor(def, Math.max(0, e.qty - (pan.get(e.id) || 0))) * def.price * mult;
  }
  const meals = plan.days.reduce((a, d) => a + Object.keys(d.slots).length, 0);
  const people = plan.household || 1;
  return { total, meals, perServing: meals ? total / (meals * people) : 0 };
}

export function dayNutrition(day) {
  const t = { kcal: 0, pro: 0, carb: 0, fat: 0, fiber: 0 };
  for (const m of Object.values(day.slots)) {
    const r = recipeById(m.rid); if (!r) continue;
    for (const k of Object.keys(t)) t[k] += r.d.nut[k];
  }
  return t;
}

export function planNutritionAvg(plan, from = null, to = null) {
  const days = plan.days.filter((d) => (!from || d.date >= from) && (!to || d.date <= to) && Object.keys(d.slots).length);
  const t = { kcal: 0, pro: 0, carb: 0, fat: 0, fiber: 0 };
  days.forEach((d) => { const n = dayNutrition(d); for (const k in t) t[k] += n[k]; });
  for (const k in t) t[k] = days.length ? t[k] / days.length : 0;
  return { avg: t, days: days.length };
}

export const mealsOn = (plan, date) => plan?.days.find((d) => d.date === date)?.slots || {};
export function allMeals(plan) {
  const out = [];
  plan.days.forEach((d) => SLOTS.forEach((s) => { const m = d.slots[s]; if (m) out.push({ date: d.date, slot: s, ...m }); }));
  return out;
}
export { scale };
