// Text-to-image providers. Each exposes { label, square, generate(prompt, { seed, signal }) -> Buffer }.
// Errors carry .status (HTTP) and .fatal (true = stop the whole run: bad key, no credit, quota exhausted).
import { USER_AGENT } from './config.mjs';

const fail = (msg, status, fatal = false, retryAfter = 0) => Object.assign(new Error(msg), { status, fatal, retryAfter });
async function bytesOrThrow(res, what) {
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  const body = (await res.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
  // Rate limits are "wait and retry", not failures. Pollinations answers its free-tier limit with HTTP 402 + FREE_LIMIT.
  const rateLimited = res.status === 429 || (res.status === 402 && /FREE_LIMIT|limit reached|retry after/i.test(body));
  const fatal = !rateLimited && [401, 402, 403].includes(res.status);
  const retryAfter = +res.headers.get('retry-after') || +((/retry after (\d+)\s*s/i.exec(body) || [])[1]) || 0;
  throw Object.assign(fail(`${what}: HTTP ${res.status} ${body}`, res.status, fatal, retryAfter), { rateLimited });
}

// ---- Pollinations (FLUX, no account needed for light use; an optional key raises limits) ----
const pollinations = {
  label: 'Pollinations (FLUX)', square: false,
  async generate(prompt, { seed, signal }) {
    const base = process.env.POLLINATIONS_URL || 'https://image.pollinations.ai/prompt/';
    const q = new URLSearchParams({ width: '1200', height: '800', model: process.env.POLLINATIONS_MODEL || 'flux', seed: String(seed), nologo: 'true', enhance: 'false', safe: 'true' });
    const headers = { 'User-Agent': USER_AGENT };
    if (process.env.POLLINATIONS_API_KEY) headers.Authorization = `Bearer ${process.env.POLLINATIONS_API_KEY}`;
    const res = await fetch(`${base}${encodeURIComponent(prompt)}?${q}`, { headers, signal });
    const buf = await bytesOrThrow(res, 'pollinations');
    if (!/^image\//.test(res.headers.get('content-type') || '')) throw fail('pollinations: response was not an image', 502);
    return buf;
  },
};

// ---- Cloudflare Workers AI (FLUX.1 schnell; free daily allowance on a free Cloudflare account) ----
const cloudflare = {
  label: 'Cloudflare Workers AI (FLUX.1 schnell)', square: true,
  async generate(prompt, { seed, signal }) {
    const id = process.env.CF_ACCOUNT_ID, tok = process.env.CF_API_TOKEN;
    if (!id || !tok) throw fail('cloudflare: set CF_ACCOUNT_ID and CF_API_TOKEN', 401, true);
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST', signal, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ prompt, steps: 8, seed }),
    });
    if (!res.ok) { await bytesOrThrow(res, 'cloudflare'); }
    const j = await res.json(); const b64 = j?.result?.image || j?.image;
    if (!b64) throw fail('cloudflare: no image in response', 502);
    return Buffer.from(b64, 'base64');
  },
};

// ---- OpenAI Images (paid; best prompt-following) ----
const openai = {
  label: 'OpenAI Images', square: false,
  async generate(prompt, { signal }) {
    const key = process.env.OPENAI_API_KEY; if (!key) throw fail('openai: set OPENAI_API_KEY', 401, true);
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini';
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ model, prompt, size: '1536x1024', quality: process.env.OPENAI_IMAGE_QUALITY || 'medium', n: 1 }),
    });
    if (!res.ok) { await bytesOrThrow(res, 'openai'); }
    const j = await res.json(); const b64 = j?.data?.[0]?.b64_json;
    if (!b64) throw fail('openai: no image in response', 502);
    return Buffer.from(b64, 'base64');
  },
};

// ---- Mock (tests only: draws a synthetic placeholder so the pipeline and UI can be exercised offline) ----
const mock = {
  label: 'mock (test only)', square: false,
  async generate(prompt, { seed }) {
    if (process.env.FOODIE_ALLOW_MOCK !== '1') throw fail('mock provider is for tests only', 400, true);
    const sharp = (await import('sharp')).default; const h = seed % 360;
    const name = (/Photograph of (.+?), an? /.exec(prompt) || [])[1] || 'dish';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="hsl(${h},55%,70%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},45%,32%)"/></radialGradient></defs><rect width="1200" height="800" fill="url(#g)"/>${Array.from({ length: 9 }, (_, i) => { const a = (seed * (i + 3) * 2654435761) >>> 0; return `<rect x="${a % 900}" y="${(a >> 8) % 600}" width="${150 + (a >> 4) % 300}" height="${100 + (a >> 12) % 300}" fill="hsl(${(a >> 3) % 360},60%,${25 + (a >> 6) % 50}%)"/>`; }).join('')}<circle cx="600" cy="400" r="270" fill="hsl(${h},20%,92%)"/><circle cx="600" cy="400" r="190" fill="hsl(${(h + 20) % 360},60%,55%)"/><text x="600" y="420" font-family="sans-serif" font-size="46" text-anchor="middle" fill="#fff">${name.replace(/[<&]/g, '').slice(0, 28)}</text></svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  },
};

export const PROVIDERS = { pollinations, cloudflare, openai, mock };
