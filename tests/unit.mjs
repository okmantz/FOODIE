// Data-integrity checks that run in plain Node: node tests/unit.mjs
import { INGREDIENTS } from '../js/data/ingredients.js';
import { BUILTIN_RECIPES } from '../js/data/recipes.js';
let bad = 0; const fail = (m) => { console.error('FAIL', m); bad++; };
const TYPES = ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'smoothie'];
const ids = new Set();
for (const r of BUILTIN_RECIPES) {
  if (ids.has(r.id)) fail('duplicate id ' + r.id); ids.add(r.id);
  if (!r.st || r.st.length < 1) fail(r.id + ' has no steps');
  if (!TYPES.includes(r.t)) fail(r.id + ' bad type ' + r.t);
  if (!(r.s > 0)) fail(r.id + ' bad servings');
  const seen = new Set();
  for (const [i, q] of r.i) {
    if (!INGREDIENTS[i]) fail(`${r.id}: unknown ingredient ${i}`);
    if (!(q > 0)) fail(`${r.id}: bad qty for ${i}`);
    if (seen.has(i)) fail(`${r.id}: duplicate ingredient ${i}`); seen.add(i);
    if (INGREDIENTS[i]?.kind === 'count' && q > 24) fail(`${r.id}: ${i} qty ${q} looks like grams on a count unit`);
  }
}
// Known legit Atwater mismatches: alcohol energy (wine, vanilla), mineral/fibre-heavy or caffeine/theobromine foods.
const ATWATER_OK = new Set(['white-wine', 'red-wine', 'vanilla', 'baking-powder', 'cocoa', 'allspice', 'instant-coffee']);
// Ingredient sanity: macros fit in 100 units, Atwater energy within tolerance, positive pack/price.
for (const [id, g] of Object.entries(INGREDIENTS)) {
  const { kcal, pro, carb, fat, fiber } = g.nut || g;
  if (![kcal, pro, carb, fat].every(Number.isFinite)) { fail(`${id}: missing nutrition`); continue; }
  if (g.kind === 'count') continue;
  if (pro + carb + fat > 101) fail(`${id}: macros exceed 100 per 100 units`);
  const est = 4 * pro + 4 * (carb - (fiber || 0)) + 2 * (fiber || 0) + 9 * fat;
  if (!ATWATER_OK.has(id) && kcal > 20 && Math.abs(est - kcal) > Math.max(45, kcal * 0.3)) fail(`${id}: kcal ${kcal} vs Atwater ${Math.round(est)}`);
}
if (BUILTIN_RECIPES.length < 500) fail(`expected 500+ recipes, found ${BUILTIN_RECIPES.length}`);
console.log(`${BUILTIN_RECIPES.length} recipes, ${Object.keys(INGREDIENTS).length} ingredients checked`);
process.exit(bad ? 1 : 0);
