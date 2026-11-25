#!/usr/bin/env node
/**
 * Builds js/data/recipes-world.js from the hand-written world-cuisine recipe files in tools/world/*.txt.
 *
 *   node tools/world/build.mjs            # validate + (re)write js/data/recipes-world.js
 *   node tools/world/build.mjs --report   # also print kcal / protein / cost for every recipe (sanity scan)
 *
 * Source format, one recipe per line (fields separated by " | "):
 *   # Cuisine: Vietnamese                                  <- sets the cuisine for the recipes below
 *   Name | type | emoji | prep min | cook min | servings | id:qty id:qty ... | step // step // step | optional tip
 * Quantities are for the WHOLE recipe, in the ingredient's base unit (g, ml or each). Volume ingredients may use
 * tsp / tbsp / cup / l, spices (Z-flag) may use tsp / tbsp. Every recipe is checked against the ingredient database
 * (known ids, kcal range, protein, cost, step count, time, ingredient count); anything that fails is reported and the
 * build exits 1, so a bad recipe can never ship by accident.
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { BUILTIN_RECIPES } from '../../js/data/recipes.js';
import { MORE_RECIPES } from '../../js/data/recipes-more.js';
import { slug, qc, nutrition, I } from '../lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(DIR, '../../js/data/recipes-world.js');
const report = process.argv.includes('--report');
const TYPES = ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'smoothie'];
const VOL = { tsp: 5, tbsp: 15, cup: 240, ml: 1, l: 1000 };
// grams per tablespoon for weighed pastes, spreads and baking staples (so recipes can say "2tbsp"); tsp = a third
const TBSP = { honey: 21, molasses: 20, 'peanut-butter': 16, 'almond-butter': 16, tahini: 15, 'tomato-paste': 16, ketchup: 17, sriracha: 17, gochujang: 20, miso: 18, hoisin: 18,
  'oyster-sauce': 18, 'bbq-sauce': 17, mayo: 14, mustard: 15, sambal: 15, 'curry-paste': 16, 'green-curry-paste': 16, harissa: 16, doubanjiang: 17, tamarind: 16, 'aji-amarillo': 16,
  butter: 14, ghee: 13, sugar: 12.5, 'brown-sugar': 14, cornstarch: 8, flour: 8, 'greek-yogurt': 15, 'sour-cream': 15, 'cream-cheese': 14.5, 'tapioca-flour': 8, 'rice-flour': 9, 'masa-harina': 7, cocoa: 5.5,
  'dijon-placeholder': 15, 'nutritional-yeast': 5, 'sesame-seeds': 9, chia: 12, 'coconut-flakes': 6, 'tomato-sauce': 15, salsa: 16, pesto: 16, hummus: 15, jam: 20, 'condensed-milk': 20 };

function qty(id, raw, where) {
  const m = /^([0-9]*\.?[0-9]+)(tsp|tbsp|cup|ml|l|g|kg)?$/.exec(raw); if (!m) throw new Error(`${where}: bad quantity "${id}:${raw}"`);
  const n = +m[1], u = m[2]; const g = I[id]; if (!g) throw new Error(`${where}: unknown ingredient "${id}"`);
  if (!u) return n;
  if (g.kind === 'count') throw new Error(`${where}: ${id} is counted in "each" (no unit)`);
  if (g.kind === 'volume') { if (u === 'g' || u === 'kg') throw new Error(`${where}: ${id} is a liquid (use ml/tsp/tbsp/cup)`); return n * VOL[u]; }
  if (u === 'g') return n; if (u === 'kg') return n * 1000;
  if ((u === 'tsp' || u === 'tbsp') && g.flags.includes('Z')) { const tsp = id === 'salt' ? 5.5 : 2.5; return n * tsp * (u === 'tbsp' ? 3 : 1); }
  if ((u === 'tsp' || u === 'tbsp') && TBSP[id]) return n * TBSP[id] / (u === 'tsp' ? 3 : 1);
  throw new Error(`${where}: ${id} is a weighed ingredient (use grams)`);
}

const seenId = new Set([...BUILTIN_RECIPES, ...MORE_RECIPES].map((r) => r.id));
const seenName = new Set([...BUILTIN_RECIPES, ...MORE_RECIPES].map((r) => r.n.toLowerCase()));
const out = []; const errors = []; const warnings = []; const perCuisine = new Map();

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort()) {
  let cuisine = null;
  fs.readFileSync(path.join(DIR, file), 'utf8').split('\n').forEach((line, i) => {
    const where = `${file}:${i + 1}`; line = line.trim();
    if (!line || line.startsWith('##')) return;
    const c = /^#\s*Cuisine:\s*(.+)$/i.exec(line); if (c) { cuisine = c[1].trim(); return; }
    try {
      if (!cuisine) throw new Error(`${where}: recipe before any "# Cuisine:" line`);
      const f = line.split(' | ').map((x) => x.trim()); if (f.length < 8 || f.length > 9) throw new Error(`${where}: expected 8-9 fields, found ${f.length} (${f[0]})`);
      const [n, t, e, p, k, s, ing, steps, tip] = f; const w = `${where} (${n})`;
      if (!TYPES.includes(t)) throw new Error(`${w}: bad type "${t}"`);
      const items = ing.split(/\s+/).map((tok) => { const j = tok.lastIndexOf(':'); if (j < 1) throw new Error(`${w}: bad ingredient token "${tok}"`); const id = tok.slice(0, j); return [id, qty(id, tok.slice(j + 1), w)]; });
      const ids = items.map((x) => x[0]); const dup = ids.find((x, j) => ids.indexOf(x) !== j); if (dup) throw new Error(`${w}: ingredient "${dup}" listed twice`);
      const st = steps.split(' // ').map((x) => x.trim()).filter(Boolean);
      const r = { id: slug(n), n, c: cuisine, t, e, p: +p, k: +k, s: +s, i: items, st }; if (tip) r.tip = tip;
      const why = [];
      if (!(r.p >= 0 && r.k >= 0 && r.s >= 1 && r.s <= 8)) why.push('bad prep/cook/servings');
      if (r.p + r.k > 90) why.push(`takes ${r.p + r.k} min (keep it easy: 90 max)`);
      if (st.length < 3 || st.length > 8) why.push(`${st.length} steps (want 3-8)`);
      if (st.some((x) => x.length > 300 || !/[.!)]$/.test(x))) why.push('a step is too long or does not end with a full stop');
      if (n.length > 60 || /\s{2}/.test(line.replace(/ \| /g, ''))) why.push('name too long / double space');
      if (items.length < 4 || items.length > 16) why.push(`${items.length} ingredients (want 4-16)`);
      const q = qc(r); if (!q.ok) why.push(...q.why);
      if (seenId.has(r.id) || seenName.has(n.toLowerCase())) why.push('duplicate id or name');
      if (why.length) throw new Error(`${w}: ${why.join('; ')}`);
      seenId.add(r.id); seenName.add(n.toLowerCase()); out.push(r);
      const pc = perCuisine.get(cuisine) || { n: 0 }; pc.n++; perCuisine.set(cuisine, pc);
      if (report) { const nu = nutrition(r.i, r.s); console.log(`${cuisine.slice(0, 12).padEnd(12)} ${t.padEnd(9)} ${n.padEnd(46)} ${String(Math.round(nu.kcal)).padStart(4)} kcal ${String(Math.round(nu.pro)).padStart(3)}g P  $${nu.cost.toFixed(2)}`); }
    } catch (e) { errors.push(e.message); }
  });
}

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const num = (x) => String(+x.toFixed(2));
const fmt = (r) => {
  const parts = [`id: ${q(r.id)}`, `n: ${q(r.n)}`, `c: ${q(r.c)}`, `t: ${q(r.t)}`, `e: ${q(r.e)}`, `p: ${r.p}`, `k: ${r.k}`, `s: ${r.s}`,
    `i: [${r.i.map(([id, n]) => `[${q(id)}, ${num(n)}]`).join(', ')}]`, `st: [${r.st.map(q).join(', ')}]`];
  if (r.tip) parts.push(`tip: ${q(r.tip)}`);
  return `  { ${parts.join(', ')} },`;
};
const header = `/**
 * World-cuisine recipes (original, hand-written; source in tools/world/*.txt, built by tools/world/build.mjs).
 * Same compact format as recipes.js; nutrition, allergens, diet flags and cost are derived from the ingredient
 * database at runtime. Edit the .txt sources and re-run the build instead of editing this file by hand.
 */
export const WORLD_RECIPES = [
`;
for (const w of warnings) console.warn('warn:', w);
if (errors.length) { console.error(`\n${errors.length} problem(s):`); errors.forEach((e) => console.error('  ✗ ' + e)); }
if (!errors.length || process.argv.includes('--write-anyway')) fs.writeFileSync(OUT, header + out.map(fmt).join('\n') + '\n];\n');
console.log(`\n${out.length} world recipes ${errors.length ? '(NOT written: fix the problems above)' : 'written to js/data/recipes-world.js'} · ${[...perCuisine].map(([c, v]) => `${c} ${v.n}`).join(' · ')}`);
process.exit(errors.length ? 1 : 0);
