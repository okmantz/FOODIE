// Data-integrity checks that run in plain Node: node tests/unit.mjs
import { INGREDIENTS } from '../js/data/ingredients.js';
import { BUILTIN_RECIPES } from '../js/data/recipes.js';
let bad = 0; const fail = (m) => { console.error('FAIL', m); bad++; };
const ids = new Set();
for (const r of BUILTIN_RECIPES) {
  if (ids.has(r.id)) fail('duplicate id ' + r.id); ids.add(r.id);
  if (!r.st?.length) fail(r.id + ' has no steps');
  if (!['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'smoothie'].includes(r.t)) fail(r.id + ' bad type ' + r.t);
  for (const [i, q] of r.i) { if (!INGREDIENTS[i]) fail(`${r.id}: unknown ingredient ${i}`); if (!(q > 0)) fail(`${r.id}: bad qty for ${i}`); }
}
console.log(`${BUILTIN_RECIPES.length} recipes, ${Object.keys(INGREDIENTS).length} ingredients checked`);
process.exit(bad ? 1 : 0);
