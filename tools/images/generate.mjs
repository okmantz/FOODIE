#!/usr/bin/env node
// Generates one photograph per recipe with a text-to-image model, straight from the recipe's own name,
// cuisine and ingredients, then writes the same optimised WebP files + manifest entries the app already reads.
//   node tools/images/generate.mjs [--provider pollinations|cloudflare|openai] [--limit 150] [--only id1,id2]
//        [--concurrency 2] [--min-gap 1500] [--max-minutes 300] [--force] [--prompts 5]
// Resumable: recipes that already have a photo in assets/recipes/manifest.json are skipped, so rerun until done.
// Exit codes: 0 ok (see REMAINING=n on the last line), 2 provider refused (bad key / quota) with progress saved.
import fs from 'node:fs'; import path from 'node:path';
import sharp from 'sharp';
import { ASSET_DIR, MANIFEST_FILE, SIZES } from './config.mjs';
import { loadRecipes } from './recipes.mjs';
import { readJson, writeJson, sha1, parseArgs } from './store.mjs';
import { processImage } from './build.mjs';
import { PROVIDERS } from './providers.mjs';
import { buildPrompt, seedFor } from './prompt.mjs';

const args = parseArgs(process.argv.slice(2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ham = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += (parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(2).replace(/0/g, '').length; return d; };

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

async function main() {
  const provName = String(args.provider || process.env.IMAGE_PROVIDER || 'pollinations');
  const provider = PROVIDERS[provName]; if (!provider) { console.error(`Unknown provider "${provName}". Choose: ${Object.keys(PROVIDERS).filter((p) => p !== 'mock').join(', ')}`); process.exit(1); }
  const recipes = loadRecipes();

  if (args.prompts) { for (const r of recipes.slice(0, +args.prompts || 5)) console.log(`\n# ${r.id}\n${buildPrompt(r)}`); return; }

  const only = args.only ? new Set(String(args.only).split(',')) : null;
  const limit = +args.limit || Infinity; const conc = Math.max(1, +args.concurrency || 2);
  const minGap = +(args['min-gap'] ?? (provName === 'pollinations' ? 1500 : 0));
  const deadline = args['max-minutes'] ? Date.now() + (+args['max-minutes']) * 60000 : Infinity;
  fs.mkdirSync(path.join(ASSET_DIR, 't'), { recursive: true }); fs.mkdirSync(path.join(ASSET_DIR, 'f'), { recursive: true });
  const manifest = readJson(MANIFEST_FILE, null) || { version: 1, base: 'assets/recipes/', sizes: { thumb: [SIZES.thumb.w, SIZES.thumb.h], full: [SIZES.full.w, SIZES.full.h] }, images: {} };
  const save = () => {
    manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => (a < b ? -1 : 1)));
    manifest.count = Object.keys(manifest.images).length; manifest.built = new Date().toISOString().slice(0, 10);
    writeJson(MANIFEST_FILE, manifest, false);
  };
  const todo = recipes.filter((r) => (!only || only.has(r.id)) && (args.force || !manifest.images[r.id]));
  const total = recipes.length; let made = 0, failed = 0, started = 0, stop = null, nextAt = 0, dirty = 0;
  const hashes = () => Object.values(manifest.images).map((x) => x.p).filter(Boolean);
  console.log(`Provider: ${provider.label} · ${todo.length} recipes without a photo · ${Object.keys(manifest.images).length}/${total} done`);

  const worker = async () => {
    while (!stop) {
      if (Date.now() > deadline) { stop = 'time budget reached'; break; }
      if (started >= limit || !todo.length) break;
      const r = todo.shift(); started++;
      const prompt = buildPrompt(r); let done = false, why = '';
      for (let attempt = 0; attempt < 4 && !done && !stop; attempt++) {
        try {
          const gap = Math.max(0, nextAt - Date.now()); nextAt = Math.max(nextAt, Date.now()) + minGap; if (gap) await sleep(gap);
          const buf = await provider.generate(prompt, { seed: seedFor(r.id, attempt), signal: AbortSignal.timeout(180000) });
          const bad = await looksLikeFood(buf); if (bad) { why = bad; continue; }
          const out = await processImage(buf);
          if (hashes().some((p) => ham(p, out.ahash) <= 2)) { why = 'near-duplicate of another photo'; continue; }
          fs.writeFileSync(path.join(ASSET_DIR, 'f', out.f + '.webp'), out.full); fs.writeFileSync(path.join(ASSET_DIR, 't', out.f + '.webp'), out.thumb);
          manifest.images[r.id] = { f: out.f, c: out.color, p: out.ahash, k: 'ai:' + sha1(prompt).slice(0, 10), ok: 'manual', s: 'ai', a: 'AI-generated image', l: provider.label, t: r.n, g: provName };
          made++; dirty++; done = true;
        } catch (e) {
          why = e.message;
          if (e.fatal) { stop = `provider refused: ${e.message}`; break; }
          const wait = e.status === 429 ? Math.max(e.retryAfter * 1000, 15000 * (attempt + 1)) : 4000 * (attempt + 1);
          await sleep(wait);
        }
      }
      if (!done && !stop) { failed++; console.warn(`\n  ${r.id}: gave up (${why})`); }
      if (dirty >= 10) { save(); dirty = 0; }
      process.stdout.write(`\r${Object.keys(manifest.images).length}/${total} photos · new ${made} · failed ${failed}   `);
    }
  };
  const onSig = () => { save(); process.exit(130); }; process.on('SIGINT', onSig); process.on('SIGTERM', onSig);
  await Promise.all(Array.from({ length: conc }, worker));
  save();
  const remaining = total - Object.keys(manifest.images).length;
  console.log(`\nDone: ${made} new photos, ${failed} failed. ${stop ? 'Stopped: ' + stop + '.' : ''}`);
  console.log(`REMAINING=${remaining}`);
  if (stop && /refused/.test(stop)) process.exit(2);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
