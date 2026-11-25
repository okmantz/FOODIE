// Small JSON state helpers (atomic writes so an interrupted run never corrupts state).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
export const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } };
export function writeJson(f, data, pretty = true) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 1 : 0) + '\n'); fs.renameSync(tmp, f);
}
export const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
export function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); if (v !== undefined) o[k] = v; else if (argv[i + 1] && !argv[i + 1].startsWith('--')) o[k] = argv[++i]; else o[k] = true; } else o._.push(a);
  }
  return o;
}
