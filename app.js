(() => {
  "use strict";

  const STORAGE_KEY_V1 = "cbe-picker-visited-v1";
  const STORAGE_KEY = "cbe-picker-state-v2";
  const SETTINGS_KEY = "cbe-picker-settings-v1";
  const CBE_CENTER = { lat: 11.0168, lng: 76.9558 };
  const CBE_RADIUS_KM = 40;

  /** Neighbourhood buckets so detailed hotel addresses still filter as RS Puram / Race Course / etc. */
  const AREA_RULES = [
    { label: "RS Puram", test: /rs\s*puram/i },
    { label: "Gandhipuram", test: /gandhipuram/i },
    { label: "Race Course", test: /race\s*course/i },
    { label: "Saibaba Colony", test: /saibaba/i },
    { label: "Ram Nagar", test: /ram\s*nagar/i },
    { label: "Neelambur", test: /neelambur/i },
    { label: "Ukkadam", test: /ukkadam|selvapuram/i },
    { label: "Gopalapuram", test: /gopalapuram/i },
    { label: "Sitra", test: /sitra|kalapatti|broadway/i },
    { label: "Lakshmi Mills", test: /lakshmi\s*mills|puliakulam/i },
    { label: "Peelamedu", test: /peelamedu|goldwins/i },
    { label: "Airport Road", test: /airport/i },
    { label: "Avinashi Road", test: /avinashi/i },
  ];

  const CUISINE_RULES = [
    { label: "South Indian", test: /south\s*indian|tamil|kongu|chettinad|paniyaram/i },
    { label: "North Indian", test: /north\s*indian|mughlai|\bkebabs?\b/i },
    { label: "Italian", test: /italian/i },
    { label: "Asian", test: /pan-?asian|asian|chinese|korean|japanese|thai|sushi/i },
    { label: "Café", test: /caf[eé]|bakery|tea\s*caf/i },
    { label: "Continental / European", test: /continental|european/i },
    { label: "Multi-cuisine", test: /multi-?cuisine|fusion/i },
    { label: "Desserts", test: /dessert|ice\s*cream|chocolate/i },
    { label: "Bar & pub", test: /bar\s*food|\bpub\b|restobar|rooftop\s*bar/i },
  ];

  const DISH_VIBES = {
    "South Indian": [
      "dosa", "idli", "sambar", "vada", "uttapam", "uttappam", "pongal",
      "paniyaram", "parotta", "porotta", "appam", "puttu", "chettinad",
      "kozhi", "meals", "thali", "filter coffee", "rasam", "kuzhambu",
      "ghee roast", "poori", "puri", "biryani", "fish curry", "chicken 65",
      "mutton", "kari", "idiyappam", "kootu", "poriyal", "payasam",
    ],
    "North Indian": [
      "butter chicken", "naan", "paneer", "dal makhani", "dal", "tandoori",
      "kebab", "roti", "chole", "tikka", "korma", "kulcha", "biryani",
      "butter naan", "lassi", "saag", "kadai", "malai",
    ],
    Italian: [
      "pizza", "pasta", "risotto", "lasagna", "tiramisu", "gnocchi",
      "bruschetta", "carbonara", "penne", "spaghetti", "ravioli", "gelato",
    ],
    Asian: [
      "sushi", "ramen", "dim sum", "noodles", "dumpling", "manchurian",
      "fried rice", "momos", "thai", "curry", "bao", "teriyaki", "bibimbap",
    ],
    Café: [
      "coffee", "croissant", "sandwich", "pastry", "cake", "waffle",
      "souffle", "soufflé", "chocolate", "chai", "brownie", "cookie",
      "latte", "cappuccino", "tea",
    ],
    "Continental / European": [
      "steak", "grill", "salad", "soup", "pasta", "sandwich", "roast",
      "fish", "chicken", "bread",
    ],
    "Multi-cuisine": ["thali", "biryani", "pizza", "noodles", "grill"],
    Desserts: [
      "ice cream", "cake", "brownie", "souffle", "soufflé", "chocolate",
      "pastry", "kulfi", "payasam", "gelato", "waffle",
    ],
    "Bar & pub": ["nachos", "wings", "fries", "cocktail", "beer", "pizza", "sliders"],
  };

  /** @type {Array<Object>} */
  let curated = [];
  /** @type {Array<Object>} */
  let customPlaces = [];
  /** @type {Array<Object>} */
  let restaurants = [];
  /** @type {Array<Object>} */
  let autocompleteSeed = [];
  /** @type {Set<string>} */
  let visited = new Set();
  /** @type {Record<string, {rating:number|null, dishes:string[]}>} */
  let notes = {};
  /** @type {"all"|"untried"|"visited"} */
  let statusFilter = "all";
  let areaFilter = "";
  let cuisineFilter = "";
  let searchQuery = "";
  /** @type {{lat:number,lng:number}|null} */
  let userCoords = null;
  let sortByDistance = false;

  const $ = (sel) => document.querySelector(sel);
  const listEl = $("#restaurant-list");
  const emptyEl = $("#empty-state");
  const listMeta = $("#list-meta");
  const areaSelect = $("#area-filter");
  const cuisineSelect = $("#cuisine-filter");
  const searchInput = $("#search");
  const geoStatus = $("#geo-status");
  const suggestPanel = $("#suggest-panel");
  const suggestList = $("#suggest-list");
  const suggestTitle = $("#suggest-title");
  const addForm = $("#add-form");
  const addName = $("#add-name");
  const addArea = $("#add-area");
  const addCuisine = $("#add-cuisine");
  const addGoogle = $("#add-google");
  const areaDatalist = $("#area-suggestions");
  const cuisineDatalist = $("#cuisine-suggestions");
  const placeSuggestList = $("#place-suggest-list");
  const placeSuggestLive = $("#place-suggest-live");
  const placesSettings = $("#places-settings");
  const googleKeyInput = $("#google-key");
  const placesProviderStatus = $("#places-provider-status");
  const addLookupHint = $("#add-lookup-hint");

  let settings = { googlePlacesApiKey: "" };
  let googleSessionError = "";
  let suggestTimer = 0;
  let suggestAbort = null;
  let suggestItems = [];
  let suggestActive = -1;
  let suggestQuery = "";

  function loadState() {
    visited = new Set();
    notes = {};
    customPlaces = [];

    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        applyStatePayload(JSON.parse(rawV2));
        return;
      }
    } catch {
      /* fall through to v1 */
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY_V1);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        visited = new Set(parsed.filter((id) => typeof id === "string"));
      } else if (parsed && Array.isArray(parsed.visited)) {
        visited = new Set(parsed.visited.filter((id) => typeof id === "string"));
      }
    } catch {
      visited = new Set();
    }
  }

  function loadSettings() {
    settings = { googlePlacesApiKey: "" };
    googleSessionError = "";
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.googlePlacesApiKey === "string") {
        settings.googlePlacesApiKey = parsed.googlePlacesApiKey.trim();
      }
    } catch {
      settings = { googlePlacesApiKey: "" };
    }
  }

  function saveSettings() {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ googlePlacesApiKey: settings.googlePlacesApiKey })
    );
    refreshPlacesProviderStatus();
  }

  function hasGoogleKey() {
    return Boolean(settings.googlePlacesApiKey) && !googleSessionError;
  }

  function refreshPlacesProviderStatus() {
    if (!placesProviderStatus) return;
    if (settings.googlePlacesApiKey && !googleSessionError) {
      placesProviderStatus.textContent =
        "Using Google Places Autocomplete (New), biased to Coimbatore. Key stays in this browser only.";
    } else if (settings.googlePlacesApiKey && googleSessionError) {
      placesProviderStatus.textContent = `Google key saved but requests failed (${googleSessionError}). Falling back to the verified Coimbatore list + OpenStreetMap.`;
    } else {
      placesProviderStatus.textContent =
        "No Google key — using the verified Coimbatore list + OpenStreetMap. Add a Places API (New) key for better live matches.";
    }
    if (addLookupHint) {
      addLookupHint.innerHTML = hasGoogleKey()
        ? "Live suggestions: your list, Google Places, and the verified Coimbatore index."
        : `Live suggestions: your list + a verified Coimbatore index + OSM. <button type="button" class="hint-link" id="hint-open-places">Add a Google key</button> for Maps-quality matches (OSM often has gaps).`;
      const hintBtn = $("#hint-open-places");
      if (hintBtn) {
        hintBtn.addEventListener("click", () => {
          placesSettings.hidden = false;
          $("#btn-places-settings").setAttribute("aria-expanded", "true");
          googleKeyInput.focus();
        });
      }
    }
    if (googleKeyInput && googleKeyInput !== document.activeElement) {
      googleKeyInput.value = settings.googlePlacesApiKey;
    }
  }

  function readVisitedList(parsed) {
    if (Array.isArray(parsed)) return parsed.filter((id) => typeof id === "string");
    if (parsed && Array.isArray(parsed.visited)) {
      return parsed.visited.filter((id) => typeof id === "string");
    }
    return null;
  }

  function readNotesMap(raw) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const [id, n] of Object.entries(raw)) {
      if (typeof id !== "string" || !n || typeof n !== "object") continue;
      out[id] = normalizeNotes(n);
    }
    return out;
  }

  function readCustomList(raw) {
    if (!Array.isArray(raw)) return [];
    const byId = new Map();
    for (const place of raw) {
      const normalized = normalizeCustomPlace(place);
      if (normalized) byId.set(normalized.id, normalized);
    }
    return [...byId.values()];
  }

  function applyStatePayload(parsed) {
    const ids = readVisitedList(parsed) || [];
    visited = new Set(ids);
    notes = readNotesMap(parsed && parsed.notes);
    customPlaces = readCustomList(parsed && parsed.customPlaces);
  }

  function normalizeNotes(n) {
    const rating =
      typeof n.rating === "number" && n.rating >= 1 && n.rating <= 5
        ? Math.round(n.rating)
        : null;
    const dishes = Array.isArray(n.dishes)
      ? n.dishes.map((d) => String(d).trim()).filter(Boolean)
      : [];
    return { rating, dishes };
  }

  function normalizeCustomPlace(place) {
    if (!place || typeof place !== "object") return null;
    const name = String(place.name || "").trim();
    if (!name) return null;
    const id =
      typeof place.id === "string" && place.id
        ? place.id
        : newCustomId(name);
    const googleRating = parseGoogleRating(place.googleRating);
    return {
      id,
      name,
      area: String(place.area || "").trim(),
      cuisine: String(place.cuisine || "").trim(),
      price: String(place.price || ""),
      blurb: String(place.blurb || ""),
      tags: Array.isArray(place.tags) ? place.tags : ["added_by_you"],
      lat: typeof place.lat === "number" ? place.lat : null,
      lng: typeof place.lng === "number" ? place.lng : null,
      sources: Array.isArray(place.sources) ? place.sources : [],
      googleRating,
      custom: true,
      createdAt: place.createdAt || new Date().toISOString(),
      external:
        place.external && place.external.provider && place.external.id
          ? {
              provider: String(place.external.provider),
              id: String(place.external.id),
            }
          : null,
    };
  }

  function parseGoogleRating(raw) {
    if (raw === "" || raw == null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 5) return null;
    return Math.round(n * 10) / 10;
  }

  function saveState() {
    const payload = {
      version: 2,
      visited: [...visited],
      notes,
      customPlaces,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify([...visited]));
  }

  function getNotes(id) {
    return notes[id] ? { ...notes[id], dishes: [...notes[id].dishes] } : { rating: null, dishes: [] };
  }

  function putNotes(id, next) {
    const rating = next.rating && next.rating >= 1 && next.rating <= 5 ? next.rating : null;
    const dishes = Array.isArray(next.dishes)
      ? next.dishes.map((d) => String(d).trim()).filter(Boolean)
      : [];
    if (!rating && dishes.length === 0) delete notes[id];
    else notes[id] = { rating, dishes };
    saveState();
  }

  function rebuildRestaurants() {
    restaurants = [...curated, ...customPlaces];
  }

  function neighbourhood(area) {
    const raw = String(area || "").trim();
    if (!raw) return "Unspecified";
    for (const rule of AREA_RULES) {
      if (rule.test.test(raw)) return rule.label;
    }
    return raw;
  }

  function cuisineGroupsFor(r) {
    const c = String(r.cuisine || "");
    const groups = [];
    for (const rule of CUISINE_RULES) {
      if (rule.test.test(c)) groups.push(rule.label);
    }
    if (groups.length === 0 && /indian/i.test(c)) groups.push("Indian");
    if (groups.length === 0 && c.trim()) groups.push(c.trim());
    return groups;
  }

  function haversineKm(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function hasCoords(r) {
    return typeof r.lat === "number" && typeof r.lng === "number";
  }

  function formatDistance(km) {
    if (km < 1) return `${Math.round(km * 1000)} m away`;
    return `${km.toFixed(1)} km away`;
  }

  function humanTag(tag) {
    return String(tag).replace(/_/g, " ");
  }

  function slugify(name) {
    const slug = String(name)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return slug || "place";
  }

  function newCustomId(name) {
    return `custom-${slugify(name)}-${Date.now().toString(36)}`;
  }

  function isCustom(r) {
    return Boolean(r && (r.custom || String(r.id).startsWith("custom-")));
  }

  function setStatus(message, isError) {
    geoStatus.classList.toggle("is-error", Boolean(isError));
    geoStatus.textContent = message;
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function fillSelect(select, values, current, allLabel) {
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = allLabel;
    select.appendChild(all);
    for (const value of values) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }
    if (current && values.includes(current)) select.value = current;
    else select.value = "";
    return select.value;
  }

  function fillDatalist(listEl, values) {
    listEl.innerHTML = "";
    for (const value of values) {
      const opt = document.createElement("option");
      opt.value = value;
      listEl.appendChild(opt);
    }
  }

  function refreshFilterOptions() {
    const areas = uniqueSorted(restaurants.map((r) => neighbourhood(r.area)));
    const unspecified = areas.indexOf("Unspecified");
    if (unspecified >= 0) {
      areas.splice(unspecified, 1);
      areas.push("Unspecified");
    }
    areaFilter = fillSelect(areaSelect, areas, areaFilter, "All areas");

    const cuisines = uniqueSorted(restaurants.flatMap((r) => cuisineGroupsFor(r)));
    cuisineFilter = fillSelect(cuisineSelect, cuisines, cuisineFilter, "All cuisines");

    fillDatalist(
      areaDatalist,
      uniqueSorted([
        ...AREA_RULES.map((r) => r.label),
        ...restaurants.map((r) => r.area).filter(Boolean),
      ])
    );
    fillDatalist(
      cuisineDatalist,
      uniqueSorted([
        ...CUISINE_RULES.map((r) => r.label),
        ...restaurants.map((r) => r.cuisine).filter(Boolean),
      ])
    );
  }

  function updateStats() {
    const total = restaurants.length;
    const v = [...visited].filter((id) => restaurants.some((r) => r.id === id)).length;
    $("#stat-total").textContent = String(total);
    $("#stat-visited").textContent = String(v);
    $("#stat-remaining").textContent = String(total - v);
    const customCount = customPlaces.length;
    const customStat = $("#stat-custom");
    if (customStat) customStat.textContent = String(customCount);
  }

  function matchesFilters(r) {
    const isVisited = visited.has(r.id);
    if (statusFilter === "untried" && isVisited) return false;
    if (statusFilter === "visited" && !isVisited) return false;
    if (areaFilter && neighbourhood(r.area) !== areaFilter) return false;
    if (cuisineFilter && !cuisineGroupsFor(r).includes(cuisineFilter)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const n = getNotes(r.id);
      const hay = `${r.name} ${r.cuisine} ${r.area} ${neighbourhood(r.area)} ${n.dishes.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function getFiltered() {
    let list = restaurants.filter(matchesFilters);
    if (sortByDistance && userCoords) {
      list = [...list].sort((a, b) => {
        const aOk = hasCoords(a);
        const bOk = hasCoords(b);
        if (!aOk && !bOk) return a.name.localeCompare(b.name);
        if (!aOk) return 1;
        if (!bOk) return -1;
        const da = haversineKm(userCoords, { lat: a.lat, lng: a.lng });
        const db = haversineKm(userCoords, { lat: b.lat, lng: b.lng });
        return da - db;
      });
    }
    return list;
  }

  function dishMatchesVibe(dish, group) {
    const d = dish.toLowerCase();
    if (group && d.includes(group.toLowerCase())) return true;
    const kws = DISH_VIBES[group] || [];
    return kws.some((k) => d.includes(k) || (d.length >= 4 && k.includes(d)));
  }

  function googleRatingOf(r) {
    if (typeof r.googleRating === "number") return r.googleRating;
    return null;
  }

  function suggestionScore(r, cuisineGroup) {
    const n = getNotes(r.id);
    let score = 0;
    if (n.rating) score += n.rating * 3;
    const g = googleRatingOf(r);
    if (g != null) score += g * 1.5;
    if (n.dishes.length) {
      if (cuisineGroup) {
        const hits = n.dishes.filter((d) => dishMatchesVibe(d, cuisineGroup));
        if (hits.length) score += 2 + hits.length * 1.5;
        else score += 0.4;
      } else {
        score += Math.min(2, n.dishes.length * 0.4);
      }
    }
    if (cuisineGroup && cuisineGroupsFor(r).includes(cuisineGroup)) score += 2;
    if ((r.tags || []).includes("highly_rated")) score += 0.35;
    return score;
  }

  function starButtons(rating, name) {
    let html = `<div class="stars" role="group" aria-label="Your rating for ${escapeAttr(name)}">`;
    for (let i = 1; i <= 5; i += 1) {
      const on = rating >= i;
      html += `<button type="button" class="star${on ? " is-on" : ""}" data-rating="${i}" aria-label="${i} star${i === 1 ? "" : "s"}" aria-pressed="${on ? "true" : "false"}">★</button>`;
    }
    html += `<span class="star-caption">${rating ? `${rating}/5` : "Rate it"}</span></div>`;
    return html;
  }

  function renderCard(r) {
    const li = document.createElement("li");
    li.className = "card" + (visited.has(r.id) ? " is-visited" : "") + (isCustom(r) ? " is-custom" : "");
    li.dataset.id = r.id;

    const n = getNotes(r.id);
    const tagsHtml = (r.tags || [])
      .map((t) => `<li class="tag">${escapeHtml(humanTag(t))}</li>`)
      .join("");

    let distanceHtml = "";
    if (sortByDistance && userCoords && hasCoords(r)) {
      const km = haversineKm(userCoords, { lat: r.lat, lng: r.lng });
      distanceHtml = `<p class="distance">${escapeHtml(formatDistance(km))}</p>`;
    } else if (sortByDistance && !hasCoords(r)) {
      distanceHtml = `<p class="distance">Location unknown</p>`;
    }

    const sources = Array.isArray(r.sources) ? r.sources : [];
    const linksHtml =
      sources.length > 0
        ? `<p class="card-links">${sources
            .slice(0, 2)
            .map((url) => {
              let label = "Source";
              try {
                label = new URL(url).hostname.replace(/^www\./, "");
              } catch {
                /* keep */
              }
              return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
            })
            .join(" · ")}</p>`
        : "";

    const hood = neighbourhood(r.area);
    const areaLabel = r.area && hood !== r.area ? `${hood} · ${r.area}` : r.area || hood;
    const g = googleRatingOf(r);
    const googleHtml =
      g != null
        ? `<span class="google-pill" title="Optional rating you saved (not a live Google score)">Google ${escapeHtml(String(g))}</span>`
        : "";
    const customBadge = isCustom(r) ? `<span class="you-badge">Your add</span>` : "";

    const dishesHtml = n.dishes.length
      ? n.dishes
          .map(
            (d) =>
              `<li class="dish-chip"><span>${escapeHtml(d)}</span><button type="button" class="dish-remove" data-dish="${escapeAttr(d)}" aria-label="Remove ${escapeAttr(d)}">×</button></li>`
          )
          .join("")
      : `<li class="dish-empty">None yet</li>`;

    const customEditor = isCustom(r)
      ? `<div class="custom-edit">
          <label class="mini-field">Area
            <input class="edit-area" value="${escapeAttr(r.area || "")}" placeholder="RS Puram" list="area-suggestions" />
          </label>
          <label class="mini-field">Cuisine
            <input class="edit-cuisine" value="${escapeAttr(r.cuisine || "")}" placeholder="South Indian" list="cuisine-suggestions" />
          </label>
          <label class="mini-field mini-narrow">Google ★
            <input class="edit-google" type="number" min="0" max="5" step="0.1" value="${g != null ? escapeAttr(String(g)) : ""}" placeholder="—" />
          </label>
          <button type="button" class="btn btn-ghost btn-tiny btn-remove-place">Remove</button>
        </div>`
      : "";

    li.innerHTML = `
      <label class="visit-toggle" title="Mark as visited">
        <input type="checkbox" class="visit-cb" ${visited.has(r.id) ? "checked" : ""} aria-label="I've been to ${escapeAttr(r.name)}" />
        <span class="checkmark" aria-hidden="true"></span>
        <span class="visit-label">I've been</span>
      </label>
      <div class="card-body">
        <div class="card-top">
          <h2 class="card-name">${escapeHtml(r.name)}</h2>
          <span class="price">${escapeHtml(r.price || "")}</span>
          ${customBadge}
          ${googleHtml}
        </div>
        <p class="card-meta">
          <span>${escapeHtml(areaLabel)}</span>
          <span class="sep">·</span>
          <span>${escapeHtml(r.cuisine || "Cuisine not set")}</span>
        </p>
        ${r.blurb ? `<p class="blurb">${escapeHtml(r.blurb)}</p>` : ""}
        <ul class="tags">${tagsHtml}</ul>
        ${distanceHtml}
        ${linksHtml}
        <div class="personal">
          <p class="personal-label">Your rating</p>
          ${starButtons(n.rating, r.name)}
          <p class="personal-label">Liked dishes</p>
          <ul class="dish-list">${dishesHtml}</ul>
          <form class="dish-form">
            <input class="dish-input" type="text" maxlength="60" placeholder="Add a dish you like…" aria-label="Add liked dish for ${escapeAttr(r.name)}" />
            <button type="submit" class="btn btn-ghost btn-tiny">Add</button>
          </form>
          ${customEditor}
        </div>
      </div>
    `;

    li.querySelector(".visit-cb").addEventListener("change", (e) => {
      if (e.target.checked) visited.add(r.id);
      else visited.delete(r.id);
      saveState();
      updateStats();
      renderList();
    });

    li.querySelectorAll(".star").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = Number(btn.dataset.rating);
        const current = getNotes(r.id);
        const nextRating = current.rating === value ? null : value;
        putNotes(r.id, { ...current, rating: nextRating });
        updateStats();
        renderList();
      });
    });

    const dishForm = li.querySelector(".dish-form");
    dishForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = dishForm.querySelector(".dish-input");
      const dish = input.value.trim();
      if (!dish) return;
      const current = getNotes(r.id);
      if (current.dishes.some((d) => d.toLowerCase() === dish.toLowerCase())) {
        input.value = "";
        return;
      }
      putNotes(r.id, { ...current, dishes: [...current.dishes, dish] });
      renderList();
    });

    li.querySelectorAll(".dish-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dish = btn.dataset.dish;
        const current = getNotes(r.id);
        putNotes(r.id, {
          ...current,
          dishes: current.dishes.filter((d) => d !== dish),
        });
        renderList();
      });
    });

    if (isCustom(r)) {
      const persistCustomEdits = () => {
        const place = customPlaces.find((p) => p.id === r.id);
        if (!place) return;
        place.area = li.querySelector(".edit-area").value.trim();
        place.cuisine = li.querySelector(".edit-cuisine").value.trim();
        place.googleRating = parseGoogleRating(li.querySelector(".edit-google").value);
        saveState();
        rebuildRestaurants();
        refreshFilterOptions();
        updateStats();
        renderList();
      };
      li.querySelector(".edit-area").addEventListener("change", persistCustomEdits);
      li.querySelector(".edit-cuisine").addEventListener("change", persistCustomEdits);
      li.querySelector(".edit-google").addEventListener("change", persistCustomEdits);
      li.querySelector(".btn-remove-place").addEventListener("click", () => {
        if (!window.confirm(`Remove “${r.name}” from your list?`)) return;
        customPlaces = customPlaces.filter((p) => p.id !== r.id);
        visited.delete(r.id);
        delete notes[r.id];
        saveState();
        rebuildRestaurants();
        refreshFilterOptions();
        updateStats();
        renderList();
        setStatus(`Removed ${r.name} from your list.`);
      });
    }

    return li;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function renderList() {
    const scrollY = window.scrollY;
    const filtered = getFiltered();
    listEl.innerHTML = "";
    if (filtered.length === 0) {
      emptyEl.hidden = false;
      listMeta.textContent = "Showing 0 restaurants";
    } else {
      emptyEl.hidden = true;
      const frag = document.createDocumentFragment();
      const groupByArea = !sortByDistance && !areaFilter;
      if (groupByArea) {
        const groups = new Map();
        for (const r of filtered) {
          const key = neighbourhood(r.area);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        }
        const keys = [...groups.keys()].sort((a, b) => {
          if (a === "Unspecified") return 1;
          if (b === "Unspecified") return -1;
          return a.localeCompare(b);
        });
        for (const key of keys) {
          const head = document.createElement("li");
          head.className = "area-heading";
          const items = groups.get(key);
          head.innerHTML = `<h2>${escapeHtml(key)}</h2><span>${items.length}</span>`;
          frag.appendChild(head);
          for (const r of items) frag.appendChild(renderCard(r));
        }
      } else {
        for (const r of filtered) frag.appendChild(renderCard(r));
      }
      listEl.appendChild(frag);
      let meta = `Showing ${filtered.length} of ${restaurants.length}`;
      if (customPlaces.length) meta += ` · ${customPlaces.length} added by you`;
      if (sortByDistance && userCoords) meta += " · sorted by distance";
      else if (groupByArea) meta += " · grouped by area";
      if (cuisineFilter) meta += ` · ${cuisineFilter}`;
      listMeta.textContent = meta;
    }
    window.scrollTo(0, scrollY);
  }

  function pickSuggestions() {
    const cuisineGroup = cuisineFilter || "";
    let pool = restaurants.filter((r) => !visited.has(r.id));
    if (areaFilter) pool = pool.filter((r) => neighbourhood(r.area) === areaFilter);
    if (cuisineGroup) pool = pool.filter((r) => cuisineGroupsFor(r).includes(cuisineGroup));

    if (pool.length === 0) {
      const label = [cuisineGroup, areaFilter].filter(Boolean).join(" · ");
      suggestTitle.textContent = "You're caught up!";
      suggestList.innerHTML = `<p class="suggest-reason">${
        label
          ? escapeHtml(`No untried ${label} places left. Clear a filter or uncheck a visit to get fresh picks.`)
          : "Every place on the list is marked visited. Uncheck a few — or import a leaner backup — to get fresh picks."
      }</p>`;
      suggestPanel.hidden = false;
      return;
    }

    const ranked = [...pool].sort((a, b) => {
      const diff = suggestionScore(b, cuisineGroup) - suggestionScore(a, cuisineGroup);
      if (Math.abs(diff) > 0.05) return diff;
      return Math.random() - 0.5;
    });
    const shortlist = ranked.slice(0, Math.min(8, ranked.length));
    const shuffledHead = [...shortlist].sort((a, b) => {
      const diff = suggestionScore(b, cuisineGroup) - suggestionScore(a, cuisineGroup);
      if (Math.abs(diff) > 1.2) return diff;
      return Math.random() - 0.5;
    });
    const count = Math.min(3, shuffledHead.length);
    const picks = shuffledHead.slice(0, count);

    const titleBits = [];
    if (cuisineGroup) titleBits.push(cuisineGroup);
    if (areaFilter) titleBits.push(areaFilter);
    suggestTitle.textContent =
      count === 1
        ? titleBits.length
          ? `${titleBits.join(" · ")} pick`
          : "Tonight’s pick"
        : titleBits.length
          ? `${count} ${titleBits.join(" · ")} ideas`
          : `${count} ideas for you`;
    suggestList.innerHTML = "";

    for (const r of picks) {
      const reason = suggestionReason(r, pool, cuisineGroup);
      const n = getNotes(r.id);
      const g = googleRatingOf(r);
      const extras = [];
      if (n.rating) extras.push(`your ${n.rating}/5`);
      if (g != null) extras.push(`saved Google ${g}`);
      const card = document.createElement("div");
      card.className = "suggest-card";
      card.innerHTML = `
        <h3>${escapeHtml(r.name)}</h3>
        <p class="suggest-meta">${escapeHtml(neighbourhood(r.area))} · ${escapeHtml(r.cuisine || "Cuisine not set")}${r.price ? ` · ${escapeHtml(r.price)}` : ""}${extras.length ? ` · ${escapeHtml(extras.join(" · "))}` : ""}</p>
        <p class="suggest-reason">${escapeHtml(reason)}</p>
      `;
      suggestList.appendChild(card);
    }
    suggestPanel.hidden = false;
    suggestPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function suggestionReason(r, pool, cuisineGroup) {
    const n = getNotes(r.id);
    const parts = [];
    const tags = r.tags || [];

    if (cuisineGroup && cuisineGroupsFor(r).includes(cuisineGroup)) {
      parts.push(`fits your ${cuisineGroup} filter`);
    }

    if (n.rating) parts.push(`you already rated it ${n.rating}/5`);
    const g = googleRatingOf(r);
    if (g != null) parts.push(`saved Google score ${g}`);

    if (cuisineGroup && n.dishes.length) {
      const hits = n.dishes.filter((d) => dishMatchesVibe(d, cuisineGroup));
      if (hits.length) {
        parts.push(`liked dishes that feel ${cuisineGroup}: ${hits.slice(0, 3).join(", ")}`);
      }
    } else if (n.dishes.length) {
      parts.push(`you noted ${n.dishes.slice(0, 2).join(", ")}`);
    }

    if (tags.includes("fine_dining")) parts.push("a special-occasion fine dining stop");
    else if (tags.includes("vegetarian")) parts.push("a solid vegetarian-forward pick");
    else if (tags.includes("bar")) parts.push("good for drinks and small plates");
    else if (tags.includes("hotel")) parts.push("reliable hotel dining");
    else if (tags.includes("highly_rated")) parts.push("frequently recommended around town");
    else if (isCustom(r)) parts.push("from your personal list");

    if (r.price && r.price.length <= 2) parts.push("easy on the wallet");
    else if (r.price && r.price.length >= 4) parts.push("worth dressing up a bit");

    const areaCount = pool.filter((x) => neighbourhood(x.area) === neighbourhood(r.area)).length;
    if (areaCount === 1) parts.push(`the only untried spot left in ${neighbourhood(r.area)}`);
    else parts.push(`untried in ${neighbourhood(r.area)}`);

    if (parts.length === 0) return `Random untried pick — ${r.cuisine || "your list"}.`;
    const lead = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return `${lead}${parts.length > 1 ? " · " + parts.slice(1).join(" · ") : ""}.`;
  }

  function requestNearby() {
    setStatus("Requesting location…");

    if (!navigator.geolocation) {
      setStatus("Geolocation isn’t available in this browser. Sorting skipped — list unchanged.", true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        sortByDistance = true;
        statusFilter = "untried";
        document.querySelectorAll(".seg").forEach((b) => {
          b.classList.toggle("active", b.dataset.status === "untried");
        });
        const withCoords = restaurants.filter(
          (r) => !visited.has(r.id) && hasCoords(r)
        ).length;
        const without = restaurants.filter(
          (r) => !visited.has(r.id) && !hasCoords(r)
        ).length;
        setStatus(
          `Location on · ${withCoords} untried with coords sorted nearest-first${
            without ? `; ${without} without coords listed last` : ""
          }.`
        );
        renderList();
      },
      (err) => {
        sortByDistance = false;
        userCoords = null;
        const msg =
          err && err.code === 1
            ? "Location permission denied — nearby sort skipped. You can still browse and filter normally."
            : "Couldn’t get location — nearby sort skipped. Browse and filter as usual.";
        setStatus(msg, true);
        renderList();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  function exportState() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      city: "Coimbatore",
      visited: [...visited],
      notes,
      customPlaces,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coimbatore-picker.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importState(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const ids = readVisitedList(data);
        if (!ids) {
          throw new Error("Expected a v2 backup or { visited: string[] }");
        }
        visited = new Set(ids);
        const isV2 =
          data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          (data.version === 2 || "notes" in data || "customPlaces" in data);
        if (isV2) {
          notes = readNotesMap(data.notes);
          customPlaces = readCustomList(data.customPlaces);
        }
        rebuildRestaurants();
        const validIds = new Set(restaurants.map((r) => r.id));
        visited = new Set([...visited].filter((id) => validIds.has(id)));
        saveState();
        refreshFilterOptions();
        updateStats();
        renderList();
        setStatus(
          `Imported ${visited.size} visited, ${Object.keys(notes).length} with notes, ${customPlaces.length} custom place(s).`
        );
      } catch (e) {
        setStatus(`Import failed: ${e.message || "invalid JSON"}`, true);
      }
    };
    reader.readAsText(file);
  }

  function nameKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function nameMatchScore(query, name) {
    const q = nameKey(query);
    const n = nameKey(name);
    if (!q || !n) return 0;
    if (n === q) return 100;
    if (n.startsWith(q) || n.includes(` ${q}`)) return 90;
    if (n.includes(q) && q.length >= 4) return 80;
    const qTokens = q.split(" ").filter((t) => t.length >= 2);
    if (!qTokens.length) return 0;
    const nTokens = n.split(" ");
    const hits = qTokens.filter((t) =>
      nTokens.some((nt) => nt === t || nt.startsWith(t))
    );
    if (hits.length === qTokens.length) return 75;
    if (hits.length >= 1 && hits.length / qTokens.length >= 0.67) return 45;
    return 0;
  }

  function inCoimbatore(lat, lng, haystack) {
    const text = String(haystack || "").toLowerCase();
    if (/coimbatore|kovai|கோயம்புத்தூர்/.test(text)) return true;
    if (typeof lat !== "number" || typeof lng !== "number") return /tamil\s*nadu/.test(text);
    return haversineKm(CBE_CENTER, { lat, lng }) <= CBE_RADIUS_KM;
  }

  function humanPlaceType(raw) {
    const t = String(raw || "").toLowerCase().replace(/_/g, " ");
    if (!t) return "";
    if (/south indian/.test(t)) return "South Indian restaurant";
    if (/north indian/.test(t)) return "North Indian restaurant";
    if (/italian/.test(t)) return "Italian restaurant";
    if (t === "cafe" || t === "coffee shop") return "Café";
    if (t === "bar" || t === "pub" || t === "night club") return "Bar";
    if (t === "bakery") return "Bakery";
    if (t === "fast food" || t === "meal takeaway") return "Fast food";
    if (t === "restaurant") return "Restaurant";
    if (t === "food court") return "Food court";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function cuisineFromType(type, extraCuisine) {
    const mapped = (value) => {
      const t = String(value || "")
        .toLowerCase()
        .replace(/_/g, " ")
        .trim();
      if (!t) return "";
      if (/south indian/.test(t)) return "South Indian";
      if (/north indian/.test(t)) return "North Indian";
      if (/italian/.test(t)) return "Italian";
      if (/chinese|thai|japanese|korean|asian/.test(t)) return "Asian";
      if (t === "cafe" || t === "coffee shop") return "Café";
      if (t === "bar" || t === "pub" || t === "night club") return "Bar & pub";
      if (t === "bakery") return "Bakery";
      if (t === "fast food" || t === "meal takeaway") return "Fast food";
      if (t === "restaurant" || t === "yes" || t === "amenity") return "";
      return "";
    };
    const fromType = mapped(type);
    if (extraCuisine) {
      const extraMapped = mapped(extraCuisine);
      if (extraMapped) return extraMapped;
      const bits = String(extraCuisine)
        .split(/[;,/]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/_/g, " "))
        .filter((s) => !mapped(s) && !/^(cafe|coffee shop|restaurant|bar|pub|yes)$/i.test(s));
      if (bits.length) return bits.join(" / ");
    }
    return fromType;
  }

  function areaFromAddressParts(parts) {
    const keys = [
      "suburb",
      "neighbourhood",
      "neighborhood",
      "city_district",
      "quarter",
      "village",
      "town",
      "county",
      "road",
    ];
    for (const key of keys) {
      if (parts && parts[key]) {
        const hood = neighbourhood(parts[key]);
        if (hood && hood !== "Unspecified") return hood === parts[key] ? parts[key] : hood;
      }
    }
    if (parts && parts.city && /coimbatore/i.test(parts.city)) return parts.suburb || parts.city;
    return (parts && (parts.suburb || parts.city)) || "";
  }

  function areaFromGoogleComponents(components) {
    if (!Array.isArray(components)) return "";
    const byType = (type) => {
      const hit = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
      return hit && (hit.longText || hit.shortText || "");
    };
    return (
      byType("sublocality_level_1") ||
      byType("sublocality") ||
      byType("neighborhood") ||
      byType("administrative_area_level_3") ||
      byType("locality") ||
      ""
    );
  }

  function findExistingPlace(partial) {
    if (partial && partial.external && partial.external.id) {
      const byExt = restaurants.find(
        (r) =>
          r.external &&
          r.external.provider === partial.external.provider &&
          r.external.id === partial.external.id
      );
      if (byExt) return byExt;
    }
    const key = nameKey(partial && partial.name);
    if (!key) return null;
    return restaurants.find((r) => nameKey(r.name) === key) || null;
  }

  function jumpToPlace(r, message) {
    searchInput.value = r.name;
    searchQuery = r.name;
    hidePlaceSuggest();
    renderList();
    requestAnimationFrame(() => {
      document.querySelector(`.card[data-id="${CSS.escape(r.id)}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    setStatus(message || `${r.name} is already on your list — jumped to it.`);
  }

  function commitCustomPlace(partial, { confirmDuplicate = true } = {}) {
    const existing = findExistingPlace(partial);
    if (existing) {
      if (!confirmDuplicate) {
        jumpToPlace(existing);
        return existing;
      }
      const again = window.confirm(
        `“${existing.name}” is already on the list. Add another copy anyway?`
      );
      if (!again) {
        jumpToPlace(existing);
        return existing;
      }
    }
    const place = normalizeCustomPlace({
      id: newCustomId(partial.name),
      name: partial.name,
      area: partial.area || "",
      cuisine: partial.cuisine || "",
      googleRating: partial.googleRating,
      lat: partial.lat,
      lng: partial.lng,
      sources: partial.sources || [],
      tags: partial.tags || ["added_by_you"],
      external: partial.external || null,
      custom: true,
      createdAt: new Date().toISOString(),
    });
    if (!place) return null;
    customPlaces.push(place);
    saveState();
    rebuildRestaurants();
    refreshFilterOptions();
    updateStats();
    addForm.reset();
    searchInput.value = "";
    searchQuery = "";
    hidePlaceSuggest();
    renderList();
    requestAnimationFrame(() => {
      document.querySelector(`.card[data-id="${CSS.escape(place.id)}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    setStatus(`Added ${place.name} to your list.`);
    return place;
  }

  function localPlaceSuggestions(query) {
    return restaurants
      .filter((r) => nameMatchScore(query, r.name) >= 70)
      .slice(0, 5)
      .map((r) => ({
        kind: "local",
        restaurant: r,
        name: r.name,
        area: neighbourhood(r.area) || r.area,
        typeLabel: r.cuisine || "On your list",
        providerLabel: "Already on your list",
      }));
  }

  function seedPlaceSuggestions(query) {
    return autocompleteSeed
      .filter((p) => {
        const names = [p.name, ...(Array.isArray(p.aliases) ? p.aliases : [])];
        return names.some((nm) => nameMatchScore(query, nm) >= 70);
      })
      .filter((p) => !findExistingPlace({ name: p.name, external: { provider: "seed", id: p.id } }))
      .slice(0, 5)
      .map((p) => ({
        kind: "seed",
        provider: "seed",
        name: p.name,
        area: p.area || "",
        address: p.address || "",
        typeLabel: p.type || p.cuisine || "Restaurant",
        cuisine: p.cuisine || "",
        lat: typeof p.lat === "number" ? p.lat : null,
        lng: typeof p.lng === "number" ? p.lng : null,
        sources: Array.isArray(p.sources) ? p.sources : [],
        providerLabel: "Verified",
        external: { provider: "seed", id: p.id },
      }));
  }

  function customAddItem(query) {
    return {
      kind: "custom",
      name: query,
      area: addArea.value.trim(),
      cuisine: addCuisine.value.trim(),
      typeLabel: "Custom place",
      providerLabel: "Add as typed",
    };
  }

  function suggestProviderHint() {
    if (hasGoogleKey()) return "Google Places · Coimbatore";
    return "OSM coverage is patchy — add a Google key for better matches";
  }

  function hidePlaceSuggest() {
    suggestItems = [];
    suggestActive = -1;
    suggestQuery = "";
    if (suggestAbort) {
      suggestAbort.abort();
      suggestAbort = null;
    }
    placeSuggestList.hidden = true;
    placeSuggestList.innerHTML = "";
    addName.setAttribute("aria-expanded", "false");
    placeSuggestLive.textContent = "";
  }

  function renderPlaceSuggest(items, { loading, providerHint, query } = {}) {
    const typed = (query || suggestQuery || addName.value).trim();
    const rowsItems = [...items];
    if (typed.length >= 2 && !rowsItems.some((item) => item.kind === "custom")) {
      rowsItems.push(customAddItem(typed));
    }
    suggestItems = rowsItems;
    if (suggestActive >= rowsItems.length) suggestActive = rowsItems.length - 1;

    const head = `<li class="place-suggest-head" role="presentation">Is this the place?</li>`;
    const rows = rowsItems
      .map((item, i) => {
        let badge = "";
        if (item.kind === "local") badge = `<span class="place-suggest-badge">On your list</span>`;
        else if (item.kind === "seed") badge = `<span class="place-suggest-badge is-verified">Verified</span>`;
        const title =
          item.kind === "custom"
            ? `Add “${item.name}” as a custom place`
            : item.name;
        const meta =
          item.kind === "custom"
            ? "Use the name you typed — area and cuisine optional"
            : [item.area, item.typeLabel, item.providerLabel]
                .filter(Boolean)
                .join(" · ");
        const extraClass = item.kind === "custom" ? " is-custom-add" : "";
        return `<li role="presentation">
          <button type="button" class="place-suggest-item${extraClass}${i === suggestActive ? " is-active" : ""}" role="option" id="place-opt-${i}" data-index="${i}" aria-selected="${i === suggestActive ? "true" : "false"}">
            <span class="place-suggest-name">${escapeHtml(title)} ${badge}</span>
            <span class="place-suggest-meta">${escapeHtml(meta)}</span>
          </button>
        </li>`;
      })
      .join("");
    const footBits = [];
    if (loading) footBits.push("Searching Coimbatore…");
    if (providerHint) footBits.push(providerHint);
    const cta = !hasGoogleKey()
      ? `<button type="button" class="place-suggest-cta" id="suggest-open-key">Add a Google key</button>`
      : "";
    const foot = `<li class="place-suggest-foot" role="presentation">${escapeHtml(footBits.join(" · "))}${cta}</li>`;
    placeSuggestList.innerHTML = head + rows + foot;
    placeSuggestList.hidden = false;
    addName.setAttribute("aria-expanded", "true");
    placeSuggestLive.textContent = loading
      ? "Searching places"
      : `${rowsItems.length} suggestion${rowsItems.length === 1 ? "" : "s"}`;
    placeSuggestList.querySelectorAll(".place-suggest-item").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.index);
        if (suggestItems[idx]) choosePlaceSuggestion(suggestItems[idx]);
      });
    });
    const ctaBtn = $("#suggest-open-key");
    if (ctaBtn) {
      ctaBtn.addEventListener("mousedown", (e) => e.preventDefault());
      ctaBtn.addEventListener("click", () => {
        hidePlaceSuggest();
        placesSettings.hidden = false;
        $("#btn-places-settings").setAttribute("aria-expanded", "true");
        googleKeyInput.focus();
      });
    }
  }

  function mergeSuggestionLists(local, remote) {
    const seen = new Set(local.map((item) => nameKey(item.name)));
    const extra = [];
    for (const item of remote) {
      const key = nameKey(item.name);
      if (key && seen.has(key) && findExistingPlace(item)) continue;
      extra.push(item);
      if (key) seen.add(key);
    }
    return [...local, ...extra].slice(0, 8);
  }

  function isFoodishOsm(item) {
    const blob = `${item.typeLabel || ""} ${item.cuisine || ""} ${item.extra || ""} ${item.name || ""}`.toLowerCase();
    if (
      /\b(restaurant|cafe|café|bar|pub|bakery|bistro|food court|fast food|ice cream|meal|kitchen|mess|dhaba)\b/.test(
        blob
      )
    ) {
      return true;
    }
    return false;
  }

  function isJunkOsm(item) {
    const blob = `${item.typeLabel || ""} ${item.extra || ""} ${item.name || ""}`.toLowerCase();
    return /\b(supermarket|convenience|clothes|school|college|university|bank|hospital|parking|fuel|temple|place of worship|residential|hardware|electronics)\b/.test(
      blob
    ) || /\bstores?\b/.test(item.name || "");
  }

  function keepOsmSuggestion(item, query) {
    const score = nameMatchScore(query, item.name);
    if (score >= 70 && !isJunkOsm(item)) return true;
    if (isFoodishOsm(item) && score >= 45) return true;
    return false;
  }

  async function fetchGoogleAutocomplete(query, signal) {
    const key = settings.googlePlacesApiKey;
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
      },
      body: JSON.stringify({
        input: query,
        languageCode: "en",
        includedRegionCodes: ["in"],
        locationBias: {
          circle: {
            center: { latitude: CBE_CENTER.lat, longitude: CBE_CENTER.lng },
            radius: 30000,
          },
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return (data.suggestions || [])
      .map((row) => row.placePrediction)
      .filter(Boolean)
      .map((pred) => {
        const name =
          (pred.structuredFormat &&
            pred.structuredFormat.mainText &&
            pred.structuredFormat.mainText.text) ||
          (pred.text && pred.text.text) ||
          "";
        const secondary =
          (pred.structuredFormat &&
            pred.structuredFormat.secondaryText &&
            pred.structuredFormat.secondaryText.text) ||
          "";
        const types = Array.isArray(pred.types) ? pred.types : [];
        const primary = types.find((t) =>
          /restaurant|cafe|bar|bakery|food|meal/i.test(t)
        ) || types[0] || "";
        return {
          kind: "remote",
          provider: "google",
          placeId: pred.placeId,
          name,
          area: secondary.split(",")[0] || secondary,
          address: secondary,
          typeLabel: humanPlaceType(primary),
          cuisine: cuisineFromType(primary),
          providerLabel: "Google",
          types,
        };
      })
      .filter((item) => {
        if (!item.name) return false;
        const hay = `${item.name} ${item.address}`;
        if (
          /bengaluru|bangalore|chennai|hyderabad|mumbai|delhi|pune|kochi|madurai|mysuru|mysore/i.test(
            hay
          ) &&
          !/coimbatore|kovai/i.test(hay)
        ) {
          return false;
        }
        return true;
      });
  }

  async function fetchGooglePlaceDetails(placeId) {
    const key = settings.googlePlacesApiKey;
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,location,types,primaryType,primaryTypeDisplayName,addressComponents,rating,googleMapsUri",
        },
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
    const name = (data.displayName && data.displayName.text) || "";
    const types = Array.isArray(data.types) ? data.types : [];
    const primary = data.primaryType || types[0] || "";
    const lat =
      data.location && typeof data.location.latitude === "number"
        ? data.location.latitude
        : null;
    const lng =
      data.location && typeof data.location.longitude === "number"
        ? data.location.longitude
        : null;
    return {
      name,
      area: areaFromGoogleComponents(data.addressComponents) || "",
      cuisine: cuisineFromType(primary),
      lat,
      lng,
      googleRating: parseGoogleRating(data.rating),
      sources: data.googleMapsUri ? [data.googleMapsUri] : [],
      tags: ["added_by_you"],
      external: { provider: "google", id: data.id || placeId },
    };
  }

  function nominatimToItem(row) {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    const address = row.address || {};
    const hay = `${row.display_name || ""} ${row.name || ""}`;
    if (!inCoimbatore(lat, lng, hay)) return null;
    const type = row.type || row.category || "";
    const extra = (row.extratags && (row.extratags.cuisine || row.extratags.amenity)) || "";
    const osmType =
      row.osm_type === "node" ? "node" : row.osm_type === "way" ? "way" : "relation";
    return {
      kind: "remote",
      provider: "osm",
      name: row.name || (row.display_name || "").split(",")[0],
      area: areaFromAddressParts(address),
      address: row.display_name || "",
      typeLabel: humanPlaceType(type),
      cuisine: cuisineFromType(type, row.extratags && row.extratags.cuisine),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      providerLabel: "OpenStreetMap",
      sources: row.osm_id ? [`https://www.openstreetmap.org/${osmType}/${row.osm_id}`] : [],
      external: row.osm_id
        ? { provider: "osm", id: `${row.osm_type}:${row.osm_id}` }
        : null,
      extra,
    };
  }

  function photonToItem(feature) {
    const props = feature.properties || {};
    const coords = (feature.geometry && feature.geometry.coordinates) || [];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    const hay = [props.name, props.city, props.state, props.district, props.locality, props.street]
      .filter(Boolean)
      .join(" ");
    if (!inCoimbatore(lat, lng, hay)) return null;
    const osmType = props.osm_type === "N" ? "node" : props.osm_type === "W" ? "way" : "relation";
    return {
      kind: "remote",
      provider: "osm",
      name: props.name || "",
      area: areaFromAddressParts({
        suburb: props.locality || props.district,
        neighbourhood: props.district,
        road: props.street,
        city: props.city,
      }),
      address: hay,
      typeLabel: humanPlaceType(props.osm_value || props.type),
      cuisine: cuisineFromType(props.osm_value),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      providerLabel: "OpenStreetMap",
      sources: props.osm_id
        ? [`https://www.openstreetmap.org/${osmType}/${props.osm_id}`]
        : [],
      external: props.osm_id
        ? { provider: "osm", id: `${props.osm_type}:${props.osm_id}` }
        : null,
    };
  }

  async function fetchOsmSuggestions(query, signal) {
    const q = /coimbatore|kovai/i.test(query) ? query : `${query} Coimbatore`;
    const nomUrl =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({
        q,
        format: "jsonv2",
        addressdetails: "1",
        extratags: "1",
        limit: "6",
        countrycodes: "in",
        viewbox: "76.80,11.22,77.18,10.85",
        bounded: "0",
      });
    const photonUrl =
      "https://photon.komoot.io/api/?" +
      new URLSearchParams({
        q,
        lat: String(CBE_CENTER.lat),
        lon: String(CBE_CENTER.lng),
        limit: "6",
        lang: "en",
        bbox: "76.80,10.85,77.18,11.22",
      });
    const [nomRes, photonRes] = await Promise.allSettled([
      fetch(nomUrl, { signal, headers: { Accept: "application/json" } }),
      fetch(photonUrl, { signal, headers: { Accept: "application/json" } }),
    ]);
    const items = [];
    if (nomRes.status === "fulfilled" && nomRes.value.ok) {
      const rows = await nomRes.value.json();
      for (const row of rows) {
        const item = nominatimToItem(row);
        if (item && item.name) items.push(item);
      }
    }
    if (photonRes.status === "fulfilled" && photonRes.value.ok) {
      const data = await photonRes.value.json();
      for (const feature of data.features || []) {
        const item = photonToItem(feature);
        if (item && item.name) items.push(item);
      }
    }
    const seen = new Set();
    return items.filter((item) => {
      if (!keepOsmSuggestion(item, query)) return false;
      const coordKey =
        typeof item.lat === "number" && typeof item.lng === "number"
          ? `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`
          : item.external && item.external.id;
      const key = `${nameKey(item.name)}|${coordKey || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchRemoteSuggestions(query, signal) {
    if (hasGoogleKey()) {
      try {
        const googleItems = await fetchGoogleAutocomplete(query, signal);
        googleSessionError = "";
        refreshPlacesProviderStatus();
        return googleItems;
      } catch (err) {
        if (signal && signal.aborted) throw err;
        googleSessionError = err.message || "request failed";
        refreshPlacesProviderStatus();
      }
    }
    return fetchOsmSuggestions(query, signal);
  }

  async function runPlaceLookup(query) {
    const local = localPlaceSuggestions(query);
    const seed = seedPlaceSuggestions(query);
    renderPlaceSuggest(mergeSuggestionLists(local, seed), {
      loading: true,
      providerHint: suggestProviderHint(),
      query,
    });
    if (suggestAbort) suggestAbort.abort();
    suggestAbort = new AbortController();
    const { signal } = suggestAbort;
    try {
      const remote = await fetchRemoteSuggestions(query, signal);
      if (addName.value.trim() !== query) return;
      renderPlaceSuggest(mergeSuggestionLists(local, [...seed, ...remote]), {
        loading: false,
        providerHint: suggestProviderHint(),
        query,
      });
    } catch (err) {
      if (signal.aborted) return;
      renderPlaceSuggest(mergeSuggestionLists(local, seed), {
        loading: false,
        providerHint: `Lookup failed (${err.message}). You can still add this as a custom name.`,
        query,
      });
    }
  }

  function schedulePlaceLookup() {
    const query = addName.value.trim();
    suggestQuery = query;
    if (query.length < 2) {
      hidePlaceSuggest();
      return;
    }
    const local = localPlaceSuggestions(query);
    const seed = seedPlaceSuggestions(query);
    renderPlaceSuggest(mergeSuggestionLists(local, seed), {
      loading: true,
      providerHint: suggestProviderHint(),
      query,
    });
    window.clearTimeout(suggestTimer);
    suggestTimer = window.setTimeout(() => runPlaceLookup(query), 350);
  }

  async function choosePlaceSuggestion(item) {
    if (item.kind === "local" && item.restaurant) {
      jumpToPlace(item.restaurant);
      return;
    }
    if (item.kind === "custom") {
      hidePlaceSuggest();
      commitCustomPlace(
        {
          name: item.name,
          area: addArea.value.trim() || item.area || "",
          cuisine: addCuisine.value.trim() || item.cuisine || "",
          googleRating: parseGoogleRating(addGoogle.value),
          tags: ["added_by_you"],
        },
        { confirmDuplicate: true }
      );
      return;
    }
    hidePlaceSuggest();
    addName.value = item.name;
    addArea.value = item.area || addArea.value;
    addCuisine.value = item.cuisine || addCuisine.value;
    let partial = {
      name: item.name,
      area: item.area || "",
      cuisine: item.cuisine || "",
      lat: item.lat,
      lng: item.lng,
      sources: item.sources || [],
      external: item.external || null,
      tags: ["added_by_you"],
    };
    if (item.provider === "google" && item.placeId && hasGoogleKey()) {
      setStatus(`Looking up ${item.name}…`);
      try {
        const details = await fetchGooglePlaceDetails(item.placeId);
        partial = {
          ...partial,
          ...details,
          name: details.name || item.name,
          cuisine: details.cuisine || item.cuisine || "",
        };
        if (details.googleRating != null) {
          addGoogle.value = String(details.googleRating);
          partial.googleRating = details.googleRating;
        }
        addName.value = partial.name;
        addArea.value = partial.area || addArea.value;
        addCuisine.value = partial.cuisine || addCuisine.value;
      } catch (err) {
        setStatus(`Couldn’t load Google details (${err.message}); adding with suggestion text.`, true);
      }
    }
    const existing = findExistingPlace(partial);
    if (existing) {
      jumpToPlace(existing);
      return;
    }
    commitCustomPlace(partial, { confirmDuplicate: false });
  }

  function addCustomPlace(event) {
    event.preventDefault();
    if (!placeSuggestList.hidden && suggestActive >= 0 && suggestItems[suggestActive]) {
      choosePlaceSuggestion(suggestItems[suggestActive]);
      return;
    }
    const name = addName.value.trim();
    if (!name) {
      setStatus("Name is required to add a place.", true);
      addName.focus();
      return;
    }
    commitCustomPlace(
      {
        name,
        area: addArea.value.trim(),
        cuisine: addCuisine.value.trim(),
        googleRating: parseGoogleRating(addGoogle.value),
        tags: ["added_by_you"],
      },
      { confirmDuplicate: true }
    );
  }

  function bindUI() {
    document.querySelectorAll(".seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        statusFilter = btn.dataset.status;
        document.querySelectorAll(".seg").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        renderList();
      });
    });

    areaSelect.addEventListener("change", () => {
      areaFilter = areaSelect.value;
      renderList();
    });

    cuisineSelect.addEventListener("change", () => {
      cuisineFilter = cuisineSelect.value;
      renderList();
    });

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      renderList();
    });

    addForm.addEventListener("submit", addCustomPlace);
    addName.addEventListener("input", schedulePlaceLookup);
    addName.addEventListener("focus", () => {
      if (addName.value.trim().length >= 2) schedulePlaceLookup();
    });
    addName.addEventListener("keydown", (e) => {
      if (placeSuggestList.hidden || !suggestItems.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        suggestActive = Math.min(suggestItems.length - 1, suggestActive + 1);
        renderPlaceSuggest(suggestItems, {
          providerHint: suggestProviderHint(),
          query: addName.value.trim(),
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        suggestActive = Math.max(0, suggestActive - 1);
        renderPlaceSuggest(suggestItems, {
          providerHint: suggestProviderHint(),
          query: addName.value.trim(),
        });
      } else if (e.key === "Enter" && suggestActive >= 0) {
        e.preventDefault();
        choosePlaceSuggestion(suggestItems[suggestActive]);
      } else if (e.key === "Escape") {
        hidePlaceSuggest();
      }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".add-panel")) hidePlaceSuggest();
    });
    $("#btn-places-settings").addEventListener("click", () => {
      const open = placesSettings.hidden;
      placesSettings.hidden = !open;
      $("#btn-places-settings").setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        refreshPlacesProviderStatus();
        googleKeyInput.focus();
      }
    });
    $("#btn-save-key").addEventListener("click", () => {
      settings.googlePlacesApiKey = googleKeyInput.value.trim();
      googleSessionError = "";
      saveSettings();
      setStatus(
        settings.googlePlacesApiKey
          ? "Google Places key saved in this browser. Suggestions will use Google when possible."
          : "Cleared. Suggestions will use OpenStreetMap."
      );
    });
    $("#btn-clear-key").addEventListener("click", () => {
      googleKeyInput.value = "";
      settings.googlePlacesApiKey = "";
      googleSessionError = "";
      saveSettings();
      setStatus("Using OpenStreetMap for place suggestions.");
    });
    $("#btn-suggest").addEventListener("click", pickSuggestions);
    $("#suggest-close").addEventListener("click", () => {
      suggestPanel.hidden = true;
    });
    $("#btn-nearby").addEventListener("click", requestNearby);
    $("#btn-export").addEventListener("click", exportState);
    $("#import-file").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importState(file);
      e.target.value = "";
    });
  }

  async function init() {
    loadState();
    loadSettings();
    bindUI();
    refreshPlacesProviderStatus();
    rebuildRestaurants();
    try {
      const res = await fetch("restaurants.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      curated = Array.isArray(data) ? data : data.restaurants || [];
      if (curated.length === 0) throw new Error("No restaurants in JSON");
      try {
        const seedRes = await fetch("autocomplete-seed.json");
        if (seedRes.ok) {
          const seedData = await seedRes.json();
          autocompleteSeed = Array.isArray(seedData) ? seedData : seedData.places || [];
        }
      } catch {
        autocompleteSeed = [];
      }
      rebuildRestaurants();
      refreshFilterOptions();
      updateStats();
      renderList();
    } catch (err) {
      refreshFilterOptions();
      updateStats();
      renderList();
      emptyEl.hidden = restaurants.length === 0;
      if (restaurants.length === 0) {
        emptyEl.textContent = `Couldn’t load restaurants.json (${err.message}). Serve this folder over HTTP (e.g. python3 -m http.server) — file:// often blocks fetch.`;
      } else {
        setStatus(`Curated list failed to load (${err.message}); showing your added places.`, true);
      }
    }
  }

  init();
})();
