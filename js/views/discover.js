/** Food discovery: taste quiz → instant nearby matches, personalised restaurants & dishes, directory, saved items, dining log. */
import { h, modal, toast, confirmDialog, today, fmtDay, money, uid, debounce, sum } from '../lib/util.js';
import { state, commit, allRecipes } from '../store.js';
import { thumb, chipGroup, field, go, priceDots, stars, sectionHead, notice, recipeCard } from '../ui.js';
import { icon } from '../lib/icons.js';
import { QUIZ } from '../data/quiz.js';
import { CUISINES, DIET_LABEL, CUISINE_FLAVORS } from '../engines/nutrition.js';
import { SAMPLE_RESTAURANTS } from '../data/restaurants.js';
import { quizResult, applyQuiz, unapplyQuiz, recommendRestaurants, scoreRestaurant, dishesFor, scoreDish, learn, learnFromRestaurant, topTaste, preferredPrice } from '../engines/taste.js';
import { eligible } from '../engines/planner.js';
import { places, onPlaces, syncPlaces, openStatus } from '../engines/places.js';
import { getLoc, fmtDist } from '../lib/location.js';
import { locationBar } from './locationui.js';

const ui = { tab: 'foryou', quiz: null, q: '', cuisine: 'all', price: [], maxDist: 10, minRating: 0, sort: 'match', favs: false, openNow: false, showSample: false, shown: 30 };
let refresher = null;                       // set by whichever view shows live place data
onPlaces(() => { if (refresher && document.body.contains(refresher.anchor)) refresher.fn(); });

const enc = encodeURIComponent;
const mapsLink = (r) => (r.lat != null ? `https://www.google.com/maps/search/?api=1&query=${enc([r.name, r.address].filter(Boolean).join(' '))}&query_place_id=` : `https://www.google.com/maps/search/?api=1&query=${enc([r.name, r.address].filter(Boolean).join(' '))}`).replace(/&query_place_id=$/, '');
const dirLink = (r) => (r.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}&destination_place_id=&travelmode=driving`.replace('&destination_place_id=', '') : mapsLink(r));
const orderLinks = (r) => [['DoorDash', `https://www.doordash.com/search/store/${enc(r.name)}/`], ['Uber Eats', `https://www.ubereats.com/search?q=${enc(r.name)}`], ['Grubhub', `https://www.grubhub.com/search?queryText=${enc(r.name)}`]];

/* ====================================================================== data: what we can recommend */
/** Real nearby places first; user-added/saved places always; fictional samples ONLY when there is nothing real to show. */
function listing() {
  const real = places.food;
  const seen = new Set(real.map((r) => r.id));
  const mine = state.restaurants.filter((r) => !r.sample && !seen.has(r.id));
  const useSample = !real.length && (!getLoc().loc || places.status === 'error') || ui.showSample;
  const samples = useSample ? SAMPLE_RESTAURANTS.map((r) => ({ ...r, sample: true })).filter((r) => !seen.has(r.id)) : [];
  return [...real, ...mine, ...samples];
}
const everything = () => [...places.food, ...state.restaurants.filter((r) => !r.sample), ...SAMPLE_RESTAURANTS.map((r) => ({ ...r, sample: true }))];
const findRest = (id) => everything().find((r) => r.id === id);

export function renderDiscover() {
  refresher = null;
  const tabs = [['foryou', 'For you'], ['restaurants', 'Restaurants'], ['saved', 'Saved'], ['log', 'Dining log']];
  return h('div.view.stack', {},
    h('div.page-head', {}, h('div', {}, h('h1', {}, 'Discover'), h('p', {}, 'Real restaurants near you right now, ranked for your taste.'))),
    h('div.tabs', { role: 'tablist' }, tabs.map(([id, l]) => h('button' + (ui.tab === id ? '.on' : ''), { role: 'tab', 'aria-selected': String(ui.tab === id), onclick: () => { ui.tab = id; go('#/discover'); } }, l))),
    ui.tab === 'foryou' ? forYou() : ui.tab === 'restaurants' ? directory() : ui.tab === 'saved' ? saved() : diningLog());
}

/* ====================================================================== matches (shared by quiz results + For you) */
/** A live-updating list of the best places for this person, right now. */
function matchesSection({ title, sub, count = 6, ranked = true }) {
  const box = h('div.grid.c2'); const head = h('div'); const foot = h('div.row', { style: { justifyContent: 'center' } });
  const root = h('section.stack', {}, head, box, foot);
  const paint = () => {
    const { loc } = getLoc();
    head.replaceChildren(sectionHead(title, null, sub || (loc ? `Within reach of ${loc.label}` : '')));
    foot.replaceChildren();
    if (!loc && !listing().length) { box.replaceChildren(h('div.card.soft', { style: { gridColumn: '1/-1' } }, h('b', {}, 'Add your location to see real matches'), h('p.small.muted', { style: { margin: '4px 0 0' } }, 'Use the location bar above — it takes one tap.'))); return; }
    if ((places.status === 'loading') && !places.food.length) { box.replaceChildren(...[0, 1, 2, 3].slice(0, count > 4 ? 4 : count).map(() => h('div.card.skeleton', {}, h('i.sk.w40'), h('i.sk.w70'), h('i.sk.w55'), h('i.sk.w90')))); return; }
    const all = listing();
    let ranked_ = ranked ? recommendRestaurants(all) : all.map((r) => ({ r, ...scoreRestaurant(r) })).sort((a, b) => a.r.distance - b.r.distance).map((x) => x);
    // closed places drop out of the top picks when enough open ones exist
    const openish = ranked_.filter((x) => !(x.open && !x.open.open));
    if (openish.length >= count) ranked_ = openish;
    const top = ranked_.slice(0, count);
    if (!top.length) { box.replaceChildren(h('div.card.empty', { style: { gridColumn: '1/-1' } }, h('div.big', {}, icon('utensils')), h('h3', {}, places.status === 'error' ? 'Couldn\'t load nearby places' : 'No restaurants mapped nearby'), h('p', {}, places.status === 'error' ? places.error : 'Try a larger city or add a place you know in the Restaurants tab.'), places.status === 'error' ? h('button.btn.primary.sm', { onclick: () => syncPlaces({ force: true }) }, 'Retry now') : null)); return; }
    box.replaceChildren(...top.map(({ r, reasons }) => restaurantCard(r, reasons)));
    foot.replaceChildren(h('button.btn.ghost', { onclick: () => { ui.tab = 'restaurants'; go('#/discover'); } }, `See all ${all.length} places`, icon('chevron', { cls: 'inl' })));
  };
  paint();
  refresher = { anchor: root, fn: paint };
  return root;
}

/* ====================================================================== quiz + recommendations */
function forYou() {
  if (ui.quiz) return quizView();
  const hasTaste = Object.keys(state.taste.cuisine).length > 0;
  const last = state.quizHistory[0];
  const startCard = h('section.hero', { style: { padding: '28px 24px' } }, h('img.coach-art', { src: 'assets/coach.png', alt: '', width: 200, height: 200 }), h('div.stack', { style: { maxWidth: '520px' } },
    h('span.eyebrow', {}, '7 quick questions'), h('h2', { style: { color: '#fff', fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 'clamp(1.6rem,4.6vw,2.2rem)' } }, 'What should I eat?'), h('p', {}, 'Pick between two foods at a time. FOODIE learns your cuisines, flavors and price mood — then shows the best real restaurants around you.'),
    h('div.row', {}, h('button.btn.primary', { onclick: () => { ui.quiz = { i: 0, answers: [], done: false }; go('#/discover'); } }, last ? 'Retake the quiz' : 'Start the quiz'))));

  if (!hasTaste) return h('div.stack.lg', {}, locationBar(), startCard,
    matchesSection({ title: 'Open near you right now', sub: 'Nearest places first — take the quiz to rank them for your taste', ranked: false }));

  const topC = topTaste('cuisine', 3);
  const homeIdeas = allRecipes().filter((r) => topC.includes(r.c) && eligible(r, { diets: state.profile.diets }) && ['lunch', 'dinner'].includes(r.t)).slice(0, 4);
  const dishRecs = listing().flatMap((r) => dishesFor(r).filter((d) => d.real).map((d) => ({ r, d, ...scoreDish(d, r) }))).filter((x) => x.score > -50).sort((a, b) => b.score - a.score).slice(0, 6);
  return h('div.stack.lg', {}, locationBar(),
    h('div.split.even', {}, startCard, h('section.card.stack', {}, h('h3', {}, 'Your taste so far'), h('p.small.muted', { style: { margin: 0 } }, 'Learned from your quiz answers, favorites, saved dishes, ratings and dining log. It stays on this device.'),
      tasteBars('cuisine', 'Cuisines'), tasteBars('flavor', 'Flavors'), preferredPrice() ? h('div.row', {}, h('span.small.muted', {}, 'Usual price range'), priceDots(preferredPrice())) : null,
      h('button.btn.ghost.sm', { style: { alignSelf: 'flex-start' }, onclick: async () => { if (await confirmDialog('Reset everything FOODIE has learned about your taste?', { okLabel: 'Reset', danger: true })) commit((s) => { s.taste = { cuisine: {}, flavor: {}, price: {} }; s.quizHistory = []; }); } }, 'Reset learned taste'))),
    matchesSection({ title: 'Best matches near you', sub: topC.length ? `Ranked for your love of ${topC.join(', ')} — and what's open now` : '' }),
    dishRecs.length ? h('section', {}, sectionHead('Dishes to try'), h('div.card.flat', { style: { padding: '4px 16px' } }, dishRecs.map(({ r, d }) => dishRow(r, d, true)))) : null,
    homeIdeas.length ? h('section', {}, sectionHead('Or cook it at home', h('a.link', { href: '#/recipes' }, 'All recipes'), `Matching your favorite cuisines: ${topC.join(', ')}`), h('div.h-scroll', {}, homeIdeas.map((r) => recipeCard(r)))) : null);
}

function tasteBars(cat, label) {
  const entries = Object.entries(state.taste[cat]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!entries.length) return null;
  const max = entries[0][1];
  return h('div.stack.sm', {}, h('div.eyebrow', {}, label), entries.map(([k, v]) => h('div.taste-bar', {}, h('span', {}, k[0].toUpperCase() + k.slice(1)), h('div.bar', {}, h('i', { style: { width: `${Math.max(8, v / max * 100)}%` } })), h('span.tiny.muted', {}, String(Math.round(v))))));
}

function quizView() {
  const q = ui.quiz;
  if (q.done) {
    const res = quizResult(q.answers, QUIZ);
    const cu = res.cuisines.slice(0, 3).map((x) => x[0]); const fl = res.flavors.slice(0, 3).map((x) => x[0]);
    return h('div.stack.lg', {},
      h('section.card.quiz-result', {}, h('div.qr-head', {}, h('span.qr-badge', {}, icon('check', { cls: 'inl' }), 'Taste profile saved'), h('h2', {}, cu.length ? `You're craving ${cu.join(', ')}` : 'Your taste profile'),
        h('div.row', { style: { gap: '6px' } }, ...fl.map((x) => h('span.badge.green', {}, x[0].toUpperCase() + x.slice(1))), res.price ? h('span.badge', {}, 'Budget ', priceDots(res.price)) : null)),
        h('div.row', {}, h('button.btn.ghost.sm', { onclick: () => { ui.quiz = { i: 0, answers: [], done: false }; go('#/discover'); } }, 'Retake'), h('button.btn.ghost.sm', { onclick: () => { ui.quiz = null; go('#/discover'); } }, 'Done'))),
      locationBar({ showStats: false }),
      matchesSection({ title: 'Your best matches nearby', sub: 'Real places around you, ranked by what you just told us', count: 6 }),
      state.profile.diets.length || state.profile.allergies.length ? h('p.tiny.muted', {}, 'Always confirm allergens and ingredients with the restaurant — FOODIE can\'t see real menus.') : null);
  }
  const item = QUIZ[q.i];
  const pick = (c) => {
    q.answers[q.i] = c;
    if (q.i + 1 >= QUIZ.length) {
      q.done = true;
      const res = quizResult(q.answers, QUIZ);
      applyQuiz(res);                     // saved immediately so the matches below are already personalised
    } else q.i++;
    go('#/discover');
  };
  const card = (o, c) => h('button.vs-card', { onclick: () => pick(c), 'aria-label': o.label }, h('span.e.food', {}, o.emoji), h('b', {}, o.label));
  return h('div.stack.lg', { style: { maxWidth: '760px', marginInline: 'auto' } },
    h('div.steps', { 'aria-label': `Question ${q.i + 1} of ${QUIZ.length}` }, QUIZ.map((_, i) => h('i' + (i <= q.i ? '.on' : '')))),
    h('div', { style: { textAlign: 'center' } }, h('span.eyebrow', {}, `Question ${q.i + 1} of ${QUIZ.length}`), h('h2', { style: { marginTop: '6px' } }, item.q)),
    h('div.versus', {}, card(item.a, 'a'), h('span.vs-or', {}, 'or'), card(item.b, 'b')),
    h('div.row.between', {}, q.i > 0 ? h('button.btn.ghost.sm', { onclick: () => { q.i--; go('#/discover'); } }, '← Back') : h('span'), h('button.link', { onclick: () => { ui.quiz = null; go('#/discover'); } }, 'Exit quiz')));
}

/* ====================================================================== restaurant card & dishes */
const typeLabel = { restaurant: 'Restaurant', fast_food: 'Quick bite', cafe: 'Café', food_court: 'Food court' };

function restaurantCard(r, reasons = null) {
  const fav = state.favorites.restaurants.includes(r.id);
  const sc = scoreRestaurant(r); const why = reasons || sc.reasons;
  const st = r.hours ? openStatus(r.hours) : null;
  const dishes = dishesFor(r).map((d) => ({ d, ...scoreDish(d, r) })).sort((a, b) => b.score - a.score).slice(0, 3);
  const realDishes = dishes.length && dishes[0].d.real;
  return h('article.card.rest-card', {},
    h('div.row.between.nowrap', { style: { alignItems: 'flex-start' } }, h('div', { style: { minWidth: 0 } }, h('div.eyebrow', {}, r.cuisine, r.type && typeLabel[r.type] && typeLabel[r.type] !== r.cuisine ? ` · ${typeLabel[r.type]}` : ''), h('h3', {}, r.name),
      h('div.row.meta-row', {}, r.distance != null ? h('span.small.dist', {}, icon('pin', { cls: 'inl' }), fmtDist(r.distance)) : null, st ? h('span.badge.' + (st.open ? 'green' : 'bad'), {}, st.label) : null, r.price ? h('span', {}, priceDots(r.price), r.priceEst ? h('span.tiny.muted', {}, ' est.') : null) : null, r.rating ? h('span.small', {}, stars(r.rating), ` ${r.rating.toFixed(1)}`) : null)),
      h('button.icon-btn.heart' + (fav ? '.on' : ''), { 'aria-label': fav ? `Remove ${r.name} from favorites` : `Favorite ${r.name}`, 'aria-pressed': String(fav), onclick: () => toggleFavRest(r) }, icon('heart', { fill: fav }))),
    h('div.row', { style: { gap: '6px' } }, r.sample ? h('span.badge.sample', { title: 'Fictional listing shown only because no real places could be loaded' }, 'Demo listing') : null, r.userAdded ? h('span.badge', {}, 'Added by you') : null, ...(r.diet || []).filter((x) => x !== 'vegetarian' || !(r.diet || []).includes('vegan')).slice(0, 3).map((x) => h('span.badge.green', {}, x)), ...(r.features || []).slice(0, 2).map((t) => h('span.badge', {}, t)), ...(r.sample || r.userAdded ? (r.tags || []).slice(0, 3).map((t) => h('span.badge', {}, t)) : [])),
    why.length ? h('div.why', {}, why.slice(0, 3).map((w) => h('span', {}, icon('check', { cls: 'inl' }), w))) : null,
    dishes.length ? (realDishes ? h('div', {}, h('div.tiny.muted', { style: { marginBottom: '2px' } }, 'Menu picks'), dishes.map(({ d }) => dishRow(r, d)))
      : h('div.small.muted.typical', {}, h('b', {}, 'Typical for this cuisine: '), dishes.map(({ d }) => d.name).join(' · '), h('div.tiny', {}, 'Not a real menu — check what they offer.'))) : null,
    r.address ? h('div.tiny.muted', {}, r.address) : null,
    h('div.row.actions', { style: { gap: '6px' } }, h('a.btn.primary.sm', { href: dirLink(r), target: '_blank', rel: 'noopener' }, icon('nav'), 'Directions'), r.website ? h('a.btn.ghost.sm', { href: r.website, target: '_blank', rel: 'noopener' }, icon('globe'), 'Website') : null, r.phone ? h('a.btn.ghost.sm', { href: `tel:${r.phone}` }, icon('phone'), 'Call') : null,
      h('button.btn.ghost.sm', { onclick: () => orderDialog(r) }, icon('bag'), 'Order'), h('button.btn.ghost.sm', { onclick: () => logDialog(r) }, icon('utensils'), 'I ate here'),
      h('button.icon-btn.sm.quiet', { 'aria-label': `Hide ${r.name}`, title: 'Not for me — hide', onclick: () => hideRest(r) }, icon('eyeoff')), (r.sample || r.userAdded) ? h('button.icon-btn.sm.quiet', { 'aria-label': `Remove ${r.name}`, title: 'Remove', onclick: () => removeRest(r) }, icon('trash')) : null));
}

function dishRow(r, d, showRest = false) {
  const key = `${r.id}|${d.name}`; const savedIdx = state.savedDishes.findIndex((x) => x.rid === r.id && x.name === d.name);
  const saved = savedIdx >= 0;
  const bad = scoreDish(d, r).dietMismatch;
  return h('div.dish', {}, h('div.grow', {}, h('b', {}, d.name), d.price ? h('span.muted.small', {}, ` · $${d.price}`) : null, showRest ? h('div.small.muted', {}, `at ${r.name}`) : null, d.desc ? h('div.small.muted', {}, d.desc) : null,
    h('div.row', { style: { gap: '4px', marginTop: '2px' } }, ...(d.diet || []).map((x) => h('span.badge.green', {}, x)), bad.length ? h('span.badge.warn', {}, `Not ${bad.map((b) => DIET_LABEL[b]?.toLowerCase() || b).join('/')}`) : null)),
    h('button.icon-btn.heart' + (saved ? '.on' : ''), { 'aria-label': saved ? `Unsave ${d.name}` : `Save ${d.name}`, 'aria-pressed': String(saved), onclick: () => commit((s) => { if (saved) s.savedDishes.splice(savedIdx, 1); else { s.savedDishes.unshift({ id: uid('d'), rid: r.id, restName: r.name, name: d.name, price: d.price || null, desc: d.desc || '' }); learn(s, { cuisines: [r.cuisine], flavors: d.tags || [], w: 1 }); } }) }, icon('heart', { fill: saved })),
    h('button.icon-btn.quiet', { 'aria-label': `Not for me: ${d.name}`, title: 'Not for me', onclick: () => { commit((s) => { if (!s.dislikedDishes.includes(key)) { s.dislikedDishes.push(key); learn(s, { flavors: d.tags || [], w: -1.5 }); } }); toast('Got it — we\'ll show less like this'); } }, icon('eyeoff')));
}

function toggleFavRest(r) { commit((s) => { const i = s.favorites.restaurants.indexOf(r.id); if (i >= 0) s.favorites.restaurants.splice(i, 1); else { s.favorites.restaurants.unshift(r.id); learnFromRestaurant(s, r, 1.5); if (r.source === 'osm' && !s.restaurants.some((x) => x.id === r.id)) s.restaurants.unshift({ ...r }); } }); }
function hideRest(r) { commit((s) => { if (!s.dislikedRestaurants.includes(r.id)) { s.dislikedRestaurants.push(r.id); learnFromRestaurant(s, r, -1.5); } }); toast(`Hidden “${r.name}”`, { action: { label: 'Undo', fn: () => commit((s) => { s.dislikedRestaurants = s.dislikedRestaurants.filter((x) => x !== r.id); learnFromRestaurant(s, r, 1.5); }) } }); }
async function removeRest(r) { if (await confirmDialog(`Remove “${r.name}” from your list?`, { okLabel: 'Remove', danger: true })) commit((s) => { s.restaurants = s.restaurants.filter((x) => x.id !== r.id); if (r.sample && !s.dislikedRestaurants.includes(r.id)) s.dislikedRestaurants.push(r.id); s.favorites.restaurants = s.favorites.restaurants.filter((x) => x !== r.id); s.savedDishes = s.savedDishes.filter((x) => x.rid !== r.id); }); }

function orderDialog(r) {
  modal({ title: `Order from ${r.name}`, body: h('div.stack', {}, h('p.small.muted', {}, 'FOODIE doesn\'t have live menus or ordering. These links search for the restaurant on each service — availability depends on your address.'),
    r.website ? h('a.btn.primary.block', { href: r.website, target: '_blank', rel: 'noopener' }, 'Restaurant website (order / reserve)') : null,
    ...orderLinks(r).map(([n, u]) => h('a.btn.ghost.block', { href: u, target: '_blank', rel: 'noopener' }, `Search on ${n} ↗`)),
    r.phone ? h('a.btn.ghost.block', { href: `tel:${r.phone}` }, `Call for pickup: ${r.phone}`) : null,
    h('a.btn.ghost.block', { href: mapsLink(r), target: '_blank', rel: 'noopener' }, 'Open in Google Maps')) });
}

/* ====================================================================== directory */
function directory() {
  const box = h('div.grid.c2'); const count = h('span.muted.small'); const more = h('div.row', { style: { justifyContent: 'center' } });
  const apply = () => {
    let list = listing();
    const needle = ui.q.trim().toLowerCase();
    if (needle) list = list.filter((r) => (r.name + ' ' + r.cuisine + ' ' + (r.dishes || []).map((d) => d.name).join(' ')).toLowerCase().includes(needle));
    if (ui.cuisine !== 'all') list = list.filter((r) => r.cuisine === ui.cuisine);
    if (ui.price.length) list = list.filter((r) => ui.price.includes(String(r.price)));
    list = list.filter((r) => r.distance == null || r.distance <= ui.maxDist);
    if (ui.minRating) list = list.filter((r) => (r.rating || 0) >= ui.minRating);
    if (ui.favs) list = list.filter((r) => state.favorites.restaurants.includes(r.id));
    if (ui.openNow) list = list.filter((r) => { const s = r.hours ? openStatus(r.hours) : null; return s && s.open; });
    list = list.filter((r) => !state.dislikedRestaurants.includes(r.id));
    const sc = new Map(list.map((r) => [r, scoreRestaurant(r)]));
    const by = { match: (a, b) => sc.get(b).score - sc.get(a).score, dist: (a, b) => (a.distance ?? 99) - (b.distance ?? 99), rating: (a, b) => (b.rating || 0) - (a.rating || 0), price: (a, b) => (a.price || 9) - (b.price || 9) };
    list.sort(by[ui.sort]);
    count.textContent = places.status === 'loading' && !places.food.length ? 'Finding places near you…' : `${list.length} place${list.length === 1 ? '' : 's'}${ui.openNow ? ' open now' : ''}`;
    box.replaceChildren(...(list.length ? list.slice(0, ui.shown).map((r) => restaurantCard(r, sc.get(r).reasons)) : [h('div.empty', { style: { gridColumn: '1/-1' } }, h('div.big', {}, icon('search')), h('h3', {}, 'No places match'), h('p', {}, 'Loosen a filter, widen the distance, or change your location above.'))]));
    more.replaceChildren(list.length > ui.shown ? h('button.btn.ghost', { onclick: () => { ui.shown += 30; apply(); } }, `Show more (${list.length - ui.shown} left)`) : null);
  };
  const rerun = debounce(() => { ui.shown = 30; apply(); }, 120);
  const maxKm = state.profile.units === 'metric';
  const root = h('div.stack', {}, locationBar(),
    h('div.row.between', {}, h('div.search', { style: { flex: 1, minWidth: '200px' } }, h('input', { type: 'search', placeholder: 'Search restaurants, cuisines or dishes…', 'aria-label': 'Search restaurants', value: ui.q, oninput: (e) => { ui.q = e.target.value; rerun(); } })), h('button.btn.primary', { onclick: addRestaurantDialog }, icon('plus'), 'Add place')),
    h('div.chips', {}, [['openNow', 'Open now'], ['favs', 'Favorites']].map(([k, l]) => h('button.chip.sm' + (ui[k] ? '.on' : ''), { 'aria-pressed': String(ui[k]), onclick: (e) => { ui[k] = !ui[k]; e.currentTarget.classList.toggle('on', ui[k]); e.currentTarget.setAttribute('aria-pressed', String(ui[k])); ui.shown = 30; apply(); } }, l)),
      h('button.chip.sm' + (ui.showSample ? '.on' : ''), { 'aria-pressed': String(ui.showSample), onclick: (e) => { ui.showSample = !ui.showSample; e.currentTarget.classList.toggle('on', ui.showSample); apply(); } }, 'Include demo listings')),
    h('details.card.flat', { style: { padding: '12px 16px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 650 } }, 'Filters & sorting'),
      h('div.stack', { style: { marginTop: '14px' } }, h('div.grid.c2', {}, field('Cuisine', h('select', { onchange: (e) => { ui.cuisine = e.target.value; apply(); } }, h('option', { value: 'all' }, 'All cuisines'), CUISINES.map((c) => h('option', { value: c, selected: ui.cuisine === c }, c)))),
        field('Sort by', h('select', { onchange: (e) => { ui.sort = e.target.value; apply(); } }, [['match', 'Best match for me'], ['dist', 'Nearest'], ['rating', 'Highest rated'], ['price', 'Lowest price']].map(([v, l]) => h('option', { value: v, selected: ui.sort === v }, l))))),
        h('div.field', {}, h('label', {}, 'Price (where known)'), chipGroup({ options: ['1', '2', '3', '4'].map((p) => ({ id: p, label: '$'.repeat(+p) })), value: ui.price, onChange: (v) => { ui.price = v; apply(); }, small: true })),
        h('div.grid.c2', {}, field(`Within ${fmtDist(ui.maxDist)}`, h('input', { type: 'range', min: 1, max: 30, value: ui.maxDist, oninput: (e) => { ui.maxDist = +e.target.value; e.target.closest('.field').querySelector('label').textContent = `Within ${fmtDist(ui.maxDist)}`; rerun(); } })),
          field('Minimum rating', h('select', { onchange: (e) => { ui.minRating = +e.target.value; apply(); } }, [[0, 'Any'], [4, '4.0+'], [4.5, '4.5+']].map(([v, l]) => h('option', { value: v, selected: ui.minRating === v }, l))), 'Ratings only exist for places you added or rated.')))),
    h('div.row.between', {}, count, h('div.row', { style: { gap: '6px' } }, h('span.small.muted', {}, 'Also search:'), h('a.chip.sm', { href: 'https://www.google.com/maps/search/restaurants+near+me', target: '_blank', rel: 'noopener' }, 'Google Maps'), h('a.chip.sm', { href: 'https://www.yelp.com/search?find_desc=Restaurants&find_loc=Current+Location', target: '_blank', rel: 'noopener' }, 'Yelp'))),
    box, more);
  apply();
  refresher = { anchor: box, fn: apply };
  return root;
}

function addRestaurantDialog() {
  const d = { name: '', cuisine: 'American', price: 2, rating: '', distance: '', address: '', website: '', phone: '', dishes: '' };
  modal({ title: 'Add a restaurant', body: h('div.stack', {}, field('Name', h('input', { type: 'text', autofocus: true, oninput: (e) => (d.name = e.target.value) })),
    h('div.grid.c2', {}, field('Cuisine', h('select', { onchange: (e) => (d.cuisine = e.target.value) }, CUISINES.map((c) => h('option', { value: c }, c)))), field('Price', h('select', { onchange: (e) => (d.price = +e.target.value) }, [1, 2, 3, 4].map((p) => h('option', { value: p, selected: p === 2 }, '$'.repeat(p)))))),
    h('div.grid.c2', {}, field('Your rating (1–5, optional)', h('input', { type: 'number', min: 1, max: 5, step: 0.5, oninput: (e) => (d.rating = e.target.value) })), field('Distance (miles, optional)', h('input', { type: 'number', min: 0, step: 0.1, oninput: (e) => (d.distance = e.target.value) }))),
    field('Address', h('input', { type: 'text', oninput: (e) => (d.address = e.target.value) })), h('div.grid.c2', {}, field('Website', h('input', { type: 'url', placeholder: 'https://', oninput: (e) => (d.website = e.target.value) })), field('Phone', h('input', { type: 'tel', oninput: (e) => (d.phone = e.target.value) }))),
    field('Favorite dishes (one per line, optionally “Name - $price”)', h('textarea', { rows: 3, oninput: (e) => (d.dishes = e.target.value) }))),
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => {
      if (!d.name.trim()) { toast('Enter a name'); return false; }
      const dishes = d.dishes.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)\s*[-–—]\s*\$?(\d+(?:\.\d+)?)$/); return { name: (m ? m[1] : l), price: m ? +m[2] : 0, desc: '', tags: CUISINE_FLAVORS[d.cuisine] || [], diet: [] }; });
      const r = { id: uid('rest'), name: d.name.trim(), cuisine: d.cuisine, price: d.price, rating: d.rating ? +d.rating : null, distance: d.distance !== '' ? +d.distance : null, address: d.address, website: d.website || null, phone: d.phone || null, tags: CUISINE_FLAVORS[d.cuisine] || [], dishes, userAdded: true };
      commit((s) => { s.restaurants.unshift(r); });
      toast('Restaurant added');
    } }] });
}

/* ====================================================================== saved */
function saved() {
  const favs = state.favorites.restaurants.map(findRest).filter(Boolean);
  return h('div.stack.lg', {},
    h('section', {}, sectionHead('Favorite restaurants'), favs.length ? h('div.grid.c2', {}, favs.map((r) => restaurantCard(r))) : h('div.card.empty', {}, h('div.big', {}, icon('heart')), h('p', {}, 'Tap the heart on any restaurant to keep it here.'))),
    h('section', {}, sectionHead('Saved dishes'), state.savedDishes.length ? h('div.card.flat', { style: { padding: '4px 16px' } }, state.savedDishes.map((d) => h('div.dish', {}, h('div.grow', {}, h('b', {}, d.name), d.price ? h('span.muted.small', {}, ` · $${d.price}`) : null, h('div.small.muted', {}, `at ${d.restName}`)), h('button.icon-btn', { 'aria-label': `Remove ${d.name}`, onclick: () => commit((s) => { s.savedDishes = s.savedDishes.filter((x) => x.id !== d.id); }) }, '✕')))) : h('div.card.empty', {}, h('div.big', {}, icon('utensils')), h('p', {}, 'Save dishes you want to try or order again.'))));
}

/* ====================================================================== dining log */
function logDialog(r = null) {
  const d = { date: today(), name: r?.name || '', amount: '', dish: '', rating: 0 };
  modal({ title: 'Log a meal out', body: h('div.stack', {}, field('Where', h('input', { type: 'text', value: d.name, list: 'rest-names', oninput: (e) => (d.name = e.target.value) })), h('datalist#rest-names', {}, state.restaurants.map((x) => h('option', { value: x.name }))),
    h('div.grid.c2', {}, field('Date', h('input', { type: 'date', value: d.date, max: today(), oninput: (e) => (d.date = e.target.value) })), field('Total spent ($)', h('input', { type: 'number', min: 0, step: 0.01, oninput: (e) => (d.amount = e.target.value) }))),
    field('What did you have?', h('input', { type: 'text', oninput: (e) => (d.dish = e.target.value) })), h('div.field', {}, h('label', {}, 'How was it?'), (() => { const w = h('div.star-input'); [1, 2, 3, 4, 5].forEach((i) => w.append(h('button', { type: 'button', 'aria-label': `${i} stars`, onclick: () => { d.rating = i; [...w.children].forEach((b, j) => b.classList.toggle('on', j < i)); } }, '★'))); return w; })())),
    actions: [{ label: 'Cancel' }, { label: 'Log it', primary: true, onClick: () => {
      if (!d.name.trim()) { toast('Where did you eat?'); return false; }
      const match = r || state.restaurants.find((x) => x.name.toLowerCase() === d.name.trim().toLowerCase());
      commit((s) => {
        s.diningLog.unshift({ id: uid('log'), date: d.date, name: d.name.trim(), rid: match?.id || null, cuisine: match?.cuisine || null, amount: d.amount !== '' ? +d.amount : null, dish: d.dish, rating: d.rating || null });
        if (match) { learnFromRestaurant(s, match, 1 + (d.rating >= 4 ? 1 : d.rating && d.rating <= 2 ? -2.5 : 0)); if (match.source === 'osm' && !s.restaurants.some((x) => x.id === match.id)) s.restaurants.unshift({ ...match, userAdded: false }); }
        if (d.amount !== '' && match?.price == null) { const p = +d.amount < 15 ? 1 : +d.amount < 30 ? 2 : +d.amount < 55 ? 3 : 4; learn(s, { price: p, w: 1 }); }
      });
      toast('Logged — your recommendations will improve');
    } }] });
}

function diningLog() {
  const log = state.diningLog; const month = today().slice(0, 7);
  const thisMonth = log.filter((l) => l.date.startsWith(month) && l.amount);
  const spent = sum(thisMonth, (l) => l.amount); const budget = state.profile.diningBudget;
  const avg = log.filter((l) => l.amount).length ? sum(log.filter((l) => l.amount), (l) => l.amount) / log.filter((l) => l.amount).length : 0;
  return h('div.stack.lg', {},
    h('div.grid.c3', {}, h('div.card.stat', {}, h('span.n', {}, money(spent, 0)), h('span.l', {}, 'Eating out this month'), h('span.tiny.muted', {}, budget ? `of ${money(budget, 0)} budget` : 'set a dining budget in Profile')),
      h('div.card.stat', {}, h('span.n', {}, String(log.length)), h('span.l', {}, 'Meals logged')), h('div.card.stat', {}, h('span.n', {}, avg ? money(avg, 0) : '—'), h('span.l', {}, 'Average spend'))),
    h('div.row.between', {}, h('h2', {}, 'History'), h('button.btn.primary', { onclick: () => logDialog() }, icon('plus'), 'Log a meal out')),
    log.length ? h('div.card.flat', { style: { padding: '4px 16px' } }, log.map((l) => h('div.dish', {}, h('div.grow', {}, h('b', {}, l.name), h('div.small.muted', {}, [fmtDay(l.date, { month: 'short', day: 'numeric', year: 'numeric' }), l.dish].filter(Boolean).join(' · '))), l.rating ? stars(l.rating) : null, l.amount != null ? h('b', {}, money(l.amount)) : null,
      h('button.icon-btn', { 'aria-label': 'Delete entry', onclick: () => commit((s) => { s.diningLog = s.diningLog.filter((x) => x.id !== l.id); }) }, '✕')))) : h('div.card.empty', {}, h('div.big', {}, icon('utensils')), h('p', {}, 'Log meals you eat out to track spending — and teach FOODIE your habits.')));
}
