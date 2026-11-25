// Relevance scoring: decides whether a candidate photo plausibly shows THIS dish.
// Pure functions (no I/O) so they are unit-tested in tests/images.mjs.

const strip = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Equivalence classes -> canonical token.
const EQ = [
  ['pasta', 'spaghetti', 'penne', 'fusilli', 'linguine', 'fettuccine', 'rigatoni', 'macaroni', 'farfalle', 'orzo'],
  ['burger', 'hamburger', 'patty', 'patties'], ['stirfry', 'stir fry', 'stirfried'], ['noodle', 'ramen', 'udon', 'soba'],
  ['chickpea', 'garbanzo'], ['shrimp', 'prawn'], ['scallion', 'greenonion'], ['yogurt', 'yoghurt'], ['omelet', 'omelette'],
  ['pancake', 'hotcake'], ['sandwich', 'sub', 'panini'], ['cilantro', 'coriander'], ['eggplant', 'aubergine'], ['zucchini', 'courgette'],
  ['oatmeal', 'porridge', 'oat'], ['cookie', 'biscuit'], ['bellpepper', 'capsicum'], ['mince', 'ground'],
];
const CANON = new Map(); for (const g of EQ) for (const w of g) CANON.set(w, g[0]);

export const DISH = new Set(['taco', 'burrito', 'bowl', 'salad', 'soup', 'stew', 'curry', 'pasta', 'noodle', 'risotto', 'pizza', 'burger', 'sandwich', 'wrap', 'pita', 'toast',
  'omelet', 'scramble', 'pancake', 'waffle', 'smoothie', 'shake', 'muffin', 'cookie', 'cake', 'brownie', 'pie', 'tart', 'oatmeal', 'parfait', 'stirfry', 'kebab', 'skewer',
  'meatball', 'casserole', 'chili', 'dumpling', 'sushi', 'hummus', 'guacamole', 'granola', 'crepe', 'quesadilla', 'enchilada', 'fajita', 'frittata', 'shakshuka', 'lasagna',
  'gnocchi', 'paella', 'tagine', 'bibimbap', 'pho', 'dal', 'biryani', 'pudding', 'mousse', 'sorbet', 'soup', 'chowder', 'gazpacho', 'falafel', 'shawarma', 'gyro', 'souvlaki',
  'pilaf', 'congee', 'ceviche', 'tartare', 'slaw', 'bake', 'roast', 'bar', 'bites', 'pops', 'popsicle', 'cobbler', 'crisp', 'custard', 'flan', 'cheesecake', 'bread', 'flatbread',
  'tostada', 'nachos', 'poke', 'kimchi', 'tofu', 'omelette']);
export const PROTEIN = new Set(['chicken', 'beef', 'pork', 'lamb', 'turkey', 'salmon', 'tuna', 'cod', 'shrimp', 'tofu', 'tempeh', 'egg', 'sausage', 'bacon', 'trout', 'mahi', 'tilapia',
  'halibut', 'chickpea', 'lentil', 'steak', 'duck', 'scallop', 'crab', 'lobster', 'ham', 'veal', 'bison', 'sardine', 'mackerel', 'haddock', 'seitan', 'paneer', 'thigh', 'breast', 'tenderloin', 'cutlet', 'chop', 'drumstick', 'wing', 'fillet', 'loin', 'rib', 'brisket', 'meatloaf']);
// Container/format words that appear in many photo titles without changing what the dish is.
const GENERIC = new Set(['bowl', 'bar', 'bites', 'bake', 'roast', 'bread', 'pops', 'popsicle', 'wrap', 'pita', 'toast', 'tofu', 'egg', 'sandwich', 'crisp']);
const MODIFIER_STOP = new Set(['quick', 'easy', 'simple', 'classic', 'homemade', 'best', 'fresh', 'style', 'dairy', 'milk', 'low', 'carb', 'keto', 'protein', 'light', 'healthy', 'big', 'crispy', 'spicy', 'sweet', 'one', 'pan', 'sheet', 'skillet']);
const STOP = new Set(['a', 'an', 'the', 'and', 'with', 'in', 'on', 'of', 'for', 'over', 'to', 'from', 'by', 'or', 'au', 'de', 'la', 'le', 'style', 'plus', 'topped', 'served']);
const FOODISH = new Set(['food', 'dish', 'meal', 'cuisine', 'cooking', 'cooked', 'recipe', 'dinner', 'lunch', 'breakfast', 'dessert', 'snack', 'plate', 'served', 'homemade', 'baked',
  'grilled', 'fried', 'roasted', 'salad', 'soup', 'sandwich', 'pasta', 'bowl', 'smoothie', 'curry', 'stew', 'taco', 'pizza', 'cake', 'cookie', 'pie', 'bread', 'rice', 'noodle',
  'vegetable', 'meat', 'fish', 'seafood', 'fruit', 'drink', 'beverage', 'foods', 'dishes', 'meals', 'desserts', 'eating', 'delicious', 'tasty', 'gourmet', 'brunch', 'appetizer', 'entree', 'dinner']);
const BAD_TITLE = /\b(logo|icon|diagram|map|drawing|illustration|painting|stamp|menu|sign|signage|storefront|restaurant\b(?!.*(dish|food))|market stall|farm|orchard|tree|plant\b|flower|bird|animal|poster|book|cover|screenshot|svg|clipart|cartoon|sketch|vector|packaging|package|label|can of|jar of|bottle|vending|truck|kitchen|chef\b|cooking class|crowd|people|person|portrait|wedding|festival|statue|museum|ingredients?\b|raw|uncooked|seeds?\b|spice rack|grocery|supermarket|shelf|shelves|sale)\b/i;

export function tokens(str) {
  return strip(String(str || '')).replace(/&/g, ' and ').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).map(norm);
}
export function norm(w) {
  let t = w;
  if (CANON.has(t)) return CANON.get(t);
  if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y';
  else if (t.length > 4 && /(oes|ches|shes|xes|sses)$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) t = t.slice(0, -1);
  return CANON.get(t) || t;
}

/** Break a recipe into weighted terms + search queries. */
export function analyze(recipe) {
  const clean = recipe.n.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const headRaw = clean.split(/\s+(?:with|and|&|over|on|in)\s+|,\s*/i)[0];
  const all = tokens(clean).filter((t) => !STOP.has(t));
  const head = tokens(headRaw).filter((t) => !STOP.has(t));
  const weights = new Map();
  const add = (t, w) => weights.set(t, Math.max(weights.get(t) || 0, w));
  for (const t of all) add(t, DISH.has(t) ? 3 : PROTEIN.has(t) ? 2.5 : MODIFIER_STOP.has(t) ? 0.2 : 1);
  for (const t of head) if (!DISH.has(t) && !PROTEIN.has(t) && !MODIFIER_STOP.has(t)) add(t, 1.4); // headline words matter more than sides
  const core = [...new Set(all.filter((t) => DISH.has(t) || PROTEIN.has(t)))];
  const ingTokens = new Set(recipe.ing.flatMap(tokens));
  const queries = [];
  const q1 = clean.replace(/&/g, 'and');
  queries.push(q1);
  if (headRaw && headRaw !== clean) queries.push(headRaw);
  const coreQ = [...new Set(head.filter((t) => DISH.has(t) || PROTEIN.has(t) || /^(roasted|grilled|baked|fried|stuffed|smashed|braised|poached)$/.test(t)))];
  if (coreQ.length) queries.push(`${/^(American|Mediterranean)$/.test(recipe.c) ? '' : recipe.c + ' '}${coreQ.join(' ')}`.trim());
  return { id: recipe.id, name: clean, weights, core, head, allTokens: new Set(all), ingTokens, queries: [...new Set(queries.map((q) => q.toLowerCase()))].slice(0, 3), cuisine: recipe.c, type: recipe.t };
}

export function candidateText(c) {
  return { title: tokens(c.title), extra: [...(c.tags || []), ...(c.categories || [])].flatMap(tokens) };
}

export function isFoodish(c) {
  const { title, extra } = candidateText(c);
  return [...title, ...extra].some((t) => FOODISH.has(t) || DISH.has(t) || PROTEIN.has(t));
}
export const badTitle = (c) => BAD_TITLE.test(String(c.title || ''));

/** Score 0..1 how well candidate c shows the dish. Title words count fully, tag/category words 70%. */
export function score(a, c) {
  const { title, extra } = candidateText(c);
  const T = new Set(title); const X = new Set(extra);
  let got = 0, total = 0, coreGot = 0, coreTotal = 0;
  for (const [t, w] of a.weights) {
    total += w; const hit = T.has(t) ? 1 : X.has(t) ? 0.7 : 0;
    got += w * hit;
    if (DISH.has(t) || PROTEIN.has(t)) { coreTotal += w; coreGot += w * hit; }
  }
  const coverage = total ? got / total : 0;
  const coreCov = coreTotal ? coreGot / coreTotal : coverage;
  // Conflicts: a different dish/protein is named in the candidate but absent from the recipe.
  const conflicts = [];
  for (const t of new Set([...T, ...X])) {
    if ((DISH.has(t) || PROTEIN.has(t)) && !GENERIC.has(t) && !a.allTokens.has(t) && !a.ingTokens.has(t)) conflicts.push(t);
  }
  const titleConf = conflicts.filter((t) => T.has(t));
  const penalty = Math.min(0.5, titleConf.length * 0.3 + (conflicts.length - titleConf.length) * 0.08);
  const s = Math.max(0, 0.55 * coverage + 0.45 * coreCov - penalty);
  return { score: +s.toFixed(3), coverage: +coverage.toFixed(3), coreCov: +coreCov.toFixed(3), conflicts };
}

/** Tiering used by acquire + verify. auto = no human needed; review = plausible, human must confirm. */
export function tier(sc, { auto, review }) {
  if (sc.score >= auto && sc.coreCov >= 0.99 && sc.conflicts.length === 0) return 'auto';
  if (sc.score >= review && sc.coreCov >= 0.5) return 'review';
  return 'none';
}
