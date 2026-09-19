# Coimbatore Restaurant Picker

Single-page static app to browse **47 Coimbatore restaurants**, mark places you’ve been, filter by area / visit status, search, get random untried suggestions, and optionally sort nearby untried spots by distance.

**Origin repo:** [https://cursor.com/codebase/adi-th/Restaurant-Picker](https://cursor.com/codebase/adi-th/Restaurant-Picker)

**Public site:** [https://adith847.github.io/Restaurant-Picker/](https://adith847.github.io/Restaurant-Picker/)

## Run locally

Serve the repo root over HTTP so `fetch('restaurants.json')` works. Opening `index.html` via `file://` usually fails.

```bash
python3 -m http.server 8765
```

Then open: [http://127.0.0.1:8765/](http://127.0.0.1:8765/)

Any static server works (`npx serve`, `php -S`, etc.).

## Features

- List: name, area, cuisine, price, blurb, tag chips
- **I’ve been** checkbox per place → persisted in `localStorage` (`cbe-picker-visited-v1`)
- Filters: All / Untried / Visited, area dropdown, name/cuisine search
- Stats: total / visited / remaining
- **Suggest for me**: 1–3 random untried picks with a short reason
- **Nearby**: geolocation; sorts untried with lat/lng by distance; null coords last; soft-fails if denied
- Export / import visited JSON for backup

Visited state is **browser-local v1**. It never leaves your browser unless you export it. Clearing site data or using another device/browser starts you from an empty visited list.

## Files

| File | Role |
|------|------|
| `index.html` | Markup |
| `styles.css` | Warm food-app styling |
| `app.js` | Filters, localStorage, suggest, geolocation, import/export |
| `restaurants.json` | 47 Coimbatore restaurants (do not invent extra places) |

## Repo notes

The previous default-branch content was a placeholder README (“Grok project to pick my Restaurant”). That file was replaced so this picker is the only project at the repo root. No other app files existed.
