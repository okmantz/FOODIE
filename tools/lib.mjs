/** Shared helpers for the recipe generator: seeded RNG, quantity rounding, wording, QC. */
import { INGREDIENTS as I, PREP_VERB } from '../js/data/ingredients.js';

export const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
export function rng(seed) { let a = (typeof seed === 'string' ? hash(seed) : seed) >>> 0 || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pickN = (arr, n, r) => shuffle(arr, r).slice(0, n);
export const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
export const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Round a quantity sensibly for the ingredient's base unit. */
export function rq(id, q) {
  const kind = I[id].kind;
  if (kind === 'count') { if (id === 'garlic') return Math.max(1, Math.round(q)); return Math.max(0.5, Math.round(q * 2) / 2); }
  if (q < 3) return Math.max(0.5, Math.round(q * 2) / 2);
  if (q < 20) return Math.round(q);
  return Math.round(q / 5) * 5;
}

/** Plain-English list: a, b and c */
export const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const PHR = { lemon: 'lemon juice', lime: 'lime juice', garlic: 'minced garlic', ginger: 'grated ginger', 'green-onion': 'sliced green onion', cilantro: 'chopped cilantro', parsley: 'chopped parsley', basil: 'torn basil', dill: 'chopped dill',
  'rosemary-dried': 'dried rosemary', 'thyme-dried': 'dried thyme', 'cherry-tomato': 'halved cherry tomatoes', shallot: 'minced shallot', zaatar: "za'atar", 'olive-oil': 'olive oil', 'red-wine-vinegar': 'red wine vinegar', 'italian-seasoning': 'Italian seasoning', 'cajun-seasoning': 'Cajun seasoning', 'taco-seasoning': 'taco seasoning',
  'smoked-paprika': 'smoked paprika', 'chili-powder': 'chili powder', 'garam-masala': 'garam masala', 'curry-powder': 'curry powder', 'sesame-oil': 'toasted sesame oil', 'soy-sauce': 'soy sauce', 'rice-vinegar': 'rice vinegar', 'sweet-chili-sauce': 'sweet chili sauce', 'sesame-seeds': 'sesame seeds',
  'cider-vinegar': 'apple cider vinegar', 'garlic-powder': 'garlic powder', 'bbq-sauce': 'barbecue sauce', 'brown-sugar': 'brown sugar', 'peanut-butter': 'peanut butter', 'greek-yogurt': 'Greek yogurt', 'sour-cream': 'sour cream', 'chicken-broth': 'chicken broth', 'veg-broth': 'vegetable broth',
  'white-wine': 'white wine', 'coconut-milk': 'coconut milk', 'curry-paste': 'red curry paste', 'green-curry-paste': 'green curry paste', 'tomato-paste': 'tomato paste', 'canned-tomatoes': 'canned diced tomatoes', 'red-pepper-flakes': 'red pepper flakes', 'sun-dried-tomatoes': 'sun-dried tomatoes',
  'green-beans': 'green beans', 'bell-pepper': 'bell pepper', 'veg-oil': 'neutral oil', 'fish-sauce': 'fish sauce', 'heavy-cream': 'heavy cream', 'roasted-peppers': 'roasted red peppers', 'black-beans': 'black beans', 'white-beans': 'white beans', 'pepper-jack': 'pepper jack', 'cottage-cheese': 'cottage cheese', 'cream-cheese': 'cream cheese',
  'protein-powder': 'protein powder', 'almond-butter': 'almond butter', 'almond-milk': 'almond milk', 'oat-milk': 'oat milk', 'soy-milk': 'soy milk', 'frozen-berries': 'frozen berries', 'frozen-mango': 'frozen mango', 'dark-chocolate': 'dark chocolate', 'choc-chips': 'chocolate chips', 'maple-syrup': 'maple syrup', 'coconut-flakes': 'coconut flakes' };
/** how an ingredient reads inside an instruction */
export const phr = (id) => PHR[id] || (I[id]?.name || id).toLowerCase();
/** plain name (no prep) */
export const nm = (id) => ({ ...{ lemon: 'lemon', lime: 'lime', garlic: 'garlic', onion: 'onion' } }[id]) || phr(id);
export const prepLine = (ids) => ids.map((id) => { const v = PREP_VERB[id]; return v ? `${nm(id)} (${v})` : nm(id); });

/** A recipe under construction: add per-serving amounts, get rounded totals out. */
export class Rec {
  constructor(servings = 2) { this.s = servings; this.map = new Map(); }
  add(id, per) { if (!I[id]) throw new Error('unknown ingredient ' + id); this.map.set(id, (this.map.get(id) || 0) + per); return this; }
  addAll(pairs) { pairs.forEach(([id, q]) => this.add(id, q)); return this; }
  /** add a whole-recipe quantity (already for all servings) */
  addTotal(id, total) { return this.add(id, total / this.s); }
  items() { return [...this.map.entries()].map(([id, per]) => [id, rq(id, per * this.s)]); }
}

/* ---- QC: per-serving nutrition from the ingredient database (mirrors engines/nutrition.js) ---- */
export function nutrition(items, servings) {
  const t = { kcal: 0, pro: 0, carb: 0, fat: 0, fiber: 0 }; let cost = 0;
  for (const [id, q] of items) { const g = I[id]; const f = g.kind === 'count' ? q : q / 100; t.kcal += g.kcal * f; t.pro += g.pro * f; t.carb += g.carb * f; t.fat += g.fat * f; t.fiber += g.fiber * f; cost += (g.price / g.pack) * q; }
  for (const k in t) t[k] /= servings; return { ...t, cost: cost / servings };
}
const RANGE = { breakfast: [180, 720, 1.9], lunch: [260, 850, 2.4], dinner: [330, 920, 2.8], dessert: [90, 520, 1.6], snack: [60, 430, 1.4], smoothie: [110, 560, 1.8] };
export function qc(r) {
  const n = nutrition(r.i, r.s); const [lo, hi, minPro] = RANGE[r.t]; const why = [];
  if (n.kcal < lo || n.kcal > hi) why.push(`kcal ${Math.round(n.kcal)}`);
  if (r.t === 'dinner' && r.proteinMeal && n.pro < 20) why.push(`protein ${Math.round(n.pro)}`);
  if (n.cost > 11) why.push(`cost ${n.cost.toFixed(2)}`);
  if (r.i.length > 16) why.push('too many ingredients');
  if (!r.st || r.st.length < 3) why.push('few steps');
  for (const [id, q] of r.i) if (I[id].kind === 'count' && q > 24) why.push('count qty ' + id);
  return { ok: !why.length, why, n };
}
export { I, PREP_VERB };
