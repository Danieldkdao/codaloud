export const projectSandboxDispatchInitialDelaySeconds = 60;
export const projectSandboxDispatchMaxDelaySeconds = 300;
export const projectSandboxDispatchBatchSize = 10;
export const projectSandboxDispatchBudgetMs = 40_000;

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
  ".git", "node_modules", ".expo", ".next", "dist", "build", "coverage", "__pycache__", ".venv",
] as const;
