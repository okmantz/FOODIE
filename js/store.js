/**
 * Central, local-first state. Everything lives in localStorage under one key.
 * Views read `state` and call `commit(mutator)`; subscribers re-render.
 */
import { enrich, BUILTIN } from './engines/nutrition.js';
import { SAMPLE_RESTAURANTS } from './data/restaurants.js';

const KEY = 'foodie:v1';
export const SCHEMA = 1;

export const defaults = () => ({
  v: SCHEMA,
  profile: {
    name: '', avatar: null, bio: '', diets: [], allergies: [], dislikes: [], favCuisines: [], favIngredients: [],
    goal: 'healthy', calories: '', protein: '', carbs: '', fat: '', weeklyBudget: 100, monthlyBudget: 400, diningBudget: 60,
    store: 'any', household: 2, units: 'us', theme: 'auto', hemisphere: 'north',
    mealTimes: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', snack: '15:30' }, coachOn: true,
    homeLoc: null, onboarded: false,
  },
  customRecipes: [],
  favorites: { recipes: [], restaurants: [] },
  recipeMeta: {},            // id -> {rating, review, notes, cooked, last}
  dislikedRecipes: [],
  plans: [], activePlanId: null,
  lists: [], activeListId: null,
  pantry: [],
  restaurants: SAMPLE_RESTAURANTS.map((r) => ({ ...r, sample: true })),
  savedDishes: [],           // {id, rid, restName, name, price, note}
  dislikedDishes: [],        // "rid|name"
  dislikedRestaurants: [],
  diningLog: [],             // {id, date, name, rid, cuisine, amount, dish, rating}
  taste: { cuisine: {}, flavor: {}, price: {} },
  quizHistory: [],
  dismissedTips: {},
  coachLog: [],
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const saved = JSON.parse(raw);
    const d = defaults();
    // shallow-merge so new fields added in later versions get defaults
    const merged = { ...d, ...saved, profile: { ...d.profile, ...(saved.profile || {}), mealTimes: { ...d.profile.mealTimes, ...(saved.profile?.mealTimes || {}) } },
      favorites: { ...d.favorites, ...(saved.favorites || {}) }, taste: { ...d.taste, ...(saved.taste || {}) } };
    return merged;
  } catch (e) {
    console.warn('FOODIE: could not read saved data, starting fresh', e);
    return defaults();
  }
}

export let state = load();
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

let saveErr = false;
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); saveErr = false; return true; } catch (e) {
    if (!saveErr) { saveErr = true; window.dispatchEvent(new CustomEvent('foodie:storage-error', { detail: e })); }
    return false;
  }
}

export function commit(mutator, { silent = false } = {}) {
  mutator(state);
  recipeCache = null;
  save();
  if (!silent) subs.forEach((fn) => fn(state));
}

export function replaceState(next) { state = { ...defaults(), ...next }; state.profile = { ...defaults().profile, ...(next.profile || {}) }; recipeCache = null; save(); subs.forEach((fn) => fn(state)); }
export function resetState() { localStorage.removeItem(KEY); state = defaults(); recipeCache = null; save(); subs.forEach((fn) => fn(state)); }
export const exportJSON = () => JSON.stringify({ app: 'FOODIE', exportedAt: new Date().toISOString(), data: state }, null, 1);
export const storageBytes = () => (localStorage.getItem(KEY) || '').length;

/* ---------- recipes (built-in + custom) ---------- */
let recipeCache = null;
export function allRecipes() {
  if (!recipeCache) {
    const custom = state.customRecipes.map((r) => enrich({ ...r, custom: true }));
    recipeCache = [...custom, ...BUILTIN];
    recipeCache.byId = new Map(recipeCache.map((r) => [r.id, r]));
  }
  return recipeCache;
}
export const recipeById = (id) => { allRecipes(); return recipeCache.byId.get(id); };

export const meta = (id) => state.recipeMeta[id] || {};
export const isFav = (id) => state.favorites.recipes.includes(id);
export const avgRating = (id) => meta(id).rating || 0;

export const activePlan = () => state.plans.find((p) => p.id === state.activePlanId) || null;
export const activeList = () => state.lists.find((l) => l.id === state.activeListId) || null;
