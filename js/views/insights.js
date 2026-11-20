/** Weekly nutrition & spending summaries, with simple accessible SVG charts. */
import { h, today, addDays, startOfWeek, fmtDay, money, sum, printHTML, esc } from '../lib/util.js';
import { state, activePlan, recipeById } from '../store.js';
import { go, sectionHead, notice, thumb } from '../ui.js';
import { SLOTS, dayNutrition, planCost, planNutritionAvg } from '../engines/planner.js';
import { cookedSlots, aggregate, listStats } from '../engines/grocery.js';

const ui = { week: null };

function bars({ labels, values, goal = null, color = 'var(--accent)', unit = '', h: H = 180, fmt = (v) => Math.round(v), highlight = -1 }) {
  const W = 640, pad = { l: 8, r: 8, t: 22, b: 28 }; const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(...values, goal || 0, 1) * 1.12; const bw = Math.min(54, iw / labels.length * 0.62); const step = iw / labels.length;
  const y = (v) => pad.t + ih - (v / max) * ih;
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${labels.map((l, i) => `${l}: ${fmt(values[i])}${unit}`).join(', ')}">
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)" />
    ${goal ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--tomato)" stroke-dasharray="5 4" stroke-width="1.5" /><text x="${W - pad.r}" y="${y(goal) - 5}" text-anchor="end" style="fill:var(--tomato)">goal ${fmt(goal)}${unit}</text>` : ''}
    ${values.map((v, i) => { const x = pad.l + step * i + (step - bw) / 2; const hh = Math.max(v > 0 ? 3 : 0, y(0) - y(v)); return `<rect x="${x}" y="${y(0) - hh}" width="${bw}" height="${hh}" rx="6" fill="${i === highlight ? 'var(--accent-d)' : color}" opacity="${v ? 1 : .25}"/><text class="val" x="${x + bw / 2}" y="${y(0) - hh - 6}" text-anchor="middle">${v ? fmt(v) : ''}</text><text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`; }).join('')}</svg>`;
  return h('div', { html: svg });
}

function stackedBars({ labels, a, b }) {
  const W = 640, H = 190, pad = { l: 8, r: 8, t: 22, b: 28 }; const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const tot = a.map((v, i) => v + b[i]); const max = Math.max(...tot, 1) * 1.12; const bw = Math.min(64, iw / labels.length * 0.6); const step = iw / labels.length; const y = (v) => pad.t + ih - (v / max) * ih;
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${labels.map((l, i) => `${l}: groceries ${Math.round(a[i])}, eating out ${Math.round(b[i])}`).join('; ')} dollars"><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>${labels.map((l, i) => { const x = pad.l + step * i + (step - bw) / 2; const ha = y(0) - y(a[i]); const hb = y(0) - y(b[i]); return `<rect x="${x}" y="${y(0) - ha}" width="${bw}" height="${ha}" rx="5" fill="var(--accent)"/><rect x="${x}" y="${y(0) - ha - hb}" width="${bw}" height="${hb}" rx="5" fill="var(--citrus)"/><text class="val" x="${x + bw / 2}" y="${y(0) - ha - hb - 6}" text-anchor="middle">${tot[i] ? '$' + Math.round(tot[i]) : ''}</text><text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; }).join('')}</svg>`;
  return h('div', { html: svg });
}

export function renderInsights() {
  const p = state.profile; const plan = activePlan(); const t = today();
  const wk = ui.week || startOfWeek(t); const wkEnd = addDays(wk, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const planDays = plan ? new Map(plan.days.map((d) => [d.date, d])) : new Map();
  const kcal = days.map((d) => (planDays.get(d) ? dayNutrition(planDays.get(d)).kcal : 0));
  const labels = days.map((d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }));
  const nut = plan ? planNutritionAvg(plan, wk, wkEnd) : { avg: { kcal: 0, pro: 0, carb: 0, fat: 0, fiber: 0 }, days: 0 };
  const goalCal = +p.calories || null;
  const done = plan ? plan.days.filter((d) => d.date >= wk && d.date <= wkEnd).flatMap((d) => Object.values(d.slots)).filter((m) => m.done).length : 0;
  const total = plan ? plan.days.filter((d) => d.date >= wk && d.date <= wkEnd).flatMap((d) => Object.values(d.slots)).length : 0;

  // spending: 5 weeks around the selected one
  const spendWeeks = Array.from({ length: 5 }, (_, i) => addDays(wk, (i - 3) * 7));
  const groc = spendWeeks.map((w) => (plan ? planCost(plan, { usePantry: !!plan.prefs?.usePantry, from: w, to: addDays(w, 6) }).total : 0));
  const dining = spendWeeks.map((w) => sum(state.diningLog.filter((l) => l.amount && l.date >= w && l.date <= addDays(w, 6)), (l) => +l.amount));
  const thisWkIdx = 3;
  const budget = p.weeklyBudget || 0;
  const grocPct = budget ? Math.min(100, Math.round(groc[thisWkIdx] / budget * 100)) : 0;
  const month = today().slice(0, 7); const diningMonth = sum(state.diningLog.filter((l) => l.amount && l.date.startsWith(month)), (l) => +l.amount);

  const cookedAgg = Object.entries(state.recipeMeta).filter(([, m]) => m.cooked).sort((a, b) => b[1].cooked - a[1].cooked).slice(0, 5);
  const weekSlots = plan ? cookedSlots(plan, wk, wkEnd) : [];
  const uniqIng = weekSlots.length ? aggregate(weekSlots).ing.size : 0;
  const reuse = plan && state.lists.find((l) => l.planId === plan.id) ? listStats(state.lists.find((l) => l.planId === plan.id), cookedSlots(plan)).reuseSavings : 0;

  const macroTotal = nut.avg.pro * 4 + nut.avg.carb * 4 + nut.avg.fat * 9 || 1;
  const observations = [];
  if (nut.days) {
    if (goalCal) { const diff = Math.round(nut.avg.kcal - goalCal); observations.push(Math.abs(diff) < goalCal * 0.08 ? `Your planned days average ${Math.round(nut.avg.kcal)} kcal — right around your ${goalCal} kcal goal.` : `Your planned days average ${Math.round(nut.avg.kcal)} kcal, about ${Math.abs(diff)} ${diff > 0 ? 'above' : 'below'} your ${goalCal} kcal goal. Totally fine if that's intentional — swap a meal in the plan if you'd like to nudge it.`); }
    if (+p.protein) observations.push(`Protein averages ${Math.round(nut.avg.pro)} g a day (your target is ${p.protein} g).`);
    else observations.push(`Protein averages ${Math.round(nut.avg.pro)} g and fiber ${Math.round(nut.avg.fiber)} g per day.`);
  }
  if (budget && groc[thisWkIdx]) observations.push(groc[thisWkIdx] <= budget ? `Groceries are estimated at ${money(groc[thisWkIdx], 0)} this week — ${money(budget - groc[thisWkIdx], 0)} under your ${money(budget, 0)} goal.` : `Groceries are estimated at ${money(groc[thisWkIdx], 0)} this week, ${money(groc[thisWkIdx] - budget, 0)} over your ${money(budget, 0)} goal. A leftovers swap or a cheaper store could help.`);

  const nav = h('div.row', {}, h('button.icon-btn', { 'aria-label': 'Previous week', onclick: () => { ui.week = addDays(wk, -7); go('#/insights'); } }, '‹'), h('b', {}, `${fmtDay(wk, { month: 'short', day: 'numeric' })} – ${fmtDay(wkEnd, { month: 'short', day: 'numeric' })}`), h('button.icon-btn', { 'aria-label': 'Next week', onclick: () => { ui.week = addDays(wk, 7); go('#/insights'); } }, '›'), wk !== startOfWeek(t) ? h('button.btn.ghost.sm', { onclick: () => { ui.week = null; go('#/insights'); } }, 'This week') : null);

  return h('div.view.stack.lg', {},
    h('div.page-head', {}, h('div', {}, h('h1', {}, 'Insights'), h('p', {}, 'A friendly look at what you\'re planning to eat and spend. Numbers come from your meal plan, pantry, and dining log — estimates, not judgments.')), nav),
    observations.length ? h('section.card.soft.stack.sm', {}, h('div.row', { style: { gap: '10px' } }, h('img', { src: 'assets/coach-sm.png', alt: '', width: 40, height: 40, style: { borderRadius: '50%' } }), h('b', {}, 'Coach\'s weekly note')), observations.map((o) => h('p', { style: { margin: 0 } }, o))) : null,
    !plan ? notice('warn', h('span', {}, '🗓️'), h('span', {}, 'No meal plan yet — create one to see nutrition and grocery estimates here.')) : null,
    h('section.split', {},
      h('div.card.stack', {}, h('h3', {}, 'Calories by day'), h('p.small.muted', { style: { margin: 0 } }, 'Per person, from planned meals.'), bars({ labels, values: kcal, goal: goalCal, unit: '', highlight: days.indexOf(t) })),
      h('div.card.stack', {}, h('h3', {}, 'Daily average'), h('div.grid.c2', { style: { gap: '10px' } },
        macro('Calories', Math.round(nut.avg.kcal), 'kcal', goalCal), macro('Protein', Math.round(nut.avg.pro), 'g', +p.protein || null), macro('Carbs', Math.round(nut.avg.carb), 'g', +p.carbs || null), macro('Fat', Math.round(nut.avg.fat), 'g', +p.fat || null)),
        h('div.bar', { role: 'img', 'aria-label': 'Macro split' }, h('i', { style: { width: `${nut.avg.pro * 4 / macroTotal * 100}%`, background: 'var(--tomato)' } }), h('i', { style: { width: `${nut.avg.carb * 4 / macroTotal * 100}%`, background: 'var(--citrus)' } }), h('i', { style: { width: `${nut.avg.fat * 9 / macroTotal * 100}%`, background: 'var(--sky)' } })),
        h('div.legend', {}, h('span', {}, h('i', { style: { background: 'var(--tomato)' } }), 'Protein'), h('span', {}, h('i', { style: { background: 'var(--citrus)' } }), 'Carbs'), h('span', {}, h('i', { style: { background: 'var(--sky)' } }), 'Fat')))),
    h('section.split', {},
      h('div.card.stack', {}, h('h3', {}, 'Weekly spending'), h('p.small.muted', { style: { margin: 0 } }, 'Estimated groceries from your plan + eating out you\'ve logged.'),
        stackedBars({ labels: spendWeeks.map((w) => fmtDay(w, { month: 'short', day: 'numeric' })), a: groc, b: dining }),
        h('div.legend', {}, h('span', {}, h('i', { style: { background: 'var(--accent)' } }), 'Groceries (est.)'), h('span', {}, h('i', { style: { background: 'var(--citrus)' } }), 'Eating out (logged)'))),
      h('div.card.stack', {}, h('h3', {}, 'Budget check'), h('div.row', { style: { gap: '18px' } }, h('div.ring', { style: { '--p': grocPct, '--c': groc[thisWkIdx] > budget && budget ? 'var(--tomato)' : 'var(--accent)' }, role: 'img', 'aria-label': `${grocPct}% of weekly grocery budget` }, h('b', {}, budget ? grocPct + '%' : '—')),
        h('div.stack.sm', {}, h('div', {}, h('b', {}, money(groc[thisWkIdx], 0)), h('span.muted.small', {}, budget ? ` of ${money(budget, 0)} weekly groceries` : ' groceries this week')), h('div', {}, h('b', {}, money(diningMonth, 0)), h('span.muted.small', {}, p.diningBudget ? ` of ${money(p.diningBudget, 0)} monthly dining` : ' eating out this month')))),
        h('div.small.muted', {}, reuse ? `Ingredient reuse across your plan is saving about ${money(reuse)} versus shopping each recipe separately.` : 'Plan with “use up my pantry” on to reduce waste and cost.'))),
    h('section.grid.c3', {},
      h('div.card.stat', {}, h('span.n', {}, `${done}/${total}`), h('span.l', {}, 'Meals done this week')), h('div.card.stat', {}, h('span.n', {}, String(uniqIng)), h('span.l', {}, 'Different ingredients this week')), h('div.card.stat', {}, h('span.n', {}, String(Object.values(state.recipeMeta).reduce((a, m) => a + (m.cooked || 0), 0))), h('span.l', {}, 'Times cooked, all-time'))),
    cookedAgg.length ? h('section', {}, sectionHead('Most cooked'), h('div.card.flat', { style: { padding: '4px 14px' } }, cookedAgg.map(([id, m]) => { const r = recipeById(id); return r ? h('a.meal-row', { href: `#/recipe/${r.id}`, style: { margin: '6px 0' } }, thumb(r, 'sm'), h('div.grow', {}, h('b', {}, r.n), h('div.small.muted', {}, r.c)), h('span.badge.green', {}, `${m.cooked}×`)) : null; }))) : null,
    h('div.row', {}, h('button.btn.ghost', { onclick: () => printHTML('FOODIE weekly summary', `<h1>Weekly summary</h1><div class="sub">${fmtDay(wk)} – ${fmtDay(wkEnd)}</div><h2>Nutrition (per person, daily average)</h2><p>${Math.round(nut.avg.kcal)} kcal · ${Math.round(nut.avg.pro)} g protein · ${Math.round(nut.avg.carb)} g carbs · ${Math.round(nut.avg.fat)} g fat</p><h2>Spending (estimates)</h2><p>Groceries ${money(groc[thisWkIdx], 0)} · Eating out ${money(dining[thisWkIdx], 0)}</p>${observations.map((o) => `<p>${esc(o)}</p>`).join('')}`) }, '🖨 Print this summary')));
}

const macro = (l, v, u, goal) => h('div.stat', {}, h('span.n', {}, `${v}`, h('span.small.muted', {}, ' ' + u)), h('span.l', {}, l), goal ? h('span.tiny.muted', {}, `target ${goal}`) : null);
