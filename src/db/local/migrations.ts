// This database is separate from the legacy server database. Keep migrations
// bundled with the native app so startup never needs a network request.
export const localWorkspaceMigration = `
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  search_name TEXT NOT NULL,
  sandbox_id TEXT,
  setup_status TEXT NOT NULL CHECK (setup_status IN ('pending', 'running', 'ready', 'failed')),
  setup_error TEXT,
  github_repository_id TEXT,
  last_opened_file_path TEXT,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX projects_user_id_updated_at_idx ON projects (user_id, updated_at DESC);
`;

export const localWorkspacePreferencesMigration = `
CREATE TABLE workspace (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  owner_id TEXT NOT NULL,
  has_entered INTEGER NOT NULL DEFAULT 0 CHECK (has_entered IN (0, 1))
);
`;
