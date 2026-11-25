#!/usr/bin/env node
// Generates one photograph per recipe with a text-to-image model, straight from the recipe's own name,
// cuisine and ingredients, then writes the same optimised WebP files + manifest entries the app already reads.
//
//   node tools/images/generate.mjs [--provider auto|fal|together|cloudflare|pollinations|openai|a,b,c]
//        [--limit 150] [--only id1,id2] [--shard 0/6] [--lanes fal=12,cloudflare=2] [--concurrency 4]
//        [--max-minutes 300] [--force] [--prompts 5]
//
// FAST BY DEFAULT: `--provider auto` (the default) runs EVERY provider that has credentials at the same time, each in its
// own lane with its own rate limit, all pulling from one shared queue (see pool.mjs). One FAL_KEY (or a paid Cloudflare /
// Together key) does ~1,500 photos in 10-20 minutes. With no keys at all it falls back to keyless Pollinations, which is
// slow by design (use --shard with the GitHub Action to multiply it).
//
// Resumable: recipes that already have a photo in assets/recipes/manifest.json are skipped, so just rerun until done.
// Exit codes: 0 ok (REMAINING=n on the last line), 2 every provider refused (bad key / quota) with progress saved.
import fs from 'node:fs'; import path from 'node:path';
import sharp from 'sharp';
import { ASSET_DIR, MANIFEST_FILE, SIZES } from './config.mjs';
import { loadRecipes } from './recipes.mjs';
import { readJson, writeJson, sha1, parseArgs } from './store.mjs';
import { processImage } from './build.mjs';
import { PROVIDERS, AUTO_ORDER, laneSettings } from './providers.mjs';
import { buildPrompt, seedFor } from './prompt.mjs';
import { makeLane, runPool, shardOf } from './pool.mjs';

const ham = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; };

/** Reject blank, near-uniform, error-card or badly exposed results before they reach the app. */
export async function looksLikeFood(buf) {
  const m = await sharp(buf).metadata();
  if (!m.width || m.width < 512 || m.height < 340) return 'too small';
  const s = await sharp(buf).resize(256, 256, { fit: 'inside' }).greyscale().stats();
  const { mean, stdev } = s.channels[0];
  if (stdev < 14) return 'almost uniform (blank / error image)';
  if (mean < 28) return 'far too dark'; if (mean > 235) return 'far too bright';
  return null;
}

/** Turn --provider into the list of provider names to run as lanes. */
export function chooseProviders(spec, available = (n) => PROVIDERS[n]?.available?.()) {
  const names = String(spec || process.env.IMAGE_PROVIDER || 'auto').split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const n of names) {
    if (n === 'auto') { for (const a of AUTO_ORDER) if (available(a) && !out.includes(a)) out.push(a); }
    else if (PROVIDERS[n] && n !== 'mock' || (n === 'mock' && process.env.FOODIE_ALLOW_MOCK === '1')) { if (!out.includes(n)) out.push(n); }
    else throw new Error(`Unknown provider "${n}". Choose: auto, ${Object.keys(PROVIDERS).filter((p) => p !== 'mock').join(', ')}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recipes = loadRecipes();
  if (args.prompts) { for (const r of recipes.slice(0, +args.prompts || 5)) console.log(`\n# ${r.id}\n${buildPrompt(r)}`); return; }

  let names; try { names = chooseProviders(args.provider); } catch (e) { console.error(e.message); process.exit(1); }
  if (!names.length) { console.error('No provider available. Set FAL_KEY, TOGETHER_API_KEY, CF_ACCOUNT_ID+CF_API_TOKEN, POLLINATIONS_API_KEY or OPENAI_API_KEY.'); process.exit(1); }
  const overrides = Object.fromEntries(String(args.lanes || '').split(',').filter(Boolean).map((kv) => kv.split('=')).map(([k, v]) => [k, +v]));
  const lanes = names.map((n) => {
    const s = laneSettings(n); const conc = overrides[n] || (args.concurrency ? +args.concurrency : s.concurrency);
    const gap = args['min-gap'] !== undefined && names.length === 1 ? +args['min-gap'] : s.gap;
    return makeLane(n, { ...s, concurrency: Math.max(1, conc), gap });
  });

  const only = args.only ? new Set(String(args.only).split(',')) : null;
  const limit = +args.limit || Infinity;
  const deadline = args['max-minutes'] ? Date.now() + (+args['max-minutes']) * 60000 : Infinity;
  fs.mkdirSync(path.join(ASSET_DIR, 't'), { recursive: true }); fs.mkdirSync(path.join(ASSET_DIR, 'f'), { recursive: true });
  const manifest = readJson(MANIFEST_FILE, null) || { version: 1, base: 'assets/recipes/', sizes: { thumb: [SIZES.thumb.w, SIZES.thumb.h], full: [SIZES.full.w, SIZES.full.h] }, images: {} };
  const save = () => {
    manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => (a < b ? -1 : 1)));
    manifest.count = Object.keys(manifest.images).length; manifest.built = new Date().toISOString().slice(0, 10);
    writeJson(MANIFEST_FILE, manifest, false);
  };
  const total = recipes.length;
  // shard first (stable over ALL recipes, so shards never overlap whatever each already has), then drop finished ones
  const mine = shardOf(recipes, args.shard).filter((r) => (!only || only.has(r.id)) && (args.force || !manifest.images[r.id]));
  const todo = mine.slice(0, limit);
  let made = 0, dirty = 0; const phashes = Object.values(manifest.images).map((x) => x.p).filter(Boolean);
  const t0 = Date.now();
  console.log(`Lanes: ${lanes.map((l) => `${l.name}×${l.concurrency}`).join(', ')} · ${todo.length} to generate${args.shard ? ` (shard ${args.shard})` : ''} · ${Object.keys(manifest.images).length}/${total} already done`);

  const progress = () => process.stdout.write(`\r${Object.keys(manifest.images).length}/${total} photos · new ${made} · ${(made / Math.max(1, (Date.now() - t0) / 60000)).toFixed(1)}/min   `);
  const work = async (r, lane, attempt) => {
    const prompt = buildPrompt(r); const provider = PROVIDERS[lane.name];
    const buf = await provider.generate(prompt, { seed: seedFor(r.id, attempt), signal: AbortSignal.timeout(150000) });
    const bad = await looksLikeFood(buf); if (bad) throw Object.assign(new Error(bad), { reject: true });
    const out = await processImage(buf);
    if (phashes.some((p) => ham(p, out.ahash) <= 2)) throw Object.assign(new Error('near-duplicate of another photo'), { reject: true });
    return { out, prompt, provider };
  };
  const onResult = (r, { out, prompt, provider }, lane) => {
    fs.writeFileSync(path.join(ASSET_DIR, 'f', out.f + '.webp'), out.full); fs.writeFileSync(path.join(ASSET_DIR, 't', out.f + '.webp'), out.thumb);
    manifest.images[r.id] = { f: out.f, c: out.color, p: out.ahash, k: 'ai:' + sha1(prompt).slice(0, 10), ok: 'manual', s: 'ai', a: 'AI-generated image', l: provider.label, t: r.n, g: lane.name };
    phashes.push(out.ahash); made++; if (++dirty >= 10) { save(); dirty = 0; } progress();
  };
  const onSig = () => { save(); process.exit(130); }; process.on('SIGINT', onSig); process.on('SIGTERM', onSig);

  const res = await runPool({ items: todo, lanes, work, onResult, deadline, log: (m) => console.warn(`\n  ${m}`) });
  save();
  for (const g of res.gaveUp) console.warn(`\n  ${g.item.id}: gave up (${g.why})`);
  const remaining = total - Object.keys(manifest.images).length;
  const mins = (Date.now() - t0) / 60000;
  console.log(`\nDone: ${made} new photos in ${mins.toFixed(1)} min (${(made / Math.max(mins, 1 / 60)).toFixed(1)}/min), ${res.gaveUp.length} gave up. ${res.stop ? 'Stopped: ' + res.stop + '.' : ''}`);
  for (const l of lanes) console.log(`  ${l.name.padEnd(12)} ${String(l.done).padStart(5)} photos · ${l.failed} errors · ${l.limited} rate-limit waits${l.dead ? ' · RETIRED: ' + l.dead : ''}`);
  console.log(`REMAINING=${remaining}`);
  if (res.stalled) process.exit(2);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
