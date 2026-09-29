export const UNTITLED_DRAFT_TITLE = "Untitled Draft";

/** Route param that opens a blank draft, which is stored only once it earns a row. */
export const NEW_DRAFT_PARAM = "new";

/** Keeps one draft inside a single editor document and one SQLite row. */
export const MAX_DRAFT_CONTENT_BYTES = 256 * 1024;

/** Matches the project editor's own autosave interval. */
export const draftSaveDebounceMs = 3_000;

export const draftCopyActions = ["rename", "replace", "cancel"] as const;
export type DraftCopyAction = (typeof draftCopyActions)[number];

export const draftTextScopes = ["whole", "selected"] as const;
export type DraftTextScope = (typeof draftTextScopes)[number];

export const draftInsertModes = [
  "cursor",
  "replace-selection",
  "after-selection",
] as const;
export type DraftInsertMode = (typeof draftInsertModes)[number];
