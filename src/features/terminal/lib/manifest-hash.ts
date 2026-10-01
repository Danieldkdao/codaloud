import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { yieldToEvents } from "@/lib/yield-to-events";
import type { WorkspaceManifest } from "./sync-plan";

// The sandbox uses the same sorted UTF-8 path/hash pairs, including empty files.
export const hashWorkspaceManifest = async (manifest: WorkspaceManifest) => {
  const paths = Object.keys(manifest).sort();
  if (paths.length > 100000) throw new Error("Too many workspace files.");
  const chunks: string[] = [];
  let yieldedAt = Date.now(),
    size = 0;
  for (let index = 0; index < paths.length; index += 128) {
    const chunk = paths
      .slice(index, index + 128)
      .map((path) => `${path}\0${manifest[path]}\0`)
      .join("");
    size += chunk.length;
    if (size > 16 * 1024 * 1024)
      throw new Error("Workspace manifest exceeds the size limit.");
    chunks.push(chunk);
    if (Date.now() - yieldedAt >= 8) {
      await yieldToEvents();
      yieldedAt = Date.now();
    }
  }
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, chunks.join(""));
};
