let allSubmissions = [];

// Active table filters. Each maps to a URL parameter of the same name so a
// filtered view can be linked to directly.
const activeFilters = {
  keyword: null,
  theme: null,
  project: null,
  type: null
};

const FILTER_LABELS = {
  keyword: "Keyword",
  theme: "Theme",
  project: "Project",
  type: "Type"
};

// How the table is arranged. "date" is the default and leaves the table
// exactly as it was before grouping existed: newest first, no headings.
let groupBy = "date";

const GROUP_LABELS = {
  theme: "Theme",
  project: "Project",
  type: "Type of publication"
};

// Entries that don't belong to a group still have to go somewhere.
const UNGROUPED = "Other";

function groupValue(item) {
  if (groupBy === "theme") {
    return isRealTheme(item.theme) ? item.theme.trim() : UNGROUPED;
  }

  if (groupBy === "project") {
    return isRealProject(item.subproject) ? item.subproject.trim() : UNGROUPED;
  }

  if (groupBy === "type") {
    return (item.source_type || "").trim() || UNGROUPED;
  }

  return "";
}

// Groups run newest-first by their most recent entry, so the top of the page
// is still the most recent work — the same impression the date order gives.
// "Other" always sits last, whatever its dates. Within a group, newest first.
function arrangeRows(rows) {
  if (groupBy === "date") {
    return rows;
  }

  const newest = new Map();

  rows.forEach(item => {
    const key = groupValue(item);
    const date = item.publication_date_iso || item.recorded_date || "";

    if (!newest.has(key) || date > newest.get(key)) {
      newest.set(key, date);
    }
  });

  return [...rows].sort((a, b) => {
    const aKey = groupValue(a);
    const bKey = groupValue(b);

    if (aKey !== bKey) {
      if (aKey === UNGROUPED) return 1;
      if (bKey === UNGROUPED) return -1;
      return newest.get(bKey).localeCompare(newest.get(aKey));
    }

    const aDate = a.publication_date_iso || a.recorded_date || "";
    const bDate = b.publication_date_iso || b.recorded_date || "";
    return bDate.localeCompare(aDate);
  });
}

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

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

// "9 Jan 26" for the table, to keep the column narrow. The detail page still
// shows the date in full. Built from the sortable ISO date rather than by
// trimming the display text, so it doesn't depend on how the date was typed.
function shortDate(item) {
  const iso = (item.publication_date_iso || "").trim();
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    // A date the build couldn't read is shown exactly as it was submitted,
    // rather than guessed at or dropped.
    return item.project_date || "-";
  }

  const [, year, month, day] = match;
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1]} ${year.slice(2)}`;
}

// The date as it should read in the table, or "" if there isn't one.
function dateText(item) {
  const text = shortDate(item);
  return text === "-" ? "" : text;
}

// Turns a submitted value into a safe outgoing link, or "" if it isn't one.
//
// Two things to guard against. A relative value ("BMJ Open") resolves against
// this site, producing a link to a page of ours that doesn't exist, so only
// absolute addresses are accepted. But people reasonably type "bmjopen.bmj.com"
// without the scheme, so a bare domain is accepted and https:// added.
function publicUrl(value) {
  const text = String(value ?? "").trim();

  if (!text || /\s/.test(text)) {
    return "";
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  const looksLikeDomain = /^[^\s/@]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text);
  const candidate = hasScheme ? text : (looksLikeDomain ? `https://${text}` : "");

  if (!candidate) {
    return "";
  }

  try {
    const url = new URL(candidate);
    return (url.protocol === "http:" || url.protocol === "https:") ? url.href : "";
  } catch {
    return "";
  }
}

// The publisher leads, with the kind of output beneath it — the same shape as
// authors under a title. Either part may be missing: a blog post often has no
// publisher, and the type is only absent on very old entries.
//
// Neither part is a link. The only link worth following from here is the work
// itself, on its detail page; sending people to a journal homepage was noise.
function publishedCell(item) {
  const publisher = (item.publisher || "").trim();
  const type = (item.source_type || "").trim();
  const date = dateText(item);

  if (!publisher && !type && !date) {
    return "-";
  }

  // Each part on its own line: what it is, where it was published, then when.
  // No separators — the line breaks do that work, and a dot left at the end of
  // a wrapped line reads as a typo. The date is the only part set smaller: it
  // is the one people scan past rather than read.
  const kind = type
    ? `<span class="pub-line">${filterPill("type", type)}</span>`
    : "";

  const name = publisher
    ? `<span class="pub-line">${escapeHtml(publisher)}</span>`
    : "";

  const when = date
    ? `<span class="pub-date">${escapeHtml(date)}</span>`
    : "";

  return kind + name + when;
}

// The label sits in its own span so the underline can be put on the label
// alone, leaving room for a trailing chevron inside the button that isn't
// underlined. Putting the chevron inside matters: as a separate element after
// the button it could be pushed onto a line of its own, and a non-breaking
// space couldn't prevent that, because the break was happening at the element
// boundary rather than at a space.
function filterPill(type, value, trailing = "") {
  return `<button type="button" class="filter-pill filter-pill--${type}" data-filter="${type}" data-value="${escapeHtml(value)}">` +
    `<span class="filter-pill__label">${escapeHtml(value)}</span>${trailing}</button>`;
}

// Theme and project in one column, read as a breadcrumb: a project sits inside
// a theme, so "Dementia › Minder". Both halves stay separate filters. Either
// can be missing — a lot of work has no subproject, and one-off work has no
// theme — in which case only the part that exists is shown, with no stray
// chevron, and a dash if there's neither.
function themeProjectCell(item) {
  const parts = [];
  const hasTheme = isRealTheme(item.theme);
  const hasProject = isRealProject(item.subproject);

  // The chevron trails the theme, pointing down into the project on the line
  // below. Bound to the theme's last word by a non-breaking space, and only
  // drawn when there is a project for it to point at.
  const chevron = hasTheme && hasProject
    ? '<span class="crumb" aria-hidden="true">\u00a0\u203a</span>'
    : "";

  if (hasTheme) {
    parts.push(filterPill("theme", item.theme, chevron));
  }

  if (hasProject) {
    parts.push(filterPill("project", item.subproject));
  }

  if (!parts.length) {
    return "-";
  }

  return parts
    .map(pill => `<span class="tp-part">${pill}</span>`)
    .join("");
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

// How many lines of names the table shows before trimming.
const AUTHORS_LINES = 2;

// A long author list has to be shortened somewhere, and cutting on width alone
// lands mid-name ("Nur Amalina Che Bak…"), which reads as a mistake and can
// misname someone. Cutting on a character count instead is safe but wasteful:
// it has to assume the narrowest case, so most lists stop well short of the
// space available.
//
// So the full list is rendered and then measured: whole names are dropped from
// the end, one at a time, until it fits two lines. The result fills the space
// and only ever breaks between names. At least one name is always kept.
function fitAuthors(element) {
  const full = element.dataset.authors || "";
  const names = full.split(",").map(name => name.trim()).filter(Boolean);

  element.textContent = full;

  if (names.length < 2) {
    return;
  }

  const styles = getComputedStyle(element);
  let lineHeight = parseFloat(styles.lineHeight);

  // "normal" doesn't parse to a number. Estimate from the font size rather
  // than giving up, which would leave the list untrimmed.
  if (!lineHeight) {
    lineHeight = parseFloat(styles.fontSize) * 1.4;
  }

  if (!lineHeight) {
    return;
  }

  // A pixel of tolerance: browsers round line boxes slightly differently.
  const limit = lineHeight * AUTHORS_LINES + 1;

  for (let count = names.length; count > 1; count -= 1) {
    if (element.scrollHeight <= limit) {
      return;
    }

    element.textContent = `${names.slice(0, count - 1).join(", ")}…`;
  }
}

function fitAllAuthors() {
  document.querySelectorAll(".cell-authors").forEach(fitAuthors);
}

// The fit depends on the width of the column and on the font actually in use,
// and both arrive late: the table is measured before Circular has finished
// loading, and the embed can be resized by the parent page without the window
// itself changing size. Either leaves lists sitting on three lines. So the
// measurement is repeated once the font is ready, and whenever the table's
// own width changes.
function watchAuthorFit() {
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      fitAllAuthors();
      scheduleEmbedResize();
    });
  }

  const table = document.querySelector(".table-wrap");

  if (!table || !("ResizeObserver" in window)) {
    return;
  }

  let lastWidth = Math.round(table.getBoundingClientRect().width);

  const observer = new ResizeObserver(() => {
    const width = Math.round(table.getBoundingClientRect().width);

    // Height changes constantly as rows are trimmed; only width matters here,
    // and ignoring height keeps this from feeding itself.
    if (width === lastWidth) {
      return;
    }

    lastWidth = width;
    fitAllAuthors();
    scheduleEmbedResize();
  });

  observer.observe(table);
}

// Everything that describes "the list as the reader left it". Carried into the
// entry URL so the link back can restore it: without this, returning from a
// summary always landed on the unfiltered first page.
const VIEW_KEYS = ["theme", "project", "type", "keyword", "organise", "q", "page"];

function currentView() {
  const view = new URLSearchParams();

  Object.keys(activeFilters).forEach(key => {
    if (activeFilters[key]) {
      view.set(key, activeFilters[key]);
    }
  });

  if (groupBy !== "date") {
    view.set("organise", groupBy);
  }

  const query = document.getElementById("search-input")?.value.trim();

  if (query) {
    view.set("q", query);
  }

  if (currentPage > 1) {
    view.set("page", String(currentPage));
  }

  return view;
}

function navigateToEntry(id, ref) {
  const params = currentView();

  if (ref) {
    params.set("ref", ref);
  } else {
    params.set("id", id);
  }

  window.location.href = `entry.html?${params.toString()}`;
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

  allRows = arrangeRows(allRows);

  const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(currentPage, 1), pageCount);

  const start = (currentPage - 1) * PAGE_SIZE;
  const rows = allRows.slice(start, start + PAGE_SIZE);

  // A heading is drawn whenever the group changes, and also on the first row
  // of a page — so a group running across a page break is still labelled.
  let lastGroup = null;

  tbody.innerHTML = rows.map(item => {
    let heading = "";

    if (groupBy !== "date") {
      const key = groupValue(item);

      if (key !== lastGroup) {
        heading = `<tr class="group-heading"><th colspan="4" scope="colgroup">${escapeHtml(key)}</th></tr>`;
        lastGroup = key;
      }
    }

    return heading + `
    <tr class="table-row-link" data-id="${escapeHtml(item.response_id)}" data-ref="${escapeHtml(item.ref || "")}" tabindex="0" role="link" aria-label="Open ${escapeHtml(item.title || "Untitled")}">
      <td data-label="Image" class="cell-thumb">
        ${item.thumbnail_path
          ? `<img class="thumb" src="${escapeHtml(item.thumbnail_path)}" alt="" loading="lazy" />`
          : `<span class="thumb thumb--empty"></span>`}
      </td>
      <td data-label="Title">
        <span class="cell-title">${escapeHtml(item.title || "Untitled")}</span>
        ${authorsText(item)
          ? `<span class="cell-authors" data-authors="${escapeHtml(authorsText(item))}">${escapeHtml(authorsText(item))}</span>`
          : ""}
      </td>
      <td data-label="Theme &amp; project">${themeProjectCell(item)}</td>
      <td data-label="Publication details">${publishedCell(item)}</td>
    </tr>
  `;
  }).join("");

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

  // Measured after the rows are in the document, so the real column width is
  // known. Re-run on resize, since the width changes with it.
  fitAllAuthors();

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

  if (activeFilters.type) {
    rows = rows.filter(item => item.source_type === activeFilters.type);
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
        item.publisher,
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

  // Tell the parent page so its address bar matches what's on screen and the
  // filtered view can be copied and shared. Not a page change, so no scroll.
  window.HelixEmbed?.notifyNavigation?.();

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

    const search = document.getElementById("search-input");
    const query = params.get("q");

    if (search && query) {
      search.value = query;
    }

    const page = Number.parseInt(params.get("page") || "", 10);

    if (Number.isFinite(page) && page > 1) {
      currentPage = page;
    }

    const organise = document.getElementById("organise-select");
    const requested = params.get("organise");

    if (organise && requested && requested in GROUP_LABELS) {
      groupBy = requested;
      organise.value = requested;
    }

    renderFilterBar();
    renderTable(getFilteredRows());

    document.getElementById("search-input")?.addEventListener("input", handleSearch);

    if (organise) {

      organise.addEventListener("change", () => {
        groupBy = organise.value;
        currentPage = 1;

        const url = new URL(window.location.href);

        if (groupBy === "date") {
          url.searchParams.delete("organise");
        } else {
          url.searchParams.set("organise", groupBy);
        }

        window.history.replaceState({}, "", url);
        window.HelixEmbed?.notifyNavigation?.();
        renderTable(getFilteredRows());
      });
    }

    watchAuthorFit();
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
