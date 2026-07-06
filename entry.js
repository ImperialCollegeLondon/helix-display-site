function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

async function loadEntry() {
  const id = getQueryParam("id");

  if (!id) {
    renderNotFound("No entry ID provided.");
    return;
  }

  try {
    const response = await fetch("data/submissions.json");
    const data = await response.json();

    const entry = (Array.isArray(data) ? data : []).find(item => item.response_id === id);

    if (!entry) {
      renderNotFound("Entry not found.");
      return;
    }

    renderEntry(entry);
  } catch (error) {
    console.error(error);
    renderNotFound("Could not load entry.");
  }
}

function renderNotFound(message) {
  document.getElementById("entry-title").textContent = "Entry unavailable";
  document.getElementById("entry-subtitle").textContent = message;
  document.getElementById("short-description-content").textContent = message;
  document.getElementById("lay-summary-content").textContent = message;
  document.getElementById("entry-header").classList.add("empty-image");
}

function renderEntry(entry) {
  document.title = entry.title
    ? `${entry.title} | UK DRI Centre for Care Research & Technology`
    : "Accessible AI Assisted Summary Entry";

  document.getElementById("entry-title").textContent = entry.title || "Untitled";
  document.getElementById("entry-subtitle").textContent =
    `${entry.lab_or_team || "—"} • ${entry.source_type || "—"} • ${entry.project_date || "—"}`;

  document.getElementById("prop-team").textContent = entry.lab_or_team || "—";
  document.getElementById("prop-type").textContent = entry.source_type || "—";
  document.getElementById("prop-date").textContent = entry.project_date || "—";
  document.getElementById("prop-contact-name").textContent = entry.corresponding_team_member || "—";
  const emailEl = document.getElementById("prop-contact-email");
  if (entry.contact_email) {
    emailEl.innerHTML = `<a class="property-link" href="mailto:${entry.contact_email}">${entry.contact_email}</a>`;
  } else {
    emailEl.textContent = "—";
  }
  document.getElementById("prop-acknowledgements").textContent = entry.acknowledgements || "—";

  const shortDescriptionEl = document.getElementById("short-description-content");
  const laySummaryEl = document.getElementById("lay-summary-content");

  shortDescriptionEl.textContent = entry.short_description || "No short description provided.";
  laySummaryEl.textContent = entry.lay_summary || "No lay summary provided.";

  const linkContainer = document.getElementById("prop-link");
  const linkRow = document.getElementById("prop-link-row");

  if (linkContainer && linkRow) {
    if (entry.link) {
      linkContainer.innerHTML = `<a class="property-link" href="${entry.link}" target="_blank" rel="noopener">Link to full paper / work</a>`;
      linkRow.style.display = "block";
    } else {
      linkRow.style.display = "none";
    }
  }
  const keywordsRow = document.getElementById("prop-keywords-row");
  const keywordsContainer = document.getElementById("prop-keywords");

  if (keywordsRow && keywordsContainer) {
    if (Array.isArray(entry.keywords) && entry.keywords.length) {
      keywordsContainer.innerHTML = entry.keywords
        .map(keyword => `<a class="keyword-chip" href="index.html?keyword=${encodeURIComponent(keyword)}">${keyword}</a>`)
        .join("");
      keywordsRow.style.display = "block";
    } else {
      keywordsRow.style.display = "none";
    }
  }
	
  const image = document.getElementById("entry-image");
  const header = document.getElementById("entry-header");

  if (entry.image_path) {
    image.src = entry.image_path;
    image.alt = entry.title ? `Image for ${entry.title}` : "Entry image";
  } else {
    header.classList.add("empty-image");
  }
}

loadEntry();
