// Text-to-image providers. Each exposes { label, square, available(), generate(prompt, { seed, signal }) -> Buffer }.
// Errors carry .status (HTTP), .fatal (true = this provider is finished for the run: bad key, no credit, daily quota)
// and .rateLimited / .retryAfter (seconds) for "slow down" answers, which are waited out and never count as a failure.
//
// All FLUX.1-schnell based, so photos from different providers look like one shoot. Every endpoint can be pointed at a
// stand-in server with an env var (POLLINATIONS_URL, FAL_URL, TOGETHER_URL, CF_API_BASE, OPENAI_URL) for offline tests.
import { USER_AGENT } from './config.mjs';

export const W = 1200, H = 800;
const fail = (msg, status, fatal = false, retryAfter = 0) => Object.assign(new Error(msg), { status, fatal, retryAfter });

async function bytesOrThrow(res, what) {
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  const body = (await res.text().catch(() => '')).slice(0, 400).replace(/\s+/g, ' ');
  // Rate limits are "wait and retry", not failures. Pollinations answers its free-tier limit with HTTP 402 + FREE_LIMIT.
  const rateLimited = res.status === 429 || (res.status === 402 && /FREE_LIMIT|limit reached|retry after/i.test(body));
  // A spent daily allowance is not "slow down": it will not clear for hours, so the provider is retired for this run.
  const spent = /daily free allocation|used up your|insufficient (credit|balance)|exceeded your (current )?quota|out of credit|payment required/i.test(body);
  const fatal = spent || (!rateLimited && [401, 402, 403, 404].includes(res.status));
  const retryAfter = +res.headers.get('retry-after') || +((/retry after (\d+)\s*s/i.exec(body) || [])[1]) || 0;
  throw Object.assign(fail(`${what}: HTTP ${res.status} ${body}`, res.status, fatal, retryAfter), { rateLimited: rateLimited && !spent });
}
const isImage = (res) => /^image\//.test(res.headers.get('content-type') || '');
const env = (k, d = '') => (process.env[k] || d);

// ---- Pollinations (FLUX). Keyless = shared anonymous queue (slow); a free key from enter.pollinations.ai lifts that ----
const pollinations = {
  label: 'Pollinations (FLUX)', square: false,
  available: () => true, keyed: () => !!env('POLLINATIONS_API_KEY'),
  async generate(prompt, { seed, signal }) {
    const key = env('POLLINATIONS_API_KEY');
    const base = env('POLLINATIONS_URL') || (key ? 'https://gen.pollinations.ai/image/' : 'https://image.pollinations.ai/prompt/');
    const q = new URLSearchParams({ width: String(W), height: String(H), model: env('POLLINATIONS_MODEL', 'flux'), seed: String(seed), nologo: 'true', enhance: 'false', safe: 'true' });
    const headers = { 'User-Agent': USER_AGENT };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${base}${encodeURIComponent(prompt)}?${q}`, { headers, signal });
    const buf = await bytesOrThrow(res, 'pollinations');
    if (!isImage(res)) throw fail('pollinations: response was not an image', 502);
    return buf;
  },
};

// ---- fal.ai (FLUX.1 schnell; about $0.003 per image, ~1 s each, very high concurrency). Needs FAL_KEY ----
const fal = {
  label: 'fal.ai (FLUX.1 schnell)', square: false,
  available: () => !!env('FAL_KEY'),
  async generate(prompt, { seed, signal }) {
    const key = env('FAL_KEY'); if (!key) throw fail('fal: set FAL_KEY', 401, true);
    const res = await fetch(env('FAL_URL', 'https://fal.run/fal-ai/flux/schnell'), {
      method: 'POST', signal, headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ prompt, image_size: { width: W, height: H }, num_inference_steps: 4, num_images: 1, seed, enable_safety_checker: true, output_format: 'jpeg' }),
    });
    if (!res.ok) await bytesOrThrow(res, 'fal');
    const j = await res.json(); const url = j?.images?.[0]?.url;
    if (!url) throw fail('fal: no image in response', 502);
    if (url.startsWith('data:')) return Buffer.from(url.split(',')[1], 'base64');
    const img = await fetch(url, { signal, headers: { 'User-Agent': USER_AGENT } });
    return bytesOrThrow(img, 'fal download');
  },
};

// ---- Together AI (FLUX.1 schnell). The "-Free" model is rate-limited to about 10 images a minute; set
// TOGETHER_IMAGE_MODEL=black-forest-labs/FLUX.1-schnell for the paid, faster endpoint. Needs TOGETHER_API_KEY ----
const together = {
  label: 'Together AI (FLUX.1 schnell)', square: false,
  available: () => !!env('TOGETHER_API_KEY'),
  get free() { return /free/i.test(env('TOGETHER_IMAGE_MODEL', 'black-forest-labs/FLUX.1-schnell-Free')); },
  async generate(prompt, { seed, signal }) {
    const key = env('TOGETHER_API_KEY'); if (!key) throw fail('together: set TOGETHER_API_KEY', 401, true);
    const res = await fetch(env('TOGETHER_URL', 'https://api.together.xyz/v1/images/generations'), {
      method: 'POST', signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ model: env('TOGETHER_IMAGE_MODEL', 'black-forest-labs/FLUX.1-schnell-Free'), prompt, width: W, height: H, steps: 4, n: 1, seed, response_format: 'b64_json' }),
    });
    if (!res.ok) await bytesOrThrow(res, 'together');
    const j = await res.json(); const d = j?.data?.[0];
    if (d?.b64_json) return Buffer.from(d.b64_json, 'base64');
    if (d?.url) return bytesOrThrow(await fetch(d.url, { signal, headers: { 'User-Agent': USER_AGENT } }), 'together download');
    throw fail('together: no image in response', 502);
  },
};

// ---- Cloudflare Workers AI (FLUX.1 schnell, 1024x1024). 10,000 free neurons/day is roughly 170 images; paid is ~$0.0006 each ----
const cloudflare = {
  label: 'Cloudflare Workers AI (FLUX.1 schnell)', square: true,
  available: () => !!(env('CF_ACCOUNT_ID') && env('CF_API_TOKEN')),
  async generate(prompt, { seed, signal }) {
    const id = env('CF_ACCOUNT_ID'), tok = env('CF_API_TOKEN');
    if (!id || !tok) throw fail('cloudflare: set CF_ACCOUNT_ID and CF_API_TOKEN', 401, true);
    const base = env('CF_API_BASE', 'https://api.cloudflare.com/client/v4');
    const res = await fetch(`${base}/accounts/${id}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST', signal, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ prompt, steps: Math.min(8, +env('CF_STEPS', '4') || 4), seed }),
    });
    if (!res.ok) await bytesOrThrow(res, 'cloudflare');
    if (isImage(res)) return Buffer.from(await res.arrayBuffer());
    const j = await res.json(); const b64 = j?.result?.image || j?.image;
    if (!b64) throw fail('cloudflare: no image in response', 502);
    return Buffer.from(b64, 'base64');
  },
};

// ---- OpenAI Images (paid; best prompt-following; only used when named explicitly) ----
const openai = {
  label: 'OpenAI Images', square: false,
  available: () => !!env('OPENAI_API_KEY'),
  async generate(prompt, { signal }) {
    const key = env('OPENAI_API_KEY'); if (!key) throw fail('openai: set OPENAI_API_KEY', 401, true);
    const res = await fetch(env('OPENAI_URL', 'https://api.openai.com/v1/images/generations'), {
      method: 'POST', signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ model: env('OPENAI_IMAGE_MODEL', 'gpt-image-1-mini'), prompt, size: '1536x1024', quality: env('OPENAI_IMAGE_QUALITY', 'medium'), n: 1 }),
    });
    if (!res.ok) await bytesOrThrow(res, 'openai');
    const j = await res.json(); const b64 = j?.data?.[0]?.b64_json;
    if (!b64) throw fail('openai: no image in response', 502);
    return Buffer.from(b64, 'base64');
  },
};

// ---- Mock (tests only: draws a synthetic placeholder so the pipeline and UI can be exercised offline) ----
const mock = {
  label: 'mock (test only)', square: false, available: () => process.env.FOODIE_ALLOW_MOCK === '1',
  async generate(prompt, { seed }) {
    if (process.env.FOODIE_ALLOW_MOCK !== '1') throw fail('mock provider is for tests only', 400, true);
    const sharp = (await import('sharp')).default; const h = seed % 360;
    const name = (/Photograph of (.+?), an? /.exec(prompt) || [])[1] || 'dish';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="hsl(${h},55%,70%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},45%,32%)"/></radialGradient></defs><rect width="1200" height="800" fill="url(#g)"/>${Array.from({ length: 9 }, (_, i) => { const a = (seed * (i + 3) * 2654435761) >>> 0; return `<rect x="${a % 900}" y="${(a >> 8) % 600}" width="${150 + (a >> 4) % 300}" height="${100 + (a >> 12) % 300}" fill="hsl(${(a >> 3) % 360},60%,${25 + (a >> 6) % 50}%)"/>`; }).join('')}<circle cx="600" cy="400" r="270" fill="hsl(${h},20%,92%)"/><circle cx="600" cy="400" r="190" fill="hsl(${(h + 20) % 360},60%,55%)"/><text x="600" y="420" font-family="sans-serif" font-size="46" text-anchor="middle" fill="#fff">${name.replace(/[<&]/g, '').slice(0, 28)}</text></svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  },
};

export const PROVIDERS = { fal, together, cloudflare, pollinations, openai, mock };

/** Which lanes `--provider auto` runs side by side: every cheap/free provider that has credentials, plus Pollinations
 *  (keyless Pollinations is slow but costs nothing and never blocks the others). OpenAI is paid per image: name it explicitly. */
export const AUTO_ORDER = ['fal', 'together', 'cloudflare', 'pollinations'];

/** Starting speed of each lane. concurrency = requests in flight; gap = minimum ms between request starts. */
export function laneSettings(name) {
  switch (name) {
    case 'fal': return { concurrency: 8, gap: 0 };
    case 'together': return PROVIDERS.together.free ? { concurrency: 2, gap: 6500 } : { concurrency: 6, gap: 0 };   // free model: 10 images/min
    case 'cloudflare': return { concurrency: 3, gap: 0 };
    case 'openai': return { concurrency: 3, gap: 600 };
    case 'pollinations': return PROVIDERS.pollinations.keyed() ? { concurrency: 3, gap: 1500 } : { concurrency: 1, gap: 20000, adaptive: true, floor: 12000 };
    default: return { concurrency: 1, gap: 0 };
  }
}
