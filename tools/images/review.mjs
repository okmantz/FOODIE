#!/usr/bin/env node
// Human review of uncertain matches.
//   node tools/images/review.mjs generate   -> tools/images/review/index.html (open in a browser, pick the right photo per recipe, click "Download decisions")
//   node tools/images/review.mjs apply      -> reads tools/images/data/decisions.json and promotes your picks (run build afterwards)
// decisions.json: { "<recipe-id>": 0..4 (candidate number) | -1 (none of these is right) }
import fs from 'node:fs'; import path from 'node:path';
import { STATE_FILE, DECISIONS_FILE, REPO } from './config.mjs';
import { loadRecipes } from './recipes.mjs';
import { readJson, writeJson, parseArgs } from './store.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cmd = process.argv[2]; const args = parseArgs(process.argv.slice(3));

if (cmd === 'generate') {
  const state = readJson(STATE_FILE, { recipes: {} }); const recipes = loadRecipes();
  const rev = recipes.filter((r) => state.recipes[r.id]?.status === 'review');
  const un = recipes.filter((r) => ['unmatched', 'rejected'].includes(state.recipes[r.id]?.status));
  const card = (r) => {
    const s = state.recipes[r.id];
    return `<section data-id="${esc(r.id)}"><h3>${esc(r.n)} <small>${esc(r.c)} · ${esc(r.t)}</small></h3><p class="ing">${esc(r.ing.slice(0, 8).join(', '))}</p><div class="row">
${s.candidates.map((c, i) => `<label class="cand"><input type="radio" name="${esc(r.id)}" value="${i}"><img loading="lazy" src="${esc(c.thumbUrl || c.downloadUrl)}" alt=""><b>${esc(c.title).slice(0, 90)}</b><span>${esc(c.license.toUpperCase())} · ${esc(c.creator).slice(0, 40)} · match ${c.score}${c.conflicts.length ? ' · differs: ' + esc(c.conflicts.join(',')) : ''}</span><a href="${esc(c.landingUrl)}" target="_blank" rel="noopener">source ↗</a></label>`).join('\n')}
<label class="cand none"><input type="radio" name="${esc(r.id)}" value="-1"><b>None of these is right</b></label></div></section>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><title>FOODIE photo review</title><style>
body{font:15px system-ui;margin:0;background:#f6f4ef;color:#222}header{position:sticky;top:0;background:#fff;padding:12px 20px;border-bottom:1px solid #ddd;z-index:2;display:flex;gap:16px;align-items:center}
main{padding:16px 20px;max-width:1300px;margin:auto}section{background:#fff;border:1px solid #e3ded3;border-radius:14px;padding:14px 16px;margin:14px 0}h3{margin:0 0 4px}h3 small{color:#777;font-weight:400}.ing{color:#777;margin:0 0 10px;font-size:13px}
.row{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.cand{display:flex;flex-direction:column;gap:4px;border:2px solid transparent;border-radius:10px;padding:6px;cursor:pointer;font-size:12px}.cand:has(input:checked){border-color:#4d9a1e;background:#f1f8ea}
.cand img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:8px;background:#ddd}.cand span{color:#666}.none{justify-content:center;min-height:60px}button{background:#4d9a1e;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-size:15px;cursor:pointer}
</style><header><b>FOODIE photo review</b><span id="n"></span><button id="dl">Download decisions.json</button><span>Save it as tools/images/data/decisions.json, then run <code>npm run images:apply</code></span></header><main>
${rev.length ? rev.map(card).join('\n') : '<p>Nothing to review.</p>'}
<h2>No suitable photo found (${un.length})</h2><p>Add your own photo as <code>tools/images/manual/&lt;recipe-id&gt;.jpg</code> (optionally credit it in manual/credits.json) and run <code>npm run images:build</code>.</p>
<ul>${un.map((r) => `<li>${esc(r.n)} <small>(${esc(r.id)})</small> — <a target="_blank" rel="noopener" href="https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(r.n + ' filetype:bitmap')}&ns6=1">search Commons</a></li>`).join('')}</ul></main>
<script>const K='foodie-review';const d=JSON.parse(localStorage.getItem(K)||'{}');const upd=()=>{localStorage.setItem(K,JSON.stringify(d));document.getElementById('n').textContent=Object.keys(d).length+' decided'};
document.querySelectorAll('input[type=radio]').forEach(i=>{if(d[i.name]==i.value)i.checked=true;i.onchange=()=>{d[i.name]=+i.value;upd()}});upd();
document.getElementById('dl').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,1)],{type:'application/json'}));a.download='decisions.json';a.click()}</script>`;
  const out = path.join(REPO, 'tools/images/review/index.html'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html);
  console.log(`Review sheet: ${out}  (${rev.length} recipes to review, ${un.length} without candidates)`);
} else if (cmd === 'apply') {
  const state = readJson(STATE_FILE, { recipes: {} }); const dec = readJson(DECISIONS_FILE, null);
  if (!dec) { console.error('No decisions file at ' + DECISIONS_FILE); process.exit(1); }
  let ok = 0, no = 0, skip = 0;
  for (const [id, n] of Object.entries(dec)) {
    const s = state.recipes[id]; if (!s || s.status !== 'review') { skip++; continue; }
    if (n === -1) { state.recipes[id] = { status: 'rejected', queries: s.queries, ts: new Date().toISOString().slice(0, 10), note: 'all candidates rejected in review' }; no++; }
    else if (s.candidates[n]) { state.recipes[id] = { status: 'accepted', via: 'review', candidate: s.candidates[n], queries: s.queries, ts: new Date().toISOString().slice(0, 10) }; ok++; }
    else skip++;
  }
  writeJson(STATE_FILE, state); console.log(`Applied: ${ok} approved, ${no} rejected, ${skip} skipped. Now run: npm run images:build`);
} else { console.error('usage: review.mjs generate|apply'); process.exit(1); }
