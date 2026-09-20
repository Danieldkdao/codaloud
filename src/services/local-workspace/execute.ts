import { z } from "zod";
import type { WorkspaceCommand } from "./types";
import LocalWorkspace from "../../../modules/local-workspace";

export class LocalWorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const responseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);

export const executeWorkspace = async (
  projectId: string,
  ...[operation, args]: WorkspaceCommand
): Promise<unknown> => {
  const id = z.uuid().parse(projectId).toLowerCase();
  return executeNativeRequest(
    JSON.stringify({ projectId: id, operation, args: args ?? {} }),
  );
};

const executeNativeRequest = async (request: string): Promise<unknown> => {
  const response = responseSchema.parse(
    JSON.parse(await LocalWorkspace.execute(request)),
  );
  if (!response.ok)
    throw new LocalWorkspaceError(response.code, response.message);
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
