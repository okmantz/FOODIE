// Search adapters. Each returns candidates in one normalised shape:
// { source, sid, title, tags[], categories[], creator, creatorUrl, license, licenseVersion, licenseUrl, landingUrl, downloadUrl, thumbUrl, width, height }
// Add Pexels/Pixabay/Unsplash here later by implementing the same `search(query, ctx)` signature.
import { getJson, request } from './http.mjs';

const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/** Map a free-text licence ("CC BY-SA 4.0", "Public domain", "CC0") to our code. Returns null for anything we will not use. */
export function parseLicense(text) {
  const s = String(text || '').toLowerCase().replace(/[_]/g, ' ').trim();
  if (!s) return null;
  if (/\b(nc|noncommercial|non-commercial|nd|noderiv|no-deriv|gfdl|fair use|all rights)\b/.test(s.replace(/by-sa/g, ''))) return null;
  if (/cc0|cc-zero|zero|publicdomaindedication/.test(s)) return { code: 'cc0', version: '1.0' };
  if (/public domain|^pd\b|pdm|no known copyright|pd-/.test(s)) return { code: 'pdm', version: '' };
  const m = s.match(/cc[ -]?by(?:[ -]sa)?[ -]?(\d\.\d)?/);
  if (m) return { code: /by[ -]sa/.test(m[0]) ? 'by-sa' : 'by', version: m[1] || '' };
  return null;
}

// ---------------------------------------------------------------- Openverse
let ovToken = null;
async function openverseAuth() {
  const id = process.env.OPENVERSE_CLIENT_ID, secret = process.env.OPENVERSE_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (ovToken && ovToken.exp > Date.now() + 60000) return ovToken.value;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret });
  const res = await request('https://api.openverse.org/v1/auth_tokens/token/', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const j = await res.json(); ovToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return ovToken.value;
}
export function normalizeOpenverse(r) {
  const lic = parseLicense(`cc ${r.license}`.replace('cc cc0', 'cc0').replace('cc pdm', 'public domain'));
  if (!lic) return null;
  return { source: 'openverse', sid: String(r.id), title: stripHtml(r.title), tags: (r.tags || []).map((t) => t.name).filter(Boolean), categories: [r.category].filter(Boolean),
    creator: stripHtml(r.creator || ''), creatorUrl: r.creator_url || '', license: lic.code, licenseVersion: r.license_version || lic.version, licenseUrl: r.license_url || '',
    landingUrl: r.foreign_landing_url || r.url, downloadUrl: r.url, thumbUrl: r.thumbnail || '', width: r.width || 0, height: r.height || 0, provider: r.provider || r.source || '' };
}
export async function searchOpenverse(query, ctx) {
  const lic = ctx.licenses.map((l) => ({ pdm: 'pdm', cc0: 'cc0', by: 'by', 'by-sa': 'by-sa' }[l])).join(',');
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license=${lic}&category=photograph&extension=jpg,jpeg,png&mature=false&page_size=20`;
  const tok = await openverseAuth();
  const j = await getJson(url, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
  return (j.results || []).map(normalizeOpenverse).filter(Boolean);
}

// ---------------------------------------------------------------- Wikimedia Commons
export function normalizeCommons(p) {
  const ii = p.imageinfo?.[0]; if (!ii) return null;
  if (!/^image\/(jpeg|png)$/.test(ii.mime || '')) return null;
  const md = ii.extmetadata || {}; const val = (k) => stripHtml(md[k]?.value);
  const lic = parseLicense(val('LicenseShortName') || val('UsageTerms')); if (!lic) return null;
  const title = stripHtml((p.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/[_]/g, ' '));
  const cats = val('Categories').split('|').map((c) => c.replace(/_/g, ' ')).filter(Boolean);
  const desc = val('ImageDescription');
  return { source: 'commons', sid: String(p.pageid), title: [title, val('ObjectName')].filter(Boolean).join(' — '), tags: desc ? [desc.slice(0, 200)] : [], categories: cats,
    creator: val('Artist'), creatorUrl: '', license: lic.code, licenseVersion: lic.version, licenseUrl: md.LicenseUrl?.value || '', landingUrl: ii.descriptionurl || '',
    downloadUrl: ii.thumburl || ii.url, thumbUrl: ii.thumburl || '', width: ii.width || 0, height: ii.height || 0, provider: 'wikimedia' };
}
export async function searchCommons(query, ctx) {
  const q = `${query} filetype:bitmap`;
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '20',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600', iiextmetadatafilter: 'LicenseShortName|UsageTerms|Artist|ImageDescription|Categories|ObjectName|LicenseUrl', origin: '*' });
  const j = await getJson(url);
  return Object.values(j.query?.pages || {}).map(normalizeCommons).filter(Boolean);
}

export const SOURCES = { openverse: searchOpenverse, commons: searchCommons };
