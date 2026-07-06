# Operating Guide

This guide explains how to operate and maintain the UK DRI Centre for Care Research & Technology Accessible AI Assisted Summaries display site.

---

## What this site does

This site displays Accessible AI Assisted Summaries submitted through Qualtrics.

It is updated automatically by GitHub Actions every 15 minutes.

The workflow:
1. pulls the latest responses from Qualtrics
2. reads keyword labels directly from the Qualtrics CSV export (no hardcoded mapping needed)
3. rebuilds the JSON data file
4. downloads any uploaded images and automatically compresses them (max 1200px wide, JPEG quality 82)
5. commits changes to the repository if needed
6. republishes the GitHub Pages site

Deleted Qualtrics responses should also be removed from the site on the next successful update.

---

## Where the live site is hosted

The site is hosted through GitHub Pages from this repository.

Any changes committed to the repository will be reflected on the live site once GitHub Pages republishes.

---

## Main files to know

### Website files
- `index.html` — homepage table view and explainer text
- `entry.html` — detail page for each summary
- `style.css` — styling
- `script.js` — logic for loading/rendering the table
- `entry.js` — logic for loading/rendering single entries
- `config.js` — public links (submission form / DAISy helper)

### Data files
- `data/submissions.json` — generated submission data used by the site
- `images/` — downloaded images used by the site

### Automation files
- `scripts/build_site_data.py` — builds the website data from Qualtrics
- `.github/workflows/update-submissions.yml` — GitHub Actions workflow that runs the update

---

## Current terminology used on the site

The site refers to submissions as:

**Accessible AI Assisted Summaries**

This terminology is used instead of the earlier “lay summaries” wording in most front-end copy.

---

## Current homepage structure

The homepage includes:
- branding and navigation
- a button for the **Lay Summary AI Assistant**
- a button for the **Submission Form**
- an explainer section describing the 3-step workflow
- a note explaining that summaries are AI-supported and that publication-facing summaries should be reviewed with a member of the public
- a searchable table of existing summaries

---

## Current detail page structure

Each summary detail page includes:
- a large header image (shown fully, not cropped)
- title
- subtitle with:
  - lab/team
  - source type
  - project/publication date
- a properties panel including:
  - optional link to full paper/work
  - lab/team
  - source type
  - project/publication date
  - corresponding team member
  - contact email
  - keywords (as clickable chips — each chip links back to the filtered homepage)
  - acknowledgements
- a short description section
- the full summary text

If no link is provided, the link row is hidden entirely. If no keywords are provided, the keyword row is hidden entirely.

### Keyword filtering

Clicking a keyword chip on a detail page takes the user to:

```
index.html?keyword=<keyword>
```

The homepage table auto-filters to show only submissions with that keyword, and displays a dismissible **"Keyword: X ✕"** chip. Clicking ✕ or navigating back clears the filter.

---

## Fields currently expected from Qualtrics

Important export mappings currently used by the site build script:

- `QID2` → title
- `QID3` → full summary
- `QID5` → contact email
- `QID8` → source type code
- `QID10` → acknowledgements
- `QID11` → corresponding team member
- `QID12` → lab/team code
- `QID14` → project/publication date
- `QID15` → short description
- `Link` → URL link to the work
- `_Id` → image file ID
- `_Name` → image file name
- `_Type` → image file type
- `ResponseId` → response ID
- `Finished` → used to exclude incomplete responses
- `Keywords_*` → keyword checkbox columns (e.g. `Keywords_1`, `Keywords_2`, …)

### Keywords are read dynamically

The keyword labels are **not hardcoded** in the build script. Instead, the script reads them directly from the second row of the Qualtrics CSV export (the label row), which contains the human-readable option text for each column.

This means you can add, remove, or rename keyword options in the Qualtrics survey and they will be reflected on the site automatically on the next workflow run — no code changes needed.

The one requirement is that the keyword question's variable name in Qualtrics must remain set to `Keywords`, so that the exported columns are named `Keywords_1`, `Keywords_2`, etc.

---

## Current source type mapping

Stored in:

`scripts/build_site_data.py`

```python
SOURCE_TYPE_MAP = {
    "1": "Single paper",
    "2": "Multiple works / larger project",
    "3": "Work in progress",
    "4": "Other"
}
```

---

## Current lab/team mapping

Stored in:

`scripts/build_site_data.py`

```python
LAB_TEAM_MAP = {
    "1": "Barnaghi Lab",
    "2": "Constandinou Lab",
    "3": "Dijk Lab",
    "4": "Freemont Lab",
    "5": "Haar Lab",
    "6": "Jaramillo Lab",
    "7": "Lally Lab",
    "8": "Scott Lab",
    "9": "Sharp Lab",
    "10": "Vaidyanathan Lab",
    "17": "Malhotra Lab",
    "18": "Design Team",
    "19": "Software Engineering Team",
    "20": "Health & Social Care Translation",
    "21": "Data Science Team"
}
```

### Important note
Qualtrics internal choice codes may not match the visible order of options in the form.

If a team starts displaying as a number instead of a name, inspect the live Qualtrics choice mapping before editing this dictionary.

---

## How the site updates automatically

The GitHub Actions workflow runs every 15 minutes.

It can also be triggered manually through the **Actions** tab in GitHub.

### To run it manually
1. Open the repository on GitHub
2. Click **Actions**
3. Click **Update submissions**
4. Click **Run workflow**
5. Select the `main` branch and run it

This is useful if you want to force an update without waiting for the next scheduled run.

---

## Where the Qualtrics credentials are stored

The Qualtrics credentials are stored as **GitHub repository secrets**.

They are:
- `QUALTRICS_API_TOKEN`
- `QUALTRICS_DATA_CENTER`
- `QUALTRICS_SURVEY_ID`

### To view or update them
1. Open the repository on GitHub
2. Go to **Settings**
3. Go to **Secrets and variables**
4. Click **Actions**

Do **not** store these values directly in the repository.

---

## How to change the public links on the site

The public-facing links are stored in:

`config.js`

This file controls links such as:
- the Qualtrics submission form
- the DAISy Lay Summary AI Assistant

### To update a link
1. Edit `config.js`
2. Commit the change
3. Push to GitHub

The live site will update after GitHub Pages republishes.

---

## How to update branding or text

### Branding and layout
Main visual styling is controlled in:

`style.css`

### Homepage wording
Main explainer text and headings are controlled in:

`index.html`

### Detail page wording
Detail-page layout and labels are controlled in:

`entry.html` and `entry.js`

---

## How to preview the site locally

To preview the site locally:

```bash
cd ~/Projects/ukdri-display-site
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

This is only for local preview.  
The live publishing flow is through GitHub Actions and GitHub Pages.

---

## What to do if a new submission does not appear

Check these in order:

1. Wait at least 15 minutes for the scheduled workflow
2. Check the **Actions** tab and see whether the latest workflow run succeeded
3. If needed, run the workflow manually
4. Check whether the submission exists in Qualtrics
5. Check whether the response is marked as finished
6. Check whether the submission includes the expected content fields
7. Check whether the field mappings in `scripts/build_site_data.py` still match the current Qualtrics export

---

## Image compression

Images uploaded through Qualtrics are automatically compressed when downloaded by the build script:

- resized to a maximum width of 1200px (aspect ratio preserved)
- converted to JPEG at quality 82 (unless the image has transparency, in which case it is kept as PNG)

This keeps image file sizes small (typically under 200KB) without needing to manually resize before uploading.

The `Pillow` Python library handles this and is listed in `requirements.txt`.

---

## What to do if images do not appear

Check:

1. whether the Qualtrics submission actually included an uploaded file
2. whether the latest GitHub Actions run succeeded
3. whether a file was added into the `images/` folder in the repo (it will be a `.jpg` unless the original had transparency)
4. whether the entry in `data/submissions.json` has a valid `image_path`

The build script clears old generated images before rebuilding.

---

## What to do if a workflow run fails

1. Open the repository on GitHub
2. Click **Actions**
3. Click the failed **Update submissions** run
4. Open the failing step and read the error message

Common causes:
- incorrect Qualtrics secret values
- changed Qualtrics field codes (QID numbers)
- changed lab/team option codes in Qualtrics (the `LAB_TEAM_MAP` in `build_site_data.py` may need updating)
- temporary GitHub Actions or network issues
- Git push conflicts if a manual code commit and a scheduled workflow run overlap (the workflow is configured to prefer its own data in this case)

---

## What not to do

Do **not**:
- commit API tokens or passwords into the repository
- add `.env` files to the repository
- store private credentials in `config.js`
- put private internal-only documents into this public repository unless they are intended to be public

---

## Development history

This project originally began as a local workflow using Qualtrics, a local Python sync, and a separate display layer.

It was later migrated to a GitHub Actions + GitHub Pages workflow.

Older local folders may still exist as backup/reference only and are not part of the live system.

---

## In summary

For normal operation, you usually only need to know these things:

- **Links** are updated in `config.js`
- **Branding/styles** are updated in `style.css`
- **Homepage explainer text** is updated in `index.html`
- **Detail page layout** is updated in `entry.html` and `entry.js`
- **Source type and lab/team mappings** are updated in `scripts/build_site_data.py`
- **Keywords** are read automatically from Qualtrics — no code changes needed when the survey changes
- **Images** are automatically compressed on download — no manual resizing needed
- **Manual refresh** is done from the **Actions** tab
- **Secrets** are managed in **Settings → Secrets and variables → Actions**
