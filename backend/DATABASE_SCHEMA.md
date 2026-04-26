# Database Schema (MongoDB)

## Scope
This document defines the canonical data model for the LMS Analytics backend.
It includes collection structures, field types, required constraints, and indexes for production usage.

## Database
- Name: `lms_analytics`
- Collections:
  - `users`
  - `student_logs`
  - `predictions`
  - `interventions`

## 1) users

### Purpose
Store user identity, authentication data, and per-user settings.

### Document shape
```json
{
  "_id": "ObjectId",
  "full_name": "string",
  "email": "string",
  "password": "string",
  "created_at": "date",
  "geminiKey": "string",
  "emailSender": "string",
  "emailPass": "string",
  "emailHost": "string",
  "emailPort": "string",
  "selectedModel": "string"
}
```

### Required fields
- `full_name`
- `email`
- `password`
- `created_at`

### Constraints
- `email` must be unique.
- `password` must be a password hash (bcrypt).

### Indexes
- Unique index:
  - `{ email: 1 }`

---

## 2) student_logs

### Purpose
Store student profile and weekly behavioral metrics used for analytics and prediction.

### Document shape
```json
{
  "_id": "ObjectId",
  "student_id": "string",
  "full_name": "string",
  "email": "string",
  "class_name": "string",
  "course_name": "string",
  "subject_id": "string",
  "status": "string",
  "weekly_data": [
    {
      "week": "int",
      "active_days": "int",
      "login_count": "int",
      "online_count": "int",
      "video_views": "int",
      "document_reads": "int",
      "discussion": "int",
      "assignment_duration_mins": "float",
      "ontime_margin": "float",
      "days_since_last_login": "int",
      "session_duration": "float",
      "weekly_score": "float"
    }
  ],
  "created_at": "date",
  "updated_at": "date"
}
```

### Required fields
- `student_id`
- `full_name`
- `class_name`
- `course_name`
- `subject_id`
- `weekly_data`
- `created_at`
- `updated_at`

### Recommended key policy
Use the composite business key:
- `student_id + course_name + class_name + subject_id`

This prevents cross-course/class collisions for the same student.

### Indexes
- Unique index:
  - `{ student_id: 1, course_name: 1, class_name: 1, subject_id: 1 }`
- Query support indexes:
  - `{ course_name: 1, class_name: 1, full_name: 1 }`
  - `{ student_id: 1 }`
  - `{ subject_id: 1, course_name: 1, class_name: 1 }`

---

## 3) predictions

### Purpose
Store risk prediction output per student and week.

### Document shape
```json
{
  "_id": "ObjectId",
  "student_id": "string",
  "subject_id": "string",
  "course_name": "string",
  "class_name": "string",
  "week": "int",
  "risk_probability": "float",
  "risk_label": "string",
  "effort_score": "float",
  "threshold": "float",
  "model_version": "string",
  "accuracy": "float",
  "updated_at": "date"
}
```

### Required fields
- `student_id`
- `subject_id`
- `course_name`
- `class_name`
- `week`
- `risk_probability`
- `risk_label`
- `effort_score`
- `updated_at`

### Recommended key policy
For week-based prediction records:
- `student_id + course_name + class_name + subject_id + week`

For "latest-only" storage mode, upsert on:
- `student_id + course_name + class_name + subject_id`

### Indexes
- Unique index (week history mode):
  - `{ student_id: 1, course_name: 1, class_name: 1, subject_id: 1, week: 1 }`
- Latest-read optimization:
  - `{ student_id: 1, course_name: 1, week: -1, updated_at: -1 }`
- Dashboard filtering:
  - `{ risk_label: 1, course_name: 1, class_name: 1 }`

---

## 4) interventions

### Purpose
Store intervention actions made by lecturers/users.

### Document shape
```json
{
  "_id": "ObjectId",
  "student_id": "string",
  "course_name": "string",
  "date": "date",
  "intervention_type": "string",
  "note": "string",
  "created_by": "string"
}
```

### Required fields
- `student_id`
- `course_name`
- `date`
- `intervention_type`
- `created_by`

### Indexes
- `{ created_by: 1, date: -1 }`
- `{ student_id: 1, date: -1 }`
- `{ course_name: 1, date: -1 }`

---

## Date/Time Standard

Use BSON datetime (`datetime`) for all time fields.
Do not store date values as formatted strings.

Fields that should be datetime:
- `users.created_at`
- `student_logs.created_at`
- `student_logs.updated_at`
- `predictions.updated_at`
- `interventions.date`

---

## Validation Rules (Application Layer)

Minimum recommended checks:
- `student_id`, `course_name`, `class_name`, `subject_id` are non-empty strings.
- `weekly_data.week` in range `[1..52]`.
- Non-negative metrics for count/duration fields.
- `risk_probability` in range `[0, 1]`.
- `risk_label` in allowed set: `An toàn`, `Nguy cơ`.

---

## Migration Checklist

1. Backfill missing fields in existing documents:
- `predictions.course_name`, `predictions.class_name`, `predictions.subject_id`
- any string datetime fields -> BSON datetime

2. Remove duplicate records that violate business keys.

3. Create indexes in this order:
- non-unique indexes first
- unique indexes last (after duplicate cleanup)

4. Verify API queries with `explain()` on key endpoints:
- `/students`
- `/dashboard/summary`
- `/early-warning`
- `/integrity`
- `/interventions`

---

## Notes for Current Codebase

- Current routes include mixed grouping logic by `student_id` only in some aggregations.
- For multi-course or multi-subject data, group keys should include course/subject context.
- Keep prediction write strategy consistent across batch sync and manual predict endpoints.
