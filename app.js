(() => {
  "use strict";

  const STORAGE_KEY = "cbe-picker-visited-v1";

  /** @type {Array<Object>} */
  let restaurants = [];
  /** @type {Set<string>} */
  let visited = new Set();
  /** @type {"all"|"untried"|"visited"} */
  let statusFilter = "all";
  let areaFilter = "";
  let searchQuery = "";
  /** @type {{lat:number,lng:number}|null} */
  let userCoords = null;
  let sortByDistance = false;

  const $ = (sel) => document.querySelector(sel);
  const listEl = $("#restaurant-list");
  const emptyEl = $("#empty-state");
  const listMeta = $("#list-meta");
  const areaSelect = $("#area-filter");
  const searchInput = $("#search");
  const geoStatus = $("#geo-status");
  const suggestPanel = $("#suggest-panel");
  const suggestList = $("#suggest-list");
  const suggestTitle = $("#suggest-title");

  function loadVisited() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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

  function saveVisited() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
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

  function updateStats() {
    const total = restaurants.length;
    const v = [...visited].filter((id) => restaurants.some((r) => r.id === id)).length;
    $("#stat-total").textContent = String(total);
    $("#stat-visited").textContent = String(v);
    $("#stat-remaining").textContent = String(total - v);
  }

  function populateAreas() {
    const areas = [...new Set(restaurants.map((r) => r.area))].sort((a, b) =>
      a.localeCompare(b)
    );
    for (const area of areas) {
      const opt = document.createElement("option");
      opt.value = area;
      opt.textContent = area;
      areaSelect.appendChild(opt);
    }
  }

  function matchesFilters(r) {
    const isVisited = visited.has(r.id);
    if (statusFilter === "untried" && isVisited) return false;
    if (statusFilter === "visited" && !isVisited) return false;
    if (areaFilter && r.area !== areaFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay = `${r.name} ${r.cuisine}`.toLowerCase();
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

  function renderCard(r) {
    const li = document.createElement("li");
    li.className = "card" + (visited.has(r.id) ? " is-visited" : "");
    li.dataset.id = r.id;

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
            .map((url, i) => {
              let label = "Source";
              try {
                label = new URL(url).hostname.replace(/^www\./, "");
              } catch {
                /* keep */
              }
              return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}${i === 0 && sources.length > 1 ? "" : ""}</a>`;
            })
            .join(" · ")}</p>`
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
        </div>
        <p class="card-meta">
          <span>${escapeHtml(r.area)}</span>
          <span class="sep">·</span>
          <span>${escapeHtml(r.cuisine)}</span>
        </p>
        <p class="blurb">${escapeHtml(r.blurb || "")}</p>
        <ul class="tags">${tagsHtml}</ul>
        ${distanceHtml}
        ${linksHtml}
      </div>
    `;

    const cb = li.querySelector(".visit-cb");
    cb.addEventListener("change", () => {
      if (cb.checked) visited.add(r.id);
      else visited.delete(r.id);
      saveVisited();
      updateStats();
      renderList();
    });

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
    const filtered = getFiltered();
    listEl.innerHTML = "";
    if (filtered.length === 0) {
      emptyEl.hidden = false;
      listMeta.textContent = "Showing 0 restaurants";
    } else {
      emptyEl.hidden = true;
      const frag = document.createDocumentFragment();
      for (const r of filtered) frag.appendChild(renderCard(r));
      listEl.appendChild(frag);
      let meta = `Showing ${filtered.length} of ${restaurants.length}`;
      if (sortByDistance && userCoords) meta += " · sorted by distance";
      listMeta.textContent = meta;
    }
  }

  function pickSuggestions() {
    const untried = restaurants.filter((r) => !visited.has(r.id));
    if (untried.length === 0) {
      suggestTitle.textContent = "You're caught up!";
      suggestList.innerHTML =
        '<p class="suggest-reason">Every place on the list is marked visited. Uncheck a few — or import a leaner backup — to get fresh picks.</p>';
      suggestPanel.hidden = false;
      return;
    }

    const count = Math.min(3, untried.length);
    const shuffled = [...untried].sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, count);

    suggestTitle.textContent =
      count === 1 ? "Tonight’s pick" : `${count} ideas for you`;
    suggestList.innerHTML = "";

    for (const r of picks) {
      const reason = suggestionReason(r, untried);
      const card = document.createElement("div");
      card.className = "suggest-card";
      card.innerHTML = `
        <h3>${escapeHtml(r.name)}</h3>
        <p class="suggest-meta">${escapeHtml(r.area)} · ${escapeHtml(r.cuisine)} · ${escapeHtml(r.price || "")}</p>
        <p class="suggest-reason">${escapeHtml(reason)}</p>
      `;
      suggestList.appendChild(card);
    }
    suggestPanel.hidden = false;
    suggestPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function suggestionReason(r, pool) {
    const tags = r.tags || [];
    const parts = [];
    if (tags.includes("fine_dining")) parts.push("a special-occasion fine dining stop");
    else if (tags.includes("vegetarian")) parts.push("a solid vegetarian-forward pick");
    else if (tags.includes("bar")) parts.push("good for drinks and small plates");
    else if (tags.includes("hotel")) parts.push("reliable hotel dining");
    else if (tags.includes("highly_rated")) parts.push("frequently recommended around town");

    if (r.price && r.price.length <= 2) parts.push("easy on the wallet");
    else if (r.price && r.price.length >= 4) parts.push("worth dressing up a bit");

    const areaCount = pool.filter((x) => x.area === r.area).length;
    if (areaCount === 1) parts.push(`the only untried spot left in ${r.area}`);
    else parts.push(`untried in ${r.area}`);

    if (parts.length === 0) return `Random untried pick — ${r.cuisine}.`;
    const lead = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return `${lead}${parts.length > 1 ? " · " + parts.slice(1).join(" · ") : ""}.`;
  }

  function requestNearby() {
    geoStatus.classList.remove("is-error");
    geoStatus.textContent = "Requesting location…";

    if (!navigator.geolocation) {
      geoStatus.classList.add("is-error");
      geoStatus.textContent =
        "Geolocation isn’t available in this browser. Sorting skipped — list unchanged.";
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
        geoStatus.textContent = `Location on · ${withCoords} untried with coords sorted nearest-first${
          without ? `; ${without} without coords listed last` : ""
        }.`;
        renderList();
      },
      (err) => {
        sortByDistance = false;
        userCoords = null;
        geoStatus.classList.add("is-error");
        const msg =
          err && err.code === 1
            ? "Location permission denied — nearby sort skipped. You can still browse and filter normally."
            : "Couldn’t get location — nearby sort skipped. Browse and filter as usual.";
        geoStatus.textContent = msg;
        renderList();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  function exportVisited() {
    const payload = {
      exportedAt: new Date().toISOString(),
      city: "Coimbatore",
      visited: [...visited],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coimbatore-visited.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importVisited(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        let ids = [];
        if (Array.isArray(data)) ids = data;
        else if (data && Array.isArray(data.visited)) ids = data.visited;
        else throw new Error("Expected { visited: string[] } or a string array");
        const valid = new Set(restaurants.map((r) => r.id));
        visited = new Set(ids.filter((id) => typeof id === "string" && valid.has(id)));
        saveVisited();
        updateStats();
        renderList();
        geoStatus.classList.remove("is-error");
        geoStatus.textContent = `Imported ${visited.size} visited place(s).`;
      } catch (e) {
        geoStatus.classList.add("is-error");
        geoStatus.textContent = `Import failed: ${e.message || "invalid JSON"}`;
      }
    };
    reader.readAsText(file);
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

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      renderList();
    });

    $("#btn-suggest").addEventListener("click", pickSuggestions);
    $("#suggest-close").addEventListener("click", () => {
      suggestPanel.hidden = true;
    });
    $("#btn-nearby").addEventListener("click", requestNearby);
    $("#btn-export").addEventListener("click", exportVisited);
    $("#import-file").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importVisited(file);
      e.target.value = "";
    });
  }

  async function init() {
    loadVisited();
    bindUI();
    try {
      const res = await fetch("restaurants.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      restaurants = Array.isArray(data) ? data : data.restaurants || [];
      if (restaurants.length === 0) throw new Error("No restaurants in JSON");
      populateAreas();
      updateStats();
      renderList();
    } catch (err) {
      listMeta.textContent = "";
      emptyEl.hidden = false;
      emptyEl.textContent = `Couldn’t load restaurants.json (${err.message}). Serve this folder over HTTP (e.g. python3 -m http.server) — file:// often blocks fetch.`;
    }
  }

  init();
})();
