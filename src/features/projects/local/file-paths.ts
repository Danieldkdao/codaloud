import { yieldToEvents } from "@/lib/yield-to-events";
import { z } from "zod";
import { executeWorkspace } from "@/services/local-workspace/execute";
import { projectFileEntrySchema } from "../actions/file-schemas";
import { projectFileSearchLimits } from "../constants";

// Only directory metadata crosses the native bridge. Keystrokes filter the
// resulting paths in memory, without reading file contents or project records.
export const readLocalFilePaths = async (
  projectId: string,
  signal?: AbortSignal,
  options?: {
    visitDirectory?: (path: string) => boolean;
    maxEntries?: number;
    scanTimeoutMs?: number;
  },
): Promise<string[]> => {
  const directories = [""];
  const paths: string[] = [];
  const startedAt = Date.now();
  let yieldedAt = startedAt;
  let entries = 0;
  while (directories.length) {
    if (signal?.aborted) throw new Error("Path search cancelled.");
    if (
      Date.now() - startedAt >
      (options?.scanTimeoutMs ?? projectFileSearchLimits.scanTimeoutMs)
    )
      throw new Error(
        "Listing project paths took too long. Try again or browse Files.",
      );
    const children = z.array(projectFileEntrySchema).parse(
      await executeWorkspace(projectId, "list-files", {
        path: directories.pop()!,
      }),
    );
    if (signal?.aborted) throw new Error("Path search cancelled.");
    for (const child of children) {
      if (Date.now() - yieldedAt >= 8) {
        await yieldToEvents();
        yieldedAt = Date.now();
        if (signal?.aborted) throw new Error("Path search cancelled.");
      }
      if (
        ++entries > (options?.maxEntries ?? projectFileSearchLimits.maxEntries)
      )
        throw new Error(
          "This project has too many entries to search here. Browse Files instead.",
        );
      if (child.isDir) {
        if (options?.visitDirectory?.(child.path) !== false)
          directories.push(child.path);
      } else paths.push(child.path);
    }
  }
  if (entries > 32) await yieldToEvents();
  return paths.sort();
};
