import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from "expo-crypto";
import { z } from "zod";
import {
  executeWorkspace,
  LocalWorkspaceError,
} from "@/services/local-workspace/execute";
import {
  projectFileContentSchema,
  projectFileEntrySchema,
} from "../actions/file-schemas";
import type {
  ProjectFileSearchEntrySchema,
  ProjectFileSearchPageSchema,
  ProjectFileSearchQuerySchema,
} from "../actions/file-search-schemas";
import {
  projectFileSearchExcludedDirectories,
  projectFileSearchLimits as limits,
} from "../constants";

type SearchSnapshot = {
  projectId: string;
  signature: string;
  files: ProjectFileSearchEntrySchema[];
  searchedAt: string;
  expiresAt: string;
  skippedContentFiles: number;
};
const snapshots = new Map<string, SearchSnapshot>();

export const searchLocalFiles = async (
  projectId: string,
  input: ProjectFileSearchQuerySchema,
  signal?: AbortSignal,
): Promise<ProjectFileSearchPageSchema> => {
  const signature = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify([
      projectId,
      input.path,
      input.search,
      input.scope,
      input.pageSize,
    ]),
  );
  const now = Date.now();
  for (const [id, snapshot] of snapshots)
    if (Date.parse(snapshot.expiresAt) <= now) snapshots.delete(id);
  let id: string,
    offset = 0,
    snapshot: SearchSnapshot;
  if (input.cursor) {
    const [cursorId, position, cursorSignature] = input.cursor.split(":");
    const existing = snapshots.get(cursorId);
    if (
      !existing ||
      existing.projectId !== projectId ||
      existing.signature !== signature ||
      cursorSignature !== signature
    )
      throw new LocalWorkspaceError(
        "SEARCH_EXPIRED",
        "This search expired. Search again to refresh the results.",
      );
    id = cursorId;
    offset = Number(position);
    snapshot = existing;
    if (
      !Number.isInteger(offset) ||
      offset <= 0 ||
      offset >= snapshot.files.length
    )
      throw new LocalWorkspaceError(
        "SEARCH_EXPIRED",
        "Invalid search continuation.",
      );
  } else {
    id = randomUUID();
    const files: ProjectFileSearchEntrySchema[] = [];
    const directories = [input.path];
    let entries = 0,
      contentBytes = 0,
      skippedContentFiles = 0;
    const term = input.search.toLowerCase();
    while (directories.length) {
      if (signal?.aborted) throw new Error("Search cancelled.");
      if (Date.now() - now > limits.scanTimeoutMs)
        throw new LocalWorkspaceError(
          "SEARCH_LIMIT_EXCEEDED",
          "Search a smaller folder to finish within the search limit.",
        );
      const children = z
        .array(projectFileEntrySchema)
        .parse(
          await executeWorkspace(projectId, "list-files", {
            path: directories.pop()!,
          }),
        );
      for (const child of children) {
        if (++entries > limits.maxEntries)
          throw new LocalWorkspaceError(
            "SEARCH_LIMIT_EXCEEDED",
            "Search a smaller folder.",
          );
        if (child.isDir) {
          if (
            !(
              projectFileSearchExcludedDirectories as readonly string[]
            ).includes(child.name)
          )
            directories.push(child.path);
          continue;
        }
        const titleMatches =
          input.scope !== "content" && child.name.toLowerCase().includes(term);
        let contentMatchCount = 0,
          contentSearched = false;
        if (input.scope !== "title") {
          if (
            child.size <= limits.maxFileBytes &&
            contentBytes + child.size <= limits.maxContentBytes
          ) {
            contentBytes += child.size;
            try {
              const file = projectFileContentSchema.parse(
                await executeWorkspace(projectId, "read-file", {
                  path: child.path,
                }),
              );
              const content = file.content.toLowerCase();
              for (
                let at = content.indexOf(term);
                at !== -1;
                at = content.indexOf(term, at + term.length)
              )
                contentMatchCount++;
              contentSearched = true;
            } catch {
              /* Binary, oversized, or concurrently removed files are disclosed below. */
            }
          }
          if (!contentSearched) skippedContentFiles++;
        }
        if (titleMatches || contentMatchCount)
          files.push({
            path: child.path,
            titleMatches,
            contentMatchCount,
            contentSearched,
          });
        if (files.length > limits.maxResults)
          throw new LocalWorkspaceError(
            "SEARCH_LIMIT_EXCEEDED",
            "Too many matches. Refine your search.",
          );
      }
    }
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    snapshot = {
      projectId,
      signature,
      files,
      skippedContentFiles,
      searchedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + limits.sessionTtlMs).toISOString(),
    };
    if (JSON.stringify(snapshot).length > limits.maxSessionBytes)
      throw new LocalWorkspaceError(
        "SEARCH_LIMIT_EXCEEDED",
        "Refine your search to reduce its size.",
      );
    while (snapshots.size >= limits.maxSessions)
      snapshots.delete(snapshots.keys().next().value!);
    snapshots.set(id, snapshot);
  }
  const end = offset + input.pageSize;
  return {
    files: snapshot.files.slice(offset, end),
    totalCount: snapshot.files.length,
    nextCursor:
      end < snapshot.files.length ? `${id}:${end}:${signature}` : null,
    searchedAt: snapshot.searchedAt,
    expiresAt: snapshot.expiresAt,
    skippedContentFiles: snapshot.skippedContentFiles,
  };
};
