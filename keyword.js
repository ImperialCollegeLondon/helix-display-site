function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadKeywordPage() {
  const keyword = getQueryParam("keyword");

  if (!keyword) {
    renderEmpty("No keyword provided.");
    return;
  }

  document.getElementById("keyword-page-title").textContent = keyword;

  try {
    const response = await fetch("data/submissions.json");
    const data = await response.json();

    const items = (Array.isArray(data) ? data : []).filter(item =>
      Array.isArray(item.keywords) && item.keywords.includes(keyword)
    );

    renderKeywordTable(items);
  } catch (error) {
    console.error(error);
    renderEmpty("Could not load related research.");
  }
}

function renderKeywordTable(items) {
  const tbody = document.getElementById("keyword-submissions-body");
  const count = document.getElementById("keyword-results-count");

  count.textContent = `${items.length} related submission${items.length === 1 ? "" : "s"}`;

  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="loading-cell">No related submissions found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(item => `
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

function renderEmpty(message) {
  document.getElementById("keyword-results-count").textContent = "0 related submissions";
  document.getElementById("keyword-submissions-body").innerHTML = `
    <tr>
      <td colspan="5" class="loading-cell">${message}</td>
    </tr>
  `;
}

loadKeywordPage();
