// Polite HTTP: per-host rate limit, retries with backoff, Retry-After support, response cache helpers.
import { USER_AGENT } from './config.mjs';
const last = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const MIN_GAP = { 'api.openverse.org': 700, 'commons.wikimedia.org': 400, default: 300 };

async function gate(url) {
  const host = new URL(url).host; const gap = MIN_GAP[host] ?? MIN_GAP.default;
  const wait = (last.get(host) || 0) + gap - Date.now(); last.set(host, Math.max(Date.now(), (last.get(host) || 0) + gap));
  if (wait > 0) await sleep(wait);
}

export async function request(url, { headers = {}, method = 'GET', body, tries = 5, timeout = 45000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    await gate(url);
    try {
      const res = await fetch(url, { method, body, headers: { 'User-Agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60000, 1500 * 2 ** i);
        lastErr = new Error(`HTTP ${res.status} ${url}`); lastErr.status = res.status;
        if (res.status === 429 && ra > 3600) { lastErr.fatal = true; throw lastErr; } // daily quota exhausted — stop, resume tomorrow
        await sleep(wait); continue;
      }
      if (!res.ok) { const e = new Error(`HTTP ${res.status} ${url}`); e.status = res.status; e.fatal = res.status === 401 || res.status === 403; throw e; }
      return res;
    } catch (e) { lastErr = e; if (e.fatal || (e.status && e.status < 500 && e.status !== 429)) throw e; await sleep(Math.min(30000, 1000 * 2 ** i)); }
  }
  throw lastErr;
}
export const getJson = async (url, opts) => (await request(url, opts)).json();
export const getBuffer = async (url, opts) => Buffer.from(await (await request(url, opts)).arrayBuffer());
