// Loads the same recipe list the app uses (built-ins + generated). Custom user recipes are never photographed.
import { BUILTIN_RECIPES } from '../../js/data/recipes.js';
import { MORE_RECIPES } from '../../js/data/recipes-more.js';
import { WORLD_RECIPES } from '../../js/data/recipes-world.js';
import { INGREDIENTS } from '../../js/data/ingredients.js';

export function loadRecipes() {
  const seen = new Set(); const out = [];
  for (const r of [...BUILTIN_RECIPES, ...MORE_RECIPES, ...WORLD_RECIPES]) {
    if (seen.has(r.id)) throw new Error('duplicate recipe id ' + r.id);
    seen.add(r.id);
    out.push({ id: r.id, n: r.n, c: r.c, t: r.t, e: r.e, ing: (r.i || []).map(([i]) => INGREDIENTS[i]?.name || i) });
  }
  return out;
}
