import { z } from "zod";

import {
  projectDirectoryPathSchema,
  projectFilePathSchema,
} from "@/features/projects/actions/file-schemas";
import { MAX_DRAFT_CONTENT_BYTES } from "../constants";
import { draftFilenameSchema } from "../lib/draft-filename";
import { draftCursorTokenSchema } from "../lib/draft-params";
import type {
  DraftCopiedFileData,
  DraftPageData,
  DraftResponseData,
} from "../types";

// Draft content is UTF-8 text, so validate its byte length rather than its
// JavaScript length to match the editor and project-file limits.
export const draftContentSchema = z
  .string()
  .max(MAX_DRAFT_CONTENT_BYTES)
  .refine(
    (content) =>
      new TextEncoder().encode(content).length <= MAX_DRAFT_CONTENT_BYTES,
    "Draft is too large.",
  );
export type DraftContentSchema = z.infer<typeof draftContentSchema>;

export const draftFilenameInputSchema = draftFilenameSchema.nullish();
export type DraftFilenameInputSchema = z.infer<typeof draftFilenameInputSchema>;

// Validate the JSON representation, including timestamps serialized by the driver.
export const draftResponseSchema = z.object({
  id: z.string().min(1),
  filename: draftFilenameSchema.nullable(),
  content: draftContentSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}) satisfies z.ZodType<DraftResponseData>;
export type DraftResponseSchema = z.infer<typeof draftResponseSchema>;

export const createDraftSchema = z
  .strictObject({
    filename: draftFilenameInputSchema,
    content: draftContentSchema.default(""),
  })
  .refine(
    ({ content, filename }) => content.length > 0 || Boolean(filename),
    "A draft needs content or a filename before it can be saved.",
  );
export type CreateDraftSchema = z.infer<typeof createDraftSchema>;

export const updateDraftSchema = z
  .strictObject({
    filename: draftFilenameInputSchema,
    content: draftContentSchema.optional(),
  })
  .refine(
    (data) => data.filename !== undefined || data.content !== undefined,
    "Provide a filename or content to update.",
  )
  .refine(
    ({ content, filename }) =>
      content === undefined ||
      filename === undefined ||
      content.length > 0 ||
      Boolean(filename),
    "An unnamed draft cannot be saved without content.",
  );
export type UpdateDraftSchema = z.infer<typeof updateDraftSchema>;

export const draftPageSchema = z
  .object({
    drafts: z.array(draftResponseSchema),
    nextCursor: draftCursorTokenSchema.nullable(),
  })
  .refine(
    (page) => page.nextCursor === null || page.drafts.length > 0,
    "An empty draft page cannot have a continuation cursor.",
  ) satisfies z.ZodType<DraftPageData>;
export type DraftPageSchema = z.infer<typeof draftPageSchema>;

export const draftActionResponseSchema = z.discriminatedUnion("error", [
  z.object({
    error: z.literal(true),
    message: z.string().trim().min(1),
    code: z.string().optional(),
  }),
  z.object({
    error: z.literal(false),
    message: z.string().trim().min(1),
    data: draftResponseSchema,
  }),
]);
export type DraftActionResponseSchema = z.infer<
  typeof draftActionResponseSchema
>;

export const draftCopyModes = ["create", "replace"] as const;
export type DraftCopyMode = (typeof draftCopyModes)[number];

/**
 * Copying a draft into a project always lands a real project file, so the
 * folder, name, and resulting path use the project's own validation rules.
 */
export const copyDraftToProjectSchema = z.strictObject({
  draftId: z.uuid(),
  projectId: z.uuid(),
  directoryPath: projectDirectoryPathSchema,
  filename: draftFilenameSchema,
  mode: z.enum(draftCopyModes).default("create"),
});
export type CopyDraftToProjectSchema = z.infer<typeof copyDraftToProjectSchema>;
/** Callers may omit `mode`; the schema supplies the non-destructive default. */
export type CopyDraftToProjectInput = z.input<typeof copyDraftToProjectSchema>;

export const copiedDraftFileSchema = z.object({
  projectId: z.uuid(),
  directoryPath: projectDirectoryPathSchema,
  filename: draftFilenameSchema,
  path: projectFilePathSchema,
  size: z.number().int().nonnegative(),
  replaced: z.boolean(),
}) satisfies z.ZodType<DraftCopiedFileData>;
export type CopiedDraftFileSchema = z.infer<typeof copiedDraftFileSchema>;
