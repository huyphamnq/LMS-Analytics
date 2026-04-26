from __future__ import annotations

from datetime import datetime, timezone

from scripts.db_tools import get_db, ensure_indexes


def ensure_collection(db, name: str) -> None:
    if name not in db.list_collection_names():
        db.create_collection(name)
        print(f"Created collection: {name}")
    else:
        print(f"Collection exists: {name}")


def run() -> None:
    db = get_db()

    collections = [
        "students",
        "subjects",
        "classes",
        "enrollments",
        "weekly_logs",
        "import_batches",
        "import_batch_errors",
    ]

    for name in collections:
        ensure_collection(db, name)

    ensure_indexes(
        db["students"],
        [
            ([("student_code", 1)], {"name": "ux_students_student_code", "unique": True}),
            ([("email", 1)], {"name": "ix_students_email"}),
            ([("full_name", 1)], {"name": "ix_students_full_name"}),
        ],
    )

    ensure_indexes(
        db["subjects"],
        [
            ([("subject_id", 1)], {"name": "ux_subjects_subject_id", "unique": True}),
            ([("subject_name", 1)], {"name": "ix_subjects_subject_name"}),
        ],
    )

    ensure_indexes(
        db["classes"],
        [
            ([("class_id", 1)], {"name": "ux_classes_class_id", "unique": True}),
            ([("subject_id", 1), ("semester", 1), ("year", 1)], {"name": "ix_classes_subject_term"}),
            ([("class_name", 1)], {"name": "ix_classes_class_name"}),
        ],
    )

    ensure_indexes(
        db["enrollments"],
        [
            ([("student_id", 1), ("class_id", 1)], {"name": "ux_enrollments_student_class", "unique": True}),
            ([("student_id", 1)], {"name": "ix_enrollments_student_id"}),
            ([("class_id", 1)], {"name": "ix_enrollments_class_id"}),
            ([("status", 1)], {"name": "ix_enrollments_status"}),
        ],
    )

    ensure_indexes(
        db["weekly_logs"],
        [
            ([("enrollment_id", 1), ("week", 1)], {"name": "ux_weekly_logs_enrollment_week", "unique": True}),
            ([("week", 1)], {"name": "ix_weekly_logs_week"}),
            ([("enrollment_id", 1), ("updated_at", -1)], {"name": "ix_weekly_logs_recent"}),
        ],
    )

    ensure_indexes(
        db["import_batches"],
        [
            ([("batch_id", 1)], {"name": "ux_import_batches_batch_id", "unique": True}),
            ([("status", 1)], {"name": "ix_import_batches_status"}),
            ([("imported_by", 1), ("started_at", -1)], {"name": "ix_import_batches_user_started"}),
            ([("started_at", -1)], {"name": "ix_import_batches_started"}),
        ],
    )

    ensure_indexes(
        db["import_batch_errors"],
        [
            ([("batch_id", 1), ("row_number", 1)], {"name": "ix_import_batch_errors_batch_row"}),
            ([("error_code", 1)], {"name": "ix_import_batch_errors_code"}),
        ],
    )

    db["schema_migrations"].update_one(
        {"name": "normalized_schema_v1"},
        {
            "$set": {
                "name": "normalized_schema_v1",
                "applied_at": datetime.now(timezone.utc),
                "status": "applied",
            }
        },
        upsert=True,
    )

    print("Normalized schema migration completed.")


if __name__ == "__main__":
    run()
