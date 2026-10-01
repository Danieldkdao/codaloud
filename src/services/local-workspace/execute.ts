import { z } from "zod";
import type { WorkspaceCommand } from "./types";
import LocalWorkspace from "../../../modules/local-workspace";
import { notifyWorkspaceChanged } from "./change-events";

export class LocalWorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const responseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.unknown(),
    revision: z.string().optional(),
  }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);

const revisions = new Map<string, { expected: string; result?: string }>();

// All requests during this short action carry the precondition. A concurrent
// manual mutation can win, but then the delayed agent action fails atomically.
export const withWorkspaceRevision = async <T>(
  projectId: string,
  revision: string,
  action: () => Promise<T>,
): Promise<{ result: T; revision: string }> => {
  const id = z.uuid().parse(projectId).toLowerCase();
  if (revisions.has(id))
    throw new Error("A workspace action is already running.");
  const guard = {
    expected: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(revision),
    result: undefined as string | undefined,
  };
  revisions.set(id, guard);
  try {
    const result = await action();
    if (!guard.result)
      throw new Error("Update the native app before running agent mutations.");
    return { result, revision: guard.result };
  } finally {
    revisions.delete(id);
  }
};

export const executeWorkspace = async (
  projectId: string,
  ...[operation, args]: WorkspaceCommand
): Promise<unknown> => {
  const id = z.uuid().parse(projectId).toLowerCase();
  const result = await executeNativeRequest(
    JSON.stringify({
      projectId: id,
      operation,
      args: args ?? {},
      ...(revisions.has(id)
        ? { expectedRevision: revisions.get(id)!.expected }
        : {}),
    }),
    (revision) => {
      const guard = revisions.get(id);
      if (guard) guard.result = revision;
    },
  );
  if (
    operation === "save-file" ||
    operation === "create-file" ||
    operation === "rename-file" ||
    operation === "delete-file" ||
    operation === "git/checkout" ||
    operation === "git/discard" ||
    operation === "git/undo" ||
    operation === "git/revert" ||
    operation === "git/stash-apply" ||
    operation === "git/stash-save" ||
    operation === "git/pull"
  ) {
    let paths: string[] | undefined;
    if (operation === "save-file") paths = [args.path];
    else if (operation === "create-file" || operation === "delete-file")
      paths = [args.parentPath ? `${args.parentPath}/${args.name}` : args.name];
    else if (operation === "rename-file") {
      const prefix = args.parentPath ? `${args.parentPath}/` : "";
      paths = [prefix + args.previousName, prefix + args.name];
    }
    notifyWorkspaceChanged(id, paths);
  }
  return result;
};

const executeNativeRequest = async (
  request: string,
  onRevision?: (revision: string | undefined) => void,
): Promise<unknown> => {
  const response = responseSchema.parse(
    JSON.parse(await LocalWorkspace.execute(request)),
  );
  if (!response.ok)
    throw new LocalWorkspaceError(response.code, response.message);
  onRevision?.(response.revision);
  return response.data;
};

// Discovery is workspace-wide and must work even after the last project row is gone.
export const listArchivedWorkspaceIds = async (): Promise<string[]> =>
  z
    .array(z.uuid())
    .parse(
      await executeNativeRequest(
        JSON.stringify({ operation: "list-archived-projects" }),
      ),
    );
