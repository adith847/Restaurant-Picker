(() => {
  "use strict";

  const STORAGE_KEY_V1 = "cbe-picker-visited-v1";
  const STORAGE_KEY = "cbe-picker-state-v2";

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

  function addCustomPlace(event) {
    event.preventDefault();
    const name = addName.value.trim();
    if (!name) {
      setStatus("Name is required to add a place.", true);
      addName.focus();
      return;
    }

    const existing = restaurants.find(
      (r) => r.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      const again = window.confirm(
        `“${existing.name}” is already on the list. Add another copy anyway?`
      );
      if (!again) {
        searchInput.value = name;
        searchQuery = name;
        renderList();
        document.querySelector(`.card[data-id="${CSS.escape(existing.id)}"]`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setStatus(`${existing.name} is already listed — jumped to it.`);
        return;
      }
    }

    const place = normalizeCustomPlace({
      id: newCustomId(name),
      name,
      area: addArea.value.trim(),
      cuisine: addCuisine.value.trim(),
      googleRating: parseGoogleRating(addGoogle.value),
      tags: ["added_by_you"],
      custom: true,
      createdAt: new Date().toISOString(),
    });
    customPlaces.push(place);
    saveState();
    rebuildRestaurants();
    refreshFilterOptions();
    updateStats();
    addForm.reset();
    searchInput.value = "";
    searchQuery = "";
    renderList();
    requestAnimationFrame(() => {
      document.querySelector(`.card[data-id="${CSS.escape(place.id)}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    setStatus(`Added ${place.name} to your list.`);
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
    bindUI();
    rebuildRestaurants();
    try {
      const res = await fetch("restaurants.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      curated = Array.isArray(data) ? data : data.restaurants || [];
      if (curated.length === 0) throw new Error("No restaurants in JSON");
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
