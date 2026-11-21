/**
 * Grocery stores. `mult` is a ROUGH relative price tier versus a national
 * average basket (1.00) — an editable planning heuristic, NOT live pricing.
 * `search(q)` opens the retailer's own public search page in a new tab; FOODIE
 * cannot place orders or read carts (that needs each retailer's partner API).
 * `match` recognises the chain (and its sister banners) in OpenStreetMap data so
 * FOODIE can tell you which of these stores are actually near you.
 */
import { state } from '../store.js';

const q = encodeURIComponent;
const web = (s, store) => `https://www.google.com/search?q=${q(`${s} ${store}`)}`;

export const STORES = [
  { id: 'any', name: 'No preference (national average)', mult: 1.0, search: (s) => `https://www.google.com/search?q=${q(s + ' grocery pickup')}`, order: 'Search the web' },
  { id: 'walmart', name: 'Walmart', mult: 0.93, match: /wal-?mart/i, search: (s) => `https://www.walmart.com/search?q=${q(s)}`, order: 'Pickup & delivery' },
  { id: 'aldi', name: 'Aldi', mult: 0.82, match: /\baldi\b/i, search: (s) => `https://new.aldi.us/results?q=${q(s)}`, order: 'Pickup via Instacart' },
  { id: 'lidl', name: 'Lidl', mult: 0.84, match: /\blidl\b/i, search: null, order: 'In-store (online ordering varies by area)' },
  { id: 'kroger', name: 'Kroger & family', mult: 1.0, match: /kroger|ralphs|fred meyer|king soopers|harris teeter|smith'?s|fry'?s|dillons|qfc|mariano|city market|pick ?'?n ?save|metro market|food 4 less|baker'?s|jay c|pay-?less|owen'?s/i, search: (s) => `https://www.kroger.com/search?query=${q(s)}`, order: 'Pickup & delivery' },
  { id: 'target', name: 'Target', mult: 1.05, match: /\btarget\b/i, search: (s) => `https://www.target.com/s?searchTerm=${q(s)}`, order: 'Drive Up & Order Pickup' },
  { id: 'costco', name: 'Costco (bulk, membership)', mult: 0.85, match: /costco/i, search: (s) => `https://www.costco.com/CatalogSearch?keyword=${q(s)}`, order: 'Online & delivery' },
  { id: 'sams', name: "Sam's Club (bulk, membership)", mult: 0.86, match: /sam'?s club/i, search: (s) => `https://www.samsclub.com/s/${q(s)}`, order: 'Pickup & delivery' },
  { id: 'wholefoods', name: 'Whole Foods Market', mult: 1.28, match: /whole foods/i, search: (s) => `https://www.amazon.com/s?k=${q(s)}&i=wholefoods`, order: 'Pickup & delivery via Amazon' },
  { id: 'trader', name: "Trader Joe's", mult: 0.95, match: /trader joe/i, search: null, order: 'In-store only (no online ordering)' },
  { id: 'sprouts', name: 'Sprouts Farmers Market', mult: 1.12, match: /sprouts/i, search: (s) => web(s, 'Sprouts Farmers Market'), order: 'Pickup & delivery via Instacart' },
  { id: 'safeway', name: 'Safeway / Albertsons', mult: 1.1, match: /safeway|albertsons|vons|jewel-?osco|shaw'?s|acme|tom thumb|randalls|pavilions|star market|haggen|carrs/i, search: (s) => `https://www.safeway.com/shop/search-results.html?q=${q(s)}`, order: 'Pickup & delivery' },
  { id: 'publix', name: 'Publix', mult: 1.1, match: /publix/i, search: (s) => `https://www.publix.com/search?query=${q(s)}`, order: 'Curbside & delivery' },
  { id: 'wegmans', name: 'Wegmans', mult: 1.03, match: /wegmans/i, search: (s) => `https://shop.wegmans.com/search?search_term=${q(s)}`, order: 'Pickup & delivery' },
  { id: 'ahold', name: 'Stop & Shop / Giant / Food Lion', mult: 1.0, match: /stop ?& ?shop|giant (food|eagle)|giant\b|food lion|hannaford|martin'?s food/i, search: (s) => web(s, 'Stop & Shop Giant Food Lion'), order: 'Pickup & delivery' },
  { id: 'meijer', name: 'Meijer', mult: 0.98, match: /meijer/i, search: (s) => `https://www.meijer.com/shopping/search.html?text=${q(s)}`, order: 'Pickup & delivery' },
  { id: 'heb', name: 'H-E-B', mult: 0.92, match: /\bh-?e-?b\b|central market/i, search: (s) => `https://www.heb.com/search?q=${q(s)}`, order: 'Curbside & delivery' },
  { id: 'winco', name: 'WinCo Foods', mult: 0.82, match: /winco/i, search: null, order: 'In-store only' },
  { id: 'savealot', name: 'Save-A-Lot', mult: 0.84, match: /save-?a-?lot/i, search: null, order: 'In-store (delivery via Instacart in some areas)' },
  { id: 'instacart', name: 'Instacart (any store)', mult: 1.15, search: (s) => `https://www.instacart.com/store/s?k=${q(s)}`, order: 'Delivery from local stores' },
];
export const storeById = (id) => STORES.find((s) => s.id === id) || STORES[0];

/** Which known chain (if any) is this OpenStreetMap shop? */
export function chainOf(name = '', brand = '') {
  const text = `${brand} ${name}`;
  return STORES.find((s) => s.match && s.match.test(text)) || null;
}

/**
 * Effective price multiplier = store price tier × the user's own "local prices"
 * calibration (Profile → Budgets). One number every cost calculation shares, so
 * the planner, grocery list, recipe pages and insights always agree.
 */
export const localAdjust = () => 1 + (Number(state.profile.priceAdjust) || 0) / 100;
export const priceMult = (storeId) => storeById(storeId).mult * localAdjust();
