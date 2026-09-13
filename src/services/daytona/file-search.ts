import { createHash } from "node:crypto";
import { z } from "zod";
import {
  projectFileSearchPageSchema,
  projectFileSearchQuerySchema,
} from "@/features/projects/actions/file-search-schemas";
import {
  projectFileSearchExcludedDirectories,
  projectFileSearchLimits,
} from "@/features/projects/constants";
import { createSandboxCommand } from "./create-command";
import { sandboxFileSearchCommand } from "./file-search-command";
import { getSandboxToolboxUrl, requestDaytona, SandboxFilesError } from "./api";

export const searchSandboxFiles = async (
  context: { sandboxId: string; projectId: string; allowInitialize: boolean },
  userId: string,
  unsafeInput: unknown,
  signal?: AbortSignal,
) => {
  const parsed = projectFileSearchQuerySchema.safeParse(unsafeInput);
  if (!parsed.success)
    throw new SandboxFilesError(
      400,
      "INVALID_FILE_SEARCH",
      "Invalid file search or pagination parameters.",
    );
  const query = parsed.data;
  // Session filenames bind the cursor to its owner, workspace, query and page size.
  const scopeKey = createHash("sha256")
    .update(
      JSON.stringify([
        "file-search:v1",
        userId,
        context.projectId,
        context.sandboxId,
        query.search,
        query.scope,
        query.path,
        query.pageSize,
      ]),
    )
    .digest("hex");
  try {
    signal?.throwIfAborted();
    const toolbox = await getSandboxToolboxUrl(
      context.sandboxId,
      context.projectId,
    );
    const requestSignal = AbortSignal.any([
      AbortSignal.timeout(20_000),
      ...(signal ? [signal] : []),
    ]);
    const { dir: home } = z
      .object({ dir: z.string().startsWith("/").min(2) })
      .parse(
        await requestDaytona(`${toolbox}/user-home-dir`, {
          signal: requestSignal,
          cache: "no-store",
        }),
      );
    const response = z
      .object({ exitCode: z.number(), result: z.string().max(1024 * 1024) })
      .parse(
        await requestDaytona(`${toolbox}/process/execute`, {
          method: "POST",
          cache: "no-store",
          signal: requestSignal,
          body: JSON.stringify(
            createSandboxCommand(
              sandboxFileSearchCommand,
              {
                ...query,
                home,
                scopeKey,
                allowInitialize: context.allowInitialize && !query.cursor,
                limits: projectFileSearchLimits,
                excludedDirectories: projectFileSearchExcludedDirectories,
              },
              12,
            ),
          ),
        }),
      );
    const result: unknown = JSON.parse(response.result);
    if (response.exitCode !== 0) {
      const { code } = z.object({ code: z.string() }).parse(result);
      switch (code) {
        case "SEARCH_SESSION_EXPIRED":
          throw new SandboxFilesError(
            410,
            code,
            "These search results expired. Start a new search.",
          );
        case "INVALID_SEARCH_CURSOR":
          throw new SandboxFilesError(
            400,
            code,
            "Invalid search cursor. Start a new search.",
          );
        case "SEARCH_WORKSPACE_CHANGED":
          throw new SandboxFilesError(
            409,
            code,
            "Workspace files changed. Refresh the search.",
          );
        case "SEARCH_LIMIT_EXCEEDED":
          throw new SandboxFilesError(
            413,
            code,
            "This search is too large. Use a more specific search or folder.",
          );
        case "SEARCH_BUSY":
          throw new SandboxFilesError(
            503,
            code,
            "File search is busy. Please try again.",
          );
        case "WORKSPACE_NOT_READY":
          throw new SandboxFilesError(
            409,
            code,
            "Your workspace is not ready yet.",
          );
        case "INVALID_PATH":
          throw new SandboxFilesError(400, code, "Invalid search folder.");
        default:
          throw new SandboxFilesError(
            502,
            "SEARCH_UNAVAILABLE",
            "Unable to search workspace files. Please try again.",
          );
      }
    }
    const page = projectFileSearchPageSchema.parse(result);
    if (
      page.files.length > query.pageSize ||
      page.totalCount < page.files.length ||
      page.files.some(
        ({ path }) => query.path && !path.startsWith(`${query.path}/`),
      )
    )
      throw new Error("Invalid search response");
    return page;
  } catch (error) {
    if (error instanceof SandboxFilesError) throw error;
    throw new SandboxFilesError(
      502,
      "SEARCH_UNAVAILABLE",
      "Unable to search workspace files. Please try again.",
    );
  }
};
