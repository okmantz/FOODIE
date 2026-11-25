// Scheduler tests (no network, no sharp): fast lanes get more work, rate limits and dead lanes don't stall the run,
// every item is finished exactly once, shards never overlap.
import { makeLane, runPool, shardOf } from '../tools/images/pool.mjs';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: 'r' + i }));
const collect = () => { const got = new Map(); return { got, onResult: (it, res, lane) => { got.set(it.id, [...(got.get(it.id) || []), lane.name]); } }; };

{ // 1. two lanes share one queue; the faster lane does more; nothing is done twice
  const { got, onResult } = collect();
  const lanes = [makeLane('fast', { concurrency: 6 }), makeLane('slow', { concurrency: 1, gap: 40 })];
  const t0 = Date.now();
  const r = await runPool({ items: items(120), lanes, onResult, work: async (it, l) => { await sleep(l.name === 'fast' ? 5 : 30); return 1; } });
  ok(got.size === 120 && [...got.values()].every((v) => v.length === 1), 'every item finished exactly once across lanes');
  ok(lanes[0].done > lanes[1].done * 3 && lanes[1].done > 0, `faster lane does most of the work but the slow lane still contributes (${lanes[0].done} vs ${lanes[1].done})`);
  ok(!r.stop && !r.remaining.length, 'clean finish'); ok(Date.now() - t0 < 2500, 'finishes quickly');
}
{ // 2. a gap of 50 ms between starts is respected per lane
  const starts = []; const lane = makeLane('g', { concurrency: 4, gap: 50 });
  await runPool({ items: items(8), lanes: [lane], onResult() {}, work: async () => { starts.push(Date.now()); } });
  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  ok(gaps.every((g) => g >= 45), `lane gap respected (min ${Math.min(...gaps)} ms)`);
}
{ // 3. rate limit on one lane: item returns to the queue, other lane finishes it, the limited lane cools down and recovers
  const { got, onResult } = collect(); let hits = 0;
  const lanes = [makeLane('a', { concurrency: 3 }), makeLane('b', { concurrency: 3 })];
  const r = await runPool({ items: items(40), lanes, onResult, work: async (it, l) => { await sleep(l.name === 'a' ? 3 : 25); if (l.name === 'a' && ++hits <= 4) throw Object.assign(new Error('429'), { rateLimited: true, retryAfter: 0.05 }); return 1; } });
  ok(got.size === 40 && !r.gaveUp.length, 'rate-limited requests are retried, nothing lost, no attempts burned');
  ok(lanes[0].limited === 4, 'rate-limit waits are counted separately from failures');
}
{ // 4. one lane runs out of quota (fatal): it is retired, the other lane finishes everything
  const { got, onResult } = collect();
  const lanes = [makeLane('dead', { concurrency: 3 }), makeLane('ok', { concurrency: 2 })];
  const r = await runPool({ items: items(30), lanes, onResult, work: async (it, l) => { await sleep(2); if (l.name === 'dead') throw Object.assign(new Error('daily allowance used up'), { fatal: true }); return 1; } });
  ok(got.size === 30 && lanes[0].dead && !lanes[1].dead && !r.stalled, 'fatal lane retired, run completes on the other lane');
}
{ // 5. every lane fatal -> stalled with the remaining items reported (exit code 2 upstream)
  const lanes = [makeLane('x', { concurrency: 2 }), makeLane('y', { concurrency: 2 })];
  const r = await runPool({ items: items(10), lanes, onResult() {}, work: async () => { throw Object.assign(new Error('bad key'), { fatal: true }); } });
  ok(r.stalled && r.remaining.length === 10, 'all providers refused -> stalled, nothing silently dropped');
}
{ // 6. ordinary failures: retried up to maxTries then reported, with the attempt number passed to work (for a new seed)
  const seen = []; const lane = makeLane('f', { concurrency: 2 });
  const r = await runPool({ items: items(3), lanes: [lane], maxTries: 3, onResult() {}, work: async (it, l, attempt) => { seen.push(attempt); throw new Error('blank image'); } });
  ok(r.gaveUp.length === 3 && Math.max(...seen) === 2, 'failures retry with a fresh attempt number then give up cleanly');
}
{ // 7. a slow keyless lane stands down at the tail so it cannot hold up the final items
  const { got, onResult } = collect(); const t0 = Date.now();
  const lanes = [makeLane('fast', { concurrency: 4 }), makeLane('anon', { concurrency: 1, gap: 12000 })];
  await runPool({ items: items(10), lanes, onResult, work: async (it, l) => { await sleep(l.name === 'anon' ? 2000 : 5); return 1; } });
  ok(got.size === 10 && Date.now() - t0 < 1500, 'slow lane does not hoard the last items');
}
{ // 8. adaptive lane learns a longer gap from retry-after and speeds back up on success
  const lane = makeLane('p', { concurrency: 1, gap: 100, adaptive: true, floor: 40 }); let n = 0;
  await runPool({ items: items(14), lanes: [lane], onResult() {}, work: async () => { if (++n === 2) throw Object.assign(new Error('402'), { rateLimited: true, retryAfter: 0.3 }); } });
  ok(lane.limited === 1 && lane.gap > 100 && lane.gap < 800 && lane.gap >= 40, `adaptive gap learned (800 ms) then relaxed (now ${lane.gap} ms)`);
}
{ // 9. deadline stops pulling new work
  const r = await runPool({ items: items(100), lanes: [makeLane('d', { concurrency: 2 })], deadline: Date.now() + 80, onResult() {}, work: async () => { await sleep(20); } });
  ok(r.stop === 'time budget reached' && r.remaining.length > 0, 'time budget stops the run cleanly');
}
{ // 10. shards: disjoint, complete, stable
  const all = items(101); const parts = [0, 1, 2, 3, 4, 5].map((i) => shardOf(all, `${i}/6`));
  const ids = parts.flat().map((x) => x.id);
  ok(ids.length === 101 && new Set(ids).size === 101, '6 shards partition the list with no overlap');
  ok(shardOf(all, null) === all, 'no --shard = everything');
  let threw = false; try { shardOf(all, '6/6'); } catch { threw = true; } ok(threw, 'bad shard spec is rejected');
}
console.log(bad ? `\n${bad} FAILED` : '\nAll pool tests passed'); process.exit(bad ? 1 : 0);
