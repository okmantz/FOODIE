# FOODIE — Healthy choices. Happy you.

A free, private, **local-first** food and meal-planning app. Plan a week (or two, or a month) of meals, get an editable grocery list, cook from a recipe box with live nutrition and cost, discover places to eat, and chat with a friendly Coach. It's a static site: no backend, no accounts, no paid APIs. Everything you create is stored in your own browser.

**Live site (after you enable Pages):** `https://<your-username>.github.io/FOODIE/`

---

## Features

| Area | What it does |
| --- | --- |
| **Meal planner** | 7-day, 14-day or 30-day plans of breakfast / lunch / dinner (+ optional snacks). Preferences: budget, store, servings, diet, cuisines, max cook time, "use my pantry", and *different meals* vs *leftovers*. Swap, remove or add any meal; mark meals done. |
| **Recipes** | 81 original recipes across American, Italian, Mexican, Thai, Indian, Japanese, Chinese, Korean, Mediterranean, Greek, Middle Eastern and French cooking, plus desserts, smoothies/shakes and snacks. Each has ingredients, steps, prep/cook time, nutrition and cost per serving, allergen and diet badges, servings scaler, US/metric units. |
| **Your own recipes** | Create, edit, photograph, rate and note recipes. Pick ingredients from the FOODIE database for automatic nutrition/cost, or type your own. Share any recipe as a link or PDF. |
| **Grocery list** | Built from the plan: aggregates ingredients, subtracts your pantry, rounds up to real pack sizes, groups by aisle. Edit quantities, cross off, add items, hide checked. **PDF**, **print**, **share link**, copy as text. "Finish shopping" adds purchases to the pantry. |
| **Calendar** | Download an `.ics` file for the whole plan (meal times come from your profile), or add single meals to Google / Outlook calendars. |
| **Pantry** | Track what you have, with expiry dates. The planner prefers recipes that use it up; cooking a meal deducts from it. |
| **Meal prep** | A prep schedule per plan, with storage tips and a batch-cook view. |
| **Discover** | 7-question A/B taste quiz → recommendations of cuisines, dishes and restaurants. Search/filter by cuisine, price, distance, rating, diet. Favorites, saved dishes, dining log with spend. Real nearby restaurants via OpenStreetMap (see below). |
| **Profile & Coach** | Avatar, diets (vegan, vegetarian, pescatarian, keto, low-carb, carnivore, gluten/dairy/nut-free…), allergies, dislikes, favorite cuisines/ingredients, goals, optional calorie/macro targets, weekly/monthly/dining budgets. The Coach gives gentle, non-judgmental notes and **never blocks a choice** — you can always override. |
| **Insights** | Weekly nutrition and spending charts, budget check, ingredient-reuse savings, most-cooked recipes. |
| **Dashboard** | Today's meals, a suggestion that fits you, pantry items to use soon, budget and Coach tips. |
| **Learning** | Favorites, ratings, saves, dislikes, cooking history and your dining log gently tune recommendations and plans. You can reset what it learned. |
| **PWA** | Installable and works offline after the first load. Light, dark or automatic theme. Mobile-first with a bottom nav; sidebar on desktop. |

## What is real, and what is not

FOODIE is deliberately honest about its limits.

**Works fully offline, on your device:** planning, recipes, nutrition and cost estimates, grocery lists, pantry, PDF export, print, `.ics` export, share links, taste learning and the Coach.

**Uses a public service only when you press a button:**
- *Nearby restaurants* — OpenStreetMap (Nominatim for place search, Overpass for listings). Free, no key. It returns names, cuisine tags, addresses and, where volunteers mapped them, websites and phone numbers. **No ratings, no live hours, no menus.**
- *Calendar links, store search, delivery search, maps* — open the provider's own page in a new tab.

**Not possible without accounts, partnerships or paid APIs, so not faked:**
- **Live grocery prices, carts or checkout.** Grocery costs are *planning estimates*: average US prices × a rough store price level. The list offers a copyable list and a *search link* at the store of your choice. Orders cannot be placed from FOODIE.
- **Live restaurant menus, availability, ordering or delivery status.** The "Sample" restaurants shipped with the app are **fictional** examples so the app is usable offline; they are labeled as such. Ordering is a link to the restaurant's site, or a delivery-app search.
- **Nutrition is calculated** from typical per-ingredient values, not lab-tested; it's an estimate. **Allergen flags are best-effort** — always read labels and use your own judgment for medical allergies.
- **The Coach is a transparent set of rules** running in your browser, not an AI model, and nothing is sent anywhere.
- **Food images:** recipe "photos" are generated emoji tiles. No stock photography is bundled (licensing); you can add your own photo to any recipe you create.

## Privacy

All data lives in your browser's `localStorage` under the key `foodie:v1`. Nothing is uploaded. Share links contain the shared item itself, compressed into the URL `#fragment` (fragments are never sent to a server). Use **Profile → Your data** to export or restore a JSON backup. Clearing browser data erases your FOODIE data.

---

## Run locally

FOODIE uses native ES modules, so it must be served over HTTP (opening `index.html` as a `file://` URL will not work).

```bash
git clone https://github.com/okmantz/FOODIE.git
cd FOODIE
python3 -m http.server 8080      # or: npm start
# open http://localhost:8080
```

No build step, no dependencies.

## Deploy to GitHub Pages

1. Push this repo to GitHub (branch `main`).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / folder: `/ (root)` → Save.**
3. After a minute your site is live at `https://<username>.github.io/<repo>/`. The empty `.nojekyll` file is already included, and there is no build step.

All paths are relative, so it works under any `/<repo>/` subpath. If you update the app, bump `VERSION` in `sw.js` so installed copies refresh.

## Project layout

```
index.html            entry page
manifest.webmanifest  PWA manifest
sw.js                 offline cache (service worker)
css/styles.css        design system (light/dark, mobile-first)
assets/               Coach image + icons
js/
  main.js, app.js     boot, router, shell, Coach drawer, onboarding
  store.js            central state + localStorage persistence
  ui.js, actions.js   shared components and actions
  data/               ingredients, recipes, stores, restaurants, quiz
  engines/            nutrition, planner, grocery, taste, coach, prep
  lib/                util (DOM helper), units, pdf writer, share, calendar
  views/              dashboard, planner, recipes, grocery, pantry,
                      discover, insights, profile, importer
tests/                unit.mjs (Node) and Playwright checks (Python)
```

## Tests

```bash
node tests/unit.mjs                 # recipe/ingredient data integrity
# browser checks (need: pip install playwright && playwright install chromium)
python3 -m http.server 8080 &
python3 tests/boot.py               # boots with no console errors
python3 tests/crawl.py              # onboarding + every route
python3 tests/engine.py             # planner never violates diets/allergies
python3 tests/flow.py; python3 tests/flow2.py; python3 tests/outputs.py
```

## Adding recipes

Add an entry to `js/data/recipes.js` using ingredient ids from `js/data/ingredients.js`. Nutrition, cost, allergens and diet flags are derived automatically, so they cannot drift out of sync. Run `node tests/unit.mjs` to validate.

## Limitations

- Prices are national-average estimates; real store prices vary.
- Data is per-browser/per-device. There is no sync — use backup/restore to move between devices.
- The OpenStreetMap lookup depends on volunteer map data and those services' availability.
- Share links for recipes with large photos may be too long for some messaging apps.

## License

MIT — see `LICENSE`.
