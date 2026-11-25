// Builds the text-to-image prompt for one recipe. Pure function (no I/O) so it can be unit-tested.
// The prompt is derived only from the recipe's own name, cuisine, type and ingredient list, so the picture
// shows the dish the recipe actually describes. A single shared style block keeps all 1,500+ photos looking
// like one professional shoot (same light, angle, surface and colour grade).

const BASICS = /^(salt|black pepper|pepper|water|ice|cornstarch|flour|all-purpose flour|baking (soda|powder)|yeast|vanilla extract|.*\boil\b|.*\bvinegar\b|.*\b(broth|stock)\b|(white |brown |granulated |powdered )?sugar)$/i;

const STYLE = [
  'professional editorial food photography',
  'shot at a 40 degree angle with a 50mm lens',
  'soft natural window light from the left',
  'shallow depth of field',
  'on a light warm-grey stone surface with a folded linen napkin',
  'appetizing, realistic, true-to-life colours, crisp detail',
  'dish centred with breathing room around it',
  'no text, no logos, no people, no hands',
].join(', ');

const clean = (s) => String(s).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function heroIngredients(ing, max = 6) {
  const seen = new Set(); const out = [];
  for (const raw of ing) {
    const n = clean(raw);
    if (!n || BASICS.test(n) || seen.has(n)) continue;
    seen.add(n); out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/** How the dish is served, from its type and name. */
export function vessel(r) {
  const n = r.n.toLowerCase();
  if (r.t === 'smoothie') return /shake/.test(n) ? 'served in a tall glass with a paper straw, thick and creamy' : 'served in a tall clear glass with a paper straw, thick and creamy, topped with a little of its main fruit';
  if (/soup|stew|chili|chowder|ramen|pho|congee|dal\b|bisque/.test(n)) return 'served in a deep ceramic bowl with a little steam rising';
  if (/curry|tikka|masala|korma|tagine/.test(n)) return 'served in a ceramic bowl next to a portion of rice';
  if (/salad/.test(n)) return 'served in a wide shallow ceramic bowl, fresh and vibrant';
  if (/bowl/.test(n)) return 'served in a wide ceramic bowl with the components arranged in neat sections';
  if (/taco|burrito|wrap|sandwich|burger|sub\b|quesadilla|toast|pita|flatbread/.test(n)) return 'served on a wooden board, cut in half to show the filling';
  if (/pancake|waffle|french toast|oats|parfait|pudding|yogurt/.test(n)) return 'served in a simple ceramic dish';
  if (r.t === 'dessert') return 'served on a small ceramic plate';
  if (r.t === 'snack') return 'served on a small ceramic plate';
  if (r.t === 'breakfast') return 'served on a ceramic plate';
  return 'plated on a ceramic dinner plate';
}

const TYPE_WORD = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', dessert: 'dessert', snack: 'snack', smoothie: 'smoothie' };

export function buildPrompt(r) {
  const hero = heroIngredients(r.ing || []);
  const cuisine = r.c && !/^american$/i.test(r.c) ? `${r.c}-style ` : '';
  // No quotation marks around the name: image models tend to paint quoted words onto the picture.
  const head = `Photograph of ${r.n}, ${/^[aeiou]/i.test(cuisine || TYPE_WORD[r.t] || 'd') ? 'an' : 'a'} ${cuisine}${TYPE_WORD[r.t] || 'dish'}, ${vessel(r)}.`;
  const ing = hero.length ? ` Made with ${hero.join(', ')}.` : '';
  const garnish = r.t === 'lunch' || r.t === 'dinner' ? ', a little fresh herb garnish' : '';
  return `${head}${ing} ${STYLE}${garnish}.`;
}

/** Stable 31-bit seed per recipe so reruns are reproducible; `attempt` re-rolls when a result is rejected. */
export function seedFor(id, attempt = 0) {
  let h = 2166136261;
  for (const ch of `${id}#${attempt}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 1) % 2147483647;
}
