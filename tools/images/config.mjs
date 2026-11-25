// Shared settings for the recipe-photo pipeline. Everything is overridable by env for tests.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ASSET_DIR = process.env.FOODIE_ASSETS_DIR || path.join(REPO, 'assets/recipes');
export const DATA_DIR = process.env.FOODIE_DATA_DIR || path.join(REPO, 'tools/images/data');
export const CACHE_DIR = process.env.FOODIE_CACHE_DIR || path.join(REPO, 'tools/images/.cache');
export const MANUAL_DIR = process.env.FOODIE_MANUAL_DIR || path.join(REPO, 'tools/images/manual');
export const CREDITS_MD = process.env.FOODIE_CREDITS_MD || path.join(REPO, 'docs/IMAGE-CREDITS.md');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');
export const DECISIONS_FILE = path.join(DATA_DIR, 'decisions.json');
export const REPORT_FILE = path.join(DATA_DIR, 'report.json');
export const MANIFEST_FILE = path.join(ASSET_DIR, 'manifest.json');

export const USER_AGENT = 'FOODIE-image-pipeline/1.0 (https://github.com/okmantz/FOODIE; open-source recipe app)';

// Output: one 3:2 crop in two sizes. CSS object-fit handles the 4:3 card and 16:10 hero frames.
export const SIZES = { thumb: { w: 480, h: 320, q: 68 }, full: { w: 1200, h: 800, q: 72 } };
export const BUDGET_MB = 150; // verify warns above this

// Licences we will use. By default only CC0, public-domain marks and CC BY (attribution is recorded
// and shown in the app + docs/IMAGE-CREDITS.md). CC BY-SA is opt-in (--allow-sa) because adapted
// (cropped/resized) copies would have to stay BY-SA. NC/ND licences are never accepted.
export const LICENSES_DEFAULT = ['cc0', 'pdm', 'by'];
export const LICENSES_SA = ['cc0', 'pdm', 'by', 'by-sa'];
export const LICENSE_LABEL = { cc0: 'CC0 1.0', pdm: 'Public Domain', by: 'CC BY', 'by-sa': 'CC BY-SA' };

// Match thresholds (see match.mjs). AUTO is applied without a human; REVIEW goes to the review queue.
export const AUTO_SCORE = 0.78;
export const REVIEW_SCORE = 0.42;
export const MIN_W = 1000; export const MIN_H = 650;
export const MIN_ASPECT = 1.0; export const MAX_ASPECT = 2.1;
