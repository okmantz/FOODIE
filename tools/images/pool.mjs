// Work scheduler for photo generation: several provider "lanes" pull from ONE shared queue, so the run goes as fast as
// all of them together instead of at the speed of the slowest. Pure scheduling (no I/O, no sharp) so it is unit-tested
// with fake providers in tests/pool.mjs.
//
//   lane   = { name, concurrency, gap (ms between request starts), adaptive?, floor? }
//   work   = async (item, lane, attempt) => result      throws Error with .fatal / .rateLimited / .retryAfter (s) / .reject
//
// Rules
//  * A lane waits for its own rate gap BEFORE taking an item, so a slow lane never sits on work a fast lane could do.
//  * Rate-limited -> the item goes straight back to the front of the queue (no attempt used), only that lane cools down.
//  * Fatal (bad key, spent daily quota) -> only that lane is retired; the others carry on.
//  * Other errors / rejected pictures -> one attempt used, item goes to the back of the queue (any lane may retry it).
//  * Anonymous-style slow lanes (gap >= 10 s) stand down near the end of the queue so they cannot hold up the last items.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeLane(name, { concurrency = 1, gap = 0, adaptive = false, floor = 0 } = {}) {
  return { name, concurrency, gap, baseGap: gap, adaptive, floor: floor || 0, nextStart: 0, cooldownUntil: 0, dead: null, done: 0, failed: 0, limited: 0, streak: 0, busy: 0, ms: 0 };
}

export async function runPool({ items, lanes, work, onResult, maxTries = 4, deadline = Infinity, log = () => {}, pollMs = 150 }) {
  const queue = items.slice(); const tries = new Map(); const gaveUp = []; let inflight = 0; let stop = null;
  const live = () => lanes.filter((l) => !l.dead);

  async function worker(lane) {
    while (!stop && !lane.dead) {
      if (Date.now() > deadline) { stop = 'time budget reached'; return; }
      if (!queue.length) { if (!inflight) return; await sleep(pollMs); continue; }
      const wait = Math.max(lane.cooldownUntil, lane.nextStart) - Date.now();
      if (wait > 0) { await sleep(Math.min(wait, 500)); continue; }
      if (lane.gap >= 10000) { // slow lane: leave the tail of the queue to the fast lanes
        const fast = live().filter((l) => l !== lane && l.gap < 10000);
        if (fast.length && queue.length <= 2 * fast.reduce((n, l) => n + l.concurrency, 0)) { await sleep(500); continue; }
      }
      lane.nextStart = Date.now() + lane.gap;
      const item = queue.shift(); if (!item) continue;
      const attempt = tries.get(item) || 0; inflight++; lane.busy++; const t0 = Date.now();
      try {
        const res = await work(item, lane, attempt);
        lane.done++; lane.ms += Date.now() - t0; lane.streak++;
        if (lane.adaptive && lane.streak >= 6 && lane.gap > lane.floor) { lane.gap = Math.max(lane.floor, Math.round(lane.gap * 0.85)); lane.streak = 0; }
        onResult(item, res, lane);
      } catch (e) {
        lane.streak = 0;
        if (e.fatal) {
          lane.dead = e.message || 'provider refused'; queue.unshift(item); log(`lane ${lane.name} retired: ${lane.dead}`);
        } else if (e.rateLimited) {
          lane.limited++; queue.unshift(item);
          const ra = (e.retryAfter || 0) * 1000;
          lane.cooldownUntil = Date.now() + (ra || (lane.adaptive ? lane.gap : 4000));
          if (lane.adaptive) lane.gap = Math.max(lane.gap, ra + 500);           // learn the real limit
          if (lane.limited > 60 && !lane.done) { lane.dead = 'rate limited on every request'; log(`lane ${lane.name} retired: ${lane.dead}`); }
        } else {
          lane.failed++; const n = attempt + 1; tries.set(item, n);
          if (n >= maxTries) gaveUp.push({ item, why: e.message }); else queue.push(item);
          lane.cooldownUntil = Date.now() + Math.min(8000, 800 * n);            // brief breather after an error
        }
      } finally { inflight--; lane.busy--; }
    }
  }

  const tasks = [];
  for (const lane of lanes) for (let i = 0; i < lane.concurrency; i++) tasks.push(worker(lane));
  await Promise.all(tasks);
  const stalled = !stop && queue.length > 0 && !live().length;
  return { remaining: queue.slice(), gaveUp, stop: stop || (stalled ? 'every provider was refused' : null), stalled };
}

/** Which items belong to shard `i` of `n` (0-based): a stable round-robin so shards never overlap. */
export function shardOf(items, spec) {
  if (!spec) return items;
  const m = /^(\d+)\/(\d+)$/.exec(String(spec)); if (!m) throw new Error(`bad --shard "${spec}" (use i/n, e.g. 0/6)`);
  const i = +m[1], n = +m[2]; if (!(n >= 1 && i >= 0 && i < n)) throw new Error(`bad --shard "${spec}"`);
  return items.filter((_, k) => k % n === i);
}
