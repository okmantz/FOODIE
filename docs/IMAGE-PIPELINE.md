# Recipe photo pipeline

How FOODIE gets a genuinely relevant, legally usable photograph onto each recipe — and what to do when it can't.

## Fastest route: generate a matching photo for every recipe (v2.2)

Stock-photo search can never match generated dishes like "Cajun Trout with Zucchini & Farro", so v2.2 adds a generator that **creates one photo per recipe from its own name, cuisine and ingredients**, in one consistent studio style (same light, angle and surface), so all 1,575 look like a single shoot. Results are quality-gated (blank / tiny / badly exposed images and near-duplicates are re-rolled) and written in the same WebP + manifest format as everything else. The recipe page labels these "AI-generated image of this dish".

**No computer needed:** GitHub repo → **Actions → Generate recipe photos → Run workflow**. It commits photos in batches of 150 (each commit redeploys Pages once). It is resumable, and when a run ends because of the 6-hour job limit it starts the next run itself until `REMAINING=0`. If it stops on an error (bad key, quota), fix that and run it again.

**Or locally:**

```bash
npm ci
npm run images:generate -- --provider pollinations --limit 150   # rerun until REMAINING=0
npm run images:verify
```

| Provider | Needs | Notes |
| --- | --- | --- |
| `pollinations` (default) | nothing; optional `POLLINATIONS_API_KEY` | FLUX. Without a key the free tier allows 1 image per 45 s per IP, so all 1,575 take roughly 20 hours (the workflow chains runs automatically). A free key from <https://enter.pollinations.ai> (add as secret `POLLINATIONS_API_KEY`) lifts that limit. |
| `cloudflare` | `CF_ACCOUNT_ID`, `CF_API_TOKEN` | FLUX.1 schnell on Workers AI; free daily allowance, so run it once a day. |
| `openai` | `OPENAI_API_KEY` | Paid, best prompt-following. Model via `OPENAI_IMAGE_MODEL` (default `gpt-image-1-mini`). |

For the workflow, add the key as a repo secret with the same name (Settings → Secrets and variables → Actions). Preview prompts without any network: `npm run images:generate -- --prompts 10`. Redo particular dishes with `--only id1,id2 --force`. `images:build` leaves AI-generated entries alone.

> The providers' live APIs could not be reached from the environment this was written in, so the generator is tested end to end with a stand-in provider only. Try `--limit 5` first and look at the results before running the full batch.

## The one-minute version (stock-photo search route)

```bash
npm install
npm run images -- --limit 200     # first batch; rerun without --limit for the rest
npm run images:review             # open tools/images/review/index.html, pick the right photo per recipe
# save the downloaded decisions.json to tools/images/data/decisions.json
npm run images:apply
npm run images:verify
git add assets/recipes docs/IMAGE-CREDITS.md tools/images/data/state.json && git commit
```

Every step is **resumable and idempotent**: search results are cached per query, originals are cached by URL, state is saved every batch, and unchanged images are skipped on rebuild. Interrupt it whenever you like.

## Stages

| Stage | Command | What it does |
| --- | --- | --- |
| acquire | `npm run images:acquire` | For each recipe without a decision: builds up to 3 queries (full name → headline dish → cuisine + main ingredient), searches Wikimedia Commons and Openverse, filters by licence / size / aspect / "is this food" checks, scores relevance, and records the outcome in `tools/images/data/state.json`. |
| review | `npm run images:review` / `images:apply` | A contact sheet of the uncertain matches (top 5 per recipe). You pick the right photo or "none of these"; `apply` promotes the picks. |
| build | `npm run images:build` | Downloads/reuses originals, smart-crops (attention-based) to 3:2, writes `assets/recipes/f/<hash>.webp` (1200×800) and `t/<hash>.webp` (480×320), computes a placeholder colour and perceptual hash, writes `manifest.json` and `docs/IMAGE-CREDITS.md`. `--prune` deletes files no longer referenced. |
| verify | `npm run images:verify` | See below. |

## Relevance: how matches are decided

A photo is scored against the recipe's name using weighted words: dish words (taco, salad, soup, smoothie…) and the main protein weigh most, headline flavour words next, side ingredients least. Title words count fully, tags/categories 70 %. A candidate that names a *different* dish or protein ("lamb" for a chicken recipe) is penalised and can never be auto-accepted.

* **accepted** – score ≥ 0.78, dish + protein both present, no conflicting dish → used without a human.
* **review** – plausible (e.g. "roasted chicken thighs" for *Hoisin-Garlic Chicken Thighs with Roasted Bell Peppers & Fennel*) but not exact → **never shown in the app until you approve it**.
* **unmatched / rejected** – nothing suitable. These stay on the emoji tile and are listed in `tools/images/data/report.json` and at the bottom of the review sheet. Drop your own photo at `tools/images/manual/<recipe-id>.jpg` (optionally credit it in `tools/images/manual/credits.json` as `{ "<id>": { "creator": "…", "license": "Own work", "url": "" } }`) and run `npm run images:build`.

**Be realistic about yield.** About a third of the 1,575 recipes are classic, searchable dishes (Tuna Niçoise Salad, Banana Pancakes, Greek Lamb Burgers). The rest are generated combinations ("Cajun Trout with Zucchini & Farro") that essentially no free stock photo matches exactly. Expect most of those to land in *review* as dish-level matches (a photo of Cajun-style fish, say) that you accept or reject — or to be photographed yourself. FOODIE will not silently attach an unrelated picture to reach 100 %.

## Licences

* Accepted by default: **CC0**, **public-domain marks**, **CC BY** (credit stored, shown under the hero photo, and listed in `docs/IMAGE-CREDITS.md`; the credit also notes the image was cropped/resized).
* Opt in with `--allow-sa` for **CC BY-SA** (adapted copies must remain BY-SA, so it is off by default).
* Never accepted: NC, ND, GFDL, fair-use or unknown licences. `verify` re-checks every manifest entry.
* No scraping of search engines. Only the two public APIs, with a descriptive User-Agent and polite rate limits.

## Sources and API quotas

* **Wikimedia Commons** – no key needed.
* **Openverse** – anonymous use is heavily rate-limited (a few hundred requests/day). For all recipes, register a free client at <https://api.openverse.org/v1/#tag/auth> and export `OPENVERSE_CLIENT_ID` / `OPENVERSE_CLIENT_SECRET`. If the quota runs out the script stops cleanly (exit code 2) with progress saved — just rerun later.
* Use `--sources commons` or `--sources openverse` to restrict, `--min-gap 1500` to slow down, `--only id1,id2` to target specific recipes, `--retry-unmatched` to search again after you improve the matcher.
* More sources (Pexels, Pixabay, Unsplash with free keys) can be added in `tools/images/sources.mjs` by implementing `search(query, { licenses })` and returning the same candidate shape.

> The adapters follow the public API documentation and are unit-tested against fixtures of those response shapes (`npm run test:images`). The build environment this was written in had no access to either API, so run a small batch first (`--limit 20`) and check the review sheet before committing hundreds.

## What `verify` checks

Coverage (with the reason for each gap: needs review / unmatched / not searched), manifest ids that don't match a recipe, missing or unreadable files, wrong dimensions or format, disallowed or unknown licences, CC BY entries without creator + source URL, **one photo shared by two recipes**, **near-identical photos** (perceptual hash), **photo/recipe mismatch** (recipe name re-scored against the stored photo title/tags), and total size against a 150 MB budget. Exit code 1 on any error; add `--require-full` to also fail while any recipe lacks a photo.

## Size and performance

Defaults (`tools/images/config.mjs`): thumbnails 480×320 q68, detail 1200×800 q72 — roughly 15–20 KB and 45–70 KB per photo, so about 90–140 MB for all 1,575 recipes. Cards load only the thumbnail, lazily; the recipe page loads one detail image (with a `srcset`). Lower `SIZES.*.q` if the repository or Pages deploy gets too heavy; GitHub Pages' soft limit is 1 GB.

## In the app

* `assets/recipes/manifest.json` maps **recipe id → file hash** (+ placeholder colour, credit). No array positions or name matching at runtime. Custom (user) recipes keep their own uploaded photo or emoji.
* `thumb()` in `js/ui.js` is the single place photos are rendered, so cards, search results, favourites, the planner, the dashboard and recipe pages all get them. The emoji tile shows first and while loading is replaced by a tinted shimmer; the photo fades in. A missing/blocked file falls back to the emoji tile.
* `sw.js` keeps photos in the `foodie-recipe-photos-v1` cache (cache-first, immutable file names, capped at 800 entries, survives app-version bumps). Photos you have viewed work offline; photos you haven't simply show the emoji tile offline.
