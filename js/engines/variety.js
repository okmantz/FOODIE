/**
 * Recipe "traits" used by the meal planner to build plans that feel varied:
 * main protein, dish form (soup, bowl, pasta, curry…), flavor profile and heaviness.
 * Derived once per recipe from its ingredients and name, so it works for built-in and custom recipes alike.
 */
import { CUISINE_FLAVORS } from './nutrition.js';

const PROTEINS = [
  ['chicken', /chicken/], ['turkey', /turkey/], ['beef', /beef|steak|brisket|ribeye|chuck|flank|veal|sirloin|oxtail/], ['pork', /pork|bacon|sausage|\bham\b|chorizo|prosciutto|pepperoni|pancetta/],
  ['lamb', /lamb|goat|mutton/], ['fish', /salmon|tuna|\bcod\b|tilapia|halibut|trout|sardine|mahi|anchov|white-fish|fish(?!-sauce)|snapper|bass|haddock/], ['shellfish', /shrimp|scallop|crab|lobster|mussel|clam|squid|calamari|octopus/],
  ['tofu', /tofu|tempeh|seitan|edamame/], ['egg', /^egg$|^eggs?-/], ['legume', /lentil|chickpea|(?<!green-)(?<!sprouts-)\bbeans?\b|black-bean|pinto|kidney|white-bean|fava|mung|\bdal\b|split-pea/],
];
const NOT_PROTEIN = /sauce|broth|stock|paste|powder|oil|seasoning|spice|vinegar|extract|sprout|green-bean|jerky/;

const FORMS = [
  ['soup', /soup|stew|chowder|bisque|broth|pho\b|ramen|pozole|(?:^|\s)chili(?:\s*$|\s+(?:con|with|verde))|\bchili$|gumbo|porridge|congee|dal\b|laksa|goulash/i],
  ['salad', /salad|slaw|ceviche|poke/i], ['pasta', /pasta|spaghetti|linguine|penne|fettuccine|lasagna|ravioli|gnocchi|mac\b|orzo|carbonara|macaroni/i],
  ['noodles', /noodle|udon|soba|lo mein|pad thai|chow mein|japchae|vermicelli/i], ['curry', /curry|masala|korma|tikka|vindaloo|rendang|biryani/i],
  ['handheld', /taco|burrito|wrap|sandwich|burger|quesadilla|sub\b|banh mi|gyro|pita|slider|fajita|enchilada|empanada|dumpling|roll\b|toast|flatbread|naan/i],
  ['pizza', /pizza|calzone|focaccia/i], ['bowl', /bowl|rice|fried rice|risotto|pilaf|paella|bibimbap|jollof/i], ['stirfry', /stir[- ]?fry|sauté|saute|skillet|sizzling/i],
  ['roast', /roast|grilled|baked|bbq|barbecue|skewer|kebab|kabob|sheet[- ]pan|braised|seared|pan[- ]seared|fillet|chops?\b|meatloaf|schnitzel/i],
  ['eggs', /omelet|omelette|frittata|scramble|shakshuka|quiche|benedict|egg/i], ['sweet-breakfast', /pancake|waffle|oat|porridge|granola|parfait|yogurt|muesli|french toast|crepe|chia|smoothie|shake/i],
];

const cache = new Map();
export function traits(r) {
  let t = cache.get(r.id); if (t && !r.custom) return t;
  const score = {};
  for (const [id, qty] of r.i) {
    const key = id.replace('~', '').toLowerCase(); if (NOT_PROTEIN.test(key)) continue;
    for (const [name, re] of PROTEINS) if (re.test(key)) { score[name] = (score[name] || 0) + (key === 'egg' ? qty * 50 : qty); break; }
  }
  let protein = 'veg', best = 40;                       // need a meaningful amount to count as "the" protein
  for (const [k, v] of Object.entries(score)) if (v > best) { best = v; protein = k; }
  const name = r.n || '';
  const form = (FORMS.find(([, re]) => re.test(name)) || [r.t === 'breakfast' ? 'breakfast' : r.t === 'smoothie' ? 'sweet-breakfast' : 'plate'])[0];
  t = { protein, form, flavors: CUISINE_FLAVORS[r.c] || [], heavy: r.d.nut.kcal > 650, light: r.d.nut.kcal < 380 };
  if (!r.custom) cache.set(r.id, t);
  return t;
}
