from __future__ import annotations

from scripts.db_tools import get_db, ensure_indexes


def run() -> None:
    db = get_db()

    # Legacy collections currently used by API.
    ensure_indexes(
        db["users"],
        [
            ([("email", 1)], {"name": "ux_users_email", "unique": True}),
        ],
    )

    ensure_indexes(
        db["student_logs"],
        [
            ([("student_id", 1)], {"name": "ix_student_logs_student_id"}),
            ([("course_name", 1), ("class_name", 1), ("full_name", 1)], {"name": "ix_student_logs_course_class_name"}),
            ([("subject_id", 1), ("course_name", 1), ("class_name", 1)], {"name": "ix_student_logs_subject_course_class"}),
        ],
    )

    ensure_indexes(
        db["predictions"],
        [
            ([("student_id", 1), ("course_name", 1), ("week", -1), ("updated_at", -1)], {"name": "ix_predictions_latest"}),
            ([("risk_label", 1), ("course_name", 1), ("class_name", 1)], {"name": "ix_predictions_risk_scope"}),
            ([("enrollment_id", 1), ("week", -1)], {"name": "ix_predictions_enrollment_week"}),
        ],
    )

    ensure_indexes(
        db["interventions"],
        [
            ([("created_by", 1), ("date", -1)], {"name": "ix_interventions_user_date"}),
            ([("student_id", 1), ("date", -1)], {"name": "ix_interventions_student_date"}),
            ([("enrollment_id", 1), ("created_at", -1)], {"name": "ix_interventions_enrollment_created"}),
        ],
    )

    # Normalized collections introduced for migration.
    ensure_indexes(
        db["students"],
        [
            ([("student_code", 1)], {"name": "ux_students_student_code", "unique": True}),
            ([("email", 1)], {"name": "ix_students_email"}),
        ],
    )

    ensure_indexes(
        db["subjects"],
        [
            ([("subject_id", 1)], {"name": "ux_subjects_subject_id", "unique": True}),
        ],
    )

    ensure_indexes(
        db["classes"],
        [
            ([("class_id", 1)], {"name": "ux_classes_class_id", "unique": True}),
            ([("subject_id", 1), ("semester", 1), ("year", 1)], {"name": "ix_classes_subject_term"}),
        ],
    )

    ensure_indexes(
        db["enrollments"],
        [
            ([("student_id", 1), ("class_id", 1)], {"name": "ux_enrollments_student_class", "unique": True}),
            ([("student_id", 1)], {"name": "ix_enrollments_student_id"}),
            ([("class_id", 1)], {"name": "ix_enrollments_class_id"}),
        ],
    )

    ensure_indexes(
        db["weekly_logs"],
        [
            ([("enrollment_id", 1), ("week", 1)], {"name": "ux_weekly_logs_enrollment_week", "unique": True}),
            ([("week", 1)], {"name": "ix_weekly_logs_week"}),
        ],
    )

    ensure_indexes(
        db["import_batches"],
        [
            ([("batch_id", 1)], {"name": "ux_import_batches_batch_id", "unique": True}),
            ([("status", 1), ("started_at", -1)], {"name": "ix_import_batches_status_started"}),
        ],
    )

    ensure_indexes(
        db["import_batch_errors"],
        [
            ([("batch_id", 1), ("row_number", 1)], {"name": "ix_import_batch_errors_batch_row"}),
        ],
    )

    print("Production indexes ensured.")


if __name__ == "__main__":
    run()
