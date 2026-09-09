-- One-time repair for sandboxes completed before readiness was persisted.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/repair-project-readiness.sql
-- Safe to rerun: only eligible projects still marked running are updated.
BEGIN;

-- Keep setup and deletion writes from racing the eligibility check.
LOCK TABLE projects, project_operations IN SHARE ROW EXCLUSIVE MODE;

UPDATE projects AS project
SET setup_status = 'ready',
    setup_error = NULL,
    updated_at = now()
FROM project_operations AS operation
WHERE project.setup_status = 'running'
  AND project.sandbox_id IS NOT NULL
  AND operation.project_id = project.id
  AND operation.user_id = project.user_id
  AND operation.kind = 'prepare'
  AND operation.status = 'succeeded'
  AND operation.phase = 'complete'
  AND operation.finished_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM project_operations AS newer_operation
    WHERE newer_operation.project_id = project.id
      AND newer_operation.user_id = project.user_id
      AND (newer_operation.created_at, newer_operation.id)
        > (operation.created_at, operation.id)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM project_operations AS deletion
    WHERE deletion.project_id = project.id
      AND deletion.user_id = project.user_id
      AND deletion.kind = 'delete'
  )
RETURNING project.id, project.setup_status;

COMMIT;
