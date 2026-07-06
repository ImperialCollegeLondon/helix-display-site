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

SOURCE_TYPE_MAP = {
    "1": "Single paper",
    "2": "Multiple works / larger project",
    "3": "Work in progress",
    "4": "Other"
}

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
    "16": "SABP",
    "17": "Malhotra Lab",
    "18": "Design Team",
    "19": "Software Engineering Team",
    "20": "Health & Social Care Translation",
    "21": "Data Science Team"
}

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
IMAGES_DIR = os.path.join(BASE_DIR, "images")
OUTPUT_JSON = os.path.join(DATA_DIR, "submissions.json")


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


def build_keyword_map(header_row, label_row):
    keyword_map = {}
    for field, label in zip(header_row, label_row):
        if not field.startswith("Keywords_"):
            continue
        label = label.strip()
        if " - " in label:
            label = label.rsplit(" - ", 1)[-1].strip()
        if label:
            keyword_map[field] = label
    return keyword_map


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
    keyword_map = build_keyword_map(header_row, label_row)
    log(f"Detected {len(keyword_map)} keywords from survey: {list(keyword_map.values())}")

    reader = csv.DictReader(lines)
    return list(reader), keyword_map


def get_real_rows(rows):
    real_rows = []

    for row in rows:
        response_id = row.get("ResponseId", "").strip()
        finished = row.get("Finished", "").strip()
        title = row.get("QID2", "").strip()
        lay_summary = row.get("QID3", "").strip()

        if not response_id.startswith("R_"):
            continue

        if finished != "1":
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


def convert_row(row, keyword_map):
    response_id = row.get("ResponseId", "").strip()
    title = row.get("QID2", "").strip()
    source_type_code = row.get("QID8", "").strip()
    lab_or_team_code = row.get("QID12", "").strip()
    short_description = row.get("QID15", "").strip()
    lay_summary = row.get("QID3", "").strip()
    acknowledgements = row.get("QID10", "").strip()
    link = row.get("Link", "").strip()
    corresponding_team_member = row.get("QID11", "").strip()
    contact_email = row.get("QID5", "").strip()
    project_date = row.get("QID14", "").strip()

    keywords = extract_keywords(row, keyword_map)
    recorded_date = row.get("RecordedDate", "").strip()

    file_id = row.get("_Id", "").strip()
    original_filename = row.get("_Name", "").strip()
    content_type = row.get("_Type", "").strip()

    image_path = ""
    if file_id:
        log(f"Downloading image for {response_id}")
        image_path = download_image(response_id, file_id, original_filename, content_type)

    return {
        "response_id": response_id,
        "recorded_date": recorded_date,
        "title": title or "Untitled",
        "source_type": SOURCE_TYPE_MAP.get(source_type_code, source_type_code),
        "lab_or_team": LAB_TEAM_MAP.get(lab_or_team_code, lab_or_team_code),
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
    rows, keyword_map = parse_csv_export(content)
    real_rows = get_real_rows(rows)

    log(f"Found {len(real_rows)} real responses")

    submissions = []
    for row in real_rows:
        try:
            response_id = row.get("ResponseId", "UNKNOWN")
            log(f"Processing {response_id}")
            submission = convert_row(row, keyword_map)
            submissions.append(submission)
        except Exception as e:
            response_id = row.get("ResponseId", "UNKNOWN")
            log(f"Error processing {response_id}: {repr(e)}")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(submissions, f, indent=2, ensure_ascii=False)

    log(f"Wrote {len(submissions)} submissions to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
