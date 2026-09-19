# Coimbatore Restaurant Picker

Single-page static app to browse **47 Coimbatore restaurants**, add your own places, mark visits, rate spots, note liked dishes, filter by area / cuisine / visit status, and get ranked suggestions.

**Origin repo:** [https://cursor.com/codebase/adi-th/Restaurant-Picker](https://cursor.com/codebase/adi-th/Restaurant-Picker)

**GitHub Pages URL (enable Pages on `main` / `/` root to go live):** [https://adith847.github.io/Restaurant-Picker/](https://adith847.github.io/Restaurant-Picker/)

## Run locally

Serve the repo root over HTTP so `fetch('restaurants.json')` works. Opening `index.html` via `file://` usually fails.

```bash
python3 -m http.server 8765
```

Then open: [http://127.0.0.1:8765/](http://127.0.0.1:8765/)

Any static server works (`npx serve`, `php -S`, etc.).

## Features

- List: name, area, cuisine, price, blurb, tag chips — grouped by neighbourhood (RS Puram, Race Course, Gandhipuram, Peelamedu, …)
- **Add to my list**: live Coimbatore place suggestions as you type (Mapbox Search Box if you paste a public `pk.` token; optional Google Places if a key is saved; otherwise OpenStreetMap + a verified seed). Click a match to add it with name/area/coords/type when the API returns them, or keep a fully custom name. Personal Google ★ is still optional and never invented.
- **Remove from my list** on every card (confirm first). Custom adds are deleted from `customPlaces`; curated places are hidden via `hiddenIds` in this browser (`restaurants.json` is not edited). Undo toast right after a remove; export/import keeps the hidden set.
- **Your rating** (1–5 stars, separate from any Google/editorial score) and **liked dishes** per place
- Filters: All / Untried / Visited, neighbourhood area, cuisine bucket, name/cuisine/dish search
- Stats: total / visited / remaining / your adds
- **Suggest for me**: 1–3 untried picks ranked with the active cuisine (and area) filter, your rating, optional saved Google ★ on places you added, and liked dishes that match that cuisine vibe. Curated JSON has no invented Google ratings — those stars are only used when you saved them on a custom place. Editorial `highly_rated` tags are a tiny tie-break, not a fake score.
- **Nearby**: geolocation; sorts untried with lat/lng by distance; null coords last; soft-fails if denied
- Export / import a JSON backup of visits, notes, custom places, and hidden curated ids

All of that is **browser-local**. It never leaves your browser unless you export it. Clearing site data or using another device/browser starts you from an empty personal list (the curated 47 still load).

## Storage

| Key | Role |
|-----|------|
| `cbe-picker-state-v2` | Canonical state: `{ version: 2, visited: string[], notes: { [id]: { rating, dishes } }, customPlaces: [...], hiddenIds: string[] }` |
| `cbe-picker-visited-v1` | Legacy visited-id array. Still **read** if v2 is missing, and **mirrored** on save so older backups/ticks are not stranded. |
| `cbe-picker-settings-v1` | `{ mapboxAccessToken, googlePlacesApiKey }` only. **Not** exported, **not** committed. Lives in this browser so tokens never land in git or backup JSON. |

Export writes `coimbatore-picker.json` (v2). Import accepts v2 backups **or** the older `{ visited: string[] }` / raw id-array files.

Custom places merge with the curated 47; they never overwrite `restaurants.json`.

## Place autocomplete (Coimbatore-biased)

The add bar searches as you type (debounced). Results prefer Coimbatore, Tamil Nadu.

1. **Already on your list** — curated + custom names match first. Clicking jumps to that card instead of duplicating it (e.g. **The Living Room**).
2. **Mapbox Search Box** — if you save a public `pk.` token in **Places search / API keys**. Suggest + retrieve, biased to Coimbatore (India, proximity + bbox). Clicking a hit retrieves coordinates and area when Mapbox returns them. No invented ratings/hours/dishes.
3. **Google Places Autocomplete (New)** — optional fallback if a Google key is saved **and** Mapbox is not working. Often blocked in India by RBI / auto-pay on Google Cloud billing.
4. **Verified Coimbatore index** (`autocomplete-seed.json`) — ranked **above** OpenStreetMap (and below a strong Mapbox POI). OSM does not know **The Asian Stories**; the seed still suggests Saibaba Colony.
5. **OpenStreetMap** — Nominatim + Photon only if **every query token** overlaps the place name. Photon fuzzy hits like “amutha/nalan stores” for “Asian Stories” are dropped. Supermarket / convenience / department_store / `shop=*` are banned unless the name strongly matches what you typed.
6. **Never silent-empty** — queries of 2+ characters always show a dropdown, including **Add “{name}” as a custom place** when nothing else matches, plus a Mapbox-token CTA if none is saved.

### Preview this branch (avoid stale JS)

`main` has **no** place-suggest UI. Use this PR branch, then **hard-refresh** so you are not looking at a cached `app.js` (that old file is why “Asian Stories” can still show store junk).

- Windows/Linux: `Ctrl+Shift+R` · Mac: `Cmd+Shift+R`
- Prefer a **commit-pinned** rawcdn URL (not the branch raw.githack URL, which caches):  
  `https://rawcdn.githack.com/adith847/Restaurant-Picker/<commit-sha>/index.html`
- Or open with a timestamp: `index.html?v=20260919-5`  
  `app.js`, `styles.css`, `restaurants.json`, and `autocomplete-seed.json` are already loaded with `?v=20260919-5`.

### How Adi adds a Mapbox token (recommended)

Do this at [Mapbox Access Tokens](https://account.mapbox.com/access-tokens/). Never paste a real token into the repo. **Do not use a secret `sk.` token** — only a **public** token starting with `pk.`.

1. Create a Mapbox account (the free tier includes a monthly Search Box allowance; no Google Cloud / RBI auto-pay).
2. **Create a token** → public token with the default public scopes (Search Box / geocoding work with a default public token).
3. **URL restrictions** (optional but recommended). Add:
   - `https://adith847.github.io`
   - `https://raw.githack.com`
   - `https://rawcdn.githack.com`
   - `http://127.0.0.1`
   - `http://localhost`
4. Open the picker → **Places search / API keys** → paste the `pk.` token → **Save Mapbox token**. It is stored as `cbe-picker-settings-v1.mapboxAccessToken` in `localStorage` on that machine/browser only.

Without a token, type **Asian Stories** — it should still suggest The Asian Stories (Saibaba Colony) from the verified index, not store junk. You can always choose **Add “…” as a custom place**.

### How Adi adds a Google key (optional — often blocked)

Google Places needs Cloud billing. Indian RBI / auto-pay rules often prevent completing that payment, which is why Mapbox is the default live path. Skip this section unless you already have a working Google key.

Do this in [Google Cloud Console](https://console.cloud.google.com/). Never paste a real key into the repo.

1. Create or select a project and enable billing (Places is a paid API; Google often includes a monthly credit).
2. Enable **Places API (New)** (not only the legacy Places API).
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Restrict the key:
   - **Application restrictions → HTTP referrers (web sites)**  
     `https://adith847.github.io/*`  
     `https://raw.githack.com/adith847/Restaurant-Picker/*`  
     `https://rawcdn.githack.com/adith847/Restaurant-Picker/*`  
     `http://127.0.0.1:*`  
     `http://localhost:*`
   - **API restrictions → Restrict key → Places API (New)**
5. Open the picker → **Places search / API keys** → paste the key → **Save Google key**. Used only when Mapbox is not set or Mapbox requests fail.

## Files

| File | Role |
|------|------|
| `index.html` | Markup |
| `styles.css` | Warm food-app styling |
| `app.js` | Filters, localStorage, add/autocomplete/rate/dishes, suggest, geolocation, import/export |
| `restaurants.json` | 47 Coimbatore restaurants (do not invent extra places, hours, dishes, or numeric Google ratings) |
| `autocomplete-seed.json` | Verified Coimbatore dining fallback for autocomplete (public sources only) |

## Repo notes

The previous default-branch content was a placeholder README (“Grok project to pick my Restaurant”). That file was replaced so this picker is the only project at the repo root. No other app files existed.
