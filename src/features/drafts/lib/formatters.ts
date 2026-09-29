import { format, isValid, parseISO } from "date-fns";

import { type SortOrder } from "@/lib/constants";
import type { CodeFileType } from "@/features/code-intelligence/file-type";
import {
  UNTITLED_DRAFT_TITLE,
  type DraftCopyAction,
  type DraftInsertMode,
  type DraftTextScope,
} from "../constants";
import type {
  DraftCopyTargetData,
  DraftResponseData,
} from "../types";
import type { DraftSortField } from "./draft-params";

/** Single source of truth for how a draft is named in the list and in the search index. */
export const formatDraftTitle = (draft: Pick<DraftResponseData, "filename">) =>
  draft.filename ?? UNTITLED_DRAFT_TITLE;

export const formatDraftSearchTitle = (
  draft: Pick<DraftResponseData, "filename">,
) => formatDraftTitle(draft).toLowerCase();

export const formatDraftUpdatedAt = (value: string) => {
  const date = parseISO(value);
  return isValid(date) ? format(date, "MMM d, yyyy") : value;
};

/** One collapsed line of the draft, used as the list subtitle. */
export const formatDraftPreview = (content: string) => {
  const line = content
    .split(/\r?\n/)
    .find((value) => value.trim().length > 0)
    ?.trim();
  if (!line) return "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};

export const formatDraftSortField = (field: DraftSortField): string => {
  switch (field) {
    case "title":
      return "Title";
    case "createdAt":
      return "Date created";
    case "updatedAt":
      return "Date updated";
    default:
      return field satisfies never;
  }
};

export const formatDraftSortOrder = (order: SortOrder): string => {
  switch (order) {
    case "asc":
      return "Ascending";
    case "desc":
      return "Descending";
    default:
      return order satisfies never;
  }
};

export const formatDraftFileType = (fileType: CodeFileType): string => {
  switch (fileType) {
    case "typescript":
      return "TypeScript";
    case "javascript":
      return "JavaScript";
    case "python":
      return "Python";
    case "java":
      return "Java";
    case "c":
      return "C";
    case "cpp":
      return "C++";
    case "csharp":
      return "C#";
    case "go":
      return "Go";
    case "php":
      return "PHP";
    case "rust":
      return "Rust";
    case "ruby":
      return "Ruby";
    case "markdown":
      return "Markdown";
    case "json":
      return "JSON";
    case "jsonc":
      return "JSONC";
    case "json5":
      return "JSON5";
    case "yaml":
      return "YAML";
    case "toml":
      return "TOML";
    case "xml":
      return "XML";
    case "ini":
      return "INI";
    case "env":
      return "Environment";
    case "dockerfile":
      return "Dockerfile";
    case "shell":
      return "Shell";
    case "unsupported":
      return "Plain text";
    default:
      return fileType satisfies never;
  }
};

export const formatDraftCopyAction = (
  action: DraftCopyAction,
): { label: string; description: string } => {
  switch (action) {
    case "rename":
      return { label: "Rename", description: "Keep both files." };
    case "replace":
      return {
        label: "Replace",
        description: "Overwrite the existing project file.",
      };
    case "cancel":
      return { label: "Cancel", description: "Leave the project unchanged." };
    default:
      throw new Error(
        `Unsupported draft copy action: ${action satisfies never}`,
      );
  }
};

export const formatDraftTextScope = (scope: DraftTextScope): string => {
  switch (scope) {
    case "whole":
      return "Entire draft";
    case "selected":
      return "Selected text";
    default:
      throw new Error(`Unsupported draft text scope: ${scope satisfies never}`);
  }
};

export const formatDraftInsertMode = (mode: DraftInsertMode): string => {
  switch (mode) {
    case "cursor":
      return "Insert at cursor";
    case "replace-selection":
      return "Replace selection";
    case "after-selection":
      return "Insert after selection";
    default:
      throw new Error(`Unsupported draft insert mode: ${mode satisfies never}`);
  }
};

export const formatDraftCopyDestination = (target: DraftCopyTargetData) =>
  target.directoryPath === ""
    ? target.filename
    : `${target.directoryPath}/${target.filename}`;

export const formatDraftSaveState = (
  state: "unsaved" | "saving" | "saved" | "error",
  message?: string,
): string => {
  switch (state) {
    case "unsaved":
      return "Not saved yet";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return message ?? "Save failed";
    default:
      throw new Error(`Unsupported draft save state: ${state satisfies never}`);
  }
};
