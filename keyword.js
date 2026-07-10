function scheduleEmbedResize() {
  window.HelixEmbed?.scheduleResize();
}

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

function navigateToEntry(id, ref) {
  window.location.href = ref
    ? `entry.html?ref=${encodeURIComponent(ref)}`
    : `entry.html?id=${encodeURIComponent(id)}`;
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

    if (!response.ok) {
      throw new Error(`Submissions request failed with ${response.status}`);
    }

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

  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="loading-cell">No related submissions found.</td>
      </tr>
    `;
    scheduleEmbedResize();
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr class="table-row-link" data-id="${escapeHtml(item.response_id)}" data-ref="${escapeHtml(item.ref || "")}" tabindex="0" role="link" aria-label="Open ${escapeHtml(item.title || "Untitled")}">
      <td data-label="Title">${escapeHtml(item.title || "Untitled")}</td>
      <td data-label="Theme">${escapeHtml(item.theme || "-")}</td>
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

  scheduleEmbedResize();
}

function renderEmpty(message) {
  document.getElementById("keyword-submissions-body").innerHTML = `
    <tr>
      <td colspan="3" class="loading-cell">${escapeHtml(message)}</td>
    </tr>
  `;
  scheduleEmbedResize();
}

loadKeywordPage();
