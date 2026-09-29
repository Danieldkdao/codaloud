import { randomUUID } from "expo-crypto";
import { z } from "zod";

import { parseDraftFilename } from "../lib/draft-filename";
import { draftParamsSchema, type DraftParamsSchema } from "../lib/draft-params";
import { getLocalDrafts } from "../local/access";
import type {
  DraftActionResult,
  DraftMutationResult,
  DraftPageData,
  DraftResponseData,
} from "../types";
import {
  createDraftSchema,
  draftResponseSchema,
  updateDraftSchema,
  type CreateDraftSchema,
  type UpdateDraftSchema,
} from "./draft-schemas";

const failure = (error: unknown) => ({
  error: true as const,
  message:
    error instanceof Error ? error.message : "Unable to update this draft.",
});

const notFound = (): DraftActionResult & { error: true } => ({
  error: true,
  message: "This draft is not on this device.",
  code: "DRAFT_NOT_FOUND",
});

export const readDraftAction = async (
  draftId: string,
  signal?: AbortSignal,
): Promise<DraftResponseData | null> => {
  try {
    const id = z.uuid().parse(draftId).toLowerCase();
    const store = await getLocalDrafts();
    return signal?.aborted ? null : store.read(id);
  } catch {
    return null;
  }
};

export const readDraftsAction = async (
  params: Partial<DraftParamsSchema> = {},
  signal?: AbortSignal,
): Promise<DraftPageData | null> => {
  try {
    const input = draftParamsSchema.parse(params);
    const store = await getLocalDrafts();
    return signal?.aborted ? null : store.list(input);
  } catch {
    return null;
  }
};

export const createDraftAction = async (
  unsafeData: CreateDraftSchema,
  requestedId?: string,
): Promise<DraftMutationResult> => {
  try {
    const filename = parseDraftFilename(unsafeData.filename);
    const input = createDraftSchema.parse({ ...unsafeData, filename });
    const store = await getLocalDrafts();
    const now = new Date().toISOString();
    const insertedDraft = draftResponseSchema.parse(
      store.insert({
        id: requestedId ? z.uuid().parse(requestedId) : randomUUID(),
        filename,
        content: input.content,
        createdAt: now,
        updatedAt: now,
      }),
    );
    return {
      error: false as const,
      message: "Draft saved on this device.",
      data: insertedDraft,
    };
  } catch (error) {
    return failure(error);
  }
};

export const updateDraftAction = async (
  draftId: string,
  unsafeData: UpdateDraftSchema,
): Promise<DraftMutationResult> => {
  try {
    const id = z.uuid().parse(draftId).toLowerCase();
    const filename =
      unsafeData.filename === undefined
        ? undefined
        : parseDraftFilename(unsafeData.filename);
    const input = updateDraftSchema.parse({ ...unsafeData, filename });
    const store = await getLocalDrafts();
    const updatedDraft = store.update(id, input);
    if (!updatedDraft) return notFound();
    return {
      error: false as const,
      message: "Draft saved on this device.",
      data: draftResponseSchema.parse(updatedDraft),
    };
  } catch (error) {
    return failure(error);
  }
};

export const deleteDraftAction = async (
  draftId: string,
): Promise<DraftActionResult> => {
  try {
    const id = z.uuid().parse(draftId).toLowerCase();
    const store = await getLocalDrafts();
    const deletedDraft = store.remove(id);
    if (!deletedDraft) return notFound();
    if (deletedDraft.content === "") {
      // An empty text draft has no asset; cleanup is harmless in that case.
      const { removeDraftAsset } = await import("../lib/draft-assets");
      try {
        removeDraftAsset(id);
      } catch {
        /* The row is already gone; storage cleanup can retry later. */
      }
    }
    return {
      error: false as const,
      message: "Draft deleted from this device.",
    };
  } catch (error) {
    return failure(error);
  }
};
