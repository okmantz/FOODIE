from playwright.sync_api import sync_playwright
JS = """
async () => {
  const P = await import('/js/engines/planner.js'); const S = await import('/js/store.js'); const N = await import('/js/engines/nutrition.js');
  const out = [];
  const diets = [[],['vegan'],['vegetarian'],['pescatarian'],['keto'],['carnivore'],['glutenFree'],['dairyFree']];
  const allergies = [[],['P'],['D','E'],['S','F'],['G'],['P','N','S']];
  for (const d of diets) for (const a of allergies) for (const days of [7,14]) {
    S.state.profile.diets = d; S.state.profile.allergies = a;
    const prefs = {...P.defaultPrefs(), diets: d, allergies: a, days, budget: 80, household: 2};
    let plan; try { plan = P.generatePlan(prefs); } catch (e) { out.push(`THROW ${d}/${a}/${days}: ${e.message}`); continue; }
    const meals = P.allMeals(plan); let bad = 0, empty = 0;
    for (const m of meals) { const r = S.recipeById(m.rid); if (!r) { bad++; continue; } if (P.violations(r, {allergies: a, dislikes: [], diets: d}, d).length) bad++; }
    const expected = days*3;
    if (meals.length < expected*0.7) empty++;
    out.push(`${d.join('+')||'any'} | ${a.join('+')||'none'} | ${days}d: meals=${meals.length} uniq=${new Set(meals.map(m=>m.rid)).size} viol=${bad} warn=${(plan.warnings||[]).length}${empty?' SPARSE':''}`);
  }
  return out;
}
"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8080/'); pg.wait_for_timeout(800)
    r=pg.evaluate(JS)
    print('\n'.join(r)); print('ERR',errs); b.close()
