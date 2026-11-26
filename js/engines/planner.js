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
import { rng, addDays, uid, hashStr, sum, today, parseISO } from '../lib/util.js';
import { aggregate, pantryTotals, packsFor, cookedSlots } from './grocery.js';
import { storeById, priceMult } from '../data/stores.js';
import { currentSeason, scale, CUISINE_FLAVORS, dailyCalories } from './nutrition.js';
import { cuisineWeight, flavorWeight } from './taste.js';
import { traits } from './variety.js';

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack / Treat' };
const SHARE = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 };

export const defaultPrefs = (profile = state.profile) => ({
  name: '', startDate: null, days: 7, slots: { breakfast: true, lunch: true, dinner: true }, snackFreq: 'none',
  budget: profile.weeklyBudget || null, household: profile.household || 2, mode: 'different', cuisines: [], diets: [...profile.diets],
  maxTime: null, usePantry: true, useTaste: true, store: profile.store || 'any', seed: null,
});

/* ------------------------------------------------------------------ constraints */
const stem = (w) => w.replace(/ies$/, 'y').replace(/(ch|sh|x|z|ss)es$/, '$1').replace(/s$/, '');
const SEAFOOD = ['salmon', 'white-fish', 'tilapia', 'halibut', 'mahi-mahi', 'trout', 'smoked-salmon', 'tuna-can', 'canned-salmon', 'sardines', 'anchovies', 'fish-sauce', 'shrimp', 'scallops', 'canned-crab'];
const GROUPS = {
  mushroom: ['portobello', 'shiitake'], seafood: SEAFOOD, fish: SEAFOOD.filter((x) => !['shrimp', 'scallops', 'canned-crab'].includes(x)), shellfish: ['shrimp', 'scallops', 'canned-crab'],
  nut: ['almonds', 'walnuts', 'cashews', 'pistachios', 'pecans', 'pine-nuts', 'hazelnuts', 'almond-butter', 'almond-flour', 'almond-milk', 'pesto', 'granola'],
  cheese: ['cheddar', 'parmesan', 'mozzarella', 'feta', 'goat-cheese', 'swiss', 'provolone', 'pepper-jack', 'gruyere', 'blue-cheese', 'queso-fresco', 'ricotta', 'cottage-cheese', 'cream-cheese', 'mascarpone', 'halloumi', 'paneer'],
  beef: ['ground-beef', 'steak', 'flank-steak', 'ribeye', 'beef-chuck', 'lean-ground-beef', 'beef-broth', 'beef-jerky'], pork: ['pork-chop', 'bacon', 'sausage', 'pork-tenderloin', 'pork-shoulder', 'ground-pork', 'ham', 'prosciutto', 'chorizo', 'pepperoni', 'breakfast-sausage', 'pork-rinds'],
  tomato: ['marinara', 'salsa', 'ketchup', 'tomato-paste', 'canned-tomatoes', 'tomato-sauce', 'crushed-tomatoes', 'sun-dried-tomatoes', 'enchilada-sauce'], dairy: ['milk', 'butter', 'cheddar', 'parmesan', 'mozzarella', 'feta', 'greek-yogurt', 'cottage-cheese', 'heavy-cream', 'sour-cream', 'cream-cheese', 'ricotta', 'goat-cheese', 'ghee', 'buttermilk', 'half-and-half'],
  spicy: ['jalapeno', 'cayenne', 'chili-powder', 'red-pepper-flakes', 'sriracha', 'hot-sauce', 'harissa', 'chipotle', 'gochujang', 'gochugaru', 'pickled-jalapenos', 'curry-paste', 'green-curry-paste'],
};
/** Does a disliked-ingredient entry (an id or free text) match this recipe ingredient? Whole-word, plural-tolerant: "egg" must not catch "eggplant". */
export function dislikeHit(term, id) {
  const t = String(term).toLowerCase().trim(); if (!t) return false;
  if (id === t) return true;
  const ing = INGREDIENTS[id]; const name = (ing?.name || id.replace('~', '')).toLowerCase();
  const tt = stem(t);
  if (/\s/.test(t)) return name.includes(t) || name.includes(tt);
  const words = [...name.split(/[^a-z]+/), ...id.replace('~', '').split('-')].filter(Boolean).map(stem);
  if (words.includes(tt)) return true;
  const g = GROUPS[tt]; return !!g && g.some((x) => id === x);
}

export function violations(r, profile = state.profile, diets = profile.diets) {
  const out = [];
  for (const a of profile.allergies) if (r.d.allergens.includes(a)) out.push({ type: 'allergy', code: a });
  for (const [id] of r.i) {
    const name = (INGREDIENTS[id]?.name || id.replace('~', '')).toLowerCase();
    for (const dl of profile.dislikes) if (dislikeHit(dl, id)) out.push({ type: 'dislike', code: dl, name });
  }
  for (const d of diets) if (!r.d.diets[d]) out.push({ type: 'diet', code: d });
  return out;
}
/** Auto-planning only uses recipes FOODIE can fully analyse when allergies or a diet are set — a custom recipe with free-text ingredients could hide an allergen. */
export const eligible = (r, prefs) => !state.dislikedRecipes.includes(r.id) && !(r.d.unverified && (state.profile.allergies.length || (prefs.diets || []).length)) && violations(r, state.profile, prefs.diets).length === 0;

/* ------------------------------------------------------------------ scoring context */
function makeCtx(prefs, planSoFar = null) {
  const profile = state.profile;
  const season = currentSeason(prefs.startDate ? parseISO(prefs.startDate) : new Date(), profile.hemisphere);   // season of the plan's own dates
  const mult = priceMult(prefs.store);
  const pan = prefs.usePantry ? pantryTotals(state.pantry) : new Map();
  const wantedSlots = SLOTS.filter((x) => (x === 'snack' ? prefs.snackFreq !== 'none' : prefs.slots[x]));
  const activeShare = wantedSlots.reduce((a, x) => a + SHARE[x], 0) || 1;
  const cal = dailyCalories(profile); const proTarget = +profile.protein || 0;
  const mealsPerDay = Object.values(prefs.slots).filter(Boolean).length + (prefs.snackFreq === 'daily' ? 1 : 0.4);
  const perServingBudget = prefs.budget ? prefs.budget / Math.max(1, prefs.days * mealsPerDay * prefs.household) : null;
  const usage = new Map(); const cuisineUse = new Map(); const basket = new Map(); const recentBySlot = { breakfast: [], lunch: [], dinner: [], snack: [] };
  const proteinUse = new Map(), formUse = new Map(), flavorUse = new Map(), dayInfo = new Map(), recentTraits = { breakfast: [], lunch: [], dinner: [], snack: [] };
  let cooked = 0;
  // flavors this person is drawn to: their favorite cuisines' flavors + what they've learned to like
  const liked = new Map();
  for (const c of profile.favCuisines) for (const f of CUISINE_FLAVORS[c] || []) liked.set(f, (liked.get(f) || 0) + 1);
  if (prefs.useTaste) for (const [f, w] of Object.entries(state.taste.flavor || {})) if (w > 0) liked.set(f, (liked.get(f) || 0) + Math.min(3, w * 0.4));
  const favSet = new Set(profile.favCuisines);
  // with few favorites (or a cuisine filter) variety across cuisines matters less than respecting the choice
  const narrow = (prefs.cuisines.length > 0 && prefs.cuisines.length <= 3) || favSet.size === 1;
  const pool = {};
  for (const slot of SLOTS) {
    let list = allRecipes().filter((r) => r.slots.includes(slot) && eligible(r, prefs));
    let relaxed = [];
    if (prefs.cuisines.length) { const f = list.filter((r) => prefs.cuisines.includes(r.c)); if (f.length >= 4) list = f; else relaxed.push('cuisine'); }
    if (prefs.maxTime) { const f = list.filter((r) => r.d.time <= prefs.maxTime); if (f.length >= 3) list = f; else relaxed.push('time'); }
    pool[slot] = { list, relaxed };
  }
  const note = (m, date = null, slot = null) => {
    if (!m || m.leftover) return;
    const r = recipeById(m.rid); if (!r) return;
    usage.set(r.id, (usage.get(r.id) || 0) + 1); cuisineUse.set(r.c, (cuisineUse.get(r.c) || 0) + 1); cooked++;
    const t = traits(r);
    proteinUse.set(t.protein, (proteinUse.get(t.protein) || 0) + 1); formUse.set(t.form, (formUse.get(t.form) || 0) + 1);
    for (const f of t.flavors) flavorUse.set(f, (flavorUse.get(f) || 0) + 1);
    if (slot) { recentTraits[slot].push({ c: r.c, ...t }); }
    if (date) { const di = dayInfo.get(date) || { cuisines: new Set(), proteins: new Set(), heavy: 0 }; di.cuisines.add(r.c); if (t.protein !== 'veg') di.proteins.add(t.protein); if (t.heavy) di.heavy++; dayInfo.set(date, di); }
    for (const [id] of r.i) { const ing = INGREDIENTS[id]; if (ing && !ing.flags.includes('Z') && !/Oils|Spices/.test(ing.aisle)) basket.set(id, (basket.get(id) || 0) + 1); }
  };
  if (planSoFar) for (const d of planSoFar.days) for (const [sl, m] of Object.entries(d.slots)) note(m, d.date, sl);

  const score = (r, slot, { prevCuisine, rnd, ignoreUsage = false, date = null } = {}) => {
    let s = 0;
    const t = traits(r);
    if (isFav(r.id)) s += 1.3;
    const rt = meta(r.id).rating; if (rt) s += (rt - 3) * 0.55;
    if (profile.favCuisines.includes(r.c)) s += profile.favCuisines.length <= 3 ? 2.3 : 1.4;   // fewer favorites = each one counts for more
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
    if (cal) { const target = cal * SHARE[slot] / activeShare; s -= (Math.abs(r.d.nut.kcal - target) / target) * 1.6; }   // shares are normalised to the meals actually planned
    else if (profile.goal === 'lose') s -= Math.max(0, r.d.nut.kcal - 550) / 400;
    if (proTarget) { const pt = proTarget * SHARE[slot] / activeShare; if (r.d.nut.pro < pt * 0.6) s -= (1 - r.d.nut.pro / pt) * 0.9; }
    if (profile.goal === 'gain') s += (Math.min(r.d.nut.pro, 45) / 45) * 0.9;
    if (profile.goal === 'healthy') s += Math.min(r.d.nut.fiber, 10) * 0.06;
    if (perServingBudget) { const c = r.d.cost * mult; s += c > perServingBudget * 1.2 ? -(c - perServingBudget) * 2.5 : 0.3; }
    // ---- variety (kept in balance with what the person actually likes) ----
    const rec = recentTraits[slot].slice(-3);
    for (let k = 0; k < rec.length; k++) { const w = k === rec.length - 1 ? 1 : 0.5; const o = rec[k]; if (t.protein !== 'veg' && o.protein === t.protein) s -= 1.5 * w; if (o.form === t.form && t.form !== 'plate') s -= 1.1 * w; if (o.c === r.c) s -= 0.7 * w; }
    if (cooked >= 3) {
      const pShare = (proteinUse.get(t.protein) || 0) / cooked; if (t.protein !== 'veg' && pShare > 0.3) s -= (pShare - 0.3) * 5;
      const fShare = (formUse.get(t.form) || 0) / cooked; if (t.form !== 'plate' && fShare > 0.22) s -= (fShare - 0.22) * 6;
      const cShare = (cuisineUse.get(r.c) || 0) / cooked; const cap = narrow ? 0.7 : favSet.has(r.c) ? 0.4 : 0.22; if (cShare > cap) s -= (cShare - cap) * 7;
    }
    if (!narrow) {
      if (!cuisineUse.has(r.c)) s += 0.8;                                  // try something new this plan…
      let fit = 0; for (const f of t.flavors) fit += liked.get(f) || 0;      // …but lean toward flavors this person enjoys
      s += Math.min(1.4, fit * 0.35);
      let fresh = 0; for (const f of t.flavors) if (!flavorUse.has(f)) fresh++; s += fresh * 0.25;   // flavor variety across the week
    }
    if (date) {
      const di = dayInfo.get(date);
      if (di) { if (di.cuisines.has(r.c)) s -= 1.1; if (t.protein !== 'veg' && di.proteins.has(t.protein)) s -= 1.2; if (t.heavy && di.heavy) s -= 1.2; if (t.light && !di.heavy && slot === 'dinner') s += 0.15; }
      const wd = parseISO(date).getDay(), weeknight = wd >= 1 && wd <= 4;
      if (slot === 'dinner' || slot === 'lunch') { if (weeknight && r.d.time > 50) s -= Math.min(2, (r.d.time - 50) / 25); if (!weeknight && r.d.time >= 45 && r.d.time <= 100 && slot === 'dinner') s += 0.35; }
      if (slot === 'breakfast' && wd >= 1 && wd <= 5 && r.d.time > 25) s -= Math.min(1.5, (r.d.time - 25) / 20);   // quick weekday breakfasts
    }
    s += (rnd ? rnd() : 0) * 0.8;
    return s;
  };
  return { pool, score, note, usage, recentBySlot, mult, pan, dayInfo, recentTraits };
}

/* ------------------------------------------------------------------ generation */
/** Pick from the best few candidates with probability weighted by score: always good, never the same top pick every time. */
function pickOne(list, scoreFn, rnd, k = 8, temp = 0.55) {
  const top = list.map((r) => ({ r, s: scoreFn(r) })).sort((a, b) => b.s - a.s).slice(0, k);
  const max = top[0].s; const w = top.map((x) => Math.exp((x.s - max) / temp)); let roll = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) { roll -= w[i]; if (roll <= 0) return top[i].r; }
  return top[0].r;
}

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
      const best = pickOne(list, (r) => ctx.score(r, slot, { prevCuisine: prevCuisine[slot], rnd, date }), rnd);
      const meal = { rid: best.id, servings: prefs.household, batch: 1, leftover: false, grp: uid('g'), done: false };
      slots[slot] = meal; ctx.note(meal, date, slot); ctx.recentBySlot[slot].push(best.id); prevCuisine[slot] = best.c;
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
  const ranked = ctx.pool[slot].list.filter((r) => r.id !== cur?.rid)
    .map((r) => ({ r, s: ctx.score(r, slot, { rnd, ignoreUsage: false, date }) })).sort((a, b) => b.s - a.s);
  // show a spread of cuisines instead of eight near-identical suggestions
  const out = [], per = new Map();
  for (const x of ranked) { if ((per.get(x.r.c) || 0) >= 2) continue; per.set(x.r.c, (per.get(x.r.c) || 0) + 1); out.push(x.r); if (out.length >= n) break; }
  return out;
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
  const mult = priceMult(plan.store);
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
