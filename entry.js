function scheduleEmbedResize() {
  window.HelixEmbed?.scheduleResize();
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
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
  const meta = document.getElementById("entry-meta");

  if (meta) {
    meta.replaceChildren();

    // Project and theme link back to the table filtered by that value.
    // "One-off Project" and a project of "N/A" are bookkeeping answers meaning
    // the work sits outside the themes or projects, so they're left off.
    const isOneOff = (entry.theme || "").trim().toLowerCase() === "one-off project";
    const noProject = ["n/a", "na", "none"].includes((entry.subproject || "").trim().toLowerCase());

    const pills = [
      { value: noProject ? "" : entry.subproject, param: "project", className: "filter-pill--project" },
      { value: isOneOff ? "" : entry.theme, param: "theme", className: "filter-pill--theme" }
    ].filter(item => item.value);

    // Every part of the line is built as its own element, so a separator can
    // be placed between them all — including between the project and theme
    // links. Anything blank is dropped first, so a missing field never leaves
    // a stray dot behind.
    const parts = pills.map(item => {
      const pill = document.createElement("a");
      pill.className = `filter-pill ${item.className}`;
      pill.href = `index.html?${item.param}=${encodeURIComponent(item.value)}`;
      pill.textContent = item.value;
      return pill;
    });

    // Source type is no longer here — it has moved up to the publisher line
    // under the authors, so it isn't repeated.
    [entry.project_date, entry.date_range_note]
      .filter(Boolean)
      .forEach(value => {
        const text = document.createElement("span");
        text.className = "entry-meta__text";
        text.textContent = value;
        parts.push(text);
      });

    parts.forEach((part, index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "entry-meta__separator";
        // Hidden from screen readers: it's decoration, not content.
        separator.setAttribute("aria-hidden", "true");
        separator.textContent = "·";
        meta.appendChild(separator);
      }
      meta.appendChild(part);
    });

    if (!parts.length) {
      meta.textContent = "-";
    }
  }

  // The full author list sits directly under the title. Acknowledgements are
  // separate and optional, and appear at the bottom with the other details.
  const authors = document.getElementById("entry-authors");

  if (authors) {
    const text = entry.authors ||
      (Array.isArray(entry.helix_authors) ? entry.helix_authors.join(", ") : "");
    authors.textContent = text;
    authors.hidden = !text;
  }
  // What it is and where it was published, directly under the authors: small
  // and bold, with the journal linked when a link was given. Either part can
  // be missing, and the line disappears if both are.
  const publisherLine = document.getElementById("entry-publisher");

  if (publisherLine) {
    publisherLine.replaceChildren();

    const type = (entry.source_type || "").trim();
    const publisher = (entry.publisher || "").trim();
    const journalHref = publicUrl(entry.journal_link);

    if (type) {
      publisherLine.appendChild(document.createTextNode(type));
    }

    if (publisher) {
      if (type) {
        const separator = document.createElement("span");
        separator.className = "entry-meta__separator";
        separator.setAttribute("aria-hidden", "true");
        separator.textContent = " · ";
        publisherLine.appendChild(separator);
      }

      if (journalHref) {
        renderAnchor(publisherLine, journalHref, publisher, { external: true });
      } else {
        publisherLine.appendChild(document.createTextNode(publisher));
      }
    }

    publisherLine.hidden = !(type || publisher);
  }

  setText("short-description-content", entry.short_description || "No short description provided.");
  setText("lay-summary-content", entry.lay_summary || "No lay summary provided.");

  // An optional diagram sits directly under the summary. Unlike the header
  // photo it is shown whole rather than cropped, because cropping a diagram
  // loses the very thing it is there to explain. The caption is only shown if
  // one was written, and the whole figure disappears if there is no diagram.
  const diagram = document.getElementById("entry-diagram");

  if (diagram) {
    const diagramImage = document.getElementById("entry-diagram-image");
    const diagramCaption = document.getElementById("entry-diagram-caption");
    const caption = (entry.diagram_caption || "").trim();

    if (entry.diagram_path) {
      diagramImage.src = entry.diagram_path;
      diagramImage.alt = caption || `Diagram accompanying ${entry.title || "this summary"}`;
      diagramCaption.textContent = caption;
      diagramCaption.hidden = !caption;
      diagram.hidden = false;

      // A late-loading image changes the page height, so remeasure the frame.
      diagramImage.addEventListener("load", scheduleEmbedResize, { once: true });
      diagramImage.addEventListener("error", () => { diagram.hidden = true; scheduleEmbedResize(); }, { once: true });
    } else {
      diagram.hidden = true;
    }
  }

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

    // The link to the work itself leads: it's what most readers come for.
    const paperHref = publicUrl(entry.link);

    if (paperHref) {
      addDetailRow(details, "Full paper / work", dd => {
        renderAnchor(dd, paperHref, entry.link, { external: true });
      });
    }

    // Optional, and checked the same way as the paper link: anything that
    // isn't a plain http(s) address is ignored rather than made clickable.
    const videoHref = publicUrl(entry.video_link);

    if (videoHref) {
      addDetailRow(details, "Video", dd => {
        renderAnchor(dd, videoHref, entry.video_link, { external: true });
      });
    }

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

    // The publisher isn't listed here — it has its own line under the title,
    // where readers look for it, rather than being buried at the bottom.

    if (entry.acknowledgements) {
      addDetailRow(details, "Acknowledgements", dd => {
        dd.textContent = entry.acknowledgements;
      });
    }

    if (entry.led_or_contributed) {
      addDetailRow(details, "Helix involvement", dd => {
        dd.textContent = entry.led_or_contributed;
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

      // A broken or missing file should behave like no photo at all, rather
      // than leaving an empty grey band on the page.
      image.addEventListener("error", () => {
        header.classList.add("empty-image");
        scheduleEmbedResize();
      }, { once: true });
    } else {
      header.classList.add("empty-image");
    }
  }

  scheduleEmbedResize();
}

loadEntry();
