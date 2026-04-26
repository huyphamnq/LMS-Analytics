from __future__ import annotations

import argparse
import csv
import hashlib
import os
from datetime import datetime, timezone
from typing import Dict, Any, Tuple

from pymongo import ReturnDocument

from scripts.db_tools import get_db

METRICS = [
    "active_days",
    "login_count",
    "video_views",
    "document_reads",
    "discussion",
    "assignment_duration_mins",
    "ontime_margin",
    "days_since_last_login",
    "session_duration",
]

WEEKS = [1, 2, 3]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def slugify(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in (value or "").strip().lower())
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned.strip("_")


def to_int(value: Any) -> int:
    if value in (None, "", "nan"):
        return 0
    return int(float(value))


def to_float(value: Any) -> float:
    if value in (None, "", "nan"):
        return 0.0
    return float(value)


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def build_class_id(subject_id: str, class_name: str, semester: str, year: int) -> str:
    return f"{subject_id}:{slugify(class_name)}:{semester}:{year}"


def ensure_subject(db, subject_id: str, subject_name: str):
    return db["subjects"].find_one_and_update(
        {"subject_id": subject_id},
        {
            "$set": {"subject_name": subject_name, "updated_at": now_utc(), "active": True},
            "$setOnInsert": {"created_at": now_utc()},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )


def ensure_class(db, class_id: str, class_name: str, subject_id: str, semester: str, year: int):
    return db["classes"].find_one_and_update(
        {"class_id": class_id},
        {
            "$set": {
                "class_name": class_name,
                "subject_id": subject_id,
                "semester": semester,
                "year": year,
                "active": True,
                "updated_at": now_utc(),
            },
            "$setOnInsert": {"created_at": now_utc()},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )


def ensure_student(db, student_code: str, full_name: str, email: str):
    return db["students"].find_one_and_update(
        {"student_code": student_code},
        {
            "$set": {
                "full_name": full_name,
                "email": email,
                "status": "active",
                "updated_at": now_utc(),
            },
            "$setOnInsert": {"created_at": now_utc()},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )


def ensure_enrollment(db, student_id, class_id):
    return db["enrollments"].find_one_and_update(
        {"student_id": student_id, "class_id": class_id},
        {
            "$set": {"status": "active", "updated_at": now_utc()},
            "$setOnInsert": {"enrolled_at": now_utc(), "created_at": now_utc()},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )


def weekly_payload(row: Dict[str, Any], week: int) -> Dict[str, Any]:
    suffix = f"w{week}"
    active_days = to_int(row.get(f"active_days_{suffix}"))
    if active_days < 0 or active_days > 7:
        raise ValueError(f"active_days_{suffix} must be in range 0..7")

    payload = {
        "week": week,
        "active_days": active_days,
        "login_count": to_int(row.get(f"login_count_{suffix}")),
        "video_views": to_int(row.get(f"video_views_{suffix}")),
        "document_reads": to_int(row.get(f"document_reads_{suffix}")),
        "discussion": to_int(row.get(f"discussion_{suffix}")),
        "assignment_duration_mins": to_float(row.get(f"assignment_duration_mins_{suffix}")),
        "ontime_margin": to_float(row.get(f"ontime_margin_{suffix}")),
        "days_since_last_login": to_int(row.get(f"days_since_last_login_{suffix}")),
        "session_duration": to_float(row.get(f"session_duration_{suffix}")),
    }

    if payload["login_count"] < 0:
        raise ValueError(f"login_count_{suffix} must be >= 0")

    return payload


def log_row_error(db, batch_id: str, row_number: int, code: str, message: str, row_snapshot: Dict[str, Any]) -> None:
    db["import_batch_errors"].insert_one(
        {
            "batch_id": batch_id,
            "row_number": row_number,
            "error_code": code,
            "error_message": message,
            "row_snapshot": row_snapshot,
            "created_at": now_utc(),
        }
    )


def process_csv(
    csv_path: str,
    imported_by: str,
    semester: str,
    year: int,
    subject_override: str | None,
    dry_run: bool,
) -> Tuple[str, Dict[str, int]]:
    db = get_db()

    batch_id = f"imp_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    batch_doc = {
        "batch_id": batch_id,
        "source_file": {
            "name": os.path.basename(csv_path),
            "sha256": file_sha256(csv_path),
            "size_bytes": os.path.getsize(csv_path),
        },
        "imported_by": imported_by,
        "status": "running",
        "started_at": now_utc(),
        "finished_at": None,
        "total_rows": 0,
        "success_rows": 0,
        "failed_rows": 0,
        "skipped_rows": 0,
        "options": {"dry_run": dry_run},
        "metadata": {"semester": semester, "year": year, "subject_override": subject_override},
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    db["import_batches"].insert_one(batch_doc)

    stats = {"total": 0, "success": 0, "failed": 0, "skipped": 0}

    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader, start=2):
            stats["total"] += 1
            try:
                student_code = (row.get("student_id") or "").strip()
                full_name = (row.get("full_name") or "").strip()
                email = (row.get("email") or "").strip()
                class_name = (row.get("class") or "").strip()
                course_name = (row.get("course") or "").strip()

                if not student_code:
                    raise ValueError("student_id is required")
                if not full_name:
                    raise ValueError("full_name is required")
                if not class_name:
                    raise ValueError("class is required")
                if not course_name:
                    raise ValueError("course is required")

                subject_id = subject_override or slugify(course_name)
                if not subject_id:
                    raise ValueError("subject_id could not be resolved")

                weekly = [weekly_payload(row, week) for week in WEEKS]

                if dry_run:
                    stats["success"] += 1
                    continue

                subject_doc = ensure_subject(db, subject_id=subject_id, subject_name=course_name)
                class_id = build_class_id(subject_id, class_name, semester, year)
                class_doc = ensure_class(
                    db,
                    class_id=class_id,
                    class_name=class_name,
                    subject_id=subject_doc["subject_id"],
                    semester=semester,
                    year=year,
                )
                student_doc = ensure_student(db, student_code=student_code, full_name=full_name, email=email)
                enrollment_doc = ensure_enrollment(db, student_id=student_doc["_id"], class_id=class_doc["_id"])

                for week_doc in weekly:
                    db["weekly_logs"].update_one(
                        {"enrollment_id": enrollment_doc["_id"], "week": week_doc["week"]},
                        {
                            "$set": {
                                **week_doc,
                                "enrollment_id": enrollment_doc["_id"],
                                "updated_at": now_utc(),
                            },
                            "$setOnInsert": {"created_at": now_utc()},
                        },
                        upsert=True,
                    )

                stats["success"] += 1
            except Exception as exc:
                stats["failed"] += 1
                log_row_error(
                    db,
                    batch_id=batch_id,
                    row_number=idx,
                    code="ROW_VALIDATION_ERROR",
                    message=str(exc),
                    row_snapshot=row,
                )

    final_status = "completed"
    if stats["failed"] > 0 and stats["success"] > 0:
        final_status = "partial"
    elif stats["failed"] > 0 and stats["success"] == 0:
        final_status = "failed"

    db["import_batches"].update_one(
        {"batch_id": batch_id},
        {
            "$set": {
                "status": final_status,
                "finished_at": now_utc(),
                "total_rows": stats["total"],
                "success_rows": stats["success"],
                "failed_rows": stats["failed"],
                "skipped_rows": stats["skipped"],
                "updated_at": now_utc(),
            }
        },
    )

    return batch_id, stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import CSV into normalized LMS schema with batch tracking.")
    parser.add_argument("--csv", required=True, help="Absolute or relative path to CSV file")
    parser.add_argument("--imported-by", default="system", help="User/email performing import")
    parser.add_argument("--semester", default="S1", help="Semester label, e.g. S1 or S2")
    parser.add_argument("--year", type=int, default=datetime.now().year, help="Academic year")
    parser.add_argument("--subject-id", default=None, help="Optional subject_id override for all rows")
    parser.add_argument("--dry-run", action="store_true", help="Validate only, do not write data")
    return parser.parse_args()


def run() -> None:
    args = parse_args()
    batch_id, stats = process_csv(
        csv_path=args.csv,
        imported_by=args.imported_by,
        semester=args.semester,
        year=args.year,
        subject_override=args.subject_id,
        dry_run=args.dry_run,
    )
    print(f"Batch: {batch_id}")
    print(f"Rows total={stats['total']} success={stats['success']} failed={stats['failed']} skipped={stats['skipped']}")


if __name__ == "__main__":
    run()
