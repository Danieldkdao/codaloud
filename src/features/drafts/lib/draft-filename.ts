import type { z } from "zod";

import {
  getCodeFileType,
  hasLocalCodeAnalyzer,
  isFormatFileType,
} from "@/features/code-intelligence/file-type";
import { CODE_INTELLIGENCE_FILE_PATTERN } from "@/features/projects/constants";
import { projectFileNameSchema } from "@/features/projects/actions/file-schemas";
import type { DraftLanguageData } from "../types";

/**
 * A draft filename is a single project-style file name: drafts copy into project
 * folders, so both surfaces must accept exactly the same names.
 */
export const draftFilenameSchema = projectFileNameSchema;
export type DraftFilenameSchema = z.infer<typeof draftFilenameSchema>;

export const parseDraftFilename = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed ? draftFilenameSchema.parse(trimmed) : null;
};

/**
 * An unnamed draft has no extension, so it is edited as plain text without
 * highlighting, diagnostics, or formatting.
 */
/**
 * Renaming after a collision keeps the extension and appends the first free
 * counter, the same convention a desktop file manager uses.
 */
export const nextAvailableDraftFilename = (
  desired: string,
  taken: readonly string[],
) => {
  const name = desired.trim();
  if (!taken.includes(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  const used = new Set(taken);
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const candidate = `${stem}-${attempt}${extension}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${extension}`;
};

export const resolveDraftLanguage = (
  filename: string | null,
): DraftLanguageData => {
  if (!filename)
    return {
      fileType: "unsupported",
      editorFilename: "",
      highlighted: false,
      diagnostics: false,
      intelligence: false,
      formatting: false,
    };

  const fileType = getCodeFileType(filename);
  const intelligence = CODE_INTELLIGENCE_FILE_PATTERN.test(filename);
  return {
    fileType,
    editorFilename: filename,
    highlighted: fileType !== "unsupported",
    diagnostics: intelligence || hasLocalCodeAnalyzer(fileType),
    intelligence,
    formatting: intelligence || isFormatFileType(fileType),
  };
};
