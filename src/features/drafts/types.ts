import type { DraftSelectData } from "@/db/local/schemas/draft";
import type { CodeFileType } from "@/features/code-intelligence/file-type";
import type {
  DraftCopyAction,
  DraftInsertMode,
  DraftTextScope,
} from "./constants";

export type { DraftCopyAction, DraftInsertMode, DraftTextScope };

// Action responses expose database timestamps as ISO strings.
export type DraftResponseData = Omit<
  DraftSelectData,
  "searchTitle" | "searchContent"
>;

export type DraftPageData = {
  drafts: DraftResponseData[];
  nextCursor: string | null;
};

export type DraftLanguageData = {
  fileType: CodeFileType;
  /** Filename handed to the editor; empty keeps CodeMirror in plain-text mode. */
  editorFilename: string;
  highlighted: boolean;
  diagnostics: boolean;
  /** Requires the TypeScript/JavaScript service rather than a content-only analyzer. */
  intelligence: boolean;
  formatting: boolean;
};

export type DraftCopyTargetData = {
  projectId: string;
  /** Project-relative folder, or "" for the project root. */
  directoryPath: string;
  filename: string;
};

export type DraftCopiedFileData = DraftCopyTargetData & {
  path: string;
  size: number;
  /** True when an existing project file was overwritten after confirmation. */
  replaced: boolean;
};

export type DraftInsertSourceData = {
  draftId: string;
  scope: DraftTextScope;
  /** Text handed to the editor, already resolved from the draft contents. */
  text: string;
  mode: DraftInsertMode;
};

export type DraftActionResult =
  | { error: true; message: string; code?: string }
  | { error: false; message: string };

export type DraftMutationResult =
  | { error: true; message: string; code?: string }
  | { error: false; message: string; data: DraftResponseData };

export type DraftCopyResult =
  | { error: true; message: string; code?: string }
  | { error: false; message: string; data: DraftCopiedFileData };
