/** Dinner-style recipe families (sheet-pan, skillet, stir-fry, curries, pasta, handhelds, bakes, soups). */
import { I, Rec, rng, shuffle, pick, pickN, list, cap, phr, nm, prepLine, hash } from './lib.mjs';
import { P, DONE, ROAST_MIN, SEAR_MIN, V, vegs, S, KITS, kitsFor, SAUCES } from './recipe-data.mjs';

const ALLS = ['spring', 'summer', 'autumn', 'winter'];
const seasonsOf = (ids) => { const sets = ids.map((id) => V[id]?.se || ALLS); const x = ALLS.filter((s) => sets.every((st) => st.includes(s))); return x.length && x.length < 4 ? x : undefined; };
const DENSE = new Set(['sweet-potato', 'butternut-squash', 'parsnip', 'beet', 'acorn-squash']);
const QUICK = ['asparagus', 'zucchini', 'bell-pepper', 'green-beans', 'cherry-tomato', 'mushroom', 'red-onion', 'broccoli', 'okra'];
const vegLabel = (id) => V[id].label;
const pairVeg = (pool, r) => { const a = pick(pool, r); const compat = pool.filter((b) => b !== a && ALLS.some((s) => (V[a].se || ALLS).includes(s) && (V[b].se || ALLS).includes(s))); return [a, pick(compat.length ? compat : pool.filter((b) => b !== a), r)]; };

function cookStarch(id, label) {
  const how = S[id]?.how || 'rice';
  return { rice: `Cook the ${label.toLowerCase()} according to the package directions (15–20 minutes; about 40 for brown rice) and fluff with a fork.`,
    quinoa: 'Rinse the quinoa, then simmer it in twice its volume of water, covered, for 15 minutes; rest 5 minutes and fluff.', couscous: 'Pour an equal volume of boiling water or broth over the couscous, cover for 5 minutes, then fluff with a fork.',
    bulgur: 'Simmer the bulgur in twice its volume of salted water for 12 minutes, then drain and fluff.', farro: 'Simmer the farro in plenty of salted water for 25–30 minutes until tender but chewy; drain.',
    pasta: 'Boil the orzo in well-salted water until al dente, about 9 minutes; drain.', potato: `Cut the ${label.toLowerCase().replace('roasted ', '')} into 1-inch cubes and toss with a drizzle of oil and salt; roast on a second pan at 425°F (220°C) for 30–35 minutes, turning once.`,
    noodle: 'Cook the noodles in boiling water according to the package directions; drain and rinse briefly.' }[how] || 'Cook according to the package directions.';
}
const noodles = { 'rice-noodles': { q: 70, label: 'Rice Noodles', how: 'noodle' }, soba: { q: 75, label: 'Soba Noodles', how: 'noodle' }, udon: { q: 100, label: 'Udon Noodles', how: 'noodle' } };
Object.assign(S, noodles);

/* ===================================================================== sheet-pan dinners */
export function sheetPan() {
  const out = [];
  for (const [pid, pr] of Object.entries(P)) {
    if (!['poultry', 'pork', 'sausage', 'fish', 'shell', 'plant'].includes(pr.cat) && pid !== 'chickpeas') continue;
    if (pr.cat === 'shell' && pid !== 'shrimp') continue;
    const mins = ROAST_MIN[pid]; const quick = mins <= 14;
    for (const kid of kitsFor(['rub', 'glaze'], pr.cat)) {
      const kit = KITS[kid]; const r = rng('sp' + pid + kid);
      const pool = (quick ? QUICK : vegs('roast')).filter((v) => V[v].roast && (!DENSE.has(v) || mins >= 30));
      const vv = pairVeg(pool, r); const s = 2;
      const rec = new Rec(s); rec.add(pid, pr.per); rec.addAll(kit.ing); kit.finish.forEach(([i, q]) => rec.add(i, q)); vv.forEach((v) => rec.add(v, V[v].q)); rec.add('salt', 1.2); rec.add('pepper', 0.5);
      if (kit.style === 'glaze') rec.add('olive-oil', 6);
      const glaze = kit.style === 'glaze';
      const names = kit.ing.map(([i]) => phr(i));
      const steps = [
        'Heat the oven to 425°F (220°C) and line a large sheet pan with parchment.',
        `Prepare the vegetables: ${list(prepLine(vv))}.`,
        glaze ? `Stir together ${list(names)} in a small bowl; set half aside for brushing at the end.` : `Whisk ${list(names)} with the salt and pepper in a large bowl.`,
        glaze ? `Pat the ${pr.noun} dry. Toss the vegetables with olive oil, salt and pepper, and rub the ${pr.noun} with half of the glaze.` : `Pat the ${pr.noun} dry, then toss it and the vegetables in the marinade until evenly coated.`,
        `Spread everything on the pan in a single layer with the ${pr.noun} in the center. Roast for ${mins} minutes${pr.cat === 'fish' || pr.cat === 'shell' ? '' : ', stirring the vegetables once,'} until ${DONE[pr.cat]}.`,
        glaze ? 'Brush with the remaining glaze for the last 3–4 minutes so it caramelizes without burning.' : null,
        `Rest 3–5 minutes, then ${kit.finish.length ? 'finish with ' + list(kit.finish.map(([i]) => phr(i))) + ' and ' : ''}serve straight from the pan.`,
      ].filter(Boolean);
      out.push({ n: `${kit.label} ${pr.label} with Roasted ${vegLabel(vv[0])} & ${vegLabel(vv[1])}`, c: kit.cuisine, t: 'dinner', e: pr.emoji, p: 15, k: mins + 3, s, rec, st: steps, se: seasonsOf(vv), proteinMeal: true, grp: pid, tip: 'One pan, minimal cleanup — line it with parchment.' });
    }
  }
  return out;
}

/* ===================================================================== skillet dinners (sear + pan sauce + veg + starch) */
const SAUCE_STEP = {
  piccata: (pn) => `Pour the broth into the skillet and scrape up the browned bits. Add the lemon juice and capers, simmer 3 minutes until slightly reduced, then swirl in the butter. Return the ${pn} to warm through.`,
  pesto: (pn) => `Reduce the heat to low, stir the pesto into the pan with 2 tablespoons of warm water, and return the ${pn} to coat it for 1 minute.`,
  marinara: (pn) => `Add the marinara and garlic to the pan, return the ${pn}, cover and simmer 5 minutes until hot and bubbling; finish with parmesan.`,
  whiteWine: (pn) => `Add the shallot and thyme and cook 1 minute, then pour in the wine and broth and simmer 4 minutes until reduced by half. Swirl in the butter and return the ${pn} to the pan.`,
};
export function skillet() {
  const out = []; const dinnerProt = ['chicken-breast', 'chicken-thigh', 'turkey-breast', 'pork-chop', 'pork-tenderloin', 'sausage', 'flank-steak', 'steak', 'salmon', 'white-fish', 'tilapia', 'halibut', 'mahi-mahi', 'trout', 'shrimp', 'scallops', 'tofu', 'tempeh'];
  const sv = ['broccoli', 'asparagus', 'green-beans', 'zucchini', 'bell-pepper', 'mushroom', 'spinach', 'kale', 'snap-peas', 'bok-choy', 'carrot', 'cauliflower', 'chard', 'brussels-sprouts'];
  const starches = ['rice', 'jasmine-rice', 'basmati', 'brown-rice', 'quinoa', 'couscous', 'orzo', 'potato', 'bulgur', 'farro'];
  for (const pid of dinnerProt) {
    const pr = P[pid];
    for (const kid of kitsFor(['rub', 'glaze', 'sauce'], pr.cat)) {
      if (pid === 'scallops' && !['lemonGarlic', 'whiteWine', 'piccata', 'smokyPaprika'].includes(kid)) continue;
      const kit = KITS[kid]; const r = rng('sk' + pid + kid);
      const veg = pick(sv, r); const st = kit.cuisine === 'Mexican' ? pick(['rice', 'brown-rice', 'quinoa'], r) : kit.cuisine === 'Japanese' || kit.cuisine === 'Korean' || kit.cuisine === 'Chinese' || kit.cuisine === 'Thai' ? pick(['jasmine-rice', 'rice', 'brown-rice'], r) : kit.cuisine === 'Indian' ? 'basmati' : kit.cuisine === 'Middle Eastern' ? pick(['couscous', 'bulgur', 'rice'], r) : kit.cuisine === 'Greek' ? pick(['orzo', 'potato', 'rice'], r) : pick(starches, r);
      const s = 2; const stp = S[st]; const rec = new Rec(s);
      rec.add(pid, pr.per); rec.addAll(kit.ing); kit.finish.forEach(([i, q]) => rec.add(i, q)); rec.add(veg, V[veg].q); rec.add(st, stp.q); rec.add('olive-oil', 8); rec.add('salt', 1.2); rec.add('pepper', 0.5);
      const names = kit.ing.map(([i]) => phr(i));
      const sear = SEAR_MIN[pid];
      const prep = pr.cat === 'poultry' && pid !== 'chicken-thigh' ? `Slice the ${pr.noun} in half horizontally (or pound to an even ½-inch) so it cooks evenly; pat dry and season with salt and pepper.` : pr.cat === 'plant' ? `Press the ${pid} between towels for 10 minutes, then cut into ¾-inch cubes and season with salt and pepper.` : `Pat the ${pr.noun} dry and season with salt and pepper.`;
      const steps = [
        cookStarch(st, stp.label),
        prep,
        kit.style === 'rub' ? `Stir together ${list(names)}; rub it over the ${pr.noun} and let it sit 10 minutes while the starch cooks.` : kit.style === 'glaze' ? `Whisk ${list(names)} in a small bowl and set aside.` : `Measure out ${list(names)} so the sauce comes together quickly.`,
        `Heat 1 tablespoon of the olive oil in a large skillet over medium-high heat. Cook the ${pr.noun} about ${sear} minutes per side${pr.cat === 'sausage' ? ', turning often,' : ''} until ${DONE[pr.cat]}. Transfer to a plate and tent with foil.`,
        `In the same skillet, add the remaining oil and cook the ${nm(veg)} (${V[veg].saute || V[veg].stir ? 'sliced or chopped' : 'trimmed'}) with a pinch of salt for 4–6 minutes until crisp-tender.`,
        kit.style === 'glaze' ? `Pour in the glaze and simmer 1–2 minutes until syrupy, then return the ${pr.noun} and turn to coat.` : kit.style === 'sauce' ? SAUCE_STEP[kid](pr.noun) : `Return the ${pr.noun} to the pan for 1 minute to warm through and pick up the pan juices.`,
        `Serve over the ${stp.label.toLowerCase()}${kit.finish.length ? ', topped with ' + list(kit.finish.map(([i]) => phr(i))) : ''}.`,
      ];
      out.push({ n: `${kit.label} ${pr.label} with ${V[veg].label} & ${stp.label.replace('Roasted ', '')}`, c: kit.cuisine, t: 'dinner', e: pr.emoji, p: 12, k: 20 + sear, s, rec, st: steps, se: seasonsOf([veg]), proteinMeal: true, grp: pid, tip: 'Let the protein rest on the plate while you build the sauce — it stays juicier.' });
    }
  }
  return out;
}

/* ===================================================================== stir-fries & noodle stir-fries */
export function stirFry() {
  const out = [];
  const sauces = { ...Object.fromEntries(['teriyaki', 'hoisinGarlic', 'sweetChili', 'gochujang', 'misoGinger', 'koreanBBQ'].map((k) => [k, { ...KITS[k], k }])),
    peanutLime: { label: 'Peanut-Lime', cuisine: 'Thai', cats: ['poultry', 'beef', 'plant', 'shell', 'pork'], ing: SAUCES.peanutLime.ing, finish: [['cilantro', 4], ['peanuts', 6]], note: 'peanut butter and lime', k: 'peanutLime' },
    soyGinger: { label: 'Garlic-Ginger', cuisine: 'Chinese', cats: ['poultry', 'beef', 'plant', 'shell', 'pork'], ing: [['soy-sauce', 15], ['rice-vinegar', 5], ['ginger', 3], ['garlic', 1], ['sesame-oil', 3], ['brown-sugar', 4]], finish: [['green-onion', 0.5]], note: 'soy sauce, ginger and garlic', k: 'soyGinger' } };
  const prots = ['chicken-breast', 'chicken-thigh', 'pork-tenderloin', 'flank-steak', 'steak', 'shrimp', 'tofu', 'tempeh', 'salmon'];
  const bases = ['jasmine-rice', 'rice', 'brown-rice', 'rice-noodles', 'soba', 'udon'];
  for (const pid of prots) {
    const pr = P[pid];
    for (const [kid, kit] of Object.entries(sauces)) {
      if (!kit.cats.includes(pr.cat)) continue;
      if (pid === 'salmon' && !['teriyaki', 'misoGinger', 'sweetChili'].includes(kid)) continue;
      const r = rng('sf' + pid + kid); const pool = vegs('stir'); const vv = pickN(pool, 2, r); const base = pick(kit.cuisine === 'Japanese' ? ['soba', 'udon', 'jasmine-rice', 'rice'] : kit.cuisine === 'Korean' ? ['rice', 'jasmine-rice', 'brown-rice', 'soba'] : bases, r);
      const bp = S[base]; const noodle = bp.how === 'noodle'; const s = 2;
      const rec = new Rec(s); rec.add(pid, pr.per); rec.addAll(kit.ing); kit.finish.forEach(([i, q]) => rec.add(i, q)); vv.forEach((v) => rec.add(v, V[v].q)); rec.add(base, bp.q); rec.add('cornstarch', 3); rec.add('veg-oil', 12); rec.add('garlic', 1); rec.add('ginger', 3); rec.add('salt', 0.8);
      const meat = pr.cat !== 'plant' && pr.cat !== 'shell';
      const steps = [
        cookStarch(base, bp.label),
        pr.cat === 'plant' ? `Press the ${pid} dry and cut into ¾-inch cubes; toss with half the cornstarch and a pinch of salt.` : meat ? `Slice the ${pr.noun} thinly against the grain and toss with half the cornstarch and a pinch of salt (this keeps it tender).` : 'Pat the shrimp dry and toss with half the cornstarch and a pinch of salt.',
        `Whisk ${list(kit.ing.map(([i]) => phr(i)))} with the remaining cornstarch and 3 tablespoons of water until smooth.`,
        `Prepare the vegetables: ${list(prepLine(vv))}. Mince the garlic and ginger.`,
        `Heat 1½ tablespoons of the oil in a wok or large skillet over high heat. Stir-fry the ${pr.noun} in a single layer for ${pr.cat === 'shell' ? '2–3' : '3–4'} minutes until ${pr.cat === 'plant' ? 'golden' : 'just cooked through'}; remove to a plate.`,
        'Add the remaining oil, then the vegetables and cook 3–4 minutes until crisp-tender. Add the garlic and ginger for the last 30 seconds.',
        `Return the ${pr.noun}, pour in the sauce and toss 1–2 minutes until glossy. Serve over the ${bp.label.toLowerCase()}${kit.finish.length ? ', topped with ' + list(kit.finish.map(([i]) => phr(i))) : ''}.`,
      ];
      out.push({ n: `${kit.label} ${pr.label.replace('Sirloin ', '')} & ${V[vv[0]].label} ${noodle ? 'Noodle ' : ''}Stir-Fry`, c: kit.cuisine, t: 'dinner', e: noodle ? '🍜' : '🥢', p: 15, k: 12, s, rec, st: steps, se: seasonsOf(vv), proteinMeal: true, grp: pid, tip: 'Have everything chopped and the sauce whisked before the pan gets hot — stir-frying moves fast.' });
    }
  }
  return out;
}

/* ===================================================================== curries, stews & braises */
const SIM = { 'chicken-breast': 14, 'chicken-thigh': 20, 'turkey-breast': 12, 'pork-tenderloin': 12, 'pork-chop': 18, sausage: 10, shrimp: 4, 'white-fish': 6, salmon: 7, halibut: 7, tilapia: 6, tofu: 8, tempeh: 10, chickpeas: 10, 'black-beans': 8, 'white-beans': 10, 'ground-lamb': 10, 'ground-turkey': 8, 'ground-chicken': 8, 'lean-ground-beef': 8 };
const CURRIES = [
  { key: 'tikka', label: 'Tikka Masala', c: 'Indian', base: [['olive-oil', 0], ['veg-oil', 6], ['onion', 0.5], ['garlic', 1], ['ginger', 3], ['garam-masala', 2], ['paprika', 1], ['tomato-paste', 8], ['canned-tomatoes', 100], ['heavy-cream', 25]], prot: ['chicken-breast', 'chicken-thigh', 'shrimp', 'tofu', 'chickpeas'], veg: ['spinach', 'cauliflower', 'bell-pepper'], starch: ['basmati', 'rice'], finish: [['cilantro', 4]], lines: 'Add the garam masala and paprika and toast 30 seconds, then the tomato paste and canned tomatoes; simmer 5 minutes, then stir in the cream.' },
  { key: 'coconut', label: 'Coconut Curry', c: 'Indian', base: [['veg-oil', 6], ['onion', 0.5], ['garlic', 1], ['ginger', 3], ['curry-powder', 3], ['tomato-paste', 5], ['coconut-milk', 100], ['lime', 0.25]], prot: ['chicken-breast', 'chicken-thigh', 'shrimp', 'white-fish', 'tofu', 'chickpeas', 'salmon'], veg: ['spinach', 'sweet-potato', 'bell-pepper', 'zucchini', 'cauliflower', 'green-beans'], starch: ['basmati', 'jasmine-rice', 'rice'], finish: [['cilantro', 4]], lines: 'Stir in the curry powder and tomato paste and cook 1 minute, then pour in the coconut milk and bring to a gentle simmer.' },
  { key: 'thaired', label: 'Thai Red Curry', c: 'Thai', base: [['veg-oil', 6], ['onion', 0.25], ['garlic', 1], ['ginger', 2], ['curry-paste', 12], ['coconut-milk', 100], ['fish-sauce', 4], ['brown-sugar', 3], ['lime', 0.25]], prot: ['chicken-breast', 'chicken-thigh', 'shrimp', 'tofu', 'pork-tenderloin', 'salmon'], veg: ['bell-pepper', 'zucchini', 'green-beans', 'eggplant', 'snap-peas', 'bok-choy'], starch: ['jasmine-rice', 'rice'], finish: [['basil', 3]], lines: 'Fry the curry paste for 1 minute until fragrant, then whisk in the coconut milk, fish sauce and brown sugar and bring to a simmer.' },
  { key: 'thaigreen', label: 'Thai Green Curry', c: 'Thai', base: [['veg-oil', 6], ['onion', 0.25], ['garlic', 1], ['ginger', 2], ['green-curry-paste', 12], ['coconut-milk', 100], ['fish-sauce', 4], ['brown-sugar', 3], ['lime', 0.25]], prot: ['chicken-breast', 'chicken-thigh', 'shrimp', 'tofu', 'white-fish'], veg: ['zucchini', 'green-beans', 'snap-peas', 'eggplant', 'broccoli', 'bok-choy'], starch: ['jasmine-rice', 'rice'], finish: [['basil', 3]], lines: 'Fry the green curry paste for 1 minute until fragrant, then whisk in the coconut milk, fish sauce and brown sugar and bring to a simmer.' },
  { key: 'moroccan', label: 'Moroccan-Spiced', c: 'Middle Eastern', base: [['olive-oil', 8], ['onion', 0.5], ['garlic', 1], ['cumin', 1], ['cinnamon', 0.4], ['paprika', 1], ['canned-tomatoes', 90], ['chicken-broth', 60], ['dried-apricots', 15]], prot: ['chicken-thigh', 'chicken-breast', 'chickpeas', 'ground-lamb', 'white-beans'], veg: ['carrot', 'zucchini', 'butternut-squash', 'eggplant'], starch: ['couscous', 'bulgur', 'rice'], finish: [['parsley', 4], ['almonds', 6]], lines: 'Stir in the cumin, cinnamon and paprika for 30 seconds, then add the tomatoes, broth and apricots and bring to a simmer.' },
  { key: 'spanish', label: 'Spanish Tomato-Pepper', c: 'Mediterranean', base: [['olive-oil', 8], ['onion', 0.5], ['garlic', 1], ['smoked-paprika', 2], ['canned-tomatoes', 100], ['roasted-peppers', 40], ['olives', 12]], prot: ['chicken-thigh', 'white-fish', 'shrimp', 'sausage', 'white-beans', 'chickpeas'], veg: ['bell-pepper', 'zucchini', 'green-beans', 'spinach'], starch: ['rice', 'potato', 'couscous'], finish: [['parsley', 4]], lines: 'Stir in the smoked paprika for 30 seconds, then add the tomatoes, roasted peppers and olives and simmer 5 minutes.' },
  { key: 'verde', label: 'Salsa Verde', c: 'Mexican', base: [['olive-oil', 6], ['onion', 0.5], ['garlic', 1], ['cumin', 1], ['salsa-verde', 110], ['chicken-broth', 40], ['lime', 0.25]], prot: ['chicken-thigh', 'chicken-breast', 'pork-tenderloin', 'black-beans', 'white-beans'], veg: ['zucchini', 'bell-pepper', 'spinach', 'corn-cob'], starch: ['rice', 'brown-rice', 'quinoa'], finish: [['cilantro', 4], ['sour-cream', 15]], lines: 'Stir in the cumin, then the salsa verde and broth, and bring to a simmer.' },
  { key: 'mustard', label: 'French Mustard Braise', c: 'French', base: [['olive-oil', 8], ['shallot', 0.5], ['garlic', 1], ['mustard', 12], ['thyme-dried', 0.5], ['white-wine', 40], ['chicken-broth', 60]], prot: ['chicken-thigh', 'pork-chop', 'white-beans', 'sausage'], veg: ['mushroom', 'carrot', 'leek', 'green-beans'], starch: ['potato', 'egg-noodles-placeholder'].slice(0, 1), finish: [['parsley', 4]], lines: 'Whisk in the mustard and thyme, pour in the wine and broth, and bring to a simmer.' },
];
export function curries() {
  const out = [];
  for (const cu of CURRIES) for (const pid of cu.prot) {
    const pr = P[pid]; const veg = cu.veg; const r = rng('cu' + cu.key + pid);
    for (const v of pickN(veg, 2, r)) {
      const st = pick(cu.starch, r); const stp = S[st]; const s = 2;
      const rec = new Rec(s); rec.add(pid, pr.per * (pr.cat === 'legume' ? 1.1 : 1)); cu.base.forEach(([i, q]) => q && rec.add(i, q)); rec.add(v, V[v].q); rec.add(st, stp.q); cu.finish.forEach(([i, q]) => rec.add(i, q)); rec.add('salt', 1.2);
      const shell = pr.cat === 'shell' || pr.cat === 'fish';
      const steps = [
        cookStarch(st, stp.label),
        pr.cat === 'plant' ? `Press the ${pid} dry and cut into ¾-inch cubes.` : pr.cat === 'legume' ? `Drain and rinse the ${pr.noun}.` : `Cut the ${pr.noun} into 1-inch pieces and season with salt.`,
        `Heat the oil in a large, deep skillet over medium heat. Cook the onion (or shallot) with a pinch of salt for 5 minutes until soft, adding the garlic${cu.base.some(([i]) => i === 'ginger') ? ' and ginger' : ''} for the last minute.`,
        cu.lines,
        shell ? `Simmer the sauce with the ${nm(v)} (${V[v].stir ? 'chopped' : 'trimmed and cut'}) for 8 minutes, then nestle in the ${pr.noun} and cook ${SIM[pid]} minutes just until ${DONE[pr.cat]}.` : `Add the ${pr.noun} and ${nm(v)} (${V[v].stir ? 'chopped' : 'trimmed and cut'}) and simmer gently, partly covered, ${SIM[pid] + 4} minutes until ${pr.cat === 'legume' || pr.cat === 'plant' ? 'everything is tender and the sauce has thickened' : DONE[pr.cat]}.`,
        `Taste and adjust the salt${cu.base.some(([i]) => i === 'lime') ? ' and lime' : ''}. Serve over the ${stp.label.toLowerCase()}, topped with ${list(cu.finish.map(([i]) => phr(i)))}.`,
      ];
      out.push({ n: `${pr.label} ${cu.label} with ${V[v].label}`, c: cu.c, t: 'dinner', e: '🍛', p: 12, k: SIM[pid] + 18, s, rec, st: steps, se: seasonsOf([v]), proteinMeal: true, grp: pid + cu.key, tip: 'Even better the next day — the flavors deepen overnight.' });
    }
  }
  return out;
}
