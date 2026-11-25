#!/usr/bin/env node
// Step 1: find + choose photos. Resumable: results are saved after every batch and cached per search query.
//   node tools/images/acquire.mjs [--limit 100] [--batch 25] [--only id1,id2] [--retry-unmatched] [--allow-sa]
//                                 [--sources openverse,commons] [--min-gap 700]
// Outcome per recipe (tools/images/data/state.json):
//   accepted  = high-confidence match (score >= AUTO_SCORE, same dish + protein, no conflicting dish) -> will be built
//   review    = plausible but not certain; top candidates kept for a human (npm run images:review)
//   unmatched = nothing suitable found. Never filled with an unrelated picture.
import fs from 'node:fs'; import path from 'node:path';
import { CACHE_DIR, STATE_FILE, LICENSES_DEFAULT, LICENSES_SA, AUTO_SCORE, REVIEW_SCORE, MIN_W, MIN_H, MIN_ASPECT, MAX_ASPECT } from './config.mjs';
import { loadRecipes } from './recipes.mjs';
import { analyze, score, tier, isFoodish, badTitle } from './match.mjs';
import { SOURCES } from './sources.mjs';
import { readJson, writeJson, sha1, parseArgs } from './store.mjs';
import { MIN_GAP } from './http.mjs';
import { downloadRaw } from './raw.mjs';

const args = parseArgs(process.argv.slice(2));
const licenses = args['allow-sa'] ? LICENSES_SA : LICENSES_DEFAULT;
const sources = String(args.sources || 'commons,openverse').split(',').filter((s) => SOURCES[s]);
if (args['min-gap']) for (const k of Object.keys(MIN_GAP)) MIN_GAP[k] = Math.max(MIN_GAP[k], +args['min-gap']);
const limit = +args.limit || Infinity, batch = +args.batch || 25;
const only = args.only ? new Set(String(args.only).split(',')) : null;

const state = readJson(STATE_FILE, { version: 1, recipes: {} });
const recipes = loadRecipes();
const usedSid = new Set(Object.values(state.recipes).filter((s) => s.status === 'accepted').map((s) => `${s.candidate.source}:${s.candidate.sid}`));

async function cachedSearch(src, query) {
  const f = path.join(CACHE_DIR, 'search', sha1(`${src}|${licenses}|${query}`) + '.json');
  const hit = readJson(f, null); if (hit) return hit;
  const res = await SOURCES[src](query, { licenses });
  writeJson(f, res, false); return res;
}

function usable(c) {
  if (!licenses.includes(c.license)) return false;
  if (c.width && c.width < MIN_W) return false; if (c.height && c.height < MIN_H) return false;
  if (c.width && c.height) { const ar = c.width / c.height; if (ar < MIN_ASPECT || ar > MAX_ASPECT) return false; }
  return !badTitle(c) && isFoodish(c);
}
const slim = (c, sc) => ({ source: c.source, sid: c.sid, title: c.title, tags: (c.tags || []).slice(0, 8), categories: (c.categories || []).slice(0, 6), creator: c.creator, creatorUrl: c.creatorUrl,
  license: c.license, licenseVersion: c.licenseVersion, licenseUrl: c.licenseUrl, landingUrl: c.landingUrl, downloadUrl: c.downloadUrl, thumbUrl: c.thumbUrl, width: c.width, height: c.height, score: sc.score, conflicts: sc.conflicts });

async function resolve(recipe) {
  const a = analyze(recipe); const pool = new Map(); const errors = [];
  for (const q of a.queries) {
    for (const src of sources) {
      try { for (const c of await cachedSearch(src, q)) pool.set(`${c.source}:${c.sid}`, c); }
      catch (e) { if (e.fatal) throw e; errors.push(`${src}: ${e.message}`); }
    }
    // Stop early once a query already produced an auto-grade match (saves API quota).
    const best = [...pool.values()].filter(usable).map((c) => ({ c, sc: score(a, c) })).sort((x, y) => y.sc.score - x.sc.score)[0];
    if (best && tier(best.sc, { auto: AUTO_SCORE, review: REVIEW_SCORE }) === 'auto' && !usedSid.has(`${best.c.source}:${best.c.sid}`)) break;
  }
  const ranked = [...pool.values()].filter(usable).map((c) => ({ c, sc: score(a, c) })).sort((x, y) => y.sc.score - x.sc.score);
  const free = ranked.filter((x) => !usedSid.has(`${x.c.source}:${x.c.sid}`)); // never reuse a photo already given to another recipe
  const top = free[0];
  if (top && tier(top.sc, { auto: AUTO_SCORE, review: REVIEW_SCORE }) === 'auto') {
    usedSid.add(`${top.c.source}:${top.c.sid}`);
    return { status: 'accepted', via: 'auto', candidate: slim(top.c, top.sc), queries: a.queries };
  }
  const rev = free.filter((x) => tier(x.sc, { auto: AUTO_SCORE, review: REVIEW_SCORE }) !== 'none').slice(0, 5);
  if (rev.length) return { status: 'review', candidates: rev.map((x) => slim(x.c, x.sc)), queries: a.queries };
  return { status: 'unmatched', queries: a.queries, note: errors.length ? errors.slice(0, 2).join('; ') : undefined };
}


async function main() {
  const pending = recipes.filter((r) => (!only || only.has(r.id)) && (!state.recipes[r.id] || (args['retry-unmatched'] && state.recipes[r.id].status === 'unmatched')));
  console.log(`${recipes.length} recipes · ${pending.length} to search · sources: ${sources.join('+')} · licences: ${licenses.join(',')}`);
  let done = 0;
  for (const r of pending.slice(0, limit)) {
    try {
      const res = await resolve(r);
      state.recipes[r.id] = { ...res, ts: new Date().toISOString().slice(0, 10) };
      if (res.status === 'accepted') await downloadRaw(res.candidate).catch((e) => console.warn('  download failed (will retry in build):', e.message));
    } catch (e) {
      console.error(`\nStopping: ${e.message}${e.fatal ? ' (access/quota problem — rerun later; progress is saved)' : ''}`); writeJson(STATE_FILE, state); process.exit(e.fatal ? 2 : 1);
    }
    done++; process.stdout.write(`\r${done}/${Math.min(limit, pending.length)}  ${state.recipes[r.id].status.padEnd(9)} ${r.n.slice(0, 60).padEnd(60)}`);
    if (done % batch === 0) writeJson(STATE_FILE, state);
  }
  writeJson(STATE_FILE, state);
  const c = { accepted: 0, review: 0, unmatched: 0 }; for (const s of Object.values(state.recipes)) c[s.status] = (c[s.status] || 0) + 1;
  console.log(`\nState: ${c.accepted} accepted · ${c.review} need review · ${c.unmatched} unmatched · ${recipes.length - Object.keys(state.recipes).length} not yet searched`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
