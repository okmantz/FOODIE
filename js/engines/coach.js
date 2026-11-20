/**
 * FOODIE Coach — a transparent, rule-based assistant (no AI model, no network).
 * It points out conflicts with your allergies, diet, goal and budget in a
 * friendly tone. It never blocks anything: every suggestion can be overridden.
 */
import { state, allRecipes, recipeById, isFav, meta, activePlan } from '../store.js';
import { DIET_LABEL, ALLERGEN_LABEL, dietCulprits, currentSeason } from './nutrition.js';
import { eligible, violations, planCost, mealsOn, SLOT_LABEL } from './planner.js';
import { pantryTotals } from './grocery.js';
import { INGREDIENTS } from '../data/ingredients.js';
import { storeById } from '../data/stores.js';
import { today, diffDays, addDays, startOfWeek, sum, fmtMins } from '../lib/util.js';

const SHARE = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1, dessert: 0.1, smoothie: 0.2 };

/** Evaluate one recipe against the profile. Returns [{level:'warn'|'note'|'good', text}] */
export function evaluateRecipe(r, { servings = null } = {}) {
  const p = state.profile; const out = [];
  const v = violations(r, p);
  for (const x of v) {
    if (x.type === 'allergy') out.push({ level: 'warn', text: `Heads up: this recipe contains ${ALLERGEN_LABEL[x.code].toLowerCase()}, which you listed as an allergy.` });
    if (x.type === 'diet') out.push({ level: 'warn', text: `This isn't ${DIET_LABEL[x.code].toLowerCase()} (${dietCulprits(r, x.code)}) — you can still use it, or look for a swap.` });
    if (x.type === 'dislike') out.push({ level: 'note', text: `Includes ${x.name}, which is on your “not a fan” list.` });
  }
  if (r.d.unverified) out.push({ level: 'note', text: 'This recipe has custom ingredients FOODIE can\'t analyze, so allergen and diet checks may be incomplete.' });
  const kcal = r.d.nut.kcal;
  const cal = +p.calories;
  const share = SHARE[r.t] || 0.3;
  if (cal) {
    const target = cal * share;
    const pct = Math.round((kcal / cal) * 100);
    if (kcal > target * 1.35) out.push({ level: 'note', text: `About ${Math.round(kcal)} kcal per serving (${pct}% of your daily goal) — a little more than a typical ${r.t}. A smaller portion or a lighter side balances it out.` });
  } else if (p.goal === 'lose' && kcal > 700) out.push({ level: 'note', text: `At roughly ${Math.round(kcal)} kcal a serving, this one is on the hearty side for a weight-loss goal. Adding veggies or a half portion keeps it in range.` });
  if (p.goal === 'gain' && r.d.nut.pro < 20 && ['breakfast', 'lunch', 'dinner'].includes(r.t)) out.push({ level: 'note', text: `Only ${Math.round(r.d.nut.pro)} g protein per serving — adding eggs, yogurt or a lean protein would help your muscle-gain goal.` });
  const perMeal = p.weeklyBudget ? p.weeklyBudget / (7 * 3 * (p.household || 1)) : null;
  if (perMeal && r.d.cost * storeById(p.store).mult > perMeal * 1.6) out.push({ level: 'note', text: `Roughly $${(r.d.cost * storeById(p.store).mult).toFixed(2)} per serving — above your usual per-meal budget.` });
  if (!out.length) {
    const goods = [];
    if (r.d.nut.pro >= 25) goods.push('protein-rich');
    if (r.d.nut.fiber >= 6) goods.push('high in fiber');
    if (r.d.time <= 25) goods.push('quick');
    out.push({ level: 'good', text: goods.length ? `Looks like a great fit — ${goods.join(', ')}.` : 'Looks like a good fit for your preferences.' });
  }
  return out;
}

/** True if there is anything that deserves a confirmation before adding. */
export const hasWarning = (r) => evaluateRecipe(r).some((n) => n.level === 'warn');

/* ------------------------------------------------------------------ suggestions */
function pantryCoverage(r, pan) {
  const main = r.i.filter(([id]) => INGREDIENTS[id] && !INGREDIENTS[id].flags.includes('Z'));
  if (!main.length) return 0;
  return main.filter(([id, q]) => (pan.get(id) || 0) >= q * 0.5).length / main.length;
}

export function expiringSoon(days = 3) {
  const t = today();
  return state.pantry.filter((p) => p.expires && diffDays(t, p.expires) <= days).sort((a, b) => a.expires.localeCompare(b.expires));
}

export function suggest({ types = null, maxTime = null, pantry = false, protein = false, cheap = false, season = false, exclude = [] } = {}, n = 3) {
  const pan = pantryTotals(state.pantry);
  const ssn = currentSeason(new Date(), state.profile.hemisphere);
  const exp = new Set(expiringSoon(4).map((p) => p.ing));
  const prefs = { diets: state.profile.diets };
  const recent = new Set(Object.entries(state.recipeMeta).filter(([, m]) => m.last && diffDays(m.last, today()) < 5).map(([id]) => id));
  return allRecipes()
    .filter((r) => eligible(r, prefs) && (!types || types.includes(r.t)) && (!maxTime || r.d.time <= maxTime) && !exclude.includes(r.id))
    .map((r) => {
      let s = (isFav(r.id) ? 1 : 0) + (meta(r.id).rating ? meta(r.id).rating - 3 : 0) + (state.profile.favCuisines.includes(r.c) ? 1 : 0) + (state.taste.cuisine[r.c] || 0) * 0.2;
      const cov = pantryCoverage(r, pan);
      if (pantry) s += cov * 4 + r.d.ingIds.filter((id) => exp.has(id)).length * 1.5;
      if (protein) s += Math.min(r.d.nut.pro, 50) / 10;
      if (cheap) s -= r.d.cost * 1.2;
      if (season && r.seasons.includes(ssn) && r.seasons.length < 4) s += 2;
      if (recent.has(r.id)) s -= 3;
      return { r, s: s + ((r.id.charCodeAt(0) * 7 + new Date().getDate()) % 10) * 0.05, cov };
    })
    .filter((x) => !pantry || x.cov >= 0.3)
    .sort((a, b) => b.s - a.s).slice(0, n);
}

export const COACH_PROMPTS = [
  { id: 'dinner', label: 'What should I make tonight?' },
  { id: 'quick', label: 'Something quick (≤ 20 min)' },
  { id: 'pantry', label: 'Use up my pantry' },
  { id: 'protein', label: 'High-protein ideas' },
  { id: 'cheap', label: 'Budget-friendly meals' },
  { id: 'season', label: 'What\'s in season?' },
  { id: 'today', label: 'Check today\'s plan' },
];

export function coachAnswer(intent) {
  const name = state.profile.name ? `, ${state.profile.name}` : '';
  const filters = { dinner: { types: ['dinner'] }, quick: { maxTime: 20, types: ['breakfast', 'lunch', 'dinner'] }, pantry: { pantry: true, types: ['breakfast', 'lunch', 'dinner'] },
    protein: { protein: true, types: ['breakfast', 'lunch', 'dinner'] }, cheap: { cheap: true, types: ['breakfast', 'lunch', 'dinner'] }, season: { season: true, types: ['breakfast', 'lunch', 'dinner', 'dessert'] } };
  if (intent === 'today') {
    const plan = activePlan(); const meals = plan ? mealsOn(plan, today()) : {};
    const entries = Object.entries(meals);
    if (!entries.length) return { text: `Nothing is planned for today yet${name}. Want a quick idea instead? Try “What should I make tonight?”`, ids: [] };
    const lines = []; let warns = 0;
    entries.forEach(([slot, m]) => { const r = recipeById(m.rid); const ev = evaluateRecipe(r).filter((x) => x.level !== 'good'); warns += ev.filter((x) => x.level === 'warn').length; lines.push(`${SLOT_LABEL[slot]}: ${r.n}${ev.length ? ' — ' + ev[0].text : ' — looks great'}`); });
    return { text: `Here's how today looks${name}:\n• ` + lines.join('\n• ') + (warns ? '\n\nNothing is locked in — swap anything you like, or keep it if it works for you.' : '\n\nNice balance. Enjoy!'), ids: entries.map(([, m]) => m.rid) };
  }
  const f = filters[intent] || {};
  const res = suggest(f, 3);
  if (!res.length) return { text: `I couldn't find a match with your current allergies and diet settings${name}. Try loosening a filter or adding your own recipe.`, ids: [] };
  const intro = { dinner: 'Here are three dinners that fit your preferences', quick: 'These come together fast', pantry: 'These make good use of what you already have', protein: 'These pack a solid amount of protein', cheap: 'These are easy on the wallet', season: `These are at their best in ${currentSeason(new Date(), state.profile.hemisphere)}` }[intent];
  const exp = expiringSoon(4);
  const extra = intent === 'pantry' && exp.length ? ` ${exp.length} pantry item${exp.length > 1 ? 's are' : ' is'} expiring soon, so I weighted those higher.` : '';
  return { text: `${intro}${name}:${extra}`, ids: res.map((x) => x.r.id), meta: res.map((x) => ({ id: x.r.id, note: pantryNote(x, intent) })) };
}
const pantryNote = (x, intent) => (intent === 'pantry' ? `${Math.round(x.cov * 100)}% of ingredients on hand` : intent === 'protein' ? `${Math.round(x.r.d.nut.pro)} g protein` : intent === 'cheap' ? `~$${x.r.d.cost.toFixed(2)}/serving` : fmtMins(x.r.d.time));

/* ------------------------------------------------------------------ dashboard tips */
export function dashboardTips() {
  const tips = []; const p = state.profile; const plan = activePlan(); const t = today();
  const add = (id, icon, title, text, action) => { if (!state.dismissedTips[id]) tips.push({ id, icon, title, text, action }); };
  if (!plan) add('no-plan', '🗓️', 'Let\'s plan your week', 'Answer a few quick questions and FOODIE builds breakfast, lunch and dinner with a matching grocery list.', { label: 'Plan meals', href: '#/planner' });
  if (plan) {
    const today_ = mealsOn(plan, t);
    if (!Object.keys(today_).length && plan.days.some((d) => d.date > t)) add('nothing-today-' + t, '🍽️', 'Open day today', 'No meals are planned for today. Want a suggestion that fits your goals?', { label: 'Get an idea', coach: 'dinner' });
    const end = plan.days[plan.days.length - 1]?.date;
    if (end && diffDays(t, end) <= 1 && diffDays(t, end) >= 0) add('plan-ending-' + end, '🔁', 'Your plan wraps up soon', 'Generate the next stretch while pantry leftovers are fresh — FOODIE will reuse them.', { label: 'Plan next', href: '#/planner' });
  }
  const exp = expiringSoon(3);
  if (exp.length) add('expiring-' + exp.map((e) => e.id).join(''), '⏳', `${exp.length} pantry ${exp.length > 1 ? 'items' : 'item'} to use soon`, 'Let\'s turn them into dinner and keep food waste low.', { label: 'Cook from pantry', coach: 'pantry' });
  if (plan && p.weeklyBudget) {
    const wk = startOfWeek(t); const c = planCost(plan, { usePantry: true, from: wk, to: addDays(wk, 6) });
    if (c.total > p.weeklyBudget * 1.1) add('budget-' + wk, '💡', 'This week runs above budget', `The estimate is about $${Math.round(c.total)} vs your $${p.weeklyBudget} goal. Swapping one or two meals can bring it back — your call.`, { label: 'Review plan', href: '#/planner' });
  }
  if (!p.onboarded || (!p.diets.length && !p.allergies.length && !p.favCuisines.length)) add('profile-incomplete', '🧑‍🍳', 'Tell me what you like', 'Add allergies, diets and favorite cuisines so every suggestion fits you.', { label: 'Set up profile', href: '#/profile' });
  if (!state.diningLog.length && state.favorites.restaurants.length === 0) add('discover-intro', '🧭', 'Not sure what to eat out?', 'Take the 7-question taste quiz and get restaurant and dish ideas.', { label: 'Take the quiz', href: '#/discover' });
  return tips.slice(0, 3);
}
