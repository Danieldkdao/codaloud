import { z } from "zod";
import { executeWorkspace } from "@/services/local-workspace/execute";
import { projectFileEntrySchema } from "../actions/file-schemas";
import { projectFileSearchLimits } from "../constants";

// Only directory metadata crosses the native bridge. Keystrokes filter the
// resulting paths in memory, without reading file contents or project records.
export const readLocalFilePaths = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<string[]> => {
  const directories = [""];
  const paths: string[] = [];
  const startedAt = Date.now();
  let entries = 0;
  while (directories.length) {
    if (signal?.aborted) throw new Error("Path search cancelled.");
    if (Date.now() - startedAt > projectFileSearchLimits.scanTimeoutMs)
      throw new Error(
        "Listing project paths took too long. Try again or browse the Files tab.",
      );
    const children = z
      .array(projectFileEntrySchema)
      .parse(
        await executeWorkspace(projectId, "list-files", {
          path: directories.pop()!,
        }),
      );
    if (signal?.aborted) throw new Error("Path search cancelled.");
    for (const child of children) {
      if (++entries > projectFileSearchLimits.maxEntries)
        throw new Error(
          "This project has too many entries to search here. Browse the Files tab instead.",
        );
      if (child.isDir) directories.push(child.path);
      else paths.push(child.path);
    }
  }
  return paths.sort();
};
