let allSubmissions = [];
let activeKeyword = null;

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

function navigateToEntry(id) {
  window.location.href = `entry.html?id=${encodeURIComponent(id)}`;
}

function renderTable(rows) {
  const tbody = document.getElementById("submissions-body");

  if (!tbody) {
    return;
  }

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="loading-cell">No submissions found.</td>
      </tr>
    `;
    scheduleEmbedResize();
    return;
  }

  tbody.innerHTML = rows.map(item => `
    <tr class="table-row-link" data-id="${escapeHtml(item.response_id)}" tabindex="0" role="link" aria-label="Open ${escapeHtml(item.title || "Untitled")}">
      <td data-label="Title">${escapeHtml(item.title || "Untitled")}</td>
      <td data-label="Theme">${escapeHtml(item.theme || "-")}</td>
      <td data-label="Publication Date">${escapeHtml(item.project_date || "-")}</td>
    </tr>
  `).join("");

  document.querySelectorAll(".table-row-link").forEach(row => {
    row.addEventListener("click", () => {
      navigateToEntry(row.getAttribute("data-id"));
    });

    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigateToEntry(row.getAttribute("data-id"));
      }
    });
  });

  scheduleEmbedResize();
}

function getFilteredRows() {
  let rows = activeKeyword
    ? allSubmissions.filter(item => Array.isArray(item.keywords) && item.keywords.includes(activeKeyword))
    : allSubmissions;

  const query = document.getElementById("search-input")?.value.trim().toLowerCase();

  if (query) {
    rows = rows.filter(item =>
      [
        item.title,
        item.corresponding_team_member,
        item.theme,
        item.source_type,
        item.short_description,
        item.lay_summary,
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

function setKeywordFilter(keyword) {
  activeKeyword = keyword || null;

  const filterBar = document.getElementById("filter-bar");
  const filterLabel = document.getElementById("active-keyword-label");

  if (activeKeyword && filterBar && filterLabel) {
    filterLabel.textContent = activeKeyword;
    filterBar.hidden = false;
  } else if (filterBar) {
    filterBar.hidden = true;
  }

  renderTable(getFilteredRows());
}

function clearKeywordFilter() {
  const url = new URL(window.location.href);
  url.searchParams.delete("keyword");
  window.history.replaceState({}, "", url);
  setKeywordFilter(null);
}

async function loadSubmissions() {
  try {
    const response = await fetch("data/submissions.json");

    if (!response.ok) {
      throw new Error(`Submissions request failed with ${response.status}`);
    }

    const data = await response.json();
    allSubmissions = Array.isArray(data) ? data : [];

    allSubmissions.sort((a, b) => {
      const aDate = new Date(a.recorded_date || 0).getTime();
      const bDate = new Date(b.recorded_date || 0).getTime();
      return bDate - aDate;
    });

    const keyword = new URLSearchParams(window.location.search).get("keyword");
    setKeywordFilter(keyword);

    document.getElementById("search-input")?.addEventListener("input", handleSearch);
    document.getElementById("clear-filter-btn")?.addEventListener("click", clearKeywordFilter);
  } catch (error) {
    console.error(error);

    const tbody = document.getElementById("submissions-body");

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="loading-cell">Could not load submissions.</td>
        </tr>
      `;
    }

    scheduleEmbedResize();
  }
}

loadSubmissions();
