function scheduleEmbedResize() {
  window.HelixEmbed?.scheduleResize();
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function isPublicUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function renderAnchor(container, href, label, options = {}) {
  const anchor = document.createElement("a");
  anchor.className = options.className || "property-link";
  anchor.href = href;
  anchor.textContent = label;

  if (options.external) {
    anchor.target = "_blank";
    anchor.rel = "noopener";
  }

  container.replaceChildren(anchor);
}

async function loadEntry() {
  const id = getQueryParam("id");

  if (!id) {
    renderNotFound("No entry ID provided.");
    return;
  }

  try {
    const response = await fetch("data/submissions.json");

    if (!response.ok) {
      throw new Error(`Submissions request failed with ${response.status}`);
    }

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
  setText("entry-title", "Entry unavailable");
  setText("entry-subtitle", message);
  setText("short-description-content", message);
  setText("lay-summary-content", message);
  document.getElementById("entry-header")?.classList.add("empty-image");
  scheduleEmbedResize();
}

function renderEntry(entry) {
  document.title = entry.title
    ? `${entry.title} | LASSOO`
    : "LASSOO Summary | Helix Centre";

  setText("entry-title", entry.title || "Untitled");
  setText(
    "entry-subtitle",
    `${entry.lab_or_team || "-"} | ${entry.source_type || "-"} | ${entry.project_date || "-"}`
  );

  setText("prop-team", entry.lab_or_team || "-");
  setText("prop-type", entry.source_type || "-");
  setText("prop-date", entry.project_date || "-");
  setText("prop-contact-name", entry.corresponding_team_member || "-");
  setText("prop-acknowledgements", entry.acknowledgements || "-");
  setText("short-description-content", entry.short_description || "No short description provided.");
  setText("lay-summary-content", entry.lay_summary || "No lay summary provided.");

  const emailEl = document.getElementById("prop-contact-email");

  if (emailEl) {
    if (entry.contact_email) {
      renderAnchor(emailEl, `mailto:${entry.contact_email}`, entry.contact_email);
    } else {
      emailEl.textContent = "-";
    }
  }

  const linkContainer = document.getElementById("prop-link");
  const linkRow = document.getElementById("prop-link-row");

  if (linkContainer && linkRow) {
    if (entry.link && isPublicUrl(entry.link)) {
      renderAnchor(linkContainer, entry.link, "Link to full paper / work", { external: true });
      linkRow.hidden = false;
    } else {
      linkRow.hidden = true;
    }
  }

  const keywordsRow = document.getElementById("prop-keywords-row");
  const keywordsContainer = document.getElementById("prop-keywords");

  if (keywordsRow && keywordsContainer) {
    keywordsContainer.replaceChildren();

    if (Array.isArray(entry.keywords) && entry.keywords.length) {
      entry.keywords.forEach(keyword => {
        const chip = document.createElement("a");
        chip.className = "keyword-chip";
        chip.href = `index.html?keyword=${encodeURIComponent(keyword)}`;
        chip.textContent = keyword;
        keywordsContainer.appendChild(chip);
      });

      keywordsRow.hidden = false;
    } else {
      keywordsRow.hidden = true;
    }
  }

  const image = document.getElementById("entry-image");
  const header = document.getElementById("entry-header");

  if (image && header) {
    if (entry.image_path) {
      image.src = entry.image_path;
      image.alt = entry.title ? `Image for ${entry.title}` : "Entry image";
    } else {
      header.classList.add("empty-image");
    }
  }

  scheduleEmbedResize();
}

loadEntry();
