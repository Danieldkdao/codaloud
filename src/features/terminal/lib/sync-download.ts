import { z } from "zod";
import {
  maxSyncDownloadBatchBytes,
  maxSyncDownloadHeaderBytes,
  maxSelectedSyncFileBytes,
  syncDownloadBatchFiles,
} from "../constants";
import { isSafeWorkspacePath } from "./sync-plan";

export type SyncDownload =
  | { path: string; bytes: Uint8Array }
  | { path: string; error: string }
  | { path: string; individual: true; fileSize?: number };
const entrySchema = z.object({
  path: z.string().refine(isSafeWorkspacePath),
  size: z.number().int().min(0).max(maxSyncDownloadBatchBytes),
  error: z.string().max(200).optional(),
  individual: z.literal(true).optional(),
  fileSize: z.number().int().min(0).max(maxSelectedSyncFileBytes).optional(),
});
export type SyncDownloadEntrySchema = z.infer<typeof entrySchema>;

export const encodeSyncDownload = (files: readonly SyncDownload[]) => {
  if (files.length > syncDownloadBatchFiles)
    throw new Error("Too many files in a download batch.");
  const entries = files.map((file) => ({
    path: file.path,
    size: "bytes" in file ? file.bytes.byteLength : 0,
    ...("error" in file ? { error: file.error } : {}),
    ...("individual" in file
      ? {
          individual: true as const,
          ...(file.fileSize !== undefined ? { fileSize: file.fileSize } : {}),
        }
      : {}),
  }));
  const header = new TextEncoder().encode(JSON.stringify(entries));
  const size = entries.reduce((total, entry) => total + entry.size, 0);
  if (
    size > maxSyncDownloadBatchBytes ||
    header.byteLength > maxSyncDownloadHeaderBytes
  )
    throw new Error("Download batch exceeds the size limit.");
  const bytes = new Uint8Array(4 + header.byteLength + size);
  new DataView(bytes.buffer).setUint32(0, header.byteLength);
  bytes.set(header, 4);
  let offset = 4 + header.byteLength;
  for (const file of files)
    if ("bytes" in file) {
      bytes.set(file.bytes, offset);
      offset += file.bytes.byteLength;
    }
  return bytes;
};

export const decodeSyncDownload = (
  bytes: Uint8Array,
  requested: readonly string[],
): SyncDownload[] => {
  if (
    bytes.byteLength < 4 ||
    bytes.byteLength >
      4 + maxSyncDownloadHeaderBytes + maxSyncDownloadBatchBytes
  )
    throw new Error("Invalid download batch size.");
  const headerSize = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0);
  if (
    headerSize > maxSyncDownloadHeaderBytes ||
    headerSize > bytes.byteLength - 4
  )
    throw new Error("Invalid download batch header.");
  const entries = z
    .array(entrySchema)
    .max(syncDownloadBatchFiles)
    .parse(
      JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerSize))),
    );
  const paths = new Set(entries.map((entry) => entry.path));
  if (
    paths.size !== entries.length ||
    entries.length !== requested.length ||
    requested.some((path) => !paths.has(path))
  )
    throw new Error("Download batch paths do not match the request.");
  let offset = 4 + headerSize;
  const result = entries.map((entry): SyncDownload => {
    if ((entry.error || entry.individual) && entry.size !== 0)
      throw new Error("Invalid download batch entry.");
    const end = offset + entry.size;
    if (end > bytes.byteLength) throw new Error("Incomplete download batch.");
    const contents = bytes.subarray(offset, end);
    offset = end;
    if (entry.error) return { path: entry.path, error: entry.error };
    if (entry.individual)
      return {
        path: entry.path,
        individual: true,
        ...(entry.fileSize !== undefined ? { fileSize: entry.fileSize } : {}),
      };
    return { path: entry.path, bytes: contents };
  });
  if (offset !== bytes.byteLength)
    throw new Error("Unexpected download batch bytes.");
  return result;
};
