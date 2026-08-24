# Helix Publication Summaries

This repository hosts the embeddable Publication Summaries table for the **Helix Centre** (Imperial College London & the Royal College of Art). Researchers submit an accessible summary of a publication or project through a Qualtrics form; this site displays those summaries and is embedded in an iframe on [helixcentre.com/publications](https://helixcentre.com/publications).

The site provides:

- a browsable, searchable table of submitted summaries, paged at 15 per page
- a detail page for each summary, with a permanent short reference (`001`, `002`, …)
- filtering by theme, project or keyword, reflected in the URL so a filtered view can be shared
- deep links to individual summaries (`…/publications#001`)
- uploaded images, automatically compressed and shown as a full-width banner
- an iframe resize helper so the embed grows and shrinks to fit its content
- an alert if the Qualtrics sync ever fails

Content is refreshed automatically from Qualtrics by GitHub Actions and published through GitHub Pages.

---

## What this repository contains

HTML pages, CSS, JavaScript, the iframe helper, display data (`data/submissions.json`), the reference register (`data/refs.json`), uploaded images, branding assets, the Qualtrics build script, and the GitHub Actions workflow.

## What this repository does **not** contain

No credentials of any kind: no Qualtrics or Notion API tokens, no `.env` files, no GitHub personal access tokens, no passwords. Qualtrics credentials live in **GitHub repository secrets**.

---

## How the embed works

The site is static. Inside the iframe it measures its own content height and posts a message to the parent page, which resizes the frame — so there is never an internal scrollbar and the frame follows the content up *and* down. It also tells the parent page which summary is being viewed, so the parent can keep a shareable `#001` style link in the address bar.

GitHub Pages URL:

`https://imperialcollegelondon.github.io/helix-display-site/`

The block below goes on the `helixcentre.com` publications page. Replace the whole block if updating — the script references the iframe by `id`.

```html
<iframe
  id="helix-publication-summaries-embed"
  title="Publication Summaries"
  src="https://imperialcollegelondon.github.io/helix-display-site/"
  loading="lazy"
  allowtransparency="true"
  referrerpolicy="strict-origin-when-cross-origin"
  style="width: 100%; min-height: 200px; border: 0; display: block; background: transparent;"
></iframe>

<script>
  (function () {
    var iframe = document.getElementById("helix-publication-summaries-embed");
    var allowedOrigin = "https://imperialcollegelondon.github.io";
    var base = allowedOrigin + "/helix-display-site/";

    // Deep links: #001 (short reference), #entry=<response id>, #keyword=<name>
    var hash = window.location.hash.slice(1);
    if (/^\d+$/.test(hash)) {
      iframe.src = base + "entry.html?ref=" + encodeURIComponent(hash);
    } else if (hash.indexOf("entry=") === 0) {
      iframe.src = base + "entry.html?id=" + encodeURIComponent(decodeURIComponent(hash.slice(6)));
    } else if (hash.indexOf("keyword=") === 0) {
      iframe.src = base + "keyword.html?keyword=" + encodeURIComponent(decodeURIComponent(hash.slice(8)));
    }

    window.addEventListener("message", function (event) {
      if (event.origin !== allowedOrigin) return;
      var data = event.data || {};

      // Grow and shrink the frame to fit its content.
      if (data.type === "helix-display-site:resize" && typeof data.height === "number") {
        iframe.style.height = Math.max(200, Math.ceil(data.height)) + "px";
      }

      // Keep the page URL in step with what the reader is looking at.
      if (data.type === "helix-display-site:navigate") {
        var newHash = "";
        if (data.page === "entry" && (data.ref || data.id)) {
          newHash = data.ref ? String(data.ref) : "entry=" + encodeURIComponent(data.id);
        } else if ((data.page === "keyword" || data.page === "index") && data.keyword) {
          newHash = "keyword=" + encodeURIComponent(data.keyword);
        }
        history.replaceState(null, "", newHash ? "#" + newHash : window.location.pathname + window.location.search);

        if (data.scrollToTop) {
          iframe.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }
    });
  })();
</script>
```

If the site later moves to a custom domain, update the iframe `src`, `allowedOrigin` and `base`.

---

## How the site updates

A GitHub Actions workflow runs every 15 minutes (and can be run by hand from the **Actions** tab). It pulls the latest Qualtrics responses, rebuilds `data/submissions.json`, downloads and compresses any uploaded images, assigns short references to new submissions, commits anything that changed, and GitHub Pages republishes.

The Qualtrics export is requested with **`useLabels`**, so choice questions arrive as their visible text. Adding, renaming or reordering themes, projects or keywords in the survey therefore needs **no code change** — the site picks them up on the next run. Rewording a *question* can need a small change; see the operating guide.

If a run fails, the workflow opens a GitHub issue assigned to the person named in `ALERT_ASSIGNEE` at the top of the workflow file (GitHub emails issue assignees), reuses that issue while the fault persists, and closes it once a run succeeds. It also refuses to publish an empty table over a non-empty one, so a bad export can't wipe the site.

---

## Short references

Every submission gets a permanent number — `001`, `002`, … — stored in `data/refs.json`, which is only ever appended to. Numbers are never reused or renumbered, so `#001` keeps pointing at the same paper even if earlier submissions are deleted.

The register is keyed on the **link to the paper** (or, where no link was given, the title) rather than on the Qualtrics response ID. This matters because editing a response in Qualtrics does not update it in place — Qualtrics creates a new response with a new ID and retires the original — so a response-ID key meant that correcting a typo renumbered the entry and broke every link to it. Correcting a summary, date, author list or image now keeps the number.

This file is committed by the workflow and should not be edited by hand.

---

## Repository structure

```text
index.html                                  Table of all summaries (supports ?theme= ?project= ?keyword=)
entry.html                                  Detail page for a single summary (?ref=001 or ?id=R_…)
keyword.html                                Legacy keyword page — nothing links to it any more
style.css                                   Site styling
script.js                                   Table rendering, search and filtering
entry.js                                    Detail page rendering
embed.js                                    Iframe height reporting, deep links, navigation messages
config.js                                   Public links (submission form / DAIsy helper)
helix-logo.png                              Branding asset
fonts/                                      Circular typeface (Book/Bold + italics, woff2)
data/submissions.json                       Generated display data
data/refs.json                              Permanent short-reference register (keyed on paper link / title)
images/                                     Uploaded images (auto-compressed, JPEG ≤1600px wide) plus generated 240px square thumbnails
scripts/build_site_data.py                  Qualtrics-to-site build script
requirements.txt                            Python dependencies for the workflow
.github/workflows/update-submissions.yml    GitHub Actions workflow
README.md                                   This file
OPERATING_GUIDE.md                          Day-to-day maintenance guide
```

---

## GitHub secrets required

- `QUALTRICS_API_TOKEN`
- `QUALTRICS_DATA_CENTER`
- `QUALTRICS_SURVEY_ID`

Set in **Settings → Secrets and variables → Actions**. If the survey is ever replaced, update `QUALTRICS_SURVEY_ID` here *and* the form link in `config.js`.

---

## Further documentation

See [OPERATING_GUIDE.md](OPERATING_GUIDE.md) for day-to-day maintenance, troubleshooting and how the Qualtrics fields map onto the site.
