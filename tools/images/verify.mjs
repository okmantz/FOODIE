#!/usr/bin/env node
// Verifies photo coverage and quality for every recipe.   node tools/images/verify.mjs [--require-full] [--json]
// Hard errors (exit 1): manifest entries for unknown recipes, missing/broken/mis-sized files, disallowed licences,
//   missing attribution, one recipe's photo shared with another recipe, near-identical photos, photo/recipe mismatch.
// Coverage gaps are reported with a reason (needs review / unmatched / not searched). --require-full makes any gap an error.
import fs from 'node:fs'; import path from 'node:path';
import sharp from 'sharp';
import { ASSET_DIR, MANIFEST_FILE, STATE_FILE, REPORT_FILE, SIZES, BUDGET_MB, LICENSES_SA, REVIEW_SCORE } from './config.mjs';
import { loadRecipes } from './recipes.mjs';
import { analyze, score } from './match.mjs';
import { readJson, writeJson, parseArgs } from './store.mjs';

const args = parseArgs(process.argv.slice(2));
const recipes = loadRecipes(); const ids = new Set(recipes.map((r) => r.id));
const manifest = readJson(MANIFEST_FILE, null); const state = readJson(STATE_FILE, { recipes: {} });
const errors = [], warnings = [];
const err = (id, m) => errors.push({ id, m }); const warn = (id, m) => warnings.push({ id, m });
if (!manifest) { console.error(`No manifest at ${MANIFEST_FILE} — run npm run images first.`); process.exit(1); }

const imgs = manifest.images; const hamming = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += (parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(2).replace(/0/g, '').length; return d; };
let bytes = 0; const byFile = new Map();

for (const [id, x] of Object.entries(imgs)) {
  if (!ids.has(id)) { err(id, 'manifest entry has no matching recipe id'); continue; }
  (byFile.get(x.f) || byFile.set(x.f, []).get(x.f)).push(id);
  for (const [dir, key] of [['t', 'thumb'], ['f', 'full']]) {
    const p = path.join(ASSET_DIR, dir, x.f + '.webp');
    if (!fs.existsSync(p)) { err(id, `missing file ${dir}/${x.f}.webp`); continue; }
    bytes += fs.statSync(p).size;
    if (args['skip-dims']) continue;
    try { const m = await sharp(p).metadata(); if (m.format !== 'webp') err(id, `${dir}/${x.f}.webp is not WebP`); if (m.width !== SIZES[key].w || m.height !== SIZES[key].h) err(id, `${dir}/${x.f}.webp is ${m.width}x${m.height}, expected ${SIZES[key].w}x${SIZES[key].h}`); }
    catch (e) { err(id, `${dir}/${x.f}.webp unreadable: ${e.message}`); }
  }
  if (x.ok !== 'manual') {
    const lic = String(x.l || '').toLowerCase();
    if (!/^(cc0|public domain|cc by( \d|$)|cc by-sa)/.test(lic)) err(id, `licence not allowed or unknown: "${x.l}"`);
    if (/cc by/.test(lic) && (!x.a || !x.u)) err(id, 'CC BY photo is missing creator or source URL (attribution required)');
    if (/by-sa/.test(lic)) warn(id, 'CC BY-SA photo: adapted copy must stay BY-SA (documented in IMAGE-CREDITS.md)');
    // relevance re-check against the recipe: mismatched photo/recipe pairs surface here even after manual edits
    if (x.ok === 'auto') {
      const r = recipes.find((q) => q.id === id); const sc = score(analyze(r), { title: x.t, tags: x.tg, categories: x.ct });
      if (sc.score < REVIEW_SCORE || sc.conflicts.some((c) => String(x.t).toLowerCase().includes(c))) err(id, `photo title "${x.t}" does not look like "${r.n}" (score ${sc.score}, conflicts: ${sc.conflicts.join(',') || 'none'})`);
    }
  }
}
for (const [f, list] of byFile) if (list.length > 1) err(list.join(', '), `share one photo (${f}) — duplicate`);
const arr = Object.entries(imgs).filter(([, x]) => x.p);
for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) if (arr[i][1].f !== arr[j][1].f && hamming(arr[i][1].p, arr[j][1].p) <= 2) err(`${arr[i][0]}, ${arr[j][0]}`, 'near-identical photos (perceptual hash)');

const missing = recipes.filter((r) => !imgs[r.id]).map((r) => ({ id: r.id, name: r.n, reason: state.recipes[r.id]?.status || 'not searched yet' }));
const by = {}; for (const m of missing) by[m.reason] = (by[m.reason] || 0) + 1;
const mb = bytes / 1048576; if (mb > BUDGET_MB) warn('-', `photos total ${mb.toFixed(1)} MB (budget ${BUDGET_MB} MB) — lower SIZES.*.q in config.mjs`);
if (args['require-full'] && missing.length) err('-', `${missing.length} recipes have no photo`);

const report = { recipes: recipes.length, covered: Object.keys(imgs).length, coveragePct: +(100 * Object.keys(imgs).length / recipes.length).toFixed(1), megabytes: +mb.toFixed(1), missingByReason: by, errors, warnings, missing };
writeJson(REPORT_FILE, report);
console.log(`Coverage: ${report.covered}/${report.recipes} (${report.coveragePct}%) · ${report.megabytes} MB`);
if (missing.length) console.log('Without photo: ' + Object.entries(by).map(([k, v]) => `${v} ${k}`).join(' · ') + `  (full list: ${path.relative(process.cwd(), REPORT_FILE)})`);
for (const w of warnings.slice(0, 20)) console.log('  warn  ', w.id, w.m);
for (const e of errors.slice(0, 50)) console.log('  ERROR ', e.id, e.m);
if (errors.length > 50) console.log(`  … and ${errors.length - 50} more errors`);
console.log(errors.length ? `\nFAILED: ${errors.length} error(s)` : '\nOK: every photo present is valid, licensed and unique.');
process.exit(errors.length ? 1 : 0);
