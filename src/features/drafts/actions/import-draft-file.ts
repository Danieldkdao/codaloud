import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";

import { MAX_IMPORT_FILE_BYTES } from "@/features/projects/constants";
import { isProjectImagePath } from "@/features/projects/lib/image-files";
import { MAX_DRAFT_CONTENT_BYTES } from "../constants";
import { draftFilenameSchema } from "../lib/draft-filename";
import { draftAssetFile, removeDraftAsset } from "../lib/draft-assets";
import { createDraftAction } from "./draft-actions";
import type { DraftMutationResult } from "../types";

const binaryFileExtensions = /\.(?:pdf|zip|gz|tar|7z|rar|wasm|exe|dll|so|dylib|mp3|mp4|mov|wav|ogg|woff2?|ttf|otf)$/i;

const failure = (error: unknown): DraftMutationResult & { error: true } => ({
  error: true,
  message:
    error instanceof Error ? error.message : "Unable to import this file as a draft.",
});

/** A draft remains one file: text is editable, while binary files are durable assets. */
export const importDraftFileAction = async (): Promise<DraftMutationResult | null> => {
  try {
    const picked = await File.pickFileAsync({ multipleFiles: false });
    if (picked.canceled) return null;
    const selected = picked.result;
    const filename = draftFilenameSchema.parse(selected.name);
    const source = new File(selected.uri);
    if (!source.exists)
      throw new Error("The chosen file is no longer available on this device.");
    const size = source.size;
    if (size === null || !Number.isFinite(size))
      throw new Error("The chosen file size is unavailable.");
    if (size > MAX_IMPORT_FILE_BYTES)
      throw new Error("This file is too large to import as a draft.");

    const isBinary =
      isProjectImagePath(filename) ||
      binaryFileExtensions.test(filename) ||
      size > MAX_DRAFT_CONTENT_BYTES;
    if (!isBinary) {
      try {
        const content = await source.text();
        if (!content.includes("\0") && !content.includes("\uFFFD"))
          return createDraftAction({ filename, content });
      } catch {
        // A provider may reject text decoding for a binary payload; preserve
        // the original bytes as a draft asset below.
      }
    }

    const id = randomUUID();
    const asset = draftAssetFile(id);
    try {
      await asset.parentDirectory.create({ intermediates: true, idempotent: true });
      await source.copy(asset);
      const createdDraft = await createDraftAction({ filename, content: "" }, id);
      if (createdDraft.error) removeDraftAsset(id);
      return createdDraft;
    } catch (error) {
      removeDraftAsset(id);
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
};
