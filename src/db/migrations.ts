// Keep migrations bundled with the native app so startup never needs a network request.
export const projectsMigration = `
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  search_name TEXT NOT NULL,
  setup_status TEXT NOT NULL CHECK (setup_status IN ('pending', 'running', 'ready', 'failed')),
  setup_error TEXT,
  github_repository_id TEXT,
  last_opened_file_path TEXT,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX projects_updated_at_idx ON projects (updated_at DESC);
`;

export const localWorkspacePreferencesMigration = `
CREATE TABLE workspace (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  owner_id TEXT NOT NULL,
  has_entered INTEGER NOT NULL DEFAULT 0 CHECK (has_entered IN (0, 1))
);
`;

export const localGitIdentityMigration = `
ALTER TABLE workspace ADD COLUMN git_author_name TEXT;
ALTER TABLE workspace ADD COLUMN git_author_email TEXT;
`;

// Version 4 only created the retired cloud-import audit table.
export const removeImportHistoryMigration = `
DROP TABLE IF EXISTS migration_imports;
`;

export const removeSandboxReferenceMigration = `
ALTER TABLE projects DROP COLUMN sandbox_id;
`;

export const removeLocalOwnershipMigration = `
DROP INDEX IF EXISTS projects_user_id_updated_at_idx;
ALTER TABLE projects DROP COLUMN user_id;
CREATE INDEX projects_updated_at_idx ON projects (updated_at DESC);
DROP TABLE workspace;
`;
