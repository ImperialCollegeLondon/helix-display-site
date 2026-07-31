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

// Longer lists are split into pages so the embed doesn't grow indefinitely.
const PAGE_SIZE = 15;
let currentPage = 1;

// Submissions that aren't part of a research theme pick "One-off Project".
// That's a bookkeeping answer rather than a theme, so it isn't displayed or
// offered as a filter — the table shows "-" and detail pages omit it.
const ONE_OFF_THEME = "one-off project";

function isRealTheme(theme) {
  return Boolean(theme) && theme.trim().toLowerCase() !== ONE_OFF_THEME;
}

// Likewise, work that doesn't belong to a subproject is marked "N/A", which
// is bookkeeping rather than a project name: the table shows "-" and no filter.
function isRealProject(project) {
  return Boolean(project) && !["n/a", "na", "none"].includes(project.trim().toLowerCase());
}

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

// Authors come through as free text now. Older entries stored a list of Helix
// authors, so both are handled.
function authorsText(item) {
  if (item.authors) {
    return item.authors;
  }

  return Array.isArray(item.helix_authors) ? item.helix_authors.join(", ") : "";
}

function navigateToEntry(id, ref) {
  window.location.href = ref
    ? `entry.html?ref=${encodeURIComponent(ref)}`
    : `entry.html?id=${encodeURIComponent(id)}`;
}

function renderTable(allRows) {
  const tbody = document.getElementById("submissions-body");

  if (!tbody) {
    return;
  }

  if (!allRows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="loading-cell">No submissions found.</td>
      </tr>
    `;
    renderPager(0, 0);
    scheduleEmbedResize();
    return;
  }

  const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(currentPage, 1), pageCount);

  const start = (currentPage - 1) * PAGE_SIZE;
  const rows = allRows.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = rows.map(item => `
    <tr class="table-row-link" data-id="${escapeHtml(item.response_id)}" data-ref="${escapeHtml(item.ref || "")}" tabindex="0" role="link" aria-label="Open ${escapeHtml(item.title || "Untitled")}">
      <td data-label="Title">
        <span class="cell-title">${escapeHtml(item.title || "Untitled")}</span>
        ${authorsText(item)
          ? `<span class="cell-authors">${escapeHtml(authorsText(item))}</span>`
          : ""}
      </td>
      <td data-label="Theme">${isRealTheme(item.theme)
        ? `<button type="button" class="filter-pill filter-pill--theme" data-filter="theme" data-value="${escapeHtml(item.theme)}">${escapeHtml(item.theme)}</button>`
        : "-"}</td>
      <td data-label="Project">${isRealProject(item.subproject)
        ? `<button type="button" class="filter-pill filter-pill--project" data-filter="project" data-value="${escapeHtml(item.subproject)}">${escapeHtml(item.subproject)}</button>`
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

  renderPager(allRows.length, pageCount);
  scheduleEmbedResize();
}

function goToPage(page) {
  currentPage = page;
  renderTable(getFilteredRows());

  // Bring the top of the list into view — inside the embed that means asking
  // the parent page, which can't be scrolled directly from here.
  window.scrollTo({ top: 0 });
  window.parent?.postMessage(
    { type: "helix-display-site:navigate", page: "index", scrollToTop: true },
    "*"
  );
}

function renderPager(totalRows, pageCount) {
  const pager = document.getElementById("pager");

  if (!pager) {
    return;
  }

  if (pageCount <= 1) {
    pager.hidden = true;
    pager.replaceChildren();
    return;
  }

  const first = (currentPage - 1) * PAGE_SIZE + 1;
  const last = Math.min(currentPage * PAGE_SIZE, totalRows);

  const status = document.createElement("p");
  status.className = "pager__status";
  status.textContent = `${first}–${last} of ${totalRows}`;

  const controls = document.createElement("div");
  controls.className = "pager__controls";

  const makeButton = (label, page, disabled, ariaLabel) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pager__button";
    button.textContent = label;
    button.disabled = disabled;
    if (ariaLabel) {
      button.setAttribute("aria-label", ariaLabel);
    }
    button.addEventListener("click", () => goToPage(page));
    return button;
  };

  controls.appendChild(
    makeButton("← Previous", currentPage - 1, currentPage === 1, "Previous page")
  );

  for (let page = 1; page <= pageCount; page += 1) {
    const button = makeButton(String(page), page, false, `Page ${page}`);
    if (page === currentPage) {
      button.classList.add("pager__button--current");
      button.setAttribute("aria-current", "page");
    }
    controls.appendChild(button);
  }

  controls.appendChild(
    makeButton("Next →", currentPage + 1, currentPage === pageCount, "Next page")
  );

  pager.replaceChildren(status, controls);
  pager.hidden = false;
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
        authorsText(item),
        item.theme,
        item.subproject,
        item.led_or_contributed,
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
  // Any change to what's being shown starts again at page one.
  currentPage = 1;
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

  currentPage = 1;
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
