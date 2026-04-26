# Migration Runbook (Normalized Schema)

This runbook documents a safe migration path from legacy collections to normalized collections.

## Preconditions
- Ensure MongoDB backup is available.
- Confirm backend can reconnect after maintenance.
- Run all commands from `backend/`.

## Step 1: Create normalized schema and indexes
```bash
python -m scripts.migrate_normalized_schema
```
Expected result:
- Collections are created if missing.
- Base indexes are created.
- `schema_migrations.normalized_schema_v1` marked as applied.

## Step 2: Dry-run import validation
```bash
python -m scripts.import_csv_batch --csv datasets/template.csv --imported-by admin@local --semester S1 --year 2026 --dry-run
```
Expected result:
- Batch created with status `completed` or `partial`.
- No writes to normalized master data when `--dry-run` is enabled.

## Step 3: Execute batch import
```bash
python -m scripts.import_csv_batch --csv <path_to_csv> --imported-by admin@local --semester S1 --year 2026
```
Optional:
```bash
python -m scripts.import_csv_batch --csv <path_to_csv> --subject-id basic_cpp --imported-by admin@local
```

Validation queries:
- `import_batches` has latest batch with row stats.
- `import_batch_errors` contains failed rows with diagnostics.
- `students`, `classes`, `enrollments`, `weekly_logs` are populated.

## Step 4: Backfill legacy predictions/interventions with enrollment references
```bash
python -m scripts.backfill_enrollment_refs
```
Expected result:
- Existing `predictions` get `enrollment_id` where resolvable.
- Existing `interventions` get `enrollment_id` and normalized `created_at`.

## Step 5: Ensure production indexes (legacy + normalized)
```bash
python -m scripts.bootstrap_production_indexes
```
Expected result:
- Legacy query paths and new schema both have required indexes.

## Cutover checklist
1. Verify API smoke tests:
- `/v1/students`
- `/v1/dashboard/summary`
- `/v1/early-warning`
- `/v1/integrity`
- `/v1/interventions`
2. Verify index usage with explain on highest-traffic queries.
3. Verify no unresolved critical rows in `import_batch_errors`.
4. Rotate database credentials if old secrets were exposed.
5. Keep rollback plan: restore from backup and disable new import path.

## Notes
- Scripts are idempotent where possible.
- Unique index creation may fail if duplicates exist; clean duplicates first.
