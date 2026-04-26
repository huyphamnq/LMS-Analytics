from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pymongo import ReturnDocument

from scripts.db_tools import get_db


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def slugify(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in (value or "").strip().lower())
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned.strip("_")


def parse_legacy_datetime(value):
    if isinstance(value, datetime):
        return value
    if not value:
        return now_utc()
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        return now_utc()


def ensure_subject(db, subject_id: str, subject_name: str):
    return db["subjects"].find_one_and_update(
        {"subject_id": subject_id},
        {
            "$set": {"subject_name": subject_name, "active": True, "updated_at": now_utc()},
            "$setOnInsert": {"created_at": now_utc()},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )


def ensure_class(db, class_id: str, class_name: str, subject_id: str):
    return db["classes"].find_one_and_update(
        {"class_id": class_id},
        {
            "$set": {
                "class_name": class_name,
                "subject_id": subject_id,
                "semester": "UNKNOWN",
                "year": datetime.now().year,
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
            "$set": {"full_name": full_name, "email": email, "status": "active", "updated_at": now_utc()},
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


def resolve_enrollment_id(db, student_id: str, course_name: str, class_name: str, subject_id: Optional[str]):
    log_query = {"student_id": student_id}
    if course_name:
        log_query["course_name"] = course_name
    if class_name:
        log_query["class_name"] = class_name

    student_log = db["student_logs"].find_one(log_query)
    if not student_log and student_id:
        student_log = db["student_logs"].find_one({"student_id": student_id})
    if not student_log:
        return None

    resolved_subject = subject_id or student_log.get("subject_id") or slugify(student_log.get("course_name", ""))
    if not resolved_subject:
        return None

    subject_doc = ensure_subject(db, resolved_subject, student_log.get("course_name", resolved_subject))
    class_name_resolved = student_log.get("class_name", class_name or "UNKNOWN")
    class_id = f"{subject_doc['subject_id']}:{slugify(class_name_resolved)}:UNKNOWN:{datetime.now().year}"
    class_doc = ensure_class(db, class_id, class_name_resolved, subject_doc["subject_id"])
    student_doc = ensure_student(
        db,
        student_code=student_log.get("student_id"),
        full_name=student_log.get("full_name", "Unknown"),
        email=student_log.get("email", ""),
    )
    enrollment_doc = ensure_enrollment(db, student_doc["_id"], class_doc["_id"])
    return enrollment_doc["_id"]


def backfill_predictions(db) -> tuple[int, int]:
    updated = 0
    skipped = 0
    query = {"$or": [{"enrollment_id": {"$exists": False}}, {"enrollment_id": None}]}

    for pred in db["predictions"].find(query):
        enrollment_id = resolve_enrollment_id(
            db,
            student_id=pred.get("student_id", ""),
            course_name=pred.get("course_name", ""),
            class_name=pred.get("class_name", ""),
            subject_id=pred.get("subject_id"),
        )
        if not enrollment_id:
            skipped += 1
            continue

        db["predictions"].update_one(
            {"_id": pred["_id"]},
            {
                "$set": {
                    "enrollment_id": enrollment_id,
                    "updated_at": pred.get("updated_at") or now_utc(),
                }
            },
        )
        updated += 1

    return updated, skipped


def backfill_interventions(db) -> tuple[int, int]:
    updated = 0
    skipped = 0
    query = {"$or": [{"enrollment_id": {"$exists": False}}, {"enrollment_id": None}]}

    for inv in db["interventions"].find(query):
        enrollment_id = resolve_enrollment_id(
            db,
            student_id=inv.get("student_id", ""),
            course_name=inv.get("course_name", ""),
            class_name="",
            subject_id=None,
        )
        if not enrollment_id:
            skipped += 1
            continue

        db["interventions"].update_one(
            {"_id": inv["_id"]},
            {
                "$set": {
                    "enrollment_id": enrollment_id,
                    "created_at": parse_legacy_datetime(inv.get("date")),
                }
            },
        )
        updated += 1

    return updated, skipped


def run() -> None:
    db = get_db()

    pred_updated, pred_skipped = backfill_predictions(db)
    inv_updated, inv_skipped = backfill_interventions(db)

    print("Backfill completed.")
    print(f"predictions updated={pred_updated} skipped={pred_skipped}")
    print(f"interventions updated={inv_updated} skipped={inv_skipped}")


if __name__ == "__main__":
    run()
