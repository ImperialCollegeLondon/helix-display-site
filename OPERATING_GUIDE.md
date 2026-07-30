# Operating Guide

Day-to-day maintenance of the **Helix Publication Summaries** display site.

---

## What this site does

Researchers submit an accessible summary of a publication or project through a Qualtrics form. This site displays those summaries as a searchable table, with a detail page for each one, and is embedded in an iframe on [helixcentre.com/publications](https://helixcentre.com/publications).

GitHub Actions refreshes it every 15 minutes:

1. pulls the latest responses from Qualtrics (export requested with `useLabels`, so choice text comes through as written)
2. works out which CSV column is which by reading the question wording
3. rebuilds `data/submissions.json`
4. downloads any uploaded images and compresses them (max 1200px wide, JPEG quality 82)
5. assigns a permanent short reference to any new submission (`data/refs.json`)
6. commits changes if anything changed, and GitHub Pages republishes

## Deleting a submission

Delete the response in Qualtrics (Data & Analysis → select the response → Delete). It disappears from the site on the next run — the data file is rebuilt from scratch each time and the entry's image is removed with it. The run log says how many entries were removed.

Its short reference is retired, not reused: if `002` is deleted, the next new submission still gets `003`, so old `#002` links never silently point at a different paper.

As a safety net the build refuses to publish an *empty* table over a non-empty one, so a failed or misconfigured export can't wipe every entry — the run fails instead and the live site is left alone. If the survey genuinely has been emptied and you want that reflected, re-run the workflow with `ALLOW_EMPTY_SUBMISSIONS` set to `1`.

---

## Main files

**Website:** `index.html` (table), `entry.html` (detail page), `style.css`, `script.js` (table, search, filters), `entry.js` (detail page), `embed.js` (iframe behaviour), `config.js` (public links).

**Data:** `data/submissions.json` (generated), `data/refs.json` (reference register), `images/`.

**Automation:** `scripts/build_site_data.py`, `.github/workflows/update-submissions.yml`.

`keyword.html` / `keyword.js` are left over from an earlier design and nothing links to them any more — keyword chips now point at the filtered main table.

---

## What readers see

**The table** lists Title (with Helix authors beneath), Project, Theme and Publication Date, newest publication first. Up to 15 entries are shown per page; beyond that a pager appears at the bottom, and searching or filtering starts again at page one. The search box matches title, authors, project, theme, source type, Helix involvement, summary text and keywords. Theme and project appear as magenta links; clicking one filters the table, and filters combine with each other and with the search box. Active filters appear as removable chips above the table.

**A detail page** shows the image (if any), title, Helix authors, a meta line with project, theme, source type and date, keyword chips, the short lede, the full summary, then contact and acknowledgement details, and a pink "All publication summaries" link at the bottom. If no image was uploaded, the image area is removed entirely rather than left blank.

**Links you can share:**

| Link | Opens |
| --- | --- |
| `helixcentre.com/publications#001` | that summary's detail page |
| `…/publications#keyword=Co-design` | the table filtered by keyword |
| `…?theme=Dementia` or `?project=Minder` | the table filtered by theme or project (direct on the GitHub Pages site) |

`#001` style references are permanent — see "Short references" below.

---

## Fields from Qualtrics

Columns are matched by **question wording**, not by QID, so renumbering questions does not break the site. Current questions and where they appear:

| Question (starts with) | Shown as |
| --- | --- |
| "Publication title" | Title |
| "Which of our themes…" | Theme (filterable) |
| "Which particular subproject…" | Project (filterable) |
| "Was this publication Led by Helix or Helix Contributed?" | "Helix involvement" on the detail page |
| "What are you summarising?" | Source type (free text used if "Other") |
| "Date of publication, or the main date this work relates to" | Publication Date (dd/mm/yyyy picker — used to sort the table) |
| "If the work spans a period…" | Shown after the date on the detail page, e.g. "September 2025 – ongoing" |
| "1-2 sentence summary of work" | The italic lede |
| "Please paste your lay summary below" | Summary |
| "Helix Authors" | Listed under the title **in the table only** — detail pages show acknowledgements instead, which cover Helix and external contributors together |
| "Keywords (select up to 5)" | Keyword chips |
| "Acknowledgements…" | Acknowledgements |
| "If available, please insert a link…" | Full paper / work |
| "Corresponding team member … (name)" / "(email)" | Contact details |
| "Please upload a photo…" | Header image |

Only responses marked finished, with a title or summary, are shown.

**Editing the survey is safe.** Because the export uses `useLabels`, adding/renaming/reordering options for themes, projects, authors or keywords flows through automatically. There is nothing to change in the code.

**Rewording a question needs a check.** The wording patterns live in `FIELD_LABEL_PATTERNS` at the top of `scripts/build_site_data.py`. A small edit ("Which of our themes…" → "Which theme…") could stop a column being found: the workflow log prints `Resolved columns:` and a `WARNING: could not resolve columns for:` line if anything is missing. Update the pattern to match the new wording.

---

## Dates and table order

The table is ordered by publication date, newest first. The survey asks for a single date via a dd/mm/yyyy picker; the build script converts it to a sortable form and displays every date consistently as "23 April 2026".

Dates submitted before the picker existed were free text, so the script also understands formats like "Apr 23, 2026", "23rd April 2026", "April 2026" and "2026". Anything it can't read (for example "March – September 2025") is displayed exactly as typed and ordered by submission date instead — the run log says which values it couldn't read. If work spans a period, the optional period question is the right place for it, and it appears after the date on the detail page.

---

## Short references

Every submission gets a permanent number (`001`, `002`, …) stored in `data/refs.json`, mapping Qualtrics response ID to reference. The file is only ever added to, so numbers are never reused or renumbered and `#001` keeps pointing at the same paper. It is committed by the workflow — do not edit it by hand.

---

## Running the update manually

**Actions** tab → **Update submissions** → **Run workflow** → `main`. Useful when you don't want to wait for the next scheduled run.

---

## Credentials

Stored as GitHub repository secrets: `QUALTRICS_API_TOKEN`, `QUALTRICS_DATA_CENTER`, `QUALTRICS_SURVEY_ID`. Manage in **Settings → Secrets and variables → Actions**. Never put these in the repository or in `config.js`.

If the survey is replaced, update `QUALTRICS_SURVEY_ID` **and** the form link in `config.js`.

---

## Making changes

- **Public links** (submission form, DAIsy helper): `config.js`
- **Styling and branding**: `style.css` — brand colours are CSS variables at the top (navy `#041e42`, turquoise `#00bfb3`, magenta `#d0006f`)
- **Table columns and wording**: `index.html` and `script.js`
- **Detail page layout**: `entry.html` and `entry.js`
- **Embed behaviour** (height, deep links): `embed.js` *and* the matching block on the helixcentre.com page

Commit and push; the live site updates when GitHub Pages republishes (usually under a minute).

---

## Previewing locally

```bash
cd ~/Projects/helix-display-site
python3 -m http.server 8123
```

Then open `http://localhost:8123`. A web server is needed — opening the files directly won't work, because the pages fetch `data/submissions.json`.

To check the embed behaviour (height changes, deep links), view the site inside a test iframe rather than on its own.

---

## Troubleshooting

**A new submission doesn't appear**

1. Wait for the next run, or trigger it manually
2. Check the latest **Update submissions** run succeeded
3. Confirm the response exists in Qualtrics and is marked finished
4. Confirm it has a title or summary
5. Check the run log for `WARNING: could not resolve columns for:` — a reworded question may need its pattern updating in `scripts/build_site_data.py`

**An image doesn't appear**

1. Confirm a file was actually uploaded with the response
2. Check the run succeeded and a file appeared in `images/`
3. Check the entry in `data/submissions.json` has an `image_path`

A missing or broken image is handled gracefully — the page renders without it.

**A workflow run fails.** You'll get an email: the workflow opens a GitHub issue titled "Publication Summaries sync is failing", assigned to Tori, and GitHub emails issue assignees. While the problem persists the same issue is commented on rather than a new one raised every 15 minutes, and it closes itself once a run succeeds. The issue lists the failed run and the usual causes.

To change who is alerted, edit `ALERT_ASSIGNEE` at the top of `.github/workflows/update-submissions.yml` — it takes a GitHub username with access to the repository, not an email address.

Open the failed run in **Actions** and read the failing step. Common causes: wrong or expired Qualtrics secrets, a reworded question, network problems, or a push conflict when a manual commit and a scheduled run overlap (the workflow prefers its own data for `data/`).

**Values show as numbers instead of names.** That means the export came back without labels. Check the `useLabels` flag is still set in `start_export()` in the build script.

**Pushing gives "non-fast-forward".** The scheduled workflow committed while you were working. Run `git pull --rebase origin main`, then push again.

---

## What not to do

Don't commit API tokens, passwords or `.env` files; don't put credentials in `config.js`; don't hand-edit `data/submissions.json` or `data/refs.json` (the workflow overwrites the first and appends to the second); don't put private documents in this public repository.

---

## In summary

- **Editing survey options** (themes, projects, authors, keywords) needs no code change
- **Rewording a survey question** may need a pattern update in `scripts/build_site_data.py`
- **Links** → `config.js`; **styling** → `style.css`; **table** → `index.html` / `script.js`; **detail page** → `entry.html` / `entry.js`
- **Manual refresh** → Actions tab; **secrets** → Settings → Secrets and variables → Actions
- **Images** are compressed automatically; **short references** are assigned automatically and never change
