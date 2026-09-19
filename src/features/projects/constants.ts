export const MAX_PROJECT_FILE_SIZE_BYTES = 1024 * 1024;
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
