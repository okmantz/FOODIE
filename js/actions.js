/** Cross-view state mutations (cooking, pantry deduction, plan helpers). */
import { state, commit, recipeById, activePlan } from './store.js';
import { INGREDIENTS } from './data/ingredients.js';
import { scale } from './engines/nutrition.js';
import { learnFromRecipe } from './engines/taste.js';
import { uid, today, toast } from './lib/util.js';

/** Remove `qty` of an ingredient from the pantry (soonest-expiring first). Returns amount actually removed. */
export function deductPantry(s, ing, qty) {
  let left = qty;
  const rows = s.pantry.filter((p) => p.ing === ing && p.qty > 0).sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'));
  for (const p of rows) { const take = Math.min(p.qty, left); p.qty -= take; left -= take; if (left <= 1e-6) break; }
  s.pantry = s.pantry.filter((p) => !(p.ing && p.qty <= 1e-6 && !p.staple));
  return qty - left;
}

export function addPantry(s, ing, qty, expires = null) {
  const ex = s.pantry.find((p) => p.ing === ing && (p.expires || null) === (expires || null));
  if (ex) ex.qty += qty; else s.pantry.push({ id: uid('p'), ing, qty, expires: expires || null });
}

/** Mark a planned meal cooked / eaten. Cooked (non-leftover) meals deduct ingredients from the pantry. */
export function setMealDone(date, slot, done, { deduct = true } = {}) {
  const plan = activePlan(); if (!plan) return;
  const day = plan.days.find((d) => d.date === date); const m = day?.slots[slot]; if (!m) return;
  const r = recipeById(m.rid);
  commit((s) => {
    const p = s.plans.find((x) => x.id === plan.id); const mm = p.days.find((d) => d.date === date).slots[slot];
    mm.done = done;
    if (done) {
      const meta = s.recipeMeta[mm.rid] || (s.recipeMeta[mm.rid] = {});
      meta.cooked = (meta.cooked || 0) + 1; meta.last = today();
      if (r) learnFromRecipe(s, r, 1);
      if (deduct && !mm.leftover && r) {
        mm.deducted = [];
        const f = scale(r, mm.servings * (mm.batch || 1));
        for (const [id, q] of r.i) { if (!INGREDIENTS[id] || INGREDIENTS[id].flags.includes('Z')) continue; const took = deductPantry(s, id, q * f); if (took > 0) mm.deducted.push([id, took]); }
      }
    } else {
      const meta = s.recipeMeta[mm.rid]; if (meta?.cooked) meta.cooked -= 1;
      for (const [id, q] of mm.deducted || []) addPantry(s, id, q);
      delete mm.deducted;
    }
  });
  if (done) toast(`Marked “${r?.n}” as cooked`, { action: { label: 'Undo', fn: () => setMealDone(date, slot, false) } });
}

export function logCooked(rid) {
  const r = recipeById(rid);
  commit((s) => { const m = s.recipeMeta[rid] || (s.recipeMeta[rid] = {}); m.cooked = (m.cooked || 0) + 1; m.last = today(); if (r) learnFromRecipe(s, r, 1); });
  toast('Logged as cooked');
}

export function setPlan(id) { commit((s) => { s.activePlanId = id; }); }
