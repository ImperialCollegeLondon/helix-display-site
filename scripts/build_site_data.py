import os
import io
import csv
import json
import time
import zipfile
import requests
import warnings
from PIL import Image
from urllib3.exceptions import NotOpenSSLWarning

warnings.filterwarnings("ignore", category=NotOpenSSLWarning)

QUALTRICS_API_TOKEN = os.getenv("QUALTRICS_API_TOKEN")
QUALTRICS_DATA_CENTER = os.getenv("QUALTRICS_DATA_CENTER")
QUALTRICS_SURVEY_ID = os.getenv("QUALTRICS_SURVEY_ID")

# Helix survey (SV_9LdgMtnBVbjZ1gq): QID8 "What are you summarising?" recode values
SOURCE_TYPE_MAP = {
    "6": "Academic paper",
    "7": "Public report",
    "8": "White paper",
    "9": "Blog post",
    "10": "Other"
}

# QID12 "Which of our research themes are you submitting on behalf of?" recode values
THEME_MAP = {
    "1": "Enabling the shift to prevention",
    "4": "PPIE",
    "23": "Education",
    "3": "Care in the community",
    "5": "Designing for marginalised groups"
}

# Columns are resolved from the CSV label row (question text), so this works
# whatever the export tags are. Substring match against the normalised label.
FIELD_LABEL_PATTERNS = {
    "title": "publication title",
    "project_date": "date of publication",
    "short_description": "1-2 sentence summary",
    "lay_summary": "paste your lay summary",
    "theme": "which of our research themes",
    "acknowledgements": "acknowledgements",
    "link": "insert a link to the full paper",
    "corresponding_team_member": "corresponding team member for publication / project (name)",
    "contact_email": "corresponding team member for publication / project (email)",
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
        "compress": False
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


def resolve_columns(header_row, label_row):
    """Map logical fields to CSV columns using the question-text label row."""
    columns = {}
    keyword_map = {}

    for field, label in zip(header_row, label_row):
        norm = normalise_label(label)

        if norm.startswith("keywords"):
            if " - " in label:
                keyword_label = label.rsplit(" - ", 1)[-1].strip()
                if keyword_label:
                    keyword_map[field] = keyword_label
            continue

        if norm.startswith("please upload a photo"):
            if field.endswith("_Id"):
                columns["image_id"] = field
            elif field.endswith("_Name"):
                columns["image_name"] = field
            elif field.endswith("_Type"):
                columns["image_type"] = field
            continue

        if norm.startswith("what are you summarising"):
            if norm.endswith("text"):
                columns["source_type_other"] = field
            else:
                columns.setdefault("source_type", field)
            continue

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

    return columns, keyword_map


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

    lines = text.splitlines()
    header_row = next(csv.reader([lines[0]]))
    label_row = next(csv.reader([lines[1]]))
    columns, keyword_map = resolve_columns(header_row, label_row)
    log(f"Detected {len(keyword_map)} keywords from survey: {list(keyword_map.values())}")

    reader = csv.DictReader(lines)
    return list(reader), columns, keyword_map


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
def extract_keywords(row, keyword_map):
    return [
        label for field, label in keyword_map.items()
        if row.get(field, "").strip() == "1"
    ]

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
            max_width = 1200
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


def convert_row(row, columns, keyword_map):
    def col(key):
        return row.get(columns.get(key, ""), "").strip()

    response_id = row.get("ResponseId", "").strip()
    title = col("title")
    source_type_code = col("source_type")
    source_type_other = col("source_type_other")
    theme_code = col("theme")
    short_description = col("short_description")
    lay_summary = col("lay_summary")
    acknowledgements = col("acknowledgements")
    link = col("link")
    corresponding_team_member = col("corresponding_team_member")
    contact_email = col("contact_email")
    project_date = col("project_date")

    source_type = SOURCE_TYPE_MAP.get(source_type_code, source_type_code)
    if source_type_code == "10" and source_type_other:
        source_type = source_type_other

    keywords = extract_keywords(row, keyword_map)
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
        "theme": THEME_MAP.get(theme_code, theme_code),
        "project_date": project_date,
        "corresponding_team_member": corresponding_team_member,
        "contact_email": contact_email,
        "acknowledgements": acknowledgements,
        "link": link,
        "keywords": keywords,
        "short_description": short_description,
        "lay_summary": lay_summary,
        "image_path": image_path
    }

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
    rows, columns, keyword_map = parse_csv_export(content)
    real_rows = get_real_rows(rows, columns)

    log(f"Found {len(real_rows)} real responses")

    submissions = []
    for row in real_rows:
        try:
            response_id = row.get("ResponseId", "UNKNOWN")
            log(f"Processing {response_id}")
            submission = convert_row(row, columns, keyword_map)
            submissions.append(submission)
        except Exception as e:
            response_id = row.get("ResponseId", "UNKNOWN")
            log(f"Error processing {response_id}: {repr(e)}")

    assign_refs(submissions)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(submissions, f, indent=2, ensure_ascii=False)

    log(f"Wrote {len(submissions)} submissions to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
