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
  const ref = getQueryParam("ref");

  if (!id && !ref) {
    renderNotFound("No entry ID provided.");
    return;
  }

  try {
    const response = await fetch("data/submissions.json");

    if (!response.ok) {
      throw new Error(`Submissions request failed with ${response.status}`);
    }

    const data = await response.json();
    const paddedRef = ref ? String(parseInt(ref, 10)).padStart(3, "0") : null;
    const entry = (Array.isArray(data) ? data : []).find(item =>
      (paddedRef && item.ref === paddedRef) || (id && item.response_id === id)
    );

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
  setText("entry-meta", message);
  setText("short-description-content", message);
  setText("lay-summary-content", message);
  document.getElementById("entry-header")?.classList.add("empty-image");
  scheduleEmbedResize();
}

function addDetailRow(container, label, render) {
  const dt = document.createElement("dt");
  dt.textContent = label;

  const dd = document.createElement("dd");
  render(dd);

  container.appendChild(dt);
  container.appendChild(dd);
}

function renderEntry(entry) {
  document.title = entry.title
    ? `${entry.title} | Publication Summaries`
    : "Publication Summary | Helix Centre";

  setText("entry-title", entry.title || "Untitled");
  setText(
    "entry-meta",
    [entry.theme, entry.source_type, entry.project_date].filter(Boolean).join(" · ") || "-"
  );
  setText("short-description-content", entry.short_description || "No short description provided.");
  setText("lay-summary-content", entry.lay_summary || "No lay summary provided.");

  const keywordsContainer = document.getElementById("entry-keywords");

  if (keywordsContainer) {
    keywordsContainer.replaceChildren();

    if (Array.isArray(entry.keywords) && entry.keywords.length) {
      entry.keywords.forEach(keyword => {
        const chip = document.createElement("a");
        chip.className = "keyword-chip";
        chip.href = `index.html?keyword=${encodeURIComponent(keyword)}`;
        chip.textContent = keyword;
        keywordsContainer.appendChild(chip);
      });

      keywordsContainer.hidden = false;
    } else {
      keywordsContainer.hidden = true;
    }
  }

  const details = document.getElementById("entry-details");

  if (details) {
    details.replaceChildren();

    if (entry.corresponding_team_member) {
      addDetailRow(details, "Corresponding team member", dd => {
        dd.textContent = entry.corresponding_team_member;
      });
    }

    if (entry.contact_email) {
      addDetailRow(details, "Contact", dd => {
        renderAnchor(dd, `mailto:${entry.contact_email}`, entry.contact_email);
      });
    }

    if (entry.link && isPublicUrl(entry.link)) {
      addDetailRow(details, "Full paper / work", dd => {
        renderAnchor(dd, entry.link, entry.link, { external: true });
      });
    }

    if (entry.acknowledgements) {
      addDetailRow(details, "Acknowledgements", dd => {
        dd.textContent = entry.acknowledgements;
      });
    }

    details.hidden = details.childElementCount === 0;
  }

  const image = document.getElementById("entry-image");
  const header = document.getElementById("entry-header");

  if (image && header) {
    if (entry.image_path) {
      image.src = entry.image_path;
      image.alt = entry.title ? `Image for ${entry.title}` : "Entry image";
      header.classList.remove("empty-image");
    } else {
      header.classList.add("empty-image");
    }
  }

  scheduleEmbedResize();
}

loadEntry();
