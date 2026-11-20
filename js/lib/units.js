/* Quantity formatting & parsing. Everything is stored in base units (g, ml, each). */

const FR = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

/** 1.5 -> "1½", 0.25 -> "¼", 3 -> "3" */
export function fraction(n) {
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  if (rest < 0.06) return String(whole || (n > 0 ? '<1' : '0'));
  if (rest > 0.94) return String(whole + 1);
  let best = null;
  for (const [v, s] of FR) if (Math.abs(rest - v) < 0.07 && (!best || Math.abs(rest - v) < Math.abs(rest - best[0]))) best = [v, s];
  if (best) return (whole ? whole : '') + best[1];
  return String(Math.round(n * 10) / 10);
}

const TSP = 4.929, TBSP = 14.787, CUP = 236.588;
const G_PER_OZ = 28.3495;

/**
 * Format a base-unit quantity for display.
 * @param {object} ing  ingredient (kind: mass|volume|count)
 * @param {number} qty  amount in base units
 * @param {'us'|'metric'} system
 */
export function fmtQty(ing, qty, system = 'us') {
  if (!ing) return String(qty);
  if (ing.kind === 'count') return ing.id === 'garlic' ? `${fraction(qty)} ${qty <= 1 ? 'clove' : 'cloves'}` : fraction(qty);
  if (ing.kind === 'mass') {
    if (system === 'metric') return qty >= 1000 ? `${round1(qty / 1000)} kg` : `${Math.round(qty)} g`;
    // small dry amounts (spices) read better in tsp/tbsp
    if (qty < 20 && /spices|baking/i.test(ing.aisle) && ing.id !== 'sugar' && ing.id !== 'flour') {
      const tsp = qty / 2.8;
      return tsp >= 3 ? `${fraction(tsp / 3)} tbsp` : `${fraction(tsp)} tsp`;
    }
    const oz = qty / G_PER_OZ;
    return oz >= 16 ? `${round1(oz / 16)} lb` : `${round1(oz)} oz`;
  }
  // volume
  if (system === 'metric') return qty >= 1000 ? `${round1(qty / 1000)} L` : `${Math.round(qty)} ml`;
  if (qty < TBSP * 0.9) return `${fraction(qty / TSP)} tsp`;
  if (qty < CUP / 4 - 5) return `${fraction(qty / TBSP)} tbsp`;
  if (qty < CUP * 3.5) return `${fraction(qty / CUP)} cup${qty / CUP > 1.05 ? 's' : ''}`;
  return `${round1(qty / 946)} qt`;
}
const round1 = (n) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');

/** Short unit label for editable inputs. */
export function unitLabel(ing, system = 'us') {
  if (ing.kind === 'count') return ing.id === 'garlic' ? 'cloves' : 'ea';
  if (ing.kind === 'mass') return system === 'metric' ? 'g' : 'oz';
  return system === 'metric' ? 'ml' : 'fl oz';
}
export const toDisplayNum = (ing, qty, system) => (ing.kind === 'count' ? Math.round(qty * 100) / 100 : system === 'metric' ? Math.round(qty) : ing.kind === 'mass' ? Math.round((qty / G_PER_OZ) * 10) / 10 : Math.round((qty / 29.5735) * 10) / 10);
export const fromDisplayNum = (ing, n, system) => (ing.kind === 'count' ? n : system === 'metric' ? n : ing.kind === 'mass' ? n * G_PER_OZ : n * 29.5735);

/** Human-readable pack description, e.g. "1 lb pack". */
export function fmtPack(ing, system = 'us') {
  if (ing.kind === 'count') return ing.pack === 1 ? 'each' : `${ing.pack}-count`;
  return fmtQty({ ...ing, aisle: 'x' }, ing.pack, system) + ' pack';
}
