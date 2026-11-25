#!/usr/bin/env node
// Step 2: turn chosen photos into optimised WebP files + the manifest. Safe to rerun: unchanged images are skipped.
//   node tools/images/build.mjs [--only id1,id2] [--prune] [--concurrency 4]
// Output:  assets/recipes/t/<hash>.webp (480x320)   assets/recipes/f/<hash>.webp (1200x800)   assets/recipes/manifest.json
import fs from 'node:fs'; import path from 'node:path';
import sharp from 'sharp';
import { ASSET_DIR, MANIFEST_FILE, STATE_FILE, MANUAL_DIR, CREDITS_MD, SIZES, LICENSE_LABEL } from './config.mjs';
import { loadRecipes } from './recipes.mjs';
import { readJson, writeJson, sha1, parseArgs } from './store.mjs';
import { downloadRaw } from './raw.mjs';

const SETTINGS = JSON.stringify(SIZES);
const hex = (n) => n.toString(16).padStart(2, '0');

export async function processImage(input) {
  const base = sharp(input, { failOn: 'error' }).rotate();
  const fit = (w, h) => base.clone().resize(w, h, { fit: 'cover', position: sharp.strategy.attention }).sharpen({ sigma: 0.5 });
  const full = await fit(SIZES.full.w, SIZES.full.h).webp({ quality: SIZES.full.q, effort: 5 }).toBuffer();
  const thumb = await sharp(full).resize(SIZES.thumb.w, SIZES.thumb.h, { fit: 'cover' }).webp({ quality: SIZES.thumb.q, effort: 5 }).toBuffer();
  const { data: px } = await sharp(thumb).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
  const g = await sharp(thumb).resize(8, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
  const mean = g.reduce((a, b) => a + b, 0) / g.length; let bits = ''; for (const v of g) bits += v >= mean ? '1' : '0';
  const ahash = bits.match(/.{4}/g).map((b) => parseInt(b, 2).toString(16)).join('');
  return { full, thumb, color: '#' + hex(px[0]) + hex(px[1]) + hex(px[2]), ahash, f: sha1(full).slice(0, 12) };
}

function manualFor(id) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) { const p = path.join(MANUAL_DIR, `${id}.${ext}`); if (fs.existsSync(p)) return p; }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const only = args.only ? new Set(String(args.only).split(',')) : null;
  const conc = +args.concurrency || 4;
  const recipes = loadRecipes(); const byId = new Map(recipes.map((r) => [r.id, r]));
  const state = readJson(STATE_FILE, { recipes: {} });
  const manual = readJson(path.join(MANUAL_DIR, 'credits.json'), {});
  const manifest = readJson(MANIFEST_FILE, null) || { version: 1, base: 'assets/recipes/', sizes: { thumb: [SIZES.thumb.w, SIZES.thumb.h], full: [SIZES.full.w, SIZES.full.h] }, images: {} };
  manifest.sizes = { thumb: [SIZES.thumb.w, SIZES.thumb.h], full: [SIZES.full.w, SIZES.full.h] };
  fs.mkdirSync(path.join(ASSET_DIR, 't'), { recursive: true }); fs.mkdirSync(path.join(ASSET_DIR, 'f'), { recursive: true });

  const jobs = [];
  for (const r of recipes) {
    if (only && !only.has(r.id)) continue;
    const m = manualFor(r.id); const st = state.recipes[r.id];
    if (m) jobs.push({ id: r.id, kind: 'manual', file: m });
    else if (st?.status === 'accepted') jobs.push({ id: r.id, kind: st.via === 'review' ? 'reviewed' : 'auto', c: st.candidate });
    else if (manifest.images[r.id] && !only) delete manifest.images[r.id]; // no longer approved (e.g. rejected in review) -> remove
  }
  let built = 0, skipped = 0, failed = 0, i = 0;
  const work = async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      try {
        const file = j.file || await downloadRaw(j.c);
        const key = sha1(fs.readFileSync(file)).slice(0, 16) + ':' + sha1(SETTINGS).slice(0, 6);
        const prev = manifest.images[j.id];
        if (prev && prev.k === key && fs.existsSync(path.join(ASSET_DIR, 'f', prev.f + '.webp')) && fs.existsSync(path.join(ASSET_DIR, 't', prev.f + '.webp'))) { skipped++; continue; }
        const out = await processImage(file);
        fs.writeFileSync(path.join(ASSET_DIR, 'f', out.f + '.webp'), out.full); fs.writeFileSync(path.join(ASSET_DIR, 't', out.f + '.webp'), out.thumb);
        const c = j.c;
        manifest.images[j.id] = j.kind === 'manual'
          ? { f: out.f, c: out.color, p: out.ahash, k: key, ok: 'manual', s: 'manual', a: manual[j.id]?.creator || 'FOODIE', l: manual[j.id]?.license || 'Own work', u: manual[j.id]?.url || '', t: byId.get(j.id).n }
          : { f: out.f, c: out.color, p: out.ahash, k: key, ok: j.kind, s: c.source, sid: c.sid, t: c.title, tg: (c.tags || []).slice(0, 6), ct: (c.categories || []).slice(0, 4), q: c.score, u: c.landingUrl, a: c.creator, au: c.creatorUrl || undefined,
            l: licenseText(c), lu: c.licenseUrl || undefined };
        built++;
      } catch (e) { failed++; console.warn(`\n  ${j.id}: ${e.message}`); }
      finally { process.stdout.write(`\r${built + skipped + failed}/${jobs.length} (new ${built}, unchanged ${skipped}, failed ${failed})   `); }
    }
  };
  await Promise.all(Array.from({ length: conc }, work));

  const sorted = Object.fromEntries(Object.entries(manifest.images).filter(([id]) => byId.has(id)).sort(([a], [b]) => (a < b ? -1 : 1)));
  manifest.images = sorted; manifest.count = Object.keys(sorted).length; manifest.built = new Date().toISOString().slice(0, 10);
  writeJson(MANIFEST_FILE, manifest, false);

  if (args.prune) {
    const keep = new Set(Object.values(sorted).map((x) => x.f + '.webp'));
    for (const d of ['t', 'f']) for (const f of fs.readdirSync(path.join(ASSET_DIR, d))) if (!keep.has(f)) { fs.unlinkSync(path.join(ASSET_DIR, d, f)); }
  }
  writeCredits(manifest, byId);
  console.log(`\nManifest: ${manifest.count}/${recipes.length} recipes have photos.`);
}

export function licenseText(c) { const base = LICENSE_LABEL[c.license] || c.license; return c.license === 'by' || c.license === 'by-sa' ? `${base}${c.licenseVersion ? ' ' + c.licenseVersion : ''}` : base; }

function writeCredits(manifest, byId) {
  const esc = (s) => String(s || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const rows = Object.entries(manifest.images).map(([id, x]) => `| ${esc(byId.get(id)?.n)} | ${x.u ? `[${esc(x.t).slice(0, 70) || 'source'}](${x.u})` : esc(x.t)} | ${esc(x.a) || 'Unknown'} | ${x.lu ? `[${esc(x.l)}](${x.lu})` : esc(x.l)} |`);
  const md = `# Recipe photo credits\n\nGenerated by \`npm run images:build\` — do not edit by hand. ${rows.length} photographs.\nImages were cropped to 3:2 and resized/compressed to WebP. Licences: CC0 / public domain need no credit; CC BY images are credited below (and on each recipe page).\n\n| Recipe | Photo | Photographer / source | Licence |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`;
  fs.mkdirSync(path.dirname(CREDITS_MD), { recursive: true }); fs.writeFileSync(CREDITS_MD, md);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
