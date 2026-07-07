# LASSOO Accessible Summaries Embed

This repository hosts the embeddable publication table for Accessible AI Assisted Summaries submitted to the UK Dementia Research Institute Centre for Care Research & Technology. It is designed to be published with GitHub Pages and embedded inside the Helix Centre website.

The site provides:

- a Helix-compatible embeddable publication table
- a browsable table of submitted summaries
- keyword filtering on the main table
- a detail page for each entry with keyword chips
- uploaded image display
- project and publication metadata

The site is published through GitHub Pages and updated automatically from Qualtrics using GitHub Actions.

---

## What this repository contains

This repository contains the files needed to serve the embeddable public-facing display website, including:

- HTML pages
- CSS styling
- JavaScript
- iframe resize helper
- display data in JSON format
- public image files
- branding assets
- the GitHub Actions workflow used to refresh site data from Qualtrics

---

## What this repository does **not** contain

This repository should never contain private credentials or private automation configuration.

It does **not** include:

- Qualtrics API tokens
- Notion API tokens
- `.env` files
- private local automation scripts with embedded credentials
- GitHub personal access tokens
- passwords of any kind

Qualtrics credentials are stored securely as **GitHub repository secrets**.

---

## How the embed works

The website is a static site hosted with GitHub Pages. The iframe content sends a small `postMessage` event to its parent page whenever its height changes, allowing the Helix Centre page to resize the iframe and avoid nested scrolling.

Default GitHub Pages URL:

`https://imperialcollegelondon.github.io/helix-display-site/`

Add this where the LASSOO display should appear on `helixcentre.com`:

```html
<iframe
  id="helix-lassoo-embed"
  title="LASSOO publication table"
  src="https://imperialcollegelondon.github.io/helix-display-site/"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
  style="width: 100%; min-height: 420px; border: 0; display: block;"
></iframe>

<script>
  (function () {
    const iframe = document.getElementById("helix-lassoo-embed");
    const allowedOrigin = "https://imperialcollegelondon.github.io";

    window.addEventListener("message", function (event) {
      const data = event.data || {};

      if (event.origin !== allowedOrigin) return;
      if (data.type !== "helix-display-site:resize") return;
      if (typeof data.height !== "number") return;

      iframe.style.height = Math.max(520, Math.ceil(data.height)) + "px";
    });
  })();
</script>
```

If the repository later moves to a custom domain, update both the iframe `src` and `allowedOrigin`.

## How the site works

The displayed content is stored in:

- `data/submissions.json`
- `images/`

A GitHub Actions workflow pulls the latest responses from Qualtrics every 15 minutes, rebuilds the JSON data and images, commits any changes back to the repository, and GitHub Pages republishes the site automatically.

---

## Repository structure

```text
index.html                                  Main table view of all summaries (supports ?keyword= filter)
entry.html                                  Detail page for a single summary
keyword.html                                Legacy keyword page (no longer linked to; filter is on index)
style.css                                   Site styling
script.js                                   Logic for loading/rendering the table and keyword filter
entry.js                                    Logic for loading/rendering single entries
embed.js                                    Iframe resize helper used by the Helix Centre embed
config.js                                   Public-facing links (submission form / DAISy helper)
ukdri-logo.png                              Branding asset
data/submissions.json                       Display data for the site
images/                                     Uploaded images used by entries (auto-compressed to JPEG ≤1200px)
scripts/build_site_data.py                  Qualtrics-to-site data build script
requirements.txt                            Python dependencies for the GitHub Action
.github/workflows/update-submissions.yml    GitHub Actions workflow
README.md                                   Project overview
OPERATING_GUIDE.md                          Day-to-day maintenance guide
```

---

## Public links

Optional public links for the submission form and DAISy-based summary helper are stored in:

`config.js`

This file controls links such as:
- the Qualtrics submission form
- the DAISy-based summary helper

If these links need changing, update `config.js`, then commit and push the change.

---

## GitHub Actions automation

This repository uses GitHub Actions to refresh displayed submission data from Qualtrics every 15 minutes.

The workflow file is:

`.github/workflows/update-submissions.yml`

The workflow:

1. runs on a schedule every 15 minutes
2. can also be triggered manually from the Actions tab
3. pulls the latest responses from Qualtrics
4. reads keyword labels directly from the Qualtrics CSV (no hardcoded mapping)
5. downloads and compresses uploaded images (resized to max 1200px wide, converted to JPEG)
6. updates:
   - `data/submissions.json`
   - files in `images/`
7. commits changes back to the repository if anything changed
8. allows GitHub Pages to republish the site automatically

---

## GitHub Secrets required

The GitHub Actions workflow depends on the following repository secrets:

- `QUALTRICS_API_TOKEN`
- `QUALTRICS_DATA_CENTER`
- `QUALTRICS_SURVEY_ID`

These must be configured in:

**Repository Settings → Secrets and variables → Actions**

---

## Further documentation

For day-to-day maintenance and operating instructions, see:

- [OPERATING_GUIDE.md](OPERATING_GUIDE.md)
