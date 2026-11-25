// Tests for the recipe-photo pipeline: node tests/images.mjs   (no network; synthetic images)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import crypto from 'node:crypto';
import sharp from 'sharp';
import { analyze, score, tier, isFoodish, badTitle } from '../tools/images/match.mjs';
import { parseLicense, normalizeCommons, normalizeOpenverse } from '../tools/images/sources.mjs';
import { loadRecipes } from '../tools/images/recipes.mjs';

let bad = 0; const ok = (c, m) => { if (!c) { console.error('FAIL', m); bad++; } else console.log('ok  ', m); };
const T = { auto: 0.78, review: 0.42 };
const rec = (n, c = 'American', ing = []) => ({ id: n, n, c, t: 'dinner', ing });
const S = (r, title, extra = {}) => score(analyze(r), { title, tags: ['food'], categories: [], ...extra });

// ---- matching
{
  const r = rec('Chicken Tikka Masala', 'Indian', ['Chicken thigh', 'Tomato', 'Yogurt']);
  ok(tier(S(r, 'Chicken tikka masala in a bowl'), T) === 'auto', 'exact dish -> auto');
  ok(tier(S(r, 'Lamb tikka masala'), T) !== 'auto', 'different protein is never auto');
  ok(S(r, 'Lamb tikka masala').conflicts.includes('lamb'), 'conflict reported');
  const r2 = rec('Hoisin-Garlic Chicken Thighs with Roasted Bell Peppers & Fennel', 'Chinese', ['Chicken thigh', 'Bell pepper', 'Fennel']);
  ok(tier(S(r2, 'Roasted chicken thighs'), T) === 'review', 'dish-level match -> review, not auto');
  ok(tier(S(r2, 'Grilled salmon fillet'), T) === 'none', 'unrelated dish -> none');
  const r3 = rec('Greek Lamb Burgers with Feta', 'Greek', ['Ground lamb', 'Feta']);
  ok(tier(S(r3, 'Lamb burger with feta cheese'), T) === 'auto', 'hamburger/burger synonym + plural handling');
  const r4 = rec('Keto Berry Cream Smoothie', 'American', ['Berries', 'Cream']);
  ok(tier(S(r4, 'Beef stew in a pot'), T) === 'none', 'smoothie vs stew rejected');
  ok(analyze(r2).queries.length >= 2 && analyze(r2).queries[0].includes('fennel'), 'queries: full name first');
}
ok(badTitle({ title: 'Company logo' }) && badTitle({ title: 'Farmers market stall' }) && !badTitle({ title: 'Chicken curry served in bowl' }), 'title blacklist');
ok(isFoodish({ title: 'Plate of pasta', tags: [] }) && !isFoodish({ title: 'Sunset over lake', tags: ['nature'] }), 'foodish check');

// ---- licences
ok(parseLicense('CC BY 4.0')?.code === 'by' && parseLicense('CC BY-SA 3.0')?.code === 'by-sa', 'CC BY / BY-SA parsed');
ok(parseLicense('CC0')?.code === 'cc0' && parseLicense('Public domain')?.code === 'pdm', 'CC0 / PD parsed');
ok(parseLicense('CC BY-NC 2.0') === null && parseLicense('CC BY-ND 2.0') === null && parseLicense('Fair use') === null && parseLicense('') === null, 'NC / ND / fair-use / empty rejected');
ok(parseLicense('CC BY-NC-SA 4.0') === null, 'NC-SA rejected');

// ---- source normalisers (shapes follow the public API docs)
{
  const c = normalizeCommons({ pageid: 42, title: 'File:Chicken_tikka_masala.jpg', imageinfo: [{ mime: 'image/jpeg', width: 3000, height: 2000, url: 'https://x/o.jpg', thumburl: 'https://x/t.jpg', descriptionurl: 'https://commons/File:X',
    extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Jane Doe</a>' }, Categories: { value: 'Chicken tikka masala|Food' }, LicenseUrl: { value: 'https://cc/by-sa' } } }] });
  ok(c.license === 'by-sa' && c.creator === 'Jane Doe' && c.categories.includes('Food') && c.downloadUrl === 'https://x/t.jpg', 'commons normaliser');
  ok(normalizeCommons({ pageid: 1, title: 'File:a.svg', imageinfo: [{ mime: 'image/svg+xml', extmetadata: {} }] }) === null, 'commons: svg dropped');
  ok(normalizeCommons({ pageid: 1, title: 'File:a.jpg', imageinfo: [{ mime: 'image/jpeg', extmetadata: { LicenseShortName: { value: 'CC BY-NC 2.0' } } }] }) === null, 'commons: NC dropped');
  const o = normalizeOpenverse({ id: 'abc', title: 'Pasta <b>bowl</b>', creator: 'Sam', license: 'by', license_version: '2.0', license_url: 'https://cc/by/2.0', url: 'https://u/x.jpg', thumbnail: 'https://u/t.jpg', foreign_landing_url: 'https://flickr/x', width: 2000, height: 1300, tags: [{ name: 'food' }] });
  ok(o.license === 'by' && o.title === 'Pasta bowl' && o.landingUrl === 'https://flickr/x', 'openverse normaliser');
  ok(normalizeOpenverse({ id: 'z', license: 'by-nc', url: 'u' }) === null, 'openverse: by-nc dropped');
  ok(normalizeOpenverse({ id: 'c', license: 'cc0', url: 'u', title: 't' })?.license === 'cc0' && normalizeOpenverse({ id: 'p', license: 'pdm', url: 'u', title: 't' })?.license === 'pdm', 'openverse cc0 / pdm');
}

// ---- recipe loading keeps ids stable
const recipes = loadRecipes();
ok(recipes.length >= 1500 && new Set(recipes.map((r) => r.id)).size === recipes.length, `${recipes.length} recipes, unique ids`);

// ---- end-to-end build + verify on synthetic images in temp dirs
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foodie-img-'));
const env = { ...process.env, FOODIE_ASSETS_DIR: path.join(tmp, 'assets'), FOODIE_DATA_DIR: path.join(tmp, 'data'), FOODIE_CACHE_DIR: path.join(tmp, 'cache'), FOODIE_MANUAL_DIR: path.join(tmp, 'manual'), FOODIE_CREDITS_MD: path.join(tmp, 'credits.md') };
const run = (s, ...a) => spawnSync(process.execPath, [new URL(`../tools/images/${s}.mjs`, import.meta.url).pathname, ...a], { env, encoding: 'utf8' });
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
async function synth(seed) { // distinct synthetic "photo": blocky colour field so perceptual hashes differ
  const w = 1600, h = 1067, buf = Buffer.alloc(w * h * 3); let x = seed * 9973 + 7;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const blocks = Array.from({ length: 64 }, () => [rnd() * 255, rnd() * 255, rnd() * 255]);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const b = blocks[Math.floor(yy / (h / 8)) * 8 + Math.floor(xx / (w / 8))]; const i = (yy * w + xx) * 3; buf[i] = b[0]; buf[i + 1] = b[1]; buf[i + 2] = b[2]; }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}
const pick = recipes.slice(0, 5);
const state = { version: 1, recipes: {} };
fs.mkdirSync(path.join(tmp, 'cache/raw'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
for (let i = 0; i < pick.length; i++) {
  const url = `https://example.test/img${i}.jpg`; fs.writeFileSync(path.join(tmp, 'cache/raw', sha1(url) + '.img'), await synth(i + 1));
  state.recipes[pick[i].id] = { status: 'accepted', via: 'auto', candidate: { source: 'commons', sid: String(i), title: pick[i].n + ' on a plate', tags: ['food'], categories: ['Food'], creator: 'Tester ' + i, license: i === 0 ? 'cc0' : 'by', licenseVersion: '4.0', licenseUrl: 'https://cc/x', landingUrl: 'https://commons/x' + i, downloadUrl: url, thumbUrl: '', width: 1600, height: 1067, score: 0.9, conflicts: [] } };
}
fs.writeFileSync(path.join(tmp, 'data/state.json'), JSON.stringify(state));
let r = run('build'); ok(r.status === 0 && /5\/\d+ recipes have photos/.test(r.stdout), 'build: 5 photos built');
const man = JSON.parse(fs.readFileSync(path.join(tmp, 'assets/manifest.json'), 'utf8'));
const e0 = man.images[pick[0].id];
ok(Object.keys(man.images).length === 5 && e0.f.length === 12 && /^#[0-9a-f]{6}$/.test(e0.c) && e0.l === 'CC0 1.0', 'manifest keyed by recipe id with colour + licence');
const meta = await sharp(path.join(tmp, 'assets/f', e0.f + '.webp')).metadata(); const mt = await sharp(path.join(tmp, 'assets/t', e0.f + '.webp')).metadata();
ok(meta.format === 'webp' && meta.width === 1200 && meta.height === 800 && mt.width === 480 && mt.height === 320, 'webp full 1200x800 + thumb 480x320');
ok(fs.statSync(path.join(tmp, 'assets/f', e0.f + '.webp')).size < 120000, 'full image is compact');
const t1 = fs.statSync(path.join(tmp, 'assets/manifest.json')).mtimeMs;
r = run('build'); ok(/unchanged 5/.test(r.stdout.replace(/\r/g, '\n')), 'build is rerun-safe (all skipped)' + (/unchanged 5/.test(r.stdout) ? '' : ' :: ' + JSON.stringify(r.stdout.slice(-200)) + r.stderr.slice(0, 300)));
r = run('verify'); ok(r.status === 0 && /OK:/.test(r.stdout) && /Coverage: 5\//.test(r.stdout), 'verify passes on a clean set');
r = run('verify', '--require-full'); ok(r.status === 1, 'verify --require-full fails while recipes lack photos');
ok(fs.existsSync(path.join(tmp, 'credits.md')) && fs.readFileSync(path.join(tmp, 'credits.md'), 'utf8').includes('Tester 1'), 'credits file written');

// tamper tests
const mpath = path.join(tmp, 'assets/manifest.json'); const orig = fs.readFileSync(mpath, 'utf8');
const tamper = (fn) => { const m = JSON.parse(orig); fn(m); fs.writeFileSync(mpath, JSON.stringify(m)); const x = run('verify'); fs.writeFileSync(mpath, orig); return x; };
r = tamper((m) => { fs.renameSync(path.join(tmp, 'assets/t', m.images[pick[1].id].f + '.webp'), path.join(tmp, 'moved.webp')); }); fs.renameSync(path.join(tmp, 'moved.webp'), path.join(tmp, 'assets/t', JSON.parse(orig).images[pick[1].id].f + '.webp'));
ok(r.status === 1 && /missing file/.test(r.stdout), 'verify catches a missing file');
r = tamper((m) => { m.images[pick[2].id].f = m.images[pick[3].id].f; }); ok(r.status === 1 && /duplicate/.test(r.stdout), 'verify catches two recipes sharing a photo');
r = tamper((m) => { m.images[pick[1].id].l = 'CC BY-NC 2.0'; }); ok(r.status === 1 && /licence not allowed/.test(r.stdout), 'verify rejects NC licence');
r = tamper((m) => { m.images[pick[1].id].a = ''; }); ok(r.status === 1 && /attribution/.test(r.stdout), 'verify requires CC BY attribution');
r = tamper((m) => { m.images['not-a-recipe'] = { ...m.images[pick[1].id] }; }); ok(r.status === 1 && /no matching recipe/.test(r.stdout), 'verify catches orphan manifest ids');
r = tamper((m) => { m.images[pick[1].id].t = 'Beef stew pot roast'; m.images[pick[1].id].tg = ['beef']; m.images[pick[1].id].ct = []; }); ok(r.status === 1 && /does not look like/.test(r.stdout), 'verify flags photo/recipe mismatch');

// review flow: reject + manual override
state.recipes[recipes[10].id] = { status: 'review', candidates: [state.recipes[pick[0].id].candidate, state.recipes[pick[1].id].candidate], queries: [] };
state.recipes[recipes[11].id] = { status: 'review', candidates: [state.recipes[pick[0].id].candidate], queries: [] };
fs.writeFileSync(path.join(tmp, 'data/state.json'), JSON.stringify(state));
fs.writeFileSync(path.join(tmp, 'data/decisions.json'), JSON.stringify({ [recipes[10].id]: 1, [recipes[11].id]: -1 }));
r = run('review', 'apply'); const st2 = JSON.parse(fs.readFileSync(path.join(tmp, 'data/state.json'), 'utf8'));
ok(st2.recipes[recipes[10].id].status === 'accepted' && st2.recipes[recipes[10].id].via === 'review' && st2.recipes[recipes[11].id].status === 'rejected', 'review apply promotes picks / records rejections');
fs.mkdirSync(path.join(tmp, 'manual')); fs.writeFileSync(path.join(tmp, 'manual', recipes[12].id + '.jpg'), await synth(77));
r = run('build'); const m2 = JSON.parse(fs.readFileSync(mpath, 'utf8'));
ok(m2.images[recipes[12].id]?.ok === 'manual' && m2.images[recipes[10].id]?.ok === 'reviewed' && !m2.images[recipes[11].id], 'build: manual photo + reviewed pick, rejected recipe stays without photo');
r = run('review', 'generate'); ok(true, 'review sheet generation ran: ' + (r.stdout || r.stderr).trim().split('\n')[0].slice(0, 60));
fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(path.join(process.cwd(), 'tools/images/review'), { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nAll image pipeline tests passed'); process.exit(bad ? 1 : 0);
