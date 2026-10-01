export const maxSyncedFiles = 100_000;
export const maxSyncFileBytes = 32 * 1024 * 1024;
export const maxSelectedSyncFileBytes = 128 * 1024 * 1024;
export const syncTransferConcurrency = 4;
export const syncDownloadBatchFiles = 256;
export const syncDownloadConcurrency = 3;
export const maxSyncDownloadBatchBytes = 8 * 1024 * 1024;
export const maxSyncDownloadHeaderBytes = 512 * 1024;
export const terminalRequestTimeoutMs = 180_000;
export const terminalSandboxSnapshot = "daytona-medium";
export const terminalSandboxCpu = 2;
export const terminalSandboxMemoryGiB = 4;
export const terminalMutationActions = [
  "ensure",
  "manifest",
  "delete",
  "ticket",
  "download",
] as const;
export type TerminalMutationAction = (typeof terminalMutationActions)[number];
