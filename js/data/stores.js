/**
 * Grocery stores. `mult` is a ROUGH relative price tier versus a national
 * average basket (1.00) — an editable planning heuristic, NOT live pricing.
 * `search(q)` opens the retailer's own public search page in a new tab; FOODIE
 * cannot place orders or read carts (that needs each retailer's partner API).
 */
const q = encodeURIComponent;
export const STORES = [
  { id: 'any', name: 'No preference (national average)', mult: 1.0, search: (s) => `https://www.google.com/search?q=${q(s + ' grocery pickup')}`, order: 'Search the web' },
  { id: 'walmart', name: 'Walmart', mult: 0.93, search: (s) => `https://www.walmart.com/search?q=${q(s)}`, order: 'Pickup & delivery' },
  { id: 'aldi', name: 'Aldi', mult: 0.82, search: (s) => `https://new.aldi.us/results?q=${q(s)}`, order: 'Pickup via Instacart' },
  { id: 'kroger', name: 'Kroger', mult: 1.0, search: (s) => `https://www.kroger.com/search?query=${q(s)}`, order: 'Pickup & delivery' },
  { id: 'target', name: 'Target', mult: 1.05, search: (s) => `https://www.target.com/s?searchTerm=${q(s)}`, order: 'Drive Up & Order Pickup' },
  { id: 'costco', name: 'Costco (bulk, membership)', mult: 0.85, search: (s) => `https://www.costco.com/CatalogSearch?keyword=${q(s)}`, order: 'Online & delivery' },
  { id: 'wholefoods', name: 'Whole Foods Market', mult: 1.28, search: (s) => `https://www.amazon.com/s?k=${q(s)}&i=wholefoods`, order: 'Pickup & delivery via Amazon' },
  { id: 'trader', name: "Trader Joe's", mult: 0.95, search: null, order: 'In-store only (no online ordering)' },
  { id: 'safeway', name: 'Safeway / Albertsons', mult: 1.1, search: (s) => `https://www.safeway.com/shop/search-results.html?q=${q(s)}`, order: 'Pickup & delivery' },
  { id: 'meijer', name: 'Meijer', mult: 0.98, search: (s) => `https://www.meijer.com/shopping/search.html?text=${q(s)}`, order: 'Pickup & delivery' },
  { id: 'heb', name: 'H-E-B', mult: 0.92, search: (s) => `https://www.heb.com/search?q=${q(s)}`, order: 'Curbside & delivery' },
  { id: 'instacart', name: 'Instacart (any store)', mult: 1.15, search: (s) => `https://www.instacart.com/store/s?k=${q(s)}`, order: 'Delivery from local stores' },
];
export const storeById = (id) => STORES.find((s) => s.id === id) || STORES[0];
