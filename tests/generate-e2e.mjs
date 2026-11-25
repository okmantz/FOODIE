// End-to-end photo generation against LOCAL stand-in servers that mimic the fal / Together / Cloudflare / Pollinations
// response shapes: several lanes at once, a lane that runs out of quota mid-run, rate limits, and sharding + merge.
// (The real services cannot be reached from CI; this proves the plumbing, not the vendors' current behaviour.)
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadRecipes } from '../tools/images/recipes.mjs';
import { mergeShards } from '../tools/images/merge.mjs';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const total = loadRecipes().length;

let n = 0;
async function picture(seedStr) { // a distinct, detailed picture per request so the quality gate and de-duplication behave like real photos
  const h = [...seedStr].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); const k = ++n;
  const shapes = Array.from({ length: 14 }, (_, i) => { const a = (h * (i + 3) * 2654435761 + k * 97) >>> 0; return `<rect x="${a % 1000}" y="${(a >> 8) % 650}" width="${80 + (a >> 4) % 400}" height="${60 + (a >> 12) % 300}" fill="hsl(${(a >> 3) % 360},${40 + (a >> 5) % 50}%,${20 + (a >> 6) % 60}%)"/>`; }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="hsl(${h % 360},40%,45%)"/>${shapes}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}
const stats = { fal: 0, together: 0, cloudflare: 0, pollinations: 0 }; let cfQuota = 12, falLimitEvery = 7, falCalls = 0;
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const raw = await body(req);
  const json = (code, o, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
  try {
    if (u.pathname === '/fal') { // returns {images:[{url}]}; every 7th call is rate limited
      if (++falCalls % falLimitEvery === 0) return json(429, { detail: 'slow down' }, { 'retry-after': '1' });
      stats.fal++; const j = JSON.parse(raw); if (!j.image_size || j.image_size.width !== 1200 || !/Key /.test(req.headers.authorization || '')) return json(400, { detail: 'bad request' });
      return json(200, { images: [{ url: `http://127.0.0.1:${server.address().port}/cdn/${j.seed}.jpg` }] });
    }
    if (u.pathname.startsWith('/cdn/')) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(await picture(u.pathname)); }
    if (u.pathname === '/together') { stats.together++; const j = JSON.parse(raw); if (j.response_format !== 'b64_json' || j.width !== 1200) return json(400, { error: 'bad' }); return json(200, { data: [{ b64_json: (await picture('t' + j.seed)).toString('base64') }] }); }
    if (u.pathname.includes('/ai/run/')) { // daily neuron allowance runs out after cfQuota images
      if (cfQuota-- <= 0) return json(429, { success: false, errors: [{ code: 4006, message: 'you have used up your daily free allocation of 10,000 neurons' }] });
      stats.cloudflare++; const j = JSON.parse(raw); return json(200, { success: true, result: { image: (await picture('c' + j.seed)).toString('base64') } });
    }
    if (u.pathname.startsWith('/pollinations/')) { stats.pollinations++; res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(await picture('p' + u.searchParams.get('seed'))); }
    res.writeHead(404); res.end('no');
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;

const run = (args, env, dir) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(ROOT, 'tools/images/generate.mjs'), ...args], { env: { ...process.env, FOODIE_ASSETS_DIR: dir, FOODIE_DATA_DIR: path.join(dir, '_d'), ...env }, cwd: ROOT });
  let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('close', (code) => resolve({ code, out }));
});
const ENV = { FAL_KEY: 'k', FAL_URL: base + '/fal', TOGETHER_API_KEY: 'k', TOGETHER_URL: base + '/together', TOGETHER_IMAGE_MODEL: 'black-forest-labs/FLUX.1-schnell',
  CF_ACCOUNT_ID: 'acct', CF_API_TOKEN: 't', CF_API_BASE: base, POLLINATIONS_URL: base + '/pollinations/', POLLINATIONS_API_KEY: '' };
const tmp = (s) => fs.mkdtempSync(path.join(os.tmpdir(), 'foodie-' + s + '-'));
const readManifest = (d) => JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8'));

{ // 1. auto: four lanes at once, Cloudflare runs out of quota part-way, fal gets rate-limited — and everything still finishes
  const d = tmp('auto'); const t0 = Date.now();
  const r = await run(['--limit', '90'], ENV, d); const m = readManifest(d);
  ok(r.code === 0, 'run exits 0'); ok(m.count === 90, `90 photos written (${m.count})`);
  ok(/Lanes: fal×8, together×6, cloudflare×3, pollinations×1/.test(r.out), 'auto starts every provider that has credentials');
  ok(stats.fal > 0 && stats.together > 0 && stats.cloudflare > 0 && stats.pollinations >= 1, `all lanes contributed (${JSON.stringify(stats)})`);
  ok(/cloudflare .*RETIRED: .*daily free allocation/.test(r.out), 'a spent daily quota retires just that lane');
  ok(stats.cloudflare <= 12 + 3, 'no lane keeps hammering after it is retired');
  ok(/rate-limit waits/.test(r.out) && /fal .* [1-9]\d* rate-limit waits/.test(r.out), 'fal rate limits were waited out, not counted as failures');
  const files = fs.readdirSync(path.join(d, 'f')).length, thumbs = fs.readdirSync(path.join(d, 't')).length;
  ok(files === 90 && thumbs === 90, 'one full + one thumbnail file per recipe');
  ok(Object.values(m.images).every((e) => e.s === 'ai' && e.a === 'AI-generated image' && /^[0-9a-f]{12}$/.test(e.f)), 'manifest entries have the fields the app reads');
  const sec = (Date.now() - t0) / 1000; ok(sec < 60, `90 photos in ${sec.toFixed(1)} s on stand-in servers`);
  const again = await run(['--limit', '5'], ENV, d); ok(readManifest(d).count === 95, 'resumable: a rerun adds new ones and never redoes finished recipes');
  fs.rmSync(d, { recursive: true, force: true });
}
{ // 2. every provider refused -> exit code 2, progress saved, REMAINING reported
  const d = tmp('dead'); cfQuota = 0;
  const r = await run(['--provider', 'cloudflare', '--limit', '10'], ENV, d);
  ok(r.code === 2 && /REMAINING=\d+/.test(r.out), 'all lanes refused -> exit 2 with REMAINING=n'); fs.rmSync(d, { recursive: true, force: true }); cfQuota = 1e9;
}
{ // 3. sharding: 3 shards run separately, merge into one manifest with no overlap and no loss
  const dirs = [0, 1, 2].map((i) => tmp('shard' + i)); const only = loadRecipes().slice(0, 45).map((r) => r.id).join(',');
  await Promise.all(dirs.map((d, i) => run(['--provider', 'fal', '--shard', `${i}/3`, '--only', only], ENV, d)));
  const sets = dirs.map((d) => new Set(Object.keys(readManifest(d).images)));
  ok(sets.every((s) => s.size === 15), 'each shard made its own 15 of 45'); ok(new Set(sets.flatMap((s) => [...s])).size === 45, 'shards are disjoint and complete');
  const root = tmp('merge'); dirs.forEach((d, i) => { const dst = path.join(root, 'shard' + i, 'assets/recipes'); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.cpSync(d, dst, { recursive: true }); });
  const target = tmp('target'); const r = mergeShards(root, { assetDir: target, manifestFile: path.join(target, 'manifest.json') });
  ok(r.added === 45 && r.total === 45 && fs.readdirSync(path.join(target, 'f')).length === 45, 'merge brings all 45 photos + files into one manifest');
  const r2 = mergeShards(root, { assetDir: target, manifestFile: path.join(target, 'manifest.json') }); ok(r2.added === 0, 'merge is idempotent');
  [...dirs, root, target].forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
}
server.close();
console.log(bad ? `\n${bad} FAILED` : '\nAll end-to-end generator tests passed'); process.exit(bad ? 1 : 0);
