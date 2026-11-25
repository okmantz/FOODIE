#!/usr/bin/env node
// Merges photo shards produced by parallel `generate.mjs --shard i/n` jobs into this checkout.
//   node tools/images/merge.mjs <dir-with-one-extracted-shard-per-subfolder>
// Each shard folder holds assets/recipes/{f,t}/*.webp and assets/recipes/manifest.json. Entries are added only for recipes
// that have no photo yet, so the merge is idempotent and can never overwrite a photo you already approved.
import fs from 'node:fs'; import path from 'node:path';
import { ASSET_DIR, MANIFEST_FILE } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

export function mergeShards(root, { assetDir = ASSET_DIR, manifestFile = MANIFEST_FILE } = {}) {
  const manifest = readJson(manifestFile, null) || { version: 1, base: 'assets/recipes/', sizes: { thumb: [480, 320], full: [1200, 800] }, images: {} };
  let added = 0, files = 0;
  for (const d of fs.readdirSync(root).sort()) {
    const sd = path.join(root, d, 'assets/recipes'); const sm = readJson(path.join(sd, 'manifest.json'), null); if (!sm) continue;
    for (const [id, e] of Object.entries(sm.images || {})) {
      if (manifest.images[id]) continue;
      const f = path.join(sd, 'f', e.f + '.webp'), t = path.join(sd, 't', e.f + '.webp');
      if (!fs.existsSync(f) || !fs.existsSync(t)) { console.warn(`skip ${id}: image files missing in ${d}`); continue; }
      fs.mkdirSync(path.join(assetDir, 'f'), { recursive: true }); fs.mkdirSync(path.join(assetDir, 't'), { recursive: true });
      for (const [src, sub] of [[f, 'f'], [t, 't']]) { const dst = path.join(assetDir, sub, e.f + '.webp'); if (!fs.existsSync(dst)) { fs.copyFileSync(src, dst); files++; } }
      manifest.images[id] = e; added++;
    }
  }
  manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => (a < b ? -1 : 1)));
  manifest.count = Object.keys(manifest.images).length; manifest.built = new Date().toISOString().slice(0, 10);
  writeJson(manifestFile, manifest, false);
  return { added, files, total: manifest.count };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = process.argv[2]; if (!root) { console.error('usage: merge.mjs <shards-dir>'); process.exit(1); }
  const r = mergeShards(root); console.log(`Merged ${r.added} photos (${r.files} files). Manifest now lists ${r.total}.`);
}
