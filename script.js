let allSubmissions = [];

// Active table filters. Each maps to a URL parameter of the same name so a
// filtered view can be linked to directly.
const activeFilters = {
  keyword: null,
  theme: null,
  project: null
};

const FILTER_LABELS = {
  keyword: "Keyword",
  theme: "Theme",
  project: "Project"
};

function scheduleEmbedResize() {
  window.HelixEmbed?.scheduleResize();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function navigateToEntry(id, ref) {
  window.location.href = ref
    ? `entry.html?ref=${encodeURIComponent(ref)}`
    : `entry.html?id=${encodeURIComponent(id)}`;
}

function renderTable(rows) {
  const tbody = document.getElementById("submissions-body");

  if (!tbody) {
    return;
  }

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="loading-cell">No submissions found.</td>
      </tr>
    `;
    scheduleEmbedResize();
    return;
  }

  tbody.innerHTML = rows.map(item => `
    <tr class="table-row-link" data-id="${escapeHtml(item.response_id)}" data-ref="${escapeHtml(item.ref || "")}" tabindex="0" role="link" aria-label="Open ${escapeHtml(item.title || "Untitled")}">
      <td data-label="Title">
        <span class="cell-title">${escapeHtml(item.title || "Untitled")}</span>
        ${Array.isArray(item.helix_authors) && item.helix_authors.length
          ? `<span class="cell-authors">${escapeHtml(item.helix_authors.join(", "))}</span>`
          : ""}
      </td>
      <td data-label="Project">${item.subproject
        ? `<button type="button" class="filter-pill filter-pill--project" data-filter="project" data-value="${escapeHtml(item.subproject)}">${escapeHtml(item.subproject)}</button>`
        : "-"}</td>
      <td data-label="Theme">${item.theme
        ? `<button type="button" class="filter-pill filter-pill--theme" data-filter="theme" data-value="${escapeHtml(item.theme)}">${escapeHtml(item.theme)}</button>`
        : "-"}</td>
      <td data-label="Publication Date">${escapeHtml(item.project_date || "-")}</td>
    </tr>
  `).join("");

  document.querySelectorAll(".table-row-link").forEach(row => {
    row.addEventListener("click", () => {
      navigateToEntry(row.getAttribute("data-id"), row.getAttribute("data-ref"));
    });

    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigateToEntry(row.getAttribute("data-id"), row.getAttribute("data-ref"));
      }
    });
  });

  // Theme/project pills filter the table. They sit inside a clickable row, so
  // the click must not also open the entry.
  document.querySelectorAll(".filter-pill").forEach(pill => {
    pill.addEventListener("click", event => {
      event.stopPropagation();
      const type = pill.getAttribute("data-filter");
      const value = pill.getAttribute("data-value");
      setFilter(type, activeFilters[type] === value ? null : value);
    });

    pill.addEventListener("keydown", event => {
      // Stop Enter/Space from bubbling up and opening the row.
      if (event.key === "Enter" || event.key === " ") {
        event.stopPropagation();
      }
    });
  });

  scheduleEmbedResize();
}

function getFilteredRows() {
  let rows = allSubmissions;

  if (activeFilters.keyword) {
    rows = rows.filter(item =>
      Array.isArray(item.keywords) && item.keywords.includes(activeFilters.keyword)
    );
  }

  if (activeFilters.theme) {
    rows = rows.filter(item => item.theme === activeFilters.theme);
  }

  if (activeFilters.project) {
    rows = rows.filter(item => item.subproject === activeFilters.project);
  }

  const query = document.getElementById("search-input")?.value.trim().toLowerCase();

  if (query) {
    rows = rows.filter(item =>
      [
        item.title,
        item.corresponding_team_member,
        item.theme,
        item.subproject,
        item.lead_or_contributed,
        item.source_type,
        item.short_description,
        item.lay_summary,
        Array.isArray(item.helix_authors) ? item.helix_authors.join(" ") : "",
        Array.isArray(item.keywords) ? item.keywords.join(" ") : ""
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }

  return rows;
}

function handleSearch() {
  renderTable(getFilteredRows());
}

function renderFilterBar() {
  const filterBar = document.getElementById("filter-bar");

  if (!filterBar) {
    return;
  }

  const active = Object.keys(activeFilters).filter(key => activeFilters[key]);

  if (!active.length) {
    filterBar.hidden = true;
    filterBar.replaceChildren();
    return;
  }

  filterBar.replaceChildren();

  active.forEach(key => {
    const label = document.createElement("span");
    label.className = "filter-bar__label";
    label.textContent = FILTER_LABELS[key];

    const chip = document.createElement("span");
    chip.className = `filter-chip filter-chip--${key}`;

    const text = document.createElement("span");
    text.textContent = activeFilters[key];

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "filter-chip__remove";
    remove.setAttribute("aria-label", `Clear ${FILTER_LABELS[key].toLowerCase()} filter`);
    remove.textContent = "×";
    remove.addEventListener("click", () => setFilter(key, null));

    chip.append(text, remove);
    filterBar.append(label, chip);
  });

  filterBar.hidden = false;
}

function setFilter(type, value) {
  if (!(type in activeFilters)) {
    return;
  }

  activeFilters[type] = value || null;

  const url = new URL(window.location.href);

  if (activeFilters[type]) {
    url.searchParams.set(type, activeFilters[type]);
  } else {
    url.searchParams.delete(type);
  }

  window.history.replaceState({}, "", url);

  renderFilterBar();
  renderTable(getFilteredRows());
}

async function loadSubmissions() {
  try {
    const response = await fetch("data/submissions.json");

    if (!response.ok) {
      throw new Error(`Submissions request failed with ${response.status}`);
    }

    const data = await response.json();
    allSubmissions = Array.isArray(data) ? data : [];

    // Newest publication first. Entries whose date couldn't be parsed (older
    // free-text submissions) fall back to when they were submitted, so they
    // still appear in a sensible place rather than jumping to the top.
    allSubmissions.sort((a, b) => {
      const aDate = a.publication_date_iso || a.recorded_date || "";
      const bDate = b.publication_date_iso || b.recorded_date || "";
      return bDate.localeCompare(aDate);
    });

    const params = new URLSearchParams(window.location.search);
    Object.keys(activeFilters).forEach(key => {
      activeFilters[key] = params.get(key) || null;
    });

    renderFilterBar();
    renderTable(getFilteredRows());

    document.getElementById("search-input")?.addEventListener("input", handleSearch);
  } catch (error) {
    console.error(error);

    const tbody = document.getElementById("submissions-body");

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="loading-cell">Could not load submissions.</td>
        </tr>
      `;
    }

    scheduleEmbedResize();
  }
}

loadSubmissions();
