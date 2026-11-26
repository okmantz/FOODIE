# FOODIE 3.0 — a ground-up redesign

A new look and a friendlier flow across the whole app. No data, engine or storage changes: your plans, recipes and settings carry over untouched.

- **New design system** (`css/styles.css`, rewritten): warm paper canvas, deep-green brand, serif headlines, softer layered depth, consistent radii/spacing/type scale, refined dark mode, bigger tap targets, custom checkboxes and selects, bottom-sheet dialogs with a grab handle.
- **App shell** (`js/app.js`): desktop sidebar is grouped (Kitchen / Explore) with an active-page marker and your profile at the bottom; mobile bottom bar uses a pill indicator; the Coach is a labelled button instead of an unexplained circle; the duplicate avatar bar is gone.
- **First-run onboarding** is now a 3-step full-screen flow (about you → how you eat → location & start) instead of one long form.
- **Home** (`js/views/dashboard.js`): compact greeting, one-tap quick actions, a today's-meals card with a progress ring and big check buttons, and icon stat cards.
- **Recipes** (`js/views/recipes.js`): sticky search with a Filters button (shows how many filters are active) and one-tap Clear filters; cleaner detail page (4 key facts, servings stepper, tidier action row).
- **Recipe cards** (`js/ui.js`): the heart is now an outline until you save a recipe (before, every card looked already saved).
- **Grocery** (`js/views/grocery.js`): a single compact summary card with a progress bar, so the list is on screen first; icon-only Qty/Find chips on phones.
- **Planner** (`js/views/planner.js`): labelled wizard steps. **Fix:** after "Generate my plan" the new plan now appears immediately (the wizard used to stay on screen).
- `js/lib/icons.js`: more icons (arrows, sliders, shield, …) and `← → ⋯ ⇄ ✎` now render as matching line icons.
- `sw.js` → `foodie-v3.0.0`; `index.html` / `manifest.webmanifest`: light/dark browser-bar colours; `tests/*.py`: updated for the new onboarding.

# FOODIE 2.3 — 2,000+ recipes and fast photos

- **443 new world-cuisine recipes (2,018 total).** Vietnamese, Filipino, Indonesian, Malaysian, Taiwanese, Pakistani, Sri Lankan, Turkish, Persian, Israeli, Moroccan, Ethiopian, West/East/South African, Peruvian, Brazilian, Argentinian, Colombian, Venezuelan, Cuban, Caribbean, Spanish, Portuguese, German, Eastern European, Georgian, British, Scandinavian, Hawaiian, Cajun and more, plus new Japanese, Korean, Chinese, Indian, Mexican, Italian, French and Greek dishes. Every one is easy (at most 16 ingredients, 90 minutes), breakfast through dessert and smoothies. New cuisines and their flavor profiles are wired into the app.
- `tools/world/` (new): one-line-per-recipe authoring files and a validating builder (`npm run recipes:world`) that writes `js/data/recipes-world.js`.
- 41 new ingredients in `js/data/ingredients.js` (nutrition values are estimates; see `docs/INGREDIENT-VERIFICATION.md`).
- **Photos in minutes, not hours.** `tools/images/providers.mjs` + `pool.mjs` (new): parallel provider lanes (fal, Together, Cloudflare, Pollinations, optional OpenAI) share one queue with per-lane rate limits, retry, cooldown and automatic lane retirement. `generate.mjs` supports `--shard i/n`; `merge.mjs` combines shards.
- `.github/workflows/recipe-photos.yml`: now plan, then a matrix of parallel shards, then one merge commit. Self-continues until done.
- `tests/pool.mjs`, `tests/generate-e2e.mjs` (new), `tests/unit.mjs` (expects 2,000+). `sw.js` → `foodie-v2.3.0`.

# FOODIE 2.2 — a photo for every recipe

- `tools/images/generate.mjs`, `prompt.mjs`, `providers.mjs` (new): creates one matching, consistently styled photo per recipe from its own name / cuisine / ingredients (Pollinations, Cloudflare Workers AI or OpenAI); quality gate + de-duplication; resumable; writes the same WebP + manifest the app already uses. `npm run images:generate`.
- `.github/workflows/recipe-photos.yml` (new): one-click, self-continuing **Actions → Generate recipe photos** that generates everything in GitHub's cloud and commits in batches. Manual trigger only; Pages deploy is unchanged.
- `js/lib/images.js`: AI-generated photos are labelled honestly on the recipe page.
- `tools/images/build.mjs`: no longer prunes AI-generated manifest entries.
- `css/styles.css`: the white "ball" behind placeholder emoji (it looked like a grey sphere in dark mode) is now a soft glow; recipe cards use the photos' 3:2 shape so the whole picture shows and more cards fit per screen; hairline edge on photos.
- `tests/generate.mjs` (new), `docs/IMAGE-PIPELINE.md`, `sw.js` → `foodie-v2.2.0`.

# FOODIE 2.1 — recipe photography

Adds real photographs to recipes (pipeline + app integration). **No photos are bundled yet** — run `npm run images` (see README → Recipe photos); until then every recipe keeps its emoji tile, so nothing changes visually.

- `tools/images/` (new): resumable acquire → optimise → manifest → verify pipeline; Wikimedia Commons + Openverse; CC0 / public domain / CC BY only (CC BY-SA opt-in); relevance scoring with a review queue instead of guessing.
- `assets/recipes/manifest.json` (new): recipe id → image, colour placeholder, source, photographer, licence.
- `js/lib/images.js` (new) + `js/ui.js` `thumb()`: photos on cards, lists, plan, favourites, dashboard and recipe pages; lazy loading, responsive hero (`srcset`), fade-in over a tinted placeholder, hover zoom, graceful emoji fallback; attribution under the hero photo.
- `sw.js`: separate immutable cache for photos (cache-first, capped at 800, survives app-version bumps) so viewed photos work offline. `VERSION` → `foodie-v2.1.0`.
- `tests/images.mjs`, `npm run images:verify`: pipeline tests and the coverage/duplicate/licence/mismatch verifier.

# FOODIE 2.0 — what changed

Paste the contents of this zip over the repo root (keep folder structure), commit, push. GitHub Pages needs no build.

## Location (always current)
- `js/lib/location.js` (new): live GPS via watchPosition + refresh on app focus, manual ZIP/city fallback, reverse geocoding, hemisphere + units set automatically.
- `js/engines/places.js` (new): real restaurants, cafes and grocery stores from OpenStreetMap near you (progressive radius, cached, 3 mirrors), opening-hours parsing ("open now / closes at…").
- `js/views/locationui.js` (new): location bar used in onboarding, Discover and Profile.

## Restaurants right after the quiz
- Quiz applies instantly; the final screen shows the best nearby matches, ranked by taste, open status, diet, distance and time of day. Retaking the quiz replaces the old taste weights instead of stacking.
- Fictional sample restaurants are gone; only real nearby places are shown.

## UI
- `js/lib/icons.js` (new): one SVG icon set; UI emoji (thumbs-up, hearts, cart, pin…) swap to icons automatically. Food emoji stay as recipe art.
- `css/styles.css`: calmer palette, hairline borders, refined buttons/cards/nav, mobile fixes (no iOS zoom on inputs, 2-column grids, safe areas).

## Accuracy
- Whole-word dislike matching with synonym groups; seasonal picks use the plan date and your hemisphere.
- Calorie/protein targets normalised across the meals actually planned; calorie estimate from body stats (Mifflin-St Jeor) if you don't set a number.
- Expired pantry items no longer count; prices = store tier × your local price adjustment (Profile slider).
- Grocery: shows chains actually near you and lets you switch to one in a tap.

## Recipes: 528 → 1,575
- `js/data/recipes-more.js` (generated, 1,047 recipes) merged in `js/engines/nutrition.js`.
- `tools/` holds the generator. Every recipe is validated against the ingredient DB (kcal range, protein, cost, steps) and food-safety temperatures.
- `node tests/unit.mjs` checks counts, unique ids/names, ingredients and the new logic.

Service worker bumped to `foodie-v2.0.0` so installed copies update.
