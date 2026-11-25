/**
 * Recipe enrichment: nutrition, cost, allergens and diet flags are DERIVED from
 * the ingredient database, so they are always consistent with the ingredients.
 * Custom recipes may contain free-text "~name" lines that FOODIE cannot analyse;
 * those recipes are flagged `unverified` and the UI says so.
 */
import { INGREDIENTS, ALLERGENS } from '../data/ingredients.js';
import { BUILTIN_RECIPES } from '../data/recipes.js';
import { MORE_RECIPES } from '../data/recipes-more.js';
import { WORLD_RECIPES } from '../data/recipes-world.js';

const ANIMAL = ['M', 'F', 'S', 'D', 'E', 'H'];
export const DIETS = [
  { id: 'vegan', label: 'Vegan', icon: '🌱' },
  { id: 'vegetarian', label: 'Vegetarian', icon: '🥕' },
  { id: 'pescatarian', label: 'Pescatarian', icon: '🐟' },
  { id: 'keto', label: 'Keto', icon: '🥑' },
  { id: 'lowcarb', label: 'Low-carb', icon: '🥩' },
  { id: 'carnivore', label: 'Carnivore', icon: '🍖' },
  { id: 'glutenFree', label: 'Gluten-free', icon: '🌾' },
  { id: 'dairyFree', label: 'Dairy-free', icon: '🥛' },
  { id: 'nutFree', label: 'Nut-free', icon: '🥜' },
  { id: 'highProtein', label: 'High-protein', icon: '💪' },
];
export const DIET_LABEL = Object.fromEntries(DIETS.map((d) => [d.id, d.label]));
export const ALLERGEN_LABEL = Object.fromEntries(ALLERGENS.map((a) => [a.id, a.label]));

const DEFAULT_SLOTS = { breakfast: ['breakfast'], lunch: ['lunch'], dinner: ['dinner'], dessert: ['snack'], snack: ['snack'], smoothie: ['breakfast', 'snack'] };
export const TYPE_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', dessert: 'Dessert', snack: 'Snack', smoothie: 'Smoothie / Shake' };

const cache = new Map();

/** Compute derived data for one recipe. */
export function enrich(r) {
  const key = r.id + ':' + (r.updated || 0) + ':' + r.i.length + ':' + r.s;
  if (cache.has(key) && !r.custom) return cache.get(key);

  const tot = { kcal: 0, pro: 0, carb: 0, fat: 0, fiber: 0 };
  let cost = 0;
  const flags = new Set();
  const known = [];
  let unverified = false;
  let nonSeasoning = 0, nonSeasoningAnimal = 0;

  for (const [id, qty] of r.i) {
    const ing = INGREDIENTS[id];
    if (!ing) { unverified = true; continue; }
    known.push(id);
    const f = ing.kind === 'count' ? qty : qty / 100;
    tot.kcal += ing.kcal * f; tot.pro += ing.pro * f; tot.carb += ing.carb * f; tot.fat += ing.fat * f; tot.fiber += ing.fiber * f;
    cost += (ing.price / ing.pack) * qty;
    ing.flags.forEach((x) => flags.add(x));
    if (!ing.flags.includes('Z')) { nonSeasoning++; if (ing.flags.some((x) => ANIMAL.includes(x))) nonSeasoningAnimal++; }
  }
  const s = Math.max(1, r.s || 1);
  let per = { kcal: tot.kcal / s, pro: tot.pro / s, carb: tot.carb / s, fat: tot.fat / s, fiber: tot.fiber / s };
  let manualNutrition = false;
  if (r.nut && r.nut.kcal != null && r.nut.kcal !== '') {
    per = { kcal: +r.nut.kcal, pro: +r.nut.pro || 0, carb: +r.nut.carb || 0, fat: +r.nut.fat || 0, fiber: +r.nut.fiber || per.fiber };
    manualNutrition = true;
  }
  let costPer = cost / s;
  if (r.costPer != null && r.costPer !== '') costPer = +r.costPer;
  for (const a of r.allergens || []) flags.add(a);

  const net = Math.max(0, per.carb - per.fiber);
  const allergens = ALLERGENS.map((a) => a.id).filter((a) => flags.has(a));
  const hasMeat = flags.has('M'), hasFish = flags.has('F') || flags.has('S');
  const diets = {
    vegan: !ANIMAL.some((a) => flags.has(a)),
    vegetarian: !hasMeat && !hasFish,
    pescatarian: !hasMeat,
    keto: net <= 12,
    lowcarb: net <= 25,
    carnivore: nonSeasoning > 0 && nonSeasoningAnimal === nonSeasoning,
    glutenFree: !flags.has('G'),
    dairyFree: !flags.has('D'),
    nutFree: !flags.has('N') && !flags.has('P'),
    highProtein: per.pro >= 30,
  };
  const out = {
    ...r,
    slots: r.sl || DEFAULT_SLOTS[r.t] || ['dinner'],
    seasons: r.se || ['spring', 'summer', 'autumn', 'winter'],
    d: { nut: per, net, cost: costPer, costTotal: costPer * s, allergens, diets, time: (r.p || 0) + (r.k || 0), unverified, manualNutrition,
      easy: (r.p || 0) + (r.k || 0) <= 30 && r.i.length <= 9, ingIds: known },
  };
  if (!r.custom) cache.set(key, out);
  return out;
}

export const BUILTIN = [...BUILTIN_RECIPES, ...MORE_RECIPES, ...WORLD_RECIPES].map(enrich);

/** Scale factor for cooking `servings` of a recipe. */
export const scale = (r, servings) => servings / (r.s || 1);

export function dietCulprits(r, diet) {
  const list = (pred) => r.i.map(([id]) => INGREDIENTS[id]).filter((i) => i && pred(i)).map((i) => i.name.toLowerCase());
  const first = (arr) => [...new Set(arr)].slice(0, 3).join(', ');
  switch (diet) {
    case 'vegan': return first(list((i) => i.flags.some((f) => ANIMAL.includes(f))));
    case 'vegetarian': return first(list((i) => i.flags.includes('M') || i.flags.includes('F') || i.flags.includes('S')));
    case 'pescatarian': return first(list((i) => i.flags.includes('M')));
    case 'glutenFree': return first(list((i) => i.flags.includes('G')));
    case 'dairyFree': return first(list((i) => i.flags.includes('D')));
    case 'nutFree': return first(list((i) => i.flags.includes('N') || i.flags.includes('P')));
    case 'keto': return `about ${Math.round(r.d.net)} g net carbs per serving`;
    case 'lowcarb': return `about ${Math.round(r.d.net)} g net carbs per serving`;
    case 'carnivore': return first(list((i) => !i.flags.includes('Z') && !i.flags.some((f) => ANIMAL.includes(f))));
    case 'highProtein': return `${Math.round(r.d.nut.pro)} g protein per serving`;
    default: return '';
  }
}

export function currentSeason(date = new Date(), hemisphere = 'north') {
  const m = date.getMonth();
  const s = m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
  if (hemisphere === 'north') return s;
  return { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' }[s];
}

/**
 * Daily calorie target: the user's own number if set, otherwise an estimate from
 * body stats (Mifflin-St Jeor × activity, nudged by goal). Returns 0 when unknown.
 */
export function bodyEstimate(profile) {
  const b = profile.body || {};
  const age = +b.age, w = +b.weight, hgt = +b.height;
  if (!(age >= 14 && age <= 100 && w > 0 && hgt > 0)) return null;
  const kg = profile.units === 'metric' ? w : w * 0.45359237, cm = profile.units === 'metric' ? hgt : hgt * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (b.sex === 'm' ? 5 : -161);
  const tdee = bmr * (+b.activity || 1.375);
  const adj = profile.goal === 'lose' ? -Math.min(500, tdee * 0.2) : profile.goal === 'gain' ? 250 : 0;
  const floor = b.sex === 'm' ? 1500 : 1200;           // never suggest crash-diet numbers
  return { bmr: Math.round(bmr), tdee: Math.round(tdee / 10) * 10, target: Math.max(floor, Math.round((tdee + adj) / 50) * 50), kg };
}
export const dailyCalories = (profile) => +profile.calories || bodyEstimate(profile)?.target || 0;

export const CUISINES = ['American', 'Italian', 'Mexican', 'Thai', 'Indian', 'Japanese', 'Chinese', 'Korean', 'Mediterranean', 'Greek', 'Middle Eastern', 'French',
  'Vietnamese', 'Filipino', 'Indonesian', 'Malaysian', 'Southeast Asian', 'Taiwanese', 'Pakistani', 'Sri Lankan', 'Nepali', 'Turkish', 'Persian', 'Israeli', 'Moroccan', 'Ethiopian', 'West African', 'East African', 'South African',
  'Peruvian', 'Brazilian', 'Argentinian', 'Colombian', 'Venezuelan', 'Cuban', 'Caribbean', 'Spanish', 'Portuguese', 'German', 'Eastern European', 'Georgian', 'British', 'Scandinavian', 'Hawaiian', 'Cajun & Creole', 'Southern US'];

/** Flavor profile inferred from cuisine (used for taste learning). */
export const CUISINE_FLAVORS = {
  American: ['hearty', 'smoky'], Italian: ['hearty', 'creamy', 'tangy'], Mexican: ['spicy', 'tangy', 'fresh'], Thai: ['spicy', 'fresh', 'sweet'],
  Indian: ['spicy', 'creamy', 'hearty'], Japanese: ['umami', 'fresh', 'light'], Chinese: ['umami', 'savory', 'sweet'], Korean: ['spicy', 'umami', 'smoky'],
  Mediterranean: ['fresh', 'tangy', 'light'], Greek: ['fresh', 'tangy', 'hearty'], 'Middle Eastern': ['smoky', 'fresh', 'tangy'], French: ['creamy', 'hearty', 'savory'],
  Vietnamese: ['fresh', 'umami', 'light'], Filipino: ['savory', 'tangy', 'hearty'], Indonesian: ['spicy', 'sweet', 'savory'], Malaysian: ['spicy', 'creamy', 'fresh'], 'Southeast Asian': ['fresh', 'spicy', 'tangy'], Taiwanese: ['umami', 'savory', 'sweet'],
  Pakistani: ['spicy', 'hearty', 'creamy'], 'Sri Lankan': ['spicy', 'creamy', 'fresh'], Nepali: ['savory', 'spicy', 'light'], Turkish: ['smoky', 'fresh', 'hearty'], Persian: ['tangy', 'sweet', 'hearty'], Israeli: ['fresh', 'tangy', 'light'],
  Moroccan: ['sweet', 'smoky', 'hearty'], Ethiopian: ['spicy', 'hearty', 'smoky'], 'West African': ['spicy', 'hearty', 'savory'], 'East African': ['hearty', 'savory', 'smoky'], 'South African': ['sweet', 'smoky', 'hearty'],
  Peruvian: ['tangy', 'fresh', 'umami'], Brazilian: ['hearty', 'smoky', 'creamy'], Argentinian: ['smoky', 'savory', 'fresh'], Colombian: ['hearty', 'savory', 'fresh'], Venezuelan: ['hearty', 'savory', 'sweet'], Cuban: ['tangy', 'savory', 'hearty'], Caribbean: ['spicy', 'sweet', 'smoky'],
  Spanish: ['savory', 'smoky', 'fresh'], Portuguese: ['tangy', 'savory', 'hearty'], German: ['hearty', 'savory', 'tangy'], 'Eastern European': ['hearty', 'creamy', 'tangy'], Georgian: ['creamy', 'savory', 'hearty'], British: ['hearty', 'savory', 'creamy'],
  Scandinavian: ['light', 'fresh', 'creamy'], Hawaiian: ['sweet', 'umami', 'fresh'], 'Cajun & Creole': ['spicy', 'smoky', 'hearty'], 'Southern US': ['hearty', 'smoky', 'savory'],
};
export const FLAVORS = ['spicy', 'creamy', 'fresh', 'hearty', 'smoky', 'tangy', 'umami', 'light', 'sweet', 'savory'];
