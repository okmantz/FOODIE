/**
 * Taste learning. FOODIE keeps weighted scores for cuisines, flavor notes and
 * price tiers, nudged by everything you do (quiz answers, favorites, saves,
 * dislikes, ratings, cooking, dining-out log). All data stays on your device.
 */
import { state, commit } from '../store.js';
import { CUISINE_FLAVORS } from './nutrition.js';
import { DISH_IDEAS } from '../data/restaurants.js';
import { sum } from '../lib/util.js';

const bump = (t, cat, key, d) => { if (!key) return; t[cat][key] = Math.round(((t[cat][key] || 0) + d) * 100) / 100; };

/** Adjust weights. `evt` is {cuisine, flavors[], price, w}. Call inside commit(). */
export function learn(s, { cuisines = [], flavors = [], price = null, w = 1 }) {
  const t = s.taste;
  cuisines.forEach((c) => bump(t, 'cuisine', c, w));
  flavors.forEach((f) => bump(t, 'flavor', f, w * 0.6));
  if (price) bump(t, 'price', String(price), w * 0.5);
}

export function learnFromRecipe(s, r, w) {
  learn(s, { cuisines: [r.c], flavors: CUISINE_FLAVORS[r.c] || [], w });
}
export function learnFromRestaurant(s, r, w) {
  learn(s, { cuisines: [r.cuisine], flavors: r.tags || CUISINE_FLAVORS[r.cuisine] || [], price: r.price, w });
}

export const cuisineWeight = (c) => state.taste.cuisine[c] || 0;
export const flavorWeight = (f) => state.taste.flavor[f] || 0;

export function topTaste(cat, n = 3) {
  return Object.entries(state.taste[cat]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export function preferredPrice() {
  const p = state.taste.price; const e = Object.entries(p).filter(([, v]) => v > 0);
  if (e.length) return +e.sort((a, b) => b[1] - a[1])[0][0];
  // fall back to dining history
  const log = state.diningLog.filter((l) => l.amount);
  if (log.length >= 3) { const avg = sum(log, (l) => +l.amount) / log.length; return avg < 15 ? 1 : avg < 30 ? 2 : avg < 55 ? 3 : 4; }
  return null;
}

const dietOK = (dish, diets) => {
  // dish.diet lists the diets a dish satisfies; only check diets we can judge on a dish
  const need = diets.filter((d) => ['vegan', 'vegetarian', 'pescatarian'].includes(d) || d === 'glutenFree');
  return need.filter((d) => {
    const key = d === 'glutenFree' ? 'gluten-free' : d;
    if (key === 'vegetarian') return !(dish.diet.includes('vegetarian') || dish.diet.includes('vegan'));
    if (key === 'pescatarian') return !(dish.diet.includes('pescatarian') || dish.diet.includes('vegetarian') || dish.diet.includes('vegan'));
    return !dish.diet.includes(key);
  });
};

/** Score a restaurant; returns {score, reasons[]}. Higher is better. */
export function scoreRestaurant(r, { maxDistance = Infinity } = {}) {
  const reasons = []; let score = 0;
  const cw = cuisineWeight(r.cuisine);
  if (cw > 0) { score += cw; reasons.push(`You tend to enjoy ${r.cuisine} food`); }
  if (cw < 0) score += cw;
  if (state.profile.favCuisines.includes(r.cuisine)) { score += 2; reasons.push(`${r.cuisine} is one of your favorite cuisines`); }
  const fl = (r.tags || []).filter((t) => flavorWeight(t) > 1);
  if (fl.length) { score += fl.reduce((a, t) => a + flavorWeight(t) * 0.5, 0); reasons.push(`Matches your taste for ${fl.slice(0, 2).join(' & ')} flavors`); }
  const pp = preferredPrice();
  if (pp && r.price) { const gap = Math.abs(pp - r.price); score += gap === 0 ? 1.2 : gap === 1 ? 0.2 : -1; if (gap === 0) reasons.push('Fits the price range you usually choose'); }
  if (r.rating) { score += (r.rating - 3.8) * 1.2; if (r.rating >= 4.5) reasons.push(`Highly rated (${r.rating.toFixed(1)}★)`); }
  if (r.distance != null) { score -= Math.min(2.5, r.distance * 0.25); if (r.distance <= 1.5) reasons.push('Close by'); }
  if (state.favorites.restaurants.includes(r.id)) { score += 2; reasons.push('One of your favorites'); }
  const visits = state.diningLog.filter((l) => l.rid === r.id).length;
  if (visits) { score += Math.min(2, visits * 0.5); reasons.push(`You've logged ${visits} visit${visits > 1 ? 's' : ''}`); }
  if (state.dislikedRestaurants.includes(r.id)) score -= 100;
  if (r.distance != null && r.distance > maxDistance) score -= 50;
  return { score, reasons };
}

export function dishesFor(r) {
  return r.dishes?.length ? r.dishes.map((d) => ({ ...d, real: true })) : (DISH_IDEAS[r.cuisine] || DISH_IDEAS.American).map((d) => ({ ...d, real: false }));
}

export function scoreDish(d, r) {
  let score = (d.tags || []).reduce((a, t) => a + flavorWeight(t), 0) * 0.6 + cuisineWeight(r.cuisine) * 0.5;
  if (state.dislikedDishes.includes(`${r.id}|${d.name}`)) score -= 100;
  if (state.savedDishes.some((x) => x.rid === r.id && x.name === d.name)) score += 2;
  const diets = state.profile.diets;
  const bad = dietOK(d, diets);
  if (bad.length && d.real) score -= 3;
  return { score, dietMismatch: d.real ? bad : [] };
}

export function recommendRestaurants(list, opts = {}) {
  return list.map((r) => ({ r, ...scoreRestaurant(r, opts) })).filter((x) => x.score > -50).sort((a, b) => b.score - a.score);
}

/** Result of finishing the quiz. */
export function quizResult(answers, QUIZ) {
  const cuisines = {}, flavors = {}; let price = null;
  answers.forEach((choice, i) => {
    const o = QUIZ[i][choice];
    (o.cuisines || []).forEach((c) => (cuisines[c] = (cuisines[c] || 0) + 1));
    (o.flavors || []).forEach((f) => (flavors[f] = (flavors[f] || 0) + 1));
    if (o.price) price = o.price;
  });
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return { cuisines: top(cuisines), flavors: top(flavors), price };
}

export function applyQuiz(result) {
  commit((s) => {
    result.cuisines.forEach(([c, n]) => learn(s, { cuisines: [c], w: n * 1.5 }));
    result.flavors.forEach(([f, n]) => learn(s, { flavors: [f], w: n * 1.2 }));
    if (result.price) learn(s, { price: result.price, w: 3 });
    s.quizHistory.unshift({ date: Date.now(), cuisines: result.cuisines.slice(0, 3).map((x) => x[0]), flavors: result.flavors.slice(0, 3).map((x) => x[0]), price: result.price });
    s.quizHistory = s.quizHistory.slice(0, 10);
  });
}
