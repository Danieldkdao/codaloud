import { z } from "zod";

import {
  GITHUB_CURSOR_MAX_LENGTH,
  GITHUB_SEARCH_BATCH_SIZE,
} from "../constants";

const repositoryCursorSchema = z.strictObject({
  version: z.literal(1),
  page: z.number().int().min(1),
  offset: z
    .number()
    .int()
    .min(0)
    .max(GITHUB_SEARCH_BATCH_SIZE - 1),
  search: z.string().max(200),
  pageSize: z.number().int().min(1).max(GITHUB_SEARCH_BATCH_SIZE),
  // Branch cursors belong to one repository; unscoped repository-list cursors stay compatible.
  scope: z.string().max(200).optional(),
});
export type RepositoryCursorSchema = z.infer<typeof repositoryCursorSchema>;

export class GitHubRepositoryCursorError extends Error {
  readonly status = 400;

  constructor() {
    super("Invalid repository cursor. Start a new repository search.");
    this.name = "GitHubRepositoryCursorError";
  }
}

export const readRepositoryCursor = (
  cursor: string | null | undefined,
  search: string,
  pageSize: number,
  scope?: string,
): RepositoryCursorSchema => {
  if (cursor == null)
    return { version: 1, page: 1, offset: 0, search, pageSize, scope };
  try {
    if (
      cursor.length > GITHUB_CURSOR_MAX_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(cursor)
    ) {
      throw new GitHubRepositoryCursorError();
    }
    const position = repositoryCursorSchema.parse(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(
            atob(cursor.replace(/-/g, "+").replace(/_/g, "/")),
            (character) => character.charCodeAt(0),
          ),
        ),
      ),
    );
    if (
      position.search !== search ||
      position.pageSize !== pageSize ||
      position.scope !== scope ||
      (!search && position.offset >= pageSize)
    ) {
      throw new GitHubRepositoryCursorError();
    }
    return position;
  } catch {
    throw new GitHubRepositoryCursorError();
  }
};

// This is a validated position, not an authorization token. Every request still
// resolves current GitHub credentials; no repository data or credentials live here.
export const writeRepositoryCursor = (position: RepositoryCursorSchema) =>
  btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(position))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
