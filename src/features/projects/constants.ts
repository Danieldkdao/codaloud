export const MAX_PROJECT_FILE_SIZE_BYTES = 1024 * 1024;

/** Folder the native workspace engine uses under the app's documents directory. */
export const WORKSPACE_FOLDER_NAME = "codaloud-workspaces";

/** Uploads bypass the editor limit, so they carry their own larger bounds. */
export const MAX_IMPORT_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_IMPORT_TOTAL_BYTES = 256 * 1024 * 1024;
export const MAX_IMPORT_ENTRIES = 2_000;
export const MAX_IMPORT_DEPTH = 16;

/** How a destination path that already exists is handled. */
export const projectImportModes = ["fail", "replace", "skip"] as const;
export type ProjectImportMode = (typeof projectImportModes)[number];

/** Entries the workspace must never receive, whatever the user picked. */
export const importBlockedNames = [".git"] as const;
export const CODE_INTELLIGENCE_FILE_PATTERN = /\.(?:[cm]?[jt]s|[jt]sx)$/i;

export const projectFileSearchLimits = {
  pageSize: 10,
  maxPageSize: 100,
  maxEntries: 50_000,
  maxResults: 5_000,
  maxContentBytes: 64 * 1024 * 1024,
  maxMetadataBytes: 8 * 1024 * 1024,
  maxFileBytes: MAX_PROJECT_FILE_SIZE_BYTES,
  maxSessionBytes: 2 * 1024 * 1024,
  maxSessions: 20,
  sessionTtlMs: 2 * 60 * 1000,
  scanTimeoutMs: 8_000,
} as const;

export const projectFileSearchExcludedDirectories = [
  ".git",
  "node_modules",
  ".expo",
  ".next",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".venv",
] as const;

export const projectCommitDetailsLimits = {
  maxFiles: 5000,
  maxFileBytes: 1024 * 1024,
  maxPatchBytes: 256 * 1024,
  maxResponseBytes: 8 * 1024 * 1024,
  commandTimeoutMs: 8000,
} as const;
