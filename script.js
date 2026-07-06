let allSubmissions = [];
let activeKeyword = null;

function applySiteConfig() {
  const config = window.SITE_CONFIG || {};

  const gptLink = document.getElementById("gpt-link");
  const submissionLink = document.getElementById("submission-link");

  if (gptLink && config.gptHelperUrl) {
    gptLink.href = config.gptHelperUrl;
  }

  if (submissionLink && config.submissionFormUrl) {
    submissionLink.href = config.submissionFormUrl;
  }
}

function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function renderTable(rows) {
  const tbody = document.getElementById("submissions-body");
  const count = document.getElementById("results-count");

  count.textContent = `${rows.length} submission${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
<td colspan="5" class="loading-cell">No submissions found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(item => `
    <tr class="table-row-link" data-id="${item.response_id}">
      <td>${escapeHtml(item.title || "Untitled")}</td>
      <td>${escapeHtml(item.corresponding_team_member || "—")}</td>
      <td>${escapeHtml(item.lab_or_team || "—")}</td>
      <td>${escapeHtml(item.source_type || "—")}</td>
      <td>${escapeHtml(item.project_date || "—")}</td>
    </tr>
  `).join("");

  document.querySelectorAll(".table-row-link").forEach(row => {
    row.addEventListener("click", () => {
      const id = row.getAttribute("data-id");
      window.location.href = `entry.html?id=${encodeURIComponent(id)}`;
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
        item.lab_or_team,
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
    filterBar.style.display = "flex";
  } else if (filterBar) {
    filterBar.style.display = "none";
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
    const data = await response.json();

    allSubmissions = Array.isArray(data) ? data : [];

    allSubmissions.sort((a, b) => {
      const aDate = new Date(a.recorded_date || 0).getTime();
      const bDate = new Date(b.recorded_date || 0).getTime();
      return bDate - aDate;
    });

    const keyword = new URLSearchParams(window.location.search).get("keyword");
    setKeywordFilter(keyword);

    document.getElementById("search-input").addEventListener("input", handleSearch);
    document.getElementById("clear-filter-btn")?.addEventListener("click", clearKeywordFilter);
  } catch (error) {
    console.error(error);
    document.getElementById("submissions-body").innerHTML = `
      <tr>
        <td colspan="4" class="loading-cell">Could not load submissions.</td>
      </tr>
    `;
    document.getElementById("results-count").textContent = "Error loading data";
  }
}

applySiteConfig();
loadSubmissions();
