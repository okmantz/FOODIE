/**
 * Building blocks for tools/generate-recipes.mjs.
 * Quantities are PER SERVING in each ingredient's base unit (g / ml / each).
 */
export const P = {   // proteins
  'chicken-breast': { label: 'Chicken Breast', per: 150, cat: 'poultry', emoji: '🍗', noun: 'chicken breast' },
  'chicken-thigh': { label: 'Chicken Thighs', per: 170, cat: 'poultry', emoji: '🍗', noun: 'chicken thighs' },
  'turkey-breast': { label: 'Turkey Cutlets', per: 140, cat: 'poultry', emoji: '🍗', noun: 'turkey cutlets' },
  'pork-chop': { label: 'Pork Chops', per: 170, cat: 'pork', emoji: '🥩', noun: 'pork chops' },
  'pork-tenderloin': { label: 'Pork Tenderloin', per: 150, cat: 'pork', emoji: '🥩', noun: 'pork tenderloin' },
  sausage: { label: 'Sausage', per: 100, cat: 'sausage', emoji: '🌭', noun: 'sausage' },
  'flank-steak': { label: 'Flank Steak', per: 150, cat: 'beef', emoji: '🥩', noun: 'flank steak' },
  steak: { label: 'Sirloin Steak', per: 150, cat: 'beef', emoji: '🥩', noun: 'steak' },
  salmon: { label: 'Salmon', per: 150, cat: 'fish', emoji: '🐟', noun: 'salmon' },
  'white-fish': { label: 'White Fish', per: 150, cat: 'fish', emoji: '🐟', noun: 'white fish fillets' },
  tilapia: { label: 'Tilapia', per: 140, cat: 'fish', emoji: '🐟', noun: 'tilapia' },
  halibut: { label: 'Halibut', per: 150, cat: 'fish', emoji: '🐟', noun: 'halibut' },
  'mahi-mahi': { label: 'Mahi-Mahi', per: 150, cat: 'fish', emoji: '🐟', noun: 'mahi-mahi' },
  trout: { label: 'Trout', per: 140, cat: 'fish', emoji: '🐟', noun: 'trout fillets' },
  shrimp: { label: 'Shrimp', per: 140, cat: 'shell', emoji: '🍤', noun: 'shrimp' },
  scallops: { label: 'Scallops', per: 120, cat: 'shell', emoji: '🍤', noun: 'scallops' },
  tofu: { label: 'Tofu', per: 150, cat: 'plant', emoji: '🥢', noun: 'tofu' },
  tempeh: { label: 'Tempeh', per: 100, cat: 'plant', emoji: '🥢', noun: 'tempeh' },
  chickpeas: { label: 'Chickpeas', per: 130, cat: 'legume', emoji: '🫘', noun: 'chickpeas' },
  'black-beans': { label: 'Black Beans', per: 130, cat: 'legume', emoji: '🫘', noun: 'black beans' },
  'white-beans': { label: 'White Beans', per: 130, cat: 'legume', emoji: '🫘', noun: 'white beans' },
  'ground-turkey': { label: 'Ground Turkey', per: 120, cat: 'ground', emoji: '🥩', noun: 'ground turkey' },
  'ground-chicken': { label: 'Ground Chicken', per: 120, cat: 'ground', emoji: '🍗', noun: 'ground chicken' },
  'lean-ground-beef': { label: 'Ground Beef', per: 120, cat: 'ground', emoji: '🥩', noun: 'lean ground beef' },
  'ground-pork': { label: 'Ground Pork', per: 110, cat: 'ground', emoji: '🥩', noun: 'ground pork' },
  'ground-lamb': { label: 'Ground Lamb', per: 110, cat: 'ground', emoji: '🥩', noun: 'ground lamb' },
};

export const DONE = {   // how to tell it is done (also the food-safety temperature)
  poultry: 'the chicken reaches 165°F (74°C) in the thickest part', pork: 'the pork reaches 145°F (63°C), then rest 3 minutes', sausage: 'the sausage reaches 160°F (71°C)',
  beef: 'the steak is cooked to your liking (130–140°F / 54–60°C for medium-rare to medium)', fish: 'the fish flakes easily with a fork (145°F / 63°C)', shell: 'the shrimp are pink and opaque and the scallops are just firm',
  plant: 'the edges are golden and crisp', legume: 'the beans are hot and the edges are lightly crisped', ground: 'no pink remains and it reaches 160°F (71°C)',
};
export const ROAST_MIN = { 'chicken-breast': 22, 'chicken-thigh': 32, 'turkey-breast': 18, 'pork-chop': 22, 'pork-tenderloin': 24, sausage: 24, salmon: 13, 'white-fish': 13, tilapia: 11, halibut: 14, 'mahi-mahi': 13, trout: 12, shrimp: 9, tofu: 28, tempeh: 22, chickpeas: 25, 'black-beans': 20, 'white-beans': 20, 'flank-steak': 15, steak: 15 };
export const SEAR_MIN = { 'chicken-breast': 6, 'chicken-thigh': 8, 'turkey-breast': 4, 'pork-chop': 5, 'pork-tenderloin': 5, sausage: 7, salmon: 4, 'white-fish': 3, tilapia: 3, halibut: 4, 'mahi-mahi': 4, trout: 3, shrimp: 2, scallops: 2, tofu: 5, tempeh: 4, 'flank-steak': 4, steak: 4 };

/* vegetables: per-serving qty, label, which treatments suit it, seasons */
const ALLS = ['spring', 'summer', 'autumn', 'winter'];
export const V = {
  broccoli: { q: 120, label: 'Broccoli', roast: 1, stir: 1, se: ALLS }, cauliflower: { q: 120, label: 'Cauliflower', roast: 1, stir: 1, se: ['autumn', 'winter', 'spring'] },
  'brussels-sprouts': { q: 110, label: 'Brussels Sprouts', roast: 1, se: ['autumn', 'winter'] }, asparagus: { q: 100, label: 'Asparagus', roast: 1, stir: 1, se: ['spring'] },
  zucchini: { q: 0.5, label: 'Zucchini', roast: 1, stir: 1, se: ['summer', 'autumn'] }, 'bell-pepper': { q: 0.5, label: 'Bell Peppers', roast: 1, stir: 1, se: ['summer', 'autumn'] },
  'sweet-potato': { q: 150, label: 'Sweet Potatoes', roast: 1, se: ['autumn', 'winter'] }, carrot: { q: 1, label: 'Carrots', roast: 1, stir: 1, se: ALLS },
  'green-beans': { q: 110, label: 'Green Beans', roast: 1, stir: 1, se: ['summer', 'autumn'] }, 'butternut-squash': { q: 150, label: 'Butternut Squash', roast: 1, se: ['autumn', 'winter'] },
  eggplant: { q: 120, label: 'Eggplant', roast: 1, stir: 1, se: ['summer', 'autumn'] }, mushroom: { q: 100, label: 'Mushrooms', roast: 1, stir: 1, se: ALLS },
  'cherry-tomato': { q: 100, label: 'Cherry Tomatoes', roast: 1, se: ['summer', 'autumn'] }, 'red-onion': { q: 0.25, label: 'Red Onion', roast: 1, se: ALLS },
  'bok-choy': { q: 100, label: 'Bok Choy', stir: 1, se: ['spring', 'autumn', 'winter'] }, 'snap-peas': { q: 90, label: 'Snap Peas', stir: 1, se: ['spring', 'summer'] },
  cabbage: { q: 100, label: 'Cabbage', stir: 1, se: ['autumn', 'winter', 'spring'] }, 'bean-sprouts': { q: 60, label: 'Bean Sprouts', stir: 1, se: ALLS }, shiitake: { q: 80, label: 'Shiitake', stir: 1, se: ALLS },
  kale: { q: 70, label: 'Kale', stir: 1, saute: 1, se: ['autumn', 'winter'] }, spinach: { q: 60, label: 'Spinach', saute: 1, se: ['spring', 'autumn'] }, chard: { q: 70, label: 'Chard', saute: 1, se: ['summer', 'autumn'] },
  'collard-greens': { q: 80, label: 'Collard Greens', saute: 1, se: ['autumn', 'winter'] }, 'napa-cabbage': { q: 100, label: 'Napa Cabbage', stir: 1, se: ['autumn', 'winter'] }, 'snap-pea': { q: 0 },
  leek: { q: 0.5, label: 'Leeks', roast: 1, saute: 1, se: ['autumn', 'winter', 'spring'] }, fennel: { q: 0.5, label: 'Fennel', roast: 1, se: ['autumn', 'winter'] }, parsnip: { q: 100, label: 'Parsnips', roast: 1, se: ['autumn', 'winter'] },
  beet: { q: 120, label: 'Beets', roast: 1, se: ['autumn', 'winter'] }, 'corn-cob': { q: 1, label: 'Corn', roast: 1, se: ['summer'] }, okra: { q: 90, label: 'Okra', roast: 1, se: ['summer'] }, 'acorn-squash': { q: 150, label: 'Acorn Squash', roast: 1, se: ['autumn', 'winter'] },
};
delete V['snap-pea'];
export const vegs = (kind) => Object.entries(V).filter(([, v]) => v[kind]).map(([id]) => id);

export const S = {   // starches / grains  (q per serving, how)
  rice: { q: 70, label: 'Rice', how: 'rice', se: ALLS }, 'brown-rice': { q: 70, label: 'Brown Rice', how: 'rice', min: 40 }, basmati: { q: 70, label: 'Basmati Rice', how: 'rice' }, 'jasmine-rice': { q: 70, label: 'Jasmine Rice', how: 'rice' },
  quinoa: { q: 60, label: 'Quinoa', how: 'quinoa' }, couscous: { q: 60, label: 'Couscous', how: 'couscous' }, bulgur: { q: 60, label: 'Bulgur', how: 'bulgur' }, farro: { q: 65, label: 'Farro', how: 'farro' }, orzo: { q: 65, label: 'Orzo', how: 'pasta' },
  potato: { q: 200, label: 'Roasted Potatoes', how: 'potato' }, 'sweet-potato': { q: 200, label: 'Sweet Potato', how: 'potato' },
};

/* flavor kits ----------------------------------------------------------------------------
 *  style: rub (oil/spice seasoning applied before cooking) | glaze (sweet-sticky sauce, added late)
 *         | sauce (finishing pan sauce)            cats: protein categories it suits */
const meat = ['poultry', 'pork', 'sausage', 'beef'];
export const KITS = {
  lemonGarlic: { label: 'Lemon-Garlic', cuisine: 'Mediterranean', style: 'rub', cats: ['poultry', 'pork', 'fish', 'shell', 'plant', 'legume'], ing: [['olive-oil', 8], ['lemon', 0.25], ['garlic', 1], ['oregano', 0.4]], finish: [['parsley', 4]], note: 'lemon, garlic and oregano' },
  greekLemon: { label: 'Greek Lemon-Oregano', cuisine: 'Greek', style: 'rub', cats: ['poultry', 'pork', 'fish', 'shell', 'plant'], ing: [['olive-oil', 8], ['lemon', 0.25], ['garlic', 1], ['oregano', 0.6], ['red-wine-vinegar', 4]], finish: [['feta', 15]], note: 'lemon, oregano and red wine vinegar' },
  zaatar: { label: "Za'atar", cuisine: 'Middle Eastern', style: 'rub', cats: ['poultry', 'pork', 'fish', 'plant', 'legume'], ing: [['olive-oil', 8], ['zaatar', 2], ['lemon', 0.25], ['garlic', 1]], finish: [['greek-yogurt', 30]], note: "za'atar, lemon and garlic" },
  harissa: { label: 'Harissa', cuisine: 'Middle Eastern', style: 'rub', cats: ['poultry', 'pork', 'fish', 'shell', 'plant', 'legume', 'beef'], ing: [['harissa', 8], ['olive-oil', 5], ['lemon', 0.25], ['cumin', 0.8], ['garlic', 1]], finish: [['cilantro', 4]], note: 'harissa, cumin and lemon' },
  shawarma: { label: 'Shawarma-Spiced', cuisine: 'Middle Eastern', style: 'rub', cats: ['poultry', 'beef', 'plant', 'legume', 'pork'], ing: [['olive-oil', 8], ['cumin', 1], ['paprika', 1.5], ['turmeric', 0.5], ['cinnamon', 0.2], ['garlic', 1], ['lemon', 0.25]], finish: [['parsley', 4]], note: 'cumin, paprika, turmeric and cinnamon' },
  smokyPaprika: { label: 'Smoky Paprika', cuisine: 'Mediterranean', style: 'rub', cats: ['poultry', 'pork', 'sausage', 'fish', 'shell', 'plant', 'legume'], ing: [['olive-oil', 8], ['smoked-paprika', 2], ['garlic', 1], ['red-wine-vinegar', 4], ['cumin', 0.5]], finish: [['parsley', 4]], note: 'smoked paprika, garlic and a splash of vinegar' },
  cajun: { label: 'Cajun', cuisine: 'American', style: 'rub', cats: ['poultry', 'pork', 'sausage', 'fish', 'shell', 'plant'], ing: [['olive-oil', 8], ['cajun-seasoning', 3], ['lemon', 0.25]], finish: [['green-onion', 0.5]], note: 'Cajun seasoning and lemon' },
  chiliLime: { label: 'Chili-Lime', cuisine: 'Mexican', style: 'rub', cats: ['poultry', 'pork', 'beef', 'fish', 'shell', 'plant', 'legume'], ing: [['olive-oil', 8], ['lime', 0.5], ['chili-powder', 2], ['cumin', 0.8], ['garlic', 1]], finish: [['cilantro', 4]], note: 'lime, chili powder and cumin' },
  chipotleLime: { label: 'Chipotle-Lime', cuisine: 'Mexican', style: 'rub', cats: ['poultry', 'pork', 'beef', 'shell', 'plant', 'legume'], ing: [['chipotle', 10], ['lime', 0.5], ['garlic', 1], ['olive-oil', 6], ['cumin', 0.5]], finish: [['cilantro', 4]], note: 'chipotle in adobo, lime and cumin' },
  tacoSpice: { label: 'Taco-Spiced', cuisine: 'Mexican', style: 'rub', cats: ['poultry', 'pork', 'beef', 'fish', 'shell', 'plant', 'legume'], ing: [['taco-seasoning', 4], ['lime', 0.25], ['olive-oil', 6]], finish: [['cilantro', 4]], note: 'taco seasoning and lime' },
  italianHerb: { label: 'Italian Herb', cuisine: 'Italian', style: 'rub', cats: ['poultry', 'pork', 'sausage', 'fish', 'shell', 'plant', 'legume'], ing: [['olive-oil', 8], ['italian-seasoning', 1.5], ['garlic', 1], ['balsamic', 5]], finish: [['parmesan', 8]], note: 'Italian seasoning, garlic and balsamic' },
  balsamicRosemary: { label: 'Balsamic-Rosemary', cuisine: 'Italian', style: 'rub', cats: ['poultry', 'pork', 'beef', 'plant', 'legume'], ing: [['balsamic', 12], ['rosemary-dried', 0.5], ['garlic', 1], ['olive-oil', 8], ['honey', 3]], finish: [], note: 'balsamic, rosemary and a touch of honey' },
  dijonHerb: { label: 'Dijon-Herb', cuisine: 'French', style: 'rub', cats: ['poultry', 'pork', 'fish', 'beef', 'plant'], ing: [['mustard', 10], ['thyme-dried', 0.5], ['garlic', 1], ['olive-oil', 8], ['lemon', 0.25]], finish: [['parsley', 4]], note: 'Dijon mustard, thyme and garlic' },
  tandoori: { label: 'Tandoori-Style', cuisine: 'Indian', style: 'rub', cats: ['poultry', 'fish', 'shell', 'plant', 'pork'], ing: [['greek-yogurt', 50], ['garam-masala', 2], ['paprika', 1], ['ginger', 3], ['garlic', 1], ['lemon', 0.25], ['turmeric', 0.4]], finish: [['cilantro', 4]], note: 'yogurt, garam masala, ginger and garlic' },
  currySpice: { label: 'Curry-Rubbed', cuisine: 'Indian', style: 'rub', cats: ['poultry', 'pork', 'fish', 'shell', 'plant', 'legume'], ing: [['olive-oil', 8], ['curry-powder', 3], ['garlic', 1], ['lemon', 0.25]], finish: [['cilantro', 4]], note: 'curry powder, garlic and lemon' },
  honeyMustard: { label: 'Honey-Mustard', cuisine: 'American', style: 'glaze', cats: ['poultry', 'pork', 'sausage', 'fish', 'plant'], ing: [['mustard', 10], ['honey', 8], ['olive-oil', 5], ['garlic', 1]], finish: [['parsley', 4]], note: 'mustard, honey and garlic' },
  bbq: { label: 'BBQ', cuisine: 'American', style: 'glaze', cats: ['poultry', 'pork', 'sausage', 'beef', 'plant', 'legume'], ing: [['bbq-sauce', 30], ['smoked-paprika', 1], ['garlic-powder', 1], ['cider-vinegar', 3]], finish: [['green-onion', 0.5]], note: 'barbecue sauce with smoked paprika' },
  teriyaki: { label: 'Teriyaki', cuisine: 'Japanese', style: 'glaze', cats: ['poultry', 'pork', 'beef', 'fish', 'shell', 'plant'], ing: [['teriyaki', 25], ['ginger', 3], ['garlic', 1], ['sesame-oil', 3]], finish: [['sesame-seeds', 2], ['green-onion', 0.5]], note: 'teriyaki sauce, ginger and garlic' },
  misoGinger: { label: 'Miso-Ginger', cuisine: 'Japanese', style: 'glaze', cats: ['fish', 'poultry', 'pork', 'plant', 'shell'], ing: [['miso', 12], ['rice-vinegar', 8], ['ginger', 3], ['honey', 5], ['sesame-oil', 3], ['soy-sauce', 5]], finish: [['sesame-seeds', 2], ['green-onion', 0.5]], note: 'white miso, ginger and rice vinegar' },
  hoisinGarlic: { label: 'Hoisin-Garlic', cuisine: 'Chinese', style: 'glaze', cats: ['poultry', 'pork', 'beef', 'plant', 'shell'], ing: [['hoisin', 20], ['soy-sauce', 8], ['garlic', 1], ['ginger', 3], ['sesame-oil', 3]], finish: [['green-onion', 0.5]], note: 'hoisin, soy sauce, garlic and ginger' },
  sweetChili: { label: 'Sweet Chili', cuisine: 'Thai', style: 'glaze', cats: ['poultry', 'pork', 'fish', 'shell', 'plant'], ing: [['sweet-chili-sauce', 25], ['lime', 0.25], ['garlic', 1], ['soy-sauce', 6], ['ginger', 2]], finish: [['cilantro', 4]], note: 'sweet chili sauce, lime and ginger' },
  gochujang: { label: 'Gochujang', cuisine: 'Korean', style: 'glaze', cats: ['poultry', 'pork', 'beef', 'fish', 'plant', 'shell'], ing: [['gochujang', 15], ['soy-sauce', 8], ['honey', 6], ['sesame-oil', 4], ['garlic', 1], ['rice-vinegar', 3]], finish: [['sesame-seeds', 2], ['green-onion', 0.5]], note: 'gochujang, soy sauce and honey' },
  koreanBBQ: { label: 'Korean BBQ', cuisine: 'Korean', style: 'rub', cats: ['beef', 'pork', 'poultry', 'plant'], ing: [['soy-sauce', 20], ['brown-sugar', 8], ['garlic', 2], ['sesame-oil', 4], ['ginger', 2], ['green-onion', 0.5]], finish: [['sesame-seeds', 2]], note: 'soy sauce, brown sugar, garlic and sesame oil' },
  piccata: { label: 'Lemon-Caper', cuisine: 'Italian', style: 'sauce', cats: ['poultry', 'pork', 'fish'], ing: [['lemon', 0.5], ['capers', 8], ['butter', 8], ['chicken-broth', 40], ['flour', 8]], finish: [['parsley', 4]], note: 'lemon, capers and butter' },
  pesto: { label: 'Pesto', cuisine: 'Italian', style: 'sauce', cats: ['poultry', 'fish', 'shell', 'plant', 'pork'], ing: [['pesto', 25], ['olive-oil', 4]], finish: [['cherry-tomato', 40]], note: 'basil pesto' },
  marinara: { label: 'Marinara', cuisine: 'Italian', style: 'sauce', cats: ['poultry', 'sausage', 'plant', 'legume'], ing: [['marinara', 110], ['garlic', 1], ['italian-seasoning', 0.5]], finish: [['parmesan', 10], ['basil', 2]], note: 'marinara and garlic' },
  whiteWine: { label: 'White Wine-Herb', cuisine: 'French', style: 'sauce', cats: ['poultry', 'fish', 'shell', 'pork'], ing: [['white-wine', 40], ['shallot', 0.25], ['butter', 8], ['thyme-dried', 0.4], ['chicken-broth', 30]], finish: [['parsley', 4]], note: 'white wine, shallot and thyme' },
};
export const kitsFor = (style, cat) => Object.entries(KITS).filter(([, k]) => (Array.isArray(style) ? style.includes(k.style) : k.style === style) && k.cats.includes(cat)).map(([id]) => id);
export { meat };

/* sauces & dressings used by bowls, salads, wraps */
export const SAUCES = {
  tahiniLemon: { label: 'Tahini-Lemon', ing: [['tahini', 12], ['lemon', 0.25], ['garlic', 0.5], ['olive-oil', 3]], how: 'Whisk the tahini, lemon juice, garlic and 1 tbsp water per serving until pourable.' },
  yogurtHerb: { label: 'Yogurt-Herb', ing: [['greek-yogurt', 50], ['lemon', 0.25], ['dill', 2], ['garlic', 0.5]], how: 'Stir the yogurt with lemon juice, chopped dill and minced garlic.' },
  tzatziki: { label: 'Tzatziki', ing: [['tzatziki', 50]], how: 'Spoon the tzatziki into a small bowl.' },
  peanutLime: { label: 'Peanut-Lime', ing: [['peanut-butter', 15], ['soy-sauce', 8], ['lime', 0.5], ['ginger', 2], ['honey', 4]], how: 'Whisk the peanut butter, soy sauce, lime juice, ginger and honey with warm water until pourable.' },
  sriMayo: { label: 'Sriracha-Lime Mayo', ing: [['mayo', 12], ['sriracha', 5], ['lime', 0.25]], how: 'Stir the mayo, sriracha and lime juice together.' },
  avocadoLime: { label: 'Avocado-Lime Crema', ing: [['avocado', 0.25], ['greek-yogurt', 30], ['lime', 0.25], ['cilantro', 3]], how: 'Mash the avocado with the yogurt, lime juice and chopped cilantro until smooth.' },
  chipotleCrema: { label: 'Chipotle Crema', ing: [['sour-cream', 30], ['chipotle', 5], ['lime', 0.25]], how: 'Stir the sour cream with minced chipotle and lime juice.' },
  salsa: { label: 'Salsa', ing: [['salsa', 50]], how: 'Spoon the salsa into a small bowl.' },
  soyGinger: { label: 'Soy-Ginger', ing: [['soy-sauce', 10], ['rice-vinegar', 8], ['ginger', 3], ['sesame-oil', 3], ['honey', 3]], how: 'Whisk the soy sauce, rice vinegar, grated ginger, sesame oil and honey.' },
  lemonVin: { label: 'Lemon Vinaigrette', ing: [['olive-oil', 12], ['lemon', 0.5], ['mustard', 3], ['honey', 2]], how: 'Whisk the olive oil, lemon juice, mustard and honey.' },
  balsamicVin: { label: 'Balsamic Vinaigrette', ing: [['olive-oil', 12], ['balsamic', 10], ['mustard', 3], ['garlic', 0.25]], how: 'Whisk the olive oil, balsamic vinegar, mustard and minced garlic.' },
  greekVin: { label: 'Greek Vinaigrette', ing: [['olive-oil', 12], ['red-wine-vinegar', 6], ['oregano', 0.5], ['garlic', 0.25]], how: 'Whisk the olive oil, red wine vinegar, oregano and minced garlic.' },
  cumLime: { label: 'Cumin-Lime Dressing', ing: [['olive-oil', 10], ['lime', 0.5], ['cumin', 0.5], ['honey', 2]], how: 'Whisk the olive oil, lime juice, cumin and honey.' },
  hummusDrizzle: { label: 'Hummus', ing: [['hummus', 40]], how: 'Spread the hummus into the bottom of each bowl.' },
};

export const GREENS = { arugula: 'Arugula', spinach: 'Spinach', romaine: 'Romaine', 'mixed-greens': 'Mixed Greens', kale: 'Kale' };
