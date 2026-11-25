#!/usr/bin/env node
// One-command pipeline:  npm run images  [-- --limit 200]   (acquire -> build -> verify). Re-run any time; finished work is skipped.
import { spawnSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)); const rest = process.argv.slice(2);
for (const [step, extra] of [['acquire', rest], ['build', []], ['verify', []]]) {
  console.log(`\n== ${step} ==`); const r = spawnSync(process.execPath, [path.join(dir, step + '.mjs'), ...extra], { stdio: 'inherit' });
  if (r.status && step !== 'verify') process.exit(r.status);
  if (step === 'verify') process.exit(r.status || 0);
}
