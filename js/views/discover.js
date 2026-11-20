/** Food discovery: taste quiz, personalised restaurants & dishes, directory, saved items, dining log. */
import { h, modal, toast, confirmDialog, today, fmtDay, money, uid, debounce, sum, round } from '../lib/util.js';
import { state, commit, allRecipes } from '../store.js';
import { thumb, chipGroup, seg, field, go, priceDots, stars, sectionHead, notice, recipeCard } from '../ui.js';
import { QUIZ } from '../data/quiz.js';
import { CUISINES, DIET_LABEL, CUISINE_FLAVORS, FLAVORS } from '../engines/nutrition.js';
import { OSM_CUISINE_MAP } from '../data/restaurants.js';
import { quizResult, applyQuiz, recommendRestaurants, scoreRestaurant, dishesFor, scoreDish, learn, learnFromRestaurant, topTaste, preferredPrice } from '../engines/taste.js';
import { eligible } from '../engines/planner.js';

const ui = { tab: 'foryou', quiz: null, q: '', cuisine: 'all', price: [], maxDist: 15, minRating: 0, sort: 'match', favs: false, hideSample: false, nearby: null, nearbyStatus: '' };

const enc = encodeURIComponent;
const mapsLink = (r) => `https://www.google.com/maps/search/?api=1&query=${enc([r.name, r.address].filter(Boolean).join(' '))}`;
const orderLinks = (r) => [['DoorDash', `https://www.doordash.com/search/store/${enc(r.name)}/`], ['Uber Eats', `https://www.ubereats.com/search?q=${enc(r.name)}`], ['Grubhub', `https://www.grubhub.com/search?queryText=${enc(r.name)}`]];

export function renderDiscover() {
  const tabs = [['foryou', 'For you'], ['restaurants', 'Restaurants'], ['saved', 'Saved'], ['log', 'Dining log']];
  return h('div.view.stack', {},
    h('div.page-head', {}, h('div', {}, h('h1', {}, 'Discover'), h('p', {}, 'Decide what to eat in seconds — then find it, save it, and let FOODIE learn what you love.'))),
    h('div.tabs', { role: 'tablist' }, tabs.map(([id, l]) => h('button' + (ui.tab === id ? '.on' : ''), { role: 'tab', 'aria-selected': String(ui.tab === id), onclick: () => { ui.tab = id; go('#/discover'); } }, l))),
    ui.tab === 'foryou' ? forYou() : ui.tab === 'restaurants' ? directory() : ui.tab === 'saved' ? saved() : diningLog());
}

/* ====================================================================== quiz + recommendations */
function forYou() {
  if (ui.quiz) return quizView();
  const hasTaste = Object.keys(state.taste.cuisine).length > 0;
  const last = state.quizHistory[0];
  const startCard = h('section.hero', { style: { padding: '24px 20px' } }, h('div.stack', { style: { maxWidth: '520px' } },
    h('span.eyebrow', {}, '7 quick questions'), h('h2', { style: { color: '#fff' } }, 'What should I eat?'), h('p', {}, 'Pick between two foods at a time. FOODIE narrows down cuisines, flavors and your price mood — then recommends places and dishes.'),
    h('div.row', {}, h('button.btn.primary', { onclick: () => { ui.quiz = { i: 0, answers: [], done: false }; go('#/discover'); } }, last ? 'Retake the quiz' : 'Start the quiz'))));
  if (!hasTaste) return h('div.stack.lg', {}, startCard, h('div.card.soft', {}, h('b', {}, 'Prefer to browse?'), h('p.small.muted', { style: { margin: '4px 0 10px' } }, 'The Restaurants tab lets you search, filter, save favorites and look up real places near you.'), h('button.btn.ghost', { onclick: () => { ui.tab = 'restaurants'; go('#/discover'); } }, 'Browse restaurants')));

  const recs = recommendRestaurants(state.restaurants).slice(0, 5);
  const topC = topTaste('cuisine', 3); const topF = topTaste('flavor', 4);
  const homeIdeas = allRecipes().filter((r) => topC.includes(r.c) && eligible(r, { diets: state.profile.diets }) && ['lunch', 'dinner'].includes(r.t)).slice(0, 4);
  const dishRecs = state.restaurants.flatMap((r) => dishesFor(r).filter((d) => d.real).map((d) => ({ r, d, ...scoreDish(d, r) }))).filter((x) => x.score > -50).sort((a, b) => b.score - a.score).slice(0, 6);
  return h('div.stack.lg', {},
    h('div.split.even', {}, startCard, h('section.card.stack', {}, h('h3', {}, 'Your taste so far'), h('p.small.muted', { style: { margin: 0 } }, 'Learned from your quiz answers, favorites, saved dishes, ratings and dining log. It stays on this device.'),
      tasteBars('cuisine', 'Cuisines'), tasteBars('flavor', 'Flavors'), preferredPrice() ? h('div.row', {}, h('span.small.muted', {}, 'Usual price range'), priceDots(preferredPrice())) : null,
      h('button.btn.ghost.sm', { style: { alignSelf: 'flex-start' }, onclick: async () => { if (await confirmDialog('Reset everything FOODIE has learned about your taste?', { okLabel: 'Reset', danger: true })) commit((s) => { s.taste = { cuisine: {}, flavor: {}, price: {} }; s.quizHistory = []; }); } }, 'Reset learned taste'))),
    sectionHead('Restaurants for you', null, state.restaurants.some((r) => r.sample) ? 'Includes sample listings — add real places in the Restaurants tab' : ''),
    h('div.grid.c2', {}, recs.map(({ r, reasons }) => restaurantCard(r, reasons))),
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
    return h('div.stack.lg', { style: { maxWidth: '720px', marginInline: 'auto' } },
      h('div.card.stack', { style: { textAlign: 'center', alignItems: 'center' } }, h('div', { style: { fontSize: '3rem' } }, '🎉'), h('h2', {}, 'Your taste profile'), h('p.muted', {}, 'Here\'s what we learned. We\'ll use it to rank restaurants, dishes and meal-plan recipes.'),
        h('div.stack.sm', { style: { width: '100%' } }, tasteLine('Cuisines', res.cuisines.slice(0, 4).map((x) => x[0])), tasteLine('Flavors', res.flavors.slice(0, 4).map((x) => x[0])), res.price ? h('div.row', { style: { justifyContent: 'center' } }, h('span.small.muted', {}, 'Budget mood'), priceDots(res.price)) : null),
        h('div.row', { style: { justifyContent: 'center' } }, h('button.btn.primary', { onclick: () => { applyQuiz(res); ui.quiz = null; toast('Saved — recommendations updated'); } }, 'See my recommendations'), h('button.btn.ghost', { onclick: () => { ui.quiz = { i: 0, answers: [], done: false }; go('#/discover'); } }, 'Retake'))));
  }
  const item = QUIZ[q.i];
  const pick = (c) => { q.answers[q.i] = c; if (q.i + 1 >= QUIZ.length) q.done = true; else q.i++; go('#/discover'); };
  const card = (o, c) => h('button.vs-card', { onclick: () => pick(c), 'aria-label': o.label }, h('span.e', {}, o.emoji), h('b', {}, o.label));
  return h('div.stack.lg', { style: { maxWidth: '760px', marginInline: 'auto' } },
    h('div.steps', { 'aria-label': `Question ${q.i + 1} of ${QUIZ.length}` }, QUIZ.map((_, i) => h('i' + (i <= q.i ? '.on' : '')))),
    h('div', { style: { textAlign: 'center' } }, h('span.eyebrow', {}, `Question ${q.i + 1} of ${QUIZ.length}`), h('h2', { style: { marginTop: '6px' } }, item.q)),
    h('div.versus', {}, card(item.a, 'a'), h('span.vs-or', {}, 'or'), card(item.b, 'b')),
    h('div.row.between', {}, q.i > 0 ? h('button.btn.ghost.sm', { onclick: () => { q.i--; go('#/discover'); } }, '← Back') : h('span'), h('button.link', { onclick: () => { ui.quiz = null; go('#/discover'); } }, 'Exit quiz')));
}
const tasteLine = (l, items) => h('div.row', { style: { justifyContent: 'center', gap: '6px' } }, h('span.small.muted', {}, l), ...items.map((x) => h('span.badge.green', {}, x[0].toUpperCase() + x.slice(1))));

/* ====================================================================== restaurant card & dishes */
function restaurantCard(r, reasons = null) {
  const fav = state.favorites.restaurants.includes(r.id);
  const why = reasons || scoreRestaurant(r).reasons;
  const dishes = dishesFor(r).map((d) => ({ d, ...scoreDish(d, r) })).sort((a, b) => b.score - a.score).slice(0, 3);
  return h('article.card.rest-card', {},
    h('div.row.between.nowrap', { style: { alignItems: 'flex-start' } }, h('div', {}, h('div.eyebrow', {}, r.cuisine), h('h3', {}, r.name),
      h('div.row', { style: { gap: '10px', marginTop: '4px' } }, r.price ? priceDots(r.price) : null, r.rating ? h('span.small', {}, stars(r.rating), ` ${r.rating.toFixed(1)}`) : h('span.tiny.muted', {}, 'no rating data'), r.distance != null ? h('span.small.muted', {}, `📍 ${r.distance.toFixed(1)} mi`) : null)),
      h('button.icon-btn', { 'aria-label': fav ? 'Remove favorite' : 'Favorite', 'aria-pressed': String(fav), style: { color: fav ? 'var(--tomato)' : 'var(--muted)', fontSize: '1.3rem' }, onclick: () => toggleFavRest(r) }, fav ? '♥' : '♡')),
    h('div.row', { style: { gap: '6px' } }, r.sample ? h('span.badge.sample', { title: 'Fictional listing included so the app works on first launch' }, 'Sample listing') : null, r.source === 'osm' ? h('span.badge', {}, 'OpenStreetMap') : null, r.userAdded ? h('span.badge', {}, 'Added by you') : null, ...(r.tags || []).slice(0, 3).map((t) => h('span.badge', {}, t))),
    why.length ? h('div.why', {}, why.slice(0, 3).map((w) => h('span', {}, '✓ ' + w))) : null,
    r.hours ? h('div.tiny.muted', {}, `Hours (OSM, may be outdated): ${r.hours}`) : null,
    h('div', {}, h('div.tiny.muted', { style: { marginBottom: '2px' } }, dishes[0]?.d.real ? 'Menu picks' : 'Popular dishes to look for (typical for this cuisine — check the real menu)'), dishes.map(({ d }) => dishRow(r, d))),
    h('div.row', { style: { gap: '6px' } }, h('a.btn.ghost.sm', { href: mapsLink(r), target: '_blank', rel: 'noopener' }, '🗺 Directions'), r.website ? h('a.btn.ghost.sm', { href: r.website, target: '_blank', rel: 'noopener' }, '🌐 Website') : null, r.phone ? h('a.btn.ghost.sm', { href: `tel:${r.phone}` }, '📞 Call') : null,
      h('button.btn.ghost.sm', { onclick: () => orderDialog(r) }, '🛵 Order / pickup'), h('button.btn.ghost.sm', { onclick: () => logDialog(r) }, '🍴 I ate here'),
      h('button.btn.ghost.sm', { 'aria-label': `Hide ${r.name}`, onclick: () => hideRest(r) }, '👎'), (r.sample || r.userAdded || r.source === 'osm') ? h('button.btn.ghost.sm', { 'aria-label': `Remove ${r.name}`, onclick: () => removeRest(r) }, '🗑') : null));
}

function dishRow(r, d, showRest = false) {
  const key = `${r.id}|${d.name}`; const savedIdx = state.savedDishes.findIndex((x) => x.rid === r.id && x.name === d.name);
  const saved = savedIdx >= 0;
  const bad = scoreDish(d, r).dietMismatch;
  return h('div.dish', {}, h('div.grow', {}, h('b', {}, d.name), d.price ? h('span.muted.small', {}, ` · $${d.price}`) : null, showRest ? h('div.small.muted', {}, `at ${r.name}`) : null, d.desc ? h('div.small.muted', {}, d.desc) : null,
    h('div.row', { style: { gap: '4px', marginTop: '2px' } }, ...(d.diet || []).map((x) => h('span.badge.green', {}, x)), bad.length ? h('span.badge.warn', {}, `Not ${bad.map((b) => DIET_LABEL[b]?.toLowerCase() || b).join('/')}`) : null)),
    h('button.icon-btn', { 'aria-label': saved ? `Unsave ${d.name}` : `Save ${d.name}`, 'aria-pressed': String(saved), style: { color: saved ? 'var(--tomato)' : 'var(--muted)' }, onclick: () => commit((s) => { if (saved) s.savedDishes.splice(savedIdx, 1); else { s.savedDishes.unshift({ id: uid('d'), rid: r.id, restName: r.name, name: d.name, price: d.price || null, desc: d.desc || '' }); learn(s, { cuisines: [r.cuisine], flavors: d.tags || [], w: 1 }); } }) }, saved ? '♥' : '♡'),
    h('button.icon-btn', { 'aria-label': `Not for me: ${d.name}`, onclick: () => { commit((s) => { if (!s.dislikedDishes.includes(key)) { s.dislikedDishes.push(key); learn(s, { flavors: d.tags || [], w: -1.5 }); } }); toast('Got it — we\'ll show less like this'); } }, '👎'));
}

function toggleFavRest(r) { commit((s) => { const i = s.favorites.restaurants.indexOf(r.id); if (i >= 0) s.favorites.restaurants.splice(i, 1); else { s.favorites.restaurants.unshift(r.id); learnFromRestaurant(s, r, 1.5); } }); }
function hideRest(r) { commit((s) => { if (!s.dislikedRestaurants.includes(r.id)) { s.dislikedRestaurants.push(r.id); learnFromRestaurant(s, r, -1.5); } }); toast(`Hidden “${r.name}”`, { action: { label: 'Undo', fn: () => commit((s) => { s.dislikedRestaurants = s.dislikedRestaurants.filter((x) => x !== r.id); learnFromRestaurant(s, r, 1.5); }) } }); }
async function removeRest(r) { if (await confirmDialog(`Remove “${r.name}” from your directory?`, { okLabel: 'Remove', danger: true })) commit((s) => { s.restaurants = s.restaurants.filter((x) => x.id !== r.id); s.favorites.restaurants = s.favorites.restaurants.filter((x) => x !== r.id); s.savedDishes = s.savedDishes.filter((x) => x.rid !== r.id); }); }

function orderDialog(r) {
  modal({ title: `Order from ${r.name}`, body: h('div.stack', {}, h('p.small.muted', {}, 'FOODIE doesn\'t have live menus or ordering. These links search for the restaurant on each service — availability depends on your address.'),
    r.website ? h('a.btn.primary.block', { href: r.website, target: '_blank', rel: 'noopener' }, 'Restaurant website (order / reserve)') : null,
    ...orderLinks(r).map(([n, u]) => h('a.btn.ghost.block', { href: u, target: '_blank', rel: 'noopener' }, `Search on ${n} ↗`)),
    r.phone ? h('a.btn.ghost.block', { href: `tel:${r.phone}` }, `📞 Call for pickup: ${r.phone}`) : null,
    h('a.btn.ghost.block', { href: mapsLink(r), target: '_blank', rel: 'noopener' }, '🗺 Open in Google Maps')) });
}

/* ====================================================================== directory */
function directory() {
  const box = h('div.grid.c2'); const count = h('span.muted.small');
  const apply = () => {
    let list = [...state.restaurants, ...(ui.nearby || []).filter((n) => !state.restaurants.some((r) => r.id === n.id))];
    const needle = ui.q.trim().toLowerCase();
    if (needle) list = list.filter((r) => (r.name + ' ' + r.cuisine + ' ' + (r.dishes || []).map((d) => d.name).join(' ')).toLowerCase().includes(needle));
    if (ui.cuisine !== 'all') list = list.filter((r) => r.cuisine === ui.cuisine);
    if (ui.price.length) list = list.filter((r) => ui.price.includes(String(r.price)));
    list = list.filter((r) => r.distance == null || r.distance <= ui.maxDist);
    if (ui.minRating) list = list.filter((r) => (r.rating || 0) >= ui.minRating);
    if (ui.favs) list = list.filter((r) => state.favorites.restaurants.includes(r.id));
    if (ui.hideSample) list = list.filter((r) => !r.sample);
    list = list.filter((r) => !state.dislikedRestaurants.includes(r.id));
    const sc = new Map(list.map((r) => [r, scoreRestaurant(r)]));
    const by = { match: (a, b) => sc.get(b).score - sc.get(a).score, dist: (a, b) => (a.distance ?? 99) - (b.distance ?? 99), rating: (a, b) => (b.rating || 0) - (a.rating || 0), price: (a, b) => (a.price || 9) - (b.price || 9) };
    list.sort(by[ui.sort]);
    count.textContent = `${list.length} place${list.length === 1 ? '' : 's'}`;
    box.replaceChildren(...(list.length ? list.slice(0, 40).map((r) => restaurantCard(r, sc.get(r).reasons)) : [h('div.empty', { style: { gridColumn: '1/-1' } }, h('div.big', {}, '🔎'), h('h3', {}, 'No places match'), h('p', {}, 'Loosen a filter, or look up real restaurants near you above.'))]));
  };
  const rerun = debounce(apply, 120);
  const nearbyCard = h('section.card.stack', {}, h('h3', {}, '📍 Real restaurants near you'),
    h('p.small.muted', { style: { margin: 0 } }, 'Looks up real places from OpenStreetMap (free, volunteer-maintained). It shows names, cuisine tags, websites and phone numbers where mapped — but no ratings or live hours guarantees. Your location is sent to OpenStreetMap services only when you press a button.'),
    h('div.row', {}, h('button.btn.primary', { onclick: useLocation }, 'Use my location'), (() => { let q = ''; return h('form.row.nowrap', { style: { gap: '8px', flex: 1 }, onsubmit: (e) => { e.preventDefault(); if (q.trim()) lookupByText(q.trim()); } }, h('input', { type: 'text', placeholder: 'or a ZIP / city', 'aria-label': 'ZIP or city', oninput: (e) => (q = e.target.value) }), h('button.btn.ghost', { type: 'submit' }, 'Search')); })()),
    h('div#nearby-status.small.muted', { role: 'status' }, ui.nearbyStatus), h('div.row', {}, h('span.small.muted', {}, 'Or search the web:'), h('a.chip.sm', { href: `https://www.google.com/maps/search/restaurants+near+me`, target: '_blank', rel: 'noopener' }, 'Google Maps'), h('a.chip.sm', { href: 'https://www.yelp.com/search?find_desc=Restaurants&find_loc=Current+Location', target: '_blank', rel: 'noopener' }, 'Yelp')));
  const root = h('div.stack', {}, nearbyCard,
    h('div.row.between', {}, h('div.search', { style: { flex: 1, minWidth: '200px' } }, h('input', { type: 'search', placeholder: 'Search restaurants or dishes…', 'aria-label': 'Search restaurants', value: ui.q, oninput: (e) => { ui.q = e.target.value; rerun(); } })), h('button.btn.primary', { onclick: addRestaurantDialog }, '＋ Add restaurant')),
    h('details.card.flat', { style: { padding: '12px 16px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 650 } }, 'Filters & sorting'),
      h('div.stack', { style: { marginTop: '14px' } }, h('div.grid.c2', {}, field('Cuisine', h('select', { onchange: (e) => { ui.cuisine = e.target.value; apply(); } }, h('option', { value: 'all' }, 'All cuisines'), CUISINES.map((c) => h('option', { value: c, selected: ui.cuisine === c }, c)))),
        field('Sort by', h('select', { onchange: (e) => { ui.sort = e.target.value; apply(); } }, [['match', 'Best match for me'], ['dist', 'Nearest'], ['rating', 'Highest rated'], ['price', 'Lowest price']].map(([v, l]) => h('option', { value: v, selected: ui.sort === v }, l))))),
        h('div.field', {}, h('label', {}, 'Price'), chipGroup({ options: ['1', '2', '3', '4'].map((p) => ({ id: p, label: '$'.repeat(+p) })), value: ui.price, onChange: (v) => { ui.price = v; apply(); }, small: true })),
        h('div.grid.c2', {}, field(`Within ${ui.maxDist} miles`, h('input', { type: 'range', min: 1, max: 30, value: ui.maxDist, oninput: (e) => { ui.maxDist = +e.target.value; e.target.closest('.field').querySelector('label').textContent = `Within ${ui.maxDist} miles`; rerun(); } })),
          field('Minimum rating', h('select', { onchange: (e) => { ui.minRating = +e.target.value; apply(); } }, [[0, 'Any'], [4, '4.0+'], [4.5, '4.5+']].map(([v, l]) => h('option', { value: v, selected: ui.minRating === v }, l))))),
        h('div.chips', {}, [['favs', '♥ Favorites only'], ['hideSample', 'Hide sample listings']].map(([k, l]) => h('button.chip.sm' + (ui[k] ? '.on' : ''), { 'aria-pressed': String(ui[k]), onclick: (e) => { ui[k] = !ui[k]; e.currentTarget.classList.toggle('on', ui[k]); apply(); } }, l))))),
    count, box);
  apply();
  return root;
}

/* ---- OpenStreetMap lookups (public APIs; no key) ---- */
const miles = (a, b, c, d) => { const R = 3958.8, rad = Math.PI / 180, dLat = (c - a) * rad, dLon = (d - b) * rad; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
export function parseOverpass(json, lat, lon) {
  const out = [];
  for (const el of json.elements || []) {
    const t = el.tags || {}; if (!t.name) continue;
    const clat = el.lat ?? el.center?.lat, clon = el.lon ?? el.center?.lon;
    const raw = (t.cuisine || '').split(/[;,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const mapped = raw.map((c) => OSM_CUISINE_MAP[c]).find(Boolean);
    const cuisine = mapped || (raw[0] ? raw[0].replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Restaurant');
    const web = t.website || t['contact:website'];
    const addr = [t['addr:housenumber'] && t['addr:street'] ? `${t['addr:housenumber']} ${t['addr:street']}` : t['addr:street'], t['addr:city']].filter(Boolean).join(', ');
    out.push({ id: `osm-${el.type}-${el.id}`, name: t.name, cuisine, price: null, rating: null, distance: clat != null ? round(miles(lat, lon, clat, clon), 1) : null, address: addr, website: web && /^https?:\/\//.test(web) ? web : web ? 'https://' + web : null, phone: t.phone || t['contact:phone'] || null, hours: t.opening_hours || null, tags: CUISINE_FLAVORS[mapped] || [], source: 'osm', dishes: [], diet: [t['diet:vegan'] === 'yes' ? 'vegan' : null, t['diet:vegetarian'] === 'yes' ? 'vegetarian' : null].filter(Boolean) });
  }
  return out.sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99)).slice(0, 40);
}

async function fetchNearby(lat, lon, label) {
  const status = (m) => { ui.nearbyStatus = m; const el = document.getElementById('nearby-status'); if (el) el.textContent = m; };
  status('Looking up restaurants…');
  try {
    const q = `[out:json][timeout:20];(node["amenity"="restaurant"](around:4000,${lat},${lon});way["amenity"="restaurant"](around:4000,${lat},${lon}););out center 80;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + enc(q) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    ui.nearby = parseOverpass(await res.json(), lat, lon);
    commit((s) => { s.profile.homeLoc = { lat, lon, label: label || 'My location' }; }, { silent: true });
    status(ui.nearby.length ? `Found ${ui.nearby.length} places near ${label || 'you'}. Save the ones you like with ♥.` : 'No mapped restaurants found nearby. Try a bigger city or add one manually.');
    go('#/discover');
  } catch (e) { status('Couldn\'t reach the OpenStreetMap servers (they may be busy, or you\'re offline). Try again in a moment, or add places manually.'); }
}
function useLocation() {
  if (!navigator.geolocation) { toast('Location isn\'t available in this browser — enter a ZIP or city instead'); return; }
  navigator.geolocation.getCurrentPosition((p) => fetchNearby(p.coords.latitude, p.coords.longitude, 'you'), () => toast('Location permission denied — enter a ZIP or city instead'), { timeout: 10000 });
}
async function lookupByText(q) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${enc(q)}`);
    const j = await res.json();
    if (!j[0]) { toast('Couldn\'t find that place'); return; }
    fetchNearby(+j[0].lat, +j[0].lon, q);
  } catch { toast('Couldn\'t reach the geocoding service — try “Use my location”'); }
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
  const favs = state.restaurants.filter((r) => state.favorites.restaurants.includes(r.id)).concat((ui.nearby || []).filter((n) => state.favorites.restaurants.includes(n.id) && !state.restaurants.some((r) => r.id === n.id)));
  return h('div.stack.lg', {},
    h('section', {}, sectionHead('Favorite restaurants'), favs.length ? h('div.grid.c2', {}, favs.map((r) => restaurantCard(r))) : h('div.card.empty', {}, h('div.big', {}, '♡'), h('p', {}, 'Tap the heart on any restaurant to keep it here.'))),
    h('section', {}, sectionHead('Saved dishes'), state.savedDishes.length ? h('div.card.flat', { style: { padding: '4px 16px' } }, state.savedDishes.map((d) => h('div.dish', {}, h('div.grow', {}, h('b', {}, d.name), d.price ? h('span.muted.small', {}, ` · $${d.price}`) : null, h('div.small.muted', {}, `at ${d.restName}`)), h('button.icon-btn', { 'aria-label': `Remove ${d.name}`, onclick: () => commit((s) => { s.savedDishes = s.savedDishes.filter((x) => x.id !== d.id); }) }, '✕')))) : h('div.card.empty', {}, h('div.big', {}, '🍽️'), h('p', {}, 'Save dishes you want to try or order again.'))));
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
    h('div.row.between', {}, h('h2', {}, 'History'), h('button.btn.primary', { onclick: () => logDialog() }, '＋ Log a meal out')),
    log.length ? h('div.card.flat', { style: { padding: '4px 16px' } }, log.map((l) => h('div.dish', {}, h('div.grow', {}, h('b', {}, l.name), h('div.small.muted', {}, [fmtDay(l.date, { month: 'short', day: 'numeric', year: 'numeric' }), l.dish].filter(Boolean).join(' · '))), l.rating ? stars(l.rating) : null, l.amount != null ? h('b', {}, money(l.amount)) : null,
      h('button.icon-btn', { 'aria-label': 'Delete entry', onclick: () => commit((s) => { s.diningLog = s.diningLog.filter((x) => x.id !== l.id); }) }, '✕')))) : h('div.card.empty', {}, h('div.big', {}, '🍴'), h('p', {}, 'Log meals you eat out to track spending — and teach FOODIE your habits.')));
}
