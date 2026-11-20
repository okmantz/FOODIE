import { h, today, addDays, fmtDay, fmtTime12, money, round, startOfWeek, diffDays } from '../lib/util.js';
import { state, commit, recipeById, activePlan, activeList, allRecipes, meta } from '../store.js';
import { thumb, recipeCard, sectionHead, go, stars } from '../ui.js';
import { mealsOn, SLOTS, SLOT_LABEL, planCost, planNutritionAvg, dayNutrition } from '../engines/planner.js';
import { dashboardTips, suggest, expiringSoon } from '../engines/coach.js';
import { currentSeason } from '../engines/nutrition.js';
import { listStats } from '../engines/grocery.js';
import { setMealDone } from '../actions.js';

function greeting() { const hr = new Date().getHours(); return hr < 5 ? 'Late-night bite' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; }

export function renderDashboard() {
  const plan = activePlan(); const t = today(); const p = state.profile;
  const todays = plan ? mealsOn(plan, t) : {};
  const todayEntries = SLOTS.filter((s) => todays[s]).map((s) => [s, todays[s]]);
  const doneCount = todayEntries.filter(([, m]) => m.done).length;
  const list = activeList();
  const lstats = list ? listStats(list) : null;
  const remaining = list ? list.items.filter((i) => !i.checked && !i.have).length : 0;
  const wk = startOfWeek(t);
  const wkCost = plan ? planCost(plan, { usePantry: true, from: wk, to: addDays(wk, 6) }) : null;
  const nut = plan ? planNutritionAvg(plan, wk, addDays(wk, 6)) : null;
  const exp = expiringSoon(3);

  const hero = h('section.hero', {},
    h('img.coach-art', { src: 'assets/coach.png', alt: '', width: 250, height: 250 }),
    h('div.stack', { style: { maxWidth: '520px' } },
      h('span.eyebrow', {}, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
      h('h1', {}, `${greeting()}${p.name ? ', ' + p.name : ''}.`),
      h('p', {}, todayEntries.length ? `You have ${todayEntries.length} meal${todayEntries.length > 1 ? 's' : ''} planned today${doneCount ? ` — ${doneCount} done` : ''}. Healthy choices, happy you.` : plan ? 'Nothing planned for today yet. Let\'s fix that in a tap.' : 'Plan a whole week of meals and a matching grocery list in under a minute.'),
      h('div.row', {}, h('a.btn.primary', { href: '#/planner' }, plan ? 'Open my plan' : 'Plan my meals'), h('button.btn.ghost', { onclick: () => window.FOODIE.openCoach() }, '💬 Ask the Coach'))));

  const todayCard = h('section.card', {},
    h('div.row.between', {}, h('h3', {}, 'Today\'s meals'), h('a.link', { href: '#/planner' }, 'Full plan')),
    todayEntries.length ? h('div.stack.sm', { style: { marginTop: '10px' } }, todayEntries.map(([slot, m]) => {
      const r = recipeById(m.rid); if (!r) return null;
      return h('div.meal-row' + (m.done ? '.done' : ''), {}, h('a', { href: `#/recipe/${r.id}`, style: { display: 'contents', color: 'inherit', textDecoration: 'none' } }, thumb(r, 'sm'),
        h('div.grow', {}, h('div.t', {}, `${SLOT_LABEL[slot]} · ${fmtTime12(p.mealTimes[slot] || '12:00')}`), h('b', {}, r.n), h('div.small.muted', {}, m.leftover ? 'Leftovers — just reheat' : `${r.d.time} min · ${Math.round(r.d.nut.kcal)} kcal`))),
        h('button.chip.sm' + (m.done ? '.on' : ''), { 'aria-pressed': String(!!m.done), onclick: () => setMealDone(t, slot, !m.done) }, m.done ? '✓ Done' : 'Mark done'));
    })) : h('div.empty', {}, h('div.big', {}, '🍽️'), h('p', {}, plan ? 'No meals planned for today.' : 'No plan yet.'), h('a.btn.primary.sm', { href: '#/planner' }, plan ? 'Add a meal' : 'Create a plan')));

  const stats = h('section.grid.c4', {},
    statCard('🛒', remaining, list ? 'items left to buy' : 'no list yet', '#/grocery', lstats ? `≈ ${money(lstats.total, 0)} est.` : ''),
    statCard('💵', wkCost ? money(wkCost.total, 0) : '—', 'groceries this week (est.)', '#/insights', p.weeklyBudget ? `of ${money(p.weeklyBudget, 0)} budget` : ''),
    statCard('🔥', nut?.days ? Math.round(nut.avg.kcal) : '—', 'avg kcal / day planned', '#/insights', +p.calories ? `goal ${p.calories}` : ''),
    statCard('⏳', exp.length, 'pantry items expiring soon', '#/pantry', ''));

  const tips = dashboardTips();
  const tipsEl = tips.length ? h('section.stack.sm', {}, tips.map((tp) => h('div.tip', {}, h('span.ico', {}, tp.icon), h('div.grow', {}, h('b', {}, tp.title), h('p.small.muted', { style: { margin: '2px 0 8px' } }, tp.text),
    tp.action ? (tp.action.href ? h('a.btn.sm.primary', { href: tp.action.href }, tp.action.label) : h('button.btn.sm.primary', { onclick: () => window.FOODIE.openCoach(tp.action.coach) }, tp.action.label)) : null),
    h('button.icon-btn.x', { 'aria-label': 'Dismiss tip', onclick: () => commit((s) => { s.dismissedTips[tp.id] = 1; }) }, '✕')))) : null;

  const upcoming = plan ? plan.days.filter((d) => d.date > t).slice(0, 3) : [];
  const upcomingEl = upcoming.length ? h('section.card', {}, h('h3', {}, 'Coming up'), h('div.stack.sm', { style: { marginTop: '10px' } }, upcoming.map((d) => h('div.row.nowrap', {}, h('div.bold', { style: { width: '84px', flex: 'none' } }, fmtDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' })),
    h('div.small.muted.grow', {}, SLOTS.filter((s) => d.slots[s]).map((s) => recipeById(d.slots[s].rid)?.n).filter(Boolean).join(' · ') || 'Open day'))))) : null;

  const forYou = suggest({ types: ['breakfast', 'lunch', 'dinner'], season: false }, 8);
  const season = currentSeason(new Date(), p.hemisphere);
  const inSeason = suggest({ season: true, types: ['breakfast', 'lunch', 'dinner', 'dessert'] }, 8).filter((x) => x.r.seasons.length < 4);
  const recent = Object.entries(state.recipeMeta).filter(([, m]) => m.last).sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, 8).map(([id]) => recipeById(id)).filter(Boolean);
  const favs = state.favorites.recipes.slice(0, 8).map(recipeById).filter(Boolean);
  const row = (items, tagFn) => h('div.h-scroll', {}, items.map((r) => recipeCard(r, { tag: tagFn?.(r) })));

  return h('div.view.stack.lg', {},
    hero,
    h('div.split', {}, h('div.stack', {}, todayCard, tipsEl), h('div.stack', {}, stats, upcomingEl)),
    forYou.length ? h('section', {}, sectionHead('Picked for you', h('a.link', { href: '#/recipes' }, 'Browse all'), 'Based on your diet, favorites and what you\'ve cooked'), row(forYou.map((x) => x.r))) : null,
    inSeason.length ? h('section', {}, sectionHead(`In season · ${season[0].toUpperCase() + season.slice(1)}`, null, 'Recipes that shine this time of year'), row(inSeason.map((x) => x.r), () => '🍂 Seasonal')) : null,
    recent.length ? h('section', {}, sectionHead('Recently cooked'), row(recent)) : null,
    favs.length ? h('section', {}, sectionHead('Your favorites'), row(favs)) : null,
    h('section.card.soft.row.between', {}, h('div', {}, h('h3', {}, 'Eating out tonight?'), h('p.muted.small', { style: { margin: '4px 0 0' } }, 'Take a 7-question taste quiz and get restaurant and dish ideas that fit you.')), h('a.btn.primary', { href: '#/discover' }, 'Find something to eat')));
}

const statCard = (ico, n, label, href, sub) => h('a.card.stat', { href, style: { textDecoration: 'none', color: 'inherit', gap: '4px' } }, h('span', { style: { fontSize: '1.4rem' } }, ico), h('span.n', {}, String(n)), h('span.l', {}, label), sub ? h('span.tiny.muted', {}, sub) : null);
