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
- **Add to my list**: live Coimbatore place suggestions as you type (Google Places if you paste a key; otherwise OpenStreetMap). Click a match to add it with name/area/coords/type when the API returns them, or keep a fully custom name. Personal Google ★ is still optional and never invented.
- **I’ve been** checkbox per place
- **Your rating** (1–5 stars, separate from any Google/editorial score) and **liked dishes** per place
- Filters: All / Untried / Visited, neighbourhood area, cuisine bucket, name/cuisine/dish search
- Stats: total / visited / remaining / your adds
- **Suggest for me**: 1–3 untried picks ranked with the active cuisine (and area) filter, your rating, optional saved Google ★ on places you added, and liked dishes that match that cuisine vibe. Curated JSON has no invented Google ratings — those stars are only used when you saved them on a custom place. Editorial `highly_rated` tags are a tiny tie-break, not a fake score.
- **Nearby**: geolocation; sorts untried with lat/lng by distance; null coords last; soft-fails if denied
- Export / import a JSON backup of visits, notes, and custom places

All of that is **browser-local**. It never leaves your browser unless you export it. Clearing site data or using another device/browser starts you from an empty personal list (the curated 47 still load).

## Storage

| Key | Role |
|-----|------|
| `cbe-picker-state-v2` | Canonical state: `{ version: 2, visited: string[], notes: { [id]: { rating, dishes } }, customPlaces: [...] }` |
| `cbe-picker-visited-v1` | Legacy visited-id array. Still **read** if v2 is missing, and **mirrored** on save so older backups/ticks are not stranded. |
| `cbe-picker-settings-v1` | `{ googlePlacesApiKey }` only. **Not** exported, **not** committed. Lives in this browser so a key never lands in git or backup JSON. |

Export writes `coimbatore-picker.json` (v2). Import accepts v2 backups **or** the older `{ visited: string[] }` / raw id-array files.

Custom places merge with the curated 47; they never overwrite `restaurants.json`.

## Place autocomplete (Coimbatore-biased)

The add bar searches as you type (debounced). Results prefer Coimbatore, Tamil Nadu.

1. **Already on your list** — curated + custom names match first. Clicking jumps to that card instead of duplicating it (e.g. **The Living Room**).
2. **Google Places Autocomplete (New)** — if you save an API key in **Places search**. Place Details may pre-fill area, coordinates, a Google ★, and a Maps link *only when Google returns those fields*.
3. **OpenStreetMap fallback** — Nominatim + Photon, biased to Coimbatore, when no key is set (or Google requests fail). Coverage is thinner than Google; a short hint in settings explains that.

### How Adi adds a Google key (optional)

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
5. Open the picker → **Places search** → paste the key → **Save key**. It is stored as `cbe-picker-settings-v1` in `localStorage` on that machine/browser only.

Without a key, type a known Kovai name (e.g. Starbucks, Haribhavanam, Sree Annapoorna) and OSM suggestions should still appear. You can always click **Add place** with a custom name if nothing matches.

## Files

| File | Role |
|------|------|
| `index.html` | Markup |
| `styles.css` | Warm food-app styling |
| `app.js` | Filters, localStorage, add/autocomplete/rate/dishes, suggest, geolocation, import/export |
| `restaurants.json` | 47 Coimbatore restaurants (do not invent extra places, hours, dishes, or numeric Google ratings) |

## Repo notes

The previous default-branch content was a placeholder README (“Grok project to pick my Restaurant”). That file was replaced so this picker is the only project at the repo root. No other app files existed.
