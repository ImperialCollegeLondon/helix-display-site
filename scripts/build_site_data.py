import os
import io
import re
import csv
import json
import time
import zipfile
import requests
import warnings
from datetime import datetime
from PIL import Image
from urllib3.exceptions import NotOpenSSLWarning

warnings.filterwarnings("ignore", category=NotOpenSSLWarning)

QUALTRICS_API_TOKEN = os.getenv("QUALTRICS_API_TOKEN")
QUALTRICS_DATA_CENTER = os.getenv("QUALTRICS_DATA_CENTER")
QUALTRICS_SURVEY_ID = os.getenv("QUALTRICS_SURVEY_ID")

# The export is requested with useLabels=true, so choice questions come through
# as their visible text ("Academic paper", "Dementia", ...) rather than numeric
# recode values. These maps are only a fallback for older numeric exports.
SOURCE_TYPE_MAP = {
    "6": "Academic paper",
    "7": "Public report",
    "8": "White paper",
    "9": "Blog post",
    "10": "Other"
}

# Columns are resolved from the CSV label row (question text), so this works
# whatever the export tags are. Substring match against the normalised label.
FIELD_LABEL_PATTERNS = {
    "title": "publication title",
    "project_date": "date of publication",
    "date_range_note": "if the work spans a period",
    "short_description": "1-2 sentence summary",
    "lay_summary": "paste your lay summary",
    "theme": "which of our themes",
    "subproject": "which particular subproject",
    # Matched on the tail of the question so it works whether the survey says
    # "Led by Helix" or "Lead by Helix" — the earlier pattern assumed "lead"
    # and silently stopped matching when the survey was corrected to "Led".
    "led_or_contributed": "helix or helix contributed",
    "authors": "author list",
    "acknowledgements": "acknowledgements",
    "link": "insert a link to the full paper",
    # The corresponding team member's name and email are handled separately in
    # resolve_columns — they are two rows of one question and share its wording.
}

# Multi-select questions: every "<prefix> - <choice>" column becomes a list item.
MULTI_SELECT_PATTERNS = {
    "keywords": "keywords",
    "helix_authors": "helix authors",
}

# Fallbacks if a label can't be matched (QIDs seen in the live Helix survey)
DEFAULT_COLUMNS = {
    "title": "QID2",
    "project_date": "QID14",
    "short_description": "QID15",
    "lay_summary": "QID3",
    "source_type": "QID8",
    "source_type_other": "QID8_10_TEXT",
    "theme": "QID12",
    "acknowledgements": "QID10",
    "link": "QID16",
    "corresponding_team_member": "QID11",
    "contact_email": "QID5",
    "image_id": "QID7_Id",
    "image_name": "QID7_Name",
    "image_type": "QID7_Type",
}

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
IMAGES_DIR = os.path.join(BASE_DIR, "images")
OUTPUT_JSON = os.path.join(DATA_DIR, "submissions.json")
REFS_JSON = os.path.join(DATA_DIR, "refs.json")


def log(message):
    print(message)


def ensure_directories():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(IMAGES_DIR, exist_ok=True)


def clear_old_generated_images():
    for filename in os.listdir(IMAGES_DIR):
        if filename.startswith("R_"):
            file_path = os.path.join(IMAGES_DIR, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)


def validate_config():
    missing = []

    if not QUALTRICS_API_TOKEN:
        missing.append("QUALTRICS_API_TOKEN")
    if not QUALTRICS_DATA_CENTER:
        missing.append("QUALTRICS_DATA_CENTER")
    if not QUALTRICS_SURVEY_ID:
        missing.append("QUALTRICS_SURVEY_ID")

    if missing:
        raise Exception(f"Missing required environment variables: {', '.join(missing)}")


def start_export():
    url = f"https://{QUALTRICS_DATA_CENTER}.qualtrics.com/API/v3/surveys/{QUALTRICS_SURVEY_ID}/export-responses"

    headers = {
        "X-API-TOKEN": QUALTRICS_API_TOKEN,
        "Content-Type": "application/json"
    }

    payload = {
        "format": "csv",
        "compress": False,
        # Export choice text rather than numeric recode values, so the site
        # keeps working when survey choices are edited or reordered.
        "useLabels": True
    }

    response = requests.post(url, headers=headers, json=payload, timeout=60)
    response.raise_for_status()
    return response.json()["result"]["progressId"]


def check_export(progress_id):
    url = f"https://{QUALTRICS_DATA_CENTER}.qualtrics.com/API/v3/surveys/{QUALTRICS_SURVEY_ID}/export-responses/{progress_id}"

    headers = {
        "X-API-TOKEN": QUALTRICS_API_TOKEN
    }

    response = requests.get(url, headers=headers, timeout=60)
    response.raise_for_status()
    return response.json()


def wait_for_file_id(progress_id):
    for i in range(30):
        data = check_export(progress_id)
        result = data.get("result", {})
        status = result.get("status")
        log(f"Export check {i + 1}: {status}")

        if status == "complete":
            return result["fileId"]

        if status == "failed":
            raise Exception("Qualtrics export failed")

        time.sleep(2)

    raise Exception("Timed out waiting for export")


def download_export_file(file_id):
    url = f"https://{QUALTRICS_DATA_CENTER}.qualtrics.com/API/v3/surveys/{QUALTRICS_SURVEY_ID}/export-responses/{file_id}/file"

    headers = {
        "X-API-TOKEN": QUALTRICS_API_TOKEN
    }

    response = requests.get(url, headers=headers, timeout=120)
    response.raise_for_status()
    return response.content


def normalise_label(label):
    return " ".join(label.strip().lower().split())


# Accepted date spellings. The survey now uses a dd/mm/yyyy picker, but older
# responses were free text, so several formats are tried before giving up.
DATE_FORMATS = [
    "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y/%m/%d",
    # Commas are stripped before matching, so these have no comma in them.
    "%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y",
    "%B %Y", "%b %Y", "%Y",
]

ORDINAL_PATTERN = re.compile(r"(\d{1,2})(st|nd|rd|th)\b", re.IGNORECASE)


def parse_date(value):
    """Return (iso_date, display_text) for a submitted date, or ("", value).

    iso_date is used for sorting; display_text is a consistent "23 April 2026".
    Anything unparseable is passed through unchanged so nothing is ever lost.
    """
    text = (value or "").strip()

    if not text:
        return "", ""

    cleaned = ORDINAL_PATTERN.sub(r"\1", text).replace(",", " ")
    cleaned = " ".join(cleaned.split())

    for fmt in DATE_FORMATS:
        try:
            parsed = datetime.strptime(cleaned, fmt)
        except ValueError:
            continue

        if fmt == "%Y":
            return parsed.strftime("%Y-01-01"), parsed.strftime("%Y")
        if fmt in ("%B %Y", "%b %Y"):
            return parsed.strftime("%Y-%m-01"), parsed.strftime("%B %Y")

        # %-d isn't portable, so strip a leading zero by hand.
        return parsed.strftime("%Y-%m-%d"), f"{parsed.day} {parsed.strftime('%B %Y')}"

    log(f"Could not parse date {text!r} — leaving it as typed")
    return "", text


def resolve_columns(header_row, label_row):
    """Map logical fields to CSV columns using the question-text label row."""
    columns = {}
    multi_maps = {key: {} for key in MULTI_SELECT_PATTERNS}
    deferred = []

    for field, label in zip(header_row, label_row):
        norm = normalise_label(label)

        matched_multi = next(
            (key for key, prefix in MULTI_SELECT_PATTERNS.items() if norm.startswith(prefix)),
            None
        )
        if matched_multi:
            if " - " in label:
                choice_label = label.rsplit(" - ", 1)[-1].strip()
                if choice_label:
                    multi_maps[matched_multi][field] = choice_label
            continue

        if norm.startswith("please upload a photo"):
            if field.endswith("_Id"):
                columns["image_id"] = field
            elif field.endswith("_Name"):
                columns["image_name"] = field
            elif field.endswith("_Type"):
                columns["image_type"] = field
            continue

        # Name and email are two rows of a single question, so both columns
        # carry the same question wording and differ only at the end
        # ("… - Name" / "… - Email"). Earlier responses came from two separate
        # questions ending "(Name)" and "(Email)". Matching on the last word
        # covers both, whatever punctuation Qualtrics puts in between.
        if norm.startswith("corresponding team member"):
            last_word = norm.rstrip(") .:").rsplit(" ", 1)[-1]
            if last_word.endswith("email"):
                columns.setdefault("contact_email", field)
            elif last_word.endswith("name"):
                columns.setdefault("corresponding_team_member", field)
            continue

        if norm.startswith("what are you summarising"):
            if norm.endswith("text"):
                columns["source_type_other"] = field
            else:
                columns.setdefault("source_type", field)
            continue

        # Prefer a question that *starts* with the pattern. One question can
        # mention another's wording — the acknowledgements question refers to
        # the "author list" — and without this the wrong column would win
        # whenever the questions were reordered.
        exact = next(
            (key for key, pattern in FIELD_LABEL_PATTERNS.items()
             if key not in columns and norm.startswith(pattern)),
            None
        )

        if exact:
            columns[exact] = field
        else:
            deferred.append((field, norm))

    # Second pass: anything still unmatched may appear mid-question.
    for field, norm in deferred:
        for key, pattern in FIELD_LABEL_PATTERNS.items():
            if key not in columns and pattern in norm:
                columns[key] = field
                break

    for key, fallback in DEFAULT_COLUMNS.items():
        if key not in columns and fallback in header_row:
            columns[key] = fallback

    missing = [key for key in DEFAULT_COLUMNS if key not in columns]
    log(f"Resolved columns: {columns}")
    if missing:
        log(f"WARNING: could not resolve columns for: {missing}")

    for key, mapping in multi_maps.items():
        log(f"Detected {len(mapping)} {key} options: {list(mapping.values())}")

    return columns, multi_maps


def parse_csv_export(content):
    try:
        text = content.decode("utf-8-sig")
    except Exception:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            text = None
            for filename in z.namelist():
                if filename.endswith(".csv"):
                    with z.open(filename) as f:
                        text = f.read().decode("utf-8-sig")
                    break

            if text is None:
                raise Exception("Could not find CSV file in ZIP")

    # The CSV must be read as a single stream, not as a list of lines. Long
    # answers contain paragraph breaks, and in a CSV those sit inside a quoted
    # field. Splitting the text into lines first hides them from the reader,
    # which then joins the paragraphs together with nothing between them.
    stream = io.StringIO(text.replace("\r\n", "\n").replace("\r", "\n"), newline="")
    reader = csv.reader(stream)
    header_row = next(reader)
    label_row = next(reader)
    columns, multi_maps = resolve_columns(header_row, label_row)

    rows = []
    for row in reader:
        # Pad or trim so a malformed row can never shift every later column.
        row = (row + [""] * len(header_row))[:len(header_row)]
        rows.append(dict(zip(header_row, row)))

    return rows, columns, multi_maps


def get_real_rows(rows, columns):
    real_rows = []

    for row in rows:
        response_id = row.get("ResponseId", "").strip()
        finished = row.get("Finished", "").strip().lower()
        title = row.get(columns.get("title", ""), "").strip()
        lay_summary = row.get(columns.get("lay_summary", ""), "").strip()

        if not response_id.startswith("R_"):
            continue

        if finished not in ("1", "true"):
            continue

        if not title and not lay_summary:
            continue

        real_rows.append(row)

    return real_rows
def extract_multi_select(row, choice_map):
    """Selected options for a checkbox question.

    Handles both export styles: useLabels=true puts the choice text in the
    cell, the older numeric export puts "1". Anything non-empty (other than a
    literal "0"/"false") counts as selected, and the label comes from the
    header so the value format doesn't matter.
    """
    selected = []

    for field, label in choice_map.items():
        value = row.get(field, "").strip()
        if value and value.lower() not in ("0", "false", "no"):
            selected.append(label)

    return selected

def get_file_extension(filename, content_type):
    if filename and "." in filename:
        return "." + filename.split(".")[-1].lower()

    if content_type == "image/png":
        return ".png"
    if content_type == "image/jpeg":
        return ".jpg"

    return ".bin"


def compress_image(path):
    try:
        with Image.open(path) as img:
            # The detail page shows the photo as a full-width banner, so it is
            # displayed larger than it used to be and needs a little more pixel
            # width to stay sharp on high-resolution screens.
            max_width = 1600
            if img.width > max_width:
                ratio = max_width / img.width
                img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)

            has_transparency = img.mode == "RGBA" and img.getextrema()[3][0] < 255

            if not has_transparency:
                jpeg_path = os.path.splitext(path)[0] + ".jpg"
                img.convert("RGB").save(jpeg_path, "JPEG", quality=82, optimize=True)
                if jpeg_path != path:
                    os.remove(path)
                return jpeg_path

            img.save(path, optimize=True)
            return path
    except Exception as e:
        log(f"Could not compress image {path}: {e}")
        return path


def download_image(response_id, file_id, original_filename, content_type):
    if not file_id:
        return ""

    url = f"https://{QUALTRICS_DATA_CENTER}.qualtrics.com/API/v3/surveys/{QUALTRICS_SURVEY_ID}/responses/{response_id}/uploaded-files/{file_id}"

    headers = {
        "X-API-TOKEN": QUALTRICS_API_TOKEN
    }

    response = requests.get(url, headers=headers, timeout=120)
    response.raise_for_status()

    extension = get_file_extension(original_filename, content_type)
    output_filename = f"{response_id}{extension}"
    output_path = os.path.join(IMAGES_DIR, output_filename)

    with open(output_path, "wb") as f:
        f.write(response.content)

    output_path = compress_image(output_path)
    return f"images/{os.path.basename(output_path)}"


def convert_row(row, columns, multi_maps):
    def col(key):
        return row.get(columns.get(key, ""), "").strip()

    response_id = row.get("ResponseId", "").strip()
    title = col("title")
    source_type_code = col("source_type")
    source_type_other = col("source_type_other")
    short_description = col("short_description")
    lay_summary = col("lay_summary")
    acknowledgements = col("acknowledgements")
    link = col("link")
    corresponding_team_member = col("corresponding_team_member")
    contact_email = col("contact_email")
    project_date_raw = col("project_date")
    date_range_note = col("date_range_note")
    publication_date_iso, project_date = parse_date(project_date_raw)

    # With useLabels=true these already hold the choice text.
    theme = col("theme")
    subproject = col("subproject")
    led_or_contributed = col("led_or_contributed")

    source_type = SOURCE_TYPE_MAP.get(source_type_code, source_type_code)
    if source_type_code in ("10", "Other") and source_type_other:
        source_type = source_type_other

    keywords = extract_multi_select(row, multi_maps.get("keywords", {}))
    authors = col("authors")

    # The survey used to have a Helix Authors tick-list; it has been replaced
    # by a free-text author list. Older responses still carry the tick-list, so
    # fall back to it when the free-text answer isn't there.
    helix_authors = extract_multi_select(row, multi_maps.get("helix_authors", {}))
    if not authors and helix_authors:
        authors = ", ".join(helix_authors)
    recorded_date = row.get("RecordedDate", "").strip()

    file_id = col("image_id")
    original_filename = col("image_name")
    content_type = col("image_type")

    image_path = ""
    if file_id:
        log(f"Downloading image for {response_id}")
        image_path = download_image(response_id, file_id, original_filename, content_type)

    return {
        "response_id": response_id,
        "recorded_date": recorded_date,
        "title": title or "Untitled",
        "source_type": source_type,
        "theme": theme,
        "subproject": subproject,
        "led_or_contributed": led_or_contributed,
        "authors": authors,
        "helix_authors": helix_authors,
        "project_date": project_date,
        "publication_date_iso": publication_date_iso,
        "date_range_note": date_range_note,
        "corresponding_team_member": corresponding_team_member,
        "contact_email": contact_email,
        "acknowledgements": acknowledgements,
        "link": link,
        "keywords": keywords,
        "short_description": short_description,
        "lay_summary": lay_summary,
        "image_path": image_path
    }

def count_existing_submissions():
    try:
        with open(OUTPUT_JSON, encoding="utf-8") as f:
            return len(json.load(f))
    except Exception:
        return 0


def check_not_wiping_everything(new_count):
    """Refuse to publish an empty table over a non-empty one.

    Deleting a response in Qualtrics should remove it from the site, and that
    works because the data file is rebuilt from each export. But if an export
    ever comes back empty for the wrong reason — a transient API problem, the
    wrong survey ID, a filter change — the same mechanism would quietly wipe
    every entry and delete every image. Failing the run instead leaves the
    live site untouched and surfaces the problem in the Actions log.

    Set ALLOW_EMPTY_SUBMISSIONS=1 if the survey really has been emptied.
    """
    previous_count = count_existing_submissions()

    if new_count == 0 and previous_count > 0:
        if os.getenv("ALLOW_EMPTY_SUBMISSIONS") == "1":
            log(f"Export returned no responses; publishing anyway "
                f"(ALLOW_EMPTY_SUBMISSIONS=1). {previous_count} entries will be removed.")
            return

        raise Exception(
            f"Export returned no responses but the site currently shows "
            f"{previous_count}. Refusing to publish an empty table. If the survey "
            f"really is empty, re-run with ALLOW_EMPTY_SUBMISSIONS=1."
        )

    if previous_count and new_count < previous_count:
        log(f"{previous_count - new_count} response(s) removed since the last run "
            f"(deleted in Qualtrics or no longer complete).")


def assign_refs(submissions):
    """Give every submission a permanent short reference (001, 002, ...).

    The register in data/refs.json maps response_id -> ref and is only ever
    appended to, so a paper keeps its number forever and numbers are never
    reused, even if earlier responses are deleted.
    """
    try:
        with open(REFS_JSON, encoding="utf-8") as f:
            refs = json.load(f)
    except Exception:
        refs = {}

    next_number = max((int(value) for value in refs.values()), default=0) + 1

    for submission in sorted(submissions, key=lambda s: s.get("recorded_date", "")):
        response_id = submission["response_id"]
        if response_id not in refs:
            refs[response_id] = f"{next_number:03d}"
            next_number += 1
        submission["ref"] = refs[response_id]

    with open(REFS_JSON, "w", encoding="utf-8") as f:
        json.dump(refs, f, indent=2, sort_keys=True)

    log(f"Assigned refs: {[s['ref'] for s in submissions]}")


def main():
    validate_config()
    ensure_directories()
    clear_old_generated_images()

    log("Starting Qualtrics export...")
    progress_id = start_export()

    log("Waiting for export...")
    file_id = wait_for_file_id(progress_id)

    log("Downloading export file...")
    content = download_export_file(file_id)

    log("Parsing CSV...")
    rows, columns, multi_maps = parse_csv_export(content)
    real_rows = get_real_rows(rows, columns)

    log(f"Found {len(real_rows)} real responses")

    submissions = []
    for row in real_rows:
        try:
            response_id = row.get("ResponseId", "UNKNOWN")
            log(f"Processing {response_id}")
            submission = convert_row(row, columns, multi_maps)
            submissions.append(submission)
        except Exception as e:
            response_id = row.get("ResponseId", "UNKNOWN")
            log(f"Error processing {response_id}: {repr(e)}")

    check_not_wiping_everything(len(submissions))
    assign_refs(submissions)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(submissions, f, indent=2, ensure_ascii=False)

    log(f"Wrote {len(submissions)} submissions to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
