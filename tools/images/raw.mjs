// Download (or reuse) the original file for a chosen candidate. Cached by URL so reruns never re-download.
import fs from 'node:fs'; import path from 'node:path';
import { CACHE_DIR } from './config.mjs';
import { getBuffer } from './http.mjs';
import { sha1 } from './store.mjs';
export async function downloadRaw(c) {
  const f = path.join(CACHE_DIR, 'raw', sha1(c.downloadUrl) + '.img');
  if (fs.existsSync(f) && fs.statSync(f).size > 5000) return f;
  const buf = await getBuffer(c.downloadUrl, { timeout: 90000 });
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return f;
}
