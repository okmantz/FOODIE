/** Meal-prep sheet: consolidated chopping list + a cook-by-the-clock schedule. */
import { state, recipeById } from '../store.js';
import { INGREDIENTS, PREP_VERB } from '../data/ingredients.js';
import { scale } from './nutrition.js';
import { timeMin, minToHHMM } from '../lib/util.js';
import { SLOT_LABEL, SLOTS } from './planner.js';

export function prepSheet(plan, from, to) {
  const days = plan.days.filter((d) => d.date >= from && d.date <= to);
  const tasks = new Map(); const schedule = [];
  for (const d of days) {
    for (const slot of SLOTS) {
      const m = d.slots[slot]; if (!m) continue;
      const r = recipeById(m.rid); if (!r) continue;
      const serve = timeMin(state.profile.mealTimes[slot] || '18:30');
      if (m.leftover) { schedule.push({ date: d.date, slot, rid: r.id, title: `Reheat leftover ${r.n}`, start: minToHHMM(serve - 10), minutes: 10, leftover: true }); continue; }
      const total = Math.max(5, (r.p || 0) + (r.k || 0));
      schedule.push({ date: d.date, slot, rid: r.id, title: `Cook ${r.n}`, start: minToHHMM(serve - total), minutes: total, serve: minToHHMM(serve), batch: m.batch > 1 });
      const f = scale(r, m.servings * (m.batch || 1));
      for (const [id, qty] of r.i) {
        const verb = PREP_VERB[id]; if (!verb || !INGREDIENTS[id]) continue;
        const t = tasks.get(id) || { id, name: INGREDIENTS[id].name, verb, qty: 0, meals: [] };
        t.qty += qty * f; t.meals.push({ date: d.date, slot, name: r.n }); tasks.set(id, t);
      }
    }
  }
  return { tasks: [...tasks.values()].sort((a, b) => a.name.localeCompare(b.name)), schedule, days: days.length };
}

export const STORAGE_TIP = 'Store prepped vegetables in airtight containers in the fridge and use within 3–4 days; cooked grains and proteins keep 3–4 days refrigerated. Freeze extra portions of soups, chili and curries.';
export { SLOT_LABEL };
